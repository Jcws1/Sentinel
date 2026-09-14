# M1.1 operator entry

Start the backend with `SENTINEL_DEMO=1` (and optionally the original `SENTINEL_FIXTURES=1`), then `npm run dev`. Tracks provides All entities / Fleet modes and Simulation controls. Fleet filters only the table; opposing Entities stay on both maps. Shared search and categorical filters continue to affect all views.

The shared application runtime is the sole command, lease-renewal and transport owner. It saves an exact pending request before sending and keeps private credentials in separate session storage. An unknown result offers Reconcile request and Retry saved request; reload does not automatically resend. Requests require working session storage. Run state shown with entities comes from the complete committed frame; separate HTTP ownership/status cannot move a symbol or overwrite a frame.

Current generated contracts come from `contracts/sentinel/v1.1/`. Run `npm run contracts:check`, `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2`, `npm run build`, `npm run build:test`, then `npm run test:browser`. The M1.1 browser tests include actual elapsed pauses/lease expiry and save screenshots in `docs/m1.1/evidence`. Network traces are disabled for these tests to keep authority headers out of trace archives. [Review and limitations](../docs/m1.1/REVIEW.md).

# Sentinel v3 workbench â€” entity browsing and observed trails

This package provides the approved compact shell, one shared backend runtime, Tactical MapLibre and Cesium views, Tracks browsing, contextual summaries, pinned entity inspectors and bounded recorded movement trails. Operational analytics, simulation commands and replay playback remain deferred. See the [Phase 3B review](../docs/phase3b/REVIEW.md), [current implementation plan](../docs/IMPLEMENTATION_PLAN.md) and [map account/configuration handoff](../docs/MAP_SERVICES_SETUP.md).

## Run

Use Node 24 (verified with 24.20.0) and npm. In this directory:

```powershell
npm ci
npm run dev
```

Open <http://127.0.0.1:5180>. Navigation opens or focuses the primary instance of each registered view. Right-click a tab, or focus it and press **Shift+F10 / Context Menu**, for **Open to Side**, **New Tactical pane** (map tabs) and **Close view**. These actions target the invoking tab even when it is inactive. The Views list also retains its options menus. Drag tabs to reorder or arrange panes; drag or keyboard-focus a divider to resize it. Close a tab with its normal close affordance and reopen the primary view from the Activity Bar or Views list. The keyboard button documents supported workspace shortcuts.

Start the backend separately using [backend instructions](../backend/README.md). The Vite server proxies `/api` and WebSockets to `http://127.0.0.1:8000`; `SENTINEL_API_TARGET` overrides that local development/preview target. A deployed server would need the same-origin proxy configured separately. Opening the shell alone does not create a backend connection. In the header, choose **Missions > No mission â†’ Synthetic Tactical**. The same dropdown switches or unloads missions; the compact SYNTHETIC tag identifies fixture content. Alpha and Bravo remain available unchanged for the Phase 2 foundation checks. Backend loss retains a visibly stale complete frame until a fresh snapshot succeeds. Errors and retry are available beside the breadcrumb and in its menu.

Fixture advancement is intentionally absent from the normal UI. Automated tests and explicit developer checks use the existing guarded backend endpoint: read `GET /api/missions/fixture-tactical/world`, then `POST /api/fixtures/fixture-tactical/advance` with `{ "expectedSequence": <the returned sequence> }`. It commits the next deterministic synthetic sample. The browser never advances fixtures automatically; see the [runbook](../docs/demo-runbook.md) for a PowerShell example.

Inside Tactical, **Select** picks symbols, **Pan** drags without selecting, and **Recenter** explicitly frames currently visible objects/zones, falling back to a supplied mission reference point. Ordinary data updates do not refit the camera. **Map layers** toggles zones and last-known observations through the shared session, so simultaneous panes agree. Focus the map canvas: arrow keys pan, `+`/`âˆ’` zoom, `[`/`]` review visible symbols and Enter selects. Selection, frame and filters are shared; cameras remain independent. A missing selection remains labelled Unavailable, No position or Filtered instead of receiving a replacement point.

The initial workspace has Tactical Map and Command Picture tabs. Layout and camera bookmarks are in memory; refreshing returns to the initial workspace. This is a desktop shell with a minimum width of 760 CSS pixels, targeting 1440p/4K displays. Browser/OS scaling remains available; mobile layouts are outside this phase.

When an existing split arrangement exceeds the window's space, the workspace scrolls internally while preserving pane minima and arrangement. A compact **Scroll workspace** control appears only in that state. Use its arrows, native scrolling, or focus the Workspace panes region and use arrow keys; focusing a tab or control reveals it. Enlarging the window removes the extra control. This does not refit the map or change mission/camera ownership.

## Entity workflow (Phase 3B)

Load **Synthetic Observations** from the mission breadcrumb, then open **Tracks** from the Activity Bar. It contains six Entity rows, six source Tracks and one explicitly supplied Asset role; roles do not add rows. Search is shared across all views. Use sortable headings and **Shared entity filters** for affiliation, classification, observation, source and supplied zone scope; **Reset filters** clears the shared scope. Unknown measurements are Unavailable; zero is a supplied value.

Arrow/Home/End keys move row focus; Enter/Space selects. Selecting in either map or the table opens a compact summary. **Open Details** pins an inspector to that mission/entity; another selection does not change it. An inactive-mission inspector explains its identity and offers Load this mission. Missing/filtered/no-position selections stay explicit. Right-click the Details tab for Open to Side.

In F-01 Details choose **Show observed trail**, or enable **Observed trail** in either map's Layers menu. The backend seeded eight committed observations in three segments, with an explicit break and source change. Both maps share the same last-60-second displayed-track history. MSL geometry is marked approximate; unsupported historical AGL/datum positions receive no invented Cesium height. While a slower history read catches up, its actual through-time is shown. Retry history recovers a failed read without reloading the application. There are no replay controls or browser-generated movement.

Fixture changes remain behind the guarded developer/test HTTP interface described above. The new fixture's initial sequence is 7; the next explicit commit removes F-01's Tracks, and the following removes U-01's identity. Existing Alpha, Bravo and Tactical fixtures are preserved. Restart an existing backend to seed the new mission; persisted missions are not overwritten.

## Map providers and 3D

Tactical defaults to the reviewed local Southeast Asia vector/DEM pack. Run `npm run maps:setup -- C:\Archive\Coding\Sentinel2\public\edge-map` from this directory to prepare ignored assets. Missing packs use an explicitly labelled local grid. Building extrusions, hillshade, 1Ã— terrain relief and pitched/top-down views are available in Layers. [Regional setup and verified coverage](../docs/MAP_REFINEMENT_SETUP.md).

Set `VITE_TACTICAL_PROVIDER=maptiler` for the optional muted MapTiler Cloud `streets-v4` route. Paste the restricted browser key in ignored `frontend/.env.local`, following [.env.example](.env.example). A custom `VITE_TACTICAL_STYLE_URL` is optional. The key is propagated only to HTTPS resources on the exact `api.maptiler.com` host; unrelated hosts never receive it. Restart Vite or rebuild after changing these values. The local pack, not the hosted route, supplies the reviewed building/terrain controls.

The **Tactical / 3D** toolbar switch preserves a pane's stable identity and exchanges a neutral geographic camera bookmark. Simultaneous panes have independent cameras and the same shared mission, effective time, selection, filters and zone overlays. Cesium opens no backend subscription. Hidden/closed renderers are disposed, and reopening restores context. Map imagery, terrain, buildings and WebGL objects remain renderer-local.

Cesium ion defaults are Bing Aerial `2`, World Terrain `1`, OSM Buildings `96188`. Paste an `assets:read` token restricted to these assets and your app origins into `VITE_CESIUM_ION_TOKEN`; see [numbered account steps](../docs/MAP_SERVICES_SETUP.md). Missing credentials use a labelled local globe. Each failed layer falls back independently, with explicit retry. Do not claim that metadata readiness proves coverage.

Google Photorealistic 3D Tiles are an alternative in the 3D Layers menu. Configure `VITE_GOOGLE_MAPS_API_KEY` (Map Tiles API) or the optional ion asset 2275207. That base excludes separate imagery, terrain globe and OSM buildings. Failure restores standard services with an explicit fallback notice. Noon daylight is presentation-only; photographic shadows stay baked into the source. Authenticated ion and Google rendering in Singapore is recorded in [the refinement review](../docs/map-refinement/REVIEW.md).

MSL heights are explicitly approximate (`h â‰ˆ H`, zero geoid offset), not converted by a geoid model. AGL entities require a finite terrain sample. Original source measurements are preserved. Unresolved height bands show identified footprints, not invented volumes. This slice is not clearance/vertical-fidelity signoff. All Cesium workers/WASM/assets ship locally in `dist/cesium`; distribute the entire build.

The hosted Tactical provider boundary preserves source URLs and attribution while muting geography and removing decorative patterns, POIs, unreviewed 3D layers and unsupported effects. Relative sprite/glyph/tile resources resolve from the style URL. Loading and failure statuses are explicit; a failed provider falls back to the local grid with **Retry basemap**, preserving mission, selection and camera. Attribution from a functioning style stays visible. A synthetic test style verifies the boundary and failure flow, not MapTiler account access or real basemap quality. See [provider prerequisites and limits](../docs/demo-runbook.md).

An initial worker/resource timeout shows **RELOAD REQUIRED** and an explicit **Reload application** action. The engines' shared worker initialization can retain a failed initial handshake, so this path requires a fresh client session and loading the mission again after access is restored. Backend recordings remain intact. Recoverable renderer/context errors retain **Retry renderer** over a dark failure surface; ordinary provider outages use the local fallback without resetting the session.

MapLibre GL JS 6.9.0 is loaded on demand. Its worker is bundled with `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and registered with `setWorkerUrl`; a plain copied worker URL would omit its shared ESM dependency in production. [Official Vite integration](https://maplibre.org/maplibre-gl-js/docs/#installation). Tactical uses Mercator; polar points beyond Â±85.051129Â° are omitted with a notice, and antimeridian-spanning framing/filtering is not supported in this slice.

## Boundaries

| Module | Responsibility |
| --- | --- |
| `src/app/App.tsx` | Compact identity/mission header, module Activity Bar, Views list, menus, keyboard help, status bar. Local sidebar/dialog state is UI-only. |
| `src/app/WallClock.tsx` | Isolated, current UTC+8 wall clock. Never advances domain or replay time. |
| `src/main.tsx`, `src/app/runtime.ts` | Create one application-session runtime outside React/StrictMode and pane lifecycles. The runtime alone owns catalog requests, one current mission stream, recovery, publication and shared selection. |
| `src/contracts/` | Generated backend types plus JSON Schema and aggregate runtime validation. No independently handwritten domain model. |
| `src/state/worldStore.ts`, `src/state/sessionStore.ts` | Private backend-derived live cache versus client mission/selection/time/filter/zone-overlay intent. Only the runtime exposes immutable snapshots to views. |
| `src/world/` | Atomic delta construction, deep immutable copies, bounded separate historical cache and complete-frame presentation selection. Historical playback is not exposed in the shell. |
| `src/features/mission/` | Mission context/connection controls and truthful, minimal readouts in the existing placeholders. |
| `src/app/moduleRegistry.ts` | All nine requested modules; Map, Command Picture and Timeline open shell views. Other modules explicitly unavailable. |
| `src/features/workspace/viewRegistry.ts` | Six view kinds plus independently identified Tactical instances. No fake mission or entity IDs. |
| `src/features/workspace/workspaceBridge.ts` | The single FlexLayout `Model`, open/focus/close/open-to-side/add-map actions, per-view mission-tagged camera bookmarks, and bounded test pop-out/redock commands. |
| `src/state/workspaceStore.ts` | Private Zustand store of metadata derived from that model: open views, location, selected tab in each pane, active main-window view, revision. It contains no second layout tree. Only the bridge writes it. |
| `src/features/workspace/WorkspaceHost.tsx`, `TabContextMenu.tsx` | FlexLayout binding and tab-targeted context actions. Native drag/keyboard actions and menu commands update the same model and its change listener. |
| `src/features/workspace/PaneHost.tsx` | Operational map views or labelled placeholders, with mount/visibility/resize/disposal callbacks. DOM observation and animation frames are released on unmount. |
| `src/renderers/contracts.ts`, `scene.ts`, `symbology.ts` | Pure frame/session scene projection, stable object references, deterministic Track display choice, affiliation meaning and renderer-neutral camera intent. No operational store or renderer instance. |
| `src/renderers/camera.ts`, `providers.ts`, `maplibre/MapLibreAdapter.ts` | Geographic extent/span helpers, replaceable style/fallback boundary and local MapLibre resources/picking. The adapter never opens a backend stream. |
| `src/renderers/cesium/` | Local Viewer, symbol textures, zone geometry, provider resources, terrain samples and camera. Explicit altitude assumptions and configurable ion assets. No operational store or backend subscription. |
| `cesiumAssets.ts` | Package-owned Cesium workers/static assets served in development and copied into production; no CDN dependency. |
| `src/features/map/` | Compact map controls, shared selection/status, visibility-aware adapter ownership and map-specific styling. |
| `src/styles/index.css`, `src/styles/mission.css` | Neutral theme and layout; mission.css uses those tokens for the header breadcrumb and readouts. |

The [Phase 0 session/view contracts](../contracts/sentinel/session-view.ts) remain design records. Phase 2 promotes the operational boundaries in the runtime modules above. Workspace metadata stays a shell projection, separate from operational state. Later layout persistence should serialize the bridge's model at a save boundary, never maintain a second independently writable layout tree. `selectedInPane` is tab selection, not entity selection or proof of renderer visibility. Actual pane visibility comes from lifecycle callbacks.

Renderer resources belong in the mounted view's runtime, outside Zustand and layout JSON. `PaneLifecycleEvent` reports initial visibility, later visibility changes, coalesced size changes (including zero sizes), mount and disposal. The map observes its actual host size, reapplies the latest complete scene after style loading and releases its renderer when hidden or closed. Camera bookmarks carry only geographic intent and a mission tag. The session runtime survives pane open/close/remount; integration with operational pop-outs remains deferred.

## Verification

```powershell
npm run typecheck
npm run contracts:check
npm run lint
npm run format:check
npm test
npm run build
npm run build:verification
npm run test:browser
```

Browser tests use installed Microsoft Edge, start a fixture backend on 8011 and production previews on 5181/5182, and stop them afterwards. The Python environment must already be installed. The test recording database is retained in ignored `.cache/phase2-browser.sqlite3`; checks compare relative sequence changes or deliberately align the Tactical fixture stage. No browser download is needed on the tested Windows host. The probes run against built bundles and real MapLibre worker/source data. Tests write current review evidence under `../docs/chrome-refinement/evidence` (earlier phase evidence is retained); failed-run traces stay in ignored `test-results`. Map inspection/provider injection probes exist only in the verification build, with a separate normal-production test confirming their absence.

The **isolated** `tests/harness` entry owns a synthetic selection string, numeric time and a nominal 100 Hz counter. It imports the product shell but is excluded from normal `dist`. It neither implements operational stores nor connects to a backend. To inspect it manually, build verification and run `npm run preview:verification`, then open <http://127.0.0.1:5182/tests/harness/index.html>. Start/stop the update probe through `window.__workspaceTest.start()` / `.stop()` in that test page only.

The earlier `experiments/docking` package retains its own manifests, lockfile, two-library comparison and ECharts evidence. It is not an npm workspace, product dependency, TypeScript input or build entry. Run its commands from its own directory. This product uses FlexLayout 0.10.8 only; it does not depend on Golden Layout or ECharts.

## Bounded pop-out policy

Product pop-out controls are disabled. The verification harness alone opts in; `public/popout.html` is its inert, same-origin host document. The main window owns the model and synthetic context. A native child close runs `beforeunload`, and FlexLayout returns the view to an in-page floating panel. **Return to workspace** moves that view into the active main tabset, or the first/empty main tabset if its previous parent no longer exists. It selects/focuses the tab and removes the empty auxiliary layout. The same action works from the child window, and the view can be popped out again without duplication.

Returning does not promise the original tab index or split geometry. Closing the view's tab instead of its OS window closes the view; it can be reopened from navigation. Tabs keep stable IDs. Empty tabsets must have both `enableClose` and `enableDeleteWhenEmpty` enabled, otherwise FlexLayout 0.10.8 retains empty auxiliary panels/windows. Full independent-window lifecycles, opener loss, physical displays and real renderer resources in detached windows remain Phase 8.

See [Phase 1 review](../docs/phase1-review.md) for original shell evidence, [Phase 2 review](../docs/phase2-review.md) for authority/runtime acceptance and [Phase 3A review](../docs/phase3a-review.md) for the Tactical implementation's current acceptance status and limits.


## Visual refinement

The 32px header contains the supplied Sentinel logo/name, a quieter mission breadcrumb and a right-aligned UTC+8 clock. This follows the latest explicit UI-refinement request, superseding the previous identity/time-only header rule. The clock is a copyable wall-time value; it does not imply a loaded mission or advance mission time. All nine requested application modules appear in the 40px Activity Bar. Unimplemented modules are disabled and marked N/A, with a hover explanation. Map opens Tactical; Command Picture and Timeline open/focus their existing readout placeholders. The Views list retains access to all six view kinds, including 3D, Vertical Profile and Entity Inspector. Unfinished panes retain NOT IMPLEMENTED notices; Tactical's provider/data limitations are separately visible. The sidebar can be hidden without losing tabs or split arrangement. Map controls follow workspace tabs directly; the redundant pane heading is removed.

Chrome uses neutral selection washes, neutral edge indicators, compact rectangular controls and a near-black surface with a slight blue undertone. Saturated Tactical colours encode supplied affiliation, reinforced with shape and text; selection remains neutral. Ordinary workspace surfaces are opaque. Subtle translucency/blur applies only to small notices and selection content over the map. The original 1254px logo is unchanged; CSS removes excess surrounding space at display size and composites its opaque black background. Segoe UI is the available neutral font, with no claim of an exact reference match. Navigation and controls prevent text selection; genuine values remain selectable. Mission/frame timestamps remain separate from the wall clock.

The approved visual baseline is recorded under `docs/ui-refinement/` at repository root; Phase 2 and Phase 3A evidence are separate. Shell or scoped map approval does not certify unfinished operational features. Source specifications, archived Phase 0 drafts and the single FlexLayout authority remain intact. Promoted backend contracts are versioned in `contracts/sentinel/v1/`.
