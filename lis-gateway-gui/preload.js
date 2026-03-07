const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getStatus: () => ipcRenderer.invoke('gateway:get-status'),
    getConfigView: () => ipcRenderer.invoke('gateway:get-config-view'),
    getLogs: (limit) => ipcRenderer.invoke('gateway:get-logs', limit),
    activateGateway: (payload) => ipcRenderer.invoke('gateway:activate', payload),
    syncNow: () => ipcRenderer.invoke('gateway:sync-now'),
    listSerialPorts: () => ipcRenderer.invoke('gateway:serial:list-ports'),
    testSerialPort: (payload) => ipcRenderer.invoke('gateway:serial:test-port', payload),
    getManagementStatus: () => ipcRenderer.invoke('gateway:management-status'),
    managementLogin: (payload) => ipcRenderer.invoke('gateway:management-login', payload),
    managementRefresh: () => ipcRenderer.invoke('gateway:management-refresh'),
    managementLogout: () => ipcRenderer.invoke('gateway:management-logout'),
    listInstruments: () => ipcRenderer.invoke('gateway:instruments:list'),
    createInstrument: (payload) => ipcRenderer.invoke('gateway:instruments:create', payload),
    updateInstrument: (id, data) => ipcRenderer.invoke('gateway:instruments:update', { id, data }),
    deleteInstrument: (id) => ipcRenderer.invoke('gateway:instruments:delete', { id }),
    toggleInstrument: (id) => ipcRenderer.invoke('gateway:instruments:toggle', { id }),
});
