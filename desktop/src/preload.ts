// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onSystemWake: (callback: () => void) =>
    ipcRenderer.on('system-wake', () => callback()),
  minimizePanel: () => ipcRenderer.send('minimize-panel'),
  expandPanel: () => ipcRenderer.send('expand-panel'),
  resizePanel: (height: number) => ipcRenderer.send('resize-panel', height),
});
