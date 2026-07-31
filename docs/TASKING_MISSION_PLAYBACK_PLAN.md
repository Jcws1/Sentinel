# Tasking, mission execution, and playback plan

Status: proposed
Date: 31 July 2026
Scope: Sentinel simulator and operator UI MVP

## 1. Outcome

Build one continuous workflow:

1. The operator defines mission objectives and requests an assignment plan.
2. Sentinel shows the selected vehicles, routes, timing, and approval gate.
3. Starting the mission creates a durable mission run and dispatches the plan.
4. The field immediately enters a live playback view that shows every dynamic
   entity, its planned path, and its actual movement.
5. A simulated interceptor can neutralize its assigned simulated target. The
   target disappears from the live field, while its final state and the
   neutralization event remain available in the mission record.
6. The Mission log lists completed and active runs. Selecting a run opens a
   YouTube-style timeline with free-camera and follow-vehicle views.

This is a mission replay feature, not an extension of the existing sensor-input
replay command. Sensor replay re-injects observations into the edge gateway;
mission replay reconstructs what the operator saw and what the C2 system did.

## 2. Existing foundation

The current repository already contains most of the building blocks:

- `OperationalObjective`, `AssignmentPlan`, and the Hungarian assignment
  optimizer provide the first tasking pass.
- `/api/v1/missions/optimize` and `/api/v1/missions/plans/:id/confirm` dispatch
  assignments, although planning and execution are currently coupled.
- `advanceSimulation` moves friendly vehicles and threats every 400 ms.
- Confirmed intercept recommendations assign interceptors to tracks.
- `removeTrack` exists in the client store, but there is no server-side
  engagement outcome or terminal track state.
- The Operations panel and map inspector already expose text decision logs.
- `BattlespaceMap` already draws routes and recent trails and has soft-follow
  camera behavior.
- The simulator gateway exposes `free`, `follow`, and `group-follow` camera
  commands.
- SQLite is already used for saved scenarios and health history.

The missing pieces are a first-class mission/run lifecycle, durable world-state
recording, simulated engagement outcomes, and a timeline-driven map renderer.

## 3. Product decisions

### 3.1 Separate mission definition, assignment plan, and mission run

Do not add more meaning to the current global `MissionSnapshot.state`. It is an
operational control state (`ACTIVE`, `HOLD`, or `RECALL`), not the lifecycle of
an individual mission.

Introduce these records:

```ts
type MissionDefinition = {
  id: string
  name: string
  scenarioId: string | null
  objectives: OperationalObjective[]
  createdAt: string
  updatedAt: string
}

type MissionRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ABORTED'
  | 'FAILED'

type MissionRun = {
  id: string
  missionId: string
  planId: string
  scenarioId: string | null
  status: MissionRunStatus
  startedAt: string | null
  endedAt: string | null
  durationMs: number
  participantIds: string[]
  targetTrackIds: string[]
  outcome: MissionOutcome | null
}
```

An assignment plan stays immutable after a run starts. Re-tasking is recorded
as a mission event and creates a new assignment revision rather than silently
rewriting the original plan.

### 3.2 Split planning from execution

The current Fleet Manager action says `OPTIMIZE + DISPATCH`, and low-risk plans
can execute inside the optimize endpoint. Replace this with an explicit flow:

`Define objectives -> Generate plan -> Review/approve -> Start mission`

The start action is the only action that creates a run, starts recording, and
dispatches simulator commands. Existing endpoints can remain temporarily as
compatibility aliases while the UI migrates.

### 3.3 Live view and replay use the same player

When a mission starts, the player opens automatically in `LIVE` mode with the
time cursor pinned to the newest frame. Planned routes and actual trails are
visible immediately.

Pausing the player pauses only the visualization; it does not pause a running
mission. Operational pause remains the existing mission `HOLD` command and must
be labelled separately.

After the mission ends, the same player becomes a normal seekable replay.

### 3.4 Replay never hydrates live operational slices

WebSocket snapshots must continue updating the live Redux state while an
operator reviews history. Add a separate playback slice and a rendered-world
selector:

```ts
renderedWorld = playback.active
  ? interpolate(playback.frames, playback.cursorMs)
  : selectLiveWorld(state)
```

`BattlespaceMap` should render `renderedWorld`. Playback mode disables tasking
and mission commands, displays an `AAR / REPLAY` banner, and provides a clear
`Return to live` action.

### 3.5 Neutralization is a simulation-only terminal outcome

For the MVP, elimination means a deterministic simulated contact outcome. It
does not model a weapon, payload, or real-world effect.

A target is neutralized when all of these are true:

- the source is explicitly `SIMULATED`;
- an intercept recommendation is confirmed;
- an assigned, non-faulted interceptor is active;
- interceptor-to-target separation is within a configurable contact radius;
- the condition is satisfied for the configured number of consecutive ticks.

The authoritative server then performs one atomic transition:

1. Mark the target `INTERCEPTED` with time and interceptor IDs.
2. Mark the tasking recommendation `completed`.
3. Release the assigned interceptors.
4. Emit `target.neutralized` and a decision-log entry.
5. Remove the target from the active-world selector so it disappears from the
   field.
6. Keep its final state in the mission recording and archived track history.

Never infer elimination or delete a track from a live sensor source merely
because a friendly vehicle is nearby. If the target is backed by a Gazebo
entity, the simulator adapter should receive an idempotent simulation-effect
command so the world model and Gazebo visual agree.

## 4. Recording model

Record both time-series state and semantic events. Frames make seeking simple;
events explain why the state changed.

```ts
type MissionFrame = {
  runId: string
  sequence: number
  elapsedMs: number
  recordedAt: string
  vehicles: Array<{
    id: string
    position: Position
    headingDeg?: number
    lifecycle?: string
    assignedObjectiveId?: string | null
    assignedTrackId?: string | null
  }>
  tracks: Array<{
    id: string
    position: Position
    status: 'ACTIVE' | 'INTERCEPTED' | 'LOST' | 'ESCAPED'
  }>
}

type MissionEvent = {
  id: string
  runId: string
  elapsedMs: number
  type:
    | 'mission.started'
    | 'mission.held'
    | 'mission.resumed'
    | 'mission.completed'
    | 'mission.aborted'
    | 'assignment.dispatched'
    | 'assignment.retasked'
    | 'target.neutralized'
    | 'vehicle.faulted'
    | 'operator.decision'
  actor: 'operator' | 'system' | 'authority'
  entityIds: string[]
  detail: string
  data?: Record<string, unknown>
}
```

MVP recording rules:

- Capture the initial mission/scenario snapshot before dispatch.
- Capture all dynamic vehicles and active/terminal tracks on every C2 simulation
  tick (currently 400 ms).
- Record planned route geometry separately so planned and actual paths can be
  toggled independently.
- Interpolate position and heading between frames during playback. Apply
  lifecycle and neutralization events as discrete changes, never interpolated.
- Finalize the recording on complete, abort, or failure.
- Persist runs, events, and frames in SQLite. Use indexed
  `(run_id, elapsed_ms)` access and keep the schema behind a dedicated
  `mission_runs` migration component.
- Store the scenario ID and a compact scenario snapshot so later scenario edits
  cannot change historical playback.

At the current 400 ms tick, full JSON frames are acceptable for the MVP. Delta
encoding, compression, and retention policies can follow after measuring real
run sizes.

## 5. API proposal

### Planning and execution

- `POST /api/v1/missions` — create a mission definition.
- `GET /api/v1/missions` — list mission definitions and latest run status.
- `GET /api/v1/missions/:id` — get objectives, current plan, and run history.
- `POST /api/v1/missions/:id/plan` — generate an assignment plan only.
- `POST /api/v1/missions/:id/start` — validate/approve the plan, create the run,
  begin recording, and dispatch.
- `POST /api/v1/mission-runs/:id/hold` — operationally hold the run.
- `POST /api/v1/mission-runs/:id/resume` — resume a held run.
- `POST /api/v1/mission-runs/:id/abort` — abort and finalize the recording.

### Logs and playback

- `GET /api/v1/mission-runs` — list active and historical runs.
- `GET /api/v1/mission-runs/:id` — metadata, outcome, participants, duration,
  route definitions, and event markers.
- `GET /api/v1/mission-runs/:id/frames?fromMs=&toMs=` — time-windowed frames.
- `GET /api/v1/mission-runs/:id/events` — ordered semantic events.

### Realtime events

Add:

- `mission.run.started`
- `mission.run.updated`
- `mission.frame`
- `mission.event`
- `mission.run.finalized`

The player can follow `mission.frame` while live and request historical windows
through HTTP after a seek.

All mutating endpoints remain behind the existing operator pairing middleware.
Playback reads can use the same protection initially.

## 6. Operator experience

### 6.1 Tasking and mission creation

Replace the reserved Missions workspace with:

- mission name and scenario;
- ordered objectives;
- objective type, target/area/route, priority, timing, and constraints;
- recommended assignments with alternatives and reasons;
- planned routes drawn on the map before start;
- validation for missing targets, unfilled minimum vehicle slots, low battery,
  link loss, policy gates, and simulator availability;
- explicit `Save draft`, `Generate plan`, `Approve`, and `Start mission`
  actions.

For `intercept_track`, store a stable `targetTrackId` in addition to the current
position. A moving intercept target cannot be represented by
`targetPosition` alone. Patrol and escort objectives likewise need route/group
references rather than a single point.

### 6.2 Automatic live playback

On successful start:

- return the new `runId`;
- open the map in live mission mode;
- fit the camera to the mission participants and planned routes;
- show planned paths, actual trails, target movement, and event markers;
- keep the cursor at `LIVE` until the operator pauses or seeks backward;
- offer `Go live` when the cursor is behind the current run time.

### 6.3 Mission log and replay bar

The Mission log should show one row/card per run with mission name, start time,
duration, status, outcome, assigned vehicles, and neutralized/escaped targets.

Selecting a run opens the map and a bottom playback bar containing:

- play/pause;
- current time and total duration;
- draggable seek bar;
- event markers for dispatch, decisions, faults, intercepts, and completion;
- jump to previous/next event;
- playback speed (`0.5x`, `1x`, `2x`, `4x`);
- planned-path and actual-trail toggles;
- view selector: `Free camera` or `Follow`;
- follow target selector populated from vehicles recorded in that run;
- `Return to live`.

Free camera leaves pan, orbit, pitch, and zoom under operator control. Follow
camera keeps the chosen entity centred and derives bearing from its motion,
but any manual camera movement temporarily suspends follow until `Resume
follow` is selected. If the entity disappears or faults, freeze at its final
position and explain why follow ended.

The first implementation should control the Sentinel Mapbox camera. Forwarding
the same choice to the Gazebo camera can be added when simulator playback is
available, using the existing `free` and `follow` gateway modes.

## 7. Implementation slices

### Slice 1 — Domain and persistence

- Extend objective references for moving tracks, routes, areas, and groups.
- Add mission definitions, immutable plan revisions, runs, events, frames, and
  outcomes.
- Add SQLite migrations and database tests.
- Stop auto-dispatching from the optimize endpoint.
- Add create, plan, start, list, detail, and finalize APIs.

Exit criterion: a mission can be planned, started, recorded for several ticks,
restarted at the C2 process level, and read back with ordered frames/events.

### Slice 2 — Execution and simulated neutralization

- Make mission start own dispatch and run status changes.
- Add authoritative proximity/contact evaluation after each motion update.
- Add terminal track and completed-tasking states.
- Release interceptors and archive neutralized tracks atomically.
- Add an idempotent simulator target-removal/effect command for Gazebo-backed
  simulated targets.
- Finalize runs on objective completion, abort, or failure.

Exit criterion: an approved interceptor reaches a simulated target, the target
disappears once, the interceptor is released, and the event is preserved in
the completed run.

### Slice 3 — Shared world renderer and live player

- Add a playback Redux slice and buffered frame loader.
- Add frame interpolation and semantic-event application.
- Refactor `BattlespaceMap` to consume the rendered-world selector.
- Auto-open live mission mode on start.
- Render planned routes, actual trails, and target disappearance.
- Add live/paused/behind-live state without confusing player pause with mission
  hold.

Exit criterion: mission movement begins visually on start and the operator can
pause, seek backward, and return to live without affecting execution.

### Slice 4 — Logs, timeline, and cameras

- Upgrade Operations/Mission log from text-only decisions to run history.
- Add the playback bar, event markers, speeds, and path toggles.
- Add free-camera and follow-vehicle modes.
- Link timeline events to map focus and log detail.
- Keep the existing decision log as an event-filtered view.

Exit criterion: a completed mission can be opened from Logs, played end to end,
scrubbed to any time, viewed freely, and followed from any recorded vehicle.

### Slice 5 — Hardening and demo acceptance

- Handle missing/corrupt frame windows and partial active recordings.
- Bound client buffering and load long recordings by time window.
- Add retention/export after measuring recording size.
- Add keyboard and accessible labels for timeline controls.
- Verify offline map behavior and no-command behavior during replay.

## 8. Test plan

### Unit

- Mission lifecycle transition table rejects invalid starts/resumes/finalizes.
- Assignment plans cannot mutate after run start.
- Frame interpolation handles start/end boundaries and entity appearance or
  disappearance.
- Target neutralization requires simulated source, confirmed assignment,
  healthy interceptor, radius, and dwell; it fires exactly once.
- Neutralization completes tasking and releases all assigned interceptors.

### API and database

- Mission/run/frame/event rows survive database reopen.
- Frame queries are ordered and correctly bounded by time.
- Start is idempotent and cannot dispatch the same plan twice.
- Mutating routes require pairing authorization.
- Finalized recordings cannot receive new frames.

### End to end

1. Create an intercept mission and generate a plan.
2. Approve/start it and verify automatic live playback.
3. Verify all participating and non-participating dynamic field entities move.
4. Verify planned path and actual trail are both visible.
5. Let the interceptor reach the target and verify the target disappears.
6. Verify the neutralization marker and terminal log entry.
7. Open the run from Mission log and replay at multiple speeds.
8. Seek before and after neutralization and verify the target appears/disappears
   at the correct time.
9. Switch between free camera and follow for each recorded vehicle.
10. Return to live without changing live mission state.

## 9. MVP acceptance criteria

- Planning does not dispatch until `Start mission` succeeds.
- Starting a mission always creates one durable run and begins recording before
  the first simulator command is sent.
- The live player shows all dynamic field entities, planned routes, and actual
  trails with a visible live cursor.
- A confirmed simulated intercept produces exactly one neutralization outcome;
  the target is no longer visible in the active field.
- Historical playback reconstructs the target before the neutralization time
  and removes it at the recorded event time.
- Mission logs survive a server restart.
- Replay provides free camera and follow for every recorded friendly vehicle.
- Seeking or pausing replay never pauses, rewinds, or mutates the live mission.

## 10. Recommended build order

Implement Slices 1 and 2 together first. They establish authoritative mission
and target outcomes and prevent the UI from becoming a visual-only demo. Then
build the shared player in Slice 3 and expose it through Logs in Slice 4.

The smallest convincing vertical demo is:

`one intercept objective -> one approved plan -> one mission run -> live movement
-> one simulated neutralization -> one persisted replay -> free/follow camera`.
