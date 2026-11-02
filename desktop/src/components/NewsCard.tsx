import React, { useState } from 'react';
import type { NewsItem } from '../shared/news';
import './NewsCard.css';
export type { NewsItem } from '../shared/news';

interface NewsCardProps { item: NewsItem; index: number; }

function timeAgo(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 0) return 'Scheduled';
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NewsCard({ item, index }: NewsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const open = (url: string) => window.electronAPI?.openExternal(url);
  const summaryId = `summary-${index}`;
  return (
    <article className="news-card" style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}>
      <div className="card-meta"><span className="card-source">{item.source}</span><time className="card-time" dateTime={item.publishedAt || undefined} title={item.publishedAt || 'Publication time unavailable'}>{timeAgo(item.publishedAt)}</time></div>
      {item.eventType && <span className="card-event">{item.eventType}</span>}
      <h3 className="card-title">{item.title}</h3>
      {item.summary && <><button className="summary-toggle" aria-expanded={expanded} aria-controls={summaryId} onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide details −' : 'Story details +'}</button>{expanded && <p id={summaryId} className="summary-text">{item.summary}</p>}</>}
      <div className="card-actions">
        <div className="ticker-links">{item.tickers.map((ticker) => <button key={ticker} className="ticker-button" onClick={() => open(`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`)} title={`View ${ticker} stock on Yahoo Finance`}>{ticker} ↗</button>)}{item.tickers.length === 0 && <span className="no-ticker">Ticker not provided</span>}</div>
        <button className="article-button" disabled={!/^https?:\/\//i.test(item.url)} onClick={() => open(item.url)}>Read article ↗</button>
      </div>
    </article>
  );
}
