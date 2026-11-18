# Hercules — Market News Desktop App

Hercules starts quietly in the macOS menu bar. Click **H** to open current news
with category filters. The main panel stays anchored and can be resized from
its edges; reopening preserves its size for the session. New stories appear in
a compact 250 × 160px popup. Click a popup or headline for a separate article view
with stock quotes and a link to the original source. The small popup stays for
10 seconds with a countdown, even when you click elsewhere. The larger feed
and article windows hide when you click outside them. Background checks
continue while the windows are hidden.

## Setup

Download the [macOS preview](https://github.com/Nikhil433-dell/hercules-ai/releases/tag/preview-1.0.2),
open the DMG, and drag Hercules to Applications. Launch it, then click **H** in
the menu bar to open the news feed. The app connects to the hosted backend at
`https://hercules-ai-red.vercel.app` automatically. An internet connection is
required; you do not need to run a backend or supply API keys to use the app.
The preview is ad-hoc signed and not notarized; see the release notes for
installation details.

To run the desktop from source:

```bash
cd desktop
npm install
npm start
```

`npm start` uses the same hosted backend and launches Electron hidden. The
backend address is stored in `desktop/runtime-config.json`; the packaged app
uses that configuration too. Set `HERCULES_API_URL` in Electron's launch
environment to override it with another trusted backend.

### Optional: run your own backend

Developers can self-host the backend and keep provider credentials on their own
server. This is optional for users of the default desktop app.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Only if you do not already have .env
```

Edit `backend/.env` locally. Use GNews or NewsAPI for general headlines. Add
`FINNHUB_API_KEY` for finance stories with source-provided ticker associations
and stock quotes. Keys stay in the backend; the desktop does not receive them.
The feed does not require OpenAI, Redis, or Docker.

Start the app and local backend together:

```bash
cd desktop
npm run start:local
```

`start:local` normally uses `http://127.0.0.1:8000`, reusing a compatible local backend or
starting one with the project's Python virtual environment. Quit the desktop
or stop this command to stop the backend it started. To manage the backend
separately:

```bash
cd backend
MARKET_ANALYSIS_PROVIDER=ollama ./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then launch Electron with the local URL explicitly:

```bash
cd desktop
HERCULES_API_URL=http://127.0.0.1:8000 npm run start:desktop
```

### Gemini 4 Carbon and market event history

Set `GEMINI_API_KEY` in `backend/.env` using a paid Gemini API project with
Carbon access. Then restart the local app:

```bash
cd desktop
MARKET_ANALYSIS_PROVIDER=gemini npm run start:local
```

The key is read by the backend. The model defaults to `gemini-4-carbon`.
Gemini processes only the headline, description, and available article text
needed for analysis.

Validated background analyses are saved in the `market_news_events` table.
Each event stores its source, publication time, first-seen and analysis times,
verified companies, and model. Local history uses `backend/hercules.db` by
default. For hosted history, set `DATABASE_URL` to a Postgres connection
string in the backend environment. `MARKET_EVENT_HISTORY_ENABLED=false`
turns off event storage.

### Use Ollama locally

Start the Ollama app on your Mac or run `ollama serve` in a separate terminal.
Then install the model and launch Hercules from the repository root:

```bash
ollama pull llama3.1:8b
cd desktop
MARKET_ANALYSIS_PROVIDER=ollama npm run start:local
```

`start:local` defaults to no LLM calls. To use the optional news analyzer, run
`MARKET_ANALYSIS_PROVIDER=ollama npm run start:local`, including when a Gemini key is present in
`backend/.env`. If the backend on port 8000 uses another provider, the launcher
tries port 8010. An explicit `MARKET_ANALYSIS_PROVIDER` in the launch command
selects another provider.
Use `OLLAMA_BASE_URL` or `OLLAMA_MODEL` in `backend/.env` to configure
Ollama. Use `MARKET_ANALYSIS_PROVIDER=off` to turn analysis off.

Open the H menu-bar widget and select Finance. Headlines load while the model
shortlists and analyzes stories in the background. The next refresh shows
available analysis, including the event and evidence for each
verified company. This version reads the headline, description, and any article
text supplied by the news provider. Hercules keeps provider tags and adds
verified company mentions from the supplied text. Direct and indirect exposure
labels and possible links appear beside verified matches. The compact popup
shows the first available company connection. A ticker stays clickable
even when Finnhub cannot return a price.
Opening a Finance story that missed the background shortlist analyzes it on
demand. Broad market stories can have an explanation without a company ticker.

The first Finance response sets a quiet baseline. Later, fresh, significant
company events and broad market news can trigger one popup per check.
Choose **News popups → Off** from the H menu to review the feed quietly.
If the analysis provider is unavailable,
the headlines still load and market alerts pause.

## Live news and prices

The desktop reads `/news/feed?category=business` and checks every 60 seconds.
The backend caches news and quotes for 60 seconds to limit provider requests.
Provider plan limits and publication delays still apply. Finance establishes
its own alert baseline independent of the category shown in the widget.
Alert history persists across restarts. There is no demo mode or synthetic
market data. Failed refreshes show an error and preserve existing headlines.

Without local AI, Finance uses Finnhub when configured, with GNews/NewsAPI as
fallback. With local AI enabled, Finance can consider both sets of candidates.
Other categories use the general news providers. Source-provided tickers take
priority. A conservative resolver also recognizes explicit exchange/cashtag
symbols and a limited set of major company names in headlines and descriptions.
It does not cover every public company. Current GNews/NewsAPI adapters usually
supply no tickers, so this matching step connects their stories to stocks.
Quotes show their observation time; absent or failed quotes are marked
unavailable. A missing currency is not assumed to be USD. News delivery works
when quotes are unavailable.

If prices do not appear, the desktop shows a price-connection notice and
per-stock error reasons. Provider availability, quotas, and company matching can
leave a story without a quote; Hercules never fabricates a price. Users of the
hosted service do not need their own quote-provider key. If you self-host, add
`FINNHUB_API_KEY` to your backend's environment and restart it; a news API key
alone does not provide stock prices.

## Development

```bash
cd desktop
npm run typecheck
npm run lint
npm test
npm run build
```

`build` creates a local Electron package, without publishing. Popup expiration
runs in Electron's main process; each new story gets a fresh 10 seconds after
the popup becomes visible. Opening the article or dismissing the popup cancels
its timer. Feed and article windows hide on focus loss and Escape.

Backend tests:

```bash
cd backend
./venv/bin/pytest tests -q
```

See [the acceptance checklist](docs/MILESTONE_1.md) and
[the broader roadmap](docs/BLUEPRINT.md). Earnings calendars and watchlists
remain future work.


## Website and macOS downloads

- Showcase: https://nikhil433-dell.github.io/hercules-ai/
- Developer preview: https://github.com/Nikhil433-dell/hercules-ai/releases/tag/preview-1.0.2
- Build a DMG: `cd desktop && npm ci && npm run make:dmg`

The downloadable DMGs support Apple silicon and Intel Macs and contain the desktop
only and connect to the hosted API automatically. Their signature is ad-hoc,
without Apple Developer ID or notarization. The release workflow builds both architectures. See [release instructions](docs/RELEASING.md) and
[hosting options](docs/HOSTING.md).

The website lives in `website/` and deploys through GitHub Actions. Its screenshots
and 18-second walkthrough render the actual React components using clearly labeled
sample content and prices. To regenerate them on macOS:

```bash
cd desktop
node showcase/build.cjs
./node_modules/.bin/electron showcase/render.cjs
```

These preview fixtures are isolated from the production app and do not contact news
providers or include credentials.
