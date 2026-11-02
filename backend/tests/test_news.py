"""Tests for news endpoints."""

from unittest.mock import AsyncMock

from app.main import app


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


def test_summary_preserves_article_publication_and_provider_description(client, mock_articles):
    """A newly generated briefing must not make an old article appear new."""
    article = {**mock_articles[0], "tickers": ["ACME"]}
    app.state.news_fetcher.fetch_by_category = AsyncMock(return_value=[article])
    app.state.cache.get_cached_summary = AsyncMock(return_value=None)
    app.state.cache.set_cached_summary = AsyncMock()
    app.state.summarizer.summarize_articles = AsyncMock(return_value={
        "summary": "AI briefing", "highlights": [],
    })

    response = client.get("/news/summary?category=business")

    assert response.status_code == 200
    payload = response.json()["briefing"]
    card = payload["articles"][0]
    assert card["published_at"] == article["published_at"]
    assert card["published_at"] != payload["generated_at"]
    assert card["tickers"] == ["ACME"]
    assert card["summary"] == article["description"]
    assert card["summary_source"] == "provider_description"


def test_headlines_do_not_invent_tickers(client, mock_articles):
    app.state.news_fetcher.fetch_by_category = AsyncMock(return_value=mock_articles)

    response = client.get("/news/headlines?category=business")

    assert response.status_code == 200
    articles = response.json()["articles"]
    assert articles[0]["published_at"] == mock_articles[0]["published_at"]
    assert all(article["tickers"] == [] for article in articles)
