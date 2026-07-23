"""Pytest fixtures for backend tests."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """FastAPI test client."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def mock_articles():
    """Sample article data for testing."""
    return [
        {
            "title": "AI Breakthrough: New Model Achieves Human-Level Reasoning",
            "description": "Researchers announce a new AI model with reasoning capabilities.",
            "content": "In a groundbreaking development, a team of researchers has created...",
            "url": "https://example.com/ai-breakthrough",
            "source": "Tech Daily",
            "image_url": "https://example.com/img.jpg",
            "published_at": "2026-07-23T10:00:00Z",
            "category": "technology",
        },
        {
            "title": "Global Markets Rally on Economic Data",
            "description": "Stock markets surge following positive employment figures.",
            "content": "Major stock indices around the world posted significant gains...",
            "url": "https://example.com/markets-rally",
            "source": "Financial Times",
            "image_url": "https://example.com/markets.jpg",
            "published_at": "2026-07-23T09:30:00Z",
            "category": "business",
        },
        {
            "title": "NASA Discovers New Exoplanet in Habitable Zone",
            "description": "The James Webb telescope identifies a promising Earth-like planet.",
            "content": "NASA scientists have confirmed the discovery of a new exoplanet...",
            "url": "https://example.com/nasa-exoplanet",
            "source": "Space News",
            "image_url": "https://example.com/planet.jpg",
            "published_at": "2026-07-23T08:00:00Z",
            "category": "science",
        },
    ]
