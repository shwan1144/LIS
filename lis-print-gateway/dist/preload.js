"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    onStatus: (callback) => {
        const listener = (_event, value) => callback(value);
        electron_1.ipcRenderer.on('status-update', listener);
        return () => electron_1.ipcRenderer.removeListener('status-update', listener);
    },
    onLog: (callback) => {
        const listener = (_event, value) => callback(value);
        electron_1.ipcRenderer.on('log-message', listener);
        return () => electron_1.ipcRenderer.removeListener('log-message', listener);
    },
    setAutostart: (enabled) => {
        electron_1.ipcRenderer.send('set-autostart', enabled);
    },
    hideToTray: () => {
        electron_1.ipcRenderer.send('hide-to-tray');
    },
});
