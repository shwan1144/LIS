
import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type InstrumentProtocol = 'HL7_V2' | 'ASTM' | 'POCT1A' | 'CUSTOM';
type ConnectionType = 'TCP_SERVER' | 'TCP_CLIENT' | 'SERIAL' | 'FILE_WATCH';
type ApiConnectivity = 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
type ListenerState = 'RUNNING' | 'ERROR' | 'STOPPED';
type LinkState = 'CONNECTED' | 'WAITING' | 'IDLE' | 'DISCONNECTED';

interface GatewayQueueStatus {
  queueDepth: number;
  pendingCount: number;
  deliveredCount: number;
}

interface ListenerStatus {
  instrumentId: string;
  name: string;
  protocol: string;
  connectionType: string;
  transport: 'TCP' | 'SERIAL';
  endpoint: string;
  state: 'OFFLINE' | 'ONLINE' | 'ERROR';
  listenerState?: ListenerState;
  linkState?: LinkState;
  messagesReceived?: number;
  lastMessageAt?: string | null;
  lastError?: string | null;
}

interface GatewayStatus {
  activated: boolean;
  apiBaseUrl?: string | null;
  gatewayId?: string | null;
  queue?: GatewayQueueStatus | null;
  listeners?: ListenerStatus[];
  lastSyncAt?: string | null;
  lastError?: string | null;
  apiConnectivity?: ApiConnectivity;
  apiDetail?: {
    lastConfigSyncAt?: string | null;
    lastHeartbeatAt?: string | null;
    lastConfigError?: string | null;
    lastHeartbeatError?: string | null;
  } | null;
}

interface GatewayConfigView {
  apiBaseUrl?: string | null;
  queue?: {
    retentionDays?: number;
    maxBytes?: number;
  } | null;
}

interface ManagementStatus {
  loggedIn: boolean;
  apiBaseUrl: string | null;
  user: { username?: string } | null;
  lab: { code?: string; name?: string } | null;
}

interface SerialPortInfo {
  path: string;
  manufacturer: string | null;
}

interface InstrumentDto {
  id: string;
  code: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  protocol: InstrumentProtocol;
  connectionType: ConnectionType;
  host: string | null;
  port: number | null;
  serialPort: string | null;
  baudRate: number | null;
  dataBits: string | null;
  parity: string | null;
  stopBits: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  isActive: boolean;
  autoPost: boolean;
  requireVerification: boolean;
  bidirectionalEnabled: boolean;
}

interface InstrumentDraft {
  code: string;
  name: string;
  manufacturer: string;
  model: string;
  protocol: InstrumentProtocol;
  connectionType: ConnectionType;
  host: string;
  port: string;
  serialPort: string;
  baudRate: string;
  dataBits: string;
  parity: string;
  stopBits: string;
  isActive: boolean;
  autoPost: boolean;
  requireVerification: boolean;
  bidirectionalEnabled: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      getStatus: () => Promise<GatewayStatus>;
      getConfigView: () => Promise<GatewayConfigView>;
      getLogs: (limit?: number) => Promise<string[]>;
      activateGateway: (payload: { activationCode: string; deviceName: string; apiBaseUrl?: string }) => Promise<Record<string, unknown>>;
      syncNow: () => Promise<Record<string, unknown>>;
      listSerialPorts: () => Promise<{ ports: SerialPortInfo[] }>;
      testSerialPort: (payload: {
        serialPort: string;
        baudRate?: number;
        dataBits?: string;
        parity?: string;
        stopBits?: string;
        timeoutMs?: number;
      }) => Promise<{ ok: boolean; error?: string | null; openedAt?: string | null; closedAt?: string | null }>;
      getManagementStatus: () => Promise<ManagementStatus>;
      managementLogin: (payload: { apiBaseUrl: string; labCode: string; username: string; password: string }) => Promise<ManagementStatus>;
      managementRefresh: () => Promise<ManagementStatus>;
      managementLogout: () => Promise<{ ok: boolean }>;
      listInstruments: () => Promise<InstrumentDto[]>;
      createInstrument: (payload: Record<string, unknown>) => Promise<InstrumentDto>;
      updateInstrument: (id: string, data: Record<string, unknown>) => Promise<InstrumentDto>;
      deleteInstrument: (id: string) => Promise<Record<string, unknown>>;
      toggleInstrument: (id: string) => Promise<InstrumentDto>;
    };
  }
}

const DEFAULT_DRAFT: InstrumentDraft = {
  code: '',
  name: '',
  manufacturer: '',
  model: '',
  protocol: 'HL7_V2',
  connectionType: 'TCP_SERVER',
  host: '',
  port: '5600',
  serialPort: 'COM1',
  baudRate: '9600',
  dataBits: '8',
  parity: 'NONE',
  stopBits: '1',
  isActive: true,
  autoPost: true,
  requireVerification: true,
  bidirectionalEnabled: false,
};

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatIso(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toParityShortCode(parity: string | null | undefined): string {
  const normalized = String(parity || '').toUpperCase();
  if (normalized === 'EVEN') return 'E';
  if (normalized === 'ODD') return 'O';
  return 'N';
}

function formatInstrumentEndpoint(item: InstrumentDto): string {
  if (item.connectionType === 'TCP_SERVER') return item.port ? `TCP ${item.port}` : 'TCP -';
  if (item.connectionType === 'TCP_CLIENT') return `${item.host || '-'}:${item.port || '-'}`;
  if (item.connectionType === 'SERIAL') {
    return `${item.serialPort || '-'} @ ${item.baudRate || '-'} ${item.dataBits || '-'}${toParityShortCode(item.parity)}${item.stopBits || '-'}`;
  }
  return '-';
}

function normalizeListenerState(listener: ListenerStatus | undefined): ListenerState {
  if (listener?.listenerState) return listener.listenerState;
  if (listener?.state === 'ERROR') return 'ERROR';
  if (listener?.state === 'ONLINE') return 'RUNNING';
  return 'STOPPED';
}

function normalizeLinkState(listener: ListenerStatus | undefined): LinkState {
  if (listener?.linkState) return listener.linkState;
  if (listener?.state === 'ONLINE') return 'WAITING';
  return 'DISCONNECTED';
}

function normalizeDraftForProtocol(input: InstrumentDraft): InstrumentDraft {
  if (input.protocol !== 'ASTM') return input;
  return {
    ...input,
    connectionType: 'SERIAL',
    serialPort: input.serialPort || 'COM1',
    baudRate: input.baudRate || '9600',
    dataBits: input.dataBits || '8',
    parity: input.parity || 'NONE',
    stopBits: input.stopBits || '1',
  };
}

function validateDraft(draft: InstrumentDraft): string | null {
  if (!draft.code.trim()) return 'Code is required.';
  if (!draft.name.trim()) return 'Name is required.';
  if (draft.protocol === 'ASTM' && draft.connectionType !== 'SERIAL') {
    return 'ASTM instruments must use SERIAL connection type.';
  }

  if (draft.connectionType === 'TCP_SERVER' || draft.connectionType === 'TCP_CLIENT') {
    const port = Number(draft.port);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) return 'TCP port must be between 1 and 65535.';
    if (draft.connectionType === 'TCP_CLIENT' && !draft.host.trim()) return 'Host is required for TCP client mode.';
  }

  if (draft.connectionType === 'SERIAL') {
    if (!draft.serialPort.trim()) return 'Serial port is required.';
    const baudRate = Number(draft.baudRate);
    if (!Number.isFinite(baudRate) || baudRate <= 0) return 'Baud rate is required.';
    if (!['7', '8'].includes(draft.dataBits)) return 'Data bits must be 7 or 8.';
    if (!['NONE', 'EVEN', 'ODD'].includes(draft.parity.toUpperCase())) return 'Parity must be NONE, EVEN, or ODD.';
    if (!['1', '2'].includes(draft.stopBits)) return 'Stop bits must be 1 or 2.';
  }

  return null;
}

function draftToPayload(draft: InstrumentDraft): Record<string, unknown> {
  const normalized = normalizeDraftForProtocol(draft);
  const payload: Record<string, unknown> = {
    code: normalized.code.trim().toUpperCase(),
    name: normalized.name.trim(),
    manufacturer: normalized.manufacturer.trim() || undefined,
    model: normalized.model.trim() || undefined,
    protocol: normalized.protocol,
    connectionType: normalized.connectionType,
    isActive: normalized.isActive,
    autoPost: normalized.autoPost,
    requireVerification: normalized.requireVerification,
    bidirectionalEnabled: normalized.bidirectionalEnabled,
  };

  if (normalized.connectionType === 'TCP_SERVER' || normalized.connectionType === 'TCP_CLIENT') {
    payload.port = Number(normalized.port);
    payload.host = normalized.connectionType === 'TCP_CLIENT' ? normalized.host.trim() : undefined;
  } else {
    payload.port = undefined;
    payload.host = undefined;
  }

  if (normalized.connectionType === 'SERIAL') {
    payload.serialPort = normalized.serialPort.trim();
    payload.baudRate = Number(normalized.baudRate);
    payload.dataBits = normalized.dataBits;
    payload.parity = normalized.parity.toUpperCase();
    payload.stopBits = normalized.stopBits;
  } else {
    payload.serialPort = undefined;
    payload.baudRate = undefined;
    payload.dataBits = undefined;
    payload.parity = undefined;
    payload.stopBits = undefined;
  }

  return payload;
}
function App() {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [config, setConfig] = useState<GatewayConfigView | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  const [management, setManagement] = useState<ManagementStatus>({
    loggedIn: false,
    apiBaseUrl: null,
    user: null,
    lab: null,
  });
  const [labCode, setLabCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [instruments, setInstruments] = useState<InstrumentDto[]>([]);
  const [loadingInstruments, setLoadingInstruments] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingInstrumentId, setEditingInstrumentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstrumentDraft>({ ...DEFAULT_DRAFT });
  const [saveBusy, setSaveBusy] = useState(false);

  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [serialTestBusy, setSerialTestBusy] = useState(false);
  const [serialTestResult, setSerialTestResult] = useState('');

  const [statusMessage, setStatusMessage] = useState('');

  const logRef = useRef<HTMLDivElement>(null);
  const deviceNameTouchedRef = useRef(false);
  const apiBaseUrlTouchedRef = useRef(false);

  const defaultDeviceName = useMemo(() => {
    const platform = (navigator.platform || 'WIN').replace(/\s+/g, '').slice(0, 8).toUpperCase();
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${platform}-${suffix}`;
  }, []);

  const isActivated = Boolean(status?.activated);
  const apiConnectivity = status?.apiConnectivity || 'DISCONNECTED';

  const queueLabel = useMemo(() => {
    if (!status?.queue) return 'queue unavailable';
    return `depth ${status.queue.queueDepth} | pending ${status.queue.pendingCount} | delivered ${status.queue.deliveredCount}`;
  }, [status?.queue]);

  const listenerByInstrumentId = useMemo(() => {
    const map = new Map<string, ListenerStatus>();
    for (const item of status?.listeners || []) map.set(item.instrumentId, item);
    return map;
  }, [status?.listeners]);

  const refreshOverview = async () => {
    const [nextStatus, nextConfig, nextLogs] = await Promise.all([
      window.electronAPI.getStatus(),
      window.electronAPI.getConfigView(),
      window.electronAPI.getLogs(200),
    ]);
    setStatus(nextStatus);
    setConfig(nextConfig);
    setLogs(nextLogs);

    setDeviceName((prev) => {
      if (prev || deviceNameTouchedRef.current) return prev;
      return defaultDeviceName;
    });

    setApiBaseUrl((prev) => {
      if (prev || apiBaseUrlTouchedRef.current) return prev;
      if (typeof nextStatus.apiBaseUrl === 'string' && nextStatus.apiBaseUrl.trim()) return nextStatus.apiBaseUrl;
      if (typeof nextConfig.apiBaseUrl === 'string' && nextConfig.apiBaseUrl.trim()) return nextConfig.apiBaseUrl;
      return prev;
    });
  };

  const refreshManagement = async () => {
    const next = await window.electronAPI.getManagementStatus();
    setManagement(next);
    if (!next.loggedIn) {
      setInstruments([]);
    } else if (!apiBaseUrlTouchedRef.current && next.apiBaseUrl) {
      setApiBaseUrl(next.apiBaseUrl);
    }
  };

  const refreshInstruments = async () => {
    if (!management.loggedIn) return;
    setLoadingInstruments(true);
    try {
      const items = await window.electronAPI.listInstruments();
      setInstruments(Array.isArray(items) ? items : []);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingInstruments(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([refreshOverview(), refreshManagement()]);
  };

  useEffect(() => {
    void refreshAll().catch((error) => {
      setStatus({
        activated: false,
        lastError: error instanceof Error ? error.message : String(error),
        apiConnectivity: 'DISCONNECTED',
      });
    });

    const timer = setInterval(() => {
      void refreshOverview().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (management.loggedIn) void refreshInstruments();
  }, [management.loggedIn]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const handleActivate = async () => {
    if (!activationCode.trim() || !deviceName.trim()) {
      alert('Activation code and device name are required.');
      return;
    }
    setBusy(true);
    try {
      await window.electronAPI.activateGateway({
        activationCode: activationCode.trim(),
        deviceName: deviceName.trim(),
        apiBaseUrl: apiBaseUrl.trim() || undefined,
      });
      setActivationCode('');
      await refreshOverview();
      setStatusMessage('Gateway activated successfully.');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      await window.electronAPI.syncNow();
      await refreshOverview();
      setStatusMessage('Cloud config sync completed.');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleManagementLogin = async () => {
    if (!apiBaseUrl.trim()) {
      alert('Cloud API Base URL is required.');
      return;
    }
    if (!labCode.trim() || !username.trim() || !password) {
      alert('Lab Code, Username, and Password are required.');
      return;
    }

    setBusy(true);
    try {
      const next = await window.electronAPI.managementLogin({
        apiBaseUrl: apiBaseUrl.trim(),
        labCode: labCode.trim().toUpperCase(),
        username: username.trim(),
        password,
      });
      setManagement(next);
      setPassword('');
      await refreshInstruments();
      setStatusMessage('Cloud management login successful.');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleManagementLogout = async () => {
    try {
      await window.electronAPI.managementLogout();
      await refreshManagement();
      setStatusMessage('Cloud management session cleared.');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };
  const openCreateInstrument = () => {
    setEditingInstrumentId(null);
    setDraft({ ...DEFAULT_DRAFT });
    setSerialTestResult('');
    setEditorOpen(true);
  };

  const openEditInstrument = (item: InstrumentDto) => {
    setEditingInstrumentId(item.id);
    setDraft({
      code: item.code || '',
      name: item.name || '',
      manufacturer: item.manufacturer || '',
      model: item.model || '',
      protocol: item.protocol,
      connectionType: item.protocol === 'ASTM' ? 'SERIAL' : item.connectionType,
      host: item.host || '',
      port: item.port ? String(item.port) : '',
      serialPort: item.serialPort || 'COM1',
      baudRate: item.baudRate ? String(item.baudRate) : '9600',
      dataBits: item.dataBits || '8',
      parity: (item.parity || 'NONE').toUpperCase(),
      stopBits: item.stopBits || '1',
      isActive: item.isActive,
      autoPost: item.autoPost,
      requireVerification: item.requireVerification,
      bidirectionalEnabled: item.bidirectionalEnabled,
    });
    setSerialTestResult('');
    setEditorOpen(true);
  };

  const handleDraftChange = <K extends keyof InstrumentDraft>(key: K, value: InstrumentDraft[K]) => {
    setDraft((prev) => normalizeDraftForProtocol({ ...prev, [key]: value }));
  };

  const handleLoadSerialPorts = async () => {
    try {
      const result = await window.electronAPI.listSerialPorts();
      setSerialPorts(Array.isArray(result.ports) ? result.ports : []);
      if (Array.isArray(result.ports) && result.ports.length > 0) {
        const hasCurrent = result.ports.some((item) => item.path === draft.serialPort);
        if (!hasCurrent) handleDraftChange('serialPort', result.ports[0].path);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTestSerialPort = async () => {
    if (draft.connectionType !== 'SERIAL') {
      setSerialTestResult('Switch connection type to SERIAL first.');
      return;
    }
    if (!draft.serialPort.trim()) {
      setSerialTestResult('Select serial port first.');
      return;
    }

    setSerialTestBusy(true);
    setSerialTestResult('');
    try {
      const result = await window.electronAPI.testSerialPort({
        serialPort: draft.serialPort.trim(),
        baudRate: Number(draft.baudRate || '9600'),
        dataBits: draft.dataBits,
        parity: draft.parity,
        stopBits: draft.stopBits,
        timeoutMs: 3000,
      });
      if (result.ok) {
        setSerialTestResult(`Port test OK (${formatIso(result.openedAt || null)} -> ${formatIso(result.closedAt || null)})`);
      } else {
        setSerialTestResult(`Port test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      setSerialTestResult(error instanceof Error ? error.message : String(error));
    } finally {
      setSerialTestBusy(false);
    }
  };

  const handleSaveInstrument = async () => {
    if (!management.loggedIn) {
      alert('Management login is required.');
      return;
    }

    const validationError = validateDraft(draft);
    if (validationError) {
      alert(validationError);
      return;
    }

    const payload = draftToPayload(draft);
    setSaveBusy(true);
    try {
      if (editingInstrumentId) {
        await window.electronAPI.updateInstrument(editingInstrumentId, payload);
      } else {
        await window.electronAPI.createInstrument(payload);
      }
      await window.electronAPI.syncNow();
      await Promise.all([refreshInstruments(), refreshOverview()]);
      setEditorOpen(false);
      setStatusMessage(editingInstrumentId ? 'Instrument updated.' : 'Instrument added.');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDeleteInstrument = async (id: string) => {
    if (!window.confirm('Delete this instrument?')) return;
    try {
      await window.electronAPI.deleteInstrument(id);
      await window.electronAPI.syncNow();
      await Promise.all([refreshInstruments(), refreshOverview()]);
      setStatusMessage('Instrument deleted.');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleToggleInstrument = async (id: string) => {
    try {
      await window.electronAPI.toggleInstrument(id);
      await window.electronAPI.syncNow();
      await Promise.all([refreshInstruments(), refreshOverview()]);
      setStatusMessage('Instrument state updated.');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCopyDiagnostics = async () => {
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      apiConnectivity: status?.apiConnectivity || 'DISCONNECTED',
      apiDetail: status?.apiDetail || null,
      queue: status?.queue || null,
      listeners: status?.listeners || [],
      lastError: status?.lastError || null,
      logsTail: logs.slice(-80),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setStatusMessage('Diagnostics copied to clipboard.');
    } catch (error) {
      alert(`Failed to copy diagnostics: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (!status || !config) return <div className="loading">Loading gateway dashboard...</div>;

  return (
    <div className="app-container">
      <header className="header">
        <div className="title-block">
          <h1>LIS Gateway Control</h1>
          <p>Device setup and live listener status for this gateway PC</p>
        </div>
        <div className={`pill ${isActivated ? 'ok' : 'warn'}`}>{isActivated ? 'ACTIVATED' : 'NOT ACTIVATED'}</div>
      </header>

      {statusMessage ? <div className="flash">{statusMessage}</div> : null}

      <section className="panel grid-2">
        <div className="card">
          <h2>Activation</h2>
          <label>Cloud API Base URL</label>
          <input
            value={apiBaseUrl}
            onChange={(event) => {
              apiBaseUrlTouchedRef.current = true;
              setApiBaseUrl(event.target.value);
            }}
            placeholder="https://api.example.com/api"
          />

          <label>Device Name</label>
          <input
            value={deviceName}
            onChange={(event) => {
              deviceNameTouchedRef.current = true;
              setDeviceName(event.target.value);
            }}
            placeholder="LAB-PC-01"
          />

          <label>Activation Code</label>
          <input
            value={activationCode}
            onChange={(event) => setActivationCode(event.target.value)}
            placeholder="GW-XXXXXX-XXXXXX"
          />

          <div className="button-row">
            <button onClick={handleActivate} disabled={busy}>Activate</button>
            <button className="ghost" onClick={handleSync} disabled={busy}>Sync Now</button>
          </div>
        </div>

        <div className="card">
          <h2>Service Status</h2>
          <div className="kv"><span>Gateway ID</span><code>{status.gatewayId || '-'}</code></div>
          <div className="kv"><span>API URL</span><code>{status.apiBaseUrl || config.apiBaseUrl || '-'}</code></div>
          <div className="kv"><span>Cloud API Connected</span><span className={`chip ${String(apiConnectivity).toLowerCase()}`}>{apiConnectivity}</span></div>
          <div className="kv"><span>Queue</span><span>{queueLabel}</span></div>
          <div className="kv"><span>Queue Limit</span><span>{formatBytes(config.queue?.maxBytes)}</span></div>
          <div className="kv"><span>Retention</span><span>{config.queue?.retentionDays || 7} days</span></div>
          <div className="kv"><span>Last Config Sync</span><span>{formatIso(status.apiDetail?.lastConfigSyncAt || status.lastSyncAt || null)}</span></div>
          <div className="kv"><span>Last Heartbeat</span><span>{formatIso(status.apiDetail?.lastHeartbeatAt || null)}</span></div>
          <div className="kv"><span>Last Error</span><span className="error">{status.lastError || status.apiDetail?.lastConfigError || status.apiDetail?.lastHeartbeatError || '-'}</span></div>
          <div className="button-row"><button className="ghost" onClick={handleCopyDiagnostics}>Copy Diagnostics</button></div>
        </div>
      </section>
      <section className="panel grid-2">
        <div className="card">
          <h2>Cloud Management Login</h2>
          <label>Lab Code</label>
          <input value={labCode} onChange={(event) => setLabCode(event.target.value.toUpperCase())} placeholder="LAB001" />
          <label>Username</label>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="lab_user" />
          <label>Password</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="password" />

          <div className="button-row">
            <button onClick={handleManagementLogin} disabled={busy}>Login</button>
            <button className="ghost" onClick={handleManagementLogout}>Logout</button>
          </div>

          <div className="meta-block">
            <div><strong>Session:</strong> {management.loggedIn ? 'Logged in' : 'Not logged in'}</div>
            <div><strong>Lab:</strong> {management.lab?.code || '-'} {management.lab?.name ? `(${management.lab.name})` : ''}</div>
            <div><strong>User:</strong> {management.user?.username || '-'}</div>
          </div>
        </div>

        <div className="card">
          <h2>Instrument Listeners</h2>
          {Array.isArray(status.listeners) && status.listeners.length > 0 ? (
            <div className="listeners">
              {status.listeners.map((item) => {
                const listenerState = normalizeListenerState(item);
                const linkState = normalizeLinkState(item);
                return (
                  <div className="listener-row" key={item.instrumentId}>
                    <div className="listener-meta">
                      <strong>{item.name}</strong>
                      <p>{item.endpoint}</p>
                      <p className="muted">Messages: {item.messagesReceived || 0} | Last: {formatIso(item.lastMessageAt || null)}</p>
                    </div>
                    <div className="listener-state-group">
                      <span className={`chip ${listenerState.toLowerCase()}`}>Listener {listenerState}</span>
                      <span className={`chip ${linkState.toLowerCase()}`}>Instrument {linkState}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No active listeners yet. Sync config after activation.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="instrument-header">
          <h2>Instruments Setup</h2>
          <div className="button-row">
            <button className="ghost" onClick={refreshInstruments} disabled={!management.loggedIn || loadingInstruments}>Refresh</button>
            <button onClick={openCreateInstrument} disabled={!management.loggedIn}>Add Instrument</button>
          </div>
        </div>

        {!management.loggedIn ? (
          <p className="muted">Login with Lab Code + Username + Password to manage instruments.</p>
        ) : (
          <div className="table-wrap">
            <table className="instrument-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Protocol</th>
                  <th>Connection</th>
                  <th>Endpoint</th>
                  <th>Enabled</th>
                  <th>Listener Running</th>
                  <th>Instrument Connected</th>
                  <th>Last Message</th>
                  <th>Last Error</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingInstruments ? (
                  <tr><td colSpan={10} className="muted">Loading instruments...</td></tr>
                ) : instruments.length === 0 ? (
                  <tr><td colSpan={10} className="muted">No instruments configured.</td></tr>
                ) : (
                  instruments.map((item) => {
                    const listener = listenerByInstrumentId.get(item.id);
                    const listenerState = normalizeListenerState(listener);
                    const linkState = normalizeLinkState(listener);
                    return (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.protocol}</td>
                        <td>{item.connectionType}</td>
                        <td>{listener?.endpoint || formatInstrumentEndpoint(item)}</td>
                        <td>{item.isActive ? 'Yes' : 'No'}</td>
                        <td><span className={`chip ${listenerState.toLowerCase()}`}>{listenerState}</span></td>
                        <td><span className={`chip ${linkState.toLowerCase()}`}>{linkState}</span></td>
                        <td>{formatIso(listener?.lastMessageAt || item.lastMessageAt)}</td>
                        <td className="error">{listener?.lastError || item.lastError || '-'}</td>
                        <td>
                          <div className="row-actions">
                            <button className="ghost small" onClick={() => openEditInstrument(item)}>Edit</button>
                            <button className="ghost small" onClick={() => handleToggleInstrument(item.id)}>{item.isActive ? 'Disable' : 'Enable'}</button>
                            <button className="ghost small danger" onClick={() => handleDeleteInstrument(item.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Local Logs</h2>
        <div className="logs" ref={logRef}>{logs.length > 0 ? logs.join('\n') : 'No logs yet.'}</div>
      </section>
      {editorOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{editingInstrumentId ? 'Edit Instrument' : 'Add Instrument'}</h2>
            <div className="modal-grid">
              <div className="field-group">
                <label>Code</label>
                <input value={draft.code} onChange={(event) => handleDraftChange('code', event.target.value.toUpperCase())} placeholder="C111" />
              </div>
              <div className="field-group">
                <label>Name</label>
                <input value={draft.name} onChange={(event) => handleDraftChange('name', event.target.value)} placeholder="Cobas C111" />
              </div>
              <div className="field-group">
                <label>Manufacturer</label>
                <input value={draft.manufacturer} onChange={(event) => handleDraftChange('manufacturer', event.target.value)} placeholder="Roche" />
              </div>
              <div className="field-group">
                <label>Model</label>
                <input value={draft.model} onChange={(event) => handleDraftChange('model', event.target.value)} placeholder="e411" />
              </div>

              <div className="field-group">
                <label>Protocol</label>
                <select value={draft.protocol} onChange={(event) => handleDraftChange('protocol', event.target.value as InstrumentProtocol)}>
                  <option value="HL7_V2">HL7 V2</option>
                  <option value="ASTM">ASTM</option>
                </select>
              </div>

              <div className="field-group">
                <label>Connection Type</label>
                <select
                  value={draft.connectionType}
                  onChange={(event) => handleDraftChange('connectionType', event.target.value as ConnectionType)}
                  disabled={draft.protocol === 'ASTM'}
                >
                  <option value="TCP_SERVER">TCP Server</option>
                  <option value="TCP_CLIENT">TCP Client</option>
                  <option value="SERIAL">Serial</option>
                </select>
              </div>

              {draft.connectionType === 'TCP_CLIENT' ? (
                <div className="field-group">
                  <label>TCP Host</label>
                  <input value={draft.host} onChange={(event) => handleDraftChange('host', event.target.value)} placeholder="192.168.1.100" />
                </div>
              ) : null}

              {draft.connectionType === 'TCP_SERVER' || draft.connectionType === 'TCP_CLIENT' ? (
                <div className="field-group">
                  <label>TCP Port</label>
                  <input value={draft.port} onChange={(event) => handleDraftChange('port', event.target.value)} placeholder="5600" />
                </div>
              ) : null}

              {draft.connectionType === 'SERIAL' ? (
                <>
                  <div className="field-group">
                    <label>Serial Port</label>
                    <input value={draft.serialPort} onChange={(event) => handleDraftChange('serialPort', event.target.value.toUpperCase())} placeholder="COM3" />
                  </div>
                  <div className="field-group">
                    <label>Baud Rate</label>
                    <input value={draft.baudRate} onChange={(event) => handleDraftChange('baudRate', event.target.value)} placeholder="9600" />
                  </div>
                  <div className="field-group">
                    <label>Data Bits</label>
                    <select value={draft.dataBits} onChange={(event) => handleDraftChange('dataBits', event.target.value)}>
                      <option value="7">7</option>
                      <option value="8">8</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label>Parity</label>
                    <select value={draft.parity} onChange={(event) => handleDraftChange('parity', event.target.value)}>
                      <option value="NONE">NONE</option>
                      <option value="EVEN">EVEN</option>
                      <option value="ODD">ODD</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label>Stop Bits</label>
                    <select value={draft.stopBits} onChange={(event) => handleDraftChange('stopBits', event.target.value)}>
                      <option value="1">1</option>
                      <option value="2">2</option>
                    </select>
                  </div>
                </>
              ) : null}
            </div>

            {draft.connectionType === 'SERIAL' ? (
              <div className="serial-helper">
                <div className="helper-row">
                  <button className="ghost" onClick={handleLoadSerialPorts}>Refresh COM Ports</button>
                  <button className="ghost" onClick={handleTestSerialPort} disabled={serialTestBusy}>{serialTestBusy ? 'Testing...' : 'Test Port'}</button>
                </div>
                {serialPorts.length > 0 ? (
                  <select value={draft.serialPort} onChange={(event) => handleDraftChange('serialPort', event.target.value)}>
                    {serialPorts.map((port) => (
                      <option key={port.path} value={port.path}>{port.path}{port.manufacturer ? ` (${port.manufacturer})` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <p className="muted">No COM ports loaded yet. Click "Refresh COM Ports".</p>
                )}
                {serialTestResult ? <p className="serial-result">{serialTestResult}</p> : null}
              </div>
            ) : null}

            <div className="checkbox-grid">
              <label className="checkbox-row"><input type="checkbox" checked={draft.isActive} onChange={(event) => handleDraftChange('isActive', event.target.checked)} />Enabled</label>
              <label className="checkbox-row"><input type="checkbox" checked={draft.autoPost} onChange={(event) => handleDraftChange('autoPost', event.target.checked)} />Auto post</label>
              <label className="checkbox-row"><input type="checkbox" checked={draft.requireVerification} onChange={(event) => handleDraftChange('requireVerification', event.target.checked)} />Require verification</label>
              <label className="checkbox-row"><input type="checkbox" checked={draft.bidirectionalEnabled} onChange={(event) => handleDraftChange('bidirectionalEnabled', event.target.checked)} />Bidirectional enabled</label>
            </div>

            <div className="button-row">
              <button className="ghost" onClick={() => setEditorOpen(false)} disabled={saveBusy}>Cancel</button>
              <button onClick={handleSaveInstrument} disabled={saveBusy}>{saveBusy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
