import React from 'react';
import type { NewsItem, StockQuote } from '../shared/news';

function errorText(quote: StockQuote | undefined): string {
  // The backend supplies a short public error, never the provider response or key.
  const message = quote?.error?.replace(/\s+/g, ' ').trim();
  if (!message) return 'Price unavailable';
  if (/FINNHUB_API_KEY|api[_ -]?key|not configured|setup required/i.test(message)) return 'Quote provider needs a connection';
  return message.slice(0, 180);
}

function priceText(quote: StockQuote | undefined): string {
  if (!quote || quote.price === null || !Number.isFinite(quote.price)) {
    const message = errorText(quote);
    return message.length > 52 ? `${message.slice(0, 49)}…` : message;
  }
  const value = quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return quote.currency ? `${value} ${quote.currency}` : `${value} · currency unavailable`;
}

function quoteTime(quote: StockQuote | undefined): string {
  if (!quote || quote.price === null) return '';
  const timestamp = quote.asOf ? new Date(quote.asOf) : null;
  if (!timestamp || !Number.isFinite(timestamp.getTime())) return 'Quote time unavailable';
  return `As of ${timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

export function StockQuoteLink({ symbol, quote, relationship }: {
  symbol: string;
  quote?: StockQuote;
  relationship?: 'direct' | 'indirect';
}) {
  const yahooSymbol = /^BRK\.[AB]$/.test(symbol) ? symbol.replace('.', '-') : symbol;
  const observationTime = quoteTime(quote);
  const provider = quote?.source?.toLowerCase() === 'finnhub' ? 'Finnhub' : undefined;
  return (
    <button
      className="stock-quote"
      onClick={(event) => {
        event.stopPropagation();
        window.electronAPI?.openExternal(`https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/`);
      }}
      title={`${symbol}: ${quote?.price == null ? errorText(quote) : priceText(quote)}. View stock on Yahoo Finance`}
    >
      <span className="quote-line"><strong>{symbol} ↗</strong><span>{priceText(quote)}</span></span>
      {relationship && <span className="quote-relationship">{relationship === 'direct' ? 'Direct exposure' : 'Indirect exposure'}</span>}
      {observationTime && <span className="quote-time">{observationTime}{provider && ` · ${provider}`}</span>}
    </button>
  );
}

export default function StockQuotes({ article, compact = false, excludeSymbols = [], label }: {
  article: NewsItem;
  compact?: boolean;
  excludeSymbols?: string[];
  label?: string;
}) {
  const affected = new Map(article.analysis?.companies.map(({ symbol, relationship }) => [symbol, relationship]));
  const symbols = Array.from(new Set([...affected.keys(), ...article.tickers, ...(article.quotes || []).map((quote) => quote.symbol)]))
    .filter((symbol) => !excludeSymbols.includes(symbol));
  if (symbols.length === 0) {
    if (article.analysis?.unlistedCompanies?.length) return <span className="no-ticker">{article.analysis.unlistedCompanies.map(company => company.name).join(', ')} identified · ticker not verified</span>;
    return excludeSymbols.length > 0 ? null : <span className="no-ticker">No stock identified for this story</span>;
  }
  return (
    <div className={`stock-quotes ${compact ? 'stock-quotes--compact' : ''}`}>
      {label && <span className="quote-list-label">{label}</span>}
      {symbols.map((symbol) => (
        <StockQuoteLink
          key={symbol}
          symbol={symbol}
          quote={article.quotes?.find((quote) => quote.symbol === symbol)}
          relationship={compact ? undefined : affected.get(symbol)}
        />
      ))}
    </div>
  );
}
