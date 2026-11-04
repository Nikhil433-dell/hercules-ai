export interface StockQuote {
  symbol: string;
  price: number | null;
  currency: string | null;
  asOf: string | null;
  error?: string;
  source?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  url: string;
  publishedAt: string;
  tickers: string[];
  quotes: StockQuote[];
  eventType?: string;
}

export interface NewsState {
  articles: NewsItem[];
  category: string;
  loading: boolean;
  error: string | null;
  lastChecked: string | null;
  refreshIntervalSeconds: number;
  quoteStatus?: {
    state: 'ready' | 'setup_required' | 'unavailable';
    message: string;
  };
}

export interface WindowView {
  kind: 'panel' | 'popup' | 'article';
  article: NewsItem | null;
}

export interface ElectronAPI {
  getNewsState: () => Promise<NewsState>;
  onNewsState: (callback: (state: NewsState) => void) => () => void;
  refreshNews: () => void;
  setCategory: (category: string) => void;
  minimizePanel: () => void;
  expandPanel: () => void;
  quitApp: () => void;
  openExternal: (url: string) => void;
  openArticle: (id: string) => void;
  getWindowView: () => Promise<WindowView>;
  onWindowView: (callback: (view: WindowView) => void) => () => void;
}

declare global {
  interface Window { electronAPI?: ElectronAPI }
}
