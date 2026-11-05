const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const desktop = path.resolve(__dirname, '..');
const backend = path.resolve(desktop, '../backend');
const localRequested = process.argv.includes('--local');
const baseURL = localRequested ? 'http://127.0.0.1:8000' : process.env.HERCULES_API_URL || require('../runtime-config.json').apiBaseUrl;
let server;
let client;
let stopping = false;

async function healthy() {
  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(1000) });
    const body = await response.json();
    return response.ok && body.status === 'ok' && typeof body.version === 'string';
  } catch { return false; }
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
  if (localRequested && !(await healthy())) {
    const interpreters = process.platform === 'win32'
      ? [path.join(backend, 'venv/Scripts/python.exe'), path.join(backend, '.venv/Scripts/python.exe')]
      : [path.join(backend, 'venv/bin/python'), path.join(backend, '.venv/bin/python')];
    const python = process.env.HERCULES_PYTHON || interpreters.find(existsSync) || (process.platform === 'win32' ? 'python' : 'python3');
    console.log('Starting the local Hercules backend…');
    server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], { cwd: backend, stdio: 'inherit' });
    let serverFailed = false;
    server.on('error', () => { serverFailed = true; });
    server.on('exit', () => { serverFailed = true; });
    let ready = false;
    for (let attempt = 0; attempt < 60 && !stopping && !serverFailed; attempt++) {
      if (await healthy()) { ready = true; break; }
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
