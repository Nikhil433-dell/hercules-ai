"""News API routes — summary, headlines, and categories endpoints."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Query

from app.config import settings
from app.models.schemas import (
    CategoryEnum,
    SummaryResponse,
    NewsBriefing,
    ArticleSummary,
    HeadlinesResponse,
    NewsArticle,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    request: Request,
    category: str = Query(default="general", description="News category to summarize"),
):
    """Get an AI-generated news briefing.
    
    Flow: Check cache → if miss, fetch headlines → summarize → cache → return.
    """
    cache = request.app.state.cache
    fetcher = request.app.state.news_fetcher
    summarizer = request.app.state.summarizer

    # 1. Check cache first
    cached = await cache.get_cached_summary(category)
    if cached:
        logger.info(f"Cache HIT for category '{category}'")
        return SummaryResponse(
            briefing=NewsBriefing(**cached),
            cached=True,
        )

    logger.info(f"Cache MISS for category '{category}' — fetching and summarizing...")

    # 2. Fetch headlines
    articles = await fetcher.fetch_by_category(category, max_results=settings.MAX_ARTICLES)
    if not articles:
        raise HTTPException(
            status_code=503,
            detail=f"Could not fetch news for category '{category}'. Check your API keys.",
        )

    # 3. Summarize with AI
    summary_data = await summarizer.summarize_articles(articles)

    # 4. Build the briefing
    article_summaries = [
        ArticleSummary(
            title=a.get("title", ""),
            summary=a.get("description", ""),
            source=a.get("source", ""),
            url=a.get("url", ""),
            category=a.get("category", category),
        )
        for a in articles
    ]

    briefing = NewsBriefing(
        summary=summary_data.get("summary", ""),
        highlights=summary_data.get("highlights", []),
        articles=article_summaries,
        generated_at=datetime.now(timezone.utc),
        category=category,
    )

    # 5. Cache the result
    await cache.set_cached_summary(
        briefing.model_dump(mode="json"),
        category=category,
        ttl=settings.CACHE_TTL,
    )

    return SummaryResponse(briefing=briefing, cached=False)


@router.get("/categories")
async def get_categories():
    """Get all available news categories."""
    return [cat.value for cat in CategoryEnum]


@router.get("/headlines", response_model=HeadlinesResponse)
async def get_headlines(
    request: Request,
    category: str = Query(default="general", description="News category"),
    max_results: int = Query(default=10, ge=1, le=50, description="Max articles"),
):
    """Get raw headlines (no AI summarization)."""
    fetcher = request.app.state.news_fetcher

    articles_raw = await fetcher.fetch_by_category(category, max_results=max_results)

    articles = [
        NewsArticle(
            title=a.get("title", ""),
            description=a.get("description"),
            content=a.get("content"),
            url=a.get("url", ""),
            source=a.get("source", ""),
            image_url=a.get("image_url"),
            published_at=a.get("published_at"),
            category=a.get("category", category),
        )
        for a in articles_raw
    ]

    return HeadlinesResponse(
        articles=articles,
        count=len(articles),
        category=category,
    )
