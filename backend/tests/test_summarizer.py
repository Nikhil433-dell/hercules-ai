"""Tests for the summarizer service."""

import os
import pytest
from app.services.summarizer import NewsSummarizer


@pytest.fixture
def summarizer():
    """Create a summarizer instance (needs OPENAI_API_KEY to actually call LLM)."""
    api_key = os.getenv("OPENAI_API_KEY", "test-key")
    return NewsSummarizer(openai_api_key=api_key)


def test_summarizer_init(summarizer):
    """Summarizer can be instantiated without calling the LLM."""
    assert summarizer is not None
    assert summarizer.parser is not None
    # LLM should NOT be initialized yet (lazy)
    assert summarizer._llm is None


@pytest.mark.asyncio
async def test_summarize_empty_articles(summarizer):
    """Summarizing empty list returns sensible defaults (no LLM call needed)."""
    result = await summarizer.summarize_articles([])
    assert result["summary"] == "No articles to summarize."
    assert result["highlights"] == []
    assert result["categories"] == {}


@pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") == "test-key",
    reason="Requires a real OPENAI_API_KEY",
)
@pytest.mark.asyncio
async def test_summarize_with_real_api(summarizer, mock_articles):
    """Integration test — only runs when a real API key is available."""
    result = await summarizer.summarize_articles(mock_articles)
    assert "summary" in result
    assert len(result["summary"]) > 0
    assert isinstance(result["highlights"], list)
