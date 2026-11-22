const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function launch(deferReady = false, environment = {}, fetchResponse = async () => ({ articles: [] }), fetchTransport) {
  const windows = [], handlers = new Map(), events = new EventEmitter();
  const requestedURLs = [];
  const requests = [];
  let tray, monitor, menu, cursor = { x: 1809, y: 10 }, now = 100000, nextTimer = 0;
  const timers = new Map();
  const schedule = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; };
  const advance = (milliseconds) => {
    now += milliseconds;
    for (const [id, timer] of timers) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  };
  const state = { articles: [], category: 'business', loading: false, error: null, lastChecked: null, refreshIntervalSeconds: 60 };
  class Window extends EventEmitter {
    static getAllWindows() { return windows.filter((window) => !window.isDestroyed()); }
    static fromWebContents(contents) { return windows.find((window) => window.webContents === contents); }
    constructor(options) {
      super(); this.options = options; this.id = windows.length + 1; this.visible = false; this.focusCount = 0;
      this.rectangle = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.webContents = new EventEmitter(); this.webContents.id = this.id;
      this.webContents.send = () => {}; this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    loadURL() { if (!deferReady) queueMicrotask(() => this.emit('ready-to-show')); return Promise.resolve(); }
    isDestroyed() { return Boolean(this.destroyed); }
    destroy() { this.hide(); this.destroyed = true; this.emit('closed'); }
    setVisibleOnAllWorkspaces(visible) { this.allSpaces = visible; }
    isVisible() { return this.visible; }
    isFocused() { return this.visible; }
    setBounds(rect) { this.rectangle = rect; }
    getBounds() { return this.rectangle; }
    show() { this.visible = true; this.emit('show'); }
    showInactive() { this.visible = true; this.emit('show'); }
    focus() { this.focusCount += 1; }
    hide() { const wasVisible = this.visible; this.visible = false; if (wasVisible) this.emit('hide'); }
  }
  class MockTray extends EventEmitter {
    constructor() { super(); tray = this; }
    getBounds() { return { x: 1800, y: 0, width: 18, height: 25 }; }
    setToolTip() {} popUpContextMenu(template) { menu = template; }
  }
  class Monitor {
    constructor(dependencies) { this.dependencies = dependencies; monitor = this; }
    getState() { return state; }
    start() {} stop() {} refresh() { this.refreshCount = (this.refreshCount || 0) + 1; return Promise.resolve(); }
    setCategory(category) { state.category = category; }
    getPopupPlacement() { return this.placement ?? 'current'; }
    setPopupPlacement(placement) { this.placement = placement; }
  }
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve(); app.setActivationPolicy = () => {};
  app.setName = () => {}; app.getPath = () => '/tmp/hercules-runtime-test'; app.quit = () => {};
  const primary = { id: 1, workArea: { x: 0, y: 25, width: 1920, height: 1055 } };
  const secondary = { id: 2, workArea: { x: -1440, y: 25, width: 1440, height: 875 } };
  let displays = [primary, secondary];
  const display = ({ x }) => x < 0 && displays.includes(secondary) ? secondary : primary;
  const electron = {
    app, BrowserWindow: Window, Tray: MockTray,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => events.on(name, fn) },
    nativeImage: { createFromDataURL: () => ({ resize: () => ({ setTemplateImage() {} }) }) },
    Menu: { buildFromTemplate: (template) => template }, screen: { getDisplayMatching: display, getPrimaryDisplay: () => primary, getDisplayNearestPoint: display, getCursorScreenPoint: () => cursor, getAllDisplays: () => displays },
    powerMonitor: new EventEmitter(), net: { fetch: async (url, options) => {
      requestedURLs.push(url); requests.push({ url, options });
      return fetchTransport ? fetchTransport(url, options) : { ok: true, json: () => fetchResponse(url, options) };
    } }, shell: { openExternal: () => Promise.resolve() },
  };
  const filename = path.resolve(__dirname, '../src/index.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    require: (name) => {
      if (name === 'electron') return electron;
      if (name === 'electron-squirrel-startup') return false;
      if (name === './services/newsMonitor') return { NewsMonitor: Monitor, normalizeHeadlines: (payload) => payload.articles };
      if (name === './shared/research') {
        const parsed = { exports: {} };
        const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/shared/research.ts'), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText;
        vm.runInNewContext(code, { exports: parsed.exports, URL, Date });
        return parsed.exports;
      }
      return require(name);
    },
    exports: {}, process: { platform: 'darwin', env: environment }, console,
    MAIN_WINDOW_WEBPACK_ENTRY: 'http://localhost:3000/main_window', MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: '/tmp/preload.js',
    URL, Error, Date: class extends Date { static now() { return now; } },
    setTimeout: schedule, clearTimeout: (id) => timers.delete(id), AbortController,
  }, { filename });
  await new Promise((resolve) => setImmediate(resolve));
  return { removeSecondary() { displays = [primary]; }, windows, events, handlers, state, advance, requestedURLs, requests, get pendingTimers() { return timers.size; }, setCursor(point) { cursor = point; }, get menu() { return menu; }, get tray() { return tray; }, get monitor() { return monitor; } };
}
const story = { id: 'actual-story', title: 'Actual company news', url: 'https://example.com/story', tickers: [], quotes: [] };

test('stock research only accepts a company in the open analyzed story and parses market evidence', async () => {
  const runtime = await launch(false, { HERCULES_API_URL: 'http://127.0.0.1:8000' }, () => ({
    symbol: 'MSFT', status: 'partial', stance: 'insufficient_data',
    assessed_at: '2026-11-19T18:00:00Z', quote_as_of: '2026-11-18T18:00:00Z',
    technical: { status: 'ready', metrics: { sma20: 100, rsi14: NaN }, signals: [{ explanation: 'Trend is positive.' }] },
    fundamental: { status: 'partial', metrics: { pe_ttm: 25 }, signals: [{ explanation: 'Metric date unknown.' }] },
    sources: [{ url: 'javascript:alert(1)' }, { name: 'Yahoo', url: 'https://finance.yahoo.com/quote/MSFT/' }],
    history: { observations: 2, event_counts: { guidance: 2 }, note: 'Not predictive accuracy.' },
  }));
  runtime.state.articles = [{ ...story, category: 'business', analysis: { companies: [{ symbol: 'MSFT' }] } }];
  runtime.events.emit('open-article', { sender: null }, story.id);
  await new Promise(setImmediate);
  const handler = runtime.handlers.get('request-stock-research');
  const event = { sender: runtime.windows.at(-1).webContents };
  assert.ok((await handler(event, { url: story.url, symbol: 'NVDA' })).error);
  assert.ok((await handler(event, { url: 'https://unknown.example', symbol: 'MSFT' })).error);
  assert.equal(runtime.requests.length, 0);
  const { research } = await handler(event, { url: story.url, symbol: 'MSFT' });
  assert.equal(research.stance, 'insufficient_data');
  assert.equal(research.technical.signals[0], 'Trend is positive.');
  assert.equal(research.technical.metrics.rsi14, undefined);
  assert.equal(research.sources.length, 1);
  assert.equal(research.history.eventCounts.guidance, 2);
  assert.equal(runtime.requests[0].url, 'http://127.0.0.1:8000/news/research');
});

test('packaged app defaults to the hosted API and supports an explicit local override', async () => {
  const hosted = await launch();
  await hosted.monitor.dependencies.fetchHeadlines('business');
  assert.equal(hosted.requestedURLs[0], 'https://hercules-ai-red.vercel.app/news/feed?category=business');
  const local = await launch(false, { HERCULES_API_URL: 'http://127.0.0.1:8000/' });
  await local.monitor.dependencies.fetchHeadlines('technology');
  assert.equal(local.requestedURLs[0], 'http://127.0.0.1:8000/news/feed?category=technology');
});

test('opening an unanalyzed local Technology story requests and displays its analysis', async () => {
  const article = { ...story, category: 'technology' };
  const analyzed = { ...article, analysis: { eventType: 'macro', companies: [] } };
  let complete;
  const result = new Promise((resolve) => { complete = resolve; });
  const runtime = await launch(false, { HERCULES_API_URL: 'http://127.0.0.1:8000' }, (url, request) => {
    assert.equal(url, 'http://127.0.0.1:8000/news/analysis');
    assert.equal(request.method, 'POST');
    assert.deepEqual(JSON.parse(request.body), { url: article.url });
    return result;
  });
  runtime.state.articles = [article];
  runtime.events.emit('open-article', { sender: null }, article.id);
  await new Promise(setImmediate);
  const [detail] = runtime.windows;
  const readView = () => runtime.handlers.get('get-window-view')({ sender: detail.webContents });
  assert.equal(readView().articleAnalysisStatus, 'pending');
  complete({ analysis_status: 'ready', articles: [analyzed] });
  await new Promise(setImmediate);
  assert.equal(readView().articleAnalysisStatus, 'ready');
  assert.equal(readView().article.analysis.eventType, 'macro');
});

test('startup hidden; H opens panel; compact popup stays inactive; detail is separate and dismissible', async () => {
  const runtime = await launch();
  assert.equal(runtime.windows.length, 0);
  runtime.tray.emit('click');
  await new Promise(setImmediate);
  const [panel] = runtime.windows;
  assert.equal(panel.isVisible(), true);
  assert.equal(runtime.monitor.refreshCount, 1);
  assert.equal(panel.getBounds().width, 260);
  assert.equal(panel.getBounds().height, 680);
  runtime.events.emit('minimize-panel', { sender: panel.webContents });
  assert.equal(panel.isVisible(), false);
  runtime.state.articles = [story];
  runtime.monitor.dependencies.onArticle(story);
  let popup = runtime.windows.at(-1);
  await new Promise(setImmediate);
  assert.equal(popup.isVisible(), true);
  assert.equal(popup.getBounds().height, 160);
  assert.equal(popup.getBounds().width, 250);
  assert.equal(popup.focusCount, 0);
  assert.equal(panel.isVisible(), false);
  popup.emit('blur');
  assert.equal(popup.isVisible(), true);
  runtime.advance(9999);
  assert.equal(popup.isVisible(), true);
  runtime.advance(1);
  assert.equal(popup.isVisible(), false);
  runtime.monitor.dependencies.onArticle(story);
  popup = runtime.windows.at(-1);
  await new Promise(setImmediate);
  runtime.events.emit('open-article', { sender: popup.webContents }, story.id);
  await new Promise(setImmediate);
  assert.equal(popup.isVisible(), false);
  const detail = runtime.windows.at(-1);
  assert.equal(detail.isVisible(), true);
  assert.equal(detail.getBounds().width, 350);
  assert.equal(detail.getBounds().height, 530);
  const view = runtime.handlers.get('get-window-view')({ sender: detail.webContents });
  assert.equal(view.kind, 'article');
  assert.equal(view.article.id, story.id);
  runtime.advance(10000);
  assert.equal(detail.isVisible(), true);
  detail.emit('blur');
  assert.equal(detail.isVisible(), false);
  runtime.monitor.dependencies.onArticle(story);
  runtime.events.emit('open-article', { sender: runtime.windows.at(-1).webContents }, story.id);
  await new Promise(setImmediate);
  const reopenedDetail = runtime.windows.at(-1);
  let prevented = false;
  reopenedDetail.webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { key: 'Escape' });
  assert.equal(prevented, true);
  assert.equal(reopenedDetail.isVisible(), false);
});

test('a newer popup gets a full ten seconds and early dismissal cancels its timer', async () => {
  const runtime = await launch();
  runtime.monitor.dependencies.onArticle(story);
  let popup = runtime.windows.at(-1);
  await new Promise(setImmediate);
  const first = runtime.handlers.get('get-window-view')({ sender: popup.webContents }).expiresAt;
  runtime.advance(8000);
  runtime.monitor.dependencies.onArticle({ ...story, id: 'next' });
  popup = runtime.windows.at(-1);
  await new Promise(setImmediate);
  const next = runtime.handlers.get('get-window-view')({ sender: popup.webContents }).expiresAt;
  assert.equal(next - first, 8000);
  runtime.advance(2000);
  assert.equal(popup.isVisible(), true);
  runtime.advance(7999);
  assert.equal(popup.isVisible(), true);
  runtime.advance(1);
  assert.equal(popup.isVisible(), false);
  runtime.monitor.dependencies.onArticle(story);
  popup = runtime.windows.at(-1);
  await new Promise(setImmediate);
  runtime.events.emit('minimize-panel', { sender: popup.webContents });
  runtime.advance(10000);
  assert.equal(popup.isVisible(), false);
});

test('popup timeout starts when it becomes visible, after renderer readiness', async () => {
  const runtime = await launch(true);
  runtime.monitor.dependencies.onArticle(story);
  let popup = runtime.windows.at(-1);
  runtime.advance(12000);
  assert.equal(popup.isVisible(), false);
  popup.emit('ready-to-show');
  assert.equal(popup.isVisible(), true);
  runtime.advance(9999);
  assert.equal(popup.isVisible(), true);
  runtime.advance(1);
  assert.equal(popup.isVisible(), false);
});

test('main panel cannot move, supports native edge resizing, and keeps its size when reopened', async () => {
  const runtime = await launch();
  runtime.tray.emit('click');
  await new Promise(setImmediate);
  const [panel] = runtime.windows;
  assert.equal(panel.options.movable, false);
  assert.equal(panel.options.resizable, true);
  // Electron transparent windows do not support reliable native resizing.
  assert.equal(panel.options.transparent, false);
  assert.equal(panel.options.minWidth, 260);
  assert.equal(panel.options.minHeight, 320);
  runtime.monitor.dependencies.onArticle(story);
  assert.equal(runtime.windows.at(-1).options.resizable, false);
  panel.setBounds({ ...panel.getBounds(), width: 560, height: 820 });
  runtime.events.emit('minimize-panel', { sender: panel.webContents });
  runtime.tray.emit('click');
  const reopened = runtime.windows.at(-1);
  assert.ok(panel.isDestroyed());
  assert.equal(reopened.getBounds().width, 560);
  assert.equal(reopened.getBounds().height, 820);
  assert.ok(reopened.getBounds().x >= 0);
  assert.ok(reopened.getBounds().x + 560 <= 1920);
});

test('opening panel before popup renderer is ready cancels pending popup', async () => {
  const runtime = await launch(true);
  runtime.monitor.dependencies.onArticle(story);
  const popup = runtime.windows.at(-1);
  runtime.tray.emit('click');
  const panel = runtime.windows.at(-1);
  popup.emit('ready-to-show');
  panel.emit('ready-to-show');
  assert.equal(panel.isVisible(), true);
  assert.equal(popup.isVisible(), false);
});

test('tray placement follows the clicked display and articles follow the originating popup', async () => {
  const runtime = await launch();
  runtime.tray.emit('click');
  await new Promise(setImmediate);
  const firstPanel = runtime.windows.at(-1);
  runtime.tray.emit('click', {}, runtime.tray.getBounds(), { x: -120, y: 10 });
  await new Promise(setImmediate);
  const panel = runtime.windows.at(-1);
  assert.ok(firstPanel.isDestroyed());
  assert.ok(panel.isVisible());
  assert.ok(panel.getBounds().x + panel.getBounds().width <= 0);
  assert.equal(panel.allSpaces, false);
  runtime.events.emit('minimize-panel', { sender: panel.webContents });

  runtime.setCursor({ x: -120, y: 400 });
  runtime.monitor.dependencies.onArticle(story);
  await new Promise(setImmediate);
  const popup = runtime.windows.at(-1);
  assert.ok(popup.getBounds().x < 0);
  assert.equal(popup.allSpaces, false);
  runtime.setCursor({ x: 800, y: 400 });
  runtime.events.emit('open-article', { sender: popup.webContents }, story.id);
  await new Promise(setImmediate);
  const detail = runtime.windows.at(-1);
  assert.ok(detail.isVisible());
  assert.ok(detail.getBounds().x < 0);
  assert.equal(detail.allSpaces, false);
});

test('one popup follows the pointer display and Off suppresses alerts', async () => {
  const runtime = await launch();
  runtime.tray.emit('right-click');
  const options = runtime.menu.find(({ label }) => label === 'News popups').submenu;
  assert.equal(options.length, 2);
  assert.equal(options.find(({ label }) => label === 'Current desktop').checked, true);
  runtime.monitor.dependencies.onArticle(story);
  await new Promise(setImmediate);
  const [first] = runtime.windows;
  assert.ok(first.isVisible() && first.getBounds().x >= 0);
  runtime.setCursor({ x: -120, y: 400 });
  runtime.monitor.dependencies.onArticle(story);
  await new Promise(setImmediate);
  const [previous, current] = runtime.windows;
  assert.ok(previous.isDestroyed());
  assert.ok(current.isVisible() && current.getBounds().x < 0 && !current.allSpaces);
  options.find(({ label }) => label === 'Off').click();
  assert.ok(current.isDestroyed());
  runtime.monitor.dependencies.onArticle(story);
  assert.equal(runtime.windows.length, 2);
});

test('a Finance popup opens its analyzed article when the selected category also contains the raw story', async () => {
  const runtime = await launch();
  runtime.state.articles = [story];
  runtime.state.category = 'technology';
  const analyzed = { ...story, analysis: { eventId: 'impact', whyItMatters: 'Updated guidance.' } };
  runtime.monitor.dependencies.onArticle(analyzed);
  await new Promise(setImmediate);
  const popup = runtime.windows.at(-1);
  runtime.monitor.dependencies.onState(runtime.state);
  runtime.events.emit('open-article', { sender: popup.webContents }, story.id);
  const detail = runtime.windows.at(-1);
  const view = runtime.handlers.get('get-window-view')({ sender: detail.webContents });
  assert.equal(view.article.analysis.eventId, 'impact');
});

test('All news restores the H panel position and resized dimensions after an article moves monitors', async () => {
  const runtime = await launch();
  runtime.state.articles = [story];
  runtime.tray.emit('click', {}, { x: -800, y: 0, width: 18, height: 25 }, { x: -790, y: 10 });
  await new Promise(setImmediate);
  const panel = runtime.windows.at(-1);
  panel.setBounds({ ...panel.getBounds(), width: 480, height: 720 });
  const previous = { ...panel.getBounds() };
  runtime.events.emit('open-article', { sender: panel.webContents }, story.id);
  await new Promise(setImmediate);
  const article = runtime.windows.at(-1);
  article.setBounds({ ...article.getBounds(), x: 600, y: 300 });
  runtime.events.emit('expand-panel', { sender: article.webContents });
  await new Promise(setImmediate);
  const restored = runtime.windows.at(-1);
  assert.deepEqual({ ...restored.getBounds() }, previous);
  assert.equal(restored.allSpaces, false);
  assert.equal(restored.options.fullscreenable, false);
  assert.equal(article.isDestroyed(), true);
});

test('All news falls back to the tray display when the remembered monitor disappears', async () => {
  const runtime = await launch();
  runtime.state.articles = [story];
  runtime.tray.emit('click', {}, { x: -800, y: 0, width: 18, height: 25 }, { x: -790, y: 10 });
  await new Promise(setImmediate);
  const panel = runtime.windows.at(-1);
  panel.setBounds({ ...panel.getBounds(), width: 480, height: 720 });
  runtime.events.emit('open-article', { sender: panel.webContents }, story.id);
  const article = runtime.windows.at(-1);
  runtime.removeSecondary();
  runtime.events.emit('expand-panel', { sender: article.webContents });
  const restored = runtime.windows.at(-1);
  assert.equal(restored.getBounds().width, 480);
  assert.equal(restored.getBounds().height, 720);
  assert.ok(restored.getBounds().x >= 0);
  assert.ok(restored.getBounds().x + 480 <= 1920);
  assert.equal(restored.allSpaces, false);
});

test('the panel opens directly to news controls without simulator navigation', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const filename = path.resolve(__dirname, '../src/components/SidePanel.tsx');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    window: {},
    require(name) {
      if (name === 'react') return React;
      if (name === './NewsCard') return { default: () => null };
      throw new Error(`Unexpected panel dependency: ${name}`);
    },
  }, { filename });
  const markup = renderToStaticMarkup(React.createElement(exports.default, { onMinimize() {} }));
  assert.match(markup, /News category/);
  assert.match(markup, /Latest stories/);
  assert.match(markup, /Checking for news/);
  assert.doesNotMatch(markup, /tablist|Paper trading/);
});

test('article dossier requests verified news context independently of stock research', async () => {
  const dossier = {
    symbol: 'MSFT', anchor: null, impact_channel: 'demand', excerpt: 'Sales grew by 12%.',
    figures: ['12%'], history_available: true, recent_count: 0, baseline_count: 0,
    negative_share_change: null, recurring: [], connections: [], timeline: [],
  };
  const runtime = await launch(false, { HERCULES_API_URL: 'http://127.0.0.1:8000' }, () => dossier);
  runtime.state.articles = [{ ...story, analysis: { companies: [{ symbol: 'MSFT' }] } }];
  runtime.events.emit('open-article', { sender: null }, story.id);
  await new Promise(setImmediate);
  const handler = runtime.handlers.get('request-company-dossier');
  const event = { sender: runtime.windows.at(-1).webContents };
  assert.ok((await handler(event, { url: story.url, symbol: 'SPY' })).error);
  const response = await handler(event, { url: story.url, symbol: 'MSFT' });
  assert.equal(response.dossier.figures[0], '12%');
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].url, 'http://127.0.0.1:8000/news/dossier');
});
