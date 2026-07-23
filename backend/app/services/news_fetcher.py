"""News fetcher service — fetches from GNews (primary), NewsAPI (fallback), and RSS feeds."""

import logging
from typing import List, Dict
import httpx
import feedparser

logger = logging.getLogger(__name__)


class NewsFetcher:
    """Service to fetch news from GNews, NewsAPI, and RSS feeds.
    
    Uses GNews as the primary source with automatic fallback to NewsAPI
    if GNews fails or hits its rate limit.
    """

    def __init__(self, gnews_api_key: str, newsapi_key: str):
        self.gnews_api_key = gnews_api_key
        self.newsapi_key = newsapi_key
        self.gnews_url = "https://gnews.io/api/v4/top-headlines"
        self.newsapi_url = "https://newsapi.org/v2/top-headlines"

    async def fetch_headlines(self, max_results: int = 10) -> List[Dict]:
        """Fetch top headlines (defaults to 'general' category)."""
        return await self.fetch_by_category("general", max_results)

    async def fetch_by_category(self, category: str, max_results: int = 10) -> List[Dict]:
        """Fetch news by category. Tries GNews first, falls back to NewsAPI."""
        # Try GNews first
        try:
            articles = await self._fetch_from_gnews(category, max_results)
            if articles:
                logger.info(f"Fetched {len(articles)} articles from GNews for '{category}'")
                return articles
        except Exception as e:
            logger.warning(f"GNews API failed: {e}. Falling back to NewsAPI.")

        # Fallback to NewsAPI
        try:
            articles = await self._fetch_from_newsapi(category, max_results)
            if articles:
                logger.info(f"Fetched {len(articles)} articles from NewsAPI for '{category}'")
                return articles
        except Exception as ex:
            logger.error(f"Both news APIs failed for '{category}'. NewsAPI error: {ex}")

        return []

    async def fetch_from_rss(self, feed_url: str) -> List[Dict]:
        """Fetch and normalize articles from an RSS feed URL."""
        try:
            feed = feedparser.parse(feed_url)
            articles = []
            for entry in feed.entries:
                content_list = entry.get("content", [{"value": ""}])
                content = content_list[0].get("value", "") if content_list else ""

                articles.append({
                    "title": entry.get("title", ""),
                    "description": entry.get("summary", ""),
                    "content": content,
                    "url": entry.get("link", ""),
                    "source": feed.feed.get("title", "RSS Feed"),
                    "image_url": None,
                    "published_at": entry.get("published", ""),
                    "category": "rss",
                })
            logger.info(f"Fetched {len(articles)} articles from RSS: {feed_url}")
            return articles
        except Exception as e:
            logger.error(f"Failed to fetch from RSS {feed_url}: {e}")
            return []

    # --- Private helpers ---

    async def _fetch_from_gnews(self, category: str, max_results: int) -> List[Dict]:
        """Fetch from GNews API and normalize the response."""
        params = {
            "category": category,
            "apikey": self.gnews_api_key,
            "max": max_results,
            "lang": "en",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.gnews_url, params=params)
            response.raise_for_status()
            data = response.json()
            return [
                self._normalize_gnews_article(art, category)
                for art in data.get("articles", [])
            ]

    async def _fetch_from_newsapi(self, category: str, max_results: int) -> List[Dict]:
        """Fetch from NewsAPI.org and normalize the response."""
        params = {
            "category": category,
            "apiKey": self.newsapi_key,
            "pageSize": max_results,
            "language": "en",
            "country": "us",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.newsapi_url, params=params)
            response.raise_for_status()
            data = response.json()
            return [
                self._normalize_newsapi_article(art, category)
                for art in data.get("articles", [])
            ]

    def _normalize_gnews_article(self, article: dict, category: str) -> dict:
        """Normalize a GNews article into our standard format."""
        return {
            "title": article.get("title", ""),
            "description": article.get("description", ""),
            "content": article.get("content", ""),
            "url": article.get("url", ""),
            "source": article.get("source", {}).get("name", "GNews"),
            "image_url": article.get("image", ""),
            "published_at": article.get("publishedAt", ""),
            "category": category,
        }

    def _normalize_newsapi_article(self, article: dict, category: str) -> dict:
        """Normalize a NewsAPI article into our standard format."""
        return {
            "title": article.get("title", ""),
            "description": article.get("description", ""),
            "content": article.get("content", ""),
            "url": article.get("url", ""),
            "source": article.get("source", {}).get("name", "NewsAPI"),
            "image_url": article.get("urlToImage", ""),
            "published_at": article.get("publishedAt", ""),
            "category": category,
        }
