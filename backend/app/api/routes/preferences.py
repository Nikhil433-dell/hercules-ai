"""User preferences routes — in-memory store for Phase 1."""

import logging
from fastapi import APIRouter
from app.models.schemas import UserPreferences, CategoryEnum

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory store for Phase 1 (will be replaced with DB in Phase 3)
_preferences = UserPreferences(
    categories=[CategoryEnum.GENERAL, CategoryEnum.TECHNOLOGY],
    keywords=[],
    refresh_interval=900,
)


@router.get("/", response_model=UserPreferences)
async def get_preferences():
    """Get current user preferences."""
    return _preferences


@router.put("/", response_model=UserPreferences)
async def update_preferences(prefs: UserPreferences):
    """Update user preferences."""
    global _preferences
    _preferences = prefs
    logger.info(f"Preferences updated: {prefs.categories}")
    return _preferences


@router.get("/categories")
async def get_available_categories():
    """Get all categories the user can subscribe to."""
    return [{"value": cat.value, "label": cat.value.title()} for cat in CategoryEnum]
