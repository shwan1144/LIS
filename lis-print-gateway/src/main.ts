import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage } from 'electron';
import path from 'path';
import { PrintServer } from './server';

let mainWindow: BrowserWindow | null = null;
let printServer: PrintServer | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let trayHintShown = false;

const WINDOW_WIDTH = 430;
const WINDOW_HEIGHT = 660;
const WINDOW_MIN_WIDTH = 390;
const WINDOW_MIN_HEIGHT = 560;
const APP_ID = 'com.medilis.printgateway';

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

function ensurePrintServer(): PrintServer {
    if (!printServer) {
        printServer = new PrintServer((event) => {
            if (!mainWindow) {
                return;
            }

            if (event.type === 'log') {
                mainWindow.webContents.send('log-message', event.data);
                return;
            }

            void updateStatus();
        }, app.getVersion());

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

    return nativeImage
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

    if (Notification.isSupported()) {
        new Notification({
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
    tray.setContextMenu(Menu.buildFromTemplate([
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

    tray = new Tray(createTrayImage());
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

function hideToTray(showHint: boolean) {
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

async function showMainWindow(): Promise<void> {
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
    app.quit();
}

async function createWindow(): Promise<void> {
    if (mainWindow) {
        revealWindow();
        return;
    }

    const loginItemSettings = app.getLoginItemSettings();
    const shouldStartHidden = Boolean(loginItemSettings.wasOpenedAtLogin);

    mainWindow = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        minWidth: WINDOW_MIN_WIDTH,
        minHeight: WINDOW_MIN_HEIGHT,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#f3eee4',
        fullscreenable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const indexPath = path.join(__dirname, '../src/index.html');
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

    if (!app.isPackaged) {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('minimize' as any, () => {
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

async function updateStatus(): Promise<void> {
    if (!mainWindow || !printServer) {
        return;
    }

    const status = await printServer.getStatusSnapshot();
    const autostart = app.getLoginItemSettings().openAtLogin;

    mainWindow.webContents.send('status-update', {
        ...status,
        autostart,
    });
}

app.setAppUserModelId(APP_ID);

app.on('second-instance', () => {
    void showMainWindow();
});

app.whenReady().then(() => createWindow()).catch((error: unknown) => {
    console.error('Failed to start LIS Print Gateway:', error);
    app.quit();
});

app.on('window-all-closed', () => {
    // Keep the tray resident app alive even when the main window is hidden.
});

app.on('activate', () => {
    void showMainWindow();
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('quit', () => {
    tray?.destroy();
    printServer?.stop();
});

ipcMain.on('set-autostart', (_event, enabled: boolean) => {
    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe'),
    });

    void updateStatus();
});

ipcMain.on('hide-to-tray', () => {
    hideToTray(false);
});
