"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const electron_is_dev_1 = __importDefault(require("electron-is-dev"));
const server_1 = require("./server");
let mainWindow = null;
let printServer = null;
function ensurePrintServer() {
    if (!printServer) {
        printServer = new server_1.PrintServer((event) => {
            if (!mainWindow) {
                return;
            }
            if (event.type === 'log') {
                mainWindow.webContents.send('log-message', event.data);
                return;
            }
            void updateStatus();
        }, electron_1.app.getVersion());
        printServer.start();
    }
    return printServer;
}
async function createWindow() {
    if (mainWindow) {
        mainWindow.focus();
        return;
    }
    mainWindow = new electron_1.BrowserWindow({
        width: 520,
        height: 760,
        minWidth: 480,
        minHeight: 680,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#f3eee4',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const indexPath = path_1.default.join(__dirname, '../src/index.html');
    await mainWindow.loadFile(indexPath);
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    if (electron_is_dev_1.default) {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    ensurePrintServer();
    mainWindow.webContents.on('did-finish-load', () => {
        void updateStatus();
    });
}
async function updateStatus() {
    if (!mainWindow || !printServer) {
        return;
    }
    const status = await printServer.getStatusSnapshot();
    const autostart = electron_1.app.getLoginItemSettings().openAtLogin;
    mainWindow.webContents.send('status-update', {
        ...status,
        autostart,
    });
}
electron_1.app.whenReady().then(() => createWindow()).catch((error) => {
    console.error('Failed to start LIS Print Gateway:', error);
    electron_1.app.quit();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
    }
});
electron_1.app.on('quit', () => {
    printServer?.stop();
});
electron_1.ipcMain.on('set-autostart', (_event, enabled) => {
    electron_1.app.setLoginItemSettings({
        openAtLogin: enabled,
        path: electron_1.app.getPath('exe'),
    });
    void updateStatus();
});
