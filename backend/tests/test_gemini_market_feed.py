"""Exercise Hydrogen's API contract and the feed without spending model quota."""

import json
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select

from app.services.live_feed import LiveFeedService
from app.services.market_analyzer import GeminiMarketAnalyzer
from app.services.market_event_store import MarketEventStore, events


@pytest.mark.asyncio
async def test_gemini_adds_source_links_and_records_company_and_market_events(tmp_path):
    company_title = "Microsoft raises annual revenue guidance"
    macro_title = "The central bank announced an unexpected interest rate cut"
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [
        {"title": company_title, "url": "https://example.com/earnings", "published_at": "2026-11-12T14:00:00Z"},
        {"title": macro_title, "url": "https://example.com/rates", "published_at": "2026-11-12T14:01:00Z"},
    ]
    requests = []

    def gemini(request):
        assert request.url.path == "/v1beta/models/gemini-4-hydrogen:generateContent"
        assert request.headers["x-goog-api-key"] == "test-key"
        assert not request.url.query
        payload = json.loads(request.content)
        assert "tools" not in payload
        assert payload["generationConfig"]["responseMimeType"] == "application/json"
        data = json.loads(payload["contents"][0]["parts"][0]["text"])
        requests.append(data)
        if "candidate_ids" in payload["generationConfig"]["responseJsonSchema"]["properties"]:
            result = {"candidate_ids": [entry["id"] for entry in data]}
        else:
            company_schema = payload["generationConfig"]["responseJsonSchema"]["$defs"]["CompanyMention"]["properties"]
            assert {"direction", "impact_score", "confidence", "risks", "horizon"} <= company_schema.keys()
            result = {"analyses": [{
                "candidate_id": entry["id"], "event_type": "macro" if entry["title"] == macro_title else "guidance",
                "relevance": "high", "why_it_matters": "The announcement changes expectations for the outlook.",
                "evidence": {"field": "title", "excerpt": entry["title"]},
                "companies": [] if entry["title"] == macro_title else [{
                    "name": "Microsoft", "relationship": "direct",
                    "evidence": {"field": "title", "excerpt": entry["title"]},
                    "connection": "Higher guidance raises the company's published sales outlook.",
                    "direction": "positive", "impact_score": 1, "confidence": "medium",
                    "risks": [], "horizon": "medium_term",
                }],
            } for entry in data]}
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [
            {"text": "Internal notes", "thought": True}, {"text": json.dumps(result)},
        ]}}]})

    analyzer = GeminiMarketAnalyzer("test-key", transport=httpx.MockTransport(gemini))
    store = MarketEventStore(f"sqlite:///{tmp_path / 'events.db'}")
    listings = httpx.MockTransport(lambda request: httpx.Response(200, text=""))
    service = LiveFeedService(fetcher, analyzer=analyzer, event_store=store, transport=listings)
    try:
        first = await service.get_feed("business")
        assert first["refresh_interval_seconds"] == 60
        await service._analyses["business"].task
        ready = await service.get_feed("business")
        macro, company = ready["articles"]
        assert macro["analysis"]["alert_eligible"] and macro["tickers"] == []
        assert company["analysis"]["companies"][0]["connection"].startswith("Higher guidance")
        assert company["analysis"]["alert_eligible"] and company["tickers"] == ["MSFT"]
        impact = company["analysis"]["companies"][0]
        assert (impact["direction"], impact["impact_score"], impact["confidence"], impact["horizon"]) == (
            "positive", 1, "medium", "medium_term")
        assert company["curation_status"] == "selected"
        assert len(requests) == 2
        with store.engine.connect() as connection:
            rows = connection.execute(select(events)).mappings().all()
        assert len(rows) == 2 and {row["model"] for row in rows} == {"gemini-4-hydrogen"}
        assert all(row["first_seen_at"] <= row["analyzed_at"] for row in rows)
        store.record([(company, company["analysis"])], "gemini-4-hydrogen")
        with store.engine.connect() as connection:
            assert len(connection.execute(select(events.c.event_id)).all()) == 2
    finally:
        await service.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code, message", [(429, "quota"), (402, "paid access")])
async def test_gemini_account_error_preserves_headlines_and_backs_off(status_code, message):
    requests = []

    def quota_error(request):
        requests.append(request)
        return httpx.Response(status_code, json={"error": {"message": "private quota diagnostics"}})

    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{"title": "Central bank update", "url": "https://example.com/rates"}]
    analyzer = GeminiMarketAnalyzer("test-key", transport=httpx.MockTransport(quota_error))
    listings = httpx.MockTransport(lambda request: httpx.Response(200, text=""))
    service = LiveFeedService(fetcher, analyzer=analyzer, transport=listings)
    try:
        await service.get_feed("business")
        await service._analyses["business"].task
        result = await service.get_feed("business")
        assert result["analysis_status"] == "unavailable"
        assert message in result["analysis_message"]
        assert "private quota diagnostics" not in str(result)
        assert result["articles"][0]["title"] == "Central bank update"
        await service.analyze_article("https://example.com/rates")
        assert len(requests) == 1
    finally:
        await service.close()
