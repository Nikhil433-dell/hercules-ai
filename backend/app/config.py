from typing import List, Union
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Hercules AI"
    DEBUG: bool = False
    NEWS_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "sqlite:///./test.db"
    CORS_ORIGINS: List[str] = ["*"]
    NEWS_FETCH_INTERVAL: int = 3600

    class Config:
        env_file = ".env"

settings = Settings()
