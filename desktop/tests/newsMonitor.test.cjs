const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
// Transpile just this dependency-free service; full project type checking runs separately.
const filename = path.resolve(__dirname, '../src/services/newsMonitor.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const serviceModule = new Module(filename, module);
serviceModule.filename = filename;
serviceModule.paths = module.paths;
serviceModule._compile(compiled, filename);
const { NewsMonitor, normalizeHeadlines } = serviceModule.exports;

function headline(id) {
  return { title: `Story ${id}`, url: `https://example.com/${id}`, description: 'Details', published_at: '2026-11-02T15:00:00Z', tickers: ['AAPL'] };
}
function harness(stored = { mode: 'live' }) {
  let storage = stored;
  let response = { articles: [headline('one')] };
  let fail = false;
  const notifications = [];
  const monitor = new NewsMonitor({
    load: () => storage,
    save: (next) => { storage = next; },
    fetchHeadlines: async () => { if (fail) throw new Error('Offline'); return response; },
    onState: () => {}, onArticle: (article) => notifications.push(article),
  });
  return { monitor, notifications, get storage() { return storage; }, setResponse(value) { response = value; }, fail() { fail = true; } };
}

test('initial headlines establish baseline, new articles alert only once, restart preserves history', async () => {
  const h = harness();
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 0);
  h.setResponse({ articles: [headline('two'), headline('one')] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].title, 'Story two');
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  const restarted = harness(h.storage);
  restarted.setResponse({ articles: [headline('two'), headline('one')] });
  await restarted.monitor.refresh();
  assert.equal(restarted.notifications.length, 0);
});

test('failed refresh keeps previous stories and reports error', async () => {
  const h = harness();
  await h.monitor.refresh();
  h.fail();
  await h.monitor.refresh();
  assert.equal(h.monitor.getState().articles.length, 1);
  assert.equal(h.monitor.getState().error, 'Offline');
  assert.equal(h.monitor.getState().loading, false);
});

test('demo is default and explicitly simulated without fetching backend', () => {
  const h = harness({});
  h.monitor.simulate();
  assert.equal(h.monitor.getState().mode, 'demo');
  assert.equal(h.notifications.length, 1);
  assert.match(h.notifications[0].title, /Demo/);
  assert.deepEqual(h.notifications[0].tickers, ['AAPL']);
});

test('URL variants deduplicate and actual publication timestamp is retained', () => {
  const normalized = normalizeHeadlines({ articles: [headline('one'), { ...headline('one'), url: 'https://example.com/one?utm_source=newsletter#fragment' }] });
  assert.equal(normalized.length, 1);
  const [first] = normalized;
  assert.equal(first.publishedAt, '2026-11-02T15:00:00.000Z');
});

test('in-flight refresh cannot replace demo state after switching modes', async () => {
  let resolve;
  const monitor = new NewsMonitor({
    load: () => ({ mode: 'live' }), save: () => {}, onState: () => {}, onArticle: () => { throw new Error('Unexpected alert'); },
    fetchHeadlines: () => new Promise((done) => { resolve = done; }),
  });
  const pending = monitor.refresh();
  monitor.setMode('demo');
  resolve({ articles: [headline('one')] });
  await pending;
  assert.equal(monitor.getState().mode, 'demo');
  assert.match(monitor.getState().articles[0].title, /Demo/);
});

test('storage failure is visible and pauses live notifications', async () => {
  const monitor = new NewsMonitor({
    load: () => ({ mode: 'live', initialized: true }), save: () => { throw new Error('Disk full'); },
    onState: () => {}, onArticle: () => { throw new Error('Unexpected alert'); },
    fetchHeadlines: async () => ({ articles: [headline('one')] }),
  });
  await monitor.refresh();
  assert.match(monitor.getState().error, /Could not save/);
});

test('duplicate articles within a provider response produce one alert', async () => {
  const h = harness({ mode: 'live', initialized: true });
  h.setResponse({ articles: [headline('two'), headline('two')] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.monitor.getState().articles.length, 1);
});

test('empty response cannot establish a notification baseline', async () => {
  const h = harness();
  h.setResponse({ articles: [] });
  await h.monitor.refresh();
  assert.equal(h.storage.initialized, false);
  h.setResponse({ articles: [headline('old')] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 0);
});

test('simulated articles always have unique identities, including mode switch', () => {
  const h = harness();
  h.monitor.simulate();
  h.monitor.simulate();
  const ids = h.monitor.getState().articles.map((article) => article.id);
  assert.equal(new Set(ids).size, ids.length);
});
