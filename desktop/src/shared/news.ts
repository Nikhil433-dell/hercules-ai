export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  url: string;
  publishedAt: string;
  tickers: string[];
  eventType?: string;
}

export interface NewsState {
  articles: NewsItem[];
  mode: 'demo' | 'live';
  loading: boolean;
  error: string | null;
  lastChecked: string | null;
}

export interface ElectronAPI {
  getNewsState: () => Promise<NewsState>;
  onNewsState: (callback: (state: NewsState) => void) => () => void;
  setNewsMode: (mode: 'demo' | 'live') => void;
  simulateNews: () => void;
  refreshNews: () => void;
  minimizePanel: () => void;
  expandPanel: () => void;
  quitApp: () => void;
  openExternal: (url: string) => void;
}

declare global {
  interface Window { electronAPI?: ElectronAPI }
}
