"""Durable, deduplicated observations for downstream market research."""

from datetime import datetime, timezone
from threading import Lock

from sqlalchemy import Column, JSON, MetaData, String, Table, create_engine
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert


metadata = MetaData()
events = Table(
    "market_news_events", metadata,
    Column("event_id", String(64), primary_key=True),
    Column("event_type", String(40), nullable=False),
    Column("first_seen_at", String(40), nullable=False, index=True),
    Column("analyzed_at", String(40), nullable=False),
    Column("published_at", String(40)),
    Column("model", String(150), nullable=False),
    Column("title", String, nullable=False),
    Column("source", String, nullable=False),
    Column("url", String, nullable=False),
    Column("symbols", JSON, nullable=False),
    Column("analysis", JSON, nullable=False),
)


class MarketEventStore:
    def __init__(self, database_url):
        if database_url.startswith("postgres://"):
            database_url = "postgresql://" + database_url.removeprefix("postgres://")
        self.engine = create_engine(database_url, pool_pre_ping=True)
        self._schema_lock = Lock()
        self._schema_ready = False

    def record(self, observations, model):
        if not observations:
            return
        with self._schema_lock:
            if not self._schema_ready:
                metadata.create_all(self.engine)
                self._schema_ready = True
        now = datetime.now(timezone.utc).isoformat()
        rows = [{
            "event_id": analysis["event_id"],
            "event_type": analysis["event_type"],
            "first_seen_at": article["first_seen_at"],
            "analyzed_at": now,
            "published_at": article.get("published_at"),
            "model": model,
            "title": article["title"],
            "source": article["source"],
            "url": article["url"],
            "symbols": [company["symbol"] for company in analysis["companies"]],
            "analysis": analysis,
        } for article, analysis in sorted(observations, key=lambda pair: pair[0]["first_seen_at"])]
        insert = postgres_insert if self.engine.dialect.name == "postgresql" else sqlite_insert
        statement = insert(events).on_conflict_do_nothing(index_elements=["event_id"])
        with self.engine.begin() as connection:
            connection.execute(statement, rows)

    def close(self):
        self.engine.dispose()
