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

### Native macOS menu-bar client
```bash
cd macos
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

This is a macOS-only AppKit client using PyObjC. It places Hercules AI in the
menu bar and opens a native popover connected to the FastAPI backend.

### Docker (Full Stack)
```bash
docker compose up -d
```

## Documentation
See [docs/BLUEPRINT.md](docs/BLUEPRINT.md) for the full project blueprint.
