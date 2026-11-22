import React from 'react';
import type { ArticleAnalysisStatus, NewsItem } from '../shared/news';
import { StockQuoteLink } from './StockQuotes';
import CompanyDossier from './CompanyDossier';
import StockResearch from './StockResearch';

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
    const messages = {
      pending: 'Analyzing this story…',
      disabled: 'AI analysis is off for this feed.',
      expired: 'This story has left the current feed. Open the original article to read more.',
      unavailable: 'Check your analysis provider, then reopen the story to retry.',
      ready: 'Impact analysis is unavailable for this story.',
    };
    return <p className="article-impact-status" role="status">{messages[status ?? 'unavailable']}</p>;
  }
  if (analysis.companies.length === 0 && !analysis.unlistedCompanies?.length) {
    if (article.tickers.length > 0) return null;
    return <p className="article-impact-status">
      {analysis.eventType === 'macro'
        ? 'Broad market story. No company ticker identified.'
        : 'No affected companies verified from the available source text.'}
    </p>;
  }

  return (
    <section className="article-impact" aria-labelledby="affected-stocks">
      <h2 id="affected-stocks">Companies and potential stock effects</h2>
      <p className="article-impact-status">Conditional business effects based on {analysis.evidenceScope === 'provider_text' ? 'the text supplied by the news provider' : 'the available headline and snippet'}. Confidence is not a probability of profit.</p>
      {COMPANY_GROUPS.map(({ relationship, label }) => {
        const companies = analysis.companies.filter((company) => company.relationship === relationship);
        if (companies.length === 0) return null;
        return (
          <section key={relationship} className="impact-group" aria-label={label}>
            <h3>{label}</h3>
            <ul className="impact-companies">
              {companies.map(({ symbol, name, evidence, connection, direction, impactScore, confidence, horizon, risks }) => (
                <li key={symbol} className="impact-company">
                  <strong>{name}</strong>
                  <p className={`impact-direction impact-${direction || 'uncertain'}`}>
                    {direction || 'uncertain'} effect {impactScore != null ? `· ${impactScore > 0 ? '+' : ''}${impactScore} / 2` : ''}
                    {' · '}{confidence || 'low'} confidence
                    {horizon && horizon !== 'uncertain' ? ` · ${horizon.replace('_', ' ')}` : ''}
                  </p>
                  {connection && <p><span className="impact-evidence-label">Possible link</span> {connection}</p>}
                  <p><span className="impact-evidence-label">Source excerpt</span> {evidence}</p>
                  <StockQuoteLink symbol={symbol} quote={article.quotes?.find((quote) => quote.symbol === symbol)} />
                  {risks?.map((risk, i) => <p key={i}><span className="impact-evidence-label">Risk</span> {risk}</p>)}
                  <CompanyDossier key={`dossier:${article.id}:${symbol}`} url={article.url} symbol={symbol} />
                  <StockResearch key={`${article.id}:${symbol}`} url={article.url} symbol={symbol} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!!analysis.unlistedCompanies?.length && <section className="impact-group" aria-label="Companies without verified tickers">
        <h3>Companies identified · listing not verified</h3>
        <ul className="impact-companies">{analysis.unlistedCompanies.map((company, index) => <li className="impact-company" key={`${company.name}:${index}`}>
          <strong>{company.name}</strong>
          <p className={`impact-direction impact-${company.direction}`}>{company.direction} business effect</p>
          {company.connection && <p>{company.connection}</p>}
          <p><span className="impact-evidence-label">Source excerpt</span> {company.evidence}</p>
          <p>{company.listingMessage}</p>
        </li>)}</ul>
      </section>}
    </section>
  );
}
