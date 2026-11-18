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
function analyzedHeadline(id, analysis = {}, article = {}) {
  return headline(id, {
    published_at: new Date(Date.now() - 60_000).toISOString(),
    analysis: {
      event_id: `event-${id}`, event_type: 'earnings', relevance: 'high', alert_eligible: true,
      why_it_matters: 'Revised guidance changes the sales outlook.', evidence: 'Apple revised guidance.',
      evidence_scope: 'provider_snippet',
      companies: [{ symbol: 'AAPL', name: 'Apple', relationship: 'direct', evidence: 'Apple revised guidance.' }],
      ...analysis,
    },
    ...article,
  });
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

test('initial Finance headlines establish baseline and events alert once across syndicated copies and restart', async () => {
  const h = harness();
  h.setResponse({ articles: [analyzedHeadline('one')], analysis_status: 'ready' });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 0);
  h.setResponse({ articles: [analyzedHeadline('two'), analyzedHeadline('one')], analysis_status: 'ready' });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].title, 'Story two');
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.ok(h.storage.seenFinanceEvents.includes('event-two'));
  const restarted = harness(h.storage);
  restarted.setResponse({ articles: [analyzedHeadline('three')], analysis_status: 'ready' });
  await restarted.monitor.refresh();
  restarted.setResponse({ articles: [analyzedHeadline('syndicated', { event_id: 'event-two' })], analysis_status: 'ready' });
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

test('a significant market-wide story can alert without a ticker', async () => {
  const h = harness();
  await h.monitor.refresh();
  const macro = analyzedHeadline('rate-decision', { event_type: 'macro', companies: [] }, { tickers: [] });
  h.setResponse({ articles: [macro], analysis_status: 'ready' });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].analysis.eventType, 'macro');
  assert.deepEqual(h.notifications[0].tickers, []);
});

test('legacy all-desktops choice becomes current desktop and Off survives restart', async () => {
  const h = harness({ category: 'technology', seen: ['previous'], popupPlacement: 'all' });
  assert.equal(h.monitor.getPopupPlacement(), 'current');
  h.monitor.setPopupPlacement('off');
  await h.monitor.refresh();
  const restarted = harness(h.storage);
  assert.equal(restarted.monitor.getPopupPlacement(), 'off');
  assert.equal(restarted.monitor.getState().category, 'technology');
  assert.ok(h.storage.seen.includes('previous'));
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
  let storageWritable = false;
  const notifications = [];
  const monitor = new NewsMonitor({
    load: () => ({}), save: () => { if (!storageWritable) throw new Error('Disk full'); },
    onState: () => {}, onArticle: (article) => notifications.push(article),
    fetchHeadlines: async () => response,
  });
  await monitor.refresh();
  response = { articles: [headline('two', { tickers: [] })], analysis_status: 'disabled' };
  await monitor.refresh();
  assert.match(monitor.getState().error, /Could not save/);
  assert.equal(notifications.length, 0);
  storageWritable = true;
  await monitor.refresh();
  assert.equal(notifications.length, 1);
});

test('duplicate articles within a response produce one alert', async () => {
  const h = harness();
  await h.monitor.refresh();
  h.setResponse({ articles: [analyzedHeadline('two'), analyzedHeadline('two')], analysis_status: 'ready' });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.monitor.getState().articles.length, 1);
});

test('empty response cannot establish an alert baseline', async () => {
  const h = harness();
  h.setResponse({ articles: [] });
  await h.monitor.refresh();
  h.setResponse({ articles: [analyzedHeadline('old')], analysis_status: 'ready' });
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

test('new stories alert without analysis or tickers in every analysis status', async () => {
  for (const status of [undefined, 'disabled', 'unavailable', 'pending', 'ready']) {
    const h = harness();
    h.setResponse({ articles: [headline('baseline', { tickers: [] })], analysis_status: status });
    await h.monitor.refresh();
    assert.equal(h.notifications.length, 0);
    h.setResponse({ articles: [headline('new', { tickers: [] })], analysis_status: status });
    await h.monitor.refresh();
    assert.equal(h.notifications.length, 1, `status ${status}`);
    assert.deepEqual(h.notifications[0].tickers, []);
    assert.equal(h.notifications[0].analysis, undefined);
    await h.monitor.refresh();
    assert.equal(h.notifications.length, 1);
  }
});

test('late enrichment never repeats a popup or alerts a baseline event copy', async () => {
  const h = harness();
  h.setResponse({ articles: [headline('baseline')], analysis_status: 'pending' });
  await h.monitor.refresh();
  h.setResponse({ articles: [headline('baseline'), headline('new')], analysis_status: 'pending' });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].title, 'Story new');
  h.setResponse({
    articles: [analyzedHeadline('copy', { event_id: 'event-baseline' }), analyzedHeadline('baseline'), analyzedHeadline('new')],
    analysis_status: 'ready',
  });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
  h.setResponse({ articles: [analyzedHeadline('new-copy', { event_id: 'event-new' })] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 1);
});

test('Finance preserves impact ranking and evidence without requiring it for alerts', async () => {
  const h = harness();
  await h.monitor.refresh();
  h.setResponse({
    analysis_status: 'ready',
    articles: [
      analyzedHeadline('medium', { relevance: 'medium' }),
      analyzedHeadline('high'),
      analyzedHeadline('bad', { companies: [{ symbol: 'AAPL', name: 'Apple', relationship: 'direct', evidence: '' }] }),
    ],
  });
  await h.monitor.refresh();
  const articles = h.monitor.getState().articles;
  assert.ok(articles.findIndex((item) => item.title === 'Story high') < articles.findIndex((item) => item.title === 'Story medium'));
  assert.equal(articles.find((item) => item.title === 'Story bad').analysis, undefined);
  assert.deepEqual(h.notifications.map((item) => item.title), ['Story high']);
  assert.equal(h.notifications[0].analysis.evidenceScope, 'provider_snippet');
  assert.equal(h.notifications[0].analysis.companies[0].relationship, 'direct');
  h.setResponse({ articles: [analyzedHeadline('low', { relevance: 'low', alert_eligible: false })] });
  await h.monitor.refresh();
  assert.equal(h.notifications[1].title, 'Story low');
});

test('Off suppresses popups and re-enabling establishes a quiet baseline', async () => {
  const h = harness();
  await h.monitor.refresh();
  h.monitor.setPopupPlacement('off');
  h.setResponse({ articles: [headline('while-off')] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 0);
  h.monitor.setPopupPlacement('current');
  h.setResponse({ articles: [headline('at-reenable')] });
  await h.monitor.refresh();
  assert.equal(h.notifications.length, 0);
  h.setResponse({ articles: [headline('after-reenable')] });
  await h.monitor.refresh();
  assert.deepEqual(h.notifications.map((item) => item.title), ['Story after-reenable']);
});

test('stored article history suppresses unanalysed copies after restart', async () => {
  const h = harness();
  await h.monitor.refresh();
  h.setResponse({ articles: [headline('new')] });
  await h.monitor.refresh();
  const restarted = harness(h.storage);
  restarted.setResponse({ articles: [headline('baseline')] });
  await restarted.monitor.refresh();
  restarted.setResponse({ articles: [headline('new', { url: 'https://example.com/new?utm_source=copy#top' })] });
  await restarted.monitor.refresh();
  assert.equal(restarted.notifications.length, 0);
});

test('category browsing does not delay Finance alerts or duplicate an in-flight Finance request', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 10, 18) });
  let resolveFinance;
  const requests = [];
  const notifications = [];
  const monitor = new NewsMonitor({
    load: () => ({ category: 'technology' }), save: () => {}, onState: () => {}, onArticle: (article) => notifications.push(article),
    fetchHeadlines: (category) => {
      requests.push(category);
      if (category === 'business') return new Promise((resolve) => { resolveFinance = resolve; });
      return Promise.resolve({ articles: [headline('tech')], analysis_status: 'ready' });
    },
  });
  await monitor.refresh();
  assert.equal(monitor.getState().articles[0].title, 'Story tech');
  assert.equal(monitor.getState().analysisStatus, undefined);
  resolveFinance({ articles: [analyzedHeadline('baseline')], analysis_status: 'ready' });
  await new Promise(setImmediate);
  await monitor.refresh();
  assert.equal(requests.filter((category) => category === 'business').length, 1);
  t.mock.timers.tick(60_000);
  await monitor.refresh();
  resolveFinance({ articles: [analyzedHeadline('background')], analysis_status: 'ready' });
  await new Promise(setImmediate);
  assert.equal(monitor.getState().articles[0].title, 'Story tech');
  assert.deepEqual(notifications.map((item) => item.title), ['Story background']);
  t.mock.timers.tick(60_000);
  await monitor.refresh();
  monitor.setCategory('business');
  await new Promise(setImmediate);
  assert.equal(requests.filter((category) => category === 'business').length, 3);
  resolveFinance({ articles: [analyzedHeadline('on-finance')], analysis_status: 'ready' });
  await new Promise(setImmediate);
  assert.equal(monitor.getState().analysisStatus, 'ready');
  assert.equal(monitor.getState().articles[0].title, 'Story on-finance');
  assert.deepEqual(notifications.map((item) => item.title), ['Story background', 'Story on-finance']);
});
