const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/services/newsMonitor.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const serviceModule = new Module(filename, module);
serviceModule.filename = filename;
serviceModule.paths = module.paths;
serviceModule._compile(compiled, filename);
const { NewsMonitor, normalizeHeadlines } = serviceModule.exports;

function headline(id, extra = {}) {
  return { title: `Story ${id}`, url: `https://example.com/${id}`, description: 'Details', published_at: '2026-11-03T15:00:00Z', tickers: ['AAPL'], ...extra };
}
function harness(stored = {}) {
  let storage = stored;
  let response = { articles: [headline('one')], refresh_interval_seconds: 60 };
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

test('initial headlines establish baseline, new articles alert only once, restart stays quiet', async () => {
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
  restarted.setResponse({ articles: [headline('three'), headline('two'), headline('one')] });
  await restarted.monitor.refresh();
  assert.equal(restarted.notifications.length, 0);
  assert.equal(restarted.monitor.getState().category, 'business');
  assert.equal(restarted.monitor.getState().refreshIntervalSeconds, 60);
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

test('URL variants deduplicate, actual publication time and quotes are retained', () => {
  const normalized = normalizeHeadlines({ articles: [headline('one'), headline('one', {
    url: 'https://example.com/one?utm_source=newsletter#fragment',
    quotes: [{ symbol: 'AAPL', price: 220.5, currency: 'USD', as_of: '2026-11-03T15:00:00Z' }],
  })] });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].publishedAt, '2026-11-03T15:00:00.000Z');
  assert.equal(normalized[0].quotes[0].price, 220.5);
  assert.equal(normalized[0].quotes[0].asOf, '2026-11-03T15:00:00Z');
});

test('category change ignores stale request and suppresses historical first response', async () => {
  let resolveBusiness;
  const notifications = [];
  const monitor = new NewsMonitor({
    load: () => ({}), save: () => {}, onState: () => {}, onArticle: (article) => notifications.push(article),
    fetchHeadlines: (category) => category === 'business' ? new Promise((done) => { resolveBusiness = done; }) : Promise.resolve({ articles: [headline('tech')] }),
  });
  const pending = monitor.refresh();
  monitor.setCategory('technology');
  await new Promise((resolve) => setImmediate(resolve));
  resolveBusiness({ articles: [headline('old')] });
  await pending;
  assert.equal(monitor.getState().category, 'technology');
  assert.equal(monitor.getState().articles[0].title, 'Story tech');
  assert.equal(notifications.length, 0);
});

test('storage failure is visible and pauses new story popups', async () => {
  let response = { articles: [headline('one')] };
  const monitor = new NewsMonitor({
    load: () => ({}), save: () => { throw new Error('Disk full'); },
    onState: () => {}, onArticle: () => { throw new Error('Unexpected alert'); },
    fetchHeadlines: async () => response,
  });
  await monitor.refresh();
  response = { articles: [headline('two')] };
  await monitor.refresh();
  assert.match(monitor.getState().error, /Could not save/);
});

test('duplicate articles within a response produce one alert', async () => {
  const h = harness();
  await h.monitor.refresh();
  h.setResponse({ articles: [headline('two'), headline('two')] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.monitor.getState().articles.length, 1);
});

test('empty response cannot establish an alert baseline', async () => {
  const h = harness();
  h.setResponse({ articles: [] });
  await h.monitor.refresh();
  h.setResponse({ articles: [headline('old')] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 0);
});

test('manual refresh cannot overlap the timer refresh', async () => {
  let resolveRequest;
  let requests = 0;
  const monitor = new NewsMonitor({
    load: () => ({}), save: () => {}, onState: () => {}, onArticle: () => {},
    fetchHeadlines: () => { requests += 1; return new Promise((done) => { resolveRequest = done; }); },
  });
  const pending = monitor.refresh();
  await monitor.refresh();
  assert.equal(requests, 1);
  resolveRequest({ articles: [headline('one')] });
  await pending;
});

test('quotes fail honestly and missing tickers are never guessed', () => {
  const [article] = normalizeHeadlines({ articles: [headline('one', { tickers: [], quotes: [{ symbol: 'AAPL', price: null, error: 'Provider unavailable' }] })] });
  assert.deepEqual(article.tickers, []);
  assert.equal(article.quotes[0].price, null);
  assert.equal(article.quotes[0].error, 'Provider unavailable');
});

test('malformed individual provider links do not prevent valid stories from loading', () => {
  const normalized = normalizeHeadlines({ articles: [headline('valid'), headline('invalid', { url: '' }), headline('unsafe', { url: 'javascript:alert(1)' })] });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].title, 'Story valid');
});

test('price setup status reaches the desktop without hiding news, and clears once configured', async () => {
  const h = harness();
  h.setResponse({ articles: [headline('one')], quote_status: { state: 'setup_required', message: 'Connect a stock-price provider.' } });
  await h.monitor.refresh();
  assert.equal(h.monitor.getState().articles.length, 1);
  assert.equal(h.monitor.getState().quoteStatus.state, 'setup_required');
  assert.equal(h.monitor.getState().error, null);
  h.setResponse({ articles: [headline('one')], quote_status: { state: 'ready', message: 'Stock prices connected.' } });
  await h.monitor.refresh();
  assert.equal(h.monitor.getState().quoteStatus.state, 'ready');
});
