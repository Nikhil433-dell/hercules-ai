const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function launch(deferReady = false) {
  const windows = [], handlers = new Map(), events = new EventEmitter();
  let tray, monitor, now = 100000, nextTimer = 0;
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
    static getAllWindows() { return windows; }
    static fromWebContents(contents) { return windows.find((window) => window.webContents === contents); }
    constructor(options) {
      super(); this.options = options; this.id = windows.length + 1; this.visible = false; this.focusCount = 0;
      this.rectangle = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.webContents = new EventEmitter(); this.webContents.id = this.id;
      this.webContents.send = () => {}; this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    loadURL() { if (!deferReady) queueMicrotask(() => this.emit('ready-to-show')); return Promise.resolve(); }
    isDestroyed() { return false; }
    isVisible() { return this.visible; }
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
    setToolTip() {} popUpContextMenu() {}
  }
  class Monitor {
    constructor(dependencies) { this.dependencies = dependencies; monitor = this; }
    getState() { return state; }
    start() {} stop() {} refresh() { this.refreshCount = (this.refreshCount || 0) + 1; return Promise.resolve(); }
    setCategory(category) { state.category = category; }
  }
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve(); app.dock = { hide() {} };
  app.setName = () => {}; app.getPath = () => '/tmp/hercules-runtime-test'; app.quit = () => {};
  const display = () => ({ workArea: { x: 0, y: 25, width: 1920, height: 1055 } });
  const electron = {
    app, BrowserWindow: Window, Tray: MockTray,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => events.on(name, fn) },
    nativeImage: { createFromDataURL: () => ({ resize: () => ({ setTemplateImage() {} }) }) },
    Menu: { buildFromTemplate: (template) => template }, screen: { getDisplayMatching: display, getPrimaryDisplay: display },
    powerMonitor: new EventEmitter(), net: {}, shell: { openExternal: () => Promise.resolve() },
  };
  const filename = path.resolve(__dirname, '../src/index.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    require: (name) => {
      if (name === 'electron') return electron;
      if (name === 'electron-squirrel-startup') return false;
      if (name === './services/newsMonitor') return { NewsMonitor: Monitor };
      return require(name);
    },
    exports: {}, process: { platform: 'darwin', env: {} }, console,
    MAIN_WINDOW_WEBPACK_ENTRY: 'http://localhost:3000/main_window', MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: '/tmp/preload.js',
    URL, Date: class extends Date { static now() { return now; } },
    setTimeout: schedule, clearTimeout: (id) => timers.delete(id), AbortController,
  }, { filename });
  await new Promise((resolve) => setImmediate(resolve));
  return { windows, events, handlers, state, advance, get tray() { return tray; }, get monitor() { return monitor; } };
}
const story = { id: 'actual-story', title: 'Actual company news', url: 'https://example.com/story', tickers: [], quotes: [] };

test('startup hidden; H opens panel; compact popup stays inactive; detail is separate and dismissible', async () => {
  const runtime = await launch();
  const [panel, popup, detail] = runtime.windows;
  assert.equal(runtime.windows.length, 3);
  assert.ok(runtime.windows.every((window) => !window.isVisible()));
  runtime.tray.emit('click');
  assert.equal(panel.isVisible(), true);
  assert.equal(runtime.monitor.refreshCount, 1);
  assert.equal(panel.getBounds().width, 260);
  assert.equal(panel.getBounds().height, 680);
  runtime.events.emit('minimize-panel', { sender: panel.webContents });
  assert.equal(panel.isVisible(), false);
  runtime.state.articles = [story];
  runtime.monitor.dependencies.onArticle(story);
  assert.equal(popup.isVisible(), true);
  assert.equal(popup.getBounds().height, 160);
  assert.equal(popup.getBounds().width, 250);
  assert.equal(popup.focusCount, 0);
  assert.equal(panel.isVisible(), false);
  assert.equal(detail.isVisible(), false);
  popup.emit('blur');
  assert.equal(popup.isVisible(), true);
  runtime.advance(9999);
  assert.equal(popup.isVisible(), true);
  runtime.advance(1);
  assert.equal(popup.isVisible(), false);
  runtime.monitor.dependencies.onArticle(story);
  runtime.events.emit('open-article', { sender: popup.webContents }, story.id);
  assert.equal(popup.isVisible(), false);
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
  runtime.events.emit('open-article', { sender: panel.webContents }, story.id);
  let prevented = false;
  detail.webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { key: 'Escape' });
  assert.equal(prevented, true);
  assert.equal(detail.isVisible(), false);
});

test('a newer popup gets a full ten seconds and early dismissal cancels its timer', async () => {
  const runtime = await launch();
  const [, popup] = runtime.windows;
  runtime.monitor.dependencies.onArticle(story);
  const first = runtime.handlers.get('get-window-view')({ sender: popup.webContents }).expiresAt;
  runtime.advance(8000);
  runtime.monitor.dependencies.onArticle({ ...story, id: 'next' });
  const next = runtime.handlers.get('get-window-view')({ sender: popup.webContents }).expiresAt;
  assert.equal(next - first, 8000);
  runtime.advance(2000);
  assert.equal(popup.isVisible(), true);
  runtime.advance(7999);
  assert.equal(popup.isVisible(), true);
  runtime.advance(1);
  assert.equal(popup.isVisible(), false);
  runtime.monitor.dependencies.onArticle(story);
  runtime.events.emit('minimize-panel', { sender: popup.webContents });
  runtime.advance(10000);
  assert.equal(popup.isVisible(), false);
});

test('popup timeout starts when it becomes visible, after renderer readiness', async () => {
  const runtime = await launch(true);
  const [, popup] = runtime.windows;
  runtime.monitor.dependencies.onArticle(story);
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
  const [panel, popup, detail] = runtime.windows;
  assert.equal(panel.options.movable, false);
  assert.equal(panel.options.resizable, true);
  // Electron transparent windows do not support reliable native resizing.
  assert.equal(panel.options.transparent, false);
  assert.equal(panel.options.minWidth, 260);
  assert.equal(panel.options.minHeight, 320);
  assert.equal(popup.options.resizable, false);
  assert.equal(detail.options.resizable, false);
  runtime.tray.emit('click');
  panel.setBounds({ ...panel.getBounds(), width: 560, height: 820 });
  runtime.events.emit('minimize-panel', { sender: panel.webContents });
  runtime.tray.emit('click');
  assert.equal(panel.getBounds().width, 560);
  assert.equal(panel.getBounds().height, 820);
  assert.ok(panel.getBounds().x >= 0);
  assert.ok(panel.getBounds().x + 560 <= 1920);
});

test('opening panel before popup renderer is ready cancels pending popup', async () => {
  const runtime = await launch(true);
  const [panel, popup] = runtime.windows;
  runtime.monitor.dependencies.onArticle(story);
  runtime.tray.emit('click');
  popup.emit('ready-to-show');
  panel.emit('ready-to-show');
  assert.equal(panel.isVisible(), true);
  assert.equal(popup.isVisible(), false);
});
