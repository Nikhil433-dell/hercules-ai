"""Capture a public, dated story and real research responses for the product film.

Run from backend with venv/bin/python ../desktop/showcase/snapshot.py NVDA.
Only the media are published. The snapshot stays in the ignored showcase build.
"""
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))

from app.config import settings
from app.services.live_feed import LiveFeedService
from app.services.market_analyzer import GeminiMarketAnalyzer
from app.services.market_event_store import MarketEventStore
from app.services.stock_research import StockResearchService


async def capture(symbol):
    with sqlite3.connect('file:hercules.db?mode=ro', uri=True) as connection:
        connection.row_factory = sqlite3.Row
        rows = list(connection.execute(
            'select * from market_news_events where symbols != ? order by published_at desc', ('[]',)))
    selected = next(row for row in rows if symbol in json.loads(row['symbols']))
    feed = LiveFeedService(None, settings.FINNHUB_API_KEY)
    store = MarketEventStore('sqlite:///hercules.db')
    try:
        articles = []
        for row in [selected, *(r for r in rows if r['event_id'] != selected['event_id'])][:4]:
            analysis = json.loads(row['analysis'])
            articles.append(dict(title=row['title'], description=analysis['evidence'], url=row['url'],
                                 source=row['source'], published_at=row['published_at'], analysis=analysis,
                                 category='business', tickers=json.loads(row['symbols']), curation_status='selected'))
        await feed._attach_quotes(articles)
        article = articles[0]
        analysis = article['analysis']
        company = next(c for c in analysis['companies'] if c['symbol'] == symbol)
        context = {**company, 'event_id': analysis['event_id'], 'relevance': analysis['relevance'],
                   'event_type': analysis['event_type'], 'published_at': article['published_at'],
                   'title': article['title'], 'description': article['description']}
        model = GeminiMarketAnalyzer(settings.GEMINI_API_KEY.get_secret_value(), settings.GEMINI_MODEL)
        research = await StockResearchService(settings.FINNHUB_API_KEY, assessor=model).research(symbol, news_context=context)
        research['history'] = store.history(symbol, context['event_id'])
        snapshot = dict(symbol=symbol, articles=articles, research=research,
                        dossier=store.dossier(symbol, context), captured=datetime.now(timezone.utc).isoformat())
        target = ROOT / 'desktop/showcase/.build/data.json'
        target.parent.mkdir(exist_ok=True)
        target.write_text(json.dumps(snapshot))
        print('Recorded', symbol, 'with', research['technical']['status'], 'technicals and',
              research['fundamental']['status'], 'fundamentals. Model:', research['model_status'])
    finally:
        await feed.close()
        store.close()


if __name__ == '__main__':
    asyncio.run(capture(sys.argv[1]))
