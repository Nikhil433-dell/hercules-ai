import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import type { NewsState, WindowView } from '../src/shared/news';
import { parseDossier, parseStockResearch } from '../src/shared/research';
import '../src/index.css';
import '../src/components/SidePanel.css';
import './stage.css';

interface RecordingData {
  articles: NewsState['articles'];
  symbol: string;
  captured: string;
  dossier: unknown;
  research: unknown;
}

export function boot(data: RecordingData) {
  const dossier = parseDossier(data.dossier, data.symbol);
  const research = parseStockResearch(data.research, data.symbol);
  const story = data.articles.find(item => item.analysis?.companies.some(company => company.symbol === data.symbol));
  if (!dossier || !research || !story) throw new Error('A verified story, dossier and assessment are required');
  const product = document.getElementById('product')!;
  const listeners = new Set<(next: WindowView) => void>();
  let view: WindowView = { kind: 'panel', article: null };
  const show = (next: WindowView) => {
    view = next;
    product.dataset.view = next.kind;
    product.hidden = false;
    listeners.forEach(listener => listener(next));
  };
  const hide = () => { product.hidden = true; };
  const panel = () => show({ kind: 'panel', article: null });
  const unsupported = () => { throw new Error('Action outside the captured session'); };
  window.electronAPI = {
    getNewsState: async () => ({ articles: data.articles, category: 'business', loading: false, error: null,
      analysisStatus: 'ready', lastChecked: data.captured, refreshIntervalSeconds: 60 }),
    onNewsState: () => () => {},
    getWindowView: async () => view,
    onWindowView: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    openArticle: id => {
      const article = data.articles.find(item => item.id === id);
      if (article) show({ kind: 'article', article, articleAnalysisStatus: 'ready' });
    },
    getCompanyDossier: async (url, symbol) => url === story.url && symbol === data.symbol ? { dossier } : { error: 'No saved dossier' },
    researchStock: async (url, symbol) => url === story.url && symbol === data.symbol ? { research } : { error: 'No saved assessment' },
    expandPanel: panel, minimizePanel: hide, quitApp: hide,
    setCategory: unsupported, refreshNews: unsupported, openExternal: unsupported,
  };
  document.getElementById('tray')!.addEventListener('click', () => product.hidden ? panel() : hide());
  localStorage.setItem('hercules_panel_theme', 'dark');
  createRoot(document.getElementById('root')!).render(<App />);
  return {
    storyTitle: story.title, panel,
    popup: () => show({ kind: 'popup', article: story, expiresAt: Date.now() + 10000 }),
  };
}
Object.assign(window, { boot });
