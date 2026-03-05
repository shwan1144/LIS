import { useState, useEffect, useRef } from 'react';
import './App.css';

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<any>;
      onStatusUpdate: (callback: (data: any) => void) => void;
      onLogMessage: (callback: (msg: string) => void) => void;
      getSerialPorts: () => Promise<any[]>;
      testConnection: (credentials: { url: string; apiKey: string }) => Promise<{ success: boolean; message: string }>;
    };
  }
}

function App() {
  const [config, setConfig] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [serialPorts, setSerialPorts] = useState<any[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.getConfig().then(setConfig);
    window.electronAPI.getSerialPorts().then(setSerialPorts);

    window.electronAPI.onStatusUpdate((data) => {
      setConfig((prev: any) => {
        if (!prev) return prev;
        const newInstruments = prev.instruments.map((inst: any) =>
          inst.id === data.id ? { ...inst, status: data.status } : inst
        );
        return { ...prev, instruments: newInstruments };
      });
    });

    window.electronAPI.onLogMessage((msg) => {
      setLogs((prev) => [...prev.slice(-100), msg]);
    });
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleSave = async () => {
    await window.electronAPI.saveConfig(config);
    alert('Settings saved and listeners restarted!');
  };

  const handleTestConnection = async () => {
    if (!config.lisApiUrl || !config.lisApiKey) {
      alert('Please enter both API URL and API Key first.');
      return;
    }
    const result = await window.electronAPI.testConnection({
      url: config.lisApiUrl,
      apiKey: config.lisApiKey
    });
    alert(result.message);
  };

  if (!config) return <div className="loading">Loading Configuration...</div>;

  return (
    <div className="app-container">
      <div className="header">
        <div className="title">LIS Gateway Bridge</div>
        <button className="btn" onClick={handleSave}>Save & Restart</button>
      </div>

      <div className="status-grid">
        {config.instruments.map((inst: any) => (
          <div key={inst.id} className="card">
            <div className="card-header">
              <span className={`status-dot status-${inst.status}`}></span>
              <strong>{inst.name}</strong>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
              {inst.type} | {inst.port}
            </div>
          </div>
        ))}
      </div>

      <div className="settings-panel">
        <div className="card config-section">
          <h3>Cloud Connection</h3>
          <div>
            <label>Cloud LIS API URL</label>
            <input
              value={config.lisApiUrl}
              onChange={e => setConfig({ ...config, lisApiUrl: e.target.value })}
              placeholder="https://your-lab.com/api"
            />
          </div>
          <div>
            <label>Cloud API Key</label>
            <input
              type="password"
              value={config.lisApiKey}
              onChange={e => setConfig({ ...config, lisApiKey: e.target.value })}
            />
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            style={{ marginTop: '1rem', width: '100%' }}
          >
            Test Connection
          </button>
        </div>

        <div className="card config-section">
          <h3>Instrument Details</h3>
          {config.instruments.map((inst: any, idx: number) => (
            <div key={inst.id} style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              <strong>{inst.name}</strong>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <div style={{ flex: 1 }}>
                  <label>Cloud Instrument ID</label>
                  <input
                    value={inst.cloudId}
                    onChange={e => {
                      const newInst = [...config.instruments];
                      newInst[idx].cloudId = e.target.value;
                      setConfig({ ...config, instruments: newInst });
                    }}
                  />
                </div>
                <div style={{ width: '100px' }}>
                  <label>{inst.type === 'TCP' ? 'Port' : 'COM Port'}</label>
                  {inst.type === 'TCP' ? (
                    <input
                      type="number"
                      value={inst.port}
                      onChange={e => {
                        const newInst = [...config.instruments];
                        newInst[idx].port = parseInt(e.target.value);
                        setConfig({ ...config, instruments: newInst });
                      }}
                    />
                  ) : (
                    <select
                      value={inst.port}
                      onChange={e => {
                        const newInst = [...config.instruments];
                        newInst[idx].port = e.target.value;
                        setConfig({ ...config, instruments: newInst });
                      }}
                    >
                      <option value="">Select...</option>
                      {serialPorts.map(p => <option key={p.path} value={p.path}>{p.path}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="log-view" ref={logRef}>
        {logs.length === 0 ? 'Waiting for activity...' : logs.map((log, i) => (
          <div key={i}>{`> ${log}`}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
