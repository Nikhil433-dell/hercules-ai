import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  powerMonitor,
  screen,
  shell,
} from 'electron';
import * as path from 'path';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isExpanded = true;

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 680;
const PANEL_MARGIN = 8; // Gap from screen edges

function getTopRightOrigin() {
  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  return {
    x: width - PANEL_WIDTH - PANEL_MARGIN,
    y: display.workArea.y + PANEL_MARGIN, // Just below the macOS menu bar
  };
}

const createWindow = (): void => {
  const origin = getTopRightOrigin();

  mainWindow = new BrowserWindow({
    x: origin.x,
    y: origin.y,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open external links in default browser (Chrome/Safari)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Auto-minimize timer
  let autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  const startAutoHide = () => {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      if (mainWindow && isExpanded) {
        collapsePanel();
      }
    }, 2 * 60 * 1000);
  };

  const expandPanel = () => {
    if (!mainWindow) return;
    const origin = getTopRightOrigin();
    mainWindow.setBounds(
      { x: origin.x, y: origin.y, width: PANEL_WIDTH, height: PANEL_HEIGHT },
      true,
    );
    mainWindow.show();
    isExpanded = true;
    startAutoHide();
  };

  const collapsePanel = () => {
    if (!mainWindow) return;
    const display = screen.getPrimaryDisplay();
    const { width } = display.workAreaSize;
    // Shrink to floating square in top-right
    mainWindow.setBounds(
      { x: width - 52 - PANEL_MARGIN, y: display.workArea.y + PANEL_MARGIN, width: 44, height: 44 },
      true,
    );
    isExpanded = false;
    if (autoHideTimer) clearTimeout(autoHideTimer);
  };

  // IPC handlers
  ipcMain.on('minimize-panel', () => collapsePanel());
  ipcMain.on('expand-panel', () => expandPanel());
  ipcMain.on('open-external', (_event, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });

  // Detect system wake/unlock → show panel
  powerMonitor.on('unlock-screen', () => {
    mainWindow?.webContents.send('system-wake');
    expandPanel();
  });
  powerMonitor.on('resume', () => {
    mainWindow?.webContents.send('system-wake');
    expandPanel();
  });

  startAutoHide();
};

const createTray = (): void => {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Hercules AI');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Panel', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.show();
    ipcMain.emit('expand-panel');
  });
};

app.on('ready', () => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
