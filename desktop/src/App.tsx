import React, { useEffect, useState } from 'react';
import SidePanel from './components/SidePanel';
import ArticleView from './components/ArticleView';
import NewsPopup from './components/NewsPopup';
import type { WindowView } from './shared/news';

export default function App() {
  const [view, setView] = useState<WindowView | null>(window.electronAPI ? null : { kind: 'panel', article: null });
  useEffect(() => {
    try { document.body.dataset.theme = localStorage.getItem('hercules_panel_theme') === 'light' ? 'light' : 'dark'; }
    catch { document.body.dataset.theme = 'dark'; }
    const api = window.electronAPI;
    if (!api) return;
    let active = true;
    let received = false;
    const unsubscribe = api.onWindowView((next: WindowView) => {
      received = true;
      if (active) setView(next);
    });
    api.getWindowView().then((next: WindowView) => {
      if (active && !received) setView(next);
    }).catch(() => { if (active) setView({ kind: 'panel', article: null }); });
    return () => { active = false; unsubscribe(); };
  }, []);
  if (!view) return null;
  if (view.kind === 'popup') return view.article ? <NewsPopup article={view.article} /> : null;
  if (view.kind === 'article') return <ArticleView article={view.article} />;
  return <SidePanel onMinimize={() => window.electronAPI?.minimizePanel()} />;
}
