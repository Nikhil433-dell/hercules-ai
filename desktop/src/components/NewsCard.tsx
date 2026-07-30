import React, { useState } from 'react';
import './NewsCard.css';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  url: string;
  publishedAt: string;
  readTime: number;
}

interface NewsCardProps {
  item: NewsItem;
  index: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Tech: '#6366f1',
  Finance: '#10b981',
  World: '#f59e0b',
  Sports: '#ef4444',
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NewsCard({ item, index }: NewsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  const accentColor = CATEGORY_COLORS[item.category] ?? '#818cf8';

  return (
    <div
      className="news-card"
      style={{
        animationDelay: `${index * 80}ms`,
        '--accent': accentColor,
      } as React.CSSProperties}
    >
      {/* Category accent bar */}
      <div className="card-accent-bar" style={{ background: accentColor }} />

      <div className="card-body">
        {/* Meta row */}
        <div className="card-meta">
          <span className="card-cat-pill" style={{ color: accentColor, borderColor: accentColor }}>
            {item.category}
          </span>
          <span className="card-source">{item.source}</span>
          <span className="card-time">{timeAgo(item.publishedAt)}</span>
        </div>

        {/* Title */}
        <h3 className="card-title" onClick={() => setExpanded(!expanded)}>
          {item.title}
        </h3>

        {/* Summary (expandable) */}
        <div className={`card-summary ${expanded ? 'card-summary--expanded' : ''}`}>
          <p>{item.summary}</p>
        </div>

        {/* Actions */}
        <div className="card-actions">
          <button className="card-btn card-btn--expand" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less ▲' : 'Read more ▼'}
          </button>
          <div className="card-right-actions">
            <button
              className={`card-btn card-btn--save ${saved ? 'saved' : ''}`}
              onClick={() => setSaved(!saved)}
              title={saved ? 'Saved' : 'Save article'}
            >
              {saved ? '★' : '☆'}
            </button>
            <a
              className="card-btn card-btn--link"
              href={item.url}
              target="_blank"
              rel="noreferrer"
              title="Open article"
            >
              ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
