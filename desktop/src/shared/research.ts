import type { ResearchSection, StockResearch } from './news';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 12).map(item => item.slice(0, 600)) : [];
const date = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
function section(raw: unknown): ResearchSection {
  const value = record(raw);
  const metrics: ResearchSection['metrics'] = {};
  for (const [key, metric] of Object.entries(record(value.metrics)).slice(0, 24)) {
    if (metric === null || typeof metric === 'number' && Number.isFinite(metric) || typeof metric === 'string') metrics[key.slice(0, 80)] = typeof metric === 'string' ? metric.slice(0, 200) : metric as number | null;
  }
  const signals = Array.isArray(value.signals) ? value.signals.map(signal => typeof signal === 'string' ? signal : record(signal).explanation) : [];
  return { status: ['ready', 'partial', 'unavailable'].includes(value.status as string) ? value.status as string : 'unavailable', asOf: date(value.as_of), signals: strings(signals), metrics };
}
export function parseStockResearch(raw: unknown, symbol: string): StockResearch | null {
  const value = record(raw);
  if (value.symbol !== symbol || !['ready', 'partial', 'unavailable'].includes(value.status as string) ||
      !['research_candidate', 'watch', 'avoid', 'insufficient_data'].includes(value.stance as string)) return null;
  const sources: StockResearch['sources'] = [];
  for (const rawSource of Array.isArray(value.sources) ? value.sources.slice(0, 12) : []) {
    const source = record(rawSource);
    const url = typeof rawSource === 'string' ? rawSource : source.url;
    if (typeof url !== 'string') continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') sources.push({ url, name: typeof source.name === 'string' ? source.name.slice(0, 120) : parsed.hostname });
    } catch { /* Ignore unusable source links. */ }
  }
  const history = record(value.history);
  const eventCounts: Record<string, number> = {};
  for (const [key, count] of Object.entries(record(history.event_counts))) {
    if (typeof count === 'number' && Number.isInteger(count) && count >= 0) eventCounts[key.slice(0, 60)] = count;
  }
  return { symbol, status: value.status as StockResearch['status'], stance: value.stance as StockResearch['stance'],
    model: typeof value.model === 'string' ? value.model.slice(0, 150) : undefined,
    modelStatus: typeof value.model_status === 'string' ? value.model_status.slice(0, 40) : undefined,
    factors: (Array.isArray(value.factors) ? value.factors : []).slice(0, 5).flatMap(rawFactor => {
      const factor = record(rawFactor);
      return typeof factor.interpretation === 'string' ? [{ interpretation: factor.interpretation.slice(0, 350), evidenceFields: strings(factor.evidence_fields) }] : [];
    }),
    history: typeof history.observations === 'number' && Number.isInteger(history.observations) && history.observations >= 0
      ? { observations: history.observations, eventCounts, note: typeof history.note === 'string' ? history.note.slice(0, 600) : '' } : undefined,
    assessedAt: date(value.assessed_at), quoteAsOf: date(value.quote_as_of), technical: section(value.technical), fundamental: section(value.fundamental),
    reasons: strings(value.reasons), risks: strings(value.risks), methodology: typeof value.methodology === 'string' ? value.methodology.slice(0, 2000) : '', sources };
}

export function parseDossier(raw: unknown, symbol: string): import('./news').CompanyDossier | null {
  const d = record(raw);
  const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  const story = (raw: unknown) => {
    const s = record(raw);
    return ['title', 'source', 'url', 'event_type', 'evidence', 'direction'].every(key => typeof s[key] === 'string') &&
      !!date(s.published_at) && /^https?:\/\//i.test(String(s.url));
  };
  if (d.symbol !== symbol || typeof d.impact_channel !== 'string' || typeof d.excerpt !== 'string' || typeof d.history_available !== 'boolean' ||
      !(d.anchor === null || typeof d.anchor === 'string') || !count(d.recent_count) || !count(d.baseline_count) ||
      !(d.negative_share_change === null || Number.isFinite(d.negative_share_change)) ||
      !Array.isArray(d.figures) || !d.figures.every(x => typeof x === 'string') ||
      !Array.isArray(d.timeline) || !d.timeline.every(story) ||
      !Array.isArray(d.recurring) || !d.recurring.every(x => x && typeof x.type === 'string' && count(x.count)) ||
      !Array.isArray(d.connections) || !d.connections.every(x => x && count(x.count) && story(x.source) &&
        ['from', 'to', 'mechanism', 'evidence'].every(k => typeof x[k] === 'string'))) return null;
  return raw as import('./news').CompanyDossier;
}
