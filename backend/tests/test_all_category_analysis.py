from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.schemas import CategoryEnum
from app.services.live_feed import LiveFeedService


class FakeAnalyzer:
    """Test-only model substitute; the application uses Gemini/Ollama instead."""
    last_status = 'ready'
    model = 'test-model'

    async def analyze(self, articles, **kwargs):
        return [{**article, 'analysis': {
            'event_type': 'product', 'relevance': 'medium', 'why_it_matters': 'The launch may expand sales.',
            'evidence': article['title'], 'evidence_scope': 'provider_snippet',
            'companies': [{'name': 'OPPO' if 'Oppo' in article['title'] else 'Microsoft',
                           'relationship': 'direct', 'evidence': article['title'],
                           'direction': 'positive', 'confidence': 'low', 'impact_score': 1}],
        }} for article in articles]


def service():
    fetcher = AsyncMock()
    async def fetch(category, **kwargs):
        return [{'title': 'Microsoft launches a new product', 'url': f'https://example.com/{category}',
                 'published_at': '2026-11-19T15:00:00Z'}]
    fetcher.fetch_by_category.side_effect = fetch
    return LiveFeedService(fetcher, analyzer=FakeAnalyzer(), transport=httpx.MockTransport(lambda _: httpx.Response(200, text='')))


@pytest.mark.asyncio
@pytest.mark.parametrize('category', [item.value for item in CategoryEnum])
async def test_every_category_extracts_stocks_from_context_without_provider_tickers(category):
    feed = service()
    try:
        assert (await feed.get_feed(category))['analysis_status'] == 'pending'
        await feed._analyses[category].task
        ready = await feed.get_feed(category)
        article = ready['articles'][0]
        assert ready['analysis_status'] == 'ready'
        assert article['tickers'] == ['MSFT']
        assert article['analysis']['companies'][0]['name'] == 'Microsoft'
        assert feed.research_context(article['url'], 'MSFT')['direction'] == 'positive'
        assert feed.research_context(article['url'], 'NVDA') is None
        assert (await feed.analyze_article(article['url']))['analysis_status'] == 'ready'
    finally:
        await feed.close()


@pytest.mark.asyncio
async def test_oppo_is_retained_without_inventing_ticker_and_categories_do_not_overwrite_each_other():
    feed = service()
    original = feed.fetcher.fetch_by_category.side_effect
    async def fetch(category, **kwargs):
        if category == 'technology':
            return [{'title': 'Oppo Watch 5 launches with GPS, NFC and a 3,000-nit display for €159 in Europe',
                     'url': 'https://example.com/oppo', 'published_at': '2026-11-19T14:40:00Z'}]
        return await original(category, **kwargs)
    feed.fetcher.fetch_by_category.side_effect = fetch
    try:
        await feed.get_feed('business')
        await feed.get_feed('technology')
        await feed._analyses['business'].task
        await feed._analyses['technology'].task
        tech = (await feed.get_feed('technology'))['articles'][0]
        assert tech['analysis']['unlisted_companies'][0]['name'] == 'OPPO'
        assert tech['tickers'] == []
        assert tech['analysis']['companies'] == []
        assert feed.research_context(tech['url'], 'OPPO') is None
        assert (await feed.analyze_article(tech['url']))['articles'][0]['analysis']['unlisted_companies']
        business = (await feed.get_feed('business'))['articles'][0]
        assert business['tickers'] == ['MSFT']
        assert business['analysis']['unlisted_companies'] == []
    finally:
        await feed.close()
