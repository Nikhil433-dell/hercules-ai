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

Install backend dependencies and configure the news provider:

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
npm install
npm start
```

`npm start` reuses a healthy backend or starts it with the project's Python
virtual environment, then launches Electron hidden. Quit the desktop or stop
this command to stop the backend it started. `npm run start:desktop` launches
only Electron when you manage the backend separately.

The packaged app requires a running backend. To start it separately:

```bash
cd backend
./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The default backend URL is `http://127.0.0.1:8000`. Set `HERCULES_API_URL` when
launching Electron to use another trusted backend. The source launcher does not
start a local server when a custom URL is configured.

## Live news and prices

The desktop reads `/news/feed?category=business` and checks every 60 seconds.
The backend caches news and quotes for 60 seconds to limit provider requests.
Provider plan limits and publication delays still apply. Categories establish
separate initial baselines so opening a category does not alert on old stories.
Seen-story history persists across restarts. There is no demo mode or synthetic
market data. Failed refreshes show an error and preserve existing headlines.

Finance stories use Finnhub when configured, with GNews/NewsAPI as fallback.
Other categories use the general news providers. Source-provided tickers take
priority. A conservative resolver also recognizes explicit exchange/cashtag
symbols and a limited set of major company names in headlines and descriptions.
It does not cover every public company. Current GNews/NewsAPI adapters usually
supply no tickers, so this matching step connects their stories to stocks.
Quotes show their observation time; absent or failed quotes are marked
unavailable. A missing currency is not assumed to be USD. News delivery works
when quotes are unavailable.

If prices do not appear, add `FINNHUB_API_KEY` to `backend/.env` and restart the
backend. A news API key alone does not provide stock prices. The desktop now
shows a price-connection notice and per-stock error reasons rather than silently
omitting prices. Company matching can still leave ambiguous stories without a
stock association; it never fabricates a price.

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
- Developer preview: https://github.com/Nikhil433-dell/hercules-ai/releases/tag/preview-1.0.1
- Build a DMG: `cd desktop && npm ci && npm run make:dmg`

The downloadable DMGs support Apple silicon and Intel Macs and contain the desktop
only. Its signature is ad-hoc, without Apple Developer ID or notarization. Use a
configured local backend as described above. The release workflow builds both architectures. See [release instructions](docs/RELEASING.md) and
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
