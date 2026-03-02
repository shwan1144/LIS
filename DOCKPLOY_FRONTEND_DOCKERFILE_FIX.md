# Dockploy Frontend Dockerfile Fix (`failed to read dockerfile: open Dockerfile`)

If Dockploy shows:

`failed to read dockerfile: open Dockerfile: no such file or directory`

it means the frontend service is looking for `Dockerfile` in the wrong path.

## Correct Settings

Use one of these two valid combinations:

1. Service root = repo root
- `Root Directory`: `.`
- `Build Type`: `Dockerfile`
- `Dockerfile Path`: `frontend/Dockerfile`

2. Service root = frontend
- `Root Directory`: `frontend`
- `Build Type`: `Dockerfile`
- `Dockerfile Path`: `Dockerfile`

Do not mix these. If root is repo root and path is just `Dockerfile`, Dockploy fails exactly with this error.

## Extra checks

1. Trigger deploy with `Clear build cache`.
2. Confirm build log includes frontend steps:
- `npm ci`
- `npm run build`
3. Confirm runtime starts static server on port 3000.

