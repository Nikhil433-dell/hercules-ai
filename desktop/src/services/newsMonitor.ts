import { createHash, randomUUID } from 'crypto';
import type { NewsItem, NewsState } from '../shared/news';

export interface MonitorStorage {
  mode?: 'demo' | 'live';
  seen?: string[];
  initialized?: boolean;
}

interface Dependencies {
  load: () => MonitorStorage;
  save: (value: MonitorStorage) => void;
  fetchHeadlines: () => Promise<unknown>;
  onState: (state: NewsState) => void;
  onArticle: (article: NewsItem) => void;
}

function sampleArticle(): NewsItem {
  return {
    id: `demo-${randomUUID()}`,
    title: '[Demo] Apple earnings alert preview',
    summary: 'This is a simulated story to test background alerts. It does not describe an actual earnings release. Open the company newsroom for real announcements.',
    source: 'Hercules demo',
    category: 'Finance',
    url: 'https://www.apple.com/newsroom/',
    publishedAt: new Date().toISOString(),
    tickers: ['AAPL'],
    eventType: 'Demo earnings',
  };
}

export function normalizeHeadlines(payload: unknown): NewsItem[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { articles?: unknown }).articles)) {
    throw new Error('The backend returned an invalid headlines response.');
  }
  const articles = (payload as { articles: Record<string, unknown>[] }).articles;
  const normalized = articles.filter((article) => article && typeof article.title === 'string' && typeof article.url === 'string')
    .map((article) => {
      const url = new URL(article.url as string);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The backend returned an unsupported article link.');
      url.hash = '';
      Array.from(url.searchParams.keys()).forEach((key) => {
        if (key.startsWith('utm_')) url.searchParams.delete(key);
      });
      const published = typeof article.published_at === 'string' && Number.isFinite(Date.parse(article.published_at))
        ? new Date(article.published_at).toISOString() : '';
      return {
        id: createHash('sha256').update(url.toString()).digest('hex'),
        title: article.title as string,
        summary: typeof article.description === 'string' ? article.description : '',
        source: typeof article.source === 'string' ? article.source : 'Unknown source',
        category: 'Finance',
        url: article.url as string,
        publishedAt: published,
        tickers: Array.isArray(article.tickers)
          ? article.tickers.filter((ticker): ticker is string => typeof ticker === 'string' && /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) : [],
        eventType: typeof article.event_type === 'string' ? article.event_type : undefined,
      };
    });
  return Array.from(new Map(normalized.map((article) => [article.id, article])).values());
}

export class NewsMonitor {
  private state: NewsState;
  private seen: Set<string>;
  private initialized: boolean;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private busy = false;

  constructor(private dependencies: Dependencies) {
    const loaded = dependencies.load();
    const stored = loaded && typeof loaded === 'object' ? loaded : {};
    this.seen = new Set(Array.isArray(stored.seen) ? stored.seen.filter((id): id is string => typeof id === 'string') : []);
    this.initialized = stored.initialized === true;
    this.state = {
      mode: stored.mode === 'live' ? 'live' : 'demo',
      articles: [], loading: false, error: null, lastChecked: null,
    };
    if (this.state.mode === 'demo') this.state.articles = [sampleArticle()];
  }

  getState(): NewsState { return this.state; }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, 15 * 60 * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.generation += 1;
  }

  setMode(mode: 'demo' | 'live'): void {
    if (mode === this.state.mode) return;
    this.generation += 1;
    this.busy = false;
    this.state = { mode, articles: mode === 'demo' ? [sampleArticle()] : [], loading: false, error: null, lastChecked: null };
    this.persist();
    this.emit();
    void this.refresh();
  }

  simulate(): void {
    if (this.state.mode !== 'demo') this.setMode('demo');
    const article = sampleArticle();
    this.state = { ...this.state, articles: [article, ...this.state.articles].slice(0, 50), lastChecked: new Date().toISOString() };
    this.emit();
    this.dependencies.onArticle(article);
  }

  async refresh(): Promise<void> {
    if (this.state.mode === 'demo') {
      this.state = { ...this.state, lastChecked: new Date().toISOString() };
      this.emit();
      return;
    }
    if (this.busy) return;
    this.busy = true;
    const generation = this.generation;
    this.state = { ...this.state, loading: true, error: null };
    this.emit();
    try {
      const articles = normalizeHeadlines(await this.dependencies.fetchHeadlines());
      if (generation !== this.generation) return;
      const fresh = articles.filter((article) => !this.seen.has(article.id));
      const shouldNotify = this.initialized;
      articles.forEach((article) => this.seen.add(article.id));
      this.seen = new Set(Array.from(this.seen).slice(-2000));
      if (articles.length > 0) this.initialized = true;
      // Persist before notifying so a restart cannot replay the same alerts.
      const saved = this.persist();
      this.state = { ...this.state, articles, loading: false, lastChecked: new Date().toISOString(), error: !saved ? 'Could not save notification history. Alerts are paused until storage is writable.' : articles.length === 0 ? 'No finance headlines returned. Check the backend news provider configuration.' : null };
      this.emit();
      if (shouldNotify && saved) fresh.slice(0, 3).forEach((article) => this.dependencies.onArticle(article));
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = { ...this.state, loading: false, error: error instanceof Error ? error.message : 'Unable to load news.' };
      this.emit();
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }

  private emit(): void { this.dependencies.onState(this.state); }
  private persist(): boolean {
    try {
      this.dependencies.save({ mode: this.state.mode, seen: Array.from(this.seen), initialized: this.initialized });
      return true;
    } catch {
      this.state = { ...this.state, error: 'Could not save notification settings. Check available disk space and file permissions.' };
      return false;
    }
  }
}
