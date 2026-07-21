const { app, BrowserWindow, Tray, powerMonitor, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 800,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Right align logic (placeholder)
  // const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // mainWindow.setPosition(width - 360, 0);

  mainWindow.loadURL('http://localhost:5173');
}

app.whenReady().then(() => {
  createWindow();

  // Tray setup (placeholder)
  // tray = new Tray(path.join(__dirname, 'icon.png'));
  
  powerMonitor.on('unlock-screen', () => {
    mainWindow.webContents.send('system-wake');
  });

  powerMonitor.on('resume', () => {
    mainWindow.webContents.send('system-wake');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.handle('minimize-to-icon', () => {
  mainWindow.hide();
});

ipcMain.handle('expand-panel', () => {
  mainWindow.show();
});

ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('get-news', () => {
  return [];
});
