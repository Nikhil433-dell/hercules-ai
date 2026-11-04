import React, { useState, useEffect } from 'react';
import NewsCard from './NewsCard';
import type { NewsState } from '../shared/news';
import './SidePanel.css';

interface SidePanelProps { onMinimize: () => void; }

const INITIAL_STATE: NewsState = {
  articles: [], category: 'business', loading: true, error: null, lastChecked: null, refreshIntervalSeconds: 60,
};

function loadTheme(): 'light' | 'dark' {
  try {
    return localStorage.getItem('hercules_panel_theme') === 'light' ? 'light' : 'dark';
  } catch { return 'dark'; }
}

export default function SidePanel({ onMinimize }: SidePanelProps) {
  const [feed, setFeed] = useState<NewsState>(INITIAL_STATE);
  const [theme, setTheme] = useState(loadTheme);
  const [actionError, setActionError] = useState<string | null>(null);
  const api = window.electronAPI;

  useEffect(() => {
    document.body.dataset.theme = theme;
    try {
      localStorage.setItem('hercules_panel_theme', theme);
      const saved = JSON.parse(localStorage.getItem('hercules_user_settings') || '{}');
      localStorage.setItem('hercules_user_settings', JSON.stringify({ ...saved, theme }));
    } catch { /* Theme still works when local storage is unavailable. */ }
  }, [theme]);

  useEffect(() => {
    if (!api?.getNewsState) {
      setFeed({ ...INITIAL_STATE, loading: false, error: 'Open Hercules in the desktop app to connect to its news monitor.' });
      return;
    }
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = api.onNewsState((state: NewsState) => {
      receivedUpdate = true;
      if (active) setFeed(state);
    });
    api.getNewsState().then((state: NewsState) => {
      if (active && !receivedUpdate) setFeed(state);
    }).catch(() => {
      if (active) setFeed({ ...INITIAL_STATE, loading: false, error: 'Could not connect to the desktop news monitor. Restart Hercules to reconnect.' });
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  const perform = async (action: () => unknown) => {
    setActionError(null);
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'The action could not be completed.'); }
  };
  const checkedAt = feed.lastChecked ? new Date(feed.lastChecked) : null;
  const lastChecked = checkedAt && Number.isFinite(checkedAt.getTime())
    ? `Checked ${checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Waiting for first check';

  return (
    <main className="panel-root panel-visible">
      <header className="panel-header">
        <div className="panel-brand">
          <div className="logo-badge" aria-hidden="true">H</div>
          <div><h1 aria-label="Hercules">ercules</h1><p>Market news, within reach</p></div>
        </div>
        <div className="panel-header-actions">
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? '☀' : '☾'}</button>
          <button className="icon-btn minimize-btn" onClick={onMinimize} title="Hide to menu bar" aria-label="Hide to menu bar">—</button>
          <button className="icon-btn" onClick={() => api?.quitApp()} title="Quit Hercules" aria-label="Quit Hercules">×</button>
        </div>
      </header>
      <section className="feed-controls" aria-label="News controls">
        <label className="category-select-label"><span className="sr-only">News category</span>
          <select aria-label="News category" value={feed.category} disabled={!api || feed.loading} onChange={(event) => perform(() => api?.setCategory(event.target.value))}>
            <option value="business">Finance & business</option>
            <option value="technology">Technology</option>
            <option value="general">Top headlines</option>
            <option value="world">World</option>
            <option value="science">Science</option>
            <option value="health">Health</option>
            <option value="sports">Sports</option>
            <option value="entertainment">Entertainment</option>
          </select>
        </label>
        <button className="text-button" disabled={!api || feed.loading} onClick={() => perform(() => api?.refreshNews())}>{feed.loading ? 'Checking…' : 'Refresh ↻'}</button>
      </section>
      <div className="live-status"><span className={`live-dot ${feed.error ? 'live-dot--error' : ''}`} /><span>{feed.error ? 'Connection needs attention' : feed.loading ? 'Checking live headlines' : 'Live headlines'}</span><span className="refresh-cadence">Every {Math.max(1, Math.round(feed.refreshIntervalSeconds / 60))} min</span></div>
      <div className="feed-heading"><h2>Latest stories</h2><span>{feed.articles.length} stories</span></div>
      <div className="news-feed" aria-label="News stories" aria-busy={feed.loading}>
        {(feed.error || actionError) && <div className="feed-error" role="alert">{actionError || feed.error}</div>}
        {feed.loading && feed.articles.length === 0 ? <div className="empty-state" role="status">Checking for news…</div>
          : feed.articles.length === 0 ? <div className="empty-state"><strong>No stories yet</strong><p>Check that the backend is running with a valid news API key, then refresh.</p></div>
          : feed.articles.map((article, index) => <NewsCard key={article.id} item={article} index={index} />)}
      </div>
      <footer className="panel-footer"><span role="status">{lastChecked}</span><span>Alerts stay on when hidden</span></footer>
    </main>
  );
}
