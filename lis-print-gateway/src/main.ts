import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import { PrintServer } from './server';

let mainWindow: BrowserWindow | null = null;
let printServer: PrintServer | null = null;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 420,
        height: 520,
        resizable: isDev,
        autoHideMenuBar: true,
        icon: path.join(__dirname, '../assets/icon.ico'), // Placeholder icon path
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const indexPath = path.join(app.getAppPath(), 'src/index.html');
    console.log(`Loading index.html from: ${indexPath}`);

    mainWindow.loadFile(indexPath).catch(err => {
        console.error('Failed to load index.html:', err);
    });

    if (isDev) {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Start Printing Server
    printServer = new PrintServer((event) => {
        if (mainWindow) {
            if (event.type === 'log') {
                mainWindow.webContents.send('log-message', event.data);
            } else if (event.type === 'status') {
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
        const autostart = app.getLoginItemSettings().openAtLogin;

        mainWindow.webContents.send('status-update', {
            port,
            printers,
            autostart
        });
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('quit', () => {
    if (printServer) {
        printServer.stop();
    }
});

// IPC communication
ipcMain.on('set-autostart', (_event, enabled: boolean) => {
    console.log(`Setting autostart to: ${enabled}`);
    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe')
    });
});
