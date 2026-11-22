"""Durable, deduplicated observations for downstream market research."""

from datetime import datetime, timedelta, timezone
from threading import Lock
from app.services.news_dossier import build_dossier, timestamp

from sqlalchemy import Column, JSON, MetaData, String, Table, create_engine, select
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

    def _ensure_schema(self):
        with self._schema_lock:
            if not self._schema_ready:
                metadata.create_all(self.engine)
                self._schema_ready = True

    def dossier(self, symbol, context):
        self._ensure_schema()
        anchor = timestamp(context.get("published_at"))
        if not anchor:
            return build_dossier(symbol, context, [])
        # Coarse ISO-date bounds allow offset timestamps. Apply exact UTC bounds in the aggregator.
        query = select(events).where(
            events.c.published_at >= (anchor - timedelta(days=181)).date().isoformat(),
            events.c.published_at < (anchor + timedelta(days=2)).date().isoformat(),
        )
        with self.engine.connect() as connection:
            return build_dossier(symbol, context, connection.execute(query).mappings())

    def record(self, observations, model):
        if not observations:
            return
        self._ensure_schema()
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

    def history(self, symbol, current_event_id, *, limit=200):
        """Describe bounded prior observations, never inferred price performance."""
        with self._schema_lock:
            if not self._schema_ready:
                metadata.create_all(self.engine)
                self._schema_ready = True
        now = datetime.now(timezone.utc).isoformat()
        with self.engine.connect() as connection:
            rows = connection.execute(select(events).where(
                events.c.event_id != current_event_id, events.c.analyzed_at < now,
            ).order_by(events.c.analyzed_at.desc()).limit(limit)).mappings().all()
        related = []
        for row in rows:
            for company in row['analysis'].get('companies', []):
                if company.get('symbol') == symbol:
                    related.append({'event_type': row['event_type'], 'direction': company.get('direction', 'uncertain'),
                                    'observed_at': row['analyzed_at'], 'title': row['title'], 'url': row['url']})
                    break
        counts = {}
        for item in related:
            key = item['event_type']
            counts[key] = counts.get(key, 0) + 1
        return {'observations': len(related), 'event_counts': counts, 'recent': related[:5],
                'note': 'Counts describe previously observed news in a bounded local history; they do not measure predictive accuracy or causation.'}
