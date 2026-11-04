import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, powerMonitor, screen, shell, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { NewsMonitor, MonitorStorage } from './services/newsMonitor';
import { startOutsideClickMonitor } from './services/outsideClick';
import type { NewsItem, WindowView } from './shared/news';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) app.quit();

let mainWindow: BrowserWindow;
let popupWindow: BrowserWindow;
let articleWindow: BrowserWindow;
let tray: Tray | null = null;
let monitor: NewsMonitor;
let quitting = false;
let lastPanelBlur = 0;
let stopOutsideClick: (() => void) | null = null;
const views = new Map<number, WindowView>();
const loadedWindows = new Set<number>();
const showIntents = new Map<number, number>();
const PANEL_WIDTH = 260;
const PANEL_HEIGHT = 680;

function bounds(width: number, height: number, anchorToTray = false) {
  const anchor = tray?.getBounds();
  const display = anchor && anchor.width > 0 ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay();
  const area = display.workArea;
  const actualWidth = Math.min(width, area.width);
  const actualHeight = Math.min(height, area.height - 16);
  return {
    width: actualWidth, height: actualHeight,
    x: Math.max(area.x, Math.min(area.x + area.width - actualWidth - 8, anchorToTray && anchor ? Math.round(anchor.x + anchor.width / 2 - actualWidth / 2) : area.x + area.width - actualWidth - 8)),
    y: area.y + 8,
  };
}

function hideAll() {
  for (const window of BrowserWindow.getAllWindows()) {
    showIntents.set(window.id, (showIntents.get(window.id) ?? 0) + 1);
    window.hide();
  }
}

function showWindow(window: BrowserWindow, focus: boolean) {
  const intent = (showIntents.get(window.id) ?? 0) + 1;
  showIntents.set(window.id, intent);
  const show = () => {
    if (showIntents.get(window.id) !== intent || window.isDestroyed()) return;
    const view = views.get(window.webContents.id);
    if (view) window.webContents.send('window-view', view);
    if (focus) { window.show(); window.focus(); }
    else window.showInactive();
  };
  if (loadedWindows.has(window.id)) show();
  else window.once('ready-to-show', show);
}

function expandPanel() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  hideAll();
  mainWindow.setBounds(bounds(PANEL_WIDTH, PANEL_HEIGHT, true));
  showWindow(mainWindow, true);
}

function openExternal(url: unknown) {
  if (typeof url !== 'string') return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      hideAll();
      void shell.openExternal(parsed.toString());
    }
  } catch { /* Invalid links never leave the app. */ }
}

function showArticle(id: unknown) {
  if (typeof id !== 'string') return;
  const article = monitor.getState().articles.find((item) => item.id === id)
    ?? Array.from(views.values()).map((view) => view.article).find((item) => item?.id === id);
  if (!article) return;
  hideAll();
  views.set(articleWindow.webContents.id, { kind: 'article', article });
  articleWindow.setBounds(bounds(360, 540));
  showWindow(articleWindow, true);
}

function notify(article: NewsItem) {
  tray?.setToolTip(`Hercules AI — ${article.title}`);
  views.set(popupWindow.webContents.id, { kind: 'popup', article });
  popupWindow.setBounds(bounds(PANEL_WIDTH, Math.round(PANEL_HEIGHT / 4)));
  showWindow(popupWindow, false);
}

function createWindow(kind: WindowView['kind'], width: number, height: number) {
  const window = new BrowserWindow({
    ...bounds(width, height, kind === 'panel'), frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, hasShadow: true, show: false,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' ? { vibrancy: 'menu' as const, visualEffectState: 'active' as const } : {}),
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  views.set(window.webContents.id, { kind, article: null });
  window.once('ready-to-show', () => loadedWindows.add(window.id));
  window.on('blur', () => {
    if (kind === 'panel') lastPanelBlur = Date.now();
    window.hide();
  });
  window.on('hide', () => showIntents.set(window.id, (showIntents.get(window.id) ?? 0) + 1));
  window.on('close', (event) => {
    if (!quitting) { event.preventDefault(); window.hide(); }
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') { event.preventDefault(); window.hide(); }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== MAIN_WINDOW_WEBPACK_ENTRY) { event.preventDefault(); openExternal(url); }
  });
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
}

function createTray() {
  const image = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAN0lEQVR4nO3OwQkAIAwEwfTfdGzgPkERxFm4Z8JUScp12NUfAAAA6fjEAAC2ANMAAADeBkj/tAAlcgMMBazXfAAAAABJRU5ErkJggg==').resize({ width: 18, height: 18 });
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Hercules AI');
  tray.on('click', () => {
    if (Date.now() - lastPanelBlur < 200) return;
    if (mainWindow?.isVisible()) mainWindow.hide(); else expandPanel();
  });
  tray.on('right-click', () => tray?.popUpContextMenu(Menu.buildFromTemplate([
    { label: 'Open Hercules', click: expandPanel },
    { label: 'Refresh news', click: () => { void monitor.refresh(); } },
    { type: 'separator' },
    { label: 'Quit Hercules', click: () => app.quit() },
  ])));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  app.setName('Hercules');
  const storageFile = path.join(app.getPath('userData'), 'news-monitor.json');
  monitor = new NewsMonitor({
    load: () => {
      try { return JSON.parse(fs.readFileSync(storageFile, 'utf8')) as MonitorStorage; }
      catch { return {}; }
    },
    save: (data) => {
      fs.mkdirSync(path.dirname(storageFile), { recursive: true });
      const temporaryFile = `${storageFile}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify(data));
      fs.renameSync(temporaryFile, storageFile);
    },
    fetchHeadlines: async (category) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const baseUrl = (process.env.HERCULES_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
        const response = await net.fetch(`${baseUrl}/news/feed?category=${encodeURIComponent(category)}`, { signal: controller.signal });
        if (!response.ok) {
          const detail = await response.json().catch((): null => null) as { detail?: unknown } | null;
          throw new Error(typeof detail?.detail === 'string' ? detail.detail : `The news backend returned ${response.status}. Check its API configuration.`);
        }
        return await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw new Error('The news backend took too long to respond. Try refreshing.');
        if (error instanceof Error && !/fetch failed|net::|ECONNREFUSED|Failed to fetch/i.test(error.message)) throw error;
        throw new Error('Cannot reach the local news backend. Start Hercules with npm start, or check HERCULES_API_URL.');
      } finally { clearTimeout(timeout); }
    },
    onState: (state) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('news-state', state);
        const view = views.get(window.webContents.id);
        const updated = view?.article && state.articles.find((article) => article.id === view.article?.id);
        if (view && updated) {
          const next = { ...view, article: updated };
          views.set(window.webContents.id, next);
          window.webContents.send('window-view', next);
        }
      }
    },
    onArticle: notify,
  });
  createTray();
  mainWindow = createWindow('panel', PANEL_WIDTH, PANEL_HEIGHT);
  popupWindow = createWindow('popup', PANEL_WIDTH, Math.round(PANEL_HEIGHT / 4));
  articleWindow = createWindow('article', 360, 540);
  popupWindow.on('show', () => {
    stopOutsideClick?.();
    stopOutsideClick = startOutsideClickMonitor((point) => {
      const rects = [popupWindow.getBounds()];
      if (tray) rects.push(tray.getBounds());
      const inside = rects.some((rect) => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height);
      if (!inside) popupWindow.hide();
    });
  });
  popupWindow.on('hide', () => { stopOutsideClick?.(); stopOutsideClick = null; });
  ipcMain.handle('get-news-state', () => monitor.getState());
  ipcMain.handle('get-window-view', (event) => views.get(event.sender.id) ?? { kind: 'panel', article: null });
  ipcMain.on('set-category', (_event, category: unknown) => { if (typeof category === 'string') monitor.setCategory(category); });
  ipcMain.on('open-article', (_event, id: unknown) => showArticle(id));
  ipcMain.on('refresh-news', () => { void monitor.refresh(); });
  ipcMain.on('minimize-panel', (event) => BrowserWindow.fromWebContents(event.sender)?.hide());
  ipcMain.on('expand-panel', expandPanel);
  ipcMain.on('quit-app', () => app.quit());
  ipcMain.on('open-external', (_event, url: unknown) => openExternal(url));
  powerMonitor.on('resume', () => { void monitor.refresh(); });
  powerMonitor.on('unlock-screen', () => { void monitor.refresh(); });
  monitor.start();
});

app.on('before-quit', () => { quitting = true; monitor?.stop(); stopOutsideClick?.(); });
// App activation alone must not open a window; only the H icon does that.
