import { contextBridge, ipcRenderer } from 'electron';

export type GatewayStatus = {
    autostart: boolean;
    port: number;
    printerCount: number;
    printers: string[];
    service: string;
    startedAt: string;
    status: 'ok';
    version: string;
};

export type GatewayLogMessage = {
    text: string;
    timestamp: string;
    type: 'error' | 'info' | 'success';
};

contextBridge.exposeInMainWorld('api', {
    onStatus: (callback: (status: GatewayStatus) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, value: GatewayStatus) => callback(value);
        ipcRenderer.on('status-update', listener);
        return () => ipcRenderer.removeListener('status-update', listener);
    },
    onLog: (callback: (message: GatewayLogMessage) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, value: GatewayLogMessage) => callback(value);
        ipcRenderer.on('log-message', listener);
        return () => ipcRenderer.removeListener('log-message', listener);
    },
    setAutostart: (enabled: boolean) => {
        ipcRenderer.send('set-autostart', enabled);
    },
    hideToTray: () => {
        ipcRenderer.send('hide-to-tray');
    },
});
