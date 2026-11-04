"""Live headlines and optional Finnhub quotes, with bounded local caching.

No language model calls are used; company matching uses a reviewed issuer list.
Finnhub references: https://finnhub.io/docs/api/market-news and /quote.
"""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import math
import time
from urllib.parse import urlsplit

import httpx

from app.models.schemas import CategoryEnum
from app.services.ticker_resolver import resolve_tickers, symbols_from_provider


class FeedUnavailable(Exception):
    """A public, credential-free explanation of provider unavailability."""


def iso_timestamp(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            if math.isfinite(value) and value > 0:
                return datetime.fromtimestamp(value, timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            pass
    return None


class LiveFeedService:
    TTL = 60
    MAX_SYMBOLS = 10

    def __init__(self, fetcher, finnhub_api_key="", transport=None, clock=time.monotonic):
        self.fetcher = fetcher
        self.api_key = finnhub_api_key
        self.transport = transport
        self.clock = clock
        self._feeds = {}
        self._locks = {category.value: asyncio.Lock() for category in CategoryEnum}
        self._quotes = {}
        # One batch at a time avoids duplicate quote requests across category refreshes.
        self._quote_lock = asyncio.Lock()
        self._quote_slots = asyncio.Semaphore(4)

    async def _get_json(self, path, params):
        """One retry on transient transport/server failures; no key-bearing errors."""
        async with httpx.AsyncClient(timeout=5.0, transport=self.transport) as client:
            for attempt in range(2):
                try:
                    response = await client.get(
                        f"https://finnhub.io/api/v1/{path}",
                        params={**params, "token": self.api_key},
                    )
                    if response.status_code >= 500 and attempt == 0:
                        continue
                    response.raise_for_status()
                    result = response.json()
                    if isinstance(result, dict) and result.get("error"):
                        raise FeedUnavailable("Finnhub rejected the request. Check API access and limits.")
                    return result
                except httpx.TransportError:
                    if attempt == 0:
                        continue
                    raise FeedUnavailable("Finnhub connection unavailable.") from None
                except (httpx.HTTPStatusError, ValueError):
                    raise FeedUnavailable("Finnhub request unavailable. Check API access and limits.") from None

    async def _market_news(self):
        data = await self._get_json("news", {"category": "general"})
        if not isinstance(data, list):
            raise FeedUnavailable("Finnhub returned an invalid news response.")
        def usable(article):
            if not isinstance(article, dict) or not isinstance(article.get("headline"), str) or not article["headline"].strip():
                return False
            try:
                url = urlsplit(article.get("url", ""))
                return url.scheme in ("http", "https") and bool(url.netloc)
            except (TypeError, ValueError, AttributeError):
                return False

        return [{
            "title": article.get("headline") or "",
            "description": article.get("summary") or "",
            "url": article.get("url") or "",
            "source": article.get("source") or "Finnhub",
            "published_at": iso_timestamp(article.get("datetime")),
            "category": "business",
            "tickers": symbols_from_provider(article.get("related")),
        } for article in data if usable(article)][:10]

    def _missing_quote(self, symbol, message):
        return {"symbol": symbol, "price": None, "currency": None,
                "asOf": None, "source": "Finnhub", "error": message}

    async def _quote(self, symbol):
        async with self._quote_slots:
            if not self.api_key:
                return self._missing_quote(symbol, "Stock prices need setup. Connect a market-data provider in backend settings.")
            try:
                data = await self._get_json("quote", {"symbol": symbol})
                price = data.get("c") if isinstance(data, dict) else None
                if (not isinstance(price, (int, float)) or isinstance(price, bool)
                        or not math.isfinite(price) or price <= 0):
                    return self._missing_quote(symbol, "No current quote available from Finnhub.")
                return {"symbol": symbol, "price": price, "currency": None,
                        "asOf": iso_timestamp(data.get("t")), "source": "Finnhub"}
            except FeedUnavailable as error:
                return self._missing_quote(symbol, str(error))

    def _quote_status(self, articles):
        if not self.api_key:
            return {"state": "setup_required", "message": "Stock prices need setup. Connect a market-data provider in backend settings."}
        quotes = [quote for article in articles for quote in article.get("quotes", [])]
        available = [quote for quote in quotes if quote.get("price") is not None]
        if quotes and not available:
            return {"state": "unavailable", "message": "The stock-price provider is not returning prices. Check provider access or try again later."}
        if available and len(available) < len(quotes):
            return {"state": "ready", "message": "Stock prices are connected. Some companies have no available quote."}
        return {"state": "ready", "message": "Stock prices are connected." if quotes else "A stock-price provider is configured. No supported stock mentions were found in these headlines."}

    async def _enrich_quotes(self, articles):
        symbols = list(dict.fromkeys(s for a in articles for s in a["tickers"]))[:self.MAX_SYMBOLS]
        async with self._quote_lock:
            now = self.clock()
            self._quotes = {s: entry for s, entry in self._quotes.items() if entry[0] > now}
            missing = [s for s in symbols if s not in self._quotes]
            quotes = await asyncio.gather(*(self._quote(symbol) for symbol in missing))
            for symbol, quote in zip(missing, quotes):
                self._quotes[symbol] = (self.clock() + self.TTL, quote)
            for article in articles:
                article["quotes"] = [
                    deepcopy(self._quotes[s][1]) if s in self._quotes else
                    self._missing_quote(s, "Quote request limit reached for this refresh.")
                    for s in article["tickers"]
                ]

    async def get_feed(self, category):
        try:
            return await asyncio.wait_for(self._get_feed(category), timeout=25)
        except asyncio.TimeoutError:
            raise FeedUnavailable("News provider timed out. Please retry after the next refresh.") from None

    async def _get_feed(self, category):
        if category not in self._locks:
            raise ValueError("Unsupported category")
        async with self._locks[category]:
            now = self.clock()
            cached = self._feeds.get(category)
            if cached and cached[0] > now:
                if isinstance(cached[1], FeedUnavailable):
                    raise FeedUnavailable(str(cached[1]))
                return deepcopy(cached[1])
            try:
                articles = None
                if category == "business" and self.api_key:
                    try:
                        articles = await self._market_news() or None
                    except FeedUnavailable:
                        # An unavailable optional financial provider doesn't block headlines.
                        articles = None
                if articles is None:
                    raw = await self.fetcher.fetch_by_category(category, max_results=10)
                    if not raw:
                        raise FeedUnavailable("News provider unavailable. Configure GNEWS_API_KEY or NEWSAPI_KEY, or FINNHUB_API_KEY for finance, and check API limits.")
                    articles = [{
                        "title": a.get("title") or "",
                        "description": a.get("description") or "",
                        "url": a.get("url") or "",
                        "source": a.get("source") or "Unknown source",
                        "published_at": a.get("published_at"),
                        "category": category,
                        "tickers": symbols_from_provider(a.get("tickers")),
                    } for a in raw if isinstance(a, dict)][:10]
                for article in articles:
                    article["tickers"] = resolve_tickers(
                        article["title"], article["description"], article.get("tickers"),
                    )
                try:
                    await asyncio.wait_for(self._enrich_quotes(articles), timeout=12)
                except asyncio.TimeoutError:
                    for article in articles:
                        article["quotes"] = [self._missing_quote(s, "Quote provider timed out.")
                                             for s in article["tickers"]]
                result = {"articles": articles, "refresh_interval_seconds": self.TTL,
                          "quote_status": self._quote_status(articles)}
                self._feeds[category] = (self.clock() + self.TTL, result)
                return deepcopy(result)
            except FeedUnavailable as error:
                self._feeds[category] = (self.clock() + self.TTL, FeedUnavailable(str(error)))
                raise
            except Exception:
                # Keep provider response/credentials out of public errors and logs.
                error = FeedUnavailable("News provider unavailable. Check API configuration and limits.")
                self._feeds[category] = (self.clock() + self.TTL, error)
                raise error from None
