# Company news dossier

Open an analyzed article, choose a verified company, and select **Company news dossier**. Its current excerpt can contain reported financial figures and a Gemini assessment of how the news affects the business. The timeline opens the original sources. The dossier uses the local news archive and works independently of the stock-thesis request.

The comparison uses publication time. It compares the 30 days before the story with the preceding 150 days, excludes the current event, and displays both sample counts. A change in the share of negative assessments requires three saved events in each period. This is a retrospective description of coverage in the user's archive. Gaps in news collection and the existing issuer/type/day deduplication can affect the counts. Later-ingested older articles can update a dossier. For earlier records, figures come from the saved excerpt and an absent impact channel stays unknown.

## Review of the uploaded stream

| Uploaded files | Logic and fit in the widget |
| --- | --- |
| server.ts | Express exposes workspace, dossier, sync, watchlist, manual ingestion, agent questions, commitment edits and account operations. The widget uses its existing FastAPI service and Electron bridge for a read-only dossier lookup. |
| server/store.ts | Computes workspace snapshots from in-memory profiles, commitments and events. Sync updates quotes and ingests a bounded list, deduplicating by URL and title. The widget reuses durable verified events collected across categories and the symbol attached to the open article. |
| server/marketData.ts | Finnhub and Yahoo supply quotes, Finnhub company news falls back to general news, and SEC ticker-to-CIK lookup supplies recent 8-K metadata. Existing widget services cover quotes and news. A filing corroboration feature would need accession-level identity and real acceptance timestamps. The prototype fills in a fixed hour from the filing date. |
| server/geminiService.ts | Extracts impact channels, numbers, related companies and storylines, and supports dossier questions over a short event list. The widget stores an optional per-company channel and extracts price/percentage figures directly from its verified excerpt. The prototype's symbol-hint/watchlist/SPY fallback would misattribute some events. |
| server/seedData.ts | Sample profiles, commitments and historical reactions populate the uploaded dashboard. Widget counts come from the configured event store. |
| src/shared/types.ts | Defines events, impact channels, storylines, graph edges, reactions, commitments, hypotheses and UI contracts. The widget adds a smaller typed dossier response. |
| src/shared/behaviorAnalytics.ts | Computes benchmark excess returns, news/price divergence, stress mix, coverage spikes, clusters, links, commitment scores and portfolio metrics. The widget adapts mix, repeated event types and explicit indirect links. It compares disjoint windows and shows sparse samples. Price divergence needs measured post-event prices and aligned benchmark sessions. |
| src/shared/behaviorAnalytics.test.ts | Fixtures test drift, anomalies, link aggregation, price divergence, commitments and simulations. Widget regression coverage exercises the dossier through FastAPI with SQLite and checks time boundaries and source links. |
| src/App.tsx, src/main.tsx, src/index.css | Browser app bootstrap, sync, selection and dashboard layout. The existing Electron article view hosts the dossier and follows the widget's typography and width. |
| src/components/TopBar.tsx, WatchlistSidebar.tsx | Global tabs, sync and watchlist selection. The open article determines the verified issuer in the widget. |
| src/components/RadarView.tsx | Event filters and manual headline analysis. The widget's live feed already provides the starting event and category. |
| src/components/DossierView.tsx | Combines history, drift, anomalies and management commitments. The widget exposes prior articles, period counts and repeat event types directly beside each company. |
| src/components/ContagionView.tsx | Aggregates directed company links. The widget requires a single verified direct subject and an indirect company with a mechanism and source excerpt. Multiple mentions alone cannot establish a link. |
| src/components/AgentPanel.tsx | Contextual Q&A with event citations. A future follow-up question could use dossier event IDs validated against the selected sources. |
| src/components/ScorecardView.tsx | Tests trading hypotheses and displays simulated account performance. Outside this feature's scope. |

## Possible next additions

1. Pair guidance or restructuring stories with issuer filings. Show the dated disclosure and quote the paragraph that corroborates or qualifies the press coverage.
2. Track management commitments from their original quotation to later evidence. Show the promised milestone, due date and subsequent report. Leave the outcome open until a source addresses it.
3. Compare the issuer's observed return with a benchmark after a catalyst. Store aligned session prices and observation times first, then show measured differences with the source dates. A return difference alone cannot establish causation.
