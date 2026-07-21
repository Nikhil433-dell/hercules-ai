import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    """Test client fixture."""
    return TestClient(app)

@pytest.fixture
def mock_news_data():
    """Mock news data fixture."""
    return [
        {
            "title": "Test News",
            "content": "Test content",
            "url": "http://test.com",
            "source": "Test Source",
            "category": "general"
        }
    ]
