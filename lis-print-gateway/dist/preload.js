"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    onStatus: (callback) => {
        electron_1.ipcRenderer.on('status-update', (_event, value) => callback(value));
    },
    onLog: (callback) => {
        electron_1.ipcRenderer.on('log-message', (_event, value) => callback(value));
    },
    setAutostart: (enabled) => {
        electron_1.ipcRenderer.send('set-autostart', enabled);
    },
});
