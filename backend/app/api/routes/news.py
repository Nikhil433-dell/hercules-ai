from fastapi import APIRouter, Depends
from typing import List
from app.models.schemas import NewsSummary, SummaryResponse, CategoryEnum

router = APIRouter()

@router.get("/summary", response_model=SummaryResponse)
async def get_summary():
    """Get news summary."""
    return SummaryResponse(summaries=[])

@router.get("/categories", response_model=List[CategoryEnum])
async def get_categories():
    """Get list of available news categories."""
    return []

@router.get("/headlines", response_model=List[NewsSummary])
async def get_headlines():
    """Get top headlines."""
    return []

@router.get("/history", response_model=List[NewsSummary])
async def get_history():
    """Get news history."""
    return []
