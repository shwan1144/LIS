const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getStatus: () => ipcRenderer.invoke('gateway:get-status'),
    getConfigView: () => ipcRenderer.invoke('gateway:get-config-view'),
    getLogs: (limit) => ipcRenderer.invoke('gateway:get-logs', limit),
    activateGateway: (payload) => ipcRenderer.invoke('gateway:activate', payload),
    syncNow: () => ipcRenderer.invoke('gateway:sync-now'),
});
