"""Live headlines, optional local market analysis, and Finnhub quotes."""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import logging
import math
import time
from urllib.parse import parse_qsl, urlencode, urlsplit

import httpx

from app.models.schemas import CategoryEnum
from app.services.company_directory import CompanyDirectory
from app.services.ticker_resolver import resolve_tickers, symbols_from_provider


logger = logging.getLogger(__name__)
ALERT_EVENTS = {"earnings", "guidance", "merger_acquisition", "regulatory"}


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


def publication_time(value):
    if not isinstance(value, str):
        return None
    try:
        published = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return published.astimezone(timezone.utc) if published.tzinfo is not None else None
    except (ValueError, OverflowError):
        return None


def canonical_article_url(value):
    try:
        url = urlsplit(value)
        if url.scheme not in {"http", "https"} or not url.hostname:
            return None
        query = sorted(
            (key, item) for key, item in parse_qsl(url.query, keep_blank_values=True)
            if not key.lower().startswith("utm_")
        )
        return url._replace(netloc=url.netloc.lower(), query=urlencode(query), fragment="").geturl()
    except (TypeError, ValueError, AttributeError):
        return None


class LiveFeedService:
    TTL = 60
    MAX_SYMBOLS = 10

    def __init__(self, fetcher, finnhub_api_key="", transport=None, clock=time.monotonic, analyzer=None, event_store=None):
        self.fetcher = fetcher
        self.api_key = finnhub_api_key
        self.transport = transport
        self.clock = clock
        self._feeds = {}
        self._locks = {category.value: asyncio.Lock() for category in CategoryEnum}
        self._quotes = {}
        self._analyzer = analyzer
        self._event_store = event_store
        self._first_seen = {}
        self._analysis_task = None
        self._analysis_key = None
        self._analysis_results = {}
        self._analysis_status = "pending" if analyzer is not None else "disabled"
        self._analysis_retry_at = 0
        self._directory = CompanyDirectory()
        self._directory_refresh_at = 0
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

    async def _market_news(self, limit=10):
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
        } for article in data if usable(article)][:limit]

    async def _provider_articles(self, category, limit):
        raw = await self.fetcher.fetch_by_category(category, max_results=limit)
        return [{
            "title": a.get("title") or "",
            "description": a.get("description") or "",
            "content": a.get("content") or "",
            "url": a.get("url") or "",
            "source": a.get("source") or "Unknown source",
            "published_at": a.get("published_at"),
            "category": category,
            "tickers": symbols_from_provider(a.get("tickers")),
        } for a in (raw or []) if isinstance(a, dict)][:limit]

    async def _finance_candidates(self):
        # Keep both inputs bounded. NewsAPI remains the general provider fallback.
        requests = [self._provider_articles("business", 10)]
        if self.api_key:
            requests.append(self._market_news(10))
        batches = await asyncio.gather(*requests, return_exceptions=True)
        articles = {}
        for batch in reversed(batches):
            if not isinstance(batch, list):
                continue
            for article in batch:
                identity = canonical_article_url(article["url"])
                if identity is None:
                    continue
                existing = articles.get(identity)
                if existing is None:
                    articles[identity] = article
                elif article.get("content") and not existing.get("content"):
                    existing["content"] = article["content"]
        oldest = datetime.min.replace(tzinfo=timezone.utc)
        return sorted(
            articles.values(), key=lambda article: publication_time(article["published_at"]) or oldest,
            reverse=True,
        )

    @staticmethod
    def _analysis_identity(article):
        return sha256(repr(tuple(
            article.get(field) for field in ("url", "title", "description", "content", "published_at")
        )).encode()).hexdigest()

    async def _refresh_directory(self):
        if self._directory_refresh_at > self.clock():
            return
        self._directory_refresh_at = self.clock() + 300
        try:
            async with httpx.AsyncClient(timeout=8, transport=self.transport) as client:
                responses = await asyncio.gather(*(
                    client.get(f"https://www.nasdaqtrader.com/dynamic/SymDir/{filename}.txt")
                    for filename in ("nasdaqlisted", "otherlisted")
                ))
                for response in responses:
                    response.raise_for_status()
                directory = CompanyDirectory.from_nasdaq_files(response.text for response in responses)
        except (httpx.HTTPError, ValueError):
            return
        if directory:
            self._directory = directory
            self._directory_refresh_at = self.clock() + 86400

    def _verified_analysis(self, article, analysis):
        companies = {}
        for company in analysis["companies"]:
            symbol = self._directory.resolve(company["name"], company["evidence"])
            if symbol and (symbol not in companies or company["relationship"] == "direct"):
                companies[symbol] = {**company, "symbol": symbol}
        direct = sorted(s for s, company in companies.items() if company["relationship"] == "direct")
        symbols = direct or sorted(companies)
        kind = analysis["event_type"]
        published = publication_time(article.get("published_at"))
        date = published.date() if published else None
        # Multiple publishers often cover one issuer's catalyst on the same UTC day.
        market_wide = (kind == "macro" and not symbols) or (
            kind in {"macro", "regulatory"} and analysis.get("market_wide") is True
        )
        event_key = canonical_article_url(article["url"]) or article["url"]
        if symbols and date and not market_wide:
            event_key = f"{kind}:{','.join(symbols)}:{date}"
        return {
            **analysis,
            "companies": list(companies.values()),
            "event_id": sha256(event_key.encode()).hexdigest(),
            "alert_eligible": bool(
                date and analysis["relevance"] == "high"
                and (market_wide or (symbols and kind in ALERT_EVENTS))
            ),
        }

    async def _run_analysis(self, key, articles):
        self._analysis_status = "pending"
        try:
            analyzed, _ = await asyncio.gather(
                asyncio.wait_for(self._analyzer.analyze(articles), timeout=150),
                self._refresh_directory(),
            )
            if getattr(self._analyzer, "last_status", "ready") == "unavailable":
                raise FeedUnavailable("Market analysis unavailable.")
            results = {
                self._analysis_identity(article): self._verified_analysis(article, article["analysis"])
                for article in analyzed if "analysis" in article
            }
        except Exception as error:
            logger.warning("Local market analysis unavailable (%s).", type(error).__name__)
            self._analysis_status = "unavailable"
            self._analysis_retry_at = self.clock() + self.TTL
        else:
            self._analysis_results = results
            self._analysis_status = "ready"
            if self._event_store and results:
                observations = [(article, results[identity]) for article, identity in zip(articles, key) if identity in results]
                try:
                    await asyncio.to_thread(self._event_store.record, observations, self._analyzer.model)
                except Exception as error:
                    logger.warning("Could not record market events (%s).", type(error).__name__)
        self._analysis_key = key

    def _attach_analysis(self, articles):
        key = tuple(self._analysis_identity(article) for article in articles)
        should_retry = self._analysis_status == "unavailable" and self.clock() >= self._analysis_retry_at
        if (self._analysis_task is None or self._analysis_task.done()) and (key != self._analysis_key or should_retry):
            self._analysis_status = "pending"
            self._analysis_task = asyncio.create_task(self._run_analysis(key, deepcopy(articles)))
        for identity, article in zip(key, articles):
            self._attach_tickers(article, self._analysis_results.get(identity))
        return self._analysis_status

    def _attach_tickers(self, article, analysis):
        affected = []
        if analysis is not None:
            article["analysis"] = deepcopy(analysis)
            affected = [company["symbol"] for company in analysis["companies"]]
        mentions = self._directory.mentioned_symbols(
            article["title"], article["description"], article.get("content"),
        )
        article["tickers"] = list(dict.fromkeys([*affected, *mentions, *article["tickers"]]))

    async def analyze_article(self, url):
        if self._analyzer is None:
            return {"analysis_status": "disabled", "articles": []}
        # Only analyze articles the backend already obtained from its providers.
        cached = self._feeds.get("business")
        if not cached or not isinstance(cached[1], list):
            return {"analysis_status": "expired", "articles": []}
        article = next((deepcopy(item) for item in cached[1] if item["url"] == url), None)
        if article is None:
            return {"analysis_status": "expired", "articles": []}
        analysis = self._analysis_results.get(self._analysis_identity(article))
        if analysis is None:
            analyzed, _ = await asyncio.gather(
                self._analyzer.analyze([article], shortlist=False), self._refresh_directory(),
            )
            raw = analyzed[0].get("analysis")
            if raw is None:
                return {"analysis_status": "unavailable", "articles": []}
            analysis = self._verified_analysis(article, raw)
        self._attach_tickers(article, analysis)
        article.pop("content", None)
        await self._attach_quotes([article])
        return {"analysis_status": "ready", "articles": [article]}

    async def close(self):
        if self._analysis_task is not None and not self._analysis_task.done():
            self._analysis_task.cancel()
            await asyncio.gather(self._analysis_task, return_exceptions=True)
        if self._event_store:
            self._event_store.close()

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
        affected = (c["symbol"] for a in articles for c in a.get("analysis", {}).get("companies", ()))
        mentioned = (symbol for article in articles for symbol in article["tickers"])
        symbols = list(dict.fromkeys([*affected, *mentioned]))[:self.MAX_SYMBOLS]
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

    async def get_source_articles(self, category="business"):
        """Attributed provider text for the trading risk overlay; no LLM call."""
        return await asyncio.wait_for(self._get_feed(category), timeout=25)

    async def get_feed(self, category):
        try:
            return await asyncio.wait_for(self._deliver_feed(category), timeout=25)
        except asyncio.TimeoutError:
            raise FeedUnavailable("News provider timed out. Please retry after the next refresh.") from None

    async def _deliver_feed(self, category):
        articles = await self._get_feed(category)
        status = self._attach_analysis(articles) if self._analyzer is not None and category == "business" else "disabled"
        for article in articles:
            # Provider text can be analyzed locally without redistributing it in the API.
            article.pop("content", None)
        await self._attach_quotes(articles)
        feed = {"articles": articles, "refresh_interval_seconds": self.TTL,
                "quote_status": self._quote_status(articles), "analysis_status": status}
        message = getattr(self._analyzer, "provider_error", None)
        if status == "unavailable" and isinstance(message, str):
            feed["analysis_message"] = message
        return feed

    async def _attach_quotes(self, articles):
        try:
            await asyncio.wait_for(self._enrich_quotes(articles), timeout=12)
        except asyncio.TimeoutError:
            for article in articles:
                article["quotes"] = [self._missing_quote(s, "Quote provider timed out.") for s in article["tickers"]]

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
                if category == "business" and self._analyzer is not None:
                    articles = await self._finance_candidates()
                elif category == "business" and self.api_key:
                    try:
                        articles = await self._market_news() or None
                    except FeedUnavailable:
                        # An unavailable optional financial provider doesn't block headlines.
                        articles = None
                if articles is None:
                    articles = await self._provider_articles(category, 10)
                if not articles:
                    raise FeedUnavailable("News provider unavailable. Configure GNEWS_API_KEY or NEWSAPI_KEY, or FINNHUB_API_KEY for finance, and check API limits.")
                for article in articles:
                    article["tickers"] = resolve_tickers(
                        article["title"], article["description"], article.get("tickers"),
                    )
                if self._analyzer is not None and category == "business":
                    seen_at = datetime.now(timezone.utc).isoformat()
                    for article in articles:
                        url = canonical_article_url(article["url"]) or article["url"]
                        article["first_seen_at"] = self._first_seen.setdefault(url, seen_at)
                    if len(self._first_seen) > 2048:
                        self._first_seen = dict(list(self._first_seen.items())[-1024:])
                self._feeds[category] = (self.clock() + self.TTL, articles)
                return deepcopy(articles)
            except FeedUnavailable as error:
                self._feeds[category] = (self.clock() + self.TTL, FeedUnavailable(str(error)))
                raise
            except Exception:
                # Keep provider response/credentials out of public errors and logs.
                error = FeedUnavailable("News provider unavailable. Check API configuration and limits.")
                self._feeds[category] = (self.clock() + self.TTL, error)
                raise error from None
