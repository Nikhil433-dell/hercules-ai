import React, { useState } from 'react';
import type { CompanyDossier as Dossier, DossierStory } from '../shared/news';

function Source({ story }: { story: DossierStory }) {
  return <button className="research-source" onClick={() => window.electronAPI?.openExternal(story.url)}>
    {story.title} ↗<br />{story.source} · {new Date(story.published_at).toLocaleDateString()}
  </button>;
}

export default function CompanyDossier({ url, symbol }: { url: string; symbol: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Dossier>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (data || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await window.electronAPI?.getCompanyDossier(url, symbol);
      if (response?.dossier) setData(response.dossier);
      else setError(response?.error || 'Company history is unavailable.');
    } catch { setError('Company history is unavailable.'); }
    finally { setBusy(false); }
  }
  return <div className="stock-research">
    <button className="research-button" aria-expanded={open} onClick={toggle}>{open ? 'Hide company dossier' : 'Company news dossier'}</button>
    {open && <section aria-label={symbol + ' news dossier'}>
      {busy && <p role="status">Loading company history…</p>}
      {error && <p role="status">{error}</p>}
      {data && <>
        {data.impact_channel !== 'unclear' && <p>Potential impact on {data.impact_channel.replace(/_/g, ' ')}</p>}
        {data.figures.length > 0 && <details><summary>Reported figures · {data.figures.join(' · ')}</summary><blockquote>{data.excerpt}</blockquote></details>}
        {!data.history_available ? <p>Saved news history is unavailable.</p> : !data.anchor || !Number.isFinite(Date.parse(data.anchor)) ? <p>The article has no reliable date for comparison.</p> : <>
          <h4>Coverage before this story</h4>
          <p>{data.recent_count} saved events in the preceding 30 days · {data.baseline_count} in the earlier 150 days</p>
          <p>{data.negative_share_change == null ? 'At least three events in each period are needed to compare coverage.' :
            'Share of events assessed as negative: ' + (data.negative_share_change > 0 ? '+' : '') + data.negative_share_change + ' percentage points versus the earlier period.'}</p>
          {data.recurring.map(t => <p key={t.type}>Recurring {t.type.replace(/_/g, ' ')} · {t.count} events in 30 days</p>)}
          {data.connections.map(c => <details key={c.from + ':' + c.to}><summary>{c.from} → {c.to} · {c.count} linked events</summary>
            <p>{c.mechanism}</p><blockquote>{c.evidence}</blockquote><Source story={c.source} /></details>)}
          {data.timeline.length > 0 && <details><summary>Earlier coverage ({data.timeline.length} most recent)</summary>
            {data.timeline.map(s => <div key={s.url}><Source story={s} /><p>{s.evidence}</p></div>)}</details>}
        </>}
      </>}
    </section>}
  </div>;
}
