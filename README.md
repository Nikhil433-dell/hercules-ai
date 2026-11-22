# Hercules

Hercules is a macOS menu-bar widget for analysts following company news. Open **H** to scan a feed, trace a story to the companies it mentions, and see the evidence behind a possible business impact. For example, a supplier cutting its outlook may matter to a customer. Hercules shows the customer link when the source describes that relationship and keeps the original article one click away.

[Project website](https://nikhil433-dell.github.io/hercules-ai/) · [Download desktop preview 1.0.2](https://github.com/Nikhil433-dell/hercules-ai/releases/tag/preview-1.0.2) · [Roadmap](docs/ROADMAP.md)

**Version guide.** Preview 1.0.2 provides the downloadable news widget. Run the desktop and backend from this branch together to use the current company dossier, model-led curation and stock-thesis features. The screenshots and walkthrough on the website illustrate the preview with sample stories.

## An analyst’s day with Hercules

| Moment | Action | What you get |
| --- | --- | --- |
| Morning scan | Open **H**, choose Finance or another category, and review the selected stories. | The event, publisher, publication time and original source help you prioritize reading. The selected category refreshes every minute while the desktop runs. |
| A headline arrives | Click its ten-second pop-up and inspect **Companies and potential stock effects**. | Direct and indirect exposure, a source excerpt, possible impact, confidence and risks. A company name can appear even when its U.S. ticker cannot be verified. Verified tickers link to Yahoo Finance. |
| Prepare for a company call | Choose **Company news dossier** under a verified company. | Review reported figures in context, earlier articles, recurring catalysts and documented company links. Compare the past 30 days of saved coverage with the preceding 150 days and see the sample counts. |
| Challenge a thesis | Choose **Check stock thesis**. | The model weighs the article against adjusted daily price trends and available fundamentals such as growth, profitability, leverage and valuation. Inspect the factors, dates and missing evidence before deciding what to investigate. |

## How the research works

The FastAPI service fetches headlines from configured news providers. Finance can combine Finnhub with general news coverage. The desktop also checks Finance while another category is open and alerts are enabled. All eight categories support curation. The first batch sets a quiet baseline. The compact pop-up follows the current display and opens a separate article window.

Gemini 4 Hydrogen or a configured local Ollama model shortlists stories, interprets supplied article text and identifies companies. Hercules checks quoted excerpts against that text and resolves names against supported listings. Product brands and private or overseas companies can therefore appear by name without a stock link. News and quote availability depend on the providers, their coverage and their quotas. If analysis is unavailable, headlines can still appear.

The dossier uses deduplicated events saved in your configured database. Its coverage comparison needs at least three observations in each period. Analysts can inspect the original articles behind a pattern. Changes in collection frequency can change the counts. The stock-thesis view calculates moving averages, RSI, 20-session return, volatility and drawdown from Yahoo daily history and retrieves basic financials from Finnhub. The model cites supplied evidence fields. Incomplete or stale inputs produce **More data needed**. Saved events provide research history. The current model uses pretrained inference, and the project has no validated predictive return record.

## Setup

For the current source version, use macOS, Node.js 22, Python 3.11+, and the following commands from the repository root:

```sh
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt
# On a fresh checkout with no backend/.env yet:
cp -n backend/.env.example backend/.env
npm --prefix desktop ci
```

Set these values in `backend/.env`. Keep provider credentials on the backend.

| Setting | Purpose |
| --- | --- |
| `GNEWS_API_KEY` or `NEWSAPI_KEY` | General and category news. |
| `FINNHUB_API_KEY` | Finance news, quotes and company fundamentals. |
| `MARKET_ANALYSIS_PROVIDER=gemini`, `GEMINI_API_KEY` | Gemini article and stock analysis. `GEMINI_MODEL` defaults to `gemini-4-hydrogen`. |
| `MARKET_ANALYSIS_PROVIDER=ollama` | Alternative local inference. Start Ollama, pull the model named by `OLLAMA_MODEL` (default `llama3.1:8b`), and use this provider when launching. |
| `DATABASE_URL` | Defaults to local SQLite. Use persistent Postgres for hosted event history. `MARKET_EVENT_HISTORY_ENABLED=false` disables storage. |

```sh
MARKET_ANALYSIS_PROVIDER=gemini npm --prefix desktop run start:local
```

Click **H** after launch. Restart an older backend before testing a new checkout. `start:local` starts or reuses a compatible local backend. `npm --prefix desktop start` uses the hosted address in `desktop/runtime-config.json`. OpenAI powers the separate `/news/summary` endpoint. The widget’s `/news/feed` flow can run without an OpenAI key or Redis.

## Project map and checks

| Location | Role |
| --- | --- |
| `backend/app/services/` | News ingestion, model analysis, ticker verification, event history, company dossiers and stock research. |
| `desktop/` | Electron menu bar, notification windows and React article views. |
| `website/` | Static GitHub Pages showcase, screenshots and walkthrough. |
| `docs/` | [Architecture review](docs/NEWS_ANALYSIS_INTEGRATION.md), [analyst roadmap](docs/ROADMAP.md), [acceptance checks](docs/MILESTONE_1.md), [hosting](docs/HOSTING.md) and [macOS releases](docs/RELEASING.md). |

```sh
(cd backend && venv/bin/pytest tests -q)
npm --prefix desktop run typecheck
npm --prefix desktop run lint
npm --prefix desktop test
```

## Future scope

The first proposed extension pairs news with dated SEC disclosures. Subsequent work would track management commitments against later evidence and measure post-event returns against a benchmark. Watchlists and an earnings calendar could organize this work around an analyst’s coverage universe. Each proposal and its data requirements are described in the [roadmap](docs/ROADMAP.md).
