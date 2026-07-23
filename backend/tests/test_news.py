"""Tests for news endpoints."""


def test_root(client):
    """Root endpoint returns app info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == "Hercules AI"
    assert "version" in data
    assert "docs" in data


def test_health(client):
    """Health endpoint returns OK status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime_seconds" in data


def test_get_categories(client):
    """Categories endpoint returns list of category values."""
    response = client.get("/news/categories")
    assert response.status_code == 200
    categories = response.json()
    assert isinstance(categories, list)
    assert "general" in categories
    assert "technology" in categories
    assert len(categories) >= 5


def test_get_preferences(client):
    """Preferences endpoint returns default preferences."""
    response = client.get("/preferences/")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert "keywords" in data
