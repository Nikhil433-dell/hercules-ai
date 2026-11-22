import json

import httpx
import pytest

from app.services.market_analyzer import GeminiMarketAnalyzer


FACTS = {'symbol': 'MSFT', 'technical.sma20': 100, 'fundamental.pe_ttm': 25,
         'news.evidence': 'A fictional example for a test, not current market news.'}


@pytest.mark.asyncio
async def test_model_selects_verdict_and_caches_identical_evidence_only():
    calls = []
    def respond(request):
        payload = json.loads(request.content)
        assert 'tools' not in payload
        assert request.url.path.endswith('gemini-4-hydrogen:generateContent')
        facts = json.loads(payload['contents'][0]['parts'][0]['text'])['facts']
        calls.append(facts)
        result = {'stance': 'watch', 'factors': [{'interpretation': 'The available evidence does not establish a compelling thesis.',
                   'evidence_fields': ['technical.sma20', 'fundamental.pe_ttm']}], 'risks': ['Future business outcomes remain uncertain.']}
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': json.dumps(result)}]}}]})
    model = GeminiMarketAnalyzer('test-key', transport=httpx.MockTransport(respond))
    first = await model.assess_stock(FACTS)
    assert first['stance'] == 'watch'
    assert first['model'] == 'gemini-4-hydrogen'
    assert (await model.assess_stock(FACTS)) == first
    assert len(calls) == 1
    await model.assess_stock({**FACTS, 'news.evidence': 'Different fictional report.'})
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_model_cannot_cite_invented_market_data():
    def respond(request):
        result = {'stance': 'research_candidate', 'factors': [{'interpretation': 'A fictional unsupported factor for validation testing.',
                   'evidence_fields': ['fundamental.invented_metric']}], 'risks': []}
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': json.dumps(result)}]}}]})
    model = GeminiMarketAnalyzer('test-key', transport=httpx.MockTransport(respond))
    with pytest.raises(ValueError, match='unavailable evidence'):
        await model.assess_stock(FACTS)
