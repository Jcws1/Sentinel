# Sentinel

Policy-first command and control for autonomous drone swarms. One operator, many drones, human judgement kept in command.

Built for the Singapore Defence Tech Hackathon 2026, Track C (Agentic Command and Control for Rapid Wartime Decision Making).

## Overview

Sentinel lets a single operator direct a swarm of many drones through intent and standing rules of engagement, rather than flying or tasking each drone by hand. The operator sets the policy and supervises. The system handles the fast decisions inside the boundaries the operator has set, and escalates anything outside those boundaries back to a human.

## Operator Interface (this tree)

Intent-based C2 dashboard for swarm interceptor tasking: local C2 backend (REST + WebSocket), scenario modes (Defense / Recon / Attack), Mapbox 3D battlespace with Singapore military bases (air / land / sea) and PRD scenario overlays.

### Quick start

```bash
npm install
cp .env.example .env   # set VITE_MAPBOX_TOKEN + CDSE_S3_* (optional)
npm run dev
```

- UI: http://localhost:5173/
- C2 API: http://localhost:3001/api/v1/health
- WebSocket: `ws://localhost:3001/api/v1/ws` (proxied via Vite as `/api/v1/ws`)
- CDSE status: http://localhost:3001/api/v1/cdse/status
- CDSE list: http://localhost:3001/api/v1/cdse/list?prefix=Sentinel-2/

`VITE_MAPBOX_TOKEN` is client-side (Mapbox). `CDSE_S3_*` credentials stay on the C2 server only — never prefix them with `VITE_`.

### MVP operator loop

1. Backend streams fused tracks + fleet telemetry.
2. System proposes intercept plans for Class I threats.
3. Operator **Confirm** / **Veto** (or Confirm all) in the action panel.
4. On confirm, interceptors prosecute the track on the map.
5. Hold / Recall update mission state through the Mission API.

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + UI together |
| `npm run dev:server` | C2 backend only |
| `npm run dev:client` | Vite UI only |
| `npm run build` | Production UI build |
| `npm start` | Run C2 backend |

### Stack

- React + TypeScript (Vite)
- Redux Toolkit
- Mapbox GL JS
- Express + `ws` local C2 services

## Architecture

![Sentinel architecture](docs/architecture.png)

Sentinel sits between sensing and effects as a command layer:

- **Inputs.** Sensor tracks describing the battlespace.
- **Sentinel decision core.** World model, policy/authority, task allocation, swarm coordination, audit log.
- **Outputs.** Commands to the drone swarm.
- **Simulation harness.** Local kinematic sim for safe end-to-end demos before hardware.

## Team

| Name | Role |
| --- | --- |
| Jason | Drone Task Allocation and Swarm Coordination (Team Lead & Backend) |
| Fittra | Operator Console (Frontend) |
| Yusuf | World Model and Sensing (Frontend) |
| Chang Yao | Simulation and Scenario (Simulation & Testing) |
| Damien | Authority and Policy (Backend) |

## Status

Hackathon build in progress — operator console + local C2 loop runnable via `npm run dev`.
