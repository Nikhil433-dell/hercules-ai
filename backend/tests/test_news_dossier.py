from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.news import router
from app.services.market_event_store import MarketEventStore


def test_dossier_uses_persisted_symbol_evidence_and_nonoverlapping_windows(tmp_path):
    anchor = datetime(2026, 11, 22, tzinfo=timezone.utc)
    store = MarketEventStore(f"sqlite:///{tmp_path / 'events.db'}")
    context = {"published_at": anchor.isoformat(), "event_id": "current",
               "evidence": "The company raised sales guidance by 12%.", "impact_channel": "demand"}
    for days in [0, 1, 2, 30, 31, 32, 180, 181, -1]:
        article = {"title": f"Event {days}", "source": "Publisher", "url": f"https://example.com/s{days}",
                   "published_at": (anchor - timedelta(days=days)).isoformat(), "first_seen_at": anchor.isoformat()}
        companies = [{"symbol": "ABC", "direction": "negative" if days <= 30 else "positive",
                      "evidence": article["title"], "relationship": "direct"},
                     {"symbol": "XYZ", "relationship": "indirect", "connection": "Supplier lost an order",
                      "evidence": "XYZ supplied the component."}]
        store.record([(article, {"event_id": f"e{days}", "event_type": "guidance", "companies": companies})], "test")
    app = FastAPI()
    app.include_router(router)
    app.state.live_feed = SimpleNamespace(research_context=lambda url, sym: context if sym == "ABC" else None)
    app.state.market_events = store
    try:
        with TestClient(app) as client:
            payload = {"symbol": "ABC", "url": "https://example.com/current"}
            response = client.post("/dossier", json=payload)
            assert response.status_code == 200
            result = response.json()
            assert result["recent_count"] == result["baseline_count"] == 3
            assert result["negative_share_change"] == 100
            assert result["recurring"] == [{"type": "guidance", "count": 3}]
            assert result["figures"] == ["12%"]
            assert result["impact_channel"] == "demand"
            assert result["connections"][0]["count"] == 3
            assert result["connections"][0]["source"]["title"] == "Event 1"
            assert len(result["timeline"]) == 6
            assert client.post("/dossier", json={**payload, "symbol": "ZZZ"}).status_code == 409
            app.state.market_events = None
            assert not client.post("/dossier", json=payload).json()["history_available"]
    finally:
        store.close()
