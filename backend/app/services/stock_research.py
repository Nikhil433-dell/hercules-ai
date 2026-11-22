"""Model-led stock research using independently measured evidence; no orders."""

import asyncio
from collections import OrderedDict
from copy import deepcopy
from datetime import datetime, timezone
import math
import re
import statistics
import time

import httpx


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError, OverflowError):
        return None


def _iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace('+00:00', 'Z')


def _date(value):
    try:
        if not isinstance(value, str):
            return None
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)).timestamp()
    except (ValueError, OverflowError):
        return None


class StockResearchService:
    """Clock returns Unix seconds. Cached provider data never includes story context."""

    def __init__(self, api_key='', *, transport=None, clock=time.time, timeout=8.0,
                 cache_ttl=300, cache_size=128, assessor=None):
        if not 0 < timeout <= 60 or not 0 < cache_ttl <= 3600 or cache_size < 1:
            raise ValueError('Invalid research cache or timeout configuration')
        self._api_key = api_key
        self.assessor = assessor
        self.transport = transport
        self.clock = clock
        self.timeout = timeout
        self.cache_ttl = cache_ttl
        self.cache_size = cache_size
        self._cache = OrderedDict()
        # A single lock bounds concurrent provider load and avoids unbounded per-symbol locks.
        self._lock = asyncio.Lock()

    async def research(self, symbol, *, news_context=None):
        symbol = str(symbol).strip().upper()
        if not re.fullmatch(r'[A-Z0-9][A-Z0-9.\-^=]{0,19}', symbol):
            raise ValueError('Invalid stock symbol')
        try:
            data = await asyncio.wait_for(self._load(symbol), timeout=self.timeout + 1)
        except asyncio.TimeoutError:
            data = (None, None)
        now = self.clock()
        technical, quote_as_of = self._technical(data[0], now)
        fundamental = self._fundamental(data[1], now)
        statuses = [technical['status'], fundamental['status']]
        status = 'ready' if statuses == ['ready', 'ready'] else (
            'unavailable' if statuses == ['unavailable', 'unavailable'] else 'partial')
        reasons, risks = [], []
        for section in (technical, fundamental):
            for signal in section['signals']:
                (reasons if signal['direction'] == 'positive' else risks).append(signal['explanation'])
        stance = 'insufficient_data'
        model_status, model_name, factors = 'disabled', None, []
        context = news_context if isinstance(news_context, dict) else {}
        published = _date(context.get('published_at'))
        news_fresh = published is not None and 0 <= now - published <= 3 * 86400
        if not news_fresh:
            risks.append('The news timestamp is missing, future-dated, or more than three days old; a fresh thesis cannot be validated.')
        facts = {'symbol': symbol, 'coverage.technical': technical['status'],
                 'coverage.fundamental': fundamental['status'], 'coverage.news_fresh': news_fresh}
        for label, section in (('technical', technical), ('fundamental', fundamental)):
            facts.update({f'{label}.{key}': value for key, value in section['metrics'].items()})
        for field in ('name', 'evidence', 'connection', 'direction', 'confidence', 'relevance', 'event_type', 'title', 'description', 'content'):
            value = context.get(field)
            if isinstance(value, str) and value.strip():
                facts[f'news.{field}'] = value[:1600]
        if self.assessor is not None and context and status != 'unavailable':
            model_status = 'unavailable'
            try:
                assessment = await asyncio.wait_for(self.assessor.assess_stock(facts), timeout=32)
                stance = assessment['stance']
                factors = assessment['factors']
                reasons = [factor['interpretation'] for factor in factors]
                risks.extend(assessment['risks'])
                model_name = assessment['model']
                model_status = 'ready'
            except Exception:
                stance, factors = 'insufficient_data', []
                risks.append('The analysis model is unavailable or its output failed validation. No rule-based investment verdict was substituted.')
        elif self.assessor is None:
            risks.append('Connect an analysis model to obtain a stock-research assessment.')
        else:
            model_status = 'insufficient_data'
        # These are evidence-validity gates, not an investment scoring algorithm.
        if status != 'ready' or not news_fresh:
            if model_status == 'ready' and stance != 'insufficient_data':
                risks.append('The model interpretation is provisional: incomplete or stale evidence prevents validating its verdict.')
            stance = 'insufficient_data'
        risks.append('Historical indicators and reported fundamentals do not establish future returns; independently verify the underlying news.')
        return {
            'symbol': symbol, 'status': status, 'assessed_at': _iso(now),
            'quote_as_of': quote_as_of, 'technical': technical, 'fundamental': fundamental,
            'stance': stance, 'reasons': reasons, 'risks': risks,
            'model_status': model_status, 'model': model_name, 'factors': factors,
            'methodology': 'The configured machine-learning language model evaluates source text with measured technical and fundamental features. Software calculates adjusted daily SMA20/50, simple-average RSI14, 20-session return, annualized sample volatility and drawdown, and verifies data coverage and age. There is no indicator-count verdict or rule-based fallback. Model inference is not continuous retraining or an empirically validated return forecast; no orders are placed.',
            'sources': [
                {'name': 'Yahoo Finance daily chart', 'url': f'https://finance.yahoo.com/quote/{symbol}/history/', 'as_of': quote_as_of},
                {'name': 'Finnhub basic financials', 'url': 'https://finnhub.io/docs/api/company-basic-financials', 'as_of': fundamental.get('as_of')},
            ],
        }

    async def _load(self, symbol):
        async with self._lock:
            entry = self._cache.get(symbol)
            if entry and entry[0] > self.clock():
                self._cache.move_to_end(symbol)
                return deepcopy(entry[1])
            async with httpx.AsyncClient(transport=self.transport, timeout=self.timeout, trust_env=False) as client:
                async def fetch(url, **kwargs):
                    try:
                        response = await client.get(url, **kwargs)
                        response.raise_for_status()
                        body = response.json()
                        return body if isinstance(body, dict) else None
                    except (httpx.HTTPError, ValueError, TypeError):
                        return None
                async def fundamentals():
                    if not self._api_key:
                        return None
                    return await fetch('https://finnhub.io/api/v1/stock/metric',
                                       params={'symbol': symbol, 'metric': 'all'},
                                       headers={'X-Finnhub-Token': self._api_key})
                values = await asyncio.gather(
                    fetch(f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}',
                          params={'range': '1y', 'interval': '1d'}, headers={'User-Agent': 'HerculesResearch/1.0'}),
                    fundamentals(),
                )
            ttl = self.cache_ttl if all(values) else min(30, self.cache_ttl)
            self._cache[symbol] = (self.clock() + ttl, values)
            self._cache.move_to_end(symbol)
            while len(self._cache) > self.cache_size:
                self._cache.popitem(last=False)
            return deepcopy(values)

    @staticmethod
    def _signal(signals, name, direction, explanation):
        signals.append({'name': name, 'direction': direction, 'explanation': explanation})

    def _technical(self, body, now):
        result = {'status': 'unavailable', 'signals': [], 'metrics': {}}
        signals = result['signals']
        try:
            chart = body['chart']['result'][0]
            timestamps = chart['timestamp']
            closes = chart['indicators']['adjclose'][0]['adjclose']
            if not isinstance(timestamps, list) or not isinstance(closes, list):
                raise ValueError()
            pairs = {}
            for timestamp, close in zip(timestamps[-400:], closes[-400:]):
                timestamp, close = _number(timestamp), _number(close)
                if timestamp is not None and 0 < timestamp <= now + 300 and close is not None and close > 0:
                    pairs[timestamp] = close
            ordered = sorted(pairs.items())
        except (TypeError, KeyError, IndexError, ValueError):
            ordered = []
        if not ordered:
            self._signal(signals, 'missing_prices', 'unknown', 'Adjusted daily price history is unavailable.')
            return result, None
        as_of = _iso(ordered[-1][0])
        prices = [p for _, p in ordered]
        result['metrics'] = {'observations': len(prices), 'adjusted_close': prices[-1]}
        result['status'] = 'partial'
        stale = now - ordered[-1][0] > 5 * 86400
        if stale:
            self._signal(signals, 'stale_prices', 'unknown', 'Latest adjusted daily price is more than five calendar days old.')
        if len(prices) < 50:
            self._signal(signals, 'short_history', 'unknown', 'At least 50 valid daily observations are required for technical research.')
            return result, as_of
        # Ratios and derived values are also checked for overflow before JSON serialization.
        try:
            sma20, sma50 = statistics.mean(prices[-20:]), statistics.mean(prices[-50:])
            changes = [b - a for a, b in zip(prices[-15:-1], prices[-14:])]
            gain = statistics.mean(max(x, 0) for x in changes)
            loss = statistics.mean(max(-x, 0) for x in changes)
            rsi = 100 - 100 / (1 + gain / loss) if loss else (100 if gain else 50)
            returns = [b / a - 1 for a, b in zip(prices[:-1], prices[1:])]
            peak, drawdown = prices[0], 0
            for price in prices:
                peak = max(peak, price)
                drawdown = min(drawdown, price / peak - 1)
            metrics = {'sma20': sma20, 'sma50': sma50, 'rsi14': rsi,
                       'return_20d_pct': (prices[-1] / prices[-21] - 1) * 100,
                       'annualized_volatility_pct': statistics.stdev(returns) * math.sqrt(252) * 100,
                       'max_drawdown_pct': drawdown * 100}
            if any(_number(v) is None for v in metrics.values()):
                raise ValueError()
        except (ValueError, OverflowError, ZeroDivisionError):
            self._signal(signals, 'invalid_prices', 'unknown', 'Price history produced invalid derived indicators.')
            return result, as_of
        result['metrics'].update({k: round(v, 4) for k, v in metrics.items()})
        result['status'] = 'partial' if stale else 'ready'
        trend = prices[-1] > sma20 > sma50
        downtrend = prices[-1] < sma20 < sma50
        self._signal(signals, 'trend', 'positive' if trend else ('negative' if downtrend else 'neutral'),
                     'Price and moving averages indicate an upward trend.' if trend else ('Price and moving averages indicate a downward trend.' if downtrend else 'Moving-average trend is mixed.'))
        self._signal(signals, 'momentum', 'positive' if metrics['return_20d_pct'] > 0 else 'negative', 'Twenty-session return is positive.' if metrics['return_20d_pct'] > 0 else 'Twenty-session return is non-positive.')
        if rsi > 70 or rsi < 30:
            self._signal(signals, 'rsi_extreme', 'negative', 'RSI is outside 30–70; momentum may be stretched, which alone does not predict a reversal.')
        if metrics['annualized_volatility_pct'] > 60 or drawdown < -0.35:
            self._signal(signals, 'price_risk', 'negative', 'Historical volatility or drawdown is elevated.')
        return result, as_of

    def _fundamental(self, body, now):
        result = {'status': 'unavailable', 'as_of': None, 'signals': [], 'metrics': {}}
        signals, metrics = result['signals'], result['metrics']
        raw = body.get('metric') if isinstance(body, dict) else None
        if not isinstance(raw, dict):
            self._signal(signals, 'missing_fundamentals', 'unknown', 'Fundamental data is unavailable.' if self._api_key else 'Finnhub API key is not configured; fundamental data is unavailable.')
            return result
        fields = {'net_margin_ttm_pct': 'netProfitMarginTTM', 'revenue_growth_ttm_yoy_pct': 'revenueGrowthTTMYoy',
                  'eps_growth_ttm_yoy_pct': 'epsGrowthTTMYoy', 'debt_to_equity_annual': 'totalDebt/totalEquityAnnual',
                  'pe_ttm': 'peTTM', 'pb_annual': 'pbAnnual', 'roe_ttm_pct': 'roeTTM'}
        for name, provider_name in fields.items():
            value = _number(raw.get(provider_name))
            if value is not None:
                metrics[name] = value
        if not metrics:
            self._signal(signals, 'empty_fundamentals', 'unknown', 'Provider returned no usable fundamental metrics.')
            return result
        result['status'] = 'partial'
        timestamp = _date(raw.get('asOfDate') or body.get('asOfDate'))
        if timestamp is not None and 0 < timestamp <= now + 86400:
            result['as_of'] = _iso(timestamp)
        fresh = result['as_of'] is not None and now - timestamp <= 180 * 86400
        if not fresh:
            self._signal(signals, 'fundamental_date', 'unknown', 'Fundamental metric observation date is unknown.' if result['as_of'] is None else 'Fundamental metric observation date is more than 180 days old.')
        margin = metrics.get('net_margin_ttm_pct')
        growth = metrics.get('revenue_growth_ttm_yoy_pct', metrics.get('eps_growth_ttm_yoy_pct'))
        debt, pe = metrics.get('debt_to_equity_annual'), metrics.get('pe_ttm')
        for name, value, positive, explanation in (
            ('profitability', margin, margin is not None and margin > 0, 'Reported trailing net margin'),
            ('growth', growth, growth is not None and growth > 0, 'Reported trailing revenue or EPS growth'),
        ):
            if value is not None:
                self._signal(signals, name, 'positive' if positive else 'negative', f'{explanation} is {"positive" if positive else "non-positive"}.')
        if debt is not None and (debt < 0 or debt > 2):
            self._signal(signals, 'leverage', 'negative', 'Reported debt-to-equity ratio is elevated or equity is negative; sector context is required.')
        if pe is not None and (pe <= 0 or pe > 40):
            self._signal(signals, 'valuation', 'negative', 'Reported P/E is non-positive or above 40; earnings quality and sector valuation need review.')
        if margin is None or growth is None or debt is None or pe is None:
            self._signal(signals, 'incomplete_fundamentals', 'unknown', 'Profitability, growth, leverage, or valuation coverage is incomplete.')
        elif fresh:
            result['status'] = 'ready'
        return result
