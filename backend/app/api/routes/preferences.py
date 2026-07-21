from fastapi import APIRouter
from typing import List
from app.models.schemas import UserPreferences, CategoryEnum

router = APIRouter()

@router.get("", response_model=UserPreferences)
async def get_preferences():
    """Get user preferences."""
    return UserPreferences(categories=[], keywords=[])

@router.put("", response_model=UserPreferences)
async def update_preferences(prefs: UserPreferences):
    """Update user preferences."""
    return prefs

@router.get("/categories", response_model=List[CategoryEnum])
async def get_preferred_categories():
    """Get user's preferred categories."""
    return []
