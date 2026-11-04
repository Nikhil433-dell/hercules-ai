import { createHash } from 'crypto';
import type { NewsItem, NewsState, StockQuote } from '../shared/news';

export const NEWS_CATEGORIES = ['business', 'general', 'technology', 'science', 'health', 'sports', 'entertainment', 'world'];
const REFRESH_SECONDS = 60;

export interface MonitorStorage {
  category?: string;
  seen?: string[];
}
interface Dependencies {
  load: () => MonitorStorage;
  save: (value: MonitorStorage) => void;
  fetchHeadlines: (category: string) => Promise<unknown>;
  onState: (state: NewsState) => void;
  onArticle: (article: NewsItem) => void;
}

function parseQuote(value: unknown): StockQuote | null {
  if (!value || typeof value !== 'object') return null;
  const quote = value as Record<string, unknown>;
  if (typeof quote.symbol !== 'string') return null;
  return {
    symbol: quote.symbol,
    price: typeof quote.price === 'number' && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null,
    currency: typeof quote.currency === 'string' ? quote.currency : null,
    asOf: typeof quote.as_of === 'string' ? quote.as_of : typeof quote.asOf === 'string' ? quote.asOf : null,
    error: typeof quote.error === 'string' ? quote.error : undefined,
    source: typeof quote.source === 'string' ? quote.source : undefined,
  };
}

function parseQuoteStatus(payload: unknown): NewsState['quoteStatus'] {
  const status = (payload as { quote_status?: unknown })?.quote_status;
  if (!status || typeof status !== 'object') return undefined;
  const value = status as Record<string, unknown>;
  if (!['ready', 'setup_required', 'unavailable'].includes(value.state as string) || typeof value.message !== 'string') return undefined;
  return { state: value.state as 'ready' | 'setup_required' | 'unavailable', message: value.message };
}

export function normalizeHeadlines(payload: unknown): NewsItem[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { articles?: unknown }).articles)) {
    throw new Error('The backend returned an invalid news response.');
  }
  const articles = (payload as { articles: Record<string, unknown>[] }).articles;
  const normalized = articles.filter((article) => {
    if (!article || typeof article.title !== 'string' || typeof article.url !== 'string') return false;
    try { return ['https:', 'http:'].includes(new URL(article.url).protocol); } catch { return false; }
  })
    .map((article) => {
      const url = new URL(article.url as string);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The backend returned an unsupported article link.');
      url.hash = '';
      Array.from(url.searchParams.keys()).forEach((key) => {
        if (key.startsWith('utm_')) url.searchParams.delete(key);
      });
      url.searchParams.sort();
      const published = typeof article.published_at === 'string' && Number.isFinite(Date.parse(article.published_at))
        ? new Date(article.published_at).toISOString() : '';
      return {
        id: createHash('sha256').update(url.toString()).digest('hex'),
        title: article.title as string,
        summary: typeof article.description === 'string' ? article.description : typeof article.summary === 'string' ? article.summary : '',
        source: typeof article.source === 'string' ? article.source : 'Unknown source',
        category: typeof article.category === 'string' ? article.category : 'business',
        url: article.url as string,
        publishedAt: published,
        tickers: Array.isArray(article.tickers)
          ? article.tickers.filter((ticker): ticker is string => typeof ticker === 'string' && /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) : [],
        quotes: Array.isArray(article.quotes) ? article.quotes.map(parseQuote).filter((quote): quote is StockQuote => quote !== null) : [],
        eventType: typeof article.event_type === 'string' ? article.event_type : undefined,
      };
    });
  return Array.from(new Map(normalized.map((article) => [article.id, article])).values())
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}

export class NewsMonitor {
  private state: NewsState;
  private seen: Set<string>;
  private initialized = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private inFlightGeneration: number | null = null;

  constructor(private dependencies: Dependencies) {
    const loaded = dependencies.load();
    const stored = loaded && typeof loaded === 'object' ? loaded : {};
    this.seen = new Set(Array.isArray(stored.seen) ? stored.seen.filter((id): id is string => typeof id === 'string') : []);
    this.state = {
      category: typeof stored.category === 'string' && NEWS_CATEGORIES.includes(stored.category) ? stored.category : 'business',
      articles: [], loading: false, error: null, lastChecked: null, refreshIntervalSeconds: REFRESH_SECONDS,
    };
  }

  getState(): NewsState { return this.state; }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, REFRESH_SECONDS * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.generation += 1;
  }

  setCategory(category: string): void {
    if (!NEWS_CATEGORIES.includes(category) || category === this.state.category) return;
    this.generation += 1;
    this.initialized = false;
    this.state = { ...this.state, category, articles: [], loading: false, error: null, lastChecked: null, quoteStatus: undefined };
    this.persist();
    this.emit();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const generation = this.generation;
    if (this.inFlightGeneration === generation) return;
    this.inFlightGeneration = generation;
    this.state = { ...this.state, loading: true, error: null };
    this.emit();
    try {
      const payload = await this.dependencies.fetchHeadlines(this.state.category);
      const articles = normalizeHeadlines(payload);
      if (generation !== this.generation) return;
      const fresh = articles.filter((article) => !this.seen.has(article.id));
      const shouldNotify = this.initialized;
      articles.forEach((article) => this.seen.add(article.id));
      this.seen = new Set(Array.from(this.seen).slice(-5000));
      if (articles.length > 0) this.initialized = true;
      const saved = this.persist();
      this.state = {
        ...this.state, articles, loading: false, lastChecked: new Date().toISOString(), quoteStatus: parseQuoteStatus(payload),
        error: !saved ? 'Could not save alert history. Alerts are paused until storage is writable.' : articles.length === 0 ? 'No stories returned for this category.' : null,
      };
      this.emit();
      // A burst creates one unobtrusive popup containing the newest story.
      if (shouldNotify && saved && fresh.length > 0) this.dependencies.onArticle(fresh[0]);
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = { ...this.state, loading: false, error: error instanceof Error ? error.message : 'Unable to load news.' };
      this.emit();
    } finally {
      if (this.inFlightGeneration === generation) this.inFlightGeneration = null;
    }
  }

  private emit(): void { this.dependencies.onState(this.state); }
  private persist(): boolean {
    try {
      this.dependencies.save({ category: this.state.category, seen: Array.from(this.seen) });
      return true;
    } catch {
      this.state = { ...this.state, error: 'Could not save settings. Check available disk space and file permissions.' };
      return false;
    }
  }
}
