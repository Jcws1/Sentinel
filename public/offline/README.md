# Offline map tiles for Sentinel C2

Place self-hosted tiles here so the UI works without Mapbox cloud when `VITE_OFFLINE_MODE=true` or the browser is offline.

## Directory layout

```
public/offline/
  styles/
    sentinel-ops.json          # Minimal (no tiles required)
    sentinel-satellite.json    # Raster basemap from local tiles
  tiles/
    dem/{z}/{x}/{y}.png        # Terrain-RGB DEM (Mapbox or Terrarium encoding)
    satellite/{z}/{x}/{y}.png  # Satellite / aerial raster
    vector/{z}/{x}/{y}.pbf     # Optional OSM vector tiles
    contours.pmtiles           # Optional local contour vectors
```

## Quick offline test (no tiles)

1. Set in `.env`:
   ```
   VITE_OFFLINE_MODE=true
   ```
2. `npm run dev` — map uses `sentinel-ops.json` (dark background) + operator overlays (drones, threats, bases).

## With tiles (recommended for GNSS-degraded ops)

### Option A — SLA / OneMap DEM (Singapore, ~2 m)

1. Obtain GeoTIFF DEM for Singapore (SLA OneMap / your agency export).
2. Convert to Terrain-RGB PNG tiles:
   ```bash
   # Example: Mapbox encoding via rio-mbtiles or gdal
   rio mbtiles input.tif output.mbtiles --format PNG --zoom-levels 10..14
   # Or use tileserver-gl to serve MBTiles at http://localhost:8080
   ```
3. Export XYZ tiles into `tiles/dem/{z}/{x}/{y}.png`.
4. `.env`:
   ```
   VITE_OFFLINE_MODE=true
   VITE_DEM_TILES_URL=/offline/tiles/dem/{z}/{x}/{y}.png
   VITE_DEM_ENCODING=mapbox
   ```

### Option B — SRTM / Copernicus (30 m, global)

1. Download SRTM tile covering Singapore.
2. Convert with Terrarium encoding.
3. `.env`:
   ```
   VITE_DEM_ENCODING=terrarium
   VITE_DEM_TILES_URL=/offline/tiles/dem/{z}/{x}/{y}.png
   ```

### Option C — Satellite raster (Sentinel-2 / aerial)

1. Mosaic your AO to GeoTIFF.
2. `gdal2tiles.py -z 10-17 mosaic.tif public/offline/tiles/satellite`
3. Use `sentinel-satellite.json` style (default when offline + satellite basemap).

### Option D — OSM vector (roads, water, buildings)

1. Extract Singapore from Geofabrik OSM PBF.
2. `tippecanoe -o sg.mbtiles singapore.osm.pbf -Z10 -z16`
3. Serve with [tileserver-gl](https://github.com/maptiler/tileserver-gl) or extract to `tiles/vector/`.

### Option E — Prefetch while online (persistent)

Menu → **Prepare Offline Maps**, or programmatically:

```ts
import { prepareOfflineMaps } from './offline/offlinePrep'
await prepareOfflineMaps(map)
```

Tiles persist in IndexedDB across browser restarts via the service worker.

## Env reference

| Variable | Purpose |
|----------|---------|
| `VITE_OFFLINE_MODE` | Force local tile paths |
| `VITE_MAP_STYLE_URL` | Override style JSON path |
| `VITE_DEM_TILES_URL` | DEM tile template |
| `VITE_DEM_ENCODING` | `mapbox` or `terrarium` |
| `VITE_SATELLITE_TILES_URL` | Raster basemap template |
| `VITE_VECTOR_TILES_URL` | Vector tile template |
| `VITE_CONTOUR_TILES_URL` | Contour vector source |

## C2 backend offline

The operator loop runs fully local:
```bash
npm run dev    # UI :5173 + API :3001 on localhost
# or production:
npm run build && npm start   # serve dist/ + API :3001
```
No external network required except map tiles (unless using offline tiles above).

## Mapbox token

- **Online:** `VITE_MAPBOX_TOKEN` required for cloud styles/DEM.
- **Fully offline:** omit token; use `VITE_OFFLINE_MODE=true` and local tiles/style.

See `docs/offline-maps.md` for full dataset catalog and production deployment notes.
