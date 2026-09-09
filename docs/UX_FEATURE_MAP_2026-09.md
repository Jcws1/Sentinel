# Sentinel UX Feature Map

**Version:** 2026-09-09

**Scope:** Current `main` working tree, inspected in the running application and traced to the implementation

**Primary audience:** Product, UX, engineering, safety/authority reviewers, demo operators

**Primary emphasis:** Rules of engagement (ROE), decision authority, mission tasking, and degraded-operation behavior

## 1. Purpose

This document maps the current Sentinel experience as an operator-facing product. It describes what a user sees, what they can do, the state transitions they encounter, and where the interface is currently backed by a service versus local, simulated, sample, or planned behavior.

It is a feature map, not a statement that every visible capability is production-ready.

### Status language

| Status | Meaning |
|---|---|
| Functional | Connected to an implemented application or service flow. |
| Functional with limits | Works, but an important operational acknowledgement, persistence, or integration is incomplete. |
| Local/UI-only | Changes only local component or browser state. It is not an authoritative backend change. |
| Simulated/sample | Intended for rehearsal, demonstration, or after-action examples rather than live operations. |
| Planned | Visible or described in the interface but not currently actionable. |

## 2. Product model

Sentinel is a map-first command-and-control interface for supervising multiple unmanned aircraft. The intended operator loop is:

1. Observe the common operational picture and system health.
2. Review detected tracks and fused evidence.
3. Review system-proposed mission groups and asset allocation.
4. Confirm, reject, modify, hold, abort, or escalate within the operator's authority.
5. Monitor execution, degraded conditions, and command state.
6. Review mission decisions and events after completion.

The core design principle is **bounded autonomy**: automation may recommend, rank, queue, or execute only within configured permissions and safeguards. Human authority is intended to remain explicit for consequential actions.

## 3. Users and goals

| User/role | Primary goals | Relevant workspaces |
|---|---|---|
| Mission operator | Maintain the operational picture, review threats, approve plans, intervene in execution | Battlespace, Field navigator, Mission task workspace |
| Mission commander | Set authority, approve consequential actions, publish ROE | ROE, mission controls |
| Operations supervisor | Review and route approvals, monitor exceptions, act as fallback reviewer | ROE, Operations, Logs |
| Sensor/edge operator | Monitor source freshness and health; place or administer simulated sensors | Sensors |
| Fleet/simulation operator | Add assets, supervise formations, inject failures, activate scenarios | Fleet detail, Scenarios |
| Analyst/AAR reviewer | Replay missions and inspect decisions and events | Logs |
| Planning operator | Ask for context, clarify intent, and prepare a non-executable mission draft | AI assistant |

## 4. Information architecture

```text
Sentinel
├── Persistent command header
│   ├── Mission modes: Defense / Recon / Attack
│   ├── Direct workspaces: Sensors / ROE / AI / Logs
│   ├── Critical state: Link / Auto / GNSS / tracks-readiness / queue / deployment
│   └── Global commands: Hold / Recall / mode-specific actions
├── Battlespace
│   ├── Map and overlays
│   ├── Field navigator: Overview / Tools / Missions
│   ├── Mission task workspace
│   └── Contextual activity and asset detail
├── Specialist workspaces
│   ├── Scenarios
│   ├── Fleet detail
│   ├── Sensors
│   ├── ROE
│   ├── AI assistant
│   └── Logs / replay
└── Cross-cutting states
    ├── Online / reconnecting / offline
    ├── GNSS active / degraded / denied
    ├── C2 strong / weak / lost
    ├── Mission standby / active / hold / recall
    └── Proposed / confirmed / executing / rejected tasking
```

## 5. Global shell and navigation

### 5.1 Persistent command header

| Feature | Operator experience | Status |
|---|---|---|
| Product identity | `SENTINEL` anchors the command surface. | Functional |
| Mission mode | Defense, Recon, and Attack are mutually exclusive mode controls. A switch can warn when it will hide an active decision lane. | Functional |
| Direct workspace access | Sensors, ROE, AI, and Logs open specialist views; selecting the active direct workspace returns to Tracks. | Functional |
| Utilities drawer | Provides Scenarios, Fleet detail, Sensor fusion, ROE config, and Mission logs destinations. | Functional with limits; known overlay/clickability issue is recorded in the UX audit. |
| Link state | Shows connecting, online, or offline state from the C2 session. | Functional |
| Auto state | Cycles Off, On, and Locked in UI state. | Local/UI-only; it does not itself publish an authoritative autonomy policy. |
| GNSS state | Surfaces mission positioning state. A denied state also creates a critical system banner. | Functional |
| Threat/readiness count | Displays threat count relative to ready interceptor count. | Functional |
| Queue count | Displays pending recommendation/command volume. | Functional |
| Deployment mode | Toggles Edge/Cloud presentation state. | Local/UI-only unless the surrounding deployment actually changes. |
| Hold | Opens a confirmation before applying mission-wide hold. | Functional |
| Recall | Opens a confirmation before recalling the swarm and aborting active engagements. | Functional |
| Attack escalation | Attack mode exposes commander escalation feedback. | Local/UI-only notification in the current interface. |

### 5.2 Mission modes

| Mode | Operator goal | Default workspace | Main tasking behavior |
|---|---|---|---|
| Defense | See threat, confirm plan, execute fast | Tracks | Mission task workspace for grouped intercept recommendations |
| Recon | Grow map coverage and classify points of interest | Tracks | Area-recon tasking card and coverage-oriented context |
| Attack | Review intelligence and authorize deliberate action | ROE | Policy/right-side context and deliberate-action card |

Mode switching changes presentation and overlay defaults. Pending and active work remains in state even when a mode hides its controls.

## 6. Battlespace and common operational picture

### 6.1 Map

| Capability | UX behavior | Status |
|---|---|---|
| 3D operational map | Displays Singapore/Johor terrain, buildings, installations, scenario anchors, assets, tracks, routes, zones, and sensor coverage. | Functional |
| Basemaps | Minimal and satellite presentation are available where exposed. | Functional |
| Map overlay tabs | Bases and Scenarios change the geographic context layer. | Functional |
| Map projection | 2D/3D controls are visible; current state handling favors 3D. | Functional with limits |
| Track and asset selection | Selecting objects connects map focus to field navigation and detail views. | Functional |
| Threat callouts | Shows identity, class, evidence, and available engagement/request actions. | Functional |
| Policy zones | Weapon-free, hold-fire, and no-go geometry can be displayed and used in decision evidence. | Functional |
| Mission routes | Recommended and executing routes are rendered for tasking. | Functional |
| Replay | Recorded/sample state can replace the live picture at the selected timeline position. | Simulated/sample |
| Map status | Edge-map freshness, terrain/GNSS context, drift, complexity, LOS, and relay candidates are surfaced. | Functional with limits; some values are derived/demo context. |
| Activity inspector | Map-side inspector presents selected asset detail or operational activity. | Functional |

### 6.2 Field navigator

The left navigator is the object-oriented entry point into the common operational picture.

#### Overview

- Search across threats, unknown tracks, sensors, friendly assets, and map objects.
- Expand/collapse object groups.
- Select threats for batch actions.
- Select or double-click objects to focus them on the map.
- Expand a hostile track to inspect class, ETA, fusion confidence, altitude, speed, source sensors, and recommendation state.
- Request a plan, engage a permitted track, or add/authorize a scenario track into the mission.
- Browse map objects by restricted airspace, military, medical, education, transport, infrastructure, industrial, residential, commercial, recreation, and other categories.

#### Tools

| Tool group | Current tools | Status |
|---|---|---|
| Measure | Range and bearing | Functional |
| Measure | Area and coordinates | Planned |
| Observe | LOS and terrain | Functional |
| Observe | Sensor coverage | Planned |
| Observe | Source health | Functional; opens Sensors |
| Move | Swarm movement | Functional in the simulator |
| Move | Route/corridor and relay placement | Planned |
| Heatmap | Enemy activity, friendly activity, sensor confidence, terrain slope | Functional |
| Alert | Geofence and proximity/status | Planned |
| Coordinate | Quick report and GRG builder | Planned |

#### Missions

The mission-oriented experience is now primarily provided by the Mission task workspace on the map. Any remaining reserved/placeholder mission navigation should not be interpreted as a separate authoritative planning system.

## 7. Mission planning, tasking, and engagement

### 7.1 Mission task workspace

The current Defense experience replaces the earlier single-card decision lane with a grouped mission-plan workspace.

| Area | Information/actions |
|---|---|
| Mission header | Mission objective, group count, assigned assets, reserves, mission state, and C2 connection |
| Plan summary | Plan groups, executing groups, groups awaiting review, and exceptions |
| Task-group table | Objective/track, asset count, group status, and policy state |
| Attention area | Collects blocked, stale, indeterminate, degraded-asset, or approval-required exceptions |
| Selected group | Summary, policy result, assets, ETA, confidence, evidence age, and recommendation rationale |
| Asset drawer | Inspect assigned asset health, link, control, and positioning |
| Allocation override | For a pending task, request a new plan using an eligible unassigned asset |
| Rejection/modification | Reject a group, then choose Swap, Reassign, Delay, Priority up/down, Hold, Ignore, or Escalate |
| Execution intervention | Hold or abort an executing group; controls apply to the group, not only the selected asset |
| Plan approval | Approves only pending groups currently marked within authority; requires a second confirmation within five seconds |

### 7.2 Group policy states

| Displayed state | Trigger in the current mission workspace | Effect |
|---|---|---|
| Within authority | Connected, mission not held/recalled, evidence current, ROE evidence passes | Group can be included in plan approval. |
| Approval required | ROE evidence does not pass but the case is not treated as a hard block | Group is excluded from current batch approval. |
| Blocked | Mission is Hold/Recall, or a Class I track fails the current policy evidence check | Group is excluded from approval. |
| Unable to evaluate | C2 is disconnected | Group is excluded from approval. |
| Evidence stale | Last C2 sync is more than 12 seconds old | Group is excluded from approval. |
| Attention only | Assigned asset has lost comms or battery below 25% | Exception is shown for review. |

### 7.3 Task custody

| Recommendation status | UX custody label | Current acknowledgement truth |
|---|---|---|
| Pending | Proposed / Not sent | No command sent |
| Confirmed | Confirmed / Executing | Aircraft acknowledgement unavailable |
| Auto-executing | Auto-executing | Aircraft acknowledgement unavailable |
| Vetoed | Rejected / No command sent | Closed |

### 7.4 Recommendation and allocation logic

- Threats are prioritized before display.
- Recommendations select available interceptors and calculate a route, ETA, and confidence.
- Large estimated groups can request more assets: three for an estimated group of at least 100, two for at least 20, otherwise the threat-class default.
- The operator may inspect the assigned assets and request a preferred replacement for a pending group.
- The system does not currently display an aircraft-level receipt confirming acceptance or execution.

### 7.5 Command states and offline behavior

The command layer supports mission actions such as request plan, confirm, reject, hold, recall, reassign, abort, and priority changes. The UI also displays pending synchronization when commands are queued.

Operationally important limitation: the current application does not yet expose a complete receipt chain such as submitted, received, accepted, executing, completed, expired, and revalidation-required. The existing UX audit recommends that high-consequence offline commands never execute after reconnection without freshness and policy revalidation.

## 8. Rules of engagement (ROE)

### 8.1 ROE mental model

The intended sequence is:

```text
Permission gate
    ↓
Operational boundaries
    ↓
Human-review requirement
    ↓
Autonomy ceiling
    ↓
Fail-safe response
    ↓
Ranking among eligible options
    ↓
Audit of configuration activity
```

Permissions and safeguards decide what is eligible. Recommendation priorities only rank options that have already passed those controls.

### 8.2 ROE workspace navigation

| Section | Purpose |
|---|---|
| Overview | Current environment, publication metadata, and configuration-area health |
| Action permissions | Default authority required for each action type |
| Operational boundaries | Spatial, temporal, proximity, and protected-location constraints |
| Human oversight | Review conditions, reviewer routing, timeout, and no-response behavior |
| Autonomous behaviour | How far automation may initiate actions and which safeguards remain mandatory |
| Fail-safe behaviour | Safe responses to stale context, link loss, and degraded positioning |
| Recommendation priorities | Ranking profile and factor weights for already-eligible options |
| Audit trail | Published and draft configuration events by environment |

### 8.3 Environments and configuration lifecycle

The environment selector provides Operational, Training, and Development contexts.

```text
View active configuration
    ↓ Edit
Draft mode (active configuration unchanged)
    ├── Cancel → restore the edit snapshot
    └── Publish changes → add a local audit event and success notification
```

Important implementation boundary: **ROE editing, publishing, version labels, and audit events in this workspace are currently local/UI-only.** They are not persisted to an authoritative policy service and do not update the runtime policy zones/rules used elsewhere. The displayed actor, time, and versions are interface fixtures.

Changing environment cancels the current edit session and restores its snapshot.

### 8.4 Overview

The overview presents:

- active configuration status;
- count of active configuration areas;
- environment;
- last-published time;
- publishing authority;
- one entry card for each configuration category.

Current defaults show five of six areas active; Autonomous behaviour is marked `Needs setup` even though it has supervised defaults.

### 8.5 Action permissions

| Action | Description | Default authority |
|---|---|---|
| Observe | Collect imagery or sensor data | Allowed |
| Track | Maintain surveillance of a declared entity | Allowed |
| Escort | Accompany a friendly or protected entity | Allowed |
| Communications relay | Provide temporary communications coverage | Allowed |
| Intercept | Approach and contain a declared threat | Review required |

In edit mode, each action can be set to Allowed, Review required, or Blocked. These are presented as system-wide defaults, with future room for package- and mission-specific conditions.

### 8.6 Operational boundaries

| Boundary | Default | Editable behavior |
|---|---|---|
| Restricted zones | No entry / On | Locked; cannot be weakened in this UI |
| Protected-location buffer | 500 m / On | Can select 250 m, 500 m, 750 m, or 1 km; can toggle |
| Minimum separation | 250 m / On | Locked; cannot be weakened in this UI |
| Maximum task duration | 60 min / On | Can select 30, 60, 90 minutes, or Until changed; can toggle |

The locked treatment communicates a higher-order safeguard rather than ordinary configuration.

### 8.7 Human oversight

Default review conditions are enabled for:

- protected locations;
- autonomous material changes;
- intercept actions.

Approval routing defaults to:

- primary reviewer: Mission commander;
- fallback reviewer: Operations supervisor;
- timeout: two minutes;
- no response: Hold action.

Configurable alternatives include Operations supervisor or Duty officer as the primary reviewer, Duty officer or no fallback, timeout of one/two/five minutes, and Hold, Escalate again, or Cancel request after timeout.

### 8.8 Autonomous behaviour

| Level | Operator meaning |
|---|---|
| Recommend only | A person issues every action. |
| Queue permitted actions | The system queues eligible actions; a person confirms them. |
| Execute permitted actions | Only explicitly permitted actions may execute without another confirmation. |

Default safeguards are all On:

- human supervision for consequential actions;
- confirmation before a material change to entity, action, area, or intended effect;
- reduction to Recommend only when link or positioning quality degrades.

Automation does not grant authority; it operates beneath the permission and safeguard ceiling.

### 8.9 Fail-safe behaviour

| Condition | Trigger | Response | Recovery |
|---|---|---|---|
| Stale operational context | 30 seconds | Hold action | Fresh context received |
| Command link loss | 10 seconds | Hold and return | Stable link restored |
| Degraded positioning | Below 60% | Require manual control | Confidence above 75% |

The ROE workspace communicates each fail-safe as a trigger-response-recovery triplet. These settings are currently local/UI-only and are not the same as the live mission workspace's 12-second stale-evidence threshold.

### 8.10 Recommendation priorities

The default Balanced profile uses:

| Factor | Weight | Default interpretation |
|---|---:|---|
| Mission effect | 72 | High |
| Response time | 68 | Medium |
| Transit distance | 46 | Medium |
| Time on station | 58 | Medium |
| Fuel and battery reserve | 52 | Medium |

Available profiles are Balanced, Rapid response, Persistent coverage, and Resource reserve. Editing an individual weight creates a Custom profile. A live recommendation comparison is described but not currently connected.

### 8.11 Audit trail

The Audit trail can be filtered by All activity, Published, or Drafts and by the selected environment. Expanding an event reveals:

- changes;
- environment;
- version;
- actor.

Current events are sample local state. They are useful for validating the information design but are not a durable or tamper-evident operational audit log.

### 8.12 Runtime ROE evaluator

Separately from the configuration workspace, the application contains a task-level ROE evaluator with the following inputs:

- task type: observe, track, escort, relay, intercept;
- purpose;
- area type: controlled, dense urban, protected buffer, no-go;
- duration;
- asset class;
- control mode: supervised, manual, autonomous;
- civilian context: clear, unclear, present;
- protected-location indicator;
- requester authority: operator, mission commander, designated reviewer;
- communications state: strong, weak, lost;
- data age.

It can return Eligible, Eligible with constraints, Additional approval required, Indeterminate, or Ineligible. When multiple rules match, the most severe outcome wins in this order:

```text
Eligible < Restricted < Approval required < Indeterminate < Ineligible
```

#### Runtime rule map

| Rule | Trigger | Outcome/effect |
|---|---|---|
| ZONE-001 No-go exclusion | Area is no-go | Ineligible |
| URBAN-006 Dense urban controls | Area is dense urban | Eligible with constraints; bounded area/time and civilian revalidation |
| URBAN-014 Protected-location review | Protected buffer or indicator | Additional approval required |
| CIV-002 Unresolved civilian context | Civilian context unclear | Indeterminate for intercept; otherwise restricted |
| CIV-003 Consequential task near civilians | Civilians present during intercept | Additional approval required and explicit human authorization |
| CTRL-004 Autonomy supervision | Autonomous control | Ineligible for intercept; otherwise additional approval |
| AUTH-003 Command threshold | Operator requests intercept | Mission commander approval required |
| COMMS-008 Degraded link | Comms weak | Restricted; loss-link behavior must be declared |
| COMMS-009 Link unavailable | Comms lost | Ineligible for new dispatch |
| DATA-006 Stale context | Data older than 30 seconds | Indeterminate |
| TIME-005 Extended duration | More than 30 minutes | Additional approval required |
| INPUT-001 Required parameters | Missing purpose or valid duration | Indeterminate |
| BASE-001 Standing authority | No other rule matches | Eligible |

The evaluator also accumulates constraints and names the conditions that require revalidation.

### 8.13 Live mission decision evidence

The mission task workspace currently uses a lighter decision-evidence check rather than the full evaluator above. It considers:

- explicit operator authorization on a scenario/radar track;
- threat class;
- fusion confidence;
- distance to the protected asset and weapon-free radius;
- current mission state;
- C2 connection;
- evidence age;
- assigned-asset battery and comms.

Explicit operator authorization can allow a scenario track to proceed even when its initial recommended action is Hold; the UI then labels the action `Authorize & add` or `Authorize & engage`. Operator confirmation is still required.

### 8.14 ROE integration gap

There are currently three related but not fully unified policy surfaces:

1. **ROE configuration workspace** — editable presentation model; local/UI-only.
2. **Hydrated policy zones and simple rules** — received from C2 and used for map/policy summaries and decision geometry.
3. **Task-level evaluators/evidence checks** — code-defined rules used for eligibility labels and task attention.

Until they share an authoritative, versioned policy source, the interface must not imply that publishing in the ROE workspace changes live task eligibility. A production design should show the active policy version beside every decision and record that version in every command and audit event.

## 9. Sensors and fusion

### 9.1 Sensor health workspace

- Summary counts for healthy, degraded, offline, and total sources.
- Per-source identity, data product, status, activity/history, freshness, cadence, uptime/success, and integration.
- Edge gateway and registered source health polled every two seconds.
- CDSE status and 30-day polling history.
- Catalogue feeds for radar, RF, acoustic, EO/IR, LiDAR, drone telemetry, CDSE, and Copernicus DEM.

### 9.2 Runtime simulated sensors

- Select a sensor type.
- Enter local ENU east, north, and yaw values.
- Add a sensor through C2, edge gateway, and sensor simulator.
- Arm `Place on map`, then use the next map click for placement.
- View lifecycle, pose, modality, revision, and visual state.
- Rotate by ±45 degrees or remove.

This is a simulator administration capability, not a live physical-sensor provisioning workflow.

### 9.3 Fusion behavior

- Radar observations establish ranged analytic tracks.
- RF, EO/IR, and acoustic bearing-only observations can associate with and enrich existing tracks.
- Bearing-only sources do not invent range.
- Fused sensor tracks are rendered separately from engagement/tasking tracks.

## 10. Fleet and autonomous platform supervision

### 10.1 Fleet detail

- Connection/protocol status and readiness summary.
- Assets grouped by mission/simulator group.
- Asset identity, platform, lifecycle, health, and battery.
- Select an asset and recenter/follow it in Gazebo.
- Add one or multiple assets with ID, platform, role, group, spacing, and local ENU spawn pose.
- Remove eligible simulator assets.
- Inject and recover vehicle-response failures.
- Deny or restore GNSS for PX4 SITL vehicles.
- Save the current simulator state as a scenario and activate a saved scenario.

### 10.2 Collective behavior

- Apply line, column, wedge, flocking, or hold behavior.
- Scope the behavior to all eligible assets or one group.
- Swarm movement tools also support waypoint dispatch and hold from the map tools experience.

### 10.3 Operational mission assignment

- Mission types: patrol route, recon area, relay position, intercept track, escort group, hold, and return.
- Pick a target on the map when required.
- Run deterministic capability/distance optimization.
- Review the proposed assignment and its cost/reasons.
- Confirm the proposed plan as a separate step.

The current `OPTIMIZE + DISPATCH` label overstates the first transition because it initially creates a proposal; this is recorded in the UX audit.

## 11. Operational scenarios

The Scenarios workspace supports six Singapore-context rehearsals spanning aviation, infrastructure, urban, maritime, saturation, radar-replay, and GNSS-constrained situations.

Per scenario, the user can review:

- scenario name and summary;
- site type, scale, and C2 objective;
- friendly/unknown/hostile counts or data-source-specific measures;
- targets or affected areas;
- timeline speed from 1× to 10×;
- active phase and progress;
- GNSS integrity, affected/denied/recovering assets, satellites, fix age, and GNSS/VIO disagreement where applicable;
- radar source time, active tracks, estimated objects, and data quality for radar replay;
- remaining, scattered, and impact counts for attack simulations.

Users can launch, restart, and monitor a scenario. Scenario content is simulated and should remain visibly distinct from live operation.

## 12. AI mission assistant

The assistant is explicitly advisory.

### Capabilities

- Read the compact canonical C2 snapshot.
- Answer questions about current available aircraft and tracks.
- Clarify mission type, objective, area, timing, priority, communications policy, and authority reference.
- Prepare a non-executable mission draft.
- Validate completeness and identify unresolved fields.
- Request and display recommendations through the bounded assistant service.
- Stream activity such as context retrieval and validation.
- Switch between copilot and inspector views and show an Observe/Orient/Decide stage.

### Authority boundary

The assistant cannot directly access Gazebo, MAVLink, raw sensors, or vehicle command endpoints. It does not issue operational commands. The operator remains responsible for reviewing and submitting any resulting task through the command workflow.

## 13. Mission history and replay

- Select from a mission archive.
- Return to the live map.
- Play/pause, restart, scrub, or change playback speed.
- Jump to numbered mission events.
- Display the replayed operational picture on the map.
- Separate Decisions from other Events in the review log.
- Show event time, type, description, and referenced tracks/assets.
- Present completion/partial state and mission metadata.

Current archive recordings are sample frontend data, not a durable backend event ledger.

## 14. Degraded and disconnected operation

| Condition | UX response |
|---|---|
| Connecting | Warning banner indicates connection attempt. |
| C2 offline | Critical banner and compact map overlay state that the cached map remains available. |
| Mission GNSS denied or C2 lost | Critical `DENIED` banner, fallback positioning, degraded map treatment, and tasking warning. |
| Swarm autonomy active | Critical banner states that last-validated tasking continues autonomously. |
| Weak/lost asset link | Asset health and mission exceptions identify the affected platform. |
| Stale decision evidence | Task group becomes indeterminate and cannot be included in plan approval. |
| Pending offline command | Queue/sync status is displayed. |
| Offline map preparation | Separate cache preparation flow exists for supported map resources. |

The UI currently says commands are read-only while parts of the command layer can queue work. This contradiction and the required revalidation behavior are documented in `UX_AUDIT_2026-08-01.md`.

## 15. Pairing and operator access

The application includes an operator pairing dialog for protected command access. Pairing state belongs to the C2/operator-auth path. ROE editing itself currently does not enforce a complete role-based publishing workflow despite using labels such as Mission Commander and Engagement Authority.

## 16. Cross-feature UX flows

### 16.1 Detect to grouped plan approval

```text
Track detected
→ track appears on map and in Field navigator
→ recommendation generated
→ task group appears in Mission task workspace
→ operator checks policy, evidence, ETA, confidence, and assets
→ exceptions are resolved or excluded
→ operator presses Approve plan
→ operator confirms dispatch within 5 seconds
→ eligible groups become executing
→ operator may hold or abort an executing group
```

### 16.2 Reject and modify a group

```text
Select pending group
→ Reject / change group
→ group becomes rejected and modification choices open
→ choose Swap / Reassign / Delay / Priority / Hold / Ignore / Escalate
→ system submits the intent and may generate revised tasking
```

### 16.3 Inspect and override asset allocation

```text
Select task group
→ open assigned-assets drawer
→ inspect battery, link, control, positioning
→ open Override allocation
→ select an eligible unassigned asset
→ request revised plan with that preferred asset
```

### 16.4 Configure ROE

```text
Open ROE
→ choose environment
→ inspect Overview
→ open configuration category
→ Edit
→ change permissions/boundaries/oversight/autonomy/fail-safe/priorities
→ Cancel, or Publish changes
→ local success message and audit event
```

This flow currently demonstrates the UX but does not publish to an authoritative policy backend.

### 16.5 Run and review a rehearsal

```text
Utilities → Scenarios
→ review context and timeline
→ launch/restart scenario
→ return to battlespace and supervise mission
→ Logs
→ select mission/sample recording
→ replay timeline
→ compare Decisions and Events
```

## 17. Current working-tree UX changes

The unpublished working tree inspected for this document includes these material UX changes:

- replacement of the earlier decision lane/flow rail/intent palette with the unified Mission task workspace;
- grouped task review and plan-level approval;
- explicit exception aggregation and per-group policy state;
- assigned-asset inspection and allocation override;
- executing-group Hold and Abort controls;
- rejection intents embedded in the selected-group panel;
- radar/scenario-track operator authorization labels and behavior;
- larger recommended asset groups for larger estimated swarms;
- simplification of the map inspector from ranked asset recommendations to asset detail/activity;
- radar replay timing and friendly-force adjustments;
- substantial styling for the new mission-plan experience.

## 18. Known UX and product-truth limitations

The detailed findings and priorities are in `UX_AUDIT_2026-08-01.md`. The highest-impact limitations relevant to this feature map are:

1. ROE editing/publishing and its audit trail are local UI state, not authoritative policy persistence.
2. The ROE configuration workspace, hydrated policy, full task evaluator, and live mission evidence check are not yet one versioned engine.
3. Confirmed/executing tasking does not expose aircraft-level acknowledgement.
4. High-consequence queued commands need explicit expiry and revalidation on reconnect.
5. Simulation and sample replay need persistent, unmistakable environment labeling.
6. Some visible controls imply a stronger backend effect than they currently provide.
7. Utilities and specialist panes have known stacking/occlusion problems at some sizes.
8. Critical status, decision evidence, and actions require stronger compact/responsive guarantees.
9. Planned tools remain visible beside functional tools.
10. Map rendering warnings and raw technical error strings can undermine operator trust.

## 19. Traceability map

| UX area | Primary implementation references |
|---|---|
| Shell and workspaces | `src/App.tsx`, `src/components/TopBar.tsx`, `src/components/OverflowMenu.tsx`, `src/store/uiSlice.ts` |
| Mission modes | `src/modeProfiles.ts`, `src/components/ModeSwitchDialog.tsx` |
| Map and common operational picture | `src/components/BattlespaceMap.tsx`, `src/components/FieldNavigator.tsx`, `src/components/TrackDetail.tsx` |
| Mission tasking | `src/components/TaskingPanel.tsx`, `src/components/tasking/MissionTaskWorkspace.tsx`, `src/utils/taskWorkspace.ts`, `src/utils/tasking.ts` |
| Live decision evidence | `src/utils/decision.ts`, `src/components/EngageButton.tsx` |
| ROE configuration | `src/components/RoePolicyWorkspace.tsx` |
| ROE runtime evaluator | `src/policy/roeEngine.ts` |
| Hydrated policy | `src/store/policySlice.ts`, `src/components/PolicyPanel.tsx` |
| Commands and offline queue | `src/store/commandThunks.ts`, `src/store/commandQueueSlice.ts` |
| Sensors/fusion | `src/components/SensorHealth.tsx`, `server/sensorFusion.ts`, `server/edgeFusionPoller.ts` |
| Fleet and simulation | `src/components/FleetManager.tsx`, `src/components/SwarmMovementTool.tsx`, `server/simulation.ts` |
| Scenarios | `src/components/ScenariosWorkspace.tsx`, `server/demoScenarios.ts` |
| AI assistant | `src/components/AssistantWorkspace.tsx`, `assistant/`, `server/assistantProxy.ts` |
| Mission replay | `src/components/MissionHistoryPanel.tsx`, `src/components/MissionPlaybackTimeline.tsx`, `src/components/MissionReplayLogPanel.tsx`, `src/data/missionRecordings.ts` |
| Existing UX risk assessment | `docs/UX_AUDIT_2026-08-01.md` |

## 20. Documentation acceptance checklist

- [x] Persistent navigation and command/status features mapped.
- [x] Common operational picture and map interactions mapped.
- [x] Mission plan, task groups, decisions, and interventions mapped.
- [x] ROE information architecture and every configuration section mapped.
- [x] Runtime ROE rules and outcomes mapped.
- [x] ROE integration boundaries and UI-only behavior stated.
- [x] Sensors, fleet, scenarios, assistant, and replay mapped.
- [x] Degraded/offline states and key operator flows mapped.
- [x] Current unpublished UX changes summarized.
- [x] Feature-to-code traceability included.
