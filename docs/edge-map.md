# Sentinel Edge map

Edge deployment uses MapLibre GL JS and never falls back to Mapbox. Cloud deployment continues to use the existing Mapbox implementation.

## Runtime contract

The C2 backend serves the active pack from `EDGE_MAP_ROOT`, defaulting to `./edge-map`:

- `/edge-map/style.json` - MapLibre style specification
- `/edge-map/data/*` - local source data and tiles
- `/api/v1/edge-map/health` - active-pack identity, coverage and freshness
- `/api/v1/sensors/cdse` - hourly CDSE catalogue-poll status

Run `npm run edge-map:verify` before deploying a pack. Verification rejects external HTTP and `mapbox://` resources so Edge mode cannot accidentally depend on the internet.

## Pack replacement

The bundled pack covers Singapore, nearby Johor and the surrounding operational area.
Replacement packs should retain these stable source IDs:

- `sentinel-buildings`
- `sentinel-terrain`

`sentinel-buildings` is the complete local Protomaps basemap source; expose building
features through its `buildings` source-layer. `sentinel-terrain` contains locally
encoded Copernicus DEM tiles.

Use a temporary directory when installing a new pack, verify it, then atomically update `EDGE_MAP_ROOT`. Keep the previous pack available for rollback. Expired `refreshAfter` dates produce a stale warning but never disable the map.

## Production data pipeline

1. Extract the operating bounds from a pinned Protomaps daily PMTiles build.
2. Install the matching offline font and sprite assets.
3. Generate the Mapbox-dark-matched MapLibre style while preserving source IDs.
4. Convert Copernicus DEM GLO-30 into local Terrain-RGB, Terrarium, or custom-encoded raster DEM tiles.
5. Optionally render selected CDSE Sentinel imagery into local raster tiles.
6. Update the manifest, checksums and `refreshAfter` date.
7. Run the verifier and visual regression checks before installation.

The bundled production pack includes Copernicus DEM GLO-30 terrain through zoom 12.
MapLibre overzooms that static elevation surface at closer camera levels. Cloud mode
retains the existing Mapbox behavior.

## CDSE monitoring

The backend queries the public CDSE STAC catalogue at startup and once per hour for
Copernicus DEM GLO-30 coverage over `CDSE_COVERAGE_BBOX`. The Sensors workspace shows
the last attempt, the last error, and the number of matching DEM items. A poll failure
never disables the installed Edge map.

### Poll history database

Every completed catalogue poll is stored in the embedded SQLite database at
`./data/sentinel.sqlite` by default. Set `SENTINEL_DATA_DIR` to move that persistent
directory without changing the application. SQLite WAL, shared-memory and journal
files are ignored by Git alongside the main database.

The database keeps 90 days by default, configurable with
`CDSE_HISTORY_RETENTION_DAYS`. The backend prunes expired records after startup and
after each insert. It stores poll timestamps, success or error status, response time,
matched item count, error message, collection and coverage bounds. Credentials are
never written to SQLite.

`GET /api/v1/sensors/cdse/history?window=30d` returns chronological points plus poll
count, failures, success rate and average response time. Supported windows are `24h`,
`7d`, `30d` and `90d`. Mobile and browser clients consume this endpoint; they do not
open the SQLite file directly.

The DEM is static map-pack data, not a live sensor feed. Catalogue polling therefore
does not download elevation data. Run `scripts/provision-cdse-terrain.py` in the
temporary geospatial environment when rebuilding the pack. It downloads the matching
DEM COGs, converts them to Mapbox-encoded raster DEM PNGs and installs them locally.
Edge runtime then serves those tiles without contacting CDSE.

```powershell
python -m venv edge-map-tools
edge-map-tools\Scripts\python -m pip install -r scripts\requirements-edge-map.txt
edge-map-tools\Scripts\python scripts\provision-cdse-terrain.py
npm run edge-map:style
npm run edge-map:verify
```

Keep the tool environment outside the deployed application. CDSE credentials remain
in `.env.local` and are only read by the provisioning script and backend.
