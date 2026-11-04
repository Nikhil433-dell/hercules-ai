import React from 'react';
import type { NewsItem, StockQuote } from '../shared/news';

function priceText(quote: StockQuote | undefined): string {
  if (!quote || quote.price === null || !Number.isFinite(quote.price)) return 'Price unavailable';
  const value = quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return quote.currency ? `${value} ${quote.currency}` : `${value} · currency unavailable`;
}

function quoteTime(quote: StockQuote | undefined): string {
  if (!quote || quote.price === null) return '';
  const timestamp = quote.asOf ? new Date(quote.asOf) : null;
  if (!timestamp || !Number.isFinite(timestamp.getTime())) return 'Quote time unavailable';
  return `As of ${timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

export default function StockQuotes({ article, compact = false }: { article: NewsItem; compact?: boolean }) {
  const symbols = Array.from(new Set([...article.tickers, ...(article.quotes || []).map(quote => quote.symbol)]));
  if (symbols.length === 0) return <span className="no-ticker">No related ticker provided</span>;
  return <div className={`stock-quotes ${compact ? 'stock-quotes--compact' : ''}`}>
    {symbols.map(symbol => {
      const quote = article.quotes?.find(candidate => candidate.symbol === symbol);
      return <button className="stock-quote" key={symbol} onClick={event => { event.stopPropagation(); window.electronAPI?.openExternal(`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`); }} title={`View ${symbol} stock on Yahoo Finance`}>
        <span className="quote-line"><strong>{symbol} ↗</strong><span>{priceText(quote)}</span></span>
        {quoteTime(quote) && <span className="quote-time">{quoteTime(quote)}</span>}
      </button>;
    })}
  </div>;
}
