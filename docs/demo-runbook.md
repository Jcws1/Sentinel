# Sentinel v3 demo prerequisites — Phase 0

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
