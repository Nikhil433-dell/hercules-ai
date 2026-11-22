import React, { useEffect, useState } from 'react';
import type { ResearchSection, StockResearchResult } from '../shared/news';

const STANCES = { research_candidate: 'Worth researching', watch: 'Wait and watch', avoid: 'Caution', insufficient_data: 'More data needed' };
const LABELS: Record<string, string> = {
  adjusted_close: 'Adjusted daily close', observations: 'Daily observations', sma20: '20-day average', sma50: '50-day average',
  rsi14: 'RSI (14)', return_20d_pct: '20-session return (%)', annualized_volatility_pct: 'Annualized volatility (%)',
  max_drawdown_pct: 'Historical drawdown (%)', net_margin_ttm_pct: 'Trailing net margin (%)',
  revenue_growth_ttm_yoy_pct: 'Trailing revenue growth (%)', eps_growth_ttm_yoy_pct: 'Trailing EPS growth (%)',
  debt_to_equity_annual: 'Annual debt / equity', pe_ttm: 'Trailing P/E', pb_annual: 'Annual price / book', roe_ttm_pct: 'Trailing ROE (%)',
};
const time = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Date unavailable';

function Section({ title, data }: { title: string; data: ResearchSection }) {
  return <details className="research-section">
    <summary>{title} · {data.status === 'ready' ? 'Available' : data.status === 'partial' ? 'Incomplete' : 'Unavailable'}</summary>
    {title === 'Fundamentals' && <p>Metric date: {time(data.asOf)}</p>}
    <dl>{Object.entries(data.metrics).map(([key, value]) => <React.Fragment key={key}>
      <dt>{LABELS[key] || key.replace(/_/g, ' ')}</dt><dd>{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value ?? 'Unavailable'}</dd>
    </React.Fragment>)}</dl>
    {data.signals.map((signal, index) => <p key={index}>{signal}</p>)}
  </details>;
}

export default function StockResearch({ url, symbol }: { url: string; symbol: string }) {
  const [result, setResult] = useState<StockResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!attempt) return;
    let active = true;
    setLoading(true); setResult(null);
    Promise.resolve(window.electronAPI?.researchStock(url, symbol)).then(value => {
      if (active) setResult(value || { error: 'Open Hercules desktop to check this stock.' });
    }).catch(() => { if (active) setResult({ error: 'Research is unavailable. Please retry.' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url, symbol, attempt]);
  const research = result?.research;
  return <div className="stock-research">
    <button className="research-button" disabled={loading} onClick={() => setAttempt(value => value + 1)}>
      {loading ? 'Checking market evidence…' : research ? 'Refresh stock thesis' : 'Check stock thesis'}
    </button>
    {result?.error && <p role="status">{result.error}</p>}
    {research && <section aria-label={`${symbol} research assessment`}>
      <h4>{STANCES[research.stance]}</h4>
      <p>{research.modelStatus === 'ready' ? `Analyzed by ${research.model || 'the configured model'}` : 'Model assessment unavailable · no investment verdict substituted'}</p>
      <p>Checked {time(research.assessedAt)} · Daily price data: {time(research.quoteAsOf)}</p>
      <p className="research-caption">Research assessment, not a buy or sell instruction.</p>
      {research.factors?.length ? <ul>{research.factors.map((factor, i) => <li key={i}>
        {factor.interpretation}<p className="research-caption">Evidence: {factor.evidenceFields.map(field => field.replace(/[._]/g, ' ')).join(', ')}</p>
      </li>)}</ul> : research.reasons.length > 0 && <ul>{research.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
      <Section title="Technicals" data={research.technical} />
      <Section title="Fundamentals" data={research.fundamental} />
      <details><summary>Risks and missing evidence</summary><ul>{research.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></details>
      {research.history && <details><summary>Local news history · {research.history.observations} earlier events</summary>
        {Object.entries(research.history.eventCounts).map(([event, count]) => <p key={event}>{event.replace(/_/g, ' ')}: {count}</p>)}
        <p>{research.history.note}</p>
      </details>}
      <details><summary>Method and sources</summary><p>{research.methodology}</p>
        {research.sources.map(source => <button className="research-source" key={source.url} onClick={() => window.electronAPI?.openExternal(source.url)}>{source.name} ↗</button>)}
      </details>
    </section>}
  </div>;
}
