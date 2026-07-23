"""FastAPI application entry point — lifecycle, middleware, and route mounting."""

import logging
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
from app.models.schemas import HealthResponse

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

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
    app.state.cache = CacheService(
        redis_url=settings.REDIS_URL,
    )

    logger.info("All services initialized.")
    yield

    # --- Shutdown: Clean up resources ---
    logger.info("Shutting down Hercules AI backend...")
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
    )


# --- WebSocket ---
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket_endpoint(websocket)
