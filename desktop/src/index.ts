import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, powerMonitor, screen, shell, Tray } from 'electron';
import type { Display, Point, Rectangle } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { NewsMonitor, normalizeHeadlines } from './services/newsMonitor';
import type { MonitorStorage, PopupPlacement } from './services/newsMonitor';
import type { ArticleAnalysisStatus, NewsItem, WindowView } from './shared/news';
import { apiBaseUrl } from '../runtime-config.json';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) app.quit();

let mainWindow: BrowserWindow | undefined;
let tray: Tray | null = null;
let monitor: NewsMonitor;
let quitting = false;
let lastPanelBlur: { at: number; displayId: number } | undefined;
const dismissingWindows = new WeakSet<BrowserWindow>();
const popupTimers = new Map<number, ReturnType<typeof setTimeout>>();
const views = new Map<number, WindowView>();
const PANEL_WIDTH = 260;
const PANEL_HEIGHT = 680;
let panelSize = { width: PANEL_WIDTH, height: PANEL_HEIGHT };
let lastPanelPlacement: { displayId: number; rectangle: Rectangle } | undefined;
const POPUP_WIDTH = PANEL_WIDTH - 10;
const POPUP_HEIGHT = Math.round(PANEL_HEIGHT / 4) - 10;
const ARTICLE_WIDTH = 350;
const ARTICLE_HEIGHT = 530;
const POPUP_DURATION_MS = 10000;
const backendUrl = (process.env.HERCULES_API_URL || apiBaseUrl).replace(/\/$/, '');

function currentDisplay(point = screen.getCursorScreenPoint()) {
  return screen.getDisplayNearestPoint(point);
}

function bounds(width: number, height: number, display: Display, anchor?: Rectangle) {
  const area = display.workArea;
  const actualWidth = Math.min(width, area.width);
  const actualHeight = Math.min(height, area.height - 16);
  return {
    width: actualWidth, height: actualHeight,
    x: Math.max(area.x, Math.min(area.x + area.width - actualWidth - 8, anchor ? Math.round(anchor.x + anchor.width / 2 - actualWidth / 2) : area.x + area.width - actualWidth - 8)),
    y: area.y + 8,
  };
}

function dismissWindow(window: BrowserWindow) {
  if (window.isDestroyed() || dismissingWindows.has(window)) return;
  dismissingWindows.add(window);
  if (window === mainWindow) {
    const { width, height } = window.getBounds();
    panelSize = { width, height };
    lastPanelPlacement = { displayId: screen.getDisplayMatching(window.getBounds()).id, rectangle: window.getBounds() };
  }
  window.destroy();
}

function dismissAll() {
  for (const window of BrowserWindow.getAllWindows()) dismissWindow(window);
}

function dismissPopups() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (views.get(window.webContents.id)?.kind === 'popup') dismissWindow(window);
  }
}

function showWindow(window: BrowserWindow, focus: boolean) {
  const windowId = window.id;
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    let view = views.get(window.webContents.id);
    if (view?.kind === 'popup') {
      view = { ...view, expiresAt: Date.now() + POPUP_DURATION_MS };
      views.set(window.webContents.id, view);
    }
    if (view) window.webContents.send('window-view', view);
    if (focus) window.show();
    else window.showInactive();
    if (view?.kind === 'popup') {
      popupTimers.set(windowId, setTimeout(() => dismissWindow(window), POPUP_DURATION_MS));
    }
  });
}

function expandPanel(display: Display, anchor?: Rectangle, restore?: Rectangle) {
  dismissAll();
  mainWindow = createWindow('panel', panelSize.width, panelSize.height, display, anchor);
  if (restore) {
    const rectangle = mainWindow.getBounds();
    const area = display.workArea;
    mainWindow.setBounds({ ...rectangle,
      x: Math.max(area.x, Math.min(restore.x, area.x + area.width - rectangle.width)),
      y: Math.max(area.y, Math.min(restore.y, area.y + area.height - rectangle.height)),
    });
  }
  showWindow(mainWindow, true);
  void monitor.refresh();
}

function openExternal(url: unknown) {
  if (typeof url !== 'string') return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      dismissAll();
      void shell.openExternal(parsed.toString());
    }
  } catch { /* Invalid links never leave the app. */ }
}

function showArticle(id: unknown, origin?: BrowserWindow) {
  if (typeof id !== 'string') return;
  const originatingArticle = origin && views.get(origin.webContents.id)?.article;
  const article = originatingArticle?.id === id ? originatingArticle
    : monitor.getState().articles.find((item) => item.id === id)
      ?? Array.from(views.values()).map((view) => view.article).find((item) => item?.id === id);
  if (!article) return;
  const display = origin ? screen.getDisplayMatching(origin.getBounds()) : currentDisplay();
  dismissAll();
  const articleWindow = createWindow('article', ARTICLE_WIDTH, ARTICLE_HEIGHT, display);
  const hostname = URL.canParse(backendUrl) ? new URL(backendUrl).hostname : '';
  const analyzeOnOpen = article.category === 'business' && !article.analysis &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
  views.set(articleWindow.webContents.id, {
    kind: 'article', article, articleAnalysisStatus: analyzeOnOpen ? 'pending' : 'disabled',
  });
  showWindow(articleWindow, true);
  if (analyzeOnOpen) void analyzeOpenArticle(articleWindow, article);
}

async function analyzeOpenArticle(window: BrowserWindow, article: NewsItem) {
  const contentsId = window.webContents.id;
  const controller = new AbortController();
  const abort = () => controller.abort();
  window.once('closed', abort);
  const timeout = setTimeout(abort, 255000);
  let status: ArticleAnalysisStatus = 'unavailable';
  let analyzed: NewsItem | undefined;
  try {
    const response = await net.fetch(`${backendUrl}/news/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: article.url }),
      signal: controller.signal,
    });
    if (response.ok) {
      const payload = await response.json() as { analysis_status?: unknown };
      if (payload.analysis_status === 'disabled' || payload.analysis_status === 'expired') {
        status = payload.analysis_status;
      } else if (payload.analysis_status === 'ready') {
        analyzed = normalizeHeadlines(payload).find((item) => item.id === article.id && item.analysis);
        if (analyzed) status = 'ready';
      }
    }
  } catch { /* Keep the original article usable while showing analysis status. */ }
  finally {
    clearTimeout(timeout);
    window.removeListener('closed', abort);
  }
  const view = views.get(contentsId);
  if (window.isDestroyed() || view?.article?.id !== article.id) return;
  const next = { ...view, article: analyzed ?? view.article, articleAnalysisStatus: status };
  views.set(contentsId, next);
  window.webContents.send('window-view', next);
}

function notify(article: NewsItem) {
  const placement = monitor.getPopupPlacement();
  if (placement === 'off') return;
  tray?.setToolTip(`Hercules AI — ${article.title}`);
  dismissPopups();
  const popup = createWindow('popup', POPUP_WIDTH, POPUP_HEIGHT, currentDisplay());
  views.set(popup.webContents.id, { kind: 'popup', article });
  showWindow(popup, false);
}

function createWindow(kind: WindowView['kind'], width: number, height: number, display: Display, anchor?: Rectangle) {
  const window = new BrowserWindow({
    ...bounds(width, height, display, anchor), frame: false, transparent: kind !== 'panel', alwaysOnTop: true,
    resizable: kind === 'panel', movable: kind !== 'panel', maximizable: false, fullscreenable: false,
    ...(kind === 'panel' ? { minWidth: PANEL_WIDTH, minHeight: 320 } : {}),
    skipTaskbar: true, hasShadow: true, show: false,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' ? {
      type: 'panel', acceptFirstMouse: true, vibrancy: 'menu' as const, visualEffectState: 'active' as const,
    } : {}),
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  if (process.platform === 'darwin') {
    // Electron panel windows default to joining all Spaces. Keep this window local.
    window.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
  const windowId = window.id;
  const contentsId = window.webContents.id;
  views.set(contentsId, { kind, article: null });
  window.on('blur', () => {
    if (kind === 'popup' || dismissingWindows.has(window)) return;
    if (kind === 'panel') lastPanelBlur = { at: Date.now(), displayId: screen.getDisplayMatching(window.getBounds()).id };
    dismissWindow(window);
  });
  window.on('closed', () => {
    const timer = popupTimers.get(windowId);
    if (timer !== undefined) clearTimeout(timer);
    popupTimers.delete(windowId);
    if (window === mainWindow) mainWindow = undefined;
    views.delete(contentsId);
  });
  window.on('close', (event) => {
    if (!quitting && kind !== 'popup') { event.preventDefault(); dismissWindow(window); }
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') { event.preventDefault(); dismissWindow(window); }
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
  const trayAnchor = (display: Display, anchor = tray?.getBounds()) =>
    anchor && anchor.width > 0 && screen.getDisplayMatching(anchor).id === display.id ? anchor : undefined;
  tray.on('click', (_event, anchor: Rectangle, point?: Point) => {
    const display = currentDisplay(point);
    if (lastPanelBlur?.displayId === display.id && Date.now() - lastPanelBlur.at < 200) return;
    if (mainWindow?.isFocused() && screen.getDisplayMatching(mainWindow.getBounds()).id === display.id) {
      dismissWindow(mainWindow);
    } else {
      expandPanel(display, trayAnchor(display, anchor));
    }
  });
  tray.on('right-click', (_event, anchor: Rectangle) => {
    const display = currentDisplay();
    const placement = monitor.getPopupPlacement();
    const popupOption = (label: string, value: PopupPlacement): Electron.MenuItemConstructorOptions => ({
      label,
      type: 'radio',
      checked: placement === value,
      click: () => {
        monitor.setPopupPlacement(value);
        dismissPopups();
      },
    });
    tray?.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Open Hercules', click: () => expandPanel(display, trayAnchor(display, anchor)) },
      { label: 'Refresh news', click: () => { void monitor.refresh(); } },
      { label: 'News popups', submenu: [
        popupOption('Off', 'off'),
        popupOption('Current desktop', 'current'),
      ] },
      { type: 'separator' },
      { label: 'Quit Hercules', click: () => app.quit() },
    ]));
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.setActivationPolicy('accessory');
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
        const response = await net.fetch(`${backendUrl}/news/feed?category=${encodeURIComponent(category)}`, { signal: controller.signal });
        if (!response.ok) {
          const detail = await response.json().catch((): null => null) as { detail?: unknown } | null;
          throw new Error(typeof detail?.detail === 'string' ? detail.detail : `The news backend returned ${response.status}. Check its API configuration.`);
        }
        return await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw new Error('The news backend took too long to respond. Try refreshing.');
        if (error instanceof Error && !/fetch failed|net::|ECONNREFUSED|Failed to fetch/i.test(error.message)) throw error;
        throw new Error('Cannot reach the news service. Check your internet connection and try refreshing.');
      } finally { clearTimeout(timeout); }
    },
    onState: (state) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('news-state', state);
        const view = views.get(window.webContents.id);
        const updated = view?.article && state.articles.find((article) => article.id === view.article?.id);
        if (view && updated && (!view.article?.analysis || updated.analysis)) {
          const next = { ...view, article: updated };
          views.set(window.webContents.id, next);
          window.webContents.send('window-view', next);
        }
      }
    },
    onArticle: notify,
  });
  createTray();
  ipcMain.handle('get-news-state', () => monitor.getState());
  ipcMain.handle('get-window-view', (event) => views.get(event.sender.id) ?? { kind: 'panel', article: null });
  ipcMain.on('set-category', (_event, category: unknown) => { if (typeof category === 'string') monitor.setCategory(category); });
  ipcMain.on('open-article', (event, id: unknown) => showArticle(id, BrowserWindow.fromWebContents(event.sender) ?? undefined));
  ipcMain.on('refresh-news', () => { void monitor.refresh(); });
  ipcMain.on('minimize-panel', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) dismissWindow(window);
  });
  ipcMain.on('expand-panel', () => {
    const previous = lastPanelPlacement;
    const display = previous && screen.getAllDisplays().find((item) => item.id === previous.displayId);
    if (display && previous) {
      expandPanel(display, undefined, previous.rectangle);
    } else {
      const anchor = tray?.getBounds();
      const fallback = anchor && anchor.width > 0 ? screen.getDisplayMatching(anchor) : currentDisplay();
      expandPanel(fallback, anchor && anchor.width > 0 ? anchor : undefined);
    }
  });
  ipcMain.on('quit-app', () => app.quit());
  ipcMain.on('open-external', (_event, url: unknown) => openExternal(url));
  powerMonitor.on('resume', () => { void monitor.refresh(); });
  powerMonitor.on('unlock-screen', () => { void monitor.refresh(); });
  monitor.start();
});

app.on('before-quit', () => { quitting = true; monitor?.stop(); dismissPopups(); });
app.on('window-all-closed', () => {
  // The tray stays alive even when all transient windows are closed.
});
// App activation alone must not open a window; only the H icon does that.
