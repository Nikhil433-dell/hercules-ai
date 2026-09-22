import {
  app,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  screen,
  shell,
} from 'electron';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 680;
const PANEL_MARGIN = 8; // Gap from screen edges
const COLLAPSED_WIDTH = 72;
const COLLAPSED_HEIGHT = 72;
const EDGE_PEEK = 20;

function getTopRightOrigin() {
  const display = screen.getPrimaryDisplay();
  const { x, width } = display.workArea;
  return {
    x: x + width - PANEL_WIDTH - PANEL_MARGIN,
    y: display.workArea.y + PANEL_MARGIN, // Just below the macOS menu bar
  };
}

function getCollapsedOrigin() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  return {
    x: x + width - EDGE_PEEK,
    y: y + Math.round((height - COLLAPSED_HEIGHT) / 2),
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

  const expandPanel = () => {
    if (!mainWindow) return;
    const { x, y } = getTopRightOrigin();
    mainWindow.setBounds({ x, y, width: PANEL_WIDTH, height: PANEL_HEIGHT }, true);
    mainWindow.show();
    mainWindow.webContents.send('panel-state-changed', 'expanded');
  };

  const collapsePanel = () => {
    if (!mainWindow) return;
    const { x, y } = getCollapsedOrigin();
    mainWindow.setBounds({
      x,
      y,
      width: COLLAPSED_WIDTH,
      height: COLLAPSED_HEIGHT,
    }, true);
    mainWindow.show();
    mainWindow.webContents.send('panel-state-changed', 'collapsed');
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
};

app.on('ready', () => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  createWindow();
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
