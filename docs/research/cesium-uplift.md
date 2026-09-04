# Cesium uplift — what to take from Sandtable's pattern

> Written 2026-09-04. Codebase at commit `1b3556a` ("Sentinel v2: map, annotations and console
> shell"). External docs checked 2026-09-04, versions noted inline.
>
> Scope note: Sentinel has already adopted Cesium. This is not a "should we" question. It asks what
> the Sandtable stack (Mentat = CesiumJS browser planning surface; Navigator = Cesium for Unity 4D
> COA / rehearsal tool; Cesium ion underneath) delivers that Sentinel does not, the cost to close
> each gap, and a phased plan that lands safely before the **27 September 2026** pitch.

## 0. Bottom line

- Sentinel's map is a **one-commit-deep frontend scaffold** — `README.md:4-6` states "the visual
  and structural foundation only — no domain logic." There are **no tracks, no telemetry, no
  backend, no simulator, no timeline, and no Unity/Unreal code**. The only overlay that exists in
  either renderer is operator-drawn annotations.
- The two view modes are **not unified**. They share a data + interaction layer and **duplicate
  every draw call** — one MapLibre adapter, one CesiumJS adapter, mirrored feature-for-feature.
- Against the Sandtable pattern we **"don't have"** almost everything — but much of that is
  deliberately deferred domain work, not architectural debt. The useful question is which Sandtable
  capabilities are worth pulling into the 27 Sep demo and which are Sandtable solving a
  deliberate-planning / rehearsal problem a real-time counter-drone C2 demo does not have.
- Highest value ÷ cost for the demo: **MIL-STD-2525 symbology**, then **3D models / 3D-Tiles
  ingestion in Cesium**, then **point-to-point line-of-sight in photoreal mode**. Lowest:
  **4D scrub/replay**, **multi-user shared view**, **Cesium for Unity** — defer all three.
- Riskiest assumption to kill first: that the mirrored-adapter overlay pattern scales from "static
  annotations on a revision counter" to "30 moving symbols at 20 Hz in both renderers, from one
  shared store, with no React render per tick." A <1-day spike proves or kills it.

Inputs from Jason (2026-09-04): the demo shows **live tracks + effects** (domain logic lands before
the pitch); the demo **runs online** (offline `.pmtiles` is the deployment story); the **track
schema + transport has no owner yet**.

---

## 1. Inventory (Phase 1)

### 1.1 The two view modes — library, init, switching

| | Mode (a) simplified / vector | Mode (b) photorealistic |
|---|---|---|
| Renderer | **MapLibre GL JS 5.24.0** (`package.json:32`, lock 5.24.0) + **pmtiles 4.5.0** (`package.json:33`) | **CesiumJS 1.145.0** (`package.json:29`, lock 1.145.0) + Google Photorealistic 3D Tiles |
| Construct | `new maplibregl.Map({...})` — `src/map/MapCanvas.tsx:69-87`; empty style `{version:8,sources:{},layers:[]}`, camera from `HOME_CAMERA`, `maxPitch:75`, `keyboard:false` | `new Cesium.Viewer(container, {...})` — `src/map/photorealCesium.ts:110-131`; **every widget off** incl. `animation:false, timeline:false` (`:119-120`), `baseLayer:false`, `terrainProvider: new Cesium.EllipsoidTerrainProvider()` (`:130`), `scene.globe.show=false` (`:167`) |
| Basemap | style assembled by `buildMapStyle(pack, viewMode)` — `src/map/mapStyle.ts:251-297`; `pmtiles://` sources resolved by protocol handler registered at `src/map/MapCanvas.tsx:35-40` (`maplibregl.addProtocol('pmtiles', new Protocol().tile)`) | `await Cesium.createGooglePhotorealistic3DTileset({onlyUsingWithGoogleGeocoder:true})` — `src/map/photorealCesium.ts:176-180`; added `scene.primitives.add(tileset)` (`:195`); `maximumScreenSpaceError=8`, `cacheBytes=768 MB` (`:186-188`) |
| Container | `<div ref={containerRef}>` — `src/map/MapCanvas.tsx:373` | second `<div ref={cesiumContainerRef} style={{display:'none'}}>` — `src/map/MapCanvas.tsx:377-381` |
| Packs | `edge` (default, offline), `seasia` (offline), `terrain-free` (**online** — openfreemap + mapterhorn), `void`, `photoreal` — `src/map/sources.ts:170-288` | pack `photoreal`, `basemapStyle:null, terrain:null` — `src/map/sources.ts:256-274` |

- **deck.gl 9.3.11** is mounted as a MapLibre control — `new MapboxOverlay({interleaved:false, layers:[]})` at `src/map/MapCanvas.tsx:98-116` — but `layers` is **always `[]`** (`:113`, reset `:236`). It is the reserved seam for future track overlays; nothing renders through it. A former deck.gl `Tile3DLayer` photoreal renderer was removed for performance (`src/map/photoreal.ts:98-106`, `src/map/photorealCesium.ts:17-34`).
- **Credentials**: env vars `VITE_GOOGLE_MAPS_API_KEY`, `VITE_CESIUM_ION_TOKEN`, read at `src/map/sources.ts:98-99`, consumed `src/map/MapCanvas.tsx:194-195`, applied to Cesium at `src/map/photorealCesium.ts:90-96`. Route preflight `resolvePhotorealRoute()` — `src/map/photoreal.ts:54-96` — tries `GET tile.googleapis.com/v1/3dtiles/root.json?key=…` then `GET api.cesium.com/v1/assets/2275207/endpoint` with a bearer token; returns `'google-direct' | 'cesium-ion' | null`.
- **`.env` on disk contains real committed secrets** — `.env:4-5` (a Google API key and a Cesium ion JWT). `.env` is gitignored (`.gitignore:5`) but present in the working tree. → Open question 5.
- **Mode switch**: state in `mapViewStore` — `src/state/mapView.ts:25-33`. There is **no separate photoreal toggle** — photoreal is simply `pack === 'photoreal'`. UI `SourcePicker` (Radix ToggleGroup) — `src/views/MapView.tsx:108-136` → `setMapPack()`. Switch logic `applyStyle()` — `src/map/MapCanvas.tsx:175-304`, re-run on any `pack:mode` change via `subscribeSelector(mapViewStore, s => \`${s.pack}:${s.mode}\`, …)` (`:310-314`).
- **Teardown asymmetry**: Cesium's `Viewer` is **destroyed and recreated on every switch** — `teardownCesium()` calls `viewer.destroy()` unconditionally at the top of every `applyStyle()` run (`src/map/MapCanvas.tsx:144-148, 191`; `src/map/photorealCesium.ts:291-297`). MapLibre is **never torn down**, only hidden by toggling `visibility` / `display` (`src/map/MapCanvas.tsx:157-164`); `map.remove()` runs only on app unmount (`:130-136`). Vector→vector pack changes do a full `map.setStyle(style,{diff:false})` (`:271`), re-installing annotation layers on `style.load` (`:275-283`).

### 1.2 THE KEY QUESTION — one abstraction, or two implementations?

**Answer: a shared layer for *what a click means and what the geometry is*, plus two parallel
*drawing* implementations that mirror each other. There is no shared draw-call path.**

Shared, renderer-agnostic (`src/map/annotations/`, `src/state/`, `src/lib/`):

| Concern | File |
|---|---|
| Data model | `src/map/annotations/types.ts` (`Annotation`, `AnnotationDraft`, `MIN_VERTICES`) |
| Store + change signal | `src/state/annotations.ts` — monotonic `revision` counter both adapters subscribe to (`:29-37`) |
| Draw interaction rules | `src/map/annotations/drawController.ts` (`handleClick/handleMove/handleDoubleClick` over abstract events) |
| Edit interaction rules | `src/map/annotations/editController.ts` |
| Geometry + formatting | `src/lib/geo.ts` (haversine, bearing, spherical area; `[lng,lat]` degrees, WGS84) |
| Shared label/measurement text | `src/map/annotations/geojson.ts:21-40` `measurementFor()` |
| Cursor / tool mode | `src/map/cursorModes.ts` |

Duplicated, one per renderer:

| MapLibre — `src/map/annotations/maplibreAdapter.ts` | Cesium — `src/map/annotations/cesiumAdapter.ts` |
|---|---|
| 1 GeoJSON source + 4 style layers: `fill`/`line`/`circle`/`symbol` (`:61-156`) | `Cesium.Viewer.entities` Entity API: `PolygonGraphics`/`PolylineGraphics`/`PointGraphics`/`LabelGraphics` (`:105-319`) |
| Hit-test `map.queryRenderedFeatures` (`:287`) | Hit-test `scene.pick` / `scene.pickPosition` (`:44-60, 367`) |
| Re-install layers after every `setStyle` (`:48-59`) | Entities persist for viewer lifetime, reconciled by id (`:332-351`) |
| Box-select marquee (DOM div) (`:174-240`) | **no marquee equivalent** |
| Both adapters explicitly reference each other's duplication (`maplibreAdapter.ts:23-35`, `cesiumAdapter.ts:23-39`) | |

No CZML anywhere; no `GeoJsonDataSource` / `CzmlDataSource` — the Cesium path uses the Entity API directly. Photoreal basemap is added via the **primitive** API, not entities (`src/map/photorealCesium.ts:176-195`).

**Per-overlay status (every one asked about):**

| Overlay | Once / twice / not at all | Evidence |
|---|---|---|
| Tracks / entity markers | **Not implemented** | `src/state/selection.ts:16-19` ("There are no tracks, no interceptors and no telemetry"), `:43-53` `selectByBounds()` returns `[]`; no `Track`/`Entity` type; `src/types/` and `src/map/layers/` are `.gitkeep` only |
| Detection cones / sensor coverage | **Not implemented** | no code |
| Effector ranges / engagement zones | **Not implemented** | no code; `src/styles/tokens.css:70-81` reserves signal colours only |
| Geofences | **Partial — operator-sketched only, drawn twice** | annotation kind `zone`; MapLibre `maplibreAdapter.ts:61-93`, Cesium `cesiumAdapter.ts:215-259`. No authored/policy geofence model |
| No-fly volumes / airspace | **Not implemented** | annotations are strictly 2D (`types.ts:22` `positions: LngLat[]`); Cesium positions built with no height arg (`cesiumAdapter.ts:63`) |
| MIL-STD-2525 / APP-6 symbology | **Not implemented** | zero matches for `2525`/`app6`/`milsymbol`/`SIDC`/`affiliation`; Lucide icons only; markers are plain circles / `PointGraphics` |
| Text labels | **Implemented twice**, shared text derivation | shared `geojson.ts:21-40`; MapLibre `symbol` layer `maplibreAdapter.ts:125-156`; Cesium `LabelGraphics` `cesiumAdapter.ts:158-172` |
| Paths / trails / breadcrumbs | **Not implemented** as telemetry; operator `measure` polyline drawn twice | MapLibre `maplibreAdapter.ts:74-93`; Cesium `cesiumAdapter.ts:174-180, 261-276` |

### 1.3 Track / entity data model

**None exists.** The only geometry model is `Annotation` — `src/map/annotations/types.ts:14-25`:
`{ id: string, kind: 'measure'|'zone'|'waypoint', positions: LngLat[], label: string, createdAt: number }`.

- **Coordinate frame**: `[longitude, latitude]` in **degrees**, GeoJSON axis order — `src/lib/geo.ts:14-15`. No ECEF / ENU stored (Cesium converts to `Cartesian3` internally at `cesiumAdapter.ts:62-64`; nothing is persisted that way).
- **Datum**: WGS84 assumed — `src/lib/geo.ts:26` ("against the WGS84 ellipsoid"); distance math uses a sphere r = 6371008.8 m. Cesium default WGS84 ellipsoid; `EllipsoidTerrainProvider` (flat) since the Google mesh carries its own ground (`photorealCesium.ts:130`).
- **Altitude reference**: **none**. No altitude field on any object. Geometry is forced to the ground — MapLibre is 2D; Cesium uses `clampToGround:true` + `classificationType: CESIUM_3D_TILE` (`cesiumAdapter.ts:174-180, 227`). Terrain elevation is a separate per-pack basemap concern with two encodings (`mapbox` vs `terrarium`) — `src/map/sources.ts:49-59, 182-190, 238-249`. Never MSL / AGL / HAE / barometric.
- **Time**: **epoch milliseconds** (`number`). `Annotation.createdAt = Date.now()` — `src/state/annotations.ts:203`. No ISO8601, no seconds, no `Cesium.JulianDate` for data.
- **Identity**: `id: string`, `\`${kind}-${Date.now().toString(36)}-${rand}\`` — `src/state/annotations.ts:199`.
- **Classification / affiliation**: not represented. Reserved only as CSS tokens — `src/styles/tokens.css:70-81` (`--color-signal-track`, `--color-signal-hostile`, …), commented "Unused this session; declared so the meaning is fixed."
- **Track quality / confidence**: not represented. The nearest "trust" seam is `src/state/selection.ts:21-28` — `confirmed` ("Acknowledged by the backend") vs `pending` ("Shown optimistically") id lists; nothing populates them.

### 1.4 Live data path

**None implemented.** No WebSocket / SSE / gRPC-web / MQTT / socket.io / polling for entity data anywhere in `src/` (grep: zero hits). No backend (`server/`, `api/`, express/fastify — none). No transport dependency in `package.json:17-37`. The only `setInterval` is a 1 s wall clock — `src/components/topbar/TopBar.tsx:53`.

Intended parameters, stated as design constraints: **~20 Hz, up to 30 entities, ~600 updates/sec** — `README.md:46`, `src/state/createStore.ts:7-8`, `src/map/MapCanvas.tsx:51`, `src/app/AppFrame.tsx:60`. No `MAX_TRACKS` constant, no fixtures (repo has no tests).

Subscription mechanism (built, unused for data):
- Hand-rolled external store — `src/state/createStore.ts` (no Redux/Zustand/MobX; not in deps). `createStore<T>` = value cell + `Set<listener>`; `set()` bails on `Object.is` no-op (`:37`). `subscribeSelector(store, selector, listener)` (`:64`) subscribes **outside React**, fires only on selected-slice change. `useStoreValue` / `useStoreSelector` are `useSyncExternalStore` bindings. Docstring `:3-15`: the point is to keep 600 updates/sec **out of React state** so "when the telemetry store lands it plugs into the identical … call sites."
- The map updates the live instances via direct store subscriptions, never React state — `src/map/MapCanvas.tsx:310-314, 335, 368`. Annotation adapters subscribe to the `revision` integer and rebuild their source (`maplibreAdapter.ts:418`, `cesiumAdapter.ts:425`). No `requestAnimationFrame` loop anywhere.
- Diff vs rebuild: basemap **rebuilds** (`setStyle(…,{diff:false})`); annotations re-render on the revision counter. No entity diff/patch layer exists because there are no entities.

### 1.5 Map vs sim / production truth isolation boundary

**No such boundary exists.** No simulator, sim mode, synthetic generator, mock, fixture, replay, or scenario system (grep `sim|synthetic|mock|fixture|replay|scenario|truth` → only prose/aesthetic hits). The one designed seam is optimistic-vs-confirmed **selection** — `src/state/selection.ts:21-28` — not a sim/real split. The map consumes from `src/state/*`, which today holds only UI state + annotations. Whether a future feed is one swappable source or separate paths is **undetermined by the code**; stated intent (`createStore.ts:13-15`) is a single telemetry store that downstream subscribes to slice-by-slice.

### 1.6 Camera & time control

**Live-only. No timeline, no clock, no scrub.** Cesium created with `animation:false, timeline:false` (`src/map/photorealCesium.ts:119-120`). Zero hits for `clock`/`currentTime`/`multiplier`/`shouldAnimate`/`JulianDate`/`Timeline` in map code; no `viewer.clock.*`. Camera motion is user-triggered only — MapLibre `easeTo` for view-mode pitch (`src/map/MapCanvas.tsx:239-245, 325-336`), Cesium `flyTo` for recenter (`src/map/photorealCesium.ts:289`), `setView` for placement + a per-frame cost-fence `clamp` on `scene.postRender` (`:238-277`). Engine-agnostic recenter via `registerRecenter(fn)` — `src/map/cameraControl.ts:14-26`. Camera always opens at constant `HOME_CAMERA` (`src/map/sources.ts:299-304`); style files are stripped of `center/zoom/bearing/pitch` (`src/map/mapStyle.ts:288-295`).

### 1.7 Persisted map state

**Annotations only, to `localStorage` only.** Key `sentinel.annotations.v1` — `src/state/annotations.ts:23`. `loadPersisted()` shape-checks each item (`:47-66`); `schedulePersist()` debounces 250 ms then `localStorage.setItem(…)` (`:102-117`), called from commit / remove / rename / clear / vertex-move. Fields persisted: `id, kind, positions, label, createdAt`. Draft geometry and in-progress drags are deliberately not persisted (`:98-100`).

**No saved camera views / bookmarks** (grep `saveView`/`bookmark`/`savedCamera` → none). **No backend** — no `fetch`/`POST` of geometry, no IndexedDB. Annotations are shared between renderers purely via the in-memory `annotationStore`. `mapViewStore` (pack/mode) is **not** persisted — it re-derives from env on every load (`src/state/mapView.ts:25-33`).

### 1.8 Unity / Unreal

**None. Categorically absent.** No `*.cs`, `*.uproject`, `*.unity`, `*.uplugin`, `*.uasset`; no `Assets/` / `Plugins/` / `Content/` / `Source/` / `ProjectSettings/`. The `cesium` dependency is **CesiumJS** (browser/WebGL), dynamically imported, runtime copied to `public/cesium/` by an npm `postinstall` (`package.json:14-15`). `public/cesium/Assets/IAU2006_XYS/*.json` is CesiumJS earth-orientation data, not a Unity `Assets/` folder.

### 1.9 Repo context

One commit deep (`1b3556a`). Vite 7 + React 19.1 + TypeScript ~5.9 SPA; Tailwind v4; Radix UI + Lucide; hand-rolled store; **no backend, no tests**. `docs/` did not exist before this file. Existing planning docs: `README.md` (the build brief), `in-the-map-rail-mellow-brook.md` (offline SE-Asia map-pack build), `public/basemap/README.md`. Deployment target per `README.md:44` is a "disconnected edge node."

---

## 2. Gap analysis vs the Sandtable pattern (Phase 2)

| Capability | Status | Cost to close |
|---|---|---|
| **Time-dynamic 4D playback** (scrub / replay / branch) | **Don't have.** Live-only; `timeline:false`; no clock; MapLibre has no time model. | **Large.** Needs (1) time-indexed track-history buffer; (2) a clock abstraction driving both renderers — Cesium has `viewer.clock` + CZML/`DataSourceDisplay` natively (moderate), MapLibre has nothing (hand-rolled interpolation re-feeding deck.gl every frame, large); (3) a recording sink or history-carrying transport. Scrub + replay of recorded tracks in **one** renderer ≈ 3–6 weeks; ~1.5–2× for both. Branch/COA is a further layer. |
| **Planning artefacts as persisted, geo-anchored map objects** | **Partial.** Operator draws measure/zone/waypoint; persisted to `localStorage`; shared across both renderers via one store and one draw/edit seam. Missing: typed COA objects, text/orders beyond a label, altitude/volumes, a backend (survive a browser, multi-user). | **Small–Medium.** The hard part (shared draw/edit/store/adapter seam) exists. New kinds (text note, arrow, COA polygon + metadata) are incremental. Real backend + schema = Medium. AI-assisted editing (Mentat's actual pitch) = separate, Large — **not ours for this demo.** |
| **MIL-STD-2525D / APP-6 symbology over the globe** | **Don't have.** No library, no affiliation field, markers are plain circles. | **Small–Medium.** `milsymbol` 3.0.4 (renders MIL-STD-2525E / APP-6E as SVG/Canvas, no deps, ~1000 symbols < 20 ms) → data-URI icon atlas → MapLibre `image`+`symbol` / Cesium `billboard`. ~2–5 days per adapter for a renderer bound to affiliation + type. **Blocked on the entity schema carrying those fields.** |
| **Terrain-derived analysis** (LOS, viewshed, masking) | **Don't have.** | **Medium.** Native CesiumJS gives `Scene.sampleHeightMostDetailed` / `clampToHeightMostDetailed` / `sampleTerrainMostDetailed` + ray–globe intersection — enough for **point-to-point LOS** (sensor→track, occluded by DEM or mesh) in ~3–5 days in the Cesium renderer. A **rasterised viewshed dome is not native** — Cesium **ion SDK** (paid, commercial licence; GPU line-of-sight / viewshed / visibility) or a shadow-map hack (~2–4 weeks DIY). MapLibre has no 3D occlusion — query the DEM tiles manually (Medium-Large) or omit it in vector mode. **Run occlusion against the local DEM, not the Google mesh**, to stay clear of the "machine interpretation / geodata extraction" terms (§3.1). |
| **3D Tiles ingestion beyond basemap** (models, scanned sites) | **Don't have**, but near-trivial in Cesium. | **Small (Cesium).** `Cesium.Cesium3DTileset.fromUrl()` or Entity `model` (glTF) — hours to wire a site model or a drone glb. Tiling your own scan = Cesium ion upload or `3d-tiles-tools` (Medium) + a quota question. **Not available in MapLibre mode** — deck.gl `Tile3DLayer` was removed (`src/map/photoreal.ts:98-106`). |
| **Multi-user shared view** | **Don't have.** No backend, `localStorage` only, no presence. | **Large.** Backend (CRDT or authoritative) + auth + presence + conflict handling. This is the Navigator↔Mentat feedback loop — Sandtable's core IP, a product not a feature. |

### 2.1 Ranked by (value to a counter-drone C2 demo) ÷ (implementation cost)

1. **MIL-STD-2525 symbology** — instantly reads as a defence C2 product; small cost; only blocked on the schema. **Best ratio.**
2. **3D model / 3D-Tiles ingestion in Cesium** — a scanned site or a drone model in photoreal mode is a strong visual for near-zero cost. Caveat: Cesium-only.
3. **Point-to-point LOS in Cesium** — directly on-brief for counter-drone sensor coverage; medium cost; native primitives. High value if the demo narrates "can this sensor see that drone."
4. **Extend annotations (more kinds, altitude) — skip the backend for now** — cheap because the seam exists; medium value for a *real-time* demo.
5. **4D scrub / replay** — high value *only if* the demo is a replayed engagement, but large cost, and it collides with the "live tracks" decision — you'd build replay infrastructure the live demo never uses. A cheap "last 60 s trail" breadcrumb buys ~70% of the visual value for ~5% of the cost.
6. **Multi-user shared view** — Sandtable's core, not ours. Defer indefinitely; one operator screen is fine for the pitch.

### 2.2 Where Sandtable is solving a problem we don't have

Full 4D scrub/branch, Navigator (Unity) COA rehearsal, and the multi-user Mentat↔Navigator loop
all serve **deliberate mission planning and after-action rehearsal**. A counter-drone C2 demo is
about *now* — detect, decide, defeat. Live air picture + symbology + coverage/LOS visualisation
beats a scrub timeline for this pitch.

---

## 3. Constraints checked (Phase 3) — not assumed

### 3.1 Google Photorealistic 3D Tiles

Sources (checked 2026-09-04):
- Map Tiles API Policies — https://developers.google.com/maps/documentation/tile/policies
- Photorealistic 3D Tiles guide — https://developers.google.com/maps/documentation/tile/3d-tiles
- Cesium "Terms for Google" (Appendix B-2) — https://cesium.com/legal/terms-for-google/

- **Offline use prohibited.** "You may not use Map Tiles API for any non-visualization use cases,
  such as: Image analysis, Machine interpretation, Object detection or identification, Geodata
  extraction or resale, **Offline uses**, including for any of the above."
- **Caching = HTTP directives only.** "you must not pre-fetch, index, store, or cache any Content
  except under the limited conditions stated in the terms"; the client "must respect the `max-age`
  value, the `stale-while-revalidate` value, the `must-revalidate` directive, and the `private`
  directive."
- **Attribution mandatory.** "you must use a 3D Tiles renderer that supports the display of
  copyright attribution"; data "requires the display of attribution and copyright information from
  the appropriate metadata or viewport information requests." Google logo min height 16 dp.
  CesiumJS: `showCreditsOnScreen: true`. Sentinel currently disables Cesium's own credit widget
  and tracks `photorealAttribution` in `mapViewStore` (`src/state/mapView.ts:25-33`) — **confirm
  it is actually rendered in the UI** (Open question 8).
- **Session lifetime ~3 hours.** "The render can make at least three hours of tile requests from a
  single root tileset request." → a demo needs live network at kickoff, then ~3 h of streaming.
- **Renderer allow-list.** "CesiumJS version 1.91 and later, or Cesium for Unreal version 1.12 and
  later." No Cesium for Unity on Google's list (→ §3.4).
- **High Risk Activities clause** (Cesium's Google terms, Appendix B-2): includes "emergency
  response services; **autonomous and semi-autonomous vehicle or drone control**; vessel
  navigations; **aviation; air traffic control**; and nuclear facilities operation." Cesium "shall
  have the right to … suspend[] or terminat[e] Your use" for non-compliance. A counter-drone C2
  product sits close to this line.

**Net**: Google photoreal is an **online-only demo capability**. It cannot ship in a disconnected
deployment, cannot be pre-cached, and carries a defence-use flag that needs legal review **before
any deployment** (not the demo). For the 27 Sep pitch (online, attribution shown) it is fine.

### 3.2 Cesium ion quotas

Source: https://cesium.com/platform/cesium-ion/pricing/ (no date on page, checked 2026-09-04).

- Community (free, **non-commercial only**): 5 GB storage, **15 GB/month streaming**.
- Commercial: 50 GB / 150 GB, $149/mo individual.
- Premium: 250 GB / 500 GB.
- **Overage behaviour is not documented on the pricing page** — Open question 3.
- "Cesium ion Self-Hosted" exists for on-prem; no public detail.
- Google Photorealistic 3D Tiles streamed **through** ion still bill against Google's API and are
  governed by §3.1; ion is the proxy/streaming layer.
- **Network-loss / token-failure behaviour in our code**: `resolvePhotorealRoute()`
  (`src/map/photoreal.ts:54-96`) already fails over Google-direct ↔ ion. If **both** fail it
  returns `null`, the selection snaps back to `lastGoodPack` (`src/map/MapCanvas.tsx:169-173,
  291-303`), and vector mode still works. A mid-demo ion-quota cut-off would look like this path.

### 3.3 CesiumJS native terrain analysis

- **Latest CesiumJS ≈ 1.144–1.145** (Aug–Sep 2026); min Node 22 since 1.141. Repo is on **1.145.0**
  (lock).
- Open-source CesiumJS has **no built-in viewshed / line-of-sight / masking widget**.
- It **does** expose the primitives to build point-to-point LOS: `Scene.sampleHeight` /
  `sampleHeightMostDetailed`, `Scene.clampToHeight` / `clampToHeightMostDetailed` (since 1.52),
  `sampleTerrainMostDetailed`, ray/globe intersection.
- Rasterised viewshed = **Cesium ion SDK** (commercial) or shadow-map DIY.
Sources: https://cesium.com/platform/cesiumjs/ion-sdk/ , Cesium community threads (checked 2026-09-04).

### 3.4 Cesium for Unity — is a second engine client justified?

**For**: Sandtable's Navigator is in Unity for real reasons — physics, sensor modelling,
multi-agent sim, VR mission rehearsal, a genuine 4D environment — all better in a game engine than
a browser. If Sentinel's roadmap includes operator training or high-fidelity COA rehearsal, a
Unity client on the same Cesium ion assets is the natural home, and one tiling pipeline serves
both.

**Against**: it is a second client, build, deploy, skill set, and a **third** render of every
overlay. The 27 Sep pitch is a real-time C2 demo, not a training demo. Nothing in the current repo
(browser SPA, no backend, no sim) is near needing it. The counter-drone value story —
detect/decide/defeat in real time — is a browser story. Note also Google's renderer allow-list
(§3.1) names Unreal, **not Unity**, for photoreal tiles.

**Pick: no Cesium for Unity before the pitch; no commitment after it until there is a funded
training/rehearsal requirement.** Keep the option cheap by keeping Cesium ion as the asset layer
(already true).

### 3.5 Does `.pmtiles` mode work fully offline, end to end?

**Partly — pack-dependent** (`src/map/sources.ts:170-288`):

| Pack | Offline? | Why |
|---|---|---|
| `edge` (default) | **Yes** | local style `/edge-map/style.json`; basemap `pmtiles:///edge-map/data/singapore.pmtiles` (38 MB, in `public/`); local raster terrain PNGs `/edge-map/data/terrain/{z}/{x}/{y}.png`; local glyphs/sprites `public/edge-map/assets/` |
| `seasia` | **Yes** | `basemapSourceOverride: pmtiles:///edge-map/data/seasia-base.pmtiles` (382 MB); terrain `pmtiles:///edge-map/data/seasia-terrain.pmtiles` (673 MB), `terrarium` |
| `void` | **Yes** | local style `/basemap/style.void.json` |
| `terrain-free` | **No** | style `https://tiles.openfreemap.org/styles/positron`; terrain `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` (unless `VITE_TERRAIN_PMTILES` set) |
| `photoreal` | **No** (by definition) | streams Google 3D Tiles over HTTPS |

- The `pmtiles://` protocol handler (`src/map/MapCanvas.tsx:35-40`) serves range requests against
  the static files; Vite serves `public/` at web root, hence the `pmtiles:///…` triple-slash URLs.
- Payload dirs (`public/edge-map/data/`, `public/edge-map/assets/`) are **gitignored** —
  "provisioned onto the edge node, not committed." `manifest.json` / `style.json` stay tracked.
- **Verify before relying on it**: (a) the running deployment defaults to `edge` or `seasia`, not
  `terrain-free` (`defaultPack()` — `src/map/sources.ts:314-322`, from `VITE_MAP_PACK`); (b) the
  `edge` style JSON has no incidental remote `glyphs`/`sprite`/`tiles` URL; (c) the payload files
  are actually present on the target node.

### 3.6 Symbology library

`milsymbol` 3.0.4 — MIL-STD-2525E / STANAG APP-6E, pure JS, SVG + Canvas, no dependencies,
~1000 symbols < 20 ms, documented CesiumJS billboard integration. Source:
https://www.npmjs.com/package/milsymbol , https://github.com/spatialillusions/milsymbol
(checked 2026-09-04).

---

## 4. Plan (Phase 4)

Assumptions from Jason's answers: live tracks + effects by the pitch; demo runs online; the track
schema + transport has **no owner yet**.

### Phase 0 — Spike: shared store → dual-renderer overlay at rate (< 1 day)

**Riskiest assumption**: the mirrored-adapter pattern scales from "static annotations on a
revision counter" to "30 moving MIL-STD-2525 symbols at 20 Hz, in both renderers, from one shared
store, with no React render per tick."

- Stand up a throwaway `fakeTrackStore` (30 entities at 20 Hz: lon/lat/altM/headingDeg/affiliation)
  via `createStore` + `subscribeSelector`.
- Vector mode: feed a deck.gl `IconLayer` through the existing `MapboxOverlay`
  (`src/map/MapCanvas.tsx:98`), replacing `layers` each tick, no React state.
- Photoreal mode: feed the same store into a minimal Cesium `BillboardCollection`, reusing the
  `cesiumAdapter` subscription pattern.
- Measure: sustained FPS both modes, main-thread ms/tick, GC pauses (Chrome perf trace).
- **Go / no-go**: ≥ 30 FPS both modes with headroom → architecture holds, proceed to Phase 1.
  Jank or sub-30 → overlay strategy rethink becomes its own phase (candidates: Cesium
  `PointPrimitiveCollection` / custom primitive; deck.gl binary attributes; drop vector mode for
  the demo).
- Files touched: new `src/map/layers/trackOverlay.spike.ts` (throwaway); scratch wiring in
  `src/map/MapCanvas.tsx`. New deps: none (deck.gl present); optionally `milsymbol` for real icons.
- Demo: side-by-side, toggle modes, watch a live entity counter.
- Rollback: throwaway branch, delete it. Zero production impact.

### Phase 1 — Minimal track schema + telemetry seam (unblocks everything)

Because the schema owner is undecided, propose it here so work can start.

- `src/types/track.ts`: `{ id, kind, affiliation, position: { lon, lat, altM, altRef:
  'HAE'|'MSL'|'AGL' }, velocityMps?, headingDeg?, quality?, t: epochMs }`. WGS84, degrees, explicit
  altitude reference, epoch millis (matches the existing `createdAt` convention, §1.3).
- `src/state/tracks.ts`: `createStore` holding `Map<id, Track>`, `applyUpdate(batch)`,
  `subscribeSelector`-friendly. No React.
- `src/data/telemetry.ts`: `connect(source)` behind an interface with `sim` / `live` / `replay`
  implementations calling `applyUpdate`. **This is where the sim / production isolation boundary
  gets drawn** — currently absent (§1.5). The `sim` implementation generates the demo scenario;
  the map neither knows nor cares which source is active.
- DoD: `tracks` store fed by the `sim` source, ticking at 20 Hz in devtools, React tree not
  re-rendering.
- New deps: none. Files: `src/types/`, `src/state/`, `src/data/` (all additive, unreferenced by
  existing code until Phase 2 wires them).
- Demo: internal only (devtools + FPS counter).
- Rollback: delete the new files; nothing else imports them.

### Phase 2 — Unified track overlay (the two-adapter unification, scoped to tracks) — first customer-facing increment

- New `src/map/layers/trackLayer/` mirroring `src/map/annotations/`: shared `render(tracks)`,
  `maplibreTrackAdapter.ts` (deck.gl layer), `cesiumTrackAdapter.ts` (billboard collection); both
  subscribe to `tracksStore`.
- Symbology via `milsymbol` → data-URI icon atlas keyed by affiliation + kind.
- Wire adapter lifecycle in `src/map/MapCanvas.tsx` the way `maplibreAdapter` / `cesiumAdapter`
  are today; behind a `VITE_TRACKS=1` flag.
- DoD: one track store renders correctly in both modes; mode switch preserves the picture; 20 Hz
  sustained (Phase 0 proved feasible).
- New deps: `milsymbol`. Files: `src/map/layers/*` (new), `src/map/MapCanvas.tsx`, `package.json`.
- Demo: **live NATO-symbol air picture over Singapore, photoreal and tactical.**
- Rollback: `VITE_TRACKS=0` — adapters dormant, annotations path untouched.

### Phase 3 — Effects overlays (detection cones, effector ranges, no-fly volumes)

- Extend the Phase 2 pattern with per-entity derived geometry. Cesium: `CylinderGraphics` /
  `EllipsoidGraphics` / custom primitive for cones and domes (native, uses the altitude from the
  Phase 1 schema). MapLibre: 2D projected footprints (circle/polygon) — accept the loss of the
  vertical dimension in vector mode.
- Volume parameters (sensor FOV, jammer range) as static config keyed by platform type
  (→ Open question 6).
- DoD: a sensor's cone and an effector's range render and move with their platform in both modes.
- New deps: none. Files: `src/map/layers/trackLayer/*`, a new `src/config/platforms.ts`.
- Demo: "this sensor covers that sector; this effector can reach that track."
- Rollback: per-overlay flag; stop deriving, tracks still render.

### Phase 4 — Stretch (cut first): point-to-point LOS in photoreal mode

- `Scene.sampleHeightMostDetailed` / ray–globe intersection sensor→track; red/green line. Cesium
  only; vector mode shows nothing (or a DEM approximation later).
- **Occlude against the local DEM, not the Google mesh** (§3.1 terms).
- DoD: toggling a track shows whether the nearest sensor has LOS.
- New deps: none. Files: `src/map/layers/losLayer.ts`, a toggle in `src/views/MapView.tsx`.
- Demo: the "can we even see it" beat.
- Rollback: hide the toggle; no shared-code change.

### Explicitly deferred (with reason)

- **4D scrub / replay timeline** — collides with the live-demo decision, Large, infrastructure the
  pitch never uses. A "last 60 s trail" in Phase 2/3 covers the visual need.
- **Cesium for Unity / second engine client** — §3.4; cannot land by 27 Sep and would consume the
  whole budget.
- **Multi-user shared view** — product-scale; one operator screen suffices.
- **AI-assisted annotation editing** — Mentat's differentiator, not Sentinel's for this pitch.
- **Authored 3D-Tiles site scans** — nice-to-have; quota + tiling cost; do a single glTF model
  instead if a site visual is wanted.

### Unification cost as an explicit prerequisite (go / no-go)

The two renderers are **not** unified — shared data/interaction, duplicated draw calls
(`maplibreAdapter.ts` vs `cesiumAdapter.ts`, mirrored). **Full unification is not recommended**: it
means either dropping a renderer or building an abstraction over two fundamentally different
models (2D style layers vs 3D scene graph) — weeks of work for a leaky abstraction. **Instead**,
accept the mirrored-adapter pattern as a contained cost (each overlay type = 2 adapters + 1 shared
core) and budget **~1.5× a single-renderer estimate** per overlay phase.
**Go / no-go after Phase 0**: if the measured mirrored cost is > 2× rather than ~1.5×, reconsider
**Cesium-only for the demo** — vector mode becomes a post-pitch deployment feature (→ Open
question 7).

### Time budget — 27 September 2026

Working backward: the pitch needs **Phase 2** solid and rehearsed; **Phase 3** is the
differentiator; **Phase 4** is gravy. Realistic **only if** Phase 0 goes green and the telemetry /
schema owner is assigned this week.

- If the schema owner is not assigned by ~mid-September, Phase 1 stalls and the whole chain slips —
  **escalate now**.
- 4D scrub cannot land safely by 27 Sep — do not attempt.
- Cesium for Unity cannot land by 27 Sep.
- Google-terms legal review for **deployment** is a parallel non-code track — start it, don't let
  it block the demo.

### Top 5 risks + mitigations

1. **Dual-adapter overlay can't hit 20 Hz in one/both modes.** → Phase 0 kills this in < 1 day.
   Mitigation: Cesium-only demo (vector deferred), or 10 Hz visual with interpolation.
2. **Track schema / feed has no owner → Phase 1 never starts.** → Escalate this week; this doc
   proposes a schema so work can begin without a perfect spec.
3. **Cesium ion / Google quota or token failure mid-demo.** → `resolvePhotorealRoute()` fallback
   already exists (§3.2); pre-fetch the root tileset at the venue on arrival (3 h window); rehearse
   in the fully-offline `edge` pack as the hard fallback; move to a Commercial ion tier before the
   pitch.
4. **Mirrored-adapter maintenance cost balloons as overlays multiply.** → Measure after Phase 0;
   hard-cap overlay types for the pitch (tracks + cones + ranges, nothing else); keep the shared
   core genuinely shared.
5. **Scope creep from Sandtable envy** (someone wants scrub / branch / Unity). → This doc is the
   counter-argument: those solve a deliberate-planning / rehearsal problem the real-time
   counter-drone demo does not have.

### Rollback story (summary)

| Phase | Rollback |
|---|---|
| 0 | Throwaway branch — delete. Zero production impact. |
| 1 | Additive files, unreferenced until Phase 2 — delete them. |
| 2 | `VITE_TRACKS=0` — adapters dormant; annotations untouched. |
| 3 | Per-overlay flag off — tracks still render. |
| 4 | Hide the toggle — no shared-code change. |

---

## 5. Open questions for Jason

1. **Who owns the track/entity schema and telemetry transport, and when are they assigned?**
   Blocks Phase 1; this doc proposes a starting schema (§4 Phase 1).
2. **What is the demo scenario source** — a real sensor feed at the venue, or a scripted `sim`
   source? Determines the `sim` vs `live` implementation and whether a scenario-authoring tool is
   needed.
3. **Cesium ion tier and headroom** — are we on Commercial+ for the pitch, and what is the
   account's current monthly streaming headroom? Overage behaviour is undocumented — is there a
   Cesium contact?
4. **Will deployment (post-pitch) use Google photoreal at all**, given the High Risk Activities
   clause covers drone control / aviation / ATC (§3.1)? If not, we need a non-Google
   photoreal / high-detail-terrain plan.
5. **The committed secrets in `.env` (`.env:4-5`)** — disposable, or do they need rotating and
   moving to a real secrets path?
6. **Source for sensor FOV / effector range parameters** per platform type for the effects
   overlays (Phase 3), or do we use plausible demo numbers?
7. **Does vector (`.pmtiles`) mode need to be in the pitch demo at all**, or is photoreal the only
   mode shown and vector purely a deployment concern? Changes the unification calculus — could go
   Cesium-only for the demo.
8. **Is the Google/Cesium photoreal attribution string actually rendered in the UI?** The code
   tracks `photorealAttribution` in `mapViewStore` (`src/state/mapView.ts:25-33`) and disables
   Cesium's own credit widget (`src/map/photorealCesium.ts`); §3.1 makes on-screen attribution
   mandatory.
