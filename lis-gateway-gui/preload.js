const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, data) => callback(data)),
    onLogMessage: (callback) => ipcRenderer.on('log-message', (event, msg) => callback(msg)),
    getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
});
