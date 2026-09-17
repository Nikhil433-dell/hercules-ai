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

import { existsSync } from 'fs';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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

  const expandPanel = () => {
    if (!mainWindow) return;
    // Position relative to tray if available (macOS), otherwise use top-right origin
    let x = getTopRightOrigin().x;
    let y = getTopRightOrigin().y;
    if (tray && typeof (tray as any).getBounds === 'function') {
      try {
        const bounds = (tray as any).getBounds();
        x = Math.round(bounds.x + bounds.width / 2 - PANEL_WIDTH / 2);
        y = Math.round(bounds.y + bounds.height + PANEL_MARGIN);
      } catch (e) {
        // fallback to top-right
      }
    }
    mainWindow.setBounds({ x, y, width: PANEL_WIDTH, height: PANEL_HEIGHT }, true);
    mainWindow.show();
    mainWindow.webContents.send('panel-state-changed', 'expanded');
  };

  const collapsePanel = () => {
    if (!mainWindow) return;
    // Shrink to floating square near top-right or near tray
    let x = getTopRightOrigin().x + PANEL_WIDTH - 52;
    let y = getTopRightOrigin().y;
    if (tray && typeof (tray as any).getBounds === 'function') {
      try {
        const bounds = (tray as any).getBounds();
        x = Math.round(bounds.x + bounds.width - 52);
        y = Math.round(bounds.y);
      } catch (e) {}
    } else {
      const display = screen.getPrimaryDisplay();
      const { width } = display.workAreaSize;
      x = width - 52 - PANEL_MARGIN;
      y = display.workArea.y + PANEL_MARGIN;
    }
    mainWindow.setBounds({ x, y, width: 44, height: 44 }, true);
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

const createTray = (): void => {
  // Prefer a packaged icon; fall back to a bundled template image for macOS (.png or .svg)
  let icon: nativeImage.NativeImage;
  try {
    const baseDir = __dirname + '/assets';
    const packagedPath = app.isPackaged ? process.resourcesPath + '/icon.png' : null;
    const candidatePng = baseDir + '/trayTemplate.png';
    const candidateSvg = baseDir + '/trayTemplate.svg';
    let iconPath = '';
    if (packagedPath && existsSync(packagedPath)) {
      iconPath = packagedPath;
    } else if (existsSync(candidatePng)) {
      iconPath = candidatePng;
    } else if (existsSync(candidateSvg)) {
      iconPath = candidateSvg;
    } else {
      iconPath = '';
    }
    if (iconPath) {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) icon = nativeImage.createEmpty();
    } else {
      icon = nativeImage.createEmpty();
    }
  } catch (e) {
    icon = nativeImage.createEmpty();
  }

  // On macOS, mark as template image so the system can adapt it for dark/light modes
  if (process.platform === 'darwin' && icon && typeof (icon as any).setTemplateImage === 'function') {
    try { (icon as any).setTemplateImage(true); } catch (e) {}
  }

  tray = new Tray(icon);
  tray.setToolTip('Hercules AI');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Toggle Panel', click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
          mainWindow.webContents.send('panel-state-changed', 'collapsed');
        } else {
          // position relative to tray if possible
          if (tray && typeof (tray as any).getBounds === 'function') {
            try {
              const bounds = (tray as any).getBounds();
              const x = Math.round(bounds.x + bounds.width / 2 - PANEL_WIDTH / 2);
              const y = Math.round(bounds.y + bounds.height + PANEL_MARGIN);
              mainWindow.setBounds({ x, y, width: PANEL_WIDTH, height: PANEL_HEIGHT }, true);
            } catch (e) {}
          }
          mainWindow.show();
          mainWindow.webContents.send('panel-state-changed', 'expanded');
        }
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      mainWindow.webContents.send('panel-state-changed', 'collapsed');
    } else {
      if (tray && typeof (tray as any).getBounds === 'function') {
        try {
          const bounds = (tray as any).getBounds();
          const x = Math.round(bounds.x + bounds.width / 2 - PANEL_WIDTH / 2);
          const y = Math.round(bounds.y + bounds.height + PANEL_MARGIN);
          mainWindow.setBounds({ x, y, width: PANEL_WIDTH, height: PANEL_HEIGHT }, true);
        } catch (e) {}
      }
      mainWindow.show();
      mainWindow.webContents.send('panel-state-changed', 'expanded');
    }
  });

  // Hide Dock icon on macOS so the app behaves like a menu-bar-only app
  if (process.platform === 'darwin' && (app as any).dock) {
    try { (app as any).dock.hide(); } catch (e) {}
  }
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
