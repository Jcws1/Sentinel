# Sentinel C2 — Operator Interface

Intent-based command-and-control dashboard for swarm interceptor tasking.
MVP: local C2 backend (REST + WebSocket) + Gotham-style operator UI + Mapbox basemap.

## Quick start

```bash
npm install
cp .env.example .env   # set VITE_MAPBOX_TOKEN
npm run dev
```

Opens:

- UI: http://localhost:5173/
- C2 API: http://localhost:3001/api/v1/health
- WebSocket: `ws://localhost:3001/api/v1/ws` (proxied via Vite as `/api/v1/ws`)

## MVP operator loop

1. Backend streams fused tracks + fleet telemetry.
2. System proposes intercept plans for Class I threats.
3. Operator **Confirm** / **Veto** (or Confirm all) in the action panel.
4. On confirm, interceptors prosecute the track on the map.
5. Hold / Recall update mission state through the Mission API.

## C2 Backend APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/health` | Liveness |
| GET | `/api/v1/snapshot` | Full mission snapshot |
| GET/PATCH | `/api/v1/mission` | Mission state (ACTIVE/HOLD/RECALL) |
| GET | `/api/v1/fusion/tracks` | Fused tracks |
| GET | `/api/v1/fusion/tracks/:id` | Track provenance |
| GET | `/api/v1/telemetry` | Fleet + mesh |
| GET | `/api/v1/policy` | ROE summary (read-only operator) |
| GET | `/api/v1/decisions` | Audit log |
| GET | `/api/v1/tasking` | Recommendations |
| POST | `/api/v1/tasking/plan` | Request plan `{ trackId }` |
| POST | `/api/v1/tasking/decision` | `{ recommendationId, decision, intent? }` |
| WS | `/api/v1/ws` | `state.snapshot` stream (~400ms) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + UI together |
| `npm run dev:server` | C2 backend only |
| `npm run dev:client` | Vite UI only |
| `npm run build` | Production UI build |
| `npm start` | Run C2 backend |

## Stack

- React + TypeScript (Vite)
- Redux Toolkit (UI projection of backend state)
- Mapbox GL JS (`dark-v11`)
- Express + `ws` local C2 services
