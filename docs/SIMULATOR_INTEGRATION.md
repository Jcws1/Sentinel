# Sentinel + Gazebo operational integration

> Current-state document: this describes the deployed `sentinel-sim/1.0`
> connection. The target MVP moves this connection behind a standalone
> `sentinel-edge` service and introduces a separate `sentinel-sensor-sim`
> producer. See `EDGE_GATEWAY_SENSOR_SIM_ARCHITECTURE.md`. The UI will not
> connect directly to either simulator.

## Deployment boundary

Sentinel and `drone-c2-sim` are separate applications. They share no process,
database, source tree, or runtime filesystem. Their only runtime connection is
the versioned `sentinel-sim/1.0` HTTP/WebSocket contract.

```text
phone browser
    │ HTTP + WebSocket (port 3001, pairing token for mutations)
    ▼
Sentinel C2 / static UI server
    │ HTTP + WebSocket (SIM_GATEWAY_URL, normally port 8080)
    ▼
drone-c2-sim gateway ── Gazebo Transport ── Gazebo + PX4 SITL
```

The phone downloads and executes the landscape React UI locally. Gazebo
rendering and physics stay on the simulation laptop. The simulator can be
stopped, restarted, or moved to another laptop without rebuilding the UI.

## Locations

- Sentinel UI/C2: `C:\Users\nsf.yusuf\Desktop\SDTH\Sentinel`
- Simulator: `C:\Users\nsf.yusuf\Documents\Codex\2026-07-18\le\outputs\drone-c2-sim`
- Portable scenario/health database: `Sentinel\data\sentinel.sqlite`
- Simulator-owned 5 km world pack:
  `drone-c2-sim\resources\worlds\singapore_ops`

`sentinel.sqlite` uses SQLite WAL while running. Copy it only after stopping
Sentinel, or copy the `.sqlite`, `-wal`, and `-shm` files together. A clean
shutdown checkpoints the WAL into the single portable `.sqlite` file.

## Start on one laptop

1. Run `START_SENTINEL_SIM.cmd` in the simulator folder.
2. Wait for `Simulator gateway ready`.
3. Run `START_SENTINEL_UI.cmd` in the Sentinel folder.
4. Find the laptop IPv4 address with `ipconfig`.
5. On a phone connected to the same LAN, open
   `http://<laptop-ip>:3001`.
6. Enter the six-digit pairing code printed by the Sentinel window.

On this machine the simulator uses a dedicated WSL distribution.
`START_SENTINEL_UI.cmd` therefore discovers its current virtual IPv4 address
and sets `SIM_GATEWAY_URL` automatically. An explicitly supplied value always
wins.

## Split across two laptops

On the Gazebo laptop, run `START_SENTINEL_SIM.cmd` and allow inbound TCP 8080
on the private firewall profile. On the Sentinel laptop:

```bat
set SIM_GATEWAY_URL=http://<gazebo-laptop-ip>:8080
START_SENTINEL_UI.cmd
```

Allow inbound TCP 3001 on the Sentinel laptop so the phone can connect. Do not
expose either port directly to the public internet. The pairing code protects
mutating Sentinel routes; network/VPN controls remain the security boundary
for the simulator gateway.

## Operator workflow

Open **Menu → Fleet ops**.

- **Add asset** hot-spawns one or many Gazebo-velocity vehicles of the selected
  platform type. For a batch, enter an ID prefix, quantity and spacing; Sentinel
  creates a centred, non-overlapping staging grid around the supplied ENU point.
  A failed batch is rolled back instead of leaving a partially created fleet.
- The pre-launched `anafi_01` is the PX4 reference. It cannot be hot-removed.
- Save the current runtime fleet to portable SQLite. Selecting a saved
  scenario reconciles Gazebo-controlled assets to the saved set and pose.
- Formation controls run line, column and wedge station-keeping from live
  odometry. Flocking uses neighbour alignment, cohesion and separation without
  a central leader.
- Open **Field navigator → Tools → Mobility & comms → Swarm movement** for
  directional movement. Choose a group, control law, speed, spacing and one of
  eight ENU directions. **HOLD** cancels the closed-loop behavior and sends a
  zero-velocity command to every eligible vehicle.
- **Fail response** makes one vehicle stop responding to commands; **Recover**
  restores it. The optimizer excludes vehicles whose lifecycle is `FAULT`.
- Choose an operational mission, tap a target on the map and optimize.
  Patrol/recon/relay/escort missions auto-dispatch when policy permits.
  Intercepts and priority ≥90 remain `PROPOSED` until operator confirmation.
- **Follow in Gazebo** changes the Gazebo camera target. The Gazebo GUI remains
  independently flyable in free-camera mode.

The two algorithms serve different layers. The Hungarian minimizer assigns
capable vehicles to mission objectives at minimum total cost. Neighbour
averaging is part of the live flocking controller and aligns each vehicle with
nearby velocities while cohesion and separation keep the group together.

## Coordinate and topology contract

The handshake defines one WGS84 origin. Gazebo publishes right-handed local
ENU metres (`east`, `north`, `up`); Sentinel converts those values to WGS84
for the map. Both views therefore use the same origin and moving nodes.

The generated Singapore operational pack contains:

- 5,000 × 5,000 m heightfield, 513 × 513 samples;
- 6,319 extruded building features;
- 3,675 road features;
- 409 water features;
- 922 named landmarks.

The original PMTiles/terrain data are build-time inputs only. The generated
heightmap and OBJ meshes are owned by the simulator, so runtime separation is
preserved.

## Protocol v1 data shapes

Handshake:

```json
{
  "protocol": "sentinel-sim",
  "version": "1.0",
  "coordinateFrame": "ENU",
  "origin": { "latDeg": 1.3521, "lngDeg": 103.8198, "elevationM": 46.1 },
  "limits": { "maxVehicles": 32, "px4HotSpawn": false }
}
```

Telemetry is a `telemetry.frame` envelope containing a vehicle record:

```json
{
  "vehicleId": "d155_01",
  "lifecycle": "ACTIVE",
  "pose": {
    "frame": "LOCAL_ENU",
    "eastM": 41.2,
    "northM": -18.4,
    "upM": 12.0,
    "rollRad": 0,
    "pitchRad": 0,
    "yawRad": 1.2
  },
  "velocity": { "eastMS": 1.0, "northMS": 0.2, "upMS": 0 },
  "navigationSource": "GAZEBO_TRUTH",
  "updatedAt": "2026-07-25T10:00:00Z"
}
```

Commands carry a unique `commandId` and are idempotent. `velocity` and `stop`
finish synchronously; `goto` is acknowledged as `EXECUTING` and closes the
position loop against live odometry. WebSocket reconnect performs a full HTTP
handshake/state refresh before event streaming resumes.

## GNSS-denied demonstration

Select `anafi_01`, then choose **Deny GNSS**.

1. The fault event marks GNSS denied in both applications.
2. PX4 GPS fusion is disabled.
3. Gazebo ground truth is passed through a seeded simulated-VIO model with
   noise, drift and growing uncertainty.
4. External odometry is injected to PX4 at 20 Hz.
5. Sentinel reports `SIMULATED_VIO`, VIO positioning and uncertainty instead
   of claiming GNSS.
6. **Restore GNSS** stops VIO injection and restores PX4 GPS fusion.

This proves the C2, protocol, estimator handover and autonomous command path can
operate without GNSS. It does **not** claim a production vision stack: the
present VIO measurement is derived from simulator truth. A real deployment
must replace that provider with timestamped camera/IMU VIO (for example
ORB-SLAM3/VINS), calibrate camera intrinsics/extrinsics, validate scale and
latency, and pass flight-safety testing. The protocol does not need to change.

## Capacity and limitations

- Maximum fleet: 32 total; one pre-launched PX4 asset plus up to 31 lightweight
  Gazebo-controlled assets.
- Hot-spawning additional PX4 processes is intentionally unsupported in v1.
- The world is operationally recognizable, not photorealistic.
- Building collision uses the terrain and vehicle collision model; the large
  building/road/water map meshes are primarily visual to keep 32-asset physics
  practical.
- A future APK can wrap the same responsive web client or use it as a PWA.
  Keep API URLs configurable, use HTTPS/WSS through a VPN/reverse proxy, store
  the pairing session in platform secure storage, and add Android network
  security configuration for the chosen deployment.

## Verification

Simulator:

```bash
.venv-px4/bin/pytest -q
.venv-px4/bin/drone-c2-sim validate --scenario individual_demo
.venv-px4/bin/drone-c2-sim render --scenario individual_demo --output build
```

Sentinel:

```bat
npm test -- --run
npm run build
npm audit --omit=dev
```

The suites cover protocol lifecycle/idempotency, telemetry state,
formation/flocking algorithms, simulated VIO drift, SQLite reopen, optimizer
constraints, pairing, and an actual gateway outage/reconnect cycle.
