import math
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.news import router
from app.services.stock_research import StockResearchService
from app.services.market_event_store import MarketEventStore

NOW = datetime(2026, 11, 19, 18, tzinfo=timezone.utc).timestamp()


def chart(stale=0, count=80):
    return {'chart': {'result': [{'timestamp': [NOW - (count - i + stale) * 86400 for i in range(count)],
        'indicators': {'adjclose': [{'adjclose': [100 + i * .12 + math.sin(i) for i in range(count)]}]}}]}}


def financials(dated=True):
    return {'metric': {'netProfitMarginTTM': 22, 'revenueGrowthTTMYoy': 15,
        'totalDebt/totalEquityAnnual': .4, 'peTTM': 20,
        **({'asOfDate': '2026-10-31'} if dated else {})}}


def service(prices=None, fundamentals=None, key='private-key'):
    calls = []
    def handle(request):
        calls.append(request)
        if request.url.host == 'finnhub.io':
            assert request.headers['X-Finnhub-Token'] == key
            assert key not in str(request.url)
            return httpx.Response(200, json=fundamentals if fundamentals is not None else financials())
        return httpx.Response(200, json=prices if prices is not None else chart())
    assessor = SimpleNamespace(assess_stock=AsyncMock(return_value={
        'stance': 'research_candidate', 'model': 'test-model',
        'factors': [{'interpretation': 'Test model interpretation.', 'evidence_fields': ['technical.sma20']}], 'risks': [],
    }))
    return StockResearchService(key, assessor=assessor, transport=httpx.MockTransport(handle), clock=lambda: NOW), calls


NEWS = {'direction': 'positive', 'confidence': 'medium', 'relevance': 'high', 'published_at': '2026-11-19T15:00:00Z'}


@pytest.mark.asyncio
async def test_research_combines_fresh_inputs_and_caches_data_not_story_direction():
    research, calls = service()
    positive = await research.research('MSFT', news_context=NEWS)
    research.assessor.assess_stock.return_value = {**research.assessor.assess_stock.return_value, 'stance': 'watch'}
    negative = await research.research('MSFT', news_context={**NEWS, 'direction': 'negative'})
    assert positive['status'] == 'ready'
    assert positive['stance'] == 'research_candidate'
    assert negative['stance'] == 'watch'
    assert len(calls) == 2
    assert 0 <= positive['technical']['metrics']['rsi14'] <= 100
    assert positive['model_status'] == 'ready'
    assert research.assessor.assess_stock.await_count == 2
    assert research.assessor.assess_stock.call_args.args[0]['news.direction'] == 'negative'
    assert 'no indicator-count verdict' in positive['methodology']


@pytest.mark.asyncio
async def test_model_unavailability_never_falls_back_to_a_rule_based_buy():
    research, _ = service()
    research.assessor.assess_stock.side_effect = ValueError('Invalid model result')
    result = await research.research('MSFT', news_context=NEWS)
    assert result['status'] == 'ready'  # Market data is complete, but model inference failed.
    assert result['model_status'] == 'unavailable'
    assert result['stance'] == 'insufficient_data'
    research.assessor = None
    assert (await research.research('MSFT', news_context=NEWS))['stance'] == 'insufficient_data'


@pytest.mark.asyncio
@pytest.mark.parametrize('prices,fundamentals,news', [
    (chart(stale=10), financials(), NEWS), (chart(count=20), financials(), NEWS),
    (chart(), financials(False), NEWS), (chart(), {}, NEWS),
    (chart(), financials(), {**NEWS, 'published_at': '2026-01-01T00:00:00Z'}),
    (chart(), financials(), {**NEWS, 'published_at': '2027-01-01T00:00:00Z'}),
])
async def test_missing_stale_or_future_evidence_cannot_support_positive_stance(prices, fundamentals, news):
    research, _ = service(prices, fundamentals)
    result = await research.research('NVDA', news_context=news)
    assert result['stance'] == 'insufficient_data'
    assert result['risks']


@pytest.mark.asyncio
async def test_missing_key_and_provider_failure_are_honest_and_sanitized():
    def failed(request):
        return httpx.Response(403, json={'error': 'private provider diagnostics'})
    research = StockResearchService('', transport=httpx.MockTransport(failed), clock=lambda: NOW)
    result = await research.research('AAPL', news_context=NEWS)
    assert result['status'] == 'unavailable'
    assert result['stance'] == 'insufficient_data'
    assert 'private provider diagnostics' not in str(result)
    with pytest.raises(ValueError):
        await research.research('../private')


def test_endpoint_rejects_unverified_symbols_and_ignores_client_sentiment():
    app = FastAPI()
    app.include_router(router, prefix='/news')
    app.state.live_feed = SimpleNamespace(research_context=lambda url, symbol: NEWS if url == 'https://example.com/news' and symbol == 'MSFT' else None)
    app.state.stock_research = SimpleNamespace(research=AsyncMock(return_value={'stance': 'watch'}))
    with TestClient(app) as client:
        assert client.post('/news/research', json={'url': 'https://example.com/news', 'symbol': 'NVDA'}).status_code == 409
        assert client.post('/news/research', json={'url': 'https://example.com/news', 'symbol': '../private'}).status_code == 422
        assert client.post('/news/research', json={'url': 'https://example.com/news', 'symbol': 'MSFT', 'direction': 'negative'}).status_code == 200
    app.state.stock_research.research.assert_awaited_once_with('MSFT', news_context=NEWS)


def test_event_memory_is_deduplicated_and_excludes_current_event(tmp_path):
    store = MarketEventStore(f"sqlite:///{tmp_path / 'memory.db'}")
    article = {'first_seen_at': '2026-11-18T18:00:00Z', 'title': 'Microsoft updates guidance', 'source': 'Example', 'url': 'https://example.com/news'}
    analysis = {'event_id': 'earlier', 'event_type': 'guidance', 'companies': [{'symbol': 'MSFT', 'direction': 'positive'}]}
    try:
        store.record([(article, analysis)], 'gemini-4-hydrogen')
        store.record([(article, analysis)], 'gemini-4-hydrogen')
        store.record([(article, {**analysis, 'event_id': 'current'})], 'gemini-4-hydrogen')
        history = store.history('MSFT', 'current')
        assert history['observations'] == 1
        assert history['event_counts'] == {'guidance': 1}
        assert store.history('NVDA', 'current')['observations'] == 0
    finally:
        store.close()
