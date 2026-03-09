import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    onStatus: (callback: (status: any) => void) => {
        ipcRenderer.on('status-update', (_event, value) => callback(value));
    },
    onLog: (callback: (msg: { text: string; type: string }) => void) => {
        ipcRenderer.on('log-message', (_event, value) => callback(value));
    },
    setAutostart: (enabled: boolean) => {
        ipcRenderer.send('set-autostart', enabled);
    }
});
