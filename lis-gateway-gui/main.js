const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const axios = require('axios');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#1a1a1a',
        autoHideMenuBar: true,
    });

    // In development, load from Vite dev server
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Settings management
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    return {
        lisApiUrl: '',
        lisApiKey: '',
        instruments: [
            { id: 'medonic', name: 'Medonic M51', type: 'TCP', port: 5600, cloudId: '', status: 'OFFLINE' },
            { id: 'cobas_c111', name: 'Cobas C111', type: 'SERIAL', port: 'COM1', baudRate: 9600, cloudId: '', status: 'OFFLINE' },
            { id: 'cobas_e411', name: 'Cobas E411', type: 'SERIAL', port: 'COM2', baudRate: 9600, cloudId: '', status: 'OFFLINE' },
        ]
    };
}

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', (event, config) => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    restartListeners(config);
    return { success: true };
});

ipcMain.handle('test-connection', async (event, { url, apiKey }) => {
    try {
        const response = await axios.get(`${url}/patients?size=1`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 5000,
        });
        return { success: true, message: 'Connected to Cloud LIS successfully!' };
    } catch (error) {
        const msg = error.response?.data?.message || error.message;
        return { success: false, message: `Connection failed: ${msg}` };
    }
});

// Listener Management
let activeListeners = {};

function restartListeners(config) {
    // Stop existing
    Object.values(activeListeners).forEach(l => l.stop());
    activeListeners = {};

    config.instruments.forEach(inst => {
        if (inst.type === 'TCP') {
            activeListeners[inst.id] = startTcpListener(inst, config);
        } else {
            activeListeners[inst.id] = startSerialListener(inst, config);
        }
    });
}

function startTcpListener(inst, config) {
    const server = net.createServer((socket) => {
        updateStatus(inst.id, 'CONNECTED');
        let buffer = '';
        socket.on('data', (data) => {
            buffer += data.toString();
            // HL7 MLLP
            const startBlock = '\x0b';
            const endBlock = '\x1c\x0d';
            while (true) {
                const start = buffer.indexOf(startBlock);
                if (start === -1) break;
                const end = buffer.indexOf(endBlock, start);
                if (end === -1) break;
                const msg = buffer.substring(start + 1, end);
                forwardToCloud(inst, msg, config);
                buffer = buffer.substring(end + 2);
            }
        });
        socket.on('close', () => updateStatus(inst.id, 'ONLINE'));
    });

    server.listen(inst.port, () => updateStatus(inst.id, 'ONLINE'));

    return { stop: () => server.close() };
}

function startSerialListener(inst, config) {
    try {
        const port = new SerialPort({ path: inst.port, baudRate: inst.baudRate, autoOpen: true });
        updateStatus(inst.id, 'ONLINE');

        port.on('data', (data) => {
            // Simple accumulation for demo/standard
            forwardToCloud(inst, data.toString(), config);
        });

        port.on('error', (err) => {
            updateStatus(inst.id, 'ERROR');
            log(`Serial Error (${inst.name}): ${err.message}`);
        });

        return { stop: () => port.close() };
    } catch (err) {
        updateStatus(inst.id, 'ERROR');
        return { stop: () => { } };
    }
}

async function forwardToCloud(inst, msg, config) {
    if (!config.lisApiUrl || !inst.cloudId) return;
    try {
        await axios.post(`${config.lisApiUrl}/instruments/${inst.cloudId}/simulate`,
            { rawMessage: msg },
            { headers: { 'Authorization': `Bearer ${config.lisApiKey}` } }
        );
        log(`Forwarded message from ${inst.name}`);
    } catch (err) {
        log(`Failed to forward from ${inst.name}: ${err.message}`);
    }
}

function updateStatus(id, status) {
    mainWindow.webContents.send('status-update', { id, status });
}

function log(msg) {
    mainWindow.webContents.send('log-message', msg);
}

ipcMain.handle('get-serial-ports', async () => {
    return await SerialPort.list();
});
