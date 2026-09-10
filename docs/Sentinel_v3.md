# Sentinel v3 — Product, UI/UX, and Software Architecture Guide

**Status:** Foundation document for Sentinel v3  
**Primary scope:** Hackathon counter-UAS implementation  
**Primary users:** C2 Operator / Operations Lead  
**Secondary users:** Senior commanders through the Command Picture  
**Long-term direction:** Modular operational C2 workbench that can extend beyond counter-UAS into HADR and other operational/commercial domains

---

## 1. Purpose of This Document

This document defines the product direction, UI/UX model, frontend architecture, software structure, and implementation priorities for **Sentinel v3**.

Sentinel v3 should no longer be treated primarily as a map with controls. It should be developed as a **modular operational workbench** that presents one shared operational state through multiple complementary views.

For the hackathon, Sentinel v3 will remain focused on **counter-UAS operations** and should demonstrate that use case deeply and credibly. The architecture, however, should avoid assumptions that permanently restrict the platform to drones, military use, or a single data source.

The long-term product direction is a workbench that can be adapted to other operational domains, including **Humanitarian Assistance and Disaster Relief (HADR)**, by changing domain modules, entity types, workflows, data adapters, and visualisations without rebuilding the core application.

This guide is intentionally focused on:

- UI/UX architecture;
- frontend and software architecture;
- application state and domain modelling;
- geospatial visualisation;
- workbench and multi-window behaviour;
- Command Picture visualisations;
- integration boundaries;
- project structure;
- hackathon priorities;
- future extensibility.

Detailed simulation resolution logic, probability models, health calculations, calibration rules, and negative-test requirements remain in `RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md` and should not be duplicated here.

---

## 2. Product Definition

### 2.1 Hackathon Product

For the hackathon, Sentinel is:

> **A macro-level command-and-control workbench for supervising counter-UAS operations, presenting one shared operational state through multiple complementary visualisations.**

The primary user is a **C2 Operator / Operations Lead**. The user should be able to understand the situation, inspect threats and friendly assets, move between tactical and real-world spatial views, open analytic views, and review the evolution of the mission over time.

The application should prioritise **macro command and situational understanding** rather than a highly detailed micro-level vehicle-control interface.

### 2.2 Long-Term Product Direction

Longer term, Sentinel should become:

> **A modular operational workbench that transforms a shared real-time world model into the representation most useful for the user's current task.**

The counter-UAS implementation is the first deep vertical, not the final architectural boundary.

Future domains may include:

- HADR;
- emergency and crisis management;
- search and rescue;
- infrastructure monitoring;
- commercial fleet operations;
- other defence and security workflows.

The core platform should therefore be built around reusable concepts such as:

- entities;
- tracks;
- assets;
- sensors;
- zones;
- tasks;
- missions;
- events;
- timelines;
- workspaces.

Domain-specific concepts should sit on top of these abstractions.

---

## 3. Architecture Invariants

The following rules should be treated as architectural invariants for Sentinel v3. Future implementation decisions should not violate them without a deliberate redesign.

1. **Sentinel owns the operational state; renderers do not.**
2. **MapLibre and Cesium are projections of the same world, not separate mission systems.**
3. **Switching between Tactical and 3D views must preserve mission context, selection, time, and relevant overlays.**
4. **Simulation-specific schemas must not leak directly into Sentinel core.**
5. **The backend is authoritative for mission and simulation state.**
6. **The UI is a workbench, not a collection of unrelated pages.**
7. **Views should be composable into tabs, split panes, and detachable windows.**
8. **Domain-specific features should sit on top of generic entities, tracks, assets, zones, events, tasks, and missions.**
9. **The hackathon implementation is counter-UAS-specific; the architecture is not.**
10. **Visual complexity should be progressive: macro picture first, detail on demand.**
11. **Time is a first-class part of the world model so the same views can support current-state operation and replay.**
12. **Map and data providers should remain replaceable wherever practical.**
13. **The browser visualises and requests actions; it should not become authoritative for backend simulation or mission logic.**

---

## 4. Core UX Model

Sentinel v3 should be organised around three complementary types of operational understanding.

```text
                         SENTINEL
                            │
                    Shared World State
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
  OPERATIONAL MAP      ANALYTIC VIEWS      EVENT / CONTEXT
       │                    │                    │
 MapLibre Tactical     Command Picture        Timeline
 Cesium 3D             Vertical Profile       Alerts
                       Fleet / Resources       Entity Detail
                       Comparative Views       Mission History
                       Mission Metrics
```

The three layers answer different questions:

- **Spatial picture:** Where is everything?
- **Quantitative picture:** What is the overall state of the operation?
- **Temporal/context picture:** How did the situation develop?

The product should not create three independent applications called Operational Picture, Battlefield Picture, and Command Picture. Instead, these should be **different projections and aggregations of one shared underlying state**.

---

## 5. Primary User and Information Hierarchy

### 5.1 Primary User: C2 Operator / Operations Lead

The main Sentinel v3 interface should be optimised for the user responsible for maintaining situational awareness and supervising the overall operation.

The primary interface should make it easy to answer questions such as:

- Where are the threats?
- Where are friendly assets?
- Which assets are assigned?
- What areas are defended, restricted, or important?
- What is the current mission state?
- What changed recently?
- What requires attention?
- What does the physical environment around an engagement look like?
- What is the vertical relationship between relevant tracks?

### 5.2 Secondary User: Senior Commander

Senior commanders should primarily consume the **Command Picture**, which is more abstract and quantitative.

They should not need to inspect every individual vehicle by default. Their view should focus on:

- aggregate mission state;
- readiness;
- coverage;
- fleet/resource availability;
- track counts and classifications;
- timelines;
- comparative analysis;
- high-level mission metrics.

Detailed information should remain available on demand.

---

## 6. Sentinel as an Operational Workbench

Sentinel v3 should be designed more like **VS Code or another professional workbench** than a conventional website.

Users are not merely navigating between pages. They are opening, comparing, inspecting, arranging, and monitoring operational views.

A conceptual shell:

```text
┌─────────────────────────────────────────────────────────────────┐
│ SENTINEL       Alpha Sector                         20:41:37    │
├────┬────────────────────────────────────────────────────────────┤
│    │ [ Tactical ] [ 3D ] [ Command ] [ H-17 ]                 │
│ 🗺 │────────────────────────────────────────────────────────────│
│    │                                                            │
│ ◉  │                      MAIN WORKSPACE                        │
│    │                                                            │
│ ▣  │                                                            │
│    │                                                            │
│ ◷  │                                                            │
│    │                                                            │
├────┴────────────────────────────────────────────────────────────┤
│ CONNECTION ●   12 TRACKS   8 ASSETS   2 ALERTS                 │
└─────────────────────────────────────────────────────────────────┘
```

The map remains one of the most important parts of Sentinel, but it should stop being **the application itself**.

---

## 7. Application Shell

### 7.1 Activity Bar

The leftmost Activity Bar should contain permanent application modules.

Recommended initial modules:

- Home / Situation;
- Map;
- Tracks;
- Sensors;
- Command Picture;
- Timeline;
- Reports / Events;
- Settings.

Selecting an Activity Bar item should change the available workspace or sidebar context. It should not necessarily replace the entire application.

### 7.2 Contextual Toolbars

Map manipulation tools should remain separate from application navigation.

Possible map tools:

- Select;
- Pan;
- Area Select;
- Measure;
- Draw;
- Marker;
- Recenter.

This distinction should remain visually clear:

- **Activity Bar:** what part of Sentinel the user is working in;
- **Tool Bar:** what action the user can perform inside the current view.

### 7.3 Status Bar

A compact status area can surface persistent system-level information such as:

- connection state;
- current mission;
- current time / replay time;
- track count;
- asset count;
- alerts;
- simulation state where relevant.

The status bar should remain concise and should not become another analytics dashboard.

---

## 8. Workspace System

The workspace manager should be a first-class subsystem of Sentinel v3.

### 8.1 Level 1 — Tabs

Examples:

```text
[Tactical Map] [Command Picture] [Track H-17] [Timeline]
```

Views and entity inspectors should be openable as tabs.

### 8.2 Level 2 — Split Panes

Tabs should be splittable so users can compare views on one monitor.

```text
┌──────────────────────────┬───────────────────────────┐
│                          │                           │
│     TACTICAL MAP         │   VERTICAL PROFILE       │
│                          │                           │
├──────────────────────────┼───────────────────────────┤
│                          │                           │
│       TIMELINE           │      TRACK DETAILS       │
│                          │                           │
└──────────────────────────┴───────────────────────────┘
```

This is especially valuable for operators with large 1440p or 4K displays.

### 8.3 Level 3 — Detachable / Pop-Out Windows

A view should eventually support:

```text
Open
Open to Side
Pop Out to Window
Close
```

The detached window can then be moved to another monitor.

Example:

```text
MONITOR 1                MONITOR 2               MONITOR 3

┌──────────────┐         ┌──────────────┐        ┌──────────────┐
│ Tactical Map │         │ Command      │        │ Cesium 3D    │
│              │         │ Picture      │        │ Environment  │
└──────────────┘         └──────────────┘        └──────────────┘
```

### 8.4 Hackathon Scope

Do **not** build a complete desktop window manager during the hackathon.

The target should be:

1. working tabs;
2. working split panes;
3. one convincing pop-out-window proof of concept.

Full workspace persistence, multi-monitor restoration, complex cross-window lifecycle handling, and arbitrary docking can come later.

### 8.5 Saved Workspaces — Future

Saved layouts should eventually support role- or task-specific configurations.

Examples:

```text
Counter-UAS Operator
- Monitor 1: Tactical
- Monitor 2: Command Picture

Operations Lead
- Monitor 1: Tactical + Timeline
- Monitor 2: Fleet Overview
- Monitor 3: 3D

Briefing
- Monitor 1: Cesium
- Monitor 2: Timeline
```

This also creates a natural long-term mechanism for domain-specific layouts such as an HADR workspace.

---

## 9. Geospatial Architecture

Sentinel v3 should retain both **MapLibre GL JS** and **CesiumJS** because they solve different operator problems.

### 9.1 Shared Geospatial Principle

MapLibre and Cesium must render the same Sentinel world.

There must not be:

- a separate Cesium mission;
- a separate MapLibre mission;
- duplicate track stores;
- renderer-owned mission state.

Instead:

```text
                 Sentinel World State
                        │
             ┌──────────┴───────────┐
             │                      │
             ▼                      ▼
         MapLibre                 Cesium
             │                      │
      tactical symbol           3D entity
      track history             3D trajectory
      2D zones                  3D volumes
      concise labels            physical altitude
```

---

## 10. Tactical View — MapLibre GL JS

The Tactical View should be the primary routine C2 representation.

Its purpose is:

- macro situational awareness;
- low visual clutter;
- fast comprehension;
- track and asset monitoring;
- mission-zone awareness;
- assignment/status understanding;
- tactical symbology.

The basemap should intentionally suppress information that does not help the operator.

Recommended map styling behaviour:

```text
roads               subtle
minor roads         hidden where possible
shops / POIs        hidden
terrain texture     minimal
buildings           simplified
water               dark
land                muted
boundaries          subtle
place names         selective

friendly assets     prominent
hostile tracks      prominent
sensor zones        prominent
mission zones       prominent
trajectories        prominent
alerts              prominent when relevant
```

The operational overlays should dominate the visual hierarchy; the basemap should recede.

---

## 11. 3D Real-World View — CesiumJS

The Cesium view exists to restore physical context that the tactical map deliberately abstracts away.

Its purpose includes:

- satellite-like geographic context;
- terrain;
- elevation;
- buildings;
- altitude;
- spatial relationships that are difficult to understand in 2D;
- physical inspection;
- briefing and demonstration.

The view should help users understand questions such as whether a track is:

- behind or between buildings;
- above open terrain;
- near important infrastructure;
- behind a ridge;
- moving along a valley;
- operating over dense vegetation;
- vertically separated from another track.

The 3D mode should be useful because of the **information it adds**, not simply because it looks impressive.

---

## 12. Tactical ↔ 3D Continuity

The Tactical and 3D views should feel like two render modes of the same operational picture.

A prominent mode switch should be placed directly over or above the map:

```text
[ TACTICAL ] [ 3D ]
```

The switch should not live deep inside Settings or the general Activity Bar because it changes the **representation of the current map**, not the application module.

When the user changes mode:

- selected entities remain selected;
- mission state remains unchanged;
- relevant trajectories remain visible;
- zones remain logically equivalent;
- current time / replay time remains unchanged;
- filters remain unchanged where applicable;
- the camera should move to an equivalent operational area;
- the user should not be reset to a generic global view.

Example:

```text
2D Tactical
      │
      │ H-017 selected
      ▼
[ switch 3D ]
      │
      ▼
Cesium focuses on H-017
      │
      ├── H-017 remains selected
      ├── I-04 remains visible
      ├── trajectory remains visible
      └── mission context remains unchanged
```

The reverse transition should work as well.

---

## 13. Tactical and 3D as Independent Workspace Views

Sentinel should support **both** of the following behaviours:

1. a normal Map workspace where Tactical and 3D are mode switches;
2. separate Tactical and 3D tabs/windows when the user wants simultaneous views.

This allows:

```text
Monitor 1 → Tactical Map
Monitor 2 → Cesium 3D
```

without forcing every user into two open renderers at all times.

---

## 14. Cross-Renderer Representation Rules

The same operational concept may be represented differently depending on the renderer.

| Information | Tactical MapLibre View | Cesium 3D View |
| --- | --- | --- |
| Friendly asset | Tactical symbol | 3D model or 3D-aware icon |
| Hostile UAS | Threat symbol | 3D UAS/icon |
| Position | Lat/lon position | Lat/lon/altitude |
| Altitude | Label / status | Physical height |
| Track history | Polyline | 3D trajectory |
| Predicted trajectory | Dashed line | 3D projected path |
| Assignment | Relationship indicator | Corresponding 3D relationship |
| Defended area | Polygon | Ground area / 3D volume |
| Geofence | Polygon | 3D volume |
| Sensor coverage | Circle / sector | 3D volume where useful |
| Waypoints | Symbols | Altitude-aware waypoints |
| Critical infrastructure | Symbol / area | Physical environment |
| Alerts | UI overlays | UI overlays |

The operator should learn one entity model and one symbology language even though the visual expression changes.

---

## 15. Command Picture

The Command Picture should be an analytic workspace rather than a static dashboard page.

It exists primarily for senior commanders and operations leads who need a high-level, quantitative understanding of the mission.

Recommended initial analytic lenses:

```text
COMMAND PICTURE
│
├── Operational Overview
├── Vertical Engagement Profile
├── Timeline
├── Resource / Fleet Overview
├── Sensor / Track Confidence
├── Coverage
├── Comparative Analysis
└── Mission Metrics
```

Each view should answer a clear operational question.

---

## 16. Vertical Engagement Profile

The Vertical Engagement Profile should be treated as a first-class visualisation in Sentinel v3.

Its purpose is to communicate altitude and vertical separation more clearly than a 3D scene can in many situations.

```text
ALTITUDE

1200 m ┤                         ● T-03
       │                      ⋰
1000 m ┤                   ⋰
       │                ● T-01
 800 m ┤
       │                     ▲ I-04
 600 m ┤              ▲ I-02
       │
 400 m ┤
       │
   0 m ┼──────────────────────────────────
           0        1        2        3 km
```

The principle is:

> **Do not use 3D merely because the underlying data is 3D. Use the representation that communicates the relationship most clearly.**

The profile should eventually support:

- selected tracks;
- altitude;
- relative horizontal distance;
- trajectories;
- selected mission area;
- time/replay position.

It should be openable as:

- a Command Picture card;
- a workspace tab;
- a split-pane view;
- a pop-out window.

---

## 17. Timeline and Replay UX

Time should be treated as a first-class part of the Sentinel state model.

A basic timeline may show:

```text
20:31 ───── 20:32 ───── 20:33 ───── 20:34 ───── 20:35

  ● Detection
       ● Track confirmed
             ▲ Asset assigned
                    ● Status changed
                           ▲ Operator action
```

Longer term, the timeline should support scrubbing so the user can ask:

> **What did Sentinel believe at this point in time?**

When replay time changes, all compatible views should reconstruct the same mission moment:

- Tactical Map;
- Cesium 3D;
- Vertical Profile;
- Command Picture;
- entity inspector;
- timeline/event context.

Replay should not be a separate visualisation stack. It should reuse the same workbench views against a historical time cursor.

---

## 18. Fleet / Resource Overview

The Command Picture should favour aggregation over long lists of individual assets.

Example:

```text
INTERCEPTOR FLEET

Available            18
Assigned               7
Unavailable            2
Returning              3
────────────────────────
Total                  30
```

The key question is:

> **How healthy is the system overall?**

Detailed values for individual assets belong in detail-on-demand inspectors rather than the primary command-level view.

---

## 19. Sensor / Track-Confidence View

A future Sensor / Track-Confidence view can help explain why Sentinel believes a track exists.

Example:

```text
TRACK H-17

RADAR        █████████░
EO           ███████░░░
RF           ████░░░░░░
THERMAL      ██████░░░░

FUSED CONFIDENCE
█████████░  91%
```

For Sentinel v3, this visualisation may remain partly conceptual unless the available data supports it.

The frontend architecture should, however, allow confidence and provenance to be displayed without forcing those concepts into the map renderer itself.

---

## 20. Comparative Charts and Radar Charts

Radar charts may be useful when comparing a small number of entities across the same dimensions.

They should be used selectively.

For precise comparison:

- bars;
- tables;
- lines;
- scatter plots

are often clearer.

Radar charts are more appropriate for gestalt comparison across a small set of shared dimensions.

The Command Picture should prioritise **clarity over visual novelty**.

---

## 21. Detail on Demand

The macro view should remain clean.

Selecting an entity should first reveal a concise summary rather than a permanent large panel.

Example:

```text
┌───────────────────────────┐
│ H-17                      │
│ HOSTILE TRACK             │
│                           │
│ Altitude        782 m     │
│ Speed           31 m/s    │
│ Confidence      91%       │
│                           │
│ Assigned        I-04      │
│                           │
│ [Open Details]            │
└───────────────────────────┘
```

`Open Details` should create an inspectable workspace item:

```text
[Tactical Map] [H-17 ×]
```

This allows the map to remain uncluttered while deeper information remains readily accessible.

---

## 22. Shared Domain Model

Sentinel should define its own internal domain model.

Renderer-specific objects, API response objects, and simulation-specific objects should be converted into Sentinel domain entities through adapters.

Recommended reusable concepts:

- `Entity`;
- `Track`;
- `Asset`;
- `Sensor`;
- `Zone`;
- `Task`;
- `Event`;
- `Mission`.

A simplified track model might resemble:

```ts
interface Track {
  id: string;
  affiliation: "friendly" | "hostile" | "neutral" | "unknown";
  classification: string;

  position: {
    latitude: number;
    longitude: number;
    altitudeM: number;
  };

  velocity?: {
    speedMps: number;
    headingDeg: number;
    verticalSpeedMps?: number;
  };

  confidence?: number;
  status: string;
  lastUpdated: string;

  source: {
    type: string;
    sourceId?: string;
  };

  attributes?: Record<string, unknown>;
}
```

The final model can evolve, but the separation of concerns should remain.

---

## 23. Domain Generalisation

Avoid designing the UI around permanent types such as:

```text
EnemyDrone
InterceptorDrone
Radar
```

at the platform level.

Prefer reusable concepts:

```text
Entity
Asset
Track
Sensor
Zone
Task
Event
```

Counter-UAS may interpret them as:

```text
Track:
    hostile drone

Asset:
    interceptor

Task:
    investigate / intercept
```

A future HADR module may interpret them as:

```text
Track:
    survivor / incident

Asset:
    search drone / ambulance

Task:
    search / inspect / deliver aid
```

This is a deeper form of modularity than simply changing icons.

---

## 24. Coordinate, Altitude, Unit, and Time Conventions

Sentinel v3 should standardise coordinate and time conventions early.

Recommended internal defaults:

| Concept | Internal convention |
| --- | --- |
| Latitude / longitude | WGS84 decimal degrees |
| Altitude | metres |
| Speed | metres per second |
| Heading | degrees true |
| Timestamp | UTC |
| Identifiers | persistent unique IDs |
| Display units | converted in the presentation layer |

Altitude semantics must be explicit.

The system should distinguish where relevant between:

- altitude above ellipsoid;
- altitude above mean sea level;
- altitude above ground level.

A renderer should never need to guess what an altitude value means.

The submitted red-team simulation contract uses altitude in metres above mean sea level; the simulation adapter should translate this into the Sentinel domain model with the reference preserved.

---

## 25. State Architecture

Sentinel should separate several kinds of state.

### 25.1 Authoritative Mission State

Owned by the backend.

Examples:

- mission lifecycle;
- authoritative entities/tracks;
- simulation/replay state;
- mission events;
- accepted operator commands.

### 25.2 Client Operational State

A frontend representation of the backend world state.

Examples:

- currently loaded entities;
- derived indexes;
- current mission;
- current/replay time;
- recent events.

### 25.3 Workspace / UI State

Owned by the frontend.

Examples:

- open tabs;
- split layout;
- active Activity Bar module;
- selected entity;
- open inspectors;
- filters;
- detached windows;
- map mode;
- local panel sizes.

### 25.4 Renderer State

Kept isolated from the domain model.

Examples:

- MapLibre map instance;
- Cesium viewer instance;
- camera objects;
- renderer-only handles;
- WebGL resources.

Renderer state must never become the source of truth for mission state.

---

## 26. Update Frequency and Rendering

Telemetry or simulation data may update more frequently than the rest of the UI needs to rerender.

The architecture should allow:

```text
High-frequency updates
        │
        ▼
World-state / interpolation layer
        │
        ├── map animation
        ├── Cesium animation
        └── lower-frequency UI updates
               │
               ├── tables
               ├── metrics
               └── charts
```

This prevents unnecessary React rerenders and keeps the workbench responsive as the number of views grows.

For the hackathon, avoid premature optimisation, but preserve the separation so performance can be improved later without redesigning the application.

---

## 27. Simulation Integration — Compatibility Adapter

`RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md` is an **external compatibility contract** for the hackathon.

Sentinel v3 should support it exactly at the integration boundary, but the submitted schema should not become Sentinel's internal domain model.

```text
RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md
                │
                ▼
        Simulation Adapter
                │
                ▼
       Sentinel Domain Model
                │
      ┌─────────┼──────────┐
      │         │          │
      ▼         ▼          ▼
  MapLibre    Cesium    Command Picture
      │         │          │
      └─────────┼──────────┘
                │
             Timeline
```

### 27.1 Concepts to Carry into Sentinel

The integration should preserve the concepts of:

- mission identity;
- simulated/replay source mode;
- time-indexed state;
- simulation lifecycle;
- command acknowledgements;
- geographic area and altitude band;
- interaction events;
- replay frames.

### 27.2 Concepts That Stay Inside the Simulation Service

The following should remain implementation details of the simulation contract:

- probability-resolution logic;
- deterministic SHA-256 draw construction;
- health-resolution mathematics;
- exact interaction-radius logic;
- calibration-rule completeness;
- location-grid calculations;
- exact HTTP validation behaviour;
- golden fixtures;
- negative-test matrix;
- calibration governance.

The UI may display results from these systems, but it should not reproduce their logic.

---

## 28. Simulation-to-Sentinel Mapping

The submitted simulation model contains simulation-specific fields such as:

```text
RED / BLUE / NEUTRAL / UNKNOWN
Drone Class I / II / III
health
```

The adapter should map those into more general Sentinel concepts.

Example:

```text
RED      → hostile
BLUE     → friendly
NEUTRAL  → neutral
UNKNOWN  → unknown

health   → simulation-specific attribute
class    → classification metadata
```

`health` should not become a universal Sentinel field because other domains may have completely different metrics.

Instead, domain-specific information should be carried through generic or typed attributes.

---

## 29. Simulation Lifecycle in the UI

The submitted simulation contract defines:

- `START`;
- `HOLD`;
- `RESUME`;
- `ABORT`.

Sentinel should expose these as user-visible states and controls where relevant.

Example:

```text
SIMULATION
────────────────────
● RUNNING

[ Hold ] [ Abort ]
```

or:

```text
Ⅱ HELD

[ Resume ] [ Abort ]
```

The frontend should request the transition and wait for an authoritative backend acknowledgement.

It should not independently decide whether a lifecycle transition is valid.

---

## 30. Mission Events and Replay Frames

The simulation adapter should convert external simulation outputs into generic Sentinel events.

A simplified internal event shape might resemble:

```ts
interface SentinelEvent {
  id: string;
  missionId: string;
  timestamp: string;
  type: string;

  entities: string[];

  location?: {
    latitude: number;
    longitude: number;
    altitudeM?: number;
  };

  source: {
    type: string;
    sourceId?: string;
  };

  data?: Record<string, unknown>;
}
```

The same event model should be usable by:

- Timeline;
- map indicators;
- entity history;
- Command Picture statistics;
- notifications;
- replay.

---

## 31. Backend Architecture

For the hackathon, the recommended split is:

```text
Frontend
────────────────────────────
React
TypeScript

MapLibre GL JS
CesiumJS
Command Picture
Workspace manager

            REST / WebSocket
                    │
                    ▼

Backend
────────────────────────────
Python
FastAPI
Pydantic

Mission service
Replay service
Simulation integration
Event/state distribution
```

Python is a good fit for the backend because it is efficient for rapid hackathon development and integrates naturally with simulation, data-processing, and future autonomy work.

TypeScript should remain the primary browser language.

There is no requirement for the entire stack to use one language.

---

## 32. API and Contract Strategy

Avoid defining the same API structures independently in Python and TypeScript.

A shared contract layer should be used where practical.

Possible structure:

```text
contracts/
├── simulation/
│   ├── v1.schema.json
│   └── README.md
│
└── sentinel/
    ├── events.schema.json
    └── world-state.schema.json
```

The frontend and backend can then validate or generate types against shared schemas.

For the hackathon, OpenAPI generated from FastAPI/Pydantic can also provide a practical starting point.

---

## 33. Project Structure

A feature-oriented structure is preferable to a conventional page-oriented application.

Recommended direction:

```text
sentinel/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── shell/
│   │   │   ├── providers/
│   │   │   └── routing/
│   │   │
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   ├── tracks/
│   │   │   ├── assets/
│   │   │   ├── sensors/
│   │   │   ├── missions/
│   │   │   ├── zones/
│   │   │   └── events/
│   │   │
│   │   ├── features/
│   │   │   ├── tactical-map/
│   │   │   ├── 3d-map/
│   │   │   ├── command-picture/
│   │   │   ├── vertical-profile/
│   │   │   ├── timeline/
│   │   │   ├── track-inspector/
│   │   │   └── workspace/
│   │   │
│   │   ├── adapters/
│   │   │   └── simulation/
│   │   │
│   │   ├── components/
│   │   │   └── shared/
│   │   │
│   │   ├── state/
│   │   ├── services/
│   │   └── styles/
│   │
│   └── public/
│
├── backend/
│   ├── api/
│   ├── missions/
│   ├── events/
│   ├── replay/
│   └── simulation/
│
├── contracts/
│   ├── simulation/
│   └── sentinel/
│
└── docs/
    ├── Sentinel_v3.md
    └── RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md
```

This structure reinforces the idea that Tactical Map, 3D Map, Timeline, Vertical Profile, and Command Picture are peer features of one workbench.

---

## 34. Multi-Window State Synchronisation

Detached windows should not maintain independent copies of mission state.

Conceptually:

```text
                      SERVER
                        │
                  World State
                        │
                WebSocket / API
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     Monitor 1      Monitor 2     Monitor 3
     Tactical       Command        Cesium
       Map          Picture         3D
```

For local UI coordination, a browser mechanism such as `BroadcastChannel` can be used where useful.

The backend remains authoritative.

Detached windows are additional projections of the same mission.

---

## 35. Renderer Lifecycle and GPU Use

MapLibre and Cesium are both substantial WebGL renderers.

When only one map mode is active, the hidden renderer should not continue consuming significant GPU resources unnecessarily.

Default behaviour should be closer to:

```text
TACTICAL selected
MapLibre     ACTIVE
Cesium       suspended / unmounted
```

and vice versa.

When a user explicitly opens both views on different panes or monitors, both renderers can remain active.

Because operational state exists outside the renderers, destroying and recreating one renderer should not destroy the mission state.

---

## 36. Map-Provider Abstraction

Sentinel should not be architected as:

> a Google Maps application

or:

> a Cesium ion application.

Instead:

```text
                     SENTINEL
                         │
                  rendering engines
                  ┌──────┴──────┐
                  │             │
               Cesium        MapLibre
                  │             │
             data providers   tiles
                  │             │
         ┌────────┼──────┐      │
         │        │      │      │
       hosted   Cesium   self   OSM /
       tiles     ion     host   PMTiles
```

For the hackathon, high-quality hosted data is sensible.

The application architecture should still allow later substitution with:

- self-hosted imagery;
- self-hosted terrain;
- vector tiles;
- PMTiles;
- MBTiles;
- locally hosted 3D Tiles.

This supports future offline/on-premises requirements without making them a current hackathon burden.

---

## 37. UI Design System

Sentinel v3 should preserve the strongest parts of the current visual direction:

- restrained dark palette;
- high map-to-chrome ratio;
- minimal decorative UI;
- compact top bar;
- left Activity Bar;
- map tools separated from navigation;
- clear active-state indication;
- small but readable typography;
- strong operations-software character.

The Tactical View should allow the map to recede behind operational information.

The 3D view should intentionally allow the environment to become more visually dominant because physical context is the reason that mode exists.

---

## 38. Design Tokens

Do not hard-code isolated colours and dimensions throughout the component tree.

Use semantic design tokens.

Example:

```css
--surface-base
--surface-raised
--surface-overlay

--border-subtle
--border-active

--text-primary
--text-secondary
--text-muted

--status-nominal
--status-warning
--status-critical

--track-friendly
--track-hostile
--track-neutral
--track-unknown
```

The same token system should drive:

- shell;
- tabs;
- sidebars;
- cards;
- maps;
- timeline;
- charts;
- detached windows.

This makes the interface visually coherent and makes later domain reskinning easier.

---

## 39. Tactical Symbology and Accessibility

Do not encode operational meaning through colour alone.

Friendly, hostile, neutral, unknown, warning, and critical states should also differ by:

- geometry;
- iconography;
- labels;
- line treatment;
- pattern where appropriate.

This improves:

- readability;
- colour-vision accessibility;
- poor-display behaviour;
- projector use;
- screenshot readability;
- tactical clarity.

Sentinel should own the high-level symbology model rather than making MapLibre or Cesium-specific icons the domain model.

---

## 40. Desktop and Display Target

Sentinel v3 should be optimised primarily for a **desktop-class browser**.

Initial target assumptions:

- 1440p and 4K monitors;
- mouse and keyboard;
- multi-monitor use;
- dense but controlled information presentation.

Mobile and small-screen layouts are not a hackathon priority.

Tablet support can be considered later if an operational use case requires it.

---

## 41. Three Demonstration Environments

The dual-view architecture should continue to be tested against three different environment types.

### 41.1 Dense Urban — Singapore

Tactical mode can show:

- roads;
- zones;
- tracks;
- assets;
- critical infrastructure.

3D mode can demonstrate:

- high-rise buildings;
- urban canyons;
- rooftops;
- terrain;
- real city geometry.

This is the strongest environment for showing why a 3D button exists in an urban setting.

### 41.2 Desert — Mojave

Tactical mode can show:

- minimal map;
- terrain contours where useful;
- roads;
- mission zones;
- tracks.

3D mode can demonstrate:

- mountains;
- valleys;
- ridges;
- actual terrain;
- satellite imagery.

This shows that the 3D view is useful for terrain, not only buildings.

### 41.3 Tropical / Jungle

Tactical mode can show:

- simplified terrain;
- roads;
- rivers;
- zones;
- tracks;
- assets.

3D / real-world mode can show:

- satellite imagery;
- rugged terrain;
- rivers;
- settlements;
- vegetation appearance;
- physical geography.

The same Sentinel workbench should operate across all three without changing its fundamental architecture.

---

## 42. Canonical Hackathon Demo Flow

The team should define and repeatedly test one deterministic demo workflow.

A strong flow is:

1. A mission/scenario is loaded.
2. Tracks appear in the Tactical View.
3. The operator quickly understands the macro situation.
4. A relevant track is selected.
5. Sentinel shows a concise track summary and related assignment/state.
6. The operator switches to 3D.
7. Selection, mission state, time, trajectories, and relevant overlays persist.
8. The operator inspects the physical environment.
9. The Vertical Engagement Profile is opened.
10. The Command Picture shows aggregate mission state.
11. The Timeline shows how the situation developed.
12. A simulation lifecycle action such as `HOLD` visibly changes the mission state.
13. The backend acknowledges the state transition.
14. Replay demonstrates that the same workbench can reconstruct mission history.

This workflow demonstrates the most important Sentinel v3 ideas without requiring dozens of shallow features.

---

## 43. Hackathon Implementation Priorities

### 43.1 Must Work

1. **Shared operational state**
   - Every major view derives from one underlying world model.

2. **Tactical MapLibre view**
   - Clean, readable, and polished.

3. **Cesium 3D view**
   - Same entities and mission context as the Tactical View.

4. **Seamless Tactical ↔ 3D transition**
   - Selection, time, and mission context persist.

5. **Tracks / entities**
   - Selection and concise details.

6. **Command Picture**
   - At least two or three meaningful analytic widgets.

7. **Vertical Engagement Profile**
   - A strong signature visualisation.

8. **Timeline**
   - Even a simple implementation should be functional.

9. **Simulation compatibility adapter**
   - Submitted simulation contract is supported without leaking into Sentinel core.

### 43.2 Should Work if Time Permits

10. **Tab system**
11. **Split views**
12. **One working pop-out window**
13. **Basic replay scrubbing**
14. **One or more aggregate fleet/resource views**

### 43.3 Later

- full multi-window layout management;
- saved/restored workspaces;
- HADR implementation;
- plugin/module system;
- arbitrary user-built dashboards;
- advanced policy UI;
- deep micro-level operator interface;
- advanced sensor-fusion visualisation;
- offline/on-premises deployment;
- large-scale analytics requiring additional GPU visualisation layers.

---

## 44. Testing Strategy

Sentinel v3 should include a small but deliberate testing strategy.

### 44.1 Domain and Adapter Tests

Verify that:

- external simulation objects map correctly into Sentinel domain objects;
- simulation-specific fields remain contained within the adapter;
- affiliation mappings are deterministic;
- mission and timestamp identity are preserved.

### 44.2 Tactical ↔ 3D Continuity Tests

Verify that switching modes preserves:

- selected entity;
- mission ID;
- current/replay time;
- filters;
- trajectories;
- equivalent camera area;
- relevant zones.

### 44.3 Workspace Tests

Verify:

- opening tabs;
- closing tabs;
- splitting panes;
- moving views between panes;
- one pop-out window;
- selection consistency across simultaneous views.

### 44.4 Replay Tests

Verify that:

- timeline position controls all replay-compatible views;
- replay does not accidentally mutate the current operational store;
- the same recorded frame produces the same visual state.

### 44.5 Visual Regression / Interaction Tests

Where practical, automate checks for:

- workbench shell;
- Activity Bar;
- key map overlays;
- Command Picture cards;
- track inspector;
- Tactical/3D mode transition.

---

## 45. Performance Principles

For the hackathon, the expected scale is modest enough that MapLibre and Cesium should be sufficient without introducing an additional visualisation engine.

The architecture should nevertheless observe the following:

- avoid React-wide rerenders for every position update;
- keep renderer instances outside generic application state;
- use derived selectors rather than recomputing all aggregates;
- suspend or unmount inactive heavy renderers;
- avoid duplicate WebSocket subscriptions per pane where unnecessary;
- aggregate command-level data rather than rendering hundreds of unnecessary cards;
- keep large historical datasets out of the immediate render path.

`deck.gl` should not be added initially unless Sentinel later needs to visualise very large point sets, heatmaps, sensor detections, or historical datasets that MapLibre/Cesium do not handle efficiently enough.

---

## 46. Future Domain Extension — HADR

HADR should remain a **future platform example**, not a hackathon build target.

The architecture should make it possible for an HADR module to reuse the same workbench.

For example:

```text
Sentinel Core
│
├── Tactical Map
├── 3D Map
├── Timeline
├── Entity Browser
│
└── Domain Modules
      │
      ├── Counter-UAS
      │      ├── Vertical Profile
      │      └── Fleet Readiness
      │
      └── HADR
             ├── Casualty Overview
             └── Search Coverage
```

The hackathon should demonstrate counter-UAS deeply and communicate HADR primarily through architecture, slides, or a short conceptual demonstration rather than building a second shallow product.

---

## 47. Deferred Policy / Authority Layer

The policy/authority layer is not a current Sentinel v3 UI/UX priority.

It should remain a future system layer rather than being allowed to distract from:

- operational workbench quality;
- shared world state;
- Tactical/3D continuity;
- Command Picture;
- timeline;
- workspace behaviour;
- simulation integration.

The v3 architecture should not prevent a policy layer from being added later, but this guide does not prescribe its UI or implementation.

---

## 48. Definition of a Successful Sentinel v3 Foundation

Sentinel v3 should be considered architecturally successful if:

- the application behaves like one coherent workbench;
- the Tactical Map and Cesium view are clearly complementary;
- all important views consume the same world state;
- view switching preserves context;
- Command Picture visualisations feel like first-class operational tools;
- timeline and replay fit naturally into the same state model;
- tabs, splits, and pop-outs are possible without duplicating mission logic;
- the submitted simulation contract is supported through an adapter;
- counter-UAS implementation details do not permanently constrain the platform;
- the project structure makes future features easy to add without turning the codebase into a collection of unrelated pages.

The core product idea can be summarised as:

> **Sentinel is a modular operational workbench that transforms one shared world model into the representation most useful for the operator's current task.**

MapLibre answers:

> **Where is everything?**

Cesium answers:

> **What does the environment look like?**

The Vertical Profile answers:

> **What is happening vertically?**

The Timeline answers:

> **How did we get here?**

The Command Picture answers:

> **What is the overall state of the operation?**

---

# Recommended Technologies and Development Tools

The following are specific recommendations for Sentinel v3. They are **recommended defaults**, not immutable architectural requirements. Where a library is listed as "evaluate", test it against the actual Sentinel interaction model before committing.

## R1. Core Frontend

### React + TypeScript — Recommended

Use React and TypeScript as the primary frontend stack.

Reasons:

- suitable for a modular component/workbench architecture;
- strong ecosystem for maps, charts, docking layouts, and state management;
- TypeScript helps formalise Sentinel domain and adapter boundaries;
- works naturally with MapLibre and Cesium.

### Vite — Recommended

Use Vite for the frontend development/build environment unless the existing project has a strong reason not to.

It is appropriate for a hackathon because it keeps local development and configuration lightweight.

---

## R2. Geospatial

### MapLibre GL JS — Recommended

Use for:

- Tactical View;
- custom vector-map styling;
- zones;
- tracks;
- trajectories;
- tactical overlays.

### CesiumJS — Recommended

Use for:

- 3D terrain;
- 3D Tiles;
- satellite/real-world context;
- altitude-aware entities;
- physical environment inspection.

### PMTiles / self-hosted tiles — Future Option

Do not prioritise this for the hackathon, but preserve the option for later offline/on-premises deployments.

### deck.gl — Do Not Add Initially

Only evaluate later if Sentinel needs very large GPU-accelerated point/heatmap/trajectory visualisations beyond what MapLibre and Cesium comfortably provide.

---

## R3. State Management

### Zustand — Recommended

Use Zustand for client/workspace state unless the team already has a strong Redux preference.

Good candidates for Zustand state include:

- selected entities;
- current workspace;
- tabs;
- pane layout;
- filters;
- current map mode;
- local UI settings.

Keep authoritative mission state on the backend.

Avoid storing raw MapLibre or Cesium instances in generic serialisable world-state objects.

### TanStack Query — Evaluate

Useful if Sentinel develops significant request/response server-state workflows in addition to WebSocket-driven state.

It is less important if nearly all mission data comes through one persistent event stream.

---

## R4. Charts and Command Picture

### Apache ECharts — Recommended

Use as the default Command Picture charting system.

Suitable for:

- line charts;
- scatter plots;
- radar charts;
- fleet/resource charts;
- mission metrics;
- vertical-profile prototypes;
- interactive tooltips and selection.

Using one strong charting system is preferable to introducing separate libraries for every analytic view.

---

## R5. UI Primitives and Styling

### Radix UI — Recommended

Use low-level accessible UI primitives for:

- dialogs;
- menus;
- dropdowns;
- tooltips;
- popovers;
- context menus;
- tabs where appropriate.

This allows Sentinel to retain a custom visual identity rather than inheriting a generic dashboard theme.

### Tailwind CSS — Recommended if the Team Is Comfortable With It

Use for rapid layout and styling while keeping semantic design tokens in CSS variables.

Do not let utility classes replace the design-token layer.

### Lucide — Recommended

Use as a general-purpose interface icon set for application chrome.

Operational/tactical symbology should remain Sentinel-owned and should not rely solely on generic interface icons.

---

## R6. Tables and Entity Browsing

### TanStack Table — Recommended

Useful for:

- track tables;
- asset lists;
- mission-event lists;
- sortable/filterable entity views.

It provides table behaviour without forcing Sentinel into a particular visual design.

---

## R7. Workspace / Docking

### FlexLayout React — Evaluate First

A strong candidate for:

- tabs;
- split panes;
- movable views;
- docking layouts.

Test it against Sentinel's desired workbench behaviour before building a custom layout system.

### Golden Layout — Evaluate as Alternative

Compare against FlexLayout if pop-outs, docking behaviour, or multi-window interactions are better aligned with the desired UX.

### Recommendation

Do not build a complete docking framework from scratch during the hackathon.

Choose the library that gets closest to:

```text
tabs → split panes → one convincing pop-out
```

with the least custom infrastructure.

---

## R8. Backend

### Python + FastAPI — Recommended

Use for:

- REST endpoints;
- WebSocket endpoints;
- mission state;
- replay;
- simulation adapter/service integration;
- event distribution.

### Pydantic — Recommended

Use for backend validation and typed API models.

Keep the simulation compatibility schema separate from the internal Sentinel domain model.

---

## R9. Contract Management

### OpenAPI + JSON Schema — Recommended

Use a shared contract approach so TypeScript and Python do not drift apart.

Possible workflow:

```text
Pydantic / FastAPI
        │
        ▼
     OpenAPI
        │
        ▼
generated TypeScript client/types
```

For contracts that must remain stable independently, maintain explicit JSON Schema files.

---

## R10. Multi-Window Communication

### BroadcastChannel — Recommended for Local Coordination

Useful for:

- detached-window UI state;
- selection synchronisation;
- local workspace communication.

Do not treat it as the authoritative mission-state transport.

Each window should still ultimately derive operational state from the same backend source.

---

## R11. Testing

### Vitest — Recommended for Frontend Unit Tests

Use for:

- adapters;
- selectors;
- state logic;
- domain transformations.

### React Testing Library — Recommended

Use for component behaviour rather than implementation-detail testing.

### Playwright — Recommended for Critical End-to-End Flows

Especially valuable for:

- Tactical → 3D transitions;
- tab/split behaviour;
- mission loading;
- replay;
- pop-out proof of concept;
- major demo workflow.

---

## R12. Development Workflow

### Storybook — Evaluate

Useful if the team is building many reusable workbench components and wants to develop them outside the full map environment.

Potential candidates:

- track cards;
- entity inspectors;
- command cards;
- status badges;
- timeline events;
- workspace chrome.

Do not spend hackathon time building a large Storybook catalogue unless it is actively helping development.

### ESLint + Prettier — Recommended

Keep formatting and common code-quality checks automated so the team does not waste time on style disputes.

### Git Feature Branches / Small Pull Requests — Recommended

The workbench architecture has multiple independent feature areas. Keep changes isolated enough that Tactical Map, Cesium, Timeline, Command Picture, and workspace work can proceed in parallel.

---

## R13. Suggested Initial Technology Stack

If starting Sentinel v3 today, the recommended initial stack is:

```text
FRONTEND
React
TypeScript
Vite
Zustand

MapLibre GL JS
CesiumJS
Apache ECharts

Radix UI
Tailwind CSS
Lucide
TanStack Table

FlexLayout React or Golden Layout
(after a short evaluation)

BACKEND
Python
FastAPI
Pydantic

TRANSPORT
REST
WebSocket

CONTRACTS
OpenAPI
JSON Schema

TESTING
Vitest
React Testing Library
Playwright
```

The stack should stay intentionally restrained.

The objective is not to maximise the number of technologies used. The objective is to give Sentinel v3 a clear architecture that can be built quickly for the hackathon and extended without a rewrite afterward.
