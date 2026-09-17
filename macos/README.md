# Native macOS client

This directory contains the native AppKit replacement for the Electron shell.
It places a Hercules AI icon in the macOS menu bar and opens a native popover
when clicked. The popover calls the existing FastAPI news endpoints.

The menu-bar icon uses the transparent H asset at
`desktop/src/assets/trayTemplate.svg`; the blue circular placeholder is no
longer used.

## Run locally

From the repository root:

```bash
cd macos
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Start the backend separately:

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

The native client expects the backend at `http://localhost:8000`.

## Build a macOS app

```bash
cd macos
source venv/bin/activate
pip install py2app
python setup.py py2app
open dist/Hercules\ AI.app
```

The generated app is a menu-bar-only application (`LSUIElement`) and does not
show a Dock icon.
