import { contextBridge, ipcRenderer } from 'electron';
import type { KitviApi } from '../shared/contracts.ts';
const listen = <T>(channel: string, callback: (value: T) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener); return () => { ipcRenderer.removeListener(channel, listener); };
};
const api: KitviApi = {
  getState: () => ipcRenderer.invoke('system:get'), refresh: () => ipcRenderer.invoke('system:refresh'), retryCollector: () => ipcRenderer.invoke('system:retry'),
  onState: (callback) => listen('system:changed', callback),
  getAppearance: () => ipcRenderer.invoke('appearance:get'), setAppearance: (value) => ipcRenderer.invoke('appearance:set', value),
  getWindow: () => ipcRenderer.invoke('window:get'), onWindow: (callback) => listen('window:changed', callback),
  minimize: () => ipcRenderer.invoke('window:minimize'), toggleMaximize: () => ipcRenderer.invoke('window:maximize'), close: () => ipcRenderer.invoke('window:close'),
  getUpdateState: () => ipcRenderer.invoke('update:get'), checkUpdates: () => ipcRenderer.invoke('update:check'),
  setAutoCheck: (value) => ipcRenderer.invoke('update:auto', value), downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'), openReleasePage: () => ipcRenderer.invoke('update:release'),
  onUpdate: (callback) => listen('update:changed', callback),
  getPlugins: () => ipcRenderer.invoke('plugins:get'), previewPlugin: (repository) => ipcRenderer.invoke('plugins:preview', repository),
  setPluginSystemEnabled: (enabled, acceptNotice) => ipcRenderer.invoke('plugins:system', enabled, acceptNotice),
  acceptPlugin: (id, contentHash) => ipcRenderer.invoke('plugins:accept', id, contentHash),
  previewLocalPlugin: () => ipcRenderer.invoke('plugins:local'), confirmPlugin: (token) => ipcRenderer.invoke('plugins:confirm', token),
  setPluginEnabled: (id, enabled) => ipcRenderer.invoke('plugins:enable', id, enabled), removePlugin: (id) => ipcRenderer.invoke('plugins:remove', id),
  onPlugins: (callback) => listen('plugins:changed', callback),
  getPluginUpdates: () => ipcRenderer.invoke('plugin-updates:get'), checkPluginUpdates: () => ipcRenderer.invoke('plugin-updates:check'),
  setPluginAutoCheck: (value) => ipcRenderer.invoke('plugin-updates:auto', value), applyPluginUpdate: (id) => ipcRenderer.invoke('plugin-updates:apply', id),
  onPluginUpdates: (callback) => listen('plugin-updates:changed', callback),
  invokePlugin: (id, method, params) => ipcRenderer.invoke('plugins:invoke', id, method, params),
  getPluginMedia: (id) => ipcRenderer.invoke('media:get', id), onMedia: (callback) => listen('media:changed', callback),
};
contextBridge.exposeInMainWorld('kitvi', Object.freeze(api));
