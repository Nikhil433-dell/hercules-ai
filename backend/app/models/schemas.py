"""Pydantic schemas for API request/response models."""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel


class CategoryEnum(str, Enum):
    """Supported news categories."""
    GENERAL = "general"
    TECHNOLOGY = "technology"
    BUSINESS = "business"
    SCIENCE = "science"
    HEALTH = "health"
    SPORTS = "sports"
    ENTERTAINMENT = "entertainment"
    WORLD = "world"


class NewsArticle(BaseModel):
    """A single news article from any source."""
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    url: str
    source: str
    image_url: Optional[str] = None
    published_at: Optional[str] = None
    category: str = "general"


class ArticleSummary(BaseModel):
    """A summarized version of an article."""
    title: str
    summary: str
    source: str
    url: str
    category: str = "general"


class NewsBriefing(BaseModel):
    """A complete news briefing — the main response payload."""
    summary: str
    highlights: List[str] = []
    articles: List[ArticleSummary] = []
    generated_at: datetime
    category: str = "general"


class SummaryResponse(BaseModel):
    """Response wrapper for the /news/summary endpoint."""
    briefing: NewsBriefing
    cached: bool = False


class HeadlinesResponse(BaseModel):
    """Response wrapper for the /news/headlines endpoint."""
    articles: List[NewsArticle]
    count: int
    category: str


class HealthResponse(BaseModel):
    """Response for the /health endpoint."""
    status: str
    version: str
    uptime_seconds: float


class UserPreferences(BaseModel):
    """User's news preferences."""
    categories: List[CategoryEnum] = [CategoryEnum.GENERAL]
    keywords: List[str] = []
    refresh_interval: int = 900  # seconds


class ChatMessage(BaseModel):
    """A single chat message."""
    role: str
    content: str


class ChatResponse(BaseModel):
    """Response from the chat endpoint."""
    message: str
