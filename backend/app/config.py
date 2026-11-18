"""Application settings — loaded from environment variables / .env file."""

from typing import List, Literal
from pydantic import SecretStr
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
    FINNHUB_API_KEY: str = ""

    # LLM
    OPENAI_API_KEY: str = ""
    OLLAMA_ENABLED: bool = False
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    MARKET_ANALYSIS_PROVIDER: Literal["auto", "ollama", "gemini", "off"] = "auto"
    GEMINI_API_KEY: SecretStr = SecretStr("")
    GEMINI_MODEL: str = "gemini-4-carbon"

    # Infrastructure
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "sqlite:///./hercules.db"
    MARKET_EVENT_HISTORY_ENABLED: bool = True

    # App Settings
    CORS_ORIGINS: List[str] = ["*"]
    NEWS_FETCH_INTERVAL: int = 900   # seconds (15 minutes)
    CACHE_TTL: int = 900             # seconds (15 minutes)
    DEFAULT_CATEGORY: str = "general"
    MAX_ARTICLES: int = 10

    @property
    def market_analysis_provider(self):
        if self.MARKET_ANALYSIS_PROVIDER != "auto":
            return self.MARKET_ANALYSIS_PROVIDER
        if self.GEMINI_API_KEY.get_secret_value():
            return "gemini"
        return "ollama" if self.OLLAMA_ENABLED else "off"


settings = Settings()

