import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { ElectronAPI, NewsState, WindowView } from './shared/news';

const api: ElectronAPI = {
  getNewsState: () => ipcRenderer.invoke('get-news-state'),
  onNewsState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: NewsState) => callback(state);
    ipcRenderer.on('news-state', listener);
    return () => ipcRenderer.removeListener('news-state', listener);
  },
  getWindowView: () => ipcRenderer.invoke('get-window-view'),
  onWindowView: (callback) => {
    const listener = (_event: IpcRendererEvent, view: WindowView) => callback(view);
    ipcRenderer.on('window-view', listener);
    return () => ipcRenderer.removeListener('window-view', listener);
  },
  setCategory: (category) => ipcRenderer.send('set-category', category),
  openArticle: (id) => ipcRenderer.send('open-article', id),
  refreshNews: () => ipcRenderer.send('refresh-news'),
  minimizePanel: () => ipcRenderer.send('minimize-panel'),
  quitApp: () => ipcRenderer.send('quit-app'),
  expandPanel: () => ipcRenderer.send('expand-panel'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
};
contextBridge.exposeInMainWorld('electronAPI', api);
