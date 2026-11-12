import { contextBridge, ipcRenderer } from 'electron';

// A remote YouTube child frame receives no host bridge or plugin API.
if (process.isMainFrame && location.origin === 'https://com.popop098.kitvi' && location.pathname === '/player.html') {
  contextBridge.exposeInMainWorld('kitviPlayerReport', (value: unknown) => ipcRenderer.send('kitvi:player-report', value));
}
