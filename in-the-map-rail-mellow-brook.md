# Offline SE Asia 3D pack — Sentinel v2

## Context

Three questions prompted this, and the answers change what we build:

**1. What differs between "Global 3D — free" and "Global 3D — MapTiler"?**
Checked in `src/map/sources.ts`: *nothing except the DEM*. Both use the
identical basemap (`https://tiles.openfreemap.org/styles/positron`). The only
difference is where elevation comes from.

| | free (Mapterhorn) | MapTiler |
| --- | --- | --- |
| Encoding | `terrarium` | `mapbox` |
| Tile size | 512 px | 512 px |
| Max zoom | **z12** (z13/z14 → 404, verified) | **z14** |
| Credential | none | API key |
| Downloadable | **yes**, CC BY 4.0 | **no** on the free tier |

**2. Which is more accurate?** Measured, not assumed — Mapterhorn z12 tiles
decoded directly and compared against known summits:

| Point | Decoded | Known | Δ |
| --- | --- | --- | --- |
| Bukit Timah, SG | 176.5 m | ~164 m | **+7.6%** |
| Gunung Ledang, MY | 1127 m | ~1276 m | **−11.7%** |
| Marina Bay, SG | 9.5 m | ~5 m | +4.5 m |

Taking the max over a ±3 px window barely moved these, so the Gunung Ledang
shortfall is **genuine smoothing of a sharp peak by a ~30 m DEM**, not a
sampling artefact. The consistent over-read on forested/built ground
(Bukit Timah, Marina Bay) is the signature of a **DSM — surface including
canopy and buildings — not a bare-earth DTM**.

**Verdict: for this operating area they are the same data.** Both are
Copernicus-GLO-30-class ~30 m global elevation over Malaysia and Singapore.
MapTiler's two extra zoom levels are *interpolation* — a smoother-looking
surface, not more information — unless they have licensed higher-resolution
national data for the region, which they have not published for MY/SG. Paying
buys deeper zoom and an SLA, not better accuracy here.

**Operational caveat to carry forward:** displayed terrain is a display
product. Anything computing line-of-sight or intercept geometry must read the
DEM directly and account for DSM-vs-DTM, never infer height from the screen.

**3. Why do free packs need internet, and can the tiles be downloaded?**
"Free" means free to *use*, not pre-installed — the tiles are hosted and the
browser fetches them per view. And both packs stream **two** things: the
OpenFreeMap basemap *and* the DEM. Localising only the terrain still leaves
the pack `NEEDS NET`.

- **Mapterhorn — yes, genuinely downloadable.** CC BY 4.0, published as
  PMTiles, `pmtiles extract` pulls a bbox from the 706 GB planet over HTTP
  range requests. No key, no ToS obstacle.
- **MapTiler — no, not from the free tier.** Hosted tiles are licensed for
  streaming through your key; bulk download/caching is prohibited. Offline
  requires buying their on-prem dataset. This is why the free option, not the
  paid one, is the route to an offline pack.

**Outcome:** build one genuinely offline SE Asia 3D pack — Protomaps basemap +
Mapterhorn terrain, both local, both PMTiles, both free.

---

## Disk space

`C:` now has **24.5 GB free** (was 0.6 GB). Enough — the two archives plus
working room. Bbox is `99.0,-1.5 → 105.5,7.0`: Peninsular Malaysia, Singapore,
Johor, Riau — chosen because it has real relief (Cameron Highlands ~2,000 m,
Gunung Ledang 1,276 m) where Singapore alone tops out at 164 m.

| Archive | Tiles | Estimate |
| --- | --- | --- |
| Mapterhorn terrain, z0–12 | 9,928 | ~500 MB (ceiling) |
| Protomaps basemap, z0–13 | 38,983 | ~300–800 MB |
| Protomaps basemap, z0–14 | 154,516 | ~1–3 GB |

Start at **z13** for the basemap. Each extra zoom roughly doubles the file
(Protomaps' own guidance); z13 already gives street-level context, and z14 is
the upgrade if the size is acceptable. `pmtiles extract` prints the true size.

---

## Steps

### 1. Download the pmtiles CLI — the only actual download

Verified current release:

**`go-pmtiles_1.31.2_Windows_x86_64.zip`** (17.8 MB)
`https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Windows_x86_64.zip`

Unzip and put `pmtiles.exe` anywhere on PATH. This is the Go binary — **not**
the `pmtiles` npm package already in `node_modules`, which is the browser
protocol only and has no `extract` subcommand.

### 2. Run the two extracts

**Neither planet archive is downloaded.** `pmtiles extract` reads the remote
file over HTTP range requests and pulls only the tiles inside the bbox — the
137.7 GB and 706 GB figures below are the size of the *source*, not the
transfer. Verified: both hosts return `Accept-Ranges: bytes`.

```powershell
# Terrain — Mapterhorn, CC BY 4.0, terrarium-encoded, z0-12
pmtiles extract https://download.mapterhorn.com/planet.pmtiles `
  seasia-terrain.pmtiles --bbox=99.0,-1.5,105.5,7.0 --download-threads=4

# Basemap — Protomaps daily build, ODbL, Protomaps schema
pmtiles extract https://build.protomaps.com/20260901.pmtiles `
  seasia-base.pmtiles --bbox=99.0,-1.5,105.5,7.0 --maxzoom=13 --download-threads=4
```

**The build date must be current.** Daily builds live at
`https://build.protomaps.com/YYYYMMDD.pmtiles` and are retained about a week —
verified: `20260901` through `20260828` return 200, `20260825` is already 404.
Use yesterday's date or newer.

Place both files in `public/edge-map/data/` — already covered by the
`public/edge-map/data/` rule in `.gitignore`.

### 3. Reuse the v1 style rather than authoring one

`public/edge-map/style.json` is 70 tuned dark Protomaps-schema layers already
matching the console. It hardcodes its vector source to
`pmtiles:///edge-map/data/singapore.pmtiles`. Rather than copy the file, add an
optional `basemapSourceOverride` to `SourcePack` and apply it in
`buildMapStyle()` — rewriting the `sentinel-buildings` source URL to the SE
Asia archive. One field, no duplicated style, and the existing
`neutraliseLabels` / `extrudeBuildings` transforms keep working unchanged.

### 4. Add the pack

New entry in `SOURCE_PACKS` (`src/map/sources.ts`), following the shape the
other four already use:

```ts
{
  id: 'seasia',
  label: 'SE Asia 3D — offline',
  renderer: 'vector',
  offline: true,                       // both halves are local
  basemapStyle: EDGE.style,            // reuse v1's dark style
  basemapSourceOverride: 'pmtiles:///edge-map/data/seasia-base.pmtiles',
  bounds: [99.0, -1.5, 105.5, 7.0],
  terrain: {
    url: 'pmtiles:///edge-map/data/seasia-terrain.pmtiles',
    encoding: 'terrarium',             // Mapterhorn, NOT mapbox
    tileSize: 512,
    maxzoom: 12,
    attribution: '© Mapterhorn (CC BY 4.0)',
  },
  attribution: 'OpenStreetMap contributors / Protomaps · © Mapterhorn',
}
```

**`encoding` is the field to get right.** Copernicus (the existing edge pack)
is `mapbox`; Mapterhorn is `terrarium`. Decoding one as the other yields
confidently wrong elevations rather than an error.

No change needed in `MapCanvas.tsx`: `registerPmtilesProtocol()` already
handles `pmtiles://`, terrain is already applied via `setTerrain()` after
`style.load`, and `ensureTerrainSource()` already reads every field from the
pack's `TerrainSpec`.

### 5. Retire the redundant option

Once this lands, `terrain-hd` (MapTiler) earns its place only if you actually
buy a key — it is strictly worse than this pack for the operating area and
cannot go offline. Consider dropping it, or keep it as the documented paid
path.

---

## Files to modify

- `src/map/sources.ts` — `basemapSourceOverride` field + the new pack (main change)
- `src/map/mapStyle.ts` — apply the override in `loadBaseStyle`/`buildMapStyle`
- `public/edge-map/data/` — the two extracts (gitignored)
- `src/views/MapView.tsx` — no change; packs render from `SOURCE_PACKS`

## Verification

1. `npm run dev`, open the Map panel (Alt 2), select **SE Asia 3D — offline**.
   The badge must read `OFFLINE` with no `KEY REQUIRED`.
2. Coverage row should read `99.00°E 1.50°S → 105.50°E 7.00°N` via the existing
   `formatBounds` in `src/lib/format.ts`.
3. **Encoding truth check** in the console — a wrong `encoding` shows up here
   as a confidently wrong number, so check a summit, never sea level:
   ```js
   __map.queryTerrainElevation([102.6117, 2.3767])   // Gunung Ledang
   ```
   Expect ≈ 1127 m × the view mode's exaggeration (≈1690 at 1.5×), matching
   the measured value in the table above. Anything wildly different means the
   terrarium/mapbox encoding is crossed.
4. **Prove it is really offline** — the check that matters. With the pack
   selected, in DevTools:
   ```js
   performance.getEntriesByType('resource')
     .filter(r => !r.name.includes('localhost:7000'))
   ```
   Must return `[]`. This is the same check that verified the photoreal
   isolation; it returned zero external hosts for the edge pack.
5. Pan to Cameron Highlands (101.38, 4.47) in Tactical 3D — relief should be
   visibly legible, which is the whole reason for widening beyond Singapore.
6. Console must stay clean. The `shaderPreludeCode` terrain storm was ~120
   errors/sec while still rendering, so a silent regression is possible.

## Sources

- [Mapterhorn](https://mapterhorn.com/) · [Protomaps write-up](https://protomaps.com/blog/mapterhorn-terrain/)
- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads) (planet ~120 GB, z0–15, ODbL)
- [MapTiler Terrain RGB](https://docs.maptiler.com/guides/map-tiling-hosting/data-hosting/rgb-terrain-by-maptiler/) (z0–14, ~30 m source)
- [go-pmtiles releases](https://github.com/protomaps/go-pmtiles/releases)
