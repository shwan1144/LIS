import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

declare global {
  interface Window {
    electronAPI: {
      getStatus: () => Promise<any>;
      getConfigView: () => Promise<any>;
      getLogs: (limit?: number) => Promise<string[]>;
      activateGateway: (payload: {
        activationCode: string;
        deviceName: string;
        apiBaseUrl?: string;
      }) => Promise<any>;
      syncNow: () => Promise<any>;
    };
  }
}

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

function formatListenerEndpoint(item: any): string {
  if (typeof item?.endpoint === 'string' && item.endpoint.trim()) {
    return item.endpoint;
  }
  if (typeof item?.transport === 'string' && item.transport.toUpperCase() === 'SERIAL') {
    return `SERIAL ${item?.serialPort || '-'}`;
  }
  if (Number.isFinite(item?.port)) {
    return `TCP ${item.port}`;
  }
  return 'UNKNOWN';
}

function App() {
  const [status, setStatus] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const deviceNameTouchedRef = useRef(false);
  const apiBaseUrlTouchedRef = useRef(false);

  const isActivated = Boolean(status?.activated);

  const queueLabel = useMemo(() => {
    if (!status?.queue) return 'queue unavailable';
    return `depth ${status.queue.queueDepth} | pending ${status.queue.pendingCount} | delivered ${status.queue.deliveredCount}`;
  }, [status]);

  const refresh = async () => {
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
      return `${navigator.platform || 'Windows'}-${Date.now().toString().slice(-4)}`;
    });

    setApiBaseUrl((prev) => {
      if (prev || apiBaseUrlTouchedRef.current) return prev;
      if (typeof nextConfig?.apiBaseUrl === 'string' && nextConfig.apiBaseUrl.trim()) {
        return nextConfig.apiBaseUrl;
      }
      return prev;
    });
  };

  useEffect(() => {
    refresh().catch((error) => {
      setStatus({ activated: false, lastError: error instanceof Error ? error.message : String(error) });
    });
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

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
      await refresh();
      alert('Gateway activated successfully.');
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
      await refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!status || !config) {
    return <div className="loading">Loading gateway dashboard...</div>;
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="title-block">
          <h1>LIS Gateway Control</h1>
          <p>Local monitor for Windows edge service</p>
        </div>
        <div className={`pill ${isActivated ? 'ok' : 'warn'}`}>
          {isActivated ? 'ACTIVATED' : 'NOT ACTIVATED'}
        </div>
      </header>

      <section className="panel grid-2">
        <div className="card">
          <h2>Activation</h2>
          <label>Cloud API Base URL</label>
          <input
            value={apiBaseUrl}
            onChange={(e) => {
              apiBaseUrlTouchedRef.current = true;
              setApiBaseUrl(e.target.value);
            }}
            placeholder="https://api.example.com"
          />

          <label>Device Name</label>
          <input
            value={deviceName}
            onChange={(e) => {
              deviceNameTouchedRef.current = true;
              setDeviceName(e.target.value);
            }}
            placeholder="LAB-PC-01"
          />

          <label>Activation Code</label>
          <input
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
            placeholder="GW-XXXXXX-XXXXXX"
          />

          <div className="button-row">
            <button onClick={handleActivate} disabled={busy}>
              Activate
            </button>
            <button className="ghost" onClick={handleSync} disabled={busy}>
              Sync Now
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Service Status</h2>
          <div className="kv">
            <span>Gateway ID</span>
            <code>{status.gatewayId || '-'}</code>
          </div>
          <div className="kv">
            <span>API URL</span>
            <code>{status.apiBaseUrl || config.apiBaseUrl || '-'}</code>
          </div>
          <div className="kv">
            <span>Queue</span>
            <span>{queueLabel}</span>
          </div>
          <div className="kv">
            <span>Queue Limit</span>
            <span>{formatBytes(config.queue?.maxBytes)}</span>
          </div>
          <div className="kv">
            <span>Retention</span>
            <span>{config.queue?.retentionDays || 7} days</span>
          </div>
          <div className="kv">
            <span>Last Sync</span>
            <span>{status.lastSyncAt || '-'}</span>
          </div>
          <div className="kv">
            <span>Last Error</span>
            <span className="error">{status.lastError || '-'}</span>
          </div>
        </div>
      </section>

      <section className="panel grid-2">
        <div className="card">
          <h2>Instrument Listeners</h2>
          {Array.isArray(status.listeners) && status.listeners.length > 0 ? (
            <div className="listeners">
              {status.listeners.map((item: any) => (
                <div className="listener-row" key={item.instrumentId}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.instrumentId} | {formatListenerEndpoint(item)}
                    </p>
                  </div>
                  <div className={`state ${String(item.state || '').toLowerCase()}`}>{item.state}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No active listeners yet. Sync config after activation.</p>
          )}
        </div>

        <div className="card">
          <h2>Local Logs</h2>
          <div className="logs" ref={logRef}>
            {logs.length > 0 ? logs.map((line, idx) => <div key={idx}>{line}</div>) : 'No logs yet.'}
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
