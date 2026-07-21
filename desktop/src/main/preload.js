const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeToIcon: () => ipcRenderer.invoke('minimize-to-icon'),
  expandPanel: () => ipcRenderer.invoke('expand-panel'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  getNews: () => ipcRenderer.invoke('get-news'),
  onNewsUpdate: (callback) => ipcRenderer.on('news-update', (_event, value) => callback(value)),
  onSystemWake: (callback) => ipcRenderer.on('system-wake', () => callback())
});
