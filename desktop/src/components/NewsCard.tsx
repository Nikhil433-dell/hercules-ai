import React, { useState } from 'react';
import './NewsCard.css';

export interface NewsItem {
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

  const handleOpenArticle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.url && item.url !== '#') {
      (window as any).electronAPI?.openExternal(item.url);
    }
  };

  return (
    <div
      className="news-card"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="card-body">
        {/* Meta row */}
        <div className="card-meta">
          <span className="card-cat-pill">{item.category}</span>
          <span className="card-source">{item.source}</span>
          <span className="card-time">{timeAgo(item.publishedAt)}</span>
        </div>

        {/* Title */}
        <h3 className="card-title" onClick={() => setExpanded(!expanded)}>
          {item.title}
        </h3>

        {/* Drop Toggle Header */}
        <div className="card-drop-bar" onClick={() => setExpanded(!expanded)}>
          <span className="drop-label">{expanded ? 'Collapse Summary ▲' : 'AI Summary Drop ▼'}</span>
          <span className="read-time-tag">{item.readTime} min read</span>
        </div>

        {/* Expandable Drop Container */}
        <div className={`card-summary-drop ${expanded ? 'card-summary-drop--open' : ''}`}>
          <div className="summary-content-inner">
            <p className="summary-text">{item.summary}</p>
            
            <div className="summary-drop-actions">
              <button
                className={`card-btn card-btn--save ${saved ? 'saved' : ''}`}
                onClick={() => setSaved(!saved)}
                title={saved ? 'Saved for later' : 'Save article'}
              >
                {saved ? '★ Saved' : '☆ Bookmark'}
              </button>

              <button
                className="card-btn card-btn--external"
                onClick={handleOpenArticle}
                title={`Open exact link on ${item.source} in Chrome`}
              >
                Read Full Story on {item.source} ↗
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
