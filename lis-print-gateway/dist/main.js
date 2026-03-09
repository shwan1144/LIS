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
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 420,
        height: 520,
        resizable: electron_is_dev_1.default,
        autoHideMenuBar: true,
        icon: path_1.default.join(__dirname, '../assets/icon.ico'), // Placeholder icon path
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const indexPath = path_1.default.join(electron_1.app.getAppPath(), 'src/index.html');
    console.log(`Loading index.html from: ${indexPath}`);
    mainWindow.loadFile(indexPath).catch(err => {
        console.error('Failed to load index.html:', err);
    });
    if (electron_is_dev_1.default) {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Start Printing Server
    printServer = new server_1.PrintServer((event) => {
        if (mainWindow) {
            if (event.type === 'log') {
                mainWindow.webContents.send('log-message', event.data);
            }
            else if (event.type === 'status') {
                updateStatus();
            }
        }
    });
    printServer.start();
    // Initial status update after window load
    mainWindow.webContents.on('did-finish-load', () => {
        updateStatus();
    });
}
async function updateStatus() {
    if (mainWindow && printServer) {
        const printers = await printServer.getPrinterCount();
        const port = process.env.PORT || 17881;
        const autostart = electron_1.app.getLoginItemSettings().openAtLogin;
        mainWindow.webContents.send('status-update', {
            port,
            printers,
            autostart
        });
    }
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
electron_1.app.on('quit', () => {
    if (printServer) {
        printServer.stop();
    }
});
// IPC communication
electron_1.ipcMain.on('set-autostart', (_event, enabled) => {
    console.log(`Setting autostart to: ${enabled}`);
    electron_1.app.setLoginItemSettings({
        openAtLogin: enabled,
        path: electron_1.app.getPath('exe')
    });
});
