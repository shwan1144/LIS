const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

let mainWindow;

const LOCAL_AGENT_BASE_URL = process.env.LOCAL_AGENT_BASE_URL || 'http://127.0.0.1:17880';
const AGENT_CONFIG_PATH = path.join(
  process.env.ProgramData || 'C:\\ProgramData',
  'LISGateway',
  'config',
  'agent.json',
);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#0b1320',
    autoHideMenuBar: true,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

function loadLocalApiToken() {
  if (!fs.existsSync(AGENT_CONFIG_PATH)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, 'utf8'));
    return typeof parsed.localApiToken === 'string' ? parsed.localApiToken : null;
  } catch {
    return null;
  }
}

function getAgentClient() {
  const token = loadLocalApiToken();
  if (!token) {
    throw new Error(
      `Cannot read local API token from ${AGENT_CONFIG_PATH}. Install/start Gateway service first.`,
    );
  }

  return axios.create({
    baseURL: LOCAL_AGENT_BASE_URL,
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeAxiosError(error) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.error || error.response?.data?.message || error.message;
    return status ? `HTTP ${status}: ${detail}` : detail;
  }
  return error?.message || String(error);
}

async function localGet(pathname, fallback = null) {
  try {
    const client = getAgentClient();
    const response = await client.get(pathname);
    return response.data;
  } catch (error) {
    if (fallback !== null) return fallback;
    throw new Error(normalizeAxiosError(error));
  }
}

async function localPost(pathname, body = {}) {
  try {
    const client = getAgentClient();
    const response = await client.post(pathname, body);
    return response.data;
  } catch (error) {
    throw new Error(normalizeAxiosError(error));
  }
}

ipcMain.handle('gateway:get-status', async () => {
  return await localGet('/local/status', {
    activated: false,
    lastError: 'Service unavailable',
    listeners: [],
    queue: null,
  });
});

ipcMain.handle('gateway:get-config-view', async () => {
  return await localGet('/local/config-view', {
    apiBaseUrl: '',
    gatewayId: null,
    token: null,
    queue: { retentionDays: 7, maxBytes: 2147483648 },
  });
});

ipcMain.handle('gateway:get-logs', async (event, limit = 200) => {
  const data = await localGet(`/local/logs?limit=${Math.max(1, Number(limit) || 200)}`, {
    items: [],
  });
  return Array.isArray(data?.items) ? data.items : [];
});

ipcMain.handle('gateway:activate', async (event, payload) => {
  return await localPost('/local/activate', payload || {});
});

ipcMain.handle('gateway:sync-now', async () => {
  return await localPost('/local/sync-now', {});
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
