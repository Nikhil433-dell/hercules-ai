# Hercules — Market News Desktop App

Hercules starts quietly in the macOS menu bar. Click **H** to open current news
with category filters. New stories appear in a compact 170px popup (one quarter
of the 680px feed panel). Click a popup or headline for a separate article view
with stock quotes and a link to the original source. Clicking elsewhere hides
Hercules windows. Background checks continue while the windows are hidden.

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
Other categories use the general news providers. Tickers appear only when the
source supplies them. Current GNews/NewsAPI adapters usually supply no tickers.
Quotes show their observation time; absent or failed quotes are marked
unavailable. A missing currency is not assumed to be USD. News delivery works
when quotes are unavailable.

## Development

```bash
cd desktop
npm run typecheck
npm run lint
npm test
npm run build
```

`build` creates a local Electron package, without publishing. macOS builds use
Apple's command-line tools to compile a small mouse-event helper. It watches
mouse-down coordinates only while a notification popup is visible, to dismiss
an unfocused popup when you click elsewhere. It does not capture keyboard input
or save click events. Other windows hide on focus loss and Escape.

Backend tests:

```bash
cd backend
./venv/bin/pytest tests -q
```

See [the acceptance checklist](docs/MILESTONE_1.md) and
[the broader roadmap](docs/BLUEPRINT.md). Earnings calendars and watchlists
remain future work.
