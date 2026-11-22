"""Provider delivery tests use HTTP mocks and never spend API credits."""
import asyncio
import json
from unittest.mock import AsyncMock
import httpx
import pytest
from app.main import app
from app.services.live_feed import FeedUnavailable, LiveFeedService
from app.services.market_analyzer import MarketAnalyzer


@pytest.mark.asyncio
async def test_provider_metadata_quote_and_concurrent_cache():
    calls = []
    def handle(request):
        calls.append(request.url.path)
        if request.url.path.endswith('/news'):
            return httpx.Response(200, json=[{
                'headline': 'Earnings', 'summary': 'Provider text', 'source': 'Publisher', 'url': 'https://example.com/earnings',
                'datetime': 1700000000, 'related': 'AAPL,MSFT,Apple Inc.,AAPL',
            }])
        return httpx.Response(200, json={'c': 123.45, 't': 1700000001})
    fetcher = AsyncMock()
    service = LiveFeedService(fetcher, 'secret-key', transport=httpx.MockTransport(handle))
    first, second = await asyncio.gather(service.get_feed('business'), service.get_feed('business'))
    assert first == second
    assert calls.count('/api/v1/news') == 1
    assert calls.count('/api/v1/quote') == 2
    article = first['articles'][0]
    assert article['tickers'] == ['AAPL', 'MSFT']
    assert article['published_at'] == '2023-11-14T22:13:20+00:00'
    assert article['source'] == 'Publisher'
    assert article['quotes'][0] == {
        'symbol': 'AAPL', 'price': 123.45, 'currency': None,
        'asOf': '2023-11-14T22:13:21+00:00', 'source': 'Finnhub',
    }
    assert first['refresh_interval_seconds'] == 60
    fetcher.fetch_by_category.assert_not_called()
    first['articles'].clear()
    assert (await service.get_feed('business'))['articles']


@pytest.mark.asyncio
async def test_quote_failure_zero_and_secrets():
    async def handle(request):
        if request.url.path.endswith('/news'):
            return httpx.Response(200, json=[{'headline': 'News', 'related': 'AAPL,MSFT', 'url': 'https://example.com/news'}])
        if request.url.params['symbol'] == 'AAPL':
            return httpx.Response(200, json={'c': 0, 't': 0})
        return httpx.Response(429, json={'error': 'secret-key must not escape'})
    service = LiveFeedService(AsyncMock(), 'secret-key', transport=httpx.MockTransport(handle))
    quotes = (await service.get_feed('business'))['articles'][0]['quotes']
    assert all(q['price'] is None and q['asOf'] is None and q['error'] for q in quotes)
    assert 'secret-key' not in str(quotes)


@pytest.mark.asyncio
async def test_missing_key_quote_and_timestamp_are_honest():
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{'title': 'Actual headline', 'tickers': ['AAPL']}]
    article = (await LiveFeedService(fetcher).get_feed('business'))['articles'][0]
    assert article['quotes'][0]['price'] is None
    assert 'need setup' in article['quotes'][0]['error']
    assert article['published_at'] is None


@pytest.mark.asyncio
async def test_failure_cache_expiration_and_no_credentials():
    fetcher = AsyncMock()
    fetcher.fetch_by_category.side_effect = RuntimeError('https://provider/?key=secret')
    clock = [100]
    service = LiveFeedService(fetcher, clock=lambda: clock[0])
    for _ in range(2):
        with pytest.raises(FeedUnavailable) as error:
            await service.get_feed('general')
        assert 'secret' not in str(error.value)
    assert fetcher.fetch_by_category.await_count == 1
    clock[0] += 61
    with pytest.raises(FeedUnavailable):
        await service.get_feed('general')
    assert fetcher.fetch_by_category.await_count == 2


@pytest.mark.asyncio
async def test_finnhub_news_failure_falls_back():
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{'title': 'Fallback'}]
    service = LiveFeedService(fetcher, 'key', transport=httpx.MockTransport(lambda r: httpx.Response(403)))
    assert (await service.get_feed('business'))['articles'][0]['title'] == 'Fallback'


@pytest.mark.asyncio
async def test_quotes_bounded_to_ten_four_concurrent_and_shared_cache():
    active, maximum, calls = 0, 0, 0
    async def handle(request):
        nonlocal active, maximum, calls
        calls += 1
        active += 1
        maximum = max(maximum, active)
        await asyncio.sleep(0)
        active -= 1
        return httpx.Response(200, json={'c': 10})
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [
        {'title': 'Story', 'tickers': [f'S{i}' for i in range(10)]},
        {'title': 'Other', 'tickers': ['EXTRA']},
    ]
    service = LiveFeedService(fetcher, 'key', transport=httpx.MockTransport(handle))
    response = await service.get_feed('technology')
    assert calls == 10 and maximum <= 4
    assert response['articles'][1]['quotes'][0]['price'] is None
    await service.get_feed('general')
    assert calls == 10


def test_feed_categories_and_unavailable(client):
    app.state.live_feed.get_feed = AsyncMock(side_effect=FeedUnavailable('News unavailable.'))
    assert client.get('/news/feed?category=made-up').status_code == 422
    response = client.get('/news/feed?category=business')
    assert response.status_code == 503
    assert response.json() == {'detail': 'News unavailable.'}
    assert response.headers['retry-after'] == '60'


def test_feed_contract(client):
    app.state.live_feed.get_feed = AsyncMock(return_value={'articles': [], 'refresh_interval_seconds': 60})
    response = client.get('/news/feed?category=general')
    assert response.status_code == 200
    assert response.json() == {'articles': [], 'refresh_interval_seconds': 60}
    app.state.live_feed.get_feed.assert_awaited_once_with('general')


@pytest.mark.asyncio
async def test_generic_names_produce_quote_rows_and_missing_key_status():
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{'title': 'Microsoft and Apple shares climb'}]
    feed = await LiveFeedService(fetcher).get_feed('business')
    article = feed['articles'][0]
    assert article['tickers'] == ['MSFT', 'AAPL']
    assert [q['symbol'] for q in article['quotes']] == ['MSFT', 'AAPL']
    assert all(q['price'] is None and 'need setup' in q['error'] for q in article['quotes'])
    assert feed['quote_status']['state'] == 'setup_required'
    assert 'provider' in feed['quote_status']['message']


@pytest.mark.asyncio
async def test_finnhub_names_without_related_symbols_are_resolved():
    def handle(request):
        if request.url.path.endswith('/news'):
            return httpx.Response(200, json=[{'headline': 'Nvidia earnings rise', 'related': '', 'url': 'https://example.com/nvidia'}])
        return httpx.Response(200, json={'c': 10, 't': 1700000001})
    service = LiveFeedService(AsyncMock(), 'test-key', transport=httpx.MockTransport(handle))
    feed = await service.get_feed('business')
    assert feed['articles'][0]['tickers'] == ['NVDA']
    assert feed['articles'][0]['quotes'][0]['price'] == 10
    assert feed['quote_status']['state'] == 'ready'


@pytest.mark.asyncio
async def test_bad_quote_access_sets_unavailable_and_no_secret_in_status():
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{'title': 'Microsoft results'}]
    service = LiveFeedService(fetcher, 'private-secret', transport=httpx.MockTransport(lambda r: httpx.Response(403)))
    feed = await service.get_feed('technology')
    assert feed['quote_status']['state'] == 'unavailable'
    assert feed['articles'][0]['quotes'][0]['price'] is None
    assert 'private-secret' not in str(feed)


@pytest.mark.asyncio
async def test_status_without_symbols_distinguishes_setup_and_enabled():
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{'title': 'No company headline'}]
    missing = await LiveFeedService(fetcher).get_feed('technology')
    ready = await LiveFeedService(fetcher, 'configured').get_feed('technology')
    assert missing['quote_status']['state'] == 'setup_required'
    assert ready['quote_status']['state'] == 'ready'
    assert 'No supported stock mentions' in ready['quote_status']['message']


@pytest.mark.asyncio
@pytest.mark.parametrize('provider_news', [[], [None, {'headline': 'Removed story', 'url': ''}], [
    {'headline': 'Unsafe link', 'url': 'javascript:alert(1)'},
    {'headline': '   ', 'url': 'https://example.com/empty'},
]])
async def test_empty_or_unusable_finnhub_news_falls_back_and_still_fetches_quotes(provider_news):
    def handle(request):
        if request.url.path.endswith('/news'):
            return httpx.Response(200, json=provider_news)
        return httpx.Response(200, json={'c': 123.45, 't': 1700000001})
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{
        'title': 'Microsoft earnings', 'url': 'https://example.com/microsoft',
    }]
    service = LiveFeedService(fetcher, 'test-key', transport=httpx.MockTransport(handle))
    feed = await service.get_feed('business')
    fetcher.fetch_by_category.assert_awaited_once_with('business', max_results=10)
    assert feed['articles'][0]['tickers'] == ['MSFT']
    assert feed['articles'][0]['quotes'][0]['price'] == 123.45


@pytest.mark.asyncio
async def test_usable_finnhub_stories_survive_bad_records_without_fallback():
    fetcher = AsyncMock()
    service = LiveFeedService(fetcher, 'key', transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[
        None, {'headline': 'Broken', 'url': ''},
        {'headline': 'Market news', 'url': 'https://example.com/valid'},
    ])))
    feed = await service.get_feed('business')
    assert len(feed['articles']) == 1
    assert feed['articles'][0]['title'] == 'Market news'
    fetcher.fetch_by_category.assert_not_awaited()


@pytest.mark.asyncio
async def test_local_analysis_keeps_provider_tags_and_adds_all_supported_source_tickers():
    gate = asyncio.Event()
    observed_urls = []
    quote_symbols = []
    description = "Shopify Inc. raised full-year guidance after reporting earnings."
    supplier = "Dell Technologies will supply the infrastructure for the expansion."

    async def analyze(articles):
        await gate.wait()
        observed_urls.extend(article["url"] for article in articles)
        return [{
            **article,
            "analysis": {
                "event_type": "guidance", "relevance": "high",
                "why_it_matters": "Higher guidance changes the published outlook.",
                "companies": [
                    {"name": "Shopify Inc.", "relationship": "direct", "evidence": description},
                    {"name": "Private Vendor", "relationship": "indirect", "evidence": "Private Vendor supplies the company."},
                ],
            },
        } for article in articles]

    def handle(request):
        if request.url.path.endswith("/news"):
            return httpx.Response(200, json=[{
                "headline": "Shopify updates guidance", "summary": description + " " + supplier,
                "url": "https://example.com/results?utm_source=finnhub", "datetime": 1700000000,
                "related": "MSFT",
            }])
        if request.url.path.endswith("/nasdaqlisted.txt"):
            return httpx.Response(200, text=(
                "Symbol|Security Name|Test Issue|ETF\n"
                "SHOP|Shopify Inc. - Class A Subordinate Voting Shares|N|N\n"
            ))
        if request.url.path.endswith("/otherlisted.txt"):
            return httpx.Response(200, text=(
                "ACT Symbol|Security Name|Test Issue|ETF\n"
                "DELL|Dell Technologies Inc. Class C Common Stock|N|N\n"
            ))
        quote_symbols.append(request.url.params["symbol"])
        return httpx.Response(200, json={"c": 0})

    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{
        "title": "Shopify updates guidance", "description": description, "content": "Provider article body.",
        "url": "https://example.com/results", "published_at": "2023-11-14T22:13:20Z",
    }, {
        "title": "Shopify lifts outlook", "description": description + " " + supplier,
        "url": "https://other.example.com/earnings", "published_at": "2023-11-14T23:00:00Z",
    }]
    analyzer = AsyncMock()
    analyzer.last_status = "ready"
    analyzer.analyze.side_effect = analyze
    service = LiveFeedService(fetcher, "test-key", transport=httpx.MockTransport(handle), analyzer=analyzer)
    try:
        pending = await service.get_feed("business")
        assert pending["analysis_status"] == "pending"
        assert len(pending["articles"]) == 2
        assert all("analysis" not in a and "content" not in a for a in pending["articles"])
        gate.set()
        await service._analyses["business"].task
        ready = await service.get_feed("business")
        assert ready["analysis_status"] == "ready"
        assert len(observed_urls) == 2
        assert quote_symbols == ["MSFT", "SHOP", "DELL"]
        assert len({a["analysis"]["event_id"] for a in ready["articles"]}) == 1
        for article in ready["articles"]:
            assert article["analysis"]["alert_eligible"]
            assert [company["symbol"] for company in article["analysis"]["companies"]] == ["SHOP"]
            assert article["tickers"][:2] == ["SHOP", "DELL"]
            assert all(quote["price"] is None for quote in article["quotes"])
        assert ready["articles"][1]["tickers"] == ["SHOP", "DELL", "MSFT"]
        analyzer.analyze.assert_awaited_once()
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_ollama_failure_keeps_finance_available_and_retries_after_cooldown():
    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{"title": "Microsoft reports earnings", "url": "https://example.com/story"}]
    analyzer = AsyncMock()
    analyzer.analyze.side_effect = RuntimeError("provider internals")
    clock = [100]
    service = LiveFeedService(fetcher, analyzer=analyzer, clock=lambda: clock[0])
    try:
        await service.get_feed("business")
        await service._analyses["business"].task
        fallback = await service.get_feed("business")
        assert fallback["analysis_status"] == "unavailable"
        assert fallback["articles"][0]["tickers"] == ["MSFT"]
        assert "provider internals" not in str(fallback)
        analyzer.analyze.assert_awaited_once()
        clock[0] += 61
        assert (await service.get_feed("business"))["analysis_status"] == "pending"
        await service._analyses["business"].task
        assert analyzer.analyze.await_count == 2
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_opened_macro_story_can_be_analyzed_after_missing_the_shortlist():
    url = "https://example.com/fed"
    title = "The Fed changes its meeting schedule"
    calls = []

    def ollama(request):
        payload = json.loads(request.content)
        is_shortlist = "candidate_ids" in payload["format"]["properties"]
        calls.append(is_shortlist)
        result = {"candidate_ids": []} if is_shortlist else {
            "candidate_id": "a0", "event_type": "macro", "relevance": "medium",
            "why_it_matters": "A calendar change can affect when markets expect policy updates.",
            "evidence": {"field": "title", "excerpt": title},
            "companies": [],
        }
        return httpx.Response(200, json={"message": {"content": json.dumps(result)}})

    fetcher = AsyncMock()
    fetcher.fetch_by_category.return_value = [{"title": title, "url": url}]
    analyzer = MarketAnalyzer("http://127.0.0.1:11434", "llama3.1:8b", transport=httpx.MockTransport(ollama))
    listings = httpx.MockTransport(lambda request: httpx.Response(200, text=""))
    service = LiveFeedService(fetcher, analyzer=analyzer, transport=listings)
    await service.get_feed("business")
    await service._analyses["business"].task
    assert (await service.get_feed("business"))["articles"] == []
    assert (await service.analyze_article("https://unseen.example"))["analysis_status"] == "expired"
    detail = await service.analyze_article(url)
    assert detail["analysis_status"] == "ready"
    assert detail["articles"][0]["analysis"]["event_type"] == "macro"
    assert detail["articles"][0]["tickers"] == []
    assert (await service.get_feed("business"))["articles"][0]["analysis"]["event_type"] == "macro"
    assert (await service.analyze_article(url)) == detail
    assert calls == [True, False]


@pytest.mark.parametrize("status", ["ready", "pending", "unavailable"])
def test_finance_curation_prioritizes_material_events_and_keeps_fallback(status):
    articles = [
        {"title": "Unassessed"},
        {"title": "Routine", "analysis": {"relevance": "low"}},
        {"title": "Weaker event", "analysis": {"relevance": "medium"}},
        {"title": "Material event", "analysis": {"relevance": "high"}},
    ]
    result = LiveFeedService._curate_finance(articles, status)
    assert [a["title"] for a in result[:3]] == ["Material event", "Weaker event", "Unassessed"]
    assert [a["curation_status"] for a in result[:3]] == ["selected", "selected", "fallback"]
    assert (len(result) == 3) == (status == "ready")


def test_finance_curation_bounds_fallback_and_allows_empty_ready_selection():
    assert len(LiveFeedService._curate_finance([{"title": str(i)} for i in range(20)], "unavailable")) == 10
    assert LiveFeedService._curate_finance([{"analysis": {"relevance": "low"}}], "ready") == []
