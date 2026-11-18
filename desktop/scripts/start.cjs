const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const desktop = path.resolve(__dirname, '..');
const backend = path.resolve(desktop, '../backend');
const localRequested = process.argv.includes('--local');
const ollamaEnabled = /^(1|true|yes|on|t|y)$/i.test(process.env.OLLAMA_ENABLED ?? 'false');
const requestedProvider = process.env.MARKET_ANALYSIS_PROVIDER || (ollamaEnabled ? 'ollama' : 'auto');
let port = '8000';
let baseURL = localRequested ? `http://127.0.0.1:${port}` : process.env.HERCULES_API_URL || require('../runtime-config.json').apiBaseUrl;
let server;
let client;
let stopping = false;

async function getHealth() {
  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(1000) });
    const body = await response.json();
    return response.ok && body.status === 'ok' && typeof body.version === 'string' ? body : null;
  } catch { return null; }
}

function matchesProvider(health) {
  const active = health.market_analysis_provider ?? (health.ollama_enabled ? 'ollama' : 'off');
  return requestedProvider === 'auto' || active === requestedProvider;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  client?.kill();
  server?.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

async function start() {
  let health = localRequested ? await getHealth() : null;
  if (health && !matchesProvider(health)) {
    console.log('The existing backend uses a different analysis provider. Using port 8010.');
    port = '8010';
    baseURL = `http://127.0.0.1:${port}`;
    health = await getHealth();
    if (health && !matchesProvider(health)) {
      throw new Error('Both local Hercules backends use a different analysis provider. Stop one and run npm run start:local again.');
    }
  }
  if (localRequested && !health) {
    const interpreters = process.platform === 'win32'
      ? [path.join(backend, 'venv/Scripts/python.exe'), path.join(backend, '.venv/Scripts/python.exe')]
      : [path.join(backend, 'venv/bin/python'), path.join(backend, '.venv/bin/python')];
    const python = process.env.HERCULES_PYTHON || interpreters.find(existsSync) || (process.platform === 'win32' ? 'python' : 'python3');
    console.log('Starting the local Hercules backend…');
    server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', port], {
      cwd: backend, stdio: 'inherit',
      // Leave unspecified settings to backend/.env and the backend defaults.
      env: { ...process.env },
    });
    let serverFailed = false;
    server.on('error', () => { serverFailed = true; });
    server.on('exit', () => { serverFailed = true; });
    let ready = false;
    for (let attempt = 0; attempt < 60 && !stopping && !serverFailed; attempt++) {
      const current = await getHealth();
      if (current && matchesProvider(current)) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('The backend could not start. Install backend/requirements.txt in backend/venv and check backend/.env, then retry.');
  }
  if (stopping) return;
  client = spawn(process.execPath, [require.resolve('@electron-forge/cli/dist/electron-forge.js'), 'start'], { cwd: desktop, stdio: 'inherit', env: { ...process.env, HERCULES_API_URL: baseURL } });
  client.on('error', () => { console.error('The desktop app could not start.'); stop(1); });
  client.on('exit', (code) => stop(code || 0));
}
start().catch((error) => { console.error(error.message); stop(1); });
