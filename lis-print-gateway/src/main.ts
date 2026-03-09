import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import { PrintServer } from './server';

let mainWindow: BrowserWindow | null = null;
let printServer: PrintServer | null = null;

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

async function createWindow(): Promise<void> {
    if (mainWindow) {
        mainWindow.focus();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 520,
        height: 760,
        minWidth: 480,
        minHeight: 680,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#f3eee4',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const indexPath = path.join(__dirname, '../src/index.html');
    await mainWindow.loadFile(indexPath);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    if (isDev) {
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

app.whenReady().then(() => createWindow()).catch((error: unknown) => {
    console.error('Failed to start LIS Print Gateway:', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
    }
});

app.on('quit', () => {
    printServer?.stop();
});

ipcMain.on('set-autostart', (_event, enabled: boolean) => {
    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe'),
    });

    void updateStatus();
});
