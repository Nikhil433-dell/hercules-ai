export interface StockQuote {
  symbol: string;
  price: number | null;
  currency: string | null;
  asOf: string | null;
  error?: string;
  source?: string;
}

export type AnalysisStatus = 'disabled' | 'pending' | 'ready' | 'unavailable';
export type ArticleAnalysisStatus = AnalysisStatus | 'expired';

export interface NewsAnalysis {
  eventId: string;
  eventType: string;
  relevance: 'high' | 'medium' | 'low';
  whyItMatters: string;
  evidence?: string;
  evidenceScope?: 'provider_text' | 'provider_snippet';
  alertEligible: boolean;
  unlistedCompanies?: Array<{
    name: string;
    evidence: string;
    connection?: string;
    direction: string;
    listingMessage: string;
  }>;
  companies: Array<{
    symbol: string;
    name: string;
    relationship: 'direct' | 'indirect';
    evidence: string;
    connection?: string;
    direction?: 'positive' | 'negative' | 'mixed' | 'neutral' | 'uncertain';
    impactScore?: number;
    confidence?: 'low' | 'medium' | 'high';
    risks?: string[];
    horizon?: 'short_term' | 'medium_term' | 'long_term' | 'uncertain';
  }>;
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
  analysis?: NewsAnalysis;
  curationStatus?: 'selected' | 'fallback';
}

export interface NewsState {
  articles: NewsItem[];
  category: string;
  loading: boolean;
  error: string | null;
  lastChecked: string | null;
  refreshIntervalSeconds: number;
  analysisStatus?: AnalysisStatus;
  analysisMessage?: string;
  quoteStatus?: {
    state: 'ready' | 'setup_required' | 'unavailable';
    message: string;
  };
}

export interface WindowView {
  kind: 'panel' | 'popup' | 'article';
  article: NewsItem | null;
  expiresAt?: number;
  articleAnalysisStatus?: ArticleAnalysisStatus;
}

export interface StockResearch {
  model?: string;
  modelStatus?: string;
  factors?: Array<{ interpretation: string; evidenceFields: string[] }>;
  symbol: string;
  status: 'ready' | 'partial' | 'unavailable';
  assessedAt: string | null;
  quoteAsOf: string | null;
  technical: ResearchSection;
  fundamental: ResearchSection;
  stance: 'research_candidate' | 'watch' | 'avoid' | 'insufficient_data';
  reasons: string[];
  risks: string[];
  methodology: string;
  sources: Array<{ name: string; url: string }>;
  history?: { observations: number; eventCounts: Record<string, number>; note: string };
}
export interface ResearchSection {
  status: string;
  asOf?: string | null;
  signals: string[];
  metrics: Record<string, string | number | null>;
}
export type StockResearchResult = { research: StockResearch; error?: never } | { error: string; research?: never };

export interface DossierStory {
  title: string;
  source: string;
  url: string;
  published_at: string;
  event_type: string;
  evidence: string;
  direction: string;
}
export interface CompanyDossier {
  impact_channel: string;
  symbol: string;
  anchor: string | null;
  excerpt: string;
  figures: string[];
  history_available: boolean;
  recent_count: number;
  baseline_count: number;
  negative_share_change: number | null;
  recurring: Array<{ type: string; count: number }>;
  connections: Array<{ from: string; to: string; count: number; mechanism: string; evidence: string; source: DossierStory }>;
  timeline: DossierStory[];
}

export interface ElectronAPI {
  getCompanyDossier: (url: string, symbol: string) => Promise<{ dossier?: CompanyDossier; error?: string }>;
  researchStock: (url: string, symbol: string) => Promise<StockResearchResult>;
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
