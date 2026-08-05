import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onSystemWake: (callback: () => void) =>
    ipcRenderer.on('system-wake', () => callback()),
  minimizePanel: () => ipcRenderer.send('minimize-panel'),
  expandPanel: () => ipcRenderer.send('expand-panel'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
});
