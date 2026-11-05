# Sharing and hosting Hercules

Updated for desktop preview 1.0.2 on November 5, 2026. The hosted Hercules API has been verified with `/health` and a live business feed; provider documentation references below describe optional self-hosting paths.

Use three separate delivery surfaces:

| What someone needs | Where to put it | What it does |
| --- | --- | --- |
| Downloadable Mac app | GitHub Releases | Hosts the DMG and release notes |
| Product description and download link | GitHub Pages | Hosts a static showcase website |
| Live news and stock-price requests | Hosted Hercules API on Vercel | Calls providers using server-side credentials |

GitHub Releases supports downloadable binaries attached to a tagged version.
GitHub Pages publishes static HTML/CSS/JavaScript; it cannot run the Electron
menu-bar app or FastAPI backend. [Releases documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases),
[Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Default hosted connection

Desktop preview 1.0.2 connects automatically to:

```text
https://hercules-ai-red.vercel.app
```

The shared default is stored in `desktop/runtime-config.json`. Both `npm start`
and packaged Finder launches use it. The API's `/health` endpoint and
`/news/feed?category=business` have been checked successfully, with 10 articles
and quote status `ready`. This is a point-in-time check, not an availability or
price-latency guarantee.

Someone downloading the DMG needs an internet connection; no local Python
server or personal API keys are required. Provider credentials belong in the
backend host's secret environment settings and are never bundled in the app or
website. The website itself stays static on GitHub Pages.

Price availability depends on the backend's financial-data connection, company
matching, and provider limits. Quote timestamps show when prices were observed.
The preview is ad-hoc signed and not notarized. It does not offer authenticated
hosted accounts, universal company matching, or an earnings calendar.

## Optional: use another backend

Developers can run a self-hosted backend with their own server-side news and
quote-provider keys. `npm run start:local` in `desktop/` starts or reuses a local
backend at `http://127.0.0.1:8000`, then launches the desktop against it. See the
README for Python environment setup. Plain `npm start` uses the hosted default
and does not start a local server.

Quit Hercules before changing its server. To override the installed app's URL
for one launch:

```bash
HERCULES_API_URL="http://127.0.0.1:8000" /Applications/Hercules.app/Contents/MacOS/Hercules
```

Replace the example URL with your trusted backend's address if hosting it
elsewhere. The setting applies only to that launch. There is currently no
persistent backend-URL control in the app and no support for entering a backend
login/token. A normal Finder launch uses the hosted default again.

## Optional: Render Docker deployment

The default service is already hosted on Vercel. The following Render recipe
is an alternative for developers who want their own Docker-based backend; it
does not change or redeploy the default service. No hosting account or paid
service is created by these instructions.

When operating a shared hosted service, account for provider-quota exposure.
The current API has no authentication or per-user rate limits: anyone reaching its URL can consume the server's provider quotas,
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
8. Connect a development desktop to your HTTPS service using the URL override
   above. An authenticated gateway also needs desktop support for passing its
   credentials; the current app does not implement that login flow.

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

The default distribution uses GitHub Pages for the showcase, GitHub Releases
for the desktop installers, and Vercel for the hosted API. Local and alternative
hosted backends are optional development choices. Release notes should identify
the default service URL and actual signing status of each preview.
