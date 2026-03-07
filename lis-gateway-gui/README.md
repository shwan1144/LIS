# LIS Gateway GUI

Electron + React tray/desktop monitor for the local `lis-gateway` Windows service.

## Responsibilities

- Activate gateway device with one-time cloud activation code.
- Show gateway status, queue depth, listener states, and recent logs.
- Trigger manual config sync.
- Does **not** open instrument sockets directly.

## Development

```powershell
npm install
npm run dev
```

## Build Installer

```powershell
npm run build
```

Build sequence:
1. Builds `lis-gateway` service executable (`../lis-gateway`).
2. Builds GUI renderer and Electron app.
3. Packages NSIS installer with bundled agent resources.
