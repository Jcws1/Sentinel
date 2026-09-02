# Basemap

The console must boot on a disconnected edge node, so **no file in this project
may reference a tile CDN**. Both styles here resolve entirely off-box.

## The two styles

| Style             | Needs a tile bundle | Used when                                        |
| ----------------- | ------------------- | ------------------------------------------------ |
| `style.void.json` | no                  | nothing provisioned — empty geographic void      |
| `style.dark.json` | yes                 | a bundle is present at `VITE_BASEMAP_URL`        |

`style.void.json` is the floor. It declares no sources, no glyphs and no
sprite, so it cannot make a network request and cannot fail. deck.gl overlays
render over it correctly — tracks, corridors and geofences are still fully
usable with no imagery underneath, which is the degraded mode an edge node
actually falls back to.

`style.dark.json` carries `{BASEMAP_URL}` placeholders in its `sources`,
`glyphs` and `sprite` fields. `src/map/basemap.ts` fetches the style JSON and
substitutes them at load time, so the deployed style file is
node-independent — the same artifact ships everywhere and the environment
supplies the address.

## Dropping in self-hosted tiles

1. Produce or obtain an OpenMapTiles-schema vector tileset (`.mbtiles` or a
   `z/x/y` directory) covering the operating area.
2. Serve it from the node. Anything that speaks TileJSON works — `tileserver-gl`,
   `martin`, or a static directory behind nginx. It must serve:
   - `tiles.json` (TileJSON descriptor)
   - `glyphs/{fontstack}/{range}.pbf` — at minimum the `Noto Sans Regular`
     stack referenced by `place-label`
   - `sprite.json` / `sprite.png`
3. Point the console at it:
   ```
   VITE_BASEMAP_URL=http://127.0.0.1:8080/data/v3
   ```
4. Restart. `basemap.ts` selects `style.dark.json` automatically once the
   variable is set.

If the variable is unset, or the bundle fails to load, the console falls back
to the void style rather than showing a broken map. A missing basemap must
never be able to take the console down.

## Using a different tile schema

The layer list in `style.dark.json` assumes OpenMapTiles `source-layer` names
(`water`, `transportation`, `boundary`, `place`, …). For a different schema,
replace the `layers` array; leave the `{BASEMAP_URL}` placeholders and the
`#0a0b0d` background alone — the background must match `--color-surface-0` or
the map edge will seam against the app ground during pan.
