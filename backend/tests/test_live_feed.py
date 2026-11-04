"""Provider delivery tests use HTTP mocks and never spend API credits."""
import asyncio
from unittest.mock import AsyncMock
import httpx
import pytest
from app.main import app
from app.services.live_feed import FeedUnavailable, LiveFeedService


@pytest.mark.asyncio
async def test_provider_metadata_quote_and_concurrent_cache():
    calls = []
    def handle(request):
        calls.append(request.url.path)
        if request.url.path.endswith('/news'):
            return httpx.Response(200, json=[{
                'headline': 'Earnings', 'summary': 'Provider text', 'source': 'Publisher',
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
            return httpx.Response(200, json=[{'headline': 'News', 'related': 'AAPL,MSFT'}])
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
            return httpx.Response(200, json=[{'headline': 'Nvidia earnings rise', 'related': ''}])
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
