# Map assets and local setup

A new checkout runs with labelled map fallbacks. The regional pack, provider credentials and account settings are local configuration, not repository contents. Existing files on this machine are preserved by cleanup.

## Optional regional pack

From `frontend/`, supply the path to the existing reviewed Sentinel v2 pack:

```powershell
npm run maps:setup -- C:\Archive\Coding\Sentinel2\public\edge-map
```

The script verifies the two recorded archive hashes before copying the SEA vector/DEM data, Noto glyphs and sprites. It creates an adapted style/manifest and copies tracked notices from `frontend/map-data/licenses/`. It never writes to the source pack. The prepared `frontend/public/edge-map/` is ignored and is approximately 1.06 GB. Do not change the hashes to accept different data without checking its coverage/encoding separately.

`VITE_TACTICAL_PROVIDER=local` selects the pack; missing data produces the labelled grid fallback. Terrain/building controls apply to this local route. [Provider variables](MAP_SERVICES_SETUP.md) describe optional hosted content. Preserve existing `.env.local`; copy `.env.example` only when creating a new local configuration.

## Builds

Ordinary `npm run build` produces a complete bundle, including local public assets. Verification builds deliberately share this checkout's public directory to avoid repeated map-pack copies. They are not self-contained deployment packages.

A deployment must serve PMTiles byte ranges, return proper missing-asset responses, preserve notices/attribution, include Cesium worker assets and proxy the backend API/WebSocket routes. Rebuild after client environment changes. Build success does not verify provider authorization for a deployment origin.

## Height and presentation boundaries

MSL remains an explicitly approximate zero-geoid conversion. AGL needs a valid supported surface sample; Google mesh geometry is not silently substituted for terrain height. Supplied Video viewpoints and entity heights are not relocated to conceal intersections. These are the existing application's presentation semantics, not a vertical-clearance certification.

The original account walkthroughs, coverage measurements and provider evidence are preserved in the [archive](ARCHIVE.md). This organization pass does not provision accounts, change credentials or revise provider arrangements.
