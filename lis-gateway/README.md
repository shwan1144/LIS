# LIS Gateway Agent

Windows edge service that:
- listens for HL7 TCP instrument traffic,
- commits each message to local SQLite outbox first,
- forwards to backend `/gateway/messages` asynchronously with retries,
- exposes local loopback control API for GUI (`127.0.0.1` only).

## Runtime Paths

Default root: `%ProgramData%\LISGateway`

- Config: `%ProgramData%\LISGateway\config\agent.json`
- Queue DB: `%ProgramData%\LISGateway\data\gateway-queue.db`
- Logs: `%ProgramData%\LISGateway\logs\gateway-YYYY-MM-DD.log`

## Local Control API

All endpoints require `Authorization: Bearer <localApiToken>` where token is stored in `agent.json`.

- `GET /local/status`
- `POST /local/activate`
- `POST /local/sync-now`
- `GET /local/logs?limit=200`
- `GET /local/config-view`

## Development

```powershell
npm install
npm start
```

## Build Service Binary

```powershell
npm run build:service
```

## Install / Uninstall Service (Administrator)

```powershell
npm run service:install
npm run service:uninstall
```
