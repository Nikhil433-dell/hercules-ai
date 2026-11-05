# Sharing and hosting Hercules

Verified against the repository and official provider documentation on November 4, 2026.

Use three separate delivery surfaces:

| What someone needs | Where to put it | What it does |
| --- | --- | --- |
| Downloadable Mac app | GitHub Releases | Hosts the DMG and release notes |
| Product description and download link | GitHub Pages | Hosts a static showcase website |
| Live news and stock-price requests | Local FastAPI server, or a separate backend host | Calls providers using server-side credentials |

GitHub Releases supports downloadable binaries attached to a tagged version.
GitHub Pages publishes static HTML/CSS/JavaScript; it cannot run the Electron
menu-bar app or FastAPI backend. [Releases documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases),
[Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## What the current downloadable app requires

The packaged Mac app uses `http://127.0.0.1:8000` by default. It does not bundle
Python, start a backend, or install provider credentials. Someone downloading
the DMG must run their own configured backend, or connect to a trusted hosted
backend. The source project's `npm start` launcher can start a local backend;
that development convenience is separate from the packaged app.

Quit Hercules before changing its server. A developer can launch the installed
app from Terminal with a custom URL:

```bash
HERCULES_API_URL="https://YOUR-SERVICE.onrender.com" /Applications/Hercules.app/Contents/MacOS/Hercules
```

Replace the example URL with the actual service address. This setting applies
only to that launch. There is currently no persistent backend-URL control in
the app and no support for entering a backend login/token. A normal Finder
launch uses the default local URL again.

The first release should be described as a developer preview requiring backend
setup. Do not advertise an all-in-one install, authenticated hosted accounts,
universal company matching, guaranteed instant news, or a bundled earnings
calendar. Price availability depends on a configured financial-data provider;
news-provider keys alone do not provide stock prices. Quote times and provider
limits still apply. Code signing/notarization status and supported CPU
architecture must match the actual release artifact.

## Minimal Render Docker deployment

Render is the simplest documented hosted-backend path for this repository.
The following is a developer deployment recipe, not a completed deployment.
No hosting account or paid service is created by these instructions.

Before offering a shared hosted service, add authentication and per-user rate
limits or put an authenticated gateway in front of the backend. The current API
has neither: anyone reaching its URL can consume the server's provider quotas,
and `/news/summary` can invoke the configured LLM. CORS is a browser policy, not
API authentication. The current desktop also needs a way to supply any gateway
credentials before that authenticated service is usable from it.

1. Create a Render **Web Service** linked to this repository and the intended
   release branch. Select **Docker** as its language/runtime.
2. Set **Root Directory** to `backend`. Set **Dockerfile Path** to `Dockerfile`
   and **Docker Build Context Directory** to `.` relative to that root. The
   Dockerfile's `COPY requirements.txt` and `COPY . .` expect the backend context.
3. Keep the default Docker start command. The existing Dockerfile runs Uvicorn
   on `0.0.0.0:8000`; set Render's `PORT` variable to `8000` to match it. This
   Dockerfile does not expand the host's default `PORT=10000` automatically.
4. Set **Health Check Path** to `/health`. Set `DEBUG=false` in the service's
   environment settings. Add provider credentials there as secret environment
   variables: `GNEWS_API_KEY` and/or `NEWSAPI_KEY` for general news;
   `FINNHUB_API_KEY` for financial headlines and stock quotes. Keep `.env` and
   real values out of Git, the website, release assets, and Docker build files.
   The backend `.dockerignore` excludes local credentials and virtual environments.
5. Do not set `OPENAI_API_KEY` for this feed-only deployment. `/news/feed` does
   not require it, Redis, Postgres, ChromaDB, or Celery. Avoid deploying the full
   development Compose stack for this use case.
6. Configure `CORS_ORIGINS` as a JSON array if adding browser clients, for example
   `["https://Nikhil433-dell.github.io"]`. The desktop fetches in Electron's main
   process, so this browser-origin setting does not protect desktop/API traffic.
7. Deploy, then check `/health` and `/news/feed?category=business`. A healthy
   process does not prove that provider credentials work: check for real
   articles and `quote_status` in the feed response. The backend caches each
   category for 60 seconds in memory; caches reset after a restart and are
   separate across instances. Start with one instance for a developer preview.
8. Once access control is implemented, connect the desktop to the HTTPS service
   URL as described above. Publish that setup requirement alongside the DMG.

Official references: [Docker setup](https://render.com/docs/docker),
[monorepo root directories](https://render.com/docs/monorepo-support),
[port binding and web services](https://render.com/docs/web-services),
[environment variables and secrets](https://render.com/docs/configure-environment-variables).

Render's Free services sleep after 15 minutes without inbound traffic and can
need about a minute to wake. Hercules has a 30-second request timeout, so the
first request after sleep can fail and a later refresh can succeed. Free
instances also lose local files on restart/redeploy; they are unsuitable for
promising continuous alert availability. Use current plan terms when selecting
an always-on service. [Render Free limitations](https://render.com/docs/free).

## Other backend hosting options

**Railway:** suitable for a managed Docker service. Configure backend root/context,
server-side secret variables, and an exposed target port matching `8000`.
Alternatively change the server command to bind the provided `PORT`; the
current Dockerfile uses a fixed port. [Railway variables](https://docs.railway.com/variables),
[public networking](https://docs.railway.com/networking/public-networking).

**Fly.io:** suitable when you want control over machine placement and scaling.
Build from `backend/Dockerfile`, set the service's `internal_port` to `8000`,
and provide provider credentials through Fly secrets. The same authentication,
quota, and client-configuration work remains necessary.
[Fly app configuration](https://docs.fly.io/reference/configuration),
[Fly secrets](https://docs.fly.io/apps/secrets).

For the first public release, GitHub Pages plus a GitHub Release and a clearly
explained local-backend setup is the lowest-complexity option. A hosted shared
backend is a separate product step, because it needs access control and a
persistent server selection/login flow in the app.
