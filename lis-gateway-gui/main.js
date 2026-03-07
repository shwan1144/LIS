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
const DEFAULT_DESKTOP_SETTINGS = {
  launchAtStartup: false,
  openMaximized: true,
};
let managementSession = {
  apiBaseUrl: '',
  accessToken: '',
  refreshToken: '',
  user: null,
  lab: null,
};

function createWindow() {
  const desktopSettings = loadDesktopSettings();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#0b1320',
    autoHideMenuBar: true,
  });

  mainWindow.once('ready-to-show', () => {
    if (desktopSettings.openMaximized !== false) {
      mainWindow.maximize();
    }
    mainWindow.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

function getDesktopSettingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function loadDesktopSettings() {
  try {
    const filePath = getDesktopSettingsPath();
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_DESKTOP_SETTINGS };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...DEFAULT_DESKTOP_SETTINGS,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
  } catch {
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }
}

function saveDesktopSettings(nextSettings) {
  const filePath = getDesktopSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(nextSettings, null, 2), 'utf8');
}

function getStartupCapability() {
  if (process.platform !== 'win32') {
    return {
      startupSupported: false,
      startupReason: 'Windows startup registration is supported on Windows only.',
    };
  }

  if (!app.isPackaged) {
    return {
      startupSupported: false,
      startupReason: 'Startup registration works after installing the packaged EXE.',
    };
  }

  return {
    startupSupported: true,
    startupReason: null,
  };
}

function readDesktopSettingsState() {
  const persisted = loadDesktopSettings();
  const capability = getStartupCapability();
  const launchAtStartup = capability.startupSupported
    ? app.getLoginItemSettings({
        path: process.execPath,
      }).openAtLogin
    : false;

  return {
    launchAtStartup,
    openMaximized: persisted.openMaximized !== false,
    startupSupported: capability.startupSupported,
    startupReason: capability.startupReason,
  };
}

function applyLaunchAtStartup(enabled) {
  const capability = getStartupCapability();
  if (!capability.startupSupported) {
    if (enabled) {
      throw new Error(capability.startupReason || 'Startup registration is not available.');
    }
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  });
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
    if (error.code === 'ECONNREFUSED') {
      return `Local agent is offline (${LOCAL_AGENT_BASE_URL}). Start the "LIS Gateway Agent" Windows service or reinstall the latest setup EXE as Administrator.`;
    }
    const status = error.response?.status;
    const detail = error.response?.data?.error || error.response?.data?.message || error.message;
    return status ? `HTTP ${status}: ${detail}` : detail;
  }
  return error?.message || String(error);
}

function normalizeApiBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function buildApiCandidateUrls(apiBaseUrl, endpointPath) {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  const cleanPath = String(endpointPath || '').replace(/^\/+/, '');
  const directUrl = `${normalized}/${cleanPath}`;
  if (normalized.toLowerCase().endsWith('/api')) {
    const withoutApi = normalized.slice(0, -4);
    return Array.from(new Set([directUrl, `${withoutApi}/${cleanPath}`]));
  }
  return Array.from(new Set([directUrl, `${normalized}/api/${cleanPath}`]));
}

async function requestCloudApi(options) {
  const {
    apiBaseUrl,
    endpointPath,
    method,
    data,
    accessToken,
    timeout = 12000,
  } = options;
  const candidates = buildApiCandidateUrls(apiBaseUrl, endpointPath);
  let lastError = null;

  for (const url of candidates) {
    try {
      const response = await axios.request({
        method,
        url,
        data,
        timeout,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404 && candidates.length > 1) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError) throw lastError;
  throw new Error('Cloud API request failed');
}

function resetManagementSession() {
  managementSession = {
    apiBaseUrl: '',
    accessToken: '',
    refreshToken: '',
    user: null,
    lab: null,
  };
}

function assertManagementSession() {
  if (!managementSession.apiBaseUrl || !managementSession.accessToken || !managementSession.refreshToken) {
    throw new Error('Management login required');
  }
}

async function refreshManagementSession() {
  assertManagementSession();
  const refreshed = await requestCloudApi({
    apiBaseUrl: managementSession.apiBaseUrl,
    endpointPath: 'gateway/ui/refresh',
    method: 'post',
    data: { refreshToken: managementSession.refreshToken },
  });
  managementSession = {
    ...managementSession,
    accessToken: refreshed.accessToken || '',
    refreshToken: refreshed.refreshToken || managementSession.refreshToken,
    user: refreshed.user || managementSession.user,
    lab: refreshed.lab || managementSession.lab,
  };
}

async function requestCloudWithManagementAuth(endpointPath, method, data) {
  assertManagementSession();
  try {
    return await requestCloudApi({
      apiBaseUrl: managementSession.apiBaseUrl,
      endpointPath,
      method,
      data,
      accessToken: managementSession.accessToken,
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await refreshManagementSession();
      return await requestCloudApi({
        apiBaseUrl: managementSession.apiBaseUrl,
        endpointPath,
        method,
        data,
        accessToken: managementSession.accessToken,
      });
    }
    throw error;
  }
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

ipcMain.handle('gateway:serial:list-ports', async () => {
  return await localGet('/local/serial/ports', { ports: [] });
});

ipcMain.handle('gateway:serial:test-port', async (event, payload) => {
  return await localPost('/local/serial/test-open', payload || {});
});

ipcMain.handle('gateway:management-status', async () => {
  return {
    loggedIn: Boolean(
      managementSession.apiBaseUrl &&
      managementSession.accessToken &&
      managementSession.refreshToken,
    ),
    apiBaseUrl: managementSession.apiBaseUrl || null,
    user: managementSession.user || null,
    lab: managementSession.lab || null,
  };
});

ipcMain.handle('gateway:management-login', async (event, payload) => {
  try {
    const apiBaseUrl = normalizeApiBaseUrl(payload?.apiBaseUrl || '');
    const labCode = String(payload?.labCode || '').trim();
    const username = String(payload?.username || '').trim();
    const password = String(payload?.password || '');

    if (!apiBaseUrl) {
      throw new Error('Cloud API Base URL is required');
    }
    if (!labCode || !username || !password) {
      throw new Error('labCode, username, and password are required');
    }

    const loginResult = await requestCloudApi({
      apiBaseUrl,
      endpointPath: 'gateway/ui/login',
      method: 'post',
      data: { labCode, username, password },
    });

    managementSession = {
      apiBaseUrl,
      accessToken: loginResult.accessToken || '',
      refreshToken: loginResult.refreshToken || '',
      user: loginResult.user || null,
      lab: loginResult.lab || null,
    };

    if (!managementSession.accessToken || !managementSession.refreshToken) {
      resetManagementSession();
      throw new Error('Cloud login response is missing tokens');
    }

    return {
      loggedIn: true,
      user: managementSession.user,
      lab: managementSession.lab,
      apiBaseUrl: managementSession.apiBaseUrl,
    };
  } catch (error) {
    resetManagementSession();
    throw new Error(normalizeAxiosError(error));
  }
});

ipcMain.handle('gateway:management-refresh', async () => {
  try {
    await refreshManagementSession();
    return {
      loggedIn: true,
      user: managementSession.user,
      lab: managementSession.lab,
      apiBaseUrl: managementSession.apiBaseUrl,
    };
  } catch (error) {
    resetManagementSession();
    throw new Error(normalizeAxiosError(error));
  }
});

ipcMain.handle('gateway:management-logout', async () => {
  resetManagementSession();
  return { ok: true };
});

ipcMain.handle('gateway:instruments:list', async () => {
  try {
    return await requestCloudWithManagementAuth('instruments', 'get');
  } catch (error) {
    throw new Error(normalizeAxiosError(error));
  }
});

ipcMain.handle('gateway:instruments:create', async (event, payload) => {
  try {
    return await requestCloudWithManagementAuth('instruments', 'post', payload || {});
  } catch (error) {
    throw new Error(normalizeAxiosError(error));
  }
});

ipcMain.handle('gateway:instruments:update', async (event, payload) => {
  try {
    const id = String(payload?.id || '').trim();
    if (!id) throw new Error('Instrument ID is required');
    return await requestCloudWithManagementAuth(`instruments/${id}`, 'patch', payload?.data || {});
  } catch (error) {
    throw new Error(normalizeAxiosError(error));
  }
});

ipcMain.handle('gateway:instruments:delete', async (event, payload) => {
  try {
    const id = String(payload?.id || '').trim();
    if (!id) throw new Error('Instrument ID is required');
    return await requestCloudWithManagementAuth(`instruments/${id}`, 'delete');
  } catch (error) {
    throw new Error(normalizeAxiosError(error));
  }
});

ipcMain.handle('gateway:instruments:toggle', async (event, payload) => {
  try {
    const id = String(payload?.id || '').trim();
    if (!id) throw new Error('Instrument ID is required');
    return await requestCloudWithManagementAuth(`instruments/${id}/toggle-active`, 'patch');
  } catch (error) {
    throw new Error(normalizeAxiosError(error));
  }
});

ipcMain.handle('gateway:desktop-settings:get', async () => {
  return readDesktopSettingsState();
});

ipcMain.handle('gateway:desktop-settings:update', async (event, payload) => {
  const nextSettings = {
    ...loadDesktopSettings(),
  };

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'openMaximized')) {
    nextSettings.openMaximized = payload.openMaximized !== false;
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'launchAtStartup')) {
    nextSettings.launchAtStartup = Boolean(payload.launchAtStartup);
    applyLaunchAtStartup(nextSettings.launchAtStartup);
  }

  saveDesktopSettings(nextSettings);

  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && payload && Object.prototype.hasOwnProperty.call(payload, 'openMaximized')) {
    if (nextSettings.openMaximized) {
      window.maximize();
    } else if (window.isMaximized()) {
      window.unmaximize();
    }
  }

  return readDesktopSettingsState();
});

app.whenReady().then(() => {
  const desktopSettings = loadDesktopSettings();
  try {
    applyLaunchAtStartup(Boolean(desktopSettings.launchAtStartup));
  } catch {
    // Ignore unsupported startup registration in development mode.
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
