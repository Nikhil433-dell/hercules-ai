from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class CategoryEnum(str, Enum):
    TECHNOLOGY = "technology"
    BUSINESS = "business"
    SPORTS = "sports"
    ENTERTAINMENT = "entertainment"
    GENERAL = "general"

class NewsArticle(BaseModel):
    id: str
    title: str
    content: str
    url: str
    source: str
    category: CategoryEnum
    published_at: str

class NewsSummary(BaseModel):
    id: str
    summary_text: str
    original_articles: List[NewsArticle]
    category: CategoryEnum

class SummaryResponse(BaseModel):
    summaries: List[NewsSummary]

class UserPreferences(BaseModel):
    categories: List[CategoryEnum]
    keywords: List[str]

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatResponse(BaseModel):
    message: str
