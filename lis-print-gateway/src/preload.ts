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
        ipcRenderer.on('status-update', (_event, value: GatewayStatus) => callback(value));
    },
    onLog: (callback: (message: GatewayLogMessage) => void) => {
        ipcRenderer.on('log-message', (_event, value: GatewayLogMessage) => callback(value));
    },
    setAutostart: (enabled: boolean) => {
        ipcRenderer.send('set-autostart', enabled);
    },
});
