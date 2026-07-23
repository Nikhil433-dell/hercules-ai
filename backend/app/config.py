"""Application settings — loaded from environment variables / .env file."""

from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration for the Hercules AI backend.
    
    All values can be overridden via environment variables or a .env file.
    """
    model_config = {"env_file": ".env"}

    APP_NAME: str = "Hercules AI"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # News API Keys
    GNEWS_API_KEY: str = ""
    NEWSAPI_KEY: str = ""

    # LLM
    OPENAI_API_KEY: str = ""

    # Infrastructure
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "sqlite:///./hercules.db"

    # App Settings
    CORS_ORIGINS: List[str] = ["*"]
    NEWS_FETCH_INTERVAL: int = 900   # seconds (15 minutes)
    CACHE_TTL: int = 900             # seconds (15 minutes)
    DEFAULT_CATEGORY: str = "general"
    MAX_ARTICLES: int = 10


settings = Settings()

