import { createHash } from 'crypto';
import type { AnalysisStatus, NewsAnalysis, NewsItem, NewsState, StockQuote } from '../shared/news';

export const NEWS_CATEGORIES = ['business', 'general', 'technology', 'science', 'health', 'sports', 'entertainment', 'world'];
const REFRESH_SECONDS = 60;
const HISTORY_LIMIT = 5000;
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;
const RELEVANCE_RANK = { high: 3, medium: 2, low: 1 };

export type PopupPlacement = 'off' | 'current';

export interface MonitorStorage {
  popupPlacement?: PopupPlacement;
  category?: string;
  seen?: string[];
  seenFinanceEvents?: string[];
}
interface Dependencies {
  load: () => MonitorStorage;
  save: (value: MonitorStorage) => void;
  fetchHeadlines: (category: string) => Promise<unknown>;
  onState: (state: NewsState) => void;
  onArticle: (article: NewsItem) => void;
}

interface FeedResult {
  articles: NewsItem[];
  quoteStatus?: NewsState['quoteStatus'];
  analysisStatus?: AnalysisStatus;
  analysisMessage?: string;
  alertHistorySaved?: boolean;
}

function parseAnalysis(raw: unknown): NewsAnalysis | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const { event_id, event_type, relevance, why_it_matters, alert_eligible } = value;
  if (typeof event_id !== 'string' || !event_id.trim() || event_id.length > 256 ||
      typeof event_type !== 'string' || !event_type.trim() ||
      (relevance !== 'high' && relevance !== 'medium' && relevance !== 'low') ||
      typeof why_it_matters !== 'string' || !why_it_matters.trim() ||
      typeof alert_eligible !== 'boolean' || !Array.isArray(value.companies)) return undefined;

  const companies: NewsAnalysis['companies'] = [];
  for (const rawCompany of value.companies) {
    if (!rawCompany || typeof rawCompany !== 'object') return undefined;
    const { symbol, name, relationship, evidence, connection } = rawCompany as Record<string, unknown>;
    if (typeof symbol !== 'string' || !TICKER_PATTERN.test(symbol) ||
        typeof name !== 'string' || !name.trim() ||
        (relationship !== 'direct' && relationship !== 'indirect') ||
        typeof evidence !== 'string' || !evidence.trim()) return undefined;
    companies.push({
      symbol, name: name.trim(), relationship, evidence: evidence.trim(),
      connection: typeof connection === 'string' ? connection.trim().slice(0, 150) || undefined : undefined,
    });
  }

  return {
    eventId: event_id.trim(), eventType: event_type.trim(), relevance,
    whyItMatters: why_it_matters.trim(), alertEligible: alert_eligible, companies,
    evidence: typeof value.evidence === 'string' ? value.evidence.trim() || undefined : undefined,
    evidenceScope: value.evidence_scope === 'provider_text' || value.evidence_scope === 'provider_snippet' ? value.evidence_scope : undefined,
  };
}

function parseAnalysisStatus(payload: unknown): AnalysisStatus {
  const status = (payload as { analysis_status?: unknown })?.analysis_status;
  return status === 'pending' || status === 'ready' || status === 'unavailable' ? status : 'disabled';
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
          ? article.tickers.filter((ticker): ticker is string => typeof ticker === 'string' && TICKER_PATTERN.test(ticker)) : [],
        quotes: Array.isArray(article.quotes) ? article.quotes.map(parseQuote).filter((quote): quote is StockQuote => quote !== null) : [],
        eventType: typeof article.event_type === 'string' ? article.event_type : undefined,
        analysis: parseAnalysis(article.analysis),
      };
    });
  return Array.from(new Map(normalized.map((article) => [article.id, article])).values())
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}

function parseFeed(payload: unknown, category: string): FeedResult {
  const articles = normalizeHeadlines(payload);
  const result: FeedResult = { articles, quoteStatus: parseQuoteStatus(payload) };
  if (category === 'business') {
    result.analysisStatus = parseAnalysisStatus(payload);
    const message = (payload as { analysis_message?: unknown })?.analysis_message;
    if (typeof message === 'string') result.analysisMessage = message.slice(0, 180);
    // Preserve publication order within each relevance tier.
    const rank = (article: NewsItem) => article.analysis ? RELEVANCE_RANK[article.analysis.relevance] : 0;
    articles.sort((first, second) => rank(second) - rank(first));
  }
  return result;
}

export class NewsMonitor {
  private state: NewsState;
  private popupPlacement: PopupPlacement;
  private seen: Set<string>;
  private seenFinanceEvents: Set<string>;
  private financeBaseline: Set<string> | undefined;
  private financeRequest: Promise<FeedResult> | undefined;
  private lastFinancePollAt = -Infinity;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private inFlightGeneration: number | null = null;

  constructor(private dependencies: Dependencies) {
    const loaded = dependencies.load();
    const stored = loaded && typeof loaded === 'object' ? loaded : {};
    this.popupPlacement = stored.popupPlacement === 'off' ? 'off' : 'current';
    this.seen = new Set(Array.isArray(stored.seen)
      ? stored.seen.filter((id): id is string => typeof id === 'string').slice(-HISTORY_LIMIT) : []);
    this.seenFinanceEvents = new Set(Array.isArray(stored.seenFinanceEvents)
      ? stored.seenFinanceEvents.filter((id): id is string => typeof id === 'string').slice(-HISTORY_LIMIT) : []);
    this.state = {
      category: typeof stored.category === 'string' && NEWS_CATEGORIES.includes(stored.category) ? stored.category : 'business',
      articles: [], loading: false, error: null, lastChecked: null, refreshIntervalSeconds: REFRESH_SECONDS,
    };
  }

  getState(): NewsState { return this.state; }

  getPopupPlacement(): PopupPlacement { return this.popupPlacement; }

  setPopupPlacement(placement: PopupPlacement): void {
    if (this.popupPlacement === placement) return;
    this.popupPlacement = placement;
    if (placement === 'current') this.financeBaseline = undefined;
    if (!this.persist()) {
      this.state = { ...this.state, error: 'Could not save settings. Check available disk space and file permissions.' };
      this.emit();
    }
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, REFRESH_SECONDS * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.generation += 1;
    this.financeRequest = undefined;
    this.financeBaseline = undefined;
    this.lastFinancePollAt = -Infinity;
  }

  setCategory(category: string): void {
    if (!NEWS_CATEGORIES.includes(category) || category === this.state.category) return;
    this.generation += 1;
    this.state = { ...this.state, category, articles: [], loading: false, error: null, lastChecked: null, quoteStatus: undefined, analysisStatus: undefined, analysisMessage: undefined };
    this.persist();
    this.emit();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const generation = this.generation;
    const category = this.state.category;
    if (category !== 'business' && this.popupPlacement !== 'off' && Date.now() - this.lastFinancePollAt >= REFRESH_SECONDS * 1000) {
      // A slower Finance request must not delay the category the user opened.
      void this.fetchFinance().catch((): undefined => undefined);
    }
    if (this.inFlightGeneration === generation) return;
    this.inFlightGeneration = generation;
    this.state = { ...this.state, loading: true, error: null };
    this.emit();
    try {
      const feed = category === 'business' ? await this.fetchFinance()
        : parseFeed(await this.dependencies.fetchHeadlines(category), category);
      if (generation !== this.generation) return;
      const { articles } = feed;
      this.state = {
        ...this.state, articles, loading: false, lastChecked: new Date().toISOString(),
        quoteStatus: feed.quoteStatus, analysisStatus: feed.analysisStatus, analysisMessage: feed.analysisMessage,
        error: feed.alertHistorySaved === false ? 'Could not save alert history. Alerts are paused until storage is writable.' : articles.length === 0 ? 'No stories returned for this category.' : null,
      };
      this.emit();
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = {
        ...this.state, loading: false, analysisStatus: category === 'business' ? 'unavailable' : undefined, analysisMessage: undefined,
        error: error instanceof Error ? error.message : 'Unable to load news.',
      };
      this.emit();
    } finally {
      if (this.inFlightGeneration === generation) this.inFlightGeneration = null;
    }
  }

  private fetchFinance(): Promise<FeedResult> {
    if (this.financeRequest) return this.financeRequest;
    this.lastFinancePollAt = Date.now();
    const request = Promise.resolve().then(() => this.dependencies.fetchHeadlines('business')).then((payload) => {
      const feed = parseFeed(payload, 'business');
      if (this.financeRequest === request) feed.alertHistorySaved = this.processFinanceAlerts(feed);
      return feed;
    }).finally(() => {
      if (this.financeRequest === request) this.financeRequest = undefined;
    });
    this.financeRequest = request;
    return request;
  }

  private processFinanceAlerts(feed: FeedResult): boolean {
    if (!this.financeBaseline && feed.articles.length > 0) {
      this.financeBaseline = new Set(feed.articles.map(({ id }) => id));
    }
    const seen = new Set(this.seen);
    const events = new Set(this.seenFinanceEvents);
    // Enrichment can arrive later. Learn event IDs for already-seen stories
    // before inspecting copies, regardless of their order in the feed.
    for (const article of feed.articles) {
      if ((seen.has(article.id) || this.financeBaseline?.has(article.id)) && article.analysis) {
        events.add(article.analysis.eventId);
      }
    }
    let newest: NewsItem | undefined;
    for (const article of feed.articles) {
      const eventId = article.analysis?.eventId;
      const fresh = !seen.has(article.id) && !this.financeBaseline?.has(article.id) &&
        (!eventId || !events.has(eventId));
      seen.add(article.id);
      if (eventId) events.add(eventId);
      if (fresh && !newest && this.popupPlacement !== 'off') newest = article;
    }

    // Commit history before displaying a popup. A failed save can be retried.
    const history = new Set(Array.from(events).slice(-HISTORY_LIMIT));
    const articleHistory = new Set(Array.from(seen).slice(-HISTORY_LIMIT));
    if (!this.persist(history, articleHistory)) return false;
    this.seenFinanceEvents = history;
    this.seen = articleHistory;
    if (newest) this.dependencies.onArticle(newest);
    return true;
  }

  private emit(): void { this.dependencies.onState(this.state); }
  private persist(financeEvents = this.seenFinanceEvents, seen = this.seen): boolean {
    try {
      this.dependencies.save({
        category: this.state.category, popupPlacement: this.popupPlacement,
        seen: Array.from(seen), seenFinanceEvents: Array.from(financeEvents),
      });
      return true;
    } catch {
      return false;
    }
  }
}
