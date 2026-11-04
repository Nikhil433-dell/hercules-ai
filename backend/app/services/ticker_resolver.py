"""Conservative headline/description symbol resolution for 15 US issuers.

Issuer/symbol pairs verified 2026-11-04 against the SEC's current registry:
https://www.sec.gov/files/company_tickers.json
This small reviewed alias list is intentionally not universal company coverage.
Alphabet resolves to Class A GOOGL; provider-supplied GOOG is preserved instead.
Names and explicit ticker syntax indicate mentions, not predicted price impact.
"""
import re

# Prefer canonical issuer names or distinctive corporate brands. Ordinary-word
# brands are handled separately with nearby financial context and exclusions.
ISSUERS = (
    ('MSFT', r'Microsoft(?: Corporation| Corp\.?)?'),
    ('NVDA', r'NVIDIA(?: Corporation| Corp\.?)?'),
    ('TSLA', r'Tesla(?:,? Inc\.?)?'),
    ('NFLX', r'Netflix(?:,? Inc\.?)?'),
    ('AMD', r'Advanced Micro Devices(?:,? Inc\.?)?'),
    ('INTC', r'Intel(?: Corporation| Corp\.?)?'),
    ('JPM', r'JPMorgan(?: Chase)?(?: & Co\.?)?'),
    ('BAC', r'Bank of America(?: Corporation| Corp\.?)?'),
    ('WMT', r'Walmart(?:,? Inc\.?)?'),
    ('DIS', r'(?:The )?Walt Disney(?: Company| Co\.?)?'),
    ('BA', r'Boeing(?: Company| Co\.?)?'),
    ('AAPL', r'Apple Inc\.?'),
    ('GOOGL', r'Alphabet Inc\.?'),
    ('META', r'Meta Platforms(?:,? Inc\.?)?'),
    ('AMZN', r'Amazon\.com(?:,? Inc\.?)?'),
)
FINANCE_CONTEXT = re.compile(
    r'\b(?:shares?|stocks?|earnings|revenue|profits?|dividends?|guidance|'
    r'Nasdaq|NYSE|Wall Street|investors?|buyback|market cap|quarterly results)\b', re.I,
)
AMBIGUOUS = (
    ('AAPL', 'Apple', r'\b(?:fruit|orchards?|crops?|juice|pies?|harvest|growers?)\b'),
    ('AMZN', 'Amazon', r'\b(?:rain\s?forest|river|basin|jungle|deforestation)\b'),
    ('META', 'Meta', r'\b(?:analysis|analyses|study|studies|methodology)\b'),
    ('GOOGL', 'Alphabet', r'\b(?:letters?|spelling|literacy|phonetic|soup|general alphabet)\b'),
)
PRODUCT_CONTEXT = {
    'AAPL': re.compile(r'\b(?:iPhone|iPad|Mac|MacBook|iMac|Apple Watch|App Store)\b'),
    'AMZN': re.compile(r'\b(?:AWS|Amazon Web Services)\b'),
}
EXPLICIT_SYMBOL = re.compile(
    r'(?<![\w$])(?:\$|(?:NASDAQ|NYSE):\s*)([A-Z](?:[A-Z0-9.-]{0,8}[A-Z0-9])?)(?![\w-]|\.[A-Z])'
)


def symbols_from_provider(value):
    values = value.split(',') if isinstance(value, str) else value if isinstance(value, list) else []
    return list(dict.fromkeys(
        symbol.strip() for symbol in values
        if isinstance(symbol, str) and re.fullmatch(r'[A-Z][A-Z0-9.:-]{0,19}', symbol.strip())
    ))[:10]


def resolve_tickers(title='', description='', provider_tickers=None):
    """Prefer provider symbols; otherwise return explicit symbols and known names.

    Text matching uses only headline/description. Explicit legal names ignore
    case; ambiguous brands require normal capitalization plus financial terms
    in a small local window. Conservative omissions are expected.
    """
    supplied = symbols_from_provider(provider_tickers)
    if supplied:
        return supplied
    fields = [text for text in (title, description) if isinstance(text, str)]
    resolved = []
    for text in fields:
        matches = []
        matches.extend((match.start(), match.group(1)) for match in EXPLICIT_SYMBOL.finditer(text))
        for symbol, alias in ISSUERS:
            # Intel as an ordinary word means intelligence; require brand casing.
            flags = 0 if symbol in ('INTC', 'TSLA') else re.I
            for match in re.finditer(r'(?<![\w-])(?:' + alias + r')(?![\w-])', text, flags):
                if symbol == 'TSLA' and re.search(
                    r'\b(?:Nikola Tesla|Tesla coils?|tesla magnetic|teslas? units?)\b',
                    text[max(0, match.start()-30):match.end()+30], re.I,
                ):
                    continue
                matches.append((match.start(), symbol))
        for symbol, brand, exclusion in AMBIGUOUS:
            for match in re.finditer(r'(?<![\w-])' + brand + r'(?![\w-])', text):
                context = text[max(0, match.start()-60):match.end()+60]
                product = PRODUCT_CONTEXT.get(symbol)
                corporate_context = FINANCE_CONTEXT.search(context) or (product and product.search(context))
                if corporate_context and not re.search(exclusion, context, re.I):
                    matches.append((match.start(), symbol))
        # Keep headline mentions ahead of description mentions.
        matches.sort(key=lambda item: item[0])
        resolved.extend(symbol for _, symbol in matches)
    return list(dict.fromkeys(resolved))[:10]
