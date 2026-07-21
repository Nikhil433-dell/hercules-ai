# Hercules AI - News Agent

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

### Desktop
```bash
cd desktop
npm install
npm run dev
```

### Docker (Full Stack)
```bash
docker compose up -d
```

## Documentation
See [docs/BLUEPRINT.md](docs/BLUEPRINT.md) for the full project blueprint.
