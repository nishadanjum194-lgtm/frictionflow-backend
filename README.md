# FrictionFlow

FrictionFlow is a mindful-browsing / digital-wellbeing system with three parts:

1. **Browser extension** (`extension/`) - blocks distracting sites by redirecting to a friction wall (countdown, math, breathing, mindful typing) and granting a time-limited focus pass afterwards.
2. **Backend API + dashboard** (`server.js`, `public/`) - Express + SQLite service that logs bypass events and exposes a small admin dashboard.
3. **Prototype web UI** (`web/prototype.html`) - standalone concept dashboard using `localStorage` for offline experimentation.

## Quick start (backend)

```bash
cp .env.example .env
npm install
npm start
```

Backend runs on `http://127.0.0.1:5001` by default. Useful endpoints:

- `GET /health`
- `POST /api/analytics` (body: `{ domain, action, duration, user_id?, occurred_at? }`)
- `GET /api/analytics?limit=50&offset=0`
- `GET /api/stats`

Set `API_KEY` in `.env` to require an `X-API-Key` header on writes. For local development it can stay empty.

## Environment variables

See `.env.example`. Values:

- `PORT` - HTTP port (default `5001`)
- `HOST` - bind host (default `0.0.0.0`)
- `DB_PATH` - SQLite file location (default next to `server.js`)
- `CORS_ORIGIN` - comma-separated list or `*` for development
- `API_KEY` - optional write protection

## Extension install (development)

1. Open `chrome://extensions` or `about:debugging`.
2. Enable developer mode and "Load unpacked" / temporary addon.
3. Select the `extension/` directory.
4. To attach to a local backend, store your key with `chrome.storage.sync.set({ backendApiKey: '...' })` (optional).

The extension uses `chrome.storage.sync`, auto-seeds default rules on install, and migrates older local-storage settings on upgrade.

## Docker

```bash
docker build -t frictionflow-backend -f Dockerfile.txt .
docker run -p 5001:5001 -v frictionflow-data:/app/data \
  -e DB_PATH=/app/data/frictionflow.db frictionflow-backend
```

## Project layout

```
backend-equivalent root:
  server.js                Express + SQLite API
  public/                 Admin dashboard
  extension/              Browser extension (MV3)
  web/                    Standalone prototype UI
  scripts/                Helper scripts
```

## Security notes

- CORS is open only when `CORS_ORIGIN=*`; set a real origin in production.
- Writes can be protected with `API_KEY`.
- Helmet is enabled by default.
- The SQLite database and `.env` are intentionally not committed.