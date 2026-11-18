"""Resolve grounded issuer names to unambiguous U.S. listing symbols."""

import csv
import re
import unicodedata
from collections import defaultdict

from app.services.ticker_resolver import ISSUERS, AMBIGUOUS, resolve_tickers


_SHARE_CLASS = re.compile(r"\s+(?:class|cl)\s+[a-z]$")
_COMPANY_SUFFIX = re.compile(r"\s+(?:incorporated|inc|corporation|corp|company|co|limited|ltd|plc)$")
_US_SYMBOL = re.compile(r"[A-Z][A-Z0-9]{0,7}(?:\.[A-Z])?")
_WORD = re.compile(r"[^\W_]+")
_REVIEWED_SYMBOLS = {symbol for symbol, *_ in (*ISSUERS, *AMBIGUOUS)}
_EQUITY_SUFFIX = re.compile(
    r"\s+(?:new\s+)?(?:common stock|common shares|ordinary shares|capital stock|"
    r"subordinate voting shares|american depositary shares|american depositary receipts)$",
)


def _words(text):
    return " ".join(_WORD.findall(unicodedata.normalize("NFKC", text).casefold()))


def _company_key(text):
    key = _words(text)
    while True:
        shortened = _COMPANY_SUFFIX.sub("", _SHARE_CLASS.sub("", _EQUITY_SUFFIX.sub("", key)))
        if shortened == key:
            return key
        key = shortened


class CompanyDirectory:
    def __init__(self, listings=()):
        self._symbols = defaultdict(set)
        self._listed_symbols = set()
        for name, symbol in listings:
            if _US_SYMBOL.fullmatch(symbol):
                self._symbols[_company_key(name)].add(symbol)
                self._listed_symbols.add(symbol)

    def __bool__(self):
        return bool(self._symbols)

    @classmethod
    def from_nasdaq_files(cls, files):
        """Read Nasdaq Trader's Nasdaq-listed and other exchange-listed directories."""
        listings = []
        for content in files:
            for row in csv.DictReader(content.splitlines(), delimiter="|"):
                symbol = row.get("Symbol") or row.get("ACT Symbol")
                name = row.get("Security Name") or ""
                if (symbol and row.get("Test Issue") == "N" and row.get("ETF") == "N"
                        and _EQUITY_SUFFIX.search(_words(name))):
                    listings.append((name, symbol))
        return cls(listings)

    def mentioned_symbols(self, *fields):
        """Find explicit source mentions without assigning market impact."""
        matches = {}
        for field in fields:
            if not isinstance(field, str):
                continue
            text = field[:2000]
            for symbol in resolve_tickers(text):
                if symbol in self._listed_symbols or symbol in _REVIEWED_SYMBOLS:
                    matches[symbol] = None

            # Short ordinary names such as "Target" need reviewed context rules.
            # For the full directory, require a capitalized multiword issuer name.
            for sentence in re.split(r"(?<=[.!?])\s+|[;!?\n]", text):
                words = _WORD.findall(unicodedata.normalize("NFKC", sentence))
                for start, word in enumerate(words):
                    if not word[0].isupper():
                        continue
                    for end in range(min(len(words), start + 8), start + 1, -1):
                        key = _COMPANY_SUFFIX.sub("", " ".join(words[start:end]).casefold())
                        symbols = self._symbols.get(key)
                        if symbols:
                            if len(symbols) == 1:
                                matches[next(iter(symbols))] = None
                            break
        return list(matches)

    def resolve(self, name, evidence):
        key = _company_key(name)
        if not key:
            return None
        candidates = self._symbols.get(key, set())
        if len(candidates) == 1 and f" {key} " in f" {_words(evidence)} ":
            return next(iter(candidates))
        if len(candidates) > 1:
            # Different share classes can share an issuer name.
            tagged = [symbol for symbol in candidates if re.search(
                rf"(?<!\w)(?:\$|(?:NYSE|NASDAQ):\s*){re.escape(symbol)}(?![\w.])", evidence,
            )]
            return tagged[0] if len(tagged) == 1 else None
        # Reuse the small reviewed fallback for provider outages and known aliases.
        for symbol, pattern in ISSUERS:
            if re.fullmatch(pattern, name, re.I) and re.search(rf"(?<!\w){pattern}(?!\w)", evidence, re.I):
                return symbol
        for symbol, alias, _ in AMBIGUOUS:
            if key == alias.casefold() and symbol in resolve_tickers(evidence):
                return symbol
        return None
