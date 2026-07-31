# Sentinel

For the separate Gazebo/PX4 simulator integration, phone/LAN launch, portable
SQLite scenarios, fleet operations, data contract and GNSS-denied demo, see
[docs/SIMULATOR_INTEGRATION.md](docs/SIMULATOR_INTEGRATION.md).

The sensor-input MVP now uses two additional standalone services:

- `sentinel-edge` is the only sensor/vehicle boundary used by Sentinel C2.
- `sentinel-sensor-sim` reads the private Gazebo truth feed and publishes
  imperfect radar, RF, EO/IR, and acoustic observations through the edge
  producer API.

See
[docs/EDGE_GATEWAY_SENSOR_SIM_ARCHITECTURE.md](docs/EDGE_GATEWAY_SENSOR_SIM_ARCHITECTURE.md)
for the target boundary and failure behavior.

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
- Edge gateway: http://localhost:8090/v1/edge/health
- Sensor simulator: http://localhost:8091/v1/health
- Local assistant: http://localhost:3002/api/v1/assistant/health
- Local model server: http://127.0.0.1:8082/health (when provisioned)
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
| `npm run dev:edge` | Standalone edge gateway only |
| `npm run dev:sensor-sim` | Standalone sensor simulator only |
| `npm run dev:assistant` | Read-only local mission copilot service |
| `npm run llm:start -- -RuntimePath ... -ModelPath ...` | Start a loopback-only llama.cpp server |
| `npm run llm:benchmark` | Run the Sentinel model boundary/latency evaluation |
| `npm run start:replay -- recording.ndjson [speed]` | Replay a recording through edge |
| `npm run build` | Production UI build |
| `npm start` | Run C2 backend |
| `npm run start:stack` | Edge + sensor simulator + built C2/UI |

The assistant does not connect to Gazebo, MAVLink, sensors, or command
endpoints. It receives only the compact canonical snapshot returned by C2 after
edge ingestion. See [llm/README.md](llm/README.md) for the ASUS Zenbook 2025
runtime profile, model provisioning rules, and benchmark procedure.

On Windows, `START_SENTINEL_EDGE_STACK.cmd` discovers the existing WSL Gazebo
gateway, builds the UI, and starts the three Sentinel-side services. The
standalone processes use:

```text
Gazebo adapter :8080
      | private truth
sensor-sim :8091 -> edge :8090 -> C2/UI :3001
```

The Sensors workspace polls the C2 edge routes and displays the gateway and
registered simulator source separately from the static catalogue feeds. Select
a runtime sensor type and choose **Place on map** to arm the placement tool.
The next map click is converted to local ENU and routed through C2, edge,
sensor-sim, and the Gazebo visual lifecycle. Coverage and source modality are
drawn on the Sentinel map. Runtime sensors can also be rotated in 45-degree
increments or removed from the Sensors workspace.

Radar observations establish analytic sensor tracks in C2. Bearing-only RF,
EO/IR, and acoustic observations can associate with those tracks and enrich
confidence and classification, but never invent range. These fused tracks are
rendered separately from engagement/tasking tracks.

### Record and replay sensor input

Download the edge gateway's current bounded observation buffer from
`http://localhost:8090/v1/recordings/current.ndjson` or through C2 at
`http://localhost:3001/api/v1/edge/recording`. Then replay it through the same
authenticated producer API:

```bash
npm run start:replay -- sentinel-edge-recording.ndjson 2
```

The optional final argument is playback speed (`2` means 2x). Replay preserves
relative timing, assigns deterministic IDs and monotonic per-sensor sequences,
retimes observations to the current clock, and registers the source as
`REPLAY`.

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
