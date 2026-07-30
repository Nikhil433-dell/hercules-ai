import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  powerMonitor,
  screen,
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
const PANEL_INITIAL_HEIGHT = 60;  // Starts tiny — just the header
const PANEL_MAX_HEIGHT = 680;
const PANEL_MARGIN = 8;           // Gap from screen edges

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
    height: PANEL_INITIAL_HEIGHT,
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

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Auto-minimize after 2 minutes
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
    // Start at initial compact height — renderer will grow it via resize-panel
    mainWindow.setBounds(
      { x: origin.x, y: origin.y, width: PANEL_WIDTH, height: PANEL_INITIAL_HEIGHT },
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
    // Shrink to floating circle in top-right (near menu bar icons)
    mainWindow.setBounds(
      { x: width - 72 - PANEL_MARGIN, y: display.workArea.y + PANEL_MARGIN, width: 60, height: 60 },
      true,
    );
    isExpanded = false;
    if (autoHideTimer) clearTimeout(autoHideTimer);
  };

  // IPC handlers
  ipcMain.on('minimize-panel', () => collapsePanel());
  ipcMain.on('expand-panel', () => expandPanel());

  // Dynamic height resize — renderer tells us how tall the content is
  ipcMain.on('resize-panel', (_event, height: number) => {
    if (!mainWindow || !isExpanded) return;
    const clampedHeight = Math.min(Math.max(height, PANEL_INITIAL_HEIGHT), PANEL_MAX_HEIGHT);
    const origin = getTopRightOrigin();
    mainWindow.setBounds(
      { x: origin.x, y: origin.y, width: PANEL_WIDTH, height: clampedHeight },
      true,
    );
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
