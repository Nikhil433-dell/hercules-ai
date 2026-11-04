"""Conservative issuer mentions: positive matches and ordinary-word exclusions."""
import pytest
from app.services.ticker_resolver import resolve_tickers


@pytest.mark.parametrize('text,symbol', [
    ('Microsoft earnings rise', 'MSFT'), ('Nvidia unveils chip', 'NVDA'),
    ('Tesla deliveries fall', 'TSLA'), ('Netflix announces results', 'NFLX'),
    ('Advanced Micro Devices raises guidance', 'AMD'), ('Intel Corp. reports earnings', 'INTC'),
    ('JPMorgan Chase dividend increases', 'JPM'), ('Bank of America releases report', 'BAC'),
    ('Walmart announces expansion', 'WMT'), ('Walt Disney cuts costs', 'DIS'),
    ('Boeing production changes', 'BA'), ('Apple Inc. launches a device', 'AAPL'),
    ('Alphabet Inc. investor update', 'GOOGL'), ('Meta Platforms launches app', 'META'),
    ('Amazon.com sales jump', 'AMZN'), ('Apple shares climb', 'AAPL'),
    ('Amazon quarterly earnings', 'AMZN'), ('Meta revenue grows', 'META'),
    ('Alphabet stock moves', 'GOOGL'),
    ('Apple launches iPhone', 'AAPL'), ('Apple refreshes MacBook', 'AAPL'), ('Apple updates Mac', 'AAPL'),
    ('Amazon adds AWS cloud service', 'AMZN'),
])
def test_supported_issuer_mentions(text, symbol):
    assert resolve_tickers(text) == [symbol]


@pytest.mark.parametrize('text', [
    'Apple fruit prices rise after a bad harvest',
    'Apple growers sell stock of apple juice',
    'Amazon rainforest preservation funding',
    'Amazon river stocks of fish are falling',
    'Meta-analysis of stock market studies',
    'A meta-analysis suggests a new treatment',
    'Learn the general alphabet',
    'Alphabet letters teach financial literacy',
    'Alphabet soup in the stock market',
    'Pineapple exports grow', 'Microsoftian is a made-up adjective',
    'intel from a confidential source',
    'A tesla magnetic field is an SI measurement', 'A Tesla coil demonstration',
    'Nikola Tesla invented electrical devices',
])
def test_ordinary_words_do_not_become_stock_mentions(text):
    assert resolve_tickers(text) == []


def test_explicit_symbols_case_boundaries_and_punctuation():
    assert resolve_tickers('Watch $AAPL. NASDAQ:MSFT and NYSE:BRK.B') == ['AAPL', 'MSFT', 'BRK.B']
    assert resolve_tickers('AAPL plain text, $aapl lowercase, and $100 cash') == []


def test_source_symbols_override_name_resolution_and_preserve_share_class():
    assert resolve_tickers('Alphabet Inc. results', provider_tickers=['GOOG', 'GOOG']) == ['GOOG']
    assert resolve_tickers('Microsoft news', provider_tickers=['not a symbol']) == ['MSFT']


def test_headline_precedes_description_and_ambiguity_context_stays_local():
    assert resolve_tickers('Tesla', 'Microsoft has news') == ['TSLA', 'MSFT']
    assert resolve_tickers('Apple', 'Shares of another company rise') == []
    assert resolve_tickers('', 'Microsoft says earnings rose') == ['MSFT']
