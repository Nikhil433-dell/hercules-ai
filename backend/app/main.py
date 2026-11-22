"""FastAPI application entry point — lifecycle, middleware, and route mounting."""

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import news, preferences
from app.api.websocket import websocket_endpoint
from app.services.news_fetcher import NewsFetcher
from app.services.summarizer import NewsSummarizer
from app.services.cache import CacheService
from app.services.live_feed import LiveFeedService
from app.services.market_analyzer import GeminiMarketAnalyzer, MarketAnalyzer
from app.services.market_event_store import MarketEventStore
from app.services.stock_research import StockResearchService
from app.models.schemas import HealthResponse

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
# Provider URLs may contain credentials; don't emit HTTP request/debug traces.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Track app start time for uptime calculation
_start_time: float = 0.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle — create services on startup, clean up on shutdown."""
    global _start_time
    _start_time = time.time()

    # --- Startup: Initialize services and attach to app.state ---
    logger.info("Starting Hercules AI backend...")

    app.state.news_fetcher = NewsFetcher(
        gnews_api_key=settings.GNEWS_API_KEY,
        newsapi_key=settings.NEWSAPI_KEY,
    )
    app.state.summarizer = NewsSummarizer(
        openai_api_key=settings.OPENAI_API_KEY,
    )
    provider = settings.market_analysis_provider
    analyzer = None
    if provider == "gemini":
        analyzer = GeminiMarketAnalyzer(settings.GEMINI_API_KEY.get_secret_value(), settings.GEMINI_MODEL, timeout=90)
    elif provider == "ollama":
        analyzer = MarketAnalyzer(settings.OLLAMA_BASE_URL, settings.OLLAMA_MODEL, timeout=120)
    event_store = None
    if analyzer and settings.MARKET_EVENT_HISTORY_ENABLED:
        if os.environ.get("VERCEL") and settings.DATABASE_URL.startswith("sqlite"):
            logger.warning("Set a Postgres DATABASE_URL for market event history on Vercel.")
        else:
            event_store = MarketEventStore(settings.DATABASE_URL)
    app.state.live_feed = LiveFeedService(
        app.state.news_fetcher, finnhub_api_key=settings.FINNHUB_API_KEY,
        analyzer=analyzer, event_store=event_store,
    )
    app.state.cache = CacheService(
        redis_url=settings.REDIS_URL,
    )
    app.state.stock_research = StockResearchService(api_key=settings.FINNHUB_API_KEY, assessor=analyzer)
    app.state.market_events = event_store

    logger.info("All services initialized.")
    try:
        yield
    finally:
        await app.state.live_feed.close()
        await app.state.cache.close()
        logger.info("Shutdown complete.")


# --- Create the FastAPI app ---
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered news summarization agent",
    lifespan=lifespan,
    debug=settings.DEBUG,
)

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Mount Routers ---
app.include_router(news.router, prefix="/news", tags=["news"])
app.include_router(preferences.router, prefix="/preferences", tags=["preferences"])


# --- Root & Health Endpoints ---
@app.get("/")
async def root():
    """Root endpoint — basic app info."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with uptime."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        uptime_seconds=round(time.time() - _start_time, 2),
        ollama_enabled=settings.market_analysis_provider == "ollama",
        market_analysis_provider=settings.market_analysis_provider,
    )


# --- WebSocket ---
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket_endpoint(websocket)
