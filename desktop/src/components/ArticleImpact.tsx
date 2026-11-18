import React from 'react';
import type { ArticleAnalysisStatus, NewsItem } from '../shared/news';
import { StockQuoteLink } from './StockQuotes';

export function eventLabel(article: NewsItem): string | undefined {
  const eventType = article.analysis?.eventType || article.eventType;
  return eventType?.replace(/[_-]+/g, ' ').trim().replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
}

const COMPANY_GROUPS = [
  { relationship: 'direct', label: 'Direct exposure' },
  { relationship: 'indirect', label: 'Indirect exposure' },
] as const;

export default function ArticleImpact({ article, status }: {
  article: NewsItem;
  status?: ArticleAnalysisStatus;
}) {
  const analysis = article.analysis;
  if (!analysis) {
    if (article.category !== 'business') return null;
    const messages = {
      pending: 'Analyzing this story…',
      disabled: 'AI analysis is off for this feed.',
      expired: 'This story has left the current feed. Open the original article to read more.',
      unavailable: 'Check your analysis provider, then reopen the story to retry.',
      ready: 'Impact analysis is unavailable for this story.',
    };
    return <p className="article-impact-status" role="status">{messages[status ?? 'unavailable']}</p>;
  }
  if (analysis.companies.length === 0) {
    if (article.tickers.length > 0) return null;
    return <p className="article-impact-status">
      {analysis.eventType === 'macro'
        ? 'Broad market story. No company ticker identified.'
        : 'No affected companies verified from the available source text.'}
    </p>;
  }

  return (
    <section className="article-impact" aria-labelledby="affected-stocks">
      <h2 id="affected-stocks">Potentially affected stocks</h2>
      {COMPANY_GROUPS.map(({ relationship, label }) => {
        const companies = analysis.companies.filter((company) => company.relationship === relationship);
        if (companies.length === 0) return null;
        return (
          <section key={relationship} className="impact-group" aria-label={label}>
            <h3>{label}</h3>
            <ul className="impact-companies">
              {companies.map(({ symbol, name, evidence, connection }) => (
                <li key={symbol} className="impact-company">
                  <strong>{name}</strong>
                  {connection && <p><span className="impact-evidence-label">Possible link</span> {connection}</p>}
                  <p><span className="impact-evidence-label">Source excerpt</span> {evidence}</p>
                  <StockQuoteLink symbol={symbol} quote={article.quotes?.find((quote) => quote.symbol === symbol)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
