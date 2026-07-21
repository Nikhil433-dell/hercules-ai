from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.routes import news, preferences
from app.api.websocket import websocket_endpoint

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup placeholder
    yield
    # Shutdown placeholder

app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    debug=settings.DEBUG
)

# CORS middleware
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include routers
app.include_router(news.router, prefix="/news", tags=["news"])
app.include_router(preferences.router, prefix="/preferences", tags=["preferences"])

# Mount WebSocket
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket_endpoint(websocket)
