# Copilot instructions for Hercules AI

## Repository shape

This repo contains two runtime surfaces that work together:

- `backend/`: FastAPI API + async services for fetching, caching, and summarizing news.
- `desktop/`: existing Electron + React + TypeScript desktop shell that renders a floating side panel and listens for wake/panel state events.
- `macos/`: native macOS AppKit client built with PyObjC; it provides the menu-bar status item and popover replacement for Electron.
- `docs/BLUEPRINT.md`: higher-level product blueprint for the app; it describes planned earnings/Ollama features that are broader than the current code.

The codebase is largely a working news briefings app with a few planned-but-not-yet-complete extension points.

## Build, test, and lint commands

### Backend (Python / FastAPI)

Install dependencies:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Run a single backend test:

```bash
cd backend
./venv/bin/pytest tests/test_news.py -q
```

Run the full backend suite:

```bash
cd backend
./venv/bin/pytest tests -q
```

The CI workflow runs:

```bash
cd backend
pytest tests/ -v
```

Use the project venv when available; plain `pytest` is not installed in the shell environment here.

### Desktop (Electron / React / TypeScript)

Install dependencies:

```bash
cd desktop
npm install
```

Run the lint check:

```bash
cd desktop
npm run lint
```

Start the app:

```bash
cd desktop
npm run start
```

Packaging scripts defined in `desktop/package.json` include `npm run package`, `npm run make`, and `npm run publish`.

Important: the README mentions `npm run dev`, but the actual repo scripts use `npm run start`; prefer the package.json scripts over stale docs.

### Full-stack / local runtime

```bash
docker compose up -d
```

This is the repo's full stack bootstrap path for the app and supporting services.

### Native macOS client (PyObjC)

The native client is macOS-only and uses the existing backend:

```bash
cd macos
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Build a menu-bar `.app` with py2app:

```bash
cd macos
source venv/bin/activate
pip install py2app
python setup.py py2app
```

Current repo status:

- Backend tests pass through the project venv (`./venv/bin/pytest tests/test_news.py -q`).
- `npm run lint` currently fails in `desktop/src/index.ts` with existing ESLint `no-empty` errors; treat those as project-level issues unless a task explicitly targets desktop lint.

## High-level architecture

### Backend

The FastAPI app is created in `backend/app/main.py` and wires services into `app.state` during app startup:

- `NewsFetcher` fetches headlines from GNews and falls back to NewsAPI.
- `NewsSummarizer` builds LangChain prompt chains with `ChatOpenAI` and returns a narrative summary + highlight list.
- `CacheService` wraps Redis-backed caching for summaries.

The route flow is intentionally cache-first:

- `backend/app/api/routes/news.py` -> `GET /news/summary`
- check cache
- if absent, fetch headlines
- summarize with LLM
- store the result back in cache
- return a `SummaryResponse`

This pattern is important: new API work that depends on the same summary flow should keep the same lifecycle and not bypass the cache.

The API contract lives in `backend/app/models/schemas.py` and should stay aligned with FastAPI response models. The user preference model is currently in-memory in `backend/app/api/routes/preferences.py`, even though Phase 3 plans a database-backed preference store.

Background tasks are set up in `backend/app/tasks/celery_app.py`; they schedule periodic refresh jobs using Celery + Redis. This is a sidecar system, not the main request/response path.

### Desktop app

`desktop/src/App.tsx` is the shell that toggles between a streamlined floating icon and an expanded side panel. It responds to system wake and panel-state events from Electron.

The app uses a small React interface with components under `desktop/src/components/`:

- `SidePanel` renders the main news panes and state transitions
- `NewsCard` displays headline content and metadata
- `FloatingIcon` is the minimized, always-available state

The Electron main process is in `desktop/src/index.ts`; keep platform-specific behavior there and keep React rendering concerns inside the `src/components` tree.

The native macOS client in `macos/app.py` is the primary macOS shell, not a
second backend. It uses `NSStatusItem` for the menu-bar icon, `NSPopover` for
the click-open panel, `NSWorkspace` wake notifications, and `urllib` for the
existing `/news/summary` API. The Electron shell remains in `desktop/` as the
legacy cross-platform implementation; new macOS behavior should target
`macos/`.

### Product context

The repo blueprint (`docs/BLUEPRINT.md`) describes a larger personal intelligence dashboard with:

- a news mode
- an earnings intelligence mode
- local Ollama-driven summarization and RAG
- Redis, ChromaDB, Celery, and Docker-based infrastructure

The current implementation is mostly the news summary pipeline; the earnings/Ollama pieces are still planned or partially scaffolded.

## Key conventions and repo-specific patterns

- `backend/app/config.py` centralizes environment settings with `pydantic-settings`; add new secrets to `.env` instead of hardcoding them.
- Service singletons are attached to `app.state` in `backend/app/main.py`; route handlers use `request.app.state.*` instead of module globals for shared dependencies.
- API DTOs are defined in `backend/app/models/schemas.py`; whenever route payloads or response shapes change, update the corresponding model classes.
- News categories are modeled with `CategoryEnum` and exposed through `/news/categories` and `/preferences/categories`.
- The backend prefers HTTP exceptions + Pydantic models over ad hoc dict returns for API responses.
- The project currently mixes “done” and “planned” functionality; when editing, assume the working path is the news fetch/summarization flow and avoid introducing architecture assumptions from the future earnings roadmap unless the task explicitly targets it.
- Frontend code is intentionally small and component-driven; don’t add heavy app-state infrastructure unless the task requires it.
- Use the repo’s actual scripts (`npm run start`, `npm run lint`, `./venv/bin/pytest`) instead of older README examples that may be stale.

## Suggested working patterns

- If a task touches backend behavior, start by reading `backend/app/main.py` + the route file + relevant service file; this is the typical execution path.
- If a task touches UI behavior, inspect `desktop/src/App.tsx` and the component that owns the relevant state, then check the Electron main process only when OS/window integration is involved.
- Prefer changes that preserve the existing pattern of `app.state` services and Pydantic schemas rather than creating new global state.
