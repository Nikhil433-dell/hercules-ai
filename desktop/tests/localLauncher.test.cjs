const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

async function launch(env, healthFor) {
  const filename = path.resolve(__dirname, '../scripts/start.cjs');
  const starts = [];
  const childProcess = {
    spawn(command, args, options) {
      starts.push({ command, args, options });
      return new EventEmitter();
    },
  };
  const load = (name) => name === 'node:child_process' ? childProcess : require(name);
  load.resolve = require.resolve;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: load,
    __dirname: path.dirname(filename),
    process: { argv: ['node', filename, '--local'], env, platform: 'darwin', execPath: process.execPath, on() {} },
    console: { log() {}, error(message) { assert.fail(message); } },
    AbortSignal,
    fetch: async (url) => {
      const provider = healthFor(url, starts);
      return {
        ok: provider !== null,
        json: async () => ({ status: 'ok', version: '0.1.0', market_analysis_provider: provider }),
      };
    },
  }, { filename });
  await new Promise(setImmediate);
  return starts;
}

test('local launcher reuses an analyzed backend when no provider override is requested', async () => {
  const starts = await launch({ GEMINI_API_KEY: 'test-key' }, () => 'gemini');
  assert.equal(starts.length, 1);
  assert.equal(starts[0].options.env.HERCULES_API_URL, 'http://127.0.0.1:8000');
});

test('local launcher leaves provider and Ollama defaults to backend configuration', async () => {
  const starts = await launch({}, (_url, children) => children.length ? 'ollama' : null);
  assert.equal(starts.length, 2);
  assert.equal(starts[0].args.at(-1), '8000');
  assert.equal(Object.hasOwn(starts[0].options.env, 'MARKET_ANALYSIS_PROVIDER'), false);
  assert.equal(Object.hasOwn(starts[0].options.env, 'OLLAMA_ENABLED'), false);
});

test('an explicit shell provider override gets a matching backend and remains intact', async () => {
  const starts = await launch({ MARKET_ANALYSIS_PROVIDER: 'off', OLLAMA_ENABLED: 'false' }, (url, children) => {
    if (url.includes(':8000/')) return 'gemini';
    return children.length ? 'off' : null;
  });
  assert.equal(starts.length, 2);
  assert.equal(starts[0].args.at(-1), '8010');
  assert.equal(starts[0].options.env.MARKET_ANALYSIS_PROVIDER, 'off');
  assert.equal(starts[0].options.env.OLLAMA_ENABLED, 'false');
  assert.equal(starts[1].options.env.HERCULES_API_URL, 'http://127.0.0.1:8010');
});
