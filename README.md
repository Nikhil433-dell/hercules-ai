# Hercules — Market News Desktop App

Hercules lives in the macOS menu bar and opens a compact news panel. The desktop
app starts in **Demo** mode so the icon, panel, alerts, and links can be tried
without API keys. Sample stories are explicitly labeled; they are not market news.

## Project Structure
```
hercules-ai/
├── backend/          # FastAPI + LangChain backend
├── desktop/          # Electron + React desktop widget
├── docs/             # Project documentation
├── .github/          # CI/CD workflows
└── docker-compose.yml
```

## Quick Start

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env       # Fill in your API keys
uvicorn app.main:app --reload
```

### Desktop (Electron)
```bash
cd desktop
npm install
npm run start
```

Click the H menu-bar icon to show or hide the panel. Right-click it for the
menu, including a test-alert action. Monitoring runs in Electron's background
process and continues while the panel is hidden. Quitting stops monitoring.

Each sample card has separate stock and article links. **Send a test alert**
inserts a labeled sample story and requests a native desktop notification.
Notification banners depend on the operating system's notification settings;
clicking a notification opens the news panel.

### Live headlines

Start the backend with a valid GNews or NewsAPI key, then select **Live news**
in the panel. The desktop reads `/news/headlines?category=business` from
`http://127.0.0.1:8000`. This path does not require an OpenAI key or Redis.
The first successful fetch establishes a baseline without alerting on old
headlines. Subsequent new stories can notify, and seen-story IDs persist
across app restarts. Errors appear in the panel rather than substituting samples.

Live mode currently provides general business headlines. A dedicated financial
feed, watchlist filtering, and earnings ingestion are future work. Ticker links
appear only when ticker metadata is supplied; Hercules does not guess tickers
from headlines. The current GNews/NewsAPI adapters generally provide no tickers.

### Development checks

```bash
cd desktop
npm run typecheck
npm run lint
npm test
npm run build
```

`build` checks TypeScript and creates a local Electron package. It does not
publish or sign a release. See [the milestone checklist](docs/MILESTONE_1.md)
for manual acceptance checks and the remaining product work.

### Docker (Full Stack)
```bash
docker compose up -d
```

## Documentation
See [docs/BLUEPRINT.md](docs/BLUEPRINT.md) for the full project blueprint.
