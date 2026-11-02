import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { ElectronAPI, NewsState } from './shared/news';

const api: ElectronAPI = {
  getNewsState: () => ipcRenderer.invoke('get-news-state'),
  onNewsState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: NewsState) => callback(state);
    ipcRenderer.on('news-state', listener);
    return () => ipcRenderer.removeListener('news-state', listener);
  },
  setNewsMode: (mode) => ipcRenderer.send('set-news-mode', mode),
  simulateNews: () => ipcRenderer.send('simulate-news'),
  refreshNews: () => ipcRenderer.send('refresh-news'),
  minimizePanel: () => ipcRenderer.send('minimize-panel'),
  quitApp: () => ipcRenderer.send('quit-app'),
  expandPanel: () => ipcRenderer.send('expand-panel'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
};
contextBridge.exposeInMainWorld('electronAPI', api);
