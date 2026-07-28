# 🧠 Hercules AI — Personal Intelligence Dashboard

> An AI-powered Mac desktop agent that delivers personalized news briefings **and** earnings
> intelligence on every system wake. Built with Electron, FastAPI, LangChain, Ollama (local LLM),
> and Docker.

---

## 0. Product Vision (Updated)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Mac opens / unlocks → Hercules AI activates                        │
│  → Fetches latest news  AND  upcoming earnings announcements        │
│  → Local Llama 3.1 (Ollama) summarizes + analyzes both             │
│  → Shows pinned side panel:                                         │
│       [📰 News Tab]   AI-summarized world + tech + finance news     │
│       [📈 Earnings Tab]  Watchlist companies + AI buy signals       │
│  → 2-min auto-hide → Minimize to floating circle icon               │
│  → Click anytime to expand                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Two Modules, One App

| Module | Purpose |
|--------|---------|
| **📰 News Mode** | AI-summarized news across Tech, World, Finance, Sports |
| **📈 Earnings Mode** | Earnings calendar, watchlist, AI predictions, company deep-dives |

Both run on the same Electron shell, FastAPI backend, and local Ollama LLM.

---

## 1. High-Level Architecture (Full System)

```mermaid
graph TB
    subgraph "Desktop Layer (Electron)"
        A[System Event Listener<br/>Detect Unlock / Open] --> B[Desktop Overlay Widget<br/>Side Panel + Circle Icon]
        B --> C1[📰 News Tab<br/>React Component]
        B --> C2[📈 Earnings Tab<br/>React Component]
    end

    subgraph "Backend Layer (FastAPI + Docker)"
        D[FastAPI Server]

        subgraph "News Pipeline"
            D --> E1[News Aggregator]
            E1 --> F1[NewsAPI / GNews / RSS]
        end

        subgraph "Earnings Pipeline"
            D --> E2[Earnings Aggregator]
            E2 --> F2[SEC EDGAR API]
            E2 --> F3[Alpha Vantage / FMP]
            E2 --> F4[Earnings Whispers / Yahoo Finance]
        end

        subgraph "AI Engine (Local)"
            D --> G[Ollama Server<br/>Llama 3.1 8B / Mistral 7B]
            G --> G1[News Summarizer Chain]
            G --> G2[Earnings Analyst Chain]
            G --> G3[Buy Signal Chain]
            G --> G4[Company Deep-Dive RAG]
        end

        D --> H[Cache Layer - Redis]
        D --> I[Vector DB - ChromaDB<br/>Articles + Filings]
    end

    C1 <-->|WebSocket / REST| D
    C2 <-->|WebSocket / REST| D

    subgraph "Infrastructure"
        J[Docker Compose]
        K[PostgreSQL / SQLite<br/>User Prefs + Watchlist + History]
        L[Celery + Redis<br/>Scheduled Jobs]
    end

    D --> K
    L --> D
    J --> D
    J --> H
    J --> K
```

---

## 2. Tech Stack Breakdown

### 🖥️ Desktop App (Frontend)

| Layer | Technology | Why |
|-------|-----------|-----|
| **Desktop Framework** | **Electron** | Cross-platform, system events, always-on-top |
| **UI Framework** | **React + TypeScript** | Component-based, tabs, real-time state |
| **Styling** | **CSS Modules + Framer Motion** | Glassmorphism panel, smooth tab transitions |
| **State Management** | **Zustand** | Lightweight, perfect for widget-scale state |
| **Communication** | **WebSocket + REST** | Real-time push + on-demand data fetches |
| **Charts** | **Recharts** | Earnings history sparklines, EPS trend charts |

### ⚙️ Backend (API + AI)

| Layer | Technology | Why |
|-------|-----------|-----|
| **API Server** | **FastAPI (Python)** | Async, fast, Pydantic validation, Swagger docs |
| **Local LLM** | **Ollama (Llama 3.1 8B / Mistral 7B)** | Runs fully on Mac, no API cost, privacy-first |
| **LLM Orchestration** | **LangChain** | Chains, RAG, prompt templates, memory |
| **Vector DB** | **ChromaDB** | Store + search articles and SEC filings for RAG |
| **Embeddings** | **nomic-embed-text (via Ollama)** | Local embeddings, no OpenAI needed |
| **News Sources** | **NewsAPI.org + RSS feeds** | Free tier, broad financial & general coverage |
| **Earnings Data** | **SEC EDGAR + Alpha Vantage + FMP** | Authoritative earnings calendar and EPS history |
| **Stock Data** | **yfinance (Yahoo Finance)** | Real-time price, historical OHLCV, analyst targets |
| **Cache** | **Redis** | Cache summaries + avoid redundant API calls |
| **Database** | **PostgreSQL** | Watchlist, user prefs, earnings history |
| **Task Queue** | **Celery + Redis** | Scheduled earnings fetch, background analysis |

### 🐳 Infrastructure

| Layer | Technology | Why |
|-------|-----------|-----|
| **Containerization** | **Docker + Docker Compose** | Ollama + FastAPI + Redis + Postgres + ChromaDB |
| **CI/CD** | **GitHub Actions** | Auto-build, test, push Docker images |
| **Monitoring** | **Prometheus + Grafana** (optional) | Observe API health and LLM latency |

---

## 3. Project Phases (Full Build Order)

---

### Phase 1 — Foundation (Week 1-2) ✅ COMPLETE
> **Goal**: Working backend that fetches and summarizes news

```
✅ Set up Python project with FastAPI
✅ Integrate NewsAPI / GNews for fetching headlines
✅ Build a basic summarization chain with LangChain + OpenAI
✅ Create REST endpoints: GET /news/summary, GET /news/categories
✅ Add Redis caching (don't re-summarize same articles)
✅ Write unit tests with pytest
✅ Dockerize the backend (Dockerfile + docker-compose.yml)
```

**Key deliverable**: `curl localhost:8000/news/summary` returns AI-summarized news

---

### Phase 2 — Desktop Widget Shell (Week 3-4) ✅ COMPLETE
> **Goal**: Create the desktop overlay with Electron

```
✅ Initialize Electron app with React frontend
✅ Create the side panel component (300px wide, right-aligned)
✅ Implement always-on-top window with transparency
✅ Build the floating circle icon (minimize state)
✅ Add slide-in/slide-out animations
✅ Implement 2-minute auto-minimize timer
✅ Connect to backend API and display real news
✅ System tray integration (right-click menu)
```

**Key deliverable**: Transparent side panel showing news, auto-hides after 2 min

---

### Phase 3 — System Integration (Week 5)
> **Goal**: Auto-trigger on laptop open + polish UX

```
✅ Detect system unlock/wake events (OS-level hooks)
   - macOS: "unlock" events via Electron powerMonitor API
✅ Auto-fetch fresh news on wake
✅ Add user preferences (categories, refresh interval)
✅ Implement reading history / bookmarks
✅ Add "Read More" links to full articles
✅ Dark/Light theme toggle
```

---

### Phase 4 — Local LLM Migration (Week 6)
> **Goal**: Swap OpenAI for a fully local Llama 3.1 model via Ollama

This is the **most important learning phase** — you will understand how transformer
LLMs work by setting one up, running it, tuning prompts, and observing outputs.

#### 4a. Install & Run Ollama on Mac
```bash
# Install Ollama (runs as a local server on port 11434)
brew install ollama

# Pull the model (downloads ~5GB)
ollama pull llama3.1:8b

# Pull local embedding model (needed for RAG)
ollama pull nomic-embed-text

# Verify it works
ollama run llama3.1:8b "Summarize this earnings report in 3 bullet points: ..."
```

#### 4b. How Ollama / Llama 3.1 Works (The Learning Goal)
```
┌──────────────────────────────────────────────────────────────────┐
│  TRANSFORMER LLM — How It Works (Simplified)                     │
│                                                                  │
│  Input Text (your prompt)                                        │
│       ↓                                                          │
│  Tokenizer → Converts words to integer token IDs                │
│       ↓                                                          │
│  Embedding Layer → Maps tokens to dense vectors (numbers)        │
│       ↓                                                          │
│  Transformer Blocks (32 layers in Llama 3.1 8B)                 │
│    Each block has:                                               │
│      - Multi-Head Self-Attention (tokens "look at" each other)  │
│      - Feed-Forward Network (applies learned transformations)    │
│      - Layer Normalization                                       │
│       ↓                                                          │
│  Output Head → Predicts probability distribution over all tokens │
│       ↓                                                          │
│  Sampling Strategy (temperature, top-p) → Pick next token       │
│       ↓                                                          │
│  Repeat until EOS token → Full response generated               │
└──────────────────────────────────────────────────────────────────┘
```

Key concepts to understand as you build:
| Concept | What It Means for Your App |
|---------|---------------------------|
| **Temperature** | Lower (0.1) = more factual for earnings analysis; Higher (0.8) = more creative for narrative summaries |
| **Context Window** | Llama 3.1 8B has 128K tokens — you can feed full SEC filings |
| **System Prompt** | Defines the model's "persona" — e.g., "You are a senior financial analyst..." |
| **Streaming** | Generate tokens one-by-one for real-time display in the side panel |
| **RAG** | Retrieve relevant article chunks → inject into context → LLM reasons over fresh data |

#### 4c. Update LangChain to Use Ollama

```python
# backend/app/services/llm.py
from langchain_ollama import ChatOllama, OllamaEmbeddings

# For analysis (low temperature = more factual)
earnings_llm = ChatOllama(
    model="llama3.1:8b",
    temperature=0.1,
    base_url="http://localhost:11434"
)

# For summaries (slightly higher = more natural language)
summary_llm = ChatOllama(
    model="llama3.1:8b",
    temperature=0.3,
    base_url="http://localhost:11434"
)

# For embeddings (RAG)
embeddings = OllamaEmbeddings(
    model="nomic-embed-text",
    base_url="http://localhost:11434"
)
```

**Key deliverable**: Full app running with zero OpenAI calls — 100% local inference

---

### Phase 5 — Earnings Intelligence Module (Week 7-8)
> **Goal**: Build the earnings watchlist, calendar, and AI analysis engine

This is the **new flagship feature** of Hercules AI.

#### 5a. Data Sources & APIs

| Source | What It Provides | Cost | Python Library |
|--------|-----------------|------|---------------|
| **SEC EDGAR** | Official earnings filings (10-Q, 10-K, 8-K), EPS actuals | Free | `requests` + `edgar` |
| **Alpha Vantage** | Earnings calendar, EPS estimates vs actuals | Free tier (25 req/day) | `alpha_vantage` |
| **Financial Modeling Prep (FMP)** | Earnings surprises, transcripts, analyst estimates | Free tier | `requests` |
| **yfinance** | Real-time price, historical OHLCV, analyst targets, news | Free | `yfinance` |
| **Earnings Whispers** | Community EPS estimates, whisper numbers | Free (scraping) | `BeautifulSoup` |
| **NewsAPI** | Company-specific news articles | Free tier | `newsapi-python` |

```python
# Example: Fetch upcoming earnings for watchlist
# backend/app/services/earnings_fetcher.py
import yfinance as yf

def get_upcoming_earnings(tickers: list[str]) -> list[dict]:
    results = []
    for ticker in tickers:
        stock = yf.Ticker(ticker)
        info = stock.info
        calendar = stock.calendar
        results.append({
            "ticker": ticker,
            "company": info.get("longName"),
            "earnings_date": calendar.get("Earnings Date", [None])[0],
            "eps_estimate": calendar.get("EPS Estimate"),
            "revenue_estimate": calendar.get("Revenue Estimate"),
            "current_price": info.get("currentPrice"),
            "52w_high": info.get("fiftyTwoWeekHigh"),
            "analyst_target": info.get("targetMeanPrice"),
        })
    return results
```

#### 5b. Backend Endpoints (New)

```
GET  /earnings/calendar           → Earnings dates for watchlist (next 30 days)
GET  /earnings/company/{ticker}   → Full company analysis for one ticker
GET  /earnings/watchlist          → User's saved watchlist
POST /earnings/watchlist          → Add ticker to watchlist
DEL  /earnings/watchlist/{ticker} → Remove ticker
GET  /earnings/predictions        → AI predictions ranked by confidence
WS   /earnings/stream             → Real-time updates when new data arrives
```

#### 5c. AI Earnings Analyst Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  EARNINGS AI PIPELINE                                           │
│                                                                 │
│  1. DATA INGESTION (Celery scheduled job — runs daily at 6am)  │
│     → Fetch earnings calendar from Alpha Vantage/FMP            │
│     → Fetch company news articles from NewsAPI                  │
│     → Fetch historical EPS data from SEC EDGAR                  │
│     → Fetch analyst consensus estimates from yfinance           │
│                                                                 │
│  2. EMBEDDING + INDEXING (ChromaDB)                            │
│     → Chunk articles into 512-token segments                    │
│     → Embed with nomic-embed-text (Ollama)                     │
│     → Store in ChromaDB with ticker + date metadata             │
│                                                                 │
│  3. AI ANALYSIS CHAINS (LangChain + Llama 3.1)                │
│     Chain A: Earnings Beat Predictor                            │
│       → Context: Last 8 quarters EPS history                   │
│       → Context: Analyst consensus vs whisper number           │
│       → Context: Sector performance this quarter                │
│       → Output: Beat/Miss/Meet probability + reasoning          │
│                                                                 │
│     Chain B: Company Health Scorer                              │
│       → Context: Retrieved articles (RAG)                       │
│       → Context: Revenue growth, margins, guidance              │
│       → Output: 1-10 trust score + key risk factors            │
│                                                                 │
│     Chain C: Buy Timing Advisor                                 │
│       → Context: Historical price behavior around earnings      │
│       → Context: Current IV (options implied volatility)        │
│       → Output: "Buy X days before" recommendation + rationale │
│                                                                 │
│     Chain D: Profit/Loss Estimator                              │
│       → Context: Average post-earnings move (historical)        │
│       → Context: Current analyst price targets                  │
│       → Output: Estimated upside %, downside %, expected move  │
└─────────────────────────────────────────────────────────────────┘
```

#### 5d. LangChain Prompt Templates (Earnings)

```python
# backend/app/services/earnings_analyst.py
from langchain_core.prompts import ChatPromptTemplate

EARNINGS_PREDICTION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a senior quantitative analyst with 20 years of experience
    analyzing public company earnings. You provide data-driven, objective analysis.
    Always cite specific data points in your reasoning. Never give financial advice —
    only probabilistic analysis based on historical patterns."""),

    ("human", """Analyze the upcoming earnings for {company} ({ticker}).

    HISTORICAL EPS (last 8 quarters):
    {eps_history}

    ANALYST CONSENSUS: ${eps_estimate} EPS | Revenue: ${revenue_estimate}B
    WHISPER NUMBER: ${whisper_eps} (community estimate)
    SECTOR PERFORMANCE THIS QUARTER: {sector_performance}

    Provide:
    1. BEAT PROBABILITY: X% — with specific reasoning
    2. KEY CATALYSTS: 3 bullet points that could drive a beat or miss
    3. RISK FACTORS: 2 bullet points of main downside risks
    4. CONFIDENCE LEVEL: High / Medium / Low — based on data quality

    Be concise. Max 200 words.""")
])

BUY_TIMING_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a technical analyst specializing in earnings event trading.
    Analyze price behavior patterns around earnings announcements objectively."""),

    ("human", """Analyze buy timing for {company} ({ticker}) before their earnings on {earnings_date}.

    HISTORICAL POST-EARNINGS MOVES (last 8 quarters):
    {historical_moves}

    CURRENT PRICE: ${current_price}
    ANALYST TARGET: ${analyst_target}
    AVERAGE POST-EARNINGS MOVE: +/-{avg_move}%
    IMPLIED VOLATILITY (options): {implied_vol}%

    Provide:
    1. TIMING SUGGESTION: Buy X days before earnings / Wait until after / Avoid
    2. PRICE TARGETS: Upside scenario $X | Downside scenario $Y
    3. ESTIMATED MOVE: Expected +/-X% post-announcement
    4. SUGGESTED POSITION SIZE: Conservative / Moderate / Aggressive sizing rationale

    Keep it concise and data-driven. Max 150 words.""")
])
```

#### 5e. Scheduled Jobs (Celery)

```python
# backend/app/tasks/earnings_tasks.py
from celery import Celery
from celery.schedules import crontab

app = Celery("hercules")

app.conf.beat_schedule = {
    # Refresh earnings calendar daily at 6:00 AM
    "refresh-earnings-calendar": {
        "task": "tasks.fetch_earnings_calendar",
        "schedule": crontab(hour=6, minute=0),
    },
    # Pre-market analysis on earnings day at 7:00 AM
    "earnings-day-analysis": {
        "task": "tasks.run_earnings_analysis",
        "schedule": crontab(hour=7, minute=0),
    },
    # News sentiment refresh every 2 hours
    "refresh-company-news": {
        "task": "tasks.fetch_company_news",
        "schedule": crontab(minute=0, hour="*/2"),
    },
    # After-hours results ingestion at 5:00 PM
    "ingest-earnings-results": {
        "task": "tasks.ingest_earnings_results",
        "schedule": crontab(hour=17, minute=0),
    },
}
```

---

### Phase 6 — Earnings UI (Week 9)
> **Goal**: Build the 📈 Earnings Tab in the Electron side panel

#### 6a. New React Components

```
desktop/src/renderer/components/
├── earnings/
│   ├── EarningsTab.tsx           # Main tab container
│   ├── EarningsCalendar.tsx      # Upcoming earnings list + dates
│   ├── CompanyCard.tsx           # Per-company summary card
│   ├── WatchlistManager.tsx      # Add/remove tickers
│   ├── AIAnalysisPanel.tsx       # Beat prediction + buy timing
│   ├── EarningsChart.tsx         # EPS history sparkline (Recharts)
│   ├── ArticleFeed.tsx           # Related news articles for company
│   └── InvestDecisionSummary.tsx # Final AI "Should I invest?" verdict
```

#### 6b. Earnings Card UI Design

```
┌─────────────────────────────────────────────────┐
│  AAPL  Apple Inc.              Earnings: Aug 1  │
│  $212.45  ▲ 1.2%                               │
├─────────────────────────────────────────────────┤
│  🤖 AI Prediction: BEAT (72% confidence)        │
│  EPS Estimate: $1.42  |  Whisper: $1.47         │
│                                                 │
│  ████████████████░░░░  72% Beat Probability     │
│                                                 │
│  ⏱ Buy Timing: 3 days before (Aug 1 → Jul 29)  │
│  📈 Upside: +8.2%  |  📉 Downside: -4.1%       │
├─────────────────────────────────────────────────┤
│  🏥 Company Health Score: 8.2 / 10  ██████████ │
│  Key Risk: iPhone demand in China               │
├─────────────────────────────────────────────────┤
│  📰 3 related articles  [Expand ▾]              │
│  [Full Analysis] [Add to Watchlist] [Dismiss]   │
└─────────────────────────────────────────────────┘
```

#### 6c. The "Should I Invest?" Final Verdict

The app will generate a one-paragraph AI investment brief per company, synthesizing:
- Beat probability
- Company health score
- Buy timing recommendation
- Estimated move size
- Top risk factor

This gives you enough to make an informed decision within 30 seconds of seeing the popup.

---

### Phase 7 — AI Agent Enhancement (Week 10)
> **Goal**: Add conversational AI and deep personalization across both modules

```
□ Add chat interface in expanded panel
   - "Why do you think Apple will beat earnings?"
   - "Show me companies with >80% beat probability this week"
   - "What happened after NVDA's last 3 earnings?"
□ Add personalization: learn from what user acts on vs dismisses
□ Implement topic clustering for news (group related stories)
□ Add voice briefing option (TTS via macOS native API)
□ Add portfolio tracking: show how predictions performed historically
□ Earnings post-mortem: after results, show prediction accuracy
```

---

### Phase 8 — Production & Deployment (Week 11-12)
> **Goal**: Ship it, Docker deploy, CI/CD

```
□ Production Docker Compose (FastAPI + Ollama + Redis + Postgres + ChromaDB)
□ Environment variable management (.env, secrets)
□ GitHub Actions CI/CD pipeline
□ Auto-build desktop app binaries (electron-builder / Electron Forge)
□ Write README with architecture diagram
□ Create demo video / GIF for resume
□ Deploy backend to cloud (Railway / Fly.io) — optional, Ollama stays local
```

---

## 4. Full File/Folder Structure

```
hercules-ai/
├── docs/
│   └── BLUEPRINT.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── news.py               # News endpoints
│   │   │   │   ├── earnings.py           # NEW: Earnings endpoints
│   │   │   │   ├── watchlist.py          # NEW: Watchlist CRUD
│   │   │   │   └── preferences.py        # User settings
│   │   │   └── websocket.py
│   │   ├── services/
│   │   │   ├── news_fetcher.py
│   │   │   ├── summarizer.py
│   │   │   ├── earnings_fetcher.py       # NEW: SEC/AV/FMP/yfinance
│   │   │   ├── earnings_analyst.py       # NEW: LangChain AI chains
│   │   │   ├── company_rag.py            # NEW: ChromaDB RAG pipeline
│   │   │   ├── llm.py                    # NEW: Ollama LLM setup
│   │   │   ├── agent.py
│   │   │   └── cache.py
│   │   ├── tasks/
│   │   │   ├── earnings_tasks.py         # NEW: Celery scheduled jobs
│   │   │   └── news_tasks.py
│   │   ├── models/
│   │   │   ├── schemas.py
│   │   │   ├── earnings_schemas.py       # NEW: Earnings Pydantic models
│   │   │   └── database.py
│   │   └── config.py
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
│
├── desktop/
│   ├── src/
│   │   ├── main/
│   │   │   └── main.ts
│   │   ├── renderer/
│   │   │   ├── components/
│   │   │   │   ├── news/
│   │   │   │   │   ├── SidePanel.tsx
│   │   │   │   │   ├── NewsCard.tsx
│   │   │   │   │   └── ChatInterface.tsx
│   │   │   │   ├── earnings/             # NEW
│   │   │   │   │   ├── EarningsTab.tsx
│   │   │   │   │   ├── EarningsCalendar.tsx
│   │   │   │   │   ├── CompanyCard.tsx
│   │   │   │   │   ├── WatchlistManager.tsx
│   │   │   │   │   ├── AIAnalysisPanel.tsx
│   │   │   │   │   ├── EarningsChart.tsx
│   │   │   │   │   ├── ArticleFeed.tsx
│   │   │   │   │   └── InvestDecisionSummary.tsx
│   │   │   │   ├── shared/
│   │   │   │   │   ├── FloatingIcon.tsx
│   │   │   │   │   ├── TabBar.tsx        # NEW: News | Earnings tabs
│   │   │   │   │   └── Settings.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useNewsStream.ts
│   │   │   │   ├── useEarningsStream.ts  # NEW
│   │   │   │   └── useSystemEvents.ts
│   │   │   ├── styles/
│   │   │   │   ├── panel.css
│   │   │   │   ├── earnings.css          # NEW
│   │   │   │   └── animations.css
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   └── preload.ts
│   └── package.json
│
├── docker-compose.yml
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       └── desktop-build.yml
└── README.md
```

---

## 5. Docker Compose (Updated for Ollama)

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [redis, postgres, chromadb]
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://hercules:password@postgres:5432/hercules

  celery_worker:
    build: ./backend
    command: celery -A app.tasks worker --loglevel=info
    depends_on: [redis, backend]

  celery_beat:
    build: ./backend
    command: celery -A app.tasks beat --loglevel=info
    depends_on: [redis]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: hercules
      POSTGRES_USER: hercules
      POSTGRES_PASSWORD: password
    ports: ["5432:5432"]
    volumes: ["postgres_data:/var/lib/postgresql/data"]

  chromadb:
    image: chromadb/chroma:latest
    ports: ["8001:8000"]
    volumes: ["chroma_data:/chroma/chroma"]

# NOTE: Ollama runs natively on your Mac (not in Docker)
# so it has full access to your Apple Silicon GPU (Metal)
# Start it with: ollama serve

volumes:
  postgres_data:
  chroma_data:
```

---

## 6. What You Need to Learn (Updated Skill Map)

### 🟢 Priority 1 — Core (Already Building)

| Skill | Status |
|-------|--------|
| Python + FastAPI | ✅ Done |
| LangChain | ✅ Done |
| React + TypeScript | ✅ Done |
| Docker | ✅ Done |
| WebSockets | ✅ Done |
| Electron | ✅ Done |

### 🟡 Priority 2 — New: AI + Finance

| Skill | What to Learn | Resource |
|-------|--------------|----------|
| **Ollama + Local LLMs** | Run Llama 3.1 locally, model management, API | [Ollama Docs](https://ollama.com/docs) |
| **Transformer Architecture** | Attention mechanism, tokens, temperature, context window | [Andrej Karpathy's videos](https://www.youtube.com/@AndrejKarpathy) |
| **RAG (Retrieval-Augmented Generation)** | ChromaDB, embeddings, semantic search, chunk strategy | [LangChain RAG tutorial](https://python.langchain.com/docs/tutorials/rag/) |
| **Financial APIs** | yfinance, Alpha Vantage, SEC EDGAR structure | yfinance docs, EDGAR full-text search |
| **Prompt Engineering (Finance)** | System prompts, chain-of-thought for analysis | Anthropic/OpenAI prompt guides |
| **Celery Beat** | Scheduled tasks, crontab expressions | [Celery docs](https://docs.celeryq.dev/) |

### 🔵 Priority 3 — UI Enhancements

| Skill | What to Learn | Resource |
|-------|--------------|----------|
| **Recharts** | Sparklines, bar charts, custom tooltips | [Recharts docs](https://recharts.org/) |
| **Framer Motion** | Layout animations, tab transitions | [Framer Motion docs](https://www.framer.com/motion/) |
| **CSS Glassmorphism** | backdrop-filter, rgba, blur effects | MDN Web Docs |

---

## 7. Environment Variables (.env)

```bash
# LLM (Local — no API key needed for Ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Fallback cloud LLM (optional)
OPENAI_API_KEY=sk-...

# News
NEWSAPI_KEY=...

# Financial Data (all have free tiers)
ALPHA_VANTAGE_KEY=...       # 25 req/day free → https://www.alphavantage.co/
FMP_API_KEY=...             # 250 req/day free → https://financialmodelingprep.com/

# yfinance — no API key needed (uses Yahoo Finance scraping)

# Infrastructure
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://hercules:password@localhost:5432/hercules
CHROMADB_URL=http://localhost:8001
```

---

## 8. Resume Impact (Updated)

> **This project now checks every single box recruiters care about in AI/Finance/Systems:**

| Resume Keyword | Coverage |
|---------------|---------|
| **Local LLM / On-Device AI** | Ollama + Llama 3.1 running fully on Mac |
| **RAG Systems** | ChromaDB + nomic-embed-text + LangChain |
| **Financial Data Engineering** | SEC EDGAR, Alpha Vantage, yfinance pipelines |
| **AI Agent Design** | Multi-chain LangChain agents with reasoning |
| **Transformer Understanding** | Built prompts, tuned temperature, understood outputs |
| **Full-Stack Development** | React + FastAPI |
| **Desktop Application** | Electron + system events |
| **Microservices** | Docker Compose multi-service |
| **Real-Time Systems** | WebSocket, Celery beat scheduling |
| **DevOps / CI-CD** | Docker, GitHub Actions |
| **Database Design** | PostgreSQL schema, Redis, ChromaDB |
| **Prompt Engineering** | Finance-domain system prompts, chain-of-thought |

### How to Present It

```
📌 Hercules AI — Personal Intelligence Dashboard

Built a Mac desktop AI agent that activates on system wake and delivers
personalized news briefings and earnings intelligence via a glassmorphism
overlay panel. Runs Llama 3.1 8B locally via Ollama for zero-API-cost
inference. Features a multi-chain LangChain earnings analyst that predicts
EPS beat probability, suggests buy timing, and estimates post-earnings
price moves — all grounded in real SEC filings and news via a RAG pipeline.

Tech: Python · FastAPI · LangChain · Llama 3.1 · Ollama · ChromaDB · 
      React · TypeScript · Electron · Celery · Redis · PostgreSQL ·
      Docker · yfinance · SEC EDGAR · WebSocket · GitHub Actions
```

---

## 9. Getting Started — Next Steps

```bash
# Step 1: Install Ollama and pull the model
brew install ollama
ollama pull llama3.1:8b
ollama pull nomic-embed-text
ollama serve  # starts on http://localhost:11434

# Step 2: Add new Python dependencies
cd backend && source venv/bin/activate
pip install langchain-ollama yfinance chromadb alpha_vantage celery[redis] flower

# Step 3: Add Recharts to desktop
cd desktop
npm install recharts

# Step 4: Start building Phase 4 — swap LangChain to Ollama
# Edit: backend/app/services/llm.py
# Then run the backend and verify local LLM responses
uvicorn app.main:app --reload
```

> **Recommended build order**: Phase 4 (local LLM) → Phase 5 (earnings data) →
> Phase 6 (earnings UI) → Phase 7 (AI chat) → Phase 8 (ship it).
>
> Each phase has a clear, demo-able deliverable. Don't move to the next
> until the current one works end-to-end.
