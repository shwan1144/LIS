# Local Instrument Connector (Windows)

This connector runs on a lab computer and forwards local analyzer messages to LIS.

## Why use it

- Works when analyzer is on local LAN or RS-232 side.
- Avoids exposing analyzer directly to the internet.
- Keeps cloud LIS deployment simple.

## What it does (current version)

- Starts a local TCP listener.
- Accepts incoming HL7/ASTM analyzer traffic.
- Logs in to your lab API (`/auth/login`).
- Forwards each message to LIS (`/instruments/:id/simulate`).
- Re-authenticates automatically if token expires.

## 1) Prepare a dedicated LIS user

In your lab panel, create a user only for connector traffic:

- username: `instrument.bot` (example)
- strong password
- active account

## 2) Find Instrument ID

Open browser dev tools on Instruments page or use API to copy the instrument UUID.

Or list from connector directly:

```powershell
npm run connector:list-instruments
```

## 3) Create connector env file

In `backend` folder:

```powershell
Copy-Item .env.connector.example .env.connector
```

Edit `.env.connector` with your real values:

- `LIS_BASE_URL`: backend API URL, example `https://api.medilis.net`
- `LIS_USERNAME` / `LIS_PASSWORD`
- `LIS_INSTRUMENT_ID`
- `CONNECTOR_LISTEN_PORT`: port analyzer will send to (example `5001`)

If you use a shared API host like `https://api.medilis.net`, also set:

- `LIS_FORWARDED_HOST=lab01.medilis.net`

## 4) Run doctor check

```powershell
npm run connector:doctor
```

Expected: `Doctor check passed.`

## 5) Start connector

```powershell
npm run connector:start
```

Expected: `Connector listening on ...`

## 6) Analyzer side setup

Configure analyzer to send output to this Windows PC:

- Host/IP: this PC LAN IP
- Port: `CONNECTOR_LISTEN_PORT`
- Protocol framing based on analyzer (HL7/ASTM)

## 7) Run on startup (Windows)

### Option A: EXE + Scheduled Task (recommended)

Build exe once:

```powershell
npm run connector:build-exe
```

Install startup task (run PowerShell as Administrator):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-connector-task.ps1
```

This creates task `LISInstrumentConnector`, runs at startup, and auto-restarts on failure.

Remove task:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/uninstall-connector-task.ps1
```

### Option B: Node process (manual/dev)

Run directly:

```powershell
npm run connector:start
```

Keep terminal open.

## Notes

- This version is TCP listener first. Serial COM bridge is not included yet.
- For bidirectional (order download/query) we can add downstream socket write queue in next step.
