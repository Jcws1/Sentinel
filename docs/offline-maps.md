# Sentinel C2 — Offline Maps & Disconnected Operations

Sentinel runs fully local for C2 (UI + API on localhost). Only **map tiles** require network unless you self-host them under `public/offline/`.

## What works offline today

| Layer | Offline? | Source |
|-------|----------|--------|
| C2 backend (drones, threats, tasking) | Yes | `npm run dev` → `:3001` |
| Operator overlays (fleet, threats, mesh) | Yes | Redux + WebSocket |
| Installations / scenarios | Yes | Bundled GeoJSON |
| Restricted areas / landmarks | Yes | `src/terrain/sgTerrainConfig.ts` |
| Basemap (roads, satellite, labels) | Needs tiles | Mapbox cloud or `public/offline/` |
| DEM / hillshade / contours | Needs tiles | Mapbox cloud or self-hosted DEM |
| 3D buildings | Partial | Mapbox `composite` online; vector tiles offline |

## Quick start — no tiles

Minimal dark basemap + all operator symbology:

```env
VITE_OFFLINE_MODE=true
```

No `VITE_MAPBOX_TOKEN` required. Map uses `/offline/styles/sentinel-ops.json`.

## Quick start — with tiles

1. Place tiles under `public/offline/tiles/` (see `public/offline/README.md`).
2. Configure `.env`:

```env
VITE_OFFLINE_MODE=true
VITE_DEM_TILES_URL=/offline/tiles/dem/{z}/{x}/{y}.png
VITE_DEM_ENCODING=mapbox
VITE_SATELLITE_TILES_URL=/offline/tiles/satellite/{z}/{x}/{y}.png
```

3. Toggle basemap: menu → **Basemap / Diagnostics** (Satellite ↔ Minimal).

## Env variables

| Variable | Purpose |
|----------|---------|
| `VITE_OFFLINE_MODE` | Force self-hosted tile paths |
| `VITE_MAP_STYLE_URL` | Override style JSON path |
| `VITE_DEM_TILES_URL` | DEM XYZ template |
| `VITE_DEM_ENCODING` | `mapbox` or `terrarium` |
| `VITE_SATELLITE_TILES_URL` | Raster basemap template |
| `VITE_VECTOR_TILES_URL` | Vector roads/buildings/water |
| `VITE_CONTOUR_TILES_URL` | Contour vector tiles |

Auto-fallback: when `navigator.onLine === false`, the app switches to local style paths without restarting.

## Offline dataset options (Singapore AO)

### 1. SLA / OneMap DEM (~2 m) — recommended

- **Format:** GeoTIFF → Terrain-RGB PNG tiles (Mapbox encoding)
- **Use:** Hillshade, 3D terrain, LOS, elevation queries
- **Pipeline:** `rio mbtiles` or `gdal2tiles` → `public/offline/tiles/dem/`
- **Serve:** Vite static hosting or [tileserver-gl](https://github.com/maptiler/tileserver-gl)

### 2. Mapbox DEM prefetch (session cache)

- **Use:** Warm HTTP cache while online before disconnect
- **API:** `prefetchOperationalTerrain(map)` in `src/terrain/prefetchTerrain.ts`
- **Limit:** Does not survive browser restart; respect Mapbox ToS for redistribution

### 3. SRTM / Copernicus 30 m (global fallback)

- **Format:** GeoTIFF → Terrarium RGB
- **Use:** Coarse relief when SLA tiles unavailable
- **Env:** `VITE_DEM_ENCODING=terrarium`

### 4. OpenStreetMap vector extract

- **Format:** MBTiles / PMTiles via tippecanoe
- **Use:** Roads, buildings, water for minimal basemap without satellite
- **Path:** `public/offline/tiles/vector/{z}/{x}/{y}.pbf`

### 5. Sentinel-2 / aerial mosaic

- **Format:** GeoTIFF → raster PNG/JPEG XYZ tiles
- **Use:** Satellite-style offline basemap
- **Path:** `public/offline/tiles/satellite/{z}/{x}/{y}.png`
- **Style:** `sentinel-satellite.json` (auto-selected offline + satellite basemap)

### 6. Bundled GeoJSON (always available)

- Installations: `src/data/singaporeInstallations.ts`
- Restricted / training envelopes: `src/terrain/sgTerrainConfig.ts`
- No tile server needed

## Tile layout

```
public/offline/
  styles/
    sentinel-ops.json          # Minimal dark (no external tiles)
    sentinel-satellite.json    # Local raster satellite
  tiles/
    dem/{z}/{x}/{y}.png
    satellite/{z}/{x}/{y}.png
    vector/{z}/{x}/{y}.pbf
    contours.pmtiles           # optional
```

## Production deployment

```bash
npm run build
npm start   # serves dist/ + API :3001
```

Bundle offline tiles into `dist/offline/` (copied from `public/offline/` at build time). Run tileserver-gl on the same LAN for large MBTiles archives.

## Code integration

- `resolveOfflineMapConfig()` — picks style URL, DEM, contour sources from env + connectivity
- `resolveTerrainConfig()` — merges offline DEM into `TerrainConfig`
- `BattlespaceMap.tsx` — style switching on basemap toggle and `online`/`offline` events
- `StreamlinedTopBar` — shows **MAP OFFLINE** when using local tiles

## Persistent tile cache (implemented)

Sentinel caches map tiles in **IndexedDB** via a **service worker** (`public/sw.js`):

1. Menu → **Prepare Offline Maps** — fetches Singapore AO tiles (z10–14) for DEM, satellite, vector templates
2. While online, also warms Mapbox DEM tiles via map fly-through (cached by SW on network fetch)
3. When disconnected, SW serves cached tiles; missing tiles return 503

### Prepare before disconnect

```
⋮ menu → Prepare Offline Maps → PREPARE OFFLINE MAPS
```

Place self-hosted tiles in `public/offline/tiles/` first for best results.

## PMTiles support

Contour archives can be served as a single file:

```env
VITE_CONTOUR_TILES_URL=/api/offline/pmtiles/contours/{z}/{x}/{y}.pbf
```

Place `contours.pmtiles` in `public/offline/tiles/` — served at `/api/offline/pmtiles/contours/{z}/{x}/{y}.pbf` when offline.

## MBTiles / tileserver-gl

For large archives, run the sidecar:

```bash
docker compose -f docker-compose.offline.yml up
```

Serves MBTiles from `public/offline/tiles/` at `http://localhost:8080`.

## Code integration

- `src/offline/tileCache.ts` — IndexedDB tile store
- `src/offline/prefetchAoTiles.ts` — AO tile enumeration + fetch
- `src/offline/offlinePrep.ts` — prep orchestration + UI status
- `public/sw.js` — fetch interceptor (cache-first)
- `src/offline/pmtilesProtocol.ts` — PMTiles protocol for Mapbox GL

## Future work

- Automatic cache eviction / size limits
- One-click MBTiles export script for Singapore AO
