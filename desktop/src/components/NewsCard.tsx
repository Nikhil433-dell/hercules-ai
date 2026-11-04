import React from 'react';
import type { NewsItem } from '../shared/news';
import StockQuotes from './StockQuotes';
import './NewsCard.css';
export type { NewsItem } from '../shared/news';

interface NewsCardProps { item: NewsItem; index: number; }

export function timeAgo(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 0) return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NewsCard({ item, index }: NewsCardProps) {
  return (
    <article className="news-card" onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) window.electronAPI?.openArticle(item.id); }} style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}>
      <div className="card-meta"><span className="card-source">{item.source}</span><time className="card-time" dateTime={item.publishedAt || undefined} title={item.publishedAt || 'Publication time unavailable'}>{timeAgo(item.publishedAt)}</time></div>
      {item.eventType && <span className="card-event">{item.eventType}</span>}
      <button className="card-open" onClick={() => window.electronAPI?.openArticle(item.id)} aria-label={`Open story: ${item.title}`}><h3 className="card-title">{item.title}</h3>{item.summary && <p className="card-excerpt">{item.summary}</p>}</button>
      <StockQuotes article={item} />
      <div className="card-actions"><button className="story-button" onClick={() => window.electronAPI?.openArticle(item.id)}>View story</button><button className="article-button" disabled={!/^https?:\/\//i.test(item.url)} onClick={() => window.electronAPI?.openExternal(item.url)}>Read original ↗</button></div>
    </article>
  );
}
