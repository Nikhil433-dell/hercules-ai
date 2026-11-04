import React from 'react';
import type { NewsItem } from '../shared/news';
import StockQuotes from './StockQuotes';
import './NewsCard.css';
import './ArticleView.css';

export default function ArticleView({ article }: { article: NewsItem | null }) {
  const timestamp = article?.publishedAt ? new Date(article.publishedAt) : null;
  return <main className="article-root">
    <header className="article-header"><button onClick={() => window.electronAPI?.expandPanel()}>‹ All news</button><button aria-label="Close story" onClick={() => window.electronAPI?.minimizePanel()}>×</button></header>
    {article ? <><div className="article-scroll"><div className="article-source">{article.source}</div><h1>{article.title}</h1><p className="article-published">{timestamp && Number.isFinite(timestamp.getTime()) ? `Published ${timestamp.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Publication time unavailable'}</p><StockQuotes article={article} /><p className="article-description">{article.summary || 'This source did not provide an article description. Open the original story to read more.'}</p><p className="article-caption">Description supplied by the news source. Stock quotes may be delayed.</p></div><footer className="article-footer"><button className="article-original" disabled={!/^https?:\/\//i.test(article.url)} onClick={() => window.electronAPI?.openExternal(article.url)}>Read original article ↗</button></footer></> : <div className="empty-state">This story is no longer available. Open all news to choose another story.</div>}
  </main>;
}
