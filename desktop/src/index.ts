import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, Notification, powerMonitor, screen, shell, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { NewsMonitor, MonitorStorage } from './services/newsMonitor';
import type { NewsItem } from './shared/news';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) app.quit();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let monitor: NewsMonitor;
let quitting = false;
const activeNotifications = new Set<Notification>();
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 680;

function panelBounds() {
  const anchor = tray?.getBounds();
  const display = anchor && anchor.width > 0 ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(PANEL_WIDTH, area.width);
  const height = Math.min(PANEL_HEIGHT, area.height);
  return {
    width, height,
    x: Math.max(area.x, Math.min(area.x + area.width - width - 8, anchor ? Math.round(anchor.x + anchor.width / 2 - width / 2) : area.x + area.width - width - 8)),
    y: area.y + 8,
  };
}

function expandPanel() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setBounds(panelBounds());
  mainWindow.show();
  mainWindow.focus();
}

function openExternal(url: unknown) {
  if (typeof url !== 'string') return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(parsed.toString());
  } catch { /* Invalid links never leave the app. */ }
}

function notify(article: NewsItem) {
  tray?.setToolTip(`Hercules AI — ${article.title}`);
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: article.tickers.length > 0 ? `Hercules · ${article.tickers.join(', ')}` : 'Hercules · Finance',
      body: article.title,
      silent: true,
    });
    activeNotifications.add(notification);
    notification.on('close', () => activeNotifications.delete(notification));
    notification.on('failed', () => activeNotifications.delete(notification));
    notification.on('click', expandPanel);
    notification.show();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...panelBounds(), frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, hasShadow: true, show: false,
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.once('ready-to-show', expandPanel);
  mainWindow.on('close', (event) => {
    if (!quitting) { event.preventDefault(); mainWindow?.hide(); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== MAIN_WINDOW_WEBPACK_ENTRY) { event.preventDefault(); openExternal(url); }
  });
}

function createTray() {
  const image = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAN0lEQVR4nO3OwQkAIAwEwfTfdGzgPkERxFm4Z8JUScp12NUfAAAA6fjEAAC2ANMAAADeBkj/tAAlcgMMBazXfAAAAABJRU5ErkJggg==').resize({ width: 18, height: 18 });
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Hercules AI');
  tray.on('click', () => mainWindow?.isVisible() ? mainWindow.hide() : expandPanel());
  tray.on('right-click', () => tray?.popUpContextMenu(Menu.buildFromTemplate([
    { label: 'Open Hercules', click: expandPanel },
    { label: 'Send demo alert', click: () => monitor.simulate() },
    { label: 'Refresh news', click: () => { void monitor.refresh(); } },
    { type: 'separator' },
    { label: 'Quit Hercules', click: () => app.quit() },
  ])));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
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
    fetchHeadlines: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await net.fetch('http://127.0.0.1:8000/news/headlines?category=business', { signal: controller.signal });
        if (!response.ok) throw new Error(`The news backend returned ${response.status}. Check that it is running with valid news API keys.`);
        return await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw new Error('The news backend took too long to respond. Try refreshing.');
        throw error;
      } finally { clearTimeout(timeout); }
    },
    onState: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('news-state', state);
    },
    onArticle: notify,
  });
  createTray();
  createWindow();
  ipcMain.handle('get-news-state', () => monitor.getState());
  ipcMain.on('set-news-mode', (_event, mode: unknown) => {
    if (mode === 'demo' || mode === 'live') monitor.setMode(mode);
  });
  ipcMain.on('simulate-news', () => monitor.simulate());
  ipcMain.on('refresh-news', () => { void monitor.refresh(); });
  ipcMain.on('minimize-panel', () => mainWindow?.hide());
  ipcMain.on('expand-panel', expandPanel);
  ipcMain.on('quit-app', () => app.quit());
  ipcMain.on('open-external', (_event, url: unknown) => openExternal(url));
  powerMonitor.on('resume', () => { void monitor.refresh(); });
  powerMonitor.on('unlock-screen', () => { void monitor.refresh(); });
  monitor.start();
});

app.on('before-quit', () => { quitting = true; monitor?.stop(); });
app.on('activate', expandPanel);
