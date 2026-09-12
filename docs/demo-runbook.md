# Sentinel v3 demo prerequisites — Phase 0

**Current map-service setup (11 September 2026):** use [MAP_SERVICES_SETUP.md](MAP_SERVICES_SETUP.md) for accounts, asset IDs, token restrictions, configuration and restart instructions, and the [map-services review](map-services/REVIEW.md) for verified behavior. Tactical now defaults to MapTiler `streets-v4`; Cesium imagery/terrain/buildings integration and shared-view continuity are implemented. Authenticated provider coverage remains unverified. Phase 3B is deferred. The Phase 0 and Phase 3A sections below are historical records and their provider/deferred-scope statements are superseded by that guide.

Status: proposed data/hardware configuration, 2026-09-10. No provider account has been created, paid plan enabled, token obtained, imagery downloaded or production map built. This runbook separates proposed choices from verified behavior. Docking verification is in [docking-evaluation.md](docking-evaluation.md).

## Proposed demo configuration

Primary environment: a synthetic Singapore-area mission showing an urban context. Mojave terrain and a tropical/jungle environment are secondary smoke contexts. Geographic background may be real, but simulated entities/areas are fictional; no real installation routes or dispatch endpoints. Exact demonstration camera locations and provider coverage must be confirmed when imagery can be inspected, rather than asserting building fidelity now.

| Layer | Proposed provider | Required setup / limits | Failure behavior |
| --- | --- | --- | --- |
| Tactical vector style | MapTiler Cloud vector tiles with a restrained custom style, served directly to MapLibre | MapTiler account, browser-restricted key, approved plan and attribution. Verify style URL/sprites/glyphs and CORS. | Local plain dark style and graticule with operational overlays; clear “Basemap unavailable” status. No substitution that resets mission/camera. |
| 3D imagery | Cesium ion global satellite imagery asset available to the approved account; prefer stable Bing/Google imagery, not a technology-preview source | ion account/token, asset entitlement, imagery quota and origin restrictions. Asset ID selected from actual account, not guessed. | Flat/local low-detail background and warning; do not imply photorealism. |
| Terrain | Cesium World Terrain via ion | ion token and streaming quota; verify terrain datum and sample accuracy at demo points | Explicit ellipsoid-only terrain mode, keeping entity altitude/source values; disable terrain-dependent claims. |
| Buildings | Cesium OSM Buildings through ion | ion entitlement/attribution. Inspect Singapore building heights/coverage in Phase 4; modeled buildings are not a surveyed or photorealistic guarantee | Omit failed tileset with “Buildings unavailable”; keep scene functional. Optional explicitly synthetic demo geometry later, labeled synthetic. |
| Vertical datum conversion | GeographicLib EGM96 5-minute geoid grid (`egm96-5`) plus a named bilinear evaluation step | Download/version/checksum/license review during later geospatial work; preserve original MSL datum as unspecified and label the EGM96 assumption | Keep MSL labels/profile; spatial height conversion marked approximate or unavailable. Never silently call MSL ellipsoid height. |

Cesium ion documents global imagery, terrain and building access; actual assets and limits are account dependent. [Cesium ion content](https://cesium.com/platform/cesium-ion/). Cesium OSM Buildings derives from OpenStreetMap; specific urban coverage remains to be inspected. [OSM Buildings source](https://cesium.com/platform/cesium-ion/content/cesium-osm-buildings/).

GeographicLib documents the WGS84 EGM96 five-minute grid, its file metadata and interpolation conventions. Use H (MSL) + N (geoid separation) = h (ellipsoid) while retaining the source H and datum assumption. AGL requires ground elevation in a known reference; it cannot be resolved from EGM96 alone. [GeographicLib geoid documentation](https://geographiclib.sourceforge.io/C++/doc/geoid.html). Do not assume the Python `geographiclib` geodesic package contains the geoid grid/evaluator; choose the actual geoid implementation in Phase 4 and validate known points.

Do not make terrain clearance, collision, line-of-sight or survey-accuracy claims from this visual demo. Provider switches replace projections/data only; they do not modify world positions or simulation eligibility calculations.

## Accounts, costs and decisions for the user

These are future integration prerequisites, not unanswered questions blocking this Phase 0 task. Do not paste credentials into documents or chat; configure restricted development tokens locally in ignored environment files when that implementation phase is authorised.

| Input needed | Why / proposed default | Required before |
| --- | --- | --- |
| Who owns the MapTiler and Cesium ion accounts; existing entitlements? | Prefer existing authorised team accounts. No account creation or payment assumed. | Hosted map integration |
| Hackathon usage category, distribution and spending cap | Verify free/evaluation eligibility; otherwise approve a paid plan or use clearly limited fallback backgrounds. Proposed spending during Phase 0: $0. | Enabling hosted services |
| Final demonstration machine, browser and monitors | Proposed desktop Windows + current Edge/Chrome, 16 GiB RAM minimum, 32 GiB preferred, capable WebGL2 GPU, plugged in; 1440p primary and optional second monitor. | Performance rehearsal |
| Venue internet, proxy/firewall, display scaling | Hosted tiles need connectivity; test actual venue or comparable network. | Demo rehearsal |
| Organiser compatibility answers | See numbered questions in [compatibility-decisions.md](../contracts/simulation/compatibility-decisions.md). No messages sent. | Exact simulation conformance signoff |
| Accept EGM96 as a disclosed visual MSL assumption, or provide source vertical datum | MSL alone does not uniquely identify a geoid; retain source data without a guessed datum. | Height-fidelity signoff |

Pricing reference checked 2026-09-10: Cesium lists a free individual Community tier, Commercial at USD 149/month individual or 524/month team, with quotas and eligibility conditions. Do not assume a hackathon automatically qualifies for free production use. Its FAQ permits exploratory evaluation in some commercial/government contexts; use the actual project category to decide. [Cesium pricing and eligibility](https://cesium.com/platform/cesium-ion/pricing/).

MapTiler provides a free-account entry and priced plans; eligibility, branding, tile/API accounting and quotas must be checked for the intended usage and selected plan. No subscription amount or entitlement is approved here. [MapTiler pricing](https://www.maptiler.com/cloud/pricing/), [Cloud terms](https://www.maptiler.com/terms/cloud/). Do not use public OpenStreetMap tile servers as an assumed unlimited offline/cache fallback.

Keep attribution visible in both engines and popouts. Tokens exposed to a browser must be read-only, origin/asset restricted and quota controlled; never ship account-management tokens. No bulk caching of hosted imagery or offline redistribution assumed. Network failure fallback means a usable operational overlay, not a promise of full offline geospatial capability.

## Hardware: observed versus assumed

Phase 0 observed host: Intel Core i7-10700K at 3.80 GHz, 16 logical CPUs, 32 GiB RAM, Windows build 19045. Edge 152.0.4191.66 headless ran docking tests. GPU identity and physical monitor arrangement were not verified. These observations do not establish the hackathon's final machine or dual-renderer FPS.

Later provisional workload: 200 entities, five authoritative updates/second, 60 seconds of displayed history, two maps plus two analytic panes. Target at least 30 FPS and selection feedback within 150 ms on the final machine. Measure cold tile loading separately from warm view switching. Neither performance target was tested in the two-view Phase 0 chart experiment.

## Later preflight and fallback rehearsal

1. Verify account eligibility, allowed origins, remaining quota, style/sprite/glyph URLs, terrain, imagery and building assets. Confirm production Cesium Workers/Assets paths and popout.html on deployment base path.
2. Inspect the primary Singapore background and secondary Mojave/tropical camera areas. Record actual asset names/versions, coverage limitations, credits and known datum points. Do not describe uninspected coverage as verified.
3. Load the deterministic synthetic mission; rehearse Tactical → select/details → 3D → profile → Command Picture → HOLD acknowledgement → replay → split → analytic pop-out.
4. Disable one tile provider and disconnect the backend once. Confirm mission, selection/time/camera survive, stale state is visible and failed imagery does not look like fresh geospatial evidence.
5. Verify actual dual-monitor movement and browser popup permission. Keep the opener running; Phase 0's selected FlexLayout window depends on it. Test display scaling and keyboard focus.
6. Reopen a stored deterministic recording and use fallback backgrounds if hosted data fails. A recorded run is a replay, clearly labeled. Full offline/on-premises packaging remains out of scope.

Phase 0 only documents this preflight; it has not executed map-provider, terrain or simulation rehearsals.

## Phase 3A Tactical update — 11 September 2026

The sections above preserve the Phase 0 proposal. Phase 3A implemented the Tactical MapLibre projection, local graticule fallback and provider configuration boundary. Its historical verification/critique status is maintained in [Phase 3A review](phase3a-review.md). Cesium imagery, terrain and buildings were deferred at that stage; the current [map-services guide](MAP_SERVICES_SETUP.md) supersedes that deferral. Geoid conversion and vertical-fidelity validation remain outstanding.

### Run the bounded Tactical demonstration

Start the existing single-process backend with `SENTINEL_FIXTURES=1`, following [backend setup](../backend/README.md). Run `npm ci` and `npm run dev` from `frontend`, then open `http://127.0.0.1:5180`. Vite proxies the same-origin `/api` REST/WebSocket routes to port 8000 by default; `SENTINEL_API_TARGET` can change that local proxy target.

1. In the header, choose **Missions > No mission → Synthetic Tactical**. The same dropdown switches and unloads missions. This backend-authored fixture supplies four affiliation meanings, a last-known observation, an unlocated Entity and one synthetic test-area polygon. Alpha and Bravo remain unchanged.
2. Select a symbol. Its neutral selection ring preserves affiliation geometry/colour; the compact selection notice names the same shared Entity.
3. Advance the fixture explicitly through the backend developer interface below. The normal UI has no advancement button and does not auto-advance. The three canned stages change a position/add F-02, then remove U-01 and F-01's Track, then restore the baseline with later committed time/sequence. Missing identities and missing positions remain explicit. This is fixture advancement, not simulation resolution or a route.
4. Right-click the Tactical tab (or focus it and press **Shift+F10 / Context Menu**) and choose **New Tactical pane**. Both panes share mission/frame/selection/layer context but keep independent cameras. The same tab menu retains Open to Side and Close view, targeting that tab even when inactive. Use **Pan**, **Recenter** and **Map layers**; focus the canvas for arrow-key pan, `+`/`−` zoom, bracket-key symbol review and Enter selection.
5. Switch tabs, resize, close both Tactical panes and reopen the primary Tactical view from navigation. Confirm the real map canvas, geometry and picking return. This final close/reopen sequence is a mandatory regression following the round 1 critique.
6. Disconnect the backend and verify a retained complete frame with STALE notices; restore it and wait for a verified snapshot. Provider failure is a separate state and must preserve the same mission and selection.

These historical Phase 3A steps stopped before Cesium. The current map-services slice also supports the **Tactical / 3D** switch and simultaneous projections; entity browsing/detail, trails, replay, analytics and operational pop-outs remain deferred. Authenticated hosted provider access and final-hardware checks remain separately outstanding.

With the local fixture backend running on port 8000, a separate PowerShell terminal can commit one sample through the existing test interface:

```powershell
$fixtureWorld = Invoke-RestMethod 'http://127.0.0.1:8000/api/missions/fixture-tactical/world'
$fixtureCommit = @{ expectedSequence = $fixtureWorld.sequence } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/fixtures/fixture-tactical/advance' -ContentType 'application/json' -Body $fixtureCommit
```

This requires the opt-in fixture source. A concurrent advance returns 409; reread the latest sequence before deliberately submitting another sample. Production mission commands are outside this phase. The [chrome-refinement review](chrome-refinement/REVIEW.md) records the subsequent header/menu changes; older phase reports retain their historical UI descriptions.

### Historical Phase 3A Tactical provider configuration

The table records the Phase 3A configuration before map-service defaults were added. For the current filled-in defaults and both provider credentials, use [MAP_SERVICES_SETUP.md](MAP_SERVICES_SETUP.md) and `frontend/.env.example`; paste credentials into ignored `frontend/.env.local`.

| Variable | Meaning |
| --- | --- |
| `VITE_TACTICAL_STYLE_URL` | Phase 3A required a supplied style URL. The current documented default is `https://api.maptiler.com/maps/streets-v4/style.json`; a custom URL remains optional. |
| `VITE_MAPTILER_KEY` | Existing read-only, origin-restricted browser key. It is attached only to the exact `api.maptiler.com` style host, not forwarded to other provider hosts. |

These Vite values are public browser configuration, read at development start/build time. Restart Vite or rebuild after changes. Existing account entitlement, attribution, quota and origin restrictions still need validation; no account, payment or token was created for this implementation.

No approved hosted style/credentials were available during Phase 3A. The default **LOCAL GRID / CREDENTIAL REQUIRED** view provides an explicitly limited geographic graticule, operational overlays and scale. It supplies no land, roads or imagery. The configured-provider path resolves relative glyph/sprite/tile URLs, retains supplied source attribution and mutes basemap decoration. Loading and tile-readiness deadlines produce an explicit fallback with **Retry basemap**. A renderer error is separately labelled with **Retry renderer**.

Tests use a synthetic style to exercise failure/retry, muted styling and attribution; this does not verify MapTiler network access or a real custom basemap's visual discipline. Real hosted-style/sprite/glyph/tile loading, actual source attribution, coverage, remaining quota and venue-network behaviour must still be checked with approved credentials. No public tile service is used as an unapproved substitute.

If the initial bundled worker cannot load, the map shows **Map resources unavailable / RELOAD REQUIRED** after its startup deadline. Restore asset access and use **Reload application**, then load the mission again. This deliberately resets the client session because MapLibre can retain a failed initial shared worker; it does not erase backend recordings. The worker-block/reload regression verifies this distinction from ordinary provider fallback, which retains mission and selection context.

MapLibre 6.9.0's worker is bundled through Vite's `?worker&url` path and registered explicitly, including the shared ESM dependency in the production bundle. [Official MapLibre Vite instructions](https://maplibre.org/maplibre-gl-js/docs/#installation). No map renderer or provider integration has been added to the isolated workspace harness.

Tactical is a flat Mercator projection: points beyond ±85.051129° are omitted with a visible range notice, and antimeridian-spanning framing/filtering is not supported. Non-wrapping local fixtures establish this slice; polar/global wrapping, 3D altitude conversion, terrain fidelity and final-hardware performance remain separate gates.
