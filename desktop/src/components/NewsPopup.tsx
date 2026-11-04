import React, { useEffect, useState } from 'react';
import type { NewsItem } from '../shared/news';
import StockQuotes from './StockQuotes';
import './NewsCard.css';
import './ArticleView.css';

export default function NewsPopup({ article, expiresAt }: { article: NewsItem; expiresAt?: number }) {
  const [secondsLeft, setSecondsLeft] = useState(10);
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(() => {
      update();
      if (Date.now() >= expiresAt) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const open = () => window.electronAPI?.openArticle(article.id);
  return <main className="news-popup" onClick={open} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } }} role="button" tabIndex={0} aria-label={`Open breaking news: ${article.title}`}>
    <div className="popup-meta"><span className="popup-brand">H<span>ercules</span></span><span className="popup-source">{article.source}</span><button className="popup-dismiss" aria-label="Dismiss news alert" title="Dismiss" onClick={event => { event.stopPropagation(); window.electronAPI?.minimizePanel(); }}>×</button></div>
    <h2>{article.title}</h2>
    <StockQuotes article={article} compact />
    <div className="popup-countdown" aria-label={`Closes in ${secondsLeft} seconds`}><span>Click to read</span><span>{secondsLeft}s</span></div>
  </main>;
}
