"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const server_1 = require("./server");
let mainWindow = null;
let printServer = null;
let tray = null;
let isQuitting = false;
let trayHintShown = false;
const WINDOW_WIDTH = 430;
const WINDOW_HEIGHT = 660;
const WINDOW_MIN_WIDTH = 390;
const WINDOW_MIN_HEIGHT = 560;
const APP_ID = 'com.medilis.printgateway';
if (!electron_1.app.requestSingleInstanceLock()) {
    electron_1.app.quit();
}
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
function createTrayImage() {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
            <rect x="11" y="19" width="42" height="22" rx="8" fill="#143d3c" />
            <rect x="17" y="9" width="30" height="15" rx="4" fill="#eaf4ef" />
            <rect x="18" y="33" width="28" height="17" rx="3" fill="#ffffff" />
            <rect x="23" y="38" width="18" height="3" rx="1.5" fill="#6d7a86" />
            <circle cx="46" cy="30" r="4" fill="#2eb58f" />
        </svg>
    `.trim();
    return electron_1.nativeImage
        .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
        .resize({ width: 16, height: 16 });
}
function showTrayNotice() {
    if (trayHintShown) {
        return;
    }
    trayHintShown = true;
    if (process.platform === 'win32' && tray) {
        tray.displayBalloon({
            title: 'LIS Gateway',
            content: 'Gateway is still running in the Windows hidden icons area.',
            iconType: 'info',
        });
        return;
    }
    if (electron_1.Notification.isSupported()) {
        new electron_1.Notification({
            title: 'LIS Gateway',
            body: 'Gateway is still running in the system tray.',
        }).show();
    }
}
function updateTrayMenu() {
    if (!tray) {
        return;
    }
    const isWindowVisible = Boolean(mainWindow?.isVisible());
    tray.setContextMenu(electron_1.Menu.buildFromTemplate([
        {
            label: isWindowVisible ? 'Hide Gateway' : 'Open Gateway',
            click: () => {
                if (isWindowVisible) {
                    hideToTray(false);
                    return;
                }
                void showMainWindow();
            },
        },
        {
            type: 'separator',
        },
        {
            label: 'Quit Gateway',
            click: () => {
                quitApplication();
            },
        },
    ]));
}
function ensureTray() {
    if (tray) {
        return tray;
    }
    tray = new electron_1.Tray(createTrayImage());
    tray.setToolTip('LIS Print Gateway');
    tray.on('click', () => {
        if (mainWindow?.isVisible()) {
            hideToTray(false);
            return;
        }
        void showMainWindow();
    });
    tray.on('double-click', () => {
        void showMainWindow();
    });
    updateTrayMenu();
    return tray;
}
function hideToTray(showHint) {
    if (!mainWindow) {
        return;
    }
    mainWindow.setSkipTaskbar(true);
    mainWindow.hide();
    updateTrayMenu();
    if (showHint) {
        showTrayNotice();
    }
}
function revealWindow() {
    if (!mainWindow) {
        return;
    }
    mainWindow.setSkipTaskbar(false);
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    updateTrayMenu();
    void updateStatus();
}
async function showMainWindow() {
    if (!mainWindow) {
        await createWindow();
        return;
    }
    revealWindow();
}
function quitApplication() {
    isQuitting = true;
    tray?.destroy();
    tray = null;
    mainWindow?.destroy();
    electron_1.app.quit();
}
async function createWindow() {
    if (mainWindow) {
        revealWindow();
        return;
    }
    const loginItemSettings = electron_1.app.getLoginItemSettings();
    const shouldStartHidden = Boolean(loginItemSettings.wasOpenedAtLogin);
    mainWindow = new electron_1.BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        minWidth: WINDOW_MIN_WIDTH,
        minHeight: WINDOW_MIN_HEIGHT,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#f3eee4',
        fullscreenable: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const indexPath = path_1.default.join(__dirname, '../src/index.html');
    ensureTray();
    mainWindow.once('ready-to-show', () => {
        if (shouldStartHidden) {
            hideToTray(false);
            return;
        }
        revealWindow();
    });
    mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow && !shouldStartHidden && !mainWindow.isVisible()) {
            revealWindow();
        }
    });
    await mainWindow.loadFile(indexPath);
    if (!electron_1.app.isPackaged) {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    mainWindow.on('minimize', () => {
        if (!isQuitting) {
            hideToTray(true);
        }
    });
    mainWindow.on('close', (event) => {
        if (isQuitting) {
            return;
        }
        event.preventDefault();
        hideToTray(true);
    });
    mainWindow.on('show', () => {
        updateTrayMenu();
    });
    mainWindow.on('hide', () => {
        updateTrayMenu();
    });
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
electron_1.app.setAppUserModelId(APP_ID);
electron_1.app.on('second-instance', () => {
    void showMainWindow();
});
electron_1.app.whenReady().then(() => createWindow()).catch((error) => {
    console.error('Failed to start LIS Print Gateway:', error);
    electron_1.app.quit();
});
electron_1.app.on('window-all-closed', () => {
    // Keep the tray resident app alive even when the main window is hidden.
});
electron_1.app.on('activate', () => {
    void showMainWindow();
});
electron_1.app.on('before-quit', () => {
    isQuitting = true;
});
electron_1.app.on('quit', () => {
    tray?.destroy();
    printServer?.stop();
});
electron_1.ipcMain.on('set-autostart', (_event, enabled) => {
    electron_1.app.setLoginItemSettings({
        openAtLogin: enabled,
        path: electron_1.app.getPath('exe'),
    });
    void updateStatus();
});
electron_1.ipcMain.on('hide-to-tray', () => {
    hideToTray(false);
});
