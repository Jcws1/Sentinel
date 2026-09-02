import type {
  StyleSpecification,
  LayerSpecification,
  FillLayerSpecification,
  FillExtrusionLayerSpecification,
} from 'maplibre-gl'

import { getPack, type SourcePack, type SourcePackId } from './sources'
import type { ViewMode } from './viewModes'

/* ===========================================================================
   STYLE ASSEMBLY

   The base style is loaded, not authored: the v1 edge pack ships 70 tuned
   dark layers and rewriting them would only lose work. What this module does
   is apply the view mode on top — terrain, extrusion and decluttering — so
   one style file serves every mode.

   Schema-agnostic by design. Protomaps names its layers `buildings` / `pois`,
   OpenMapTiles names them `building` / `poi`, and the transforms below match
   on source-layer so the same code drives both packs.
=========================================================================== */

const TERRAIN_SOURCE = 'sentinel-terrain'
const HILLSHADE_LAYER = 'terrain-hillshade'

/** Source-layer names meaning "building footprint", across both schemas. */
const BUILDING_LAYERS = new Set(['buildings', 'building'])
/** Source-layer names meaning "point of interest", across both schemas. */
const POI_LAYERS = new Set(['pois', 'poi'])

/**
 * A style with nothing in it.
 *
 * Used for the photoreal pack, where deck.gl draws the world and MapLibre is
 * reduced to a camera host: a transparent background lets the mesh show
 * through, where the void style's opaque fill would hide it completely.
 */
function transparentHostStyle(): StyleSpecification {
  return { version: 8, sources: {}, layers: [] }
}

async function loadBaseStyle(pack: SourcePack): Promise<StyleSpecification> {
  if (!pack.basemapStyle) return transparentHostStyle()

  let response: Response
  try {
    response = await fetch(pack.basemapStyle)
  } catch {
    // fetch() rejects with a bare "Failed to fetch" for DNS failure, no route,
    // CORS and extension blocking alike — useless on its own. Name the host
    // and the likely cause, because on an edge node "which thing is
    // unreachable" is the whole question.
    throw new Error(
      `Cannot reach ${new URL(pack.basemapStyle, location.href).host}. ` +
        `The "${pack.label}" pack needs a network route; the node may be ` +
        `offline or the request blocked.`,
    )
  }

  if (!response.ok) {
    throw new Error(
      `Basemap style for "${pack.label}" responded ${response.status}.`,
    )
  }

  const style = (await response.json()) as StyleSpecification

  // Repoint the vector source, so one style file can serve several archives.
  // Only PMTiles sources are rewritten: those are ours to swap, where an http
  // source belongs to whoever published the style.
  if (pack.basemapSourceOverride) {
    for (const source of Object.values(style.sources)) {
      if (
        source.type === 'vector' &&
        typeof source.url === 'string' &&
        source.url.startsWith('pmtiles://')
      ) {
        source.url = pack.basemapSourceOverride
      }
    }
  }

  return style
}

/**
 * Turn a flat building fill into an extrusion.
 *
 * The height data was already in the pack — Protomaps carries OSM `height`
 * and `min_height` on every footprint — v1 simply drew it as a 2D fill. The
 * coalesce fallback matters: a large share of OSM buildings carry no height
 * tag at all, and without it those footprints extrude to zero and vanish,
 * which reads as missing buildings rather than missing metadata.
 */
type BuildingLayer = FillLayerSpecification | FillExtrusionLayerSpecification

function extrudeBuildings(layer: BuildingLayer): LayerSpecification {
  return {
    id: layer.id,
    type: 'fill-extrusion',
    source: layer.source,
    'source-layer': layer['source-layer'],
    ...(layer.filter ? { filter: layer.filter } : {}),
    // Extrusion is expensive and meaningless when a building is a few pixels
    // wide, so it only switches on at neighbourhood zoom.
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#1d222b',
      'fill-extrusion-height': [
        'coalesce',
        ['get', 'height'],
        ['get', 'render_height'],
        6,
      ],
      'fill-extrusion-base': [
        'coalesce',
        ['get', 'min_height'],
        ['get', 'render_min_height'],
        0,
      ],
      'fill-extrusion-opacity': 0.9,
      // Fade the extrusion in across one zoom level; popping into existence
      // at exactly z14 reads as a glitch.
      'fill-extrusion-vertical-gradient': true,
    },
  } as LayerSpecification
}

/** Type predicate so the extrusion rewrite gets a layer that has a source. */
function isBuildingLayer(layer: LayerSpecification): layer is BuildingLayer {
  if (layer.type !== 'fill' && layer.type !== 'fill-extrusion') return false
  const sourceLayer = layer['source-layer']
  return !!sourceLayer && BUILDING_LAYERS.has(sourceLayer)
}

function isPoiLayer(layer: LayerSpecification): boolean {
  if (layer.type === 'background') return false
  const sourceLayer = layer['source-layer']
  return !!sourceLayer && POI_LAYERS.has(sourceLayer)
}

/**
 * Strip hue from basemap labels.
 *
 * The v1 style inherits Protomaps' consumer palette, which colour-codes POI
 * labels by category — pink for theatres, green for parks, cyan for transit.
 * That is good cartography and wrong here: this console reserves colour for
 * domain state so that when something goes amber the operator can trust it
 * means something. A basemap that spends colour on restaurant names spends
 * the budget the signal palette needs.
 *
 * Labels are re-tinted onto the white ramp instead, weighted so places read
 * louder than POIs.
 */
function neutraliseLabels(layer: LayerSpecification): LayerSpecification {
  if (layer.type !== 'symbol') return layer

  const sourceLayer = layer['source-layer']
  const textColor =
    sourceLayer === 'places'
      ? 'rgba(255,255,255,0.74)'
      : sourceLayer === 'pois'
        ? 'rgba(255,255,255,0.40)'
        : 'rgba(255,255,255,0.55)'

  return {
    ...layer,
    paint: {
      ...(layer.paint ?? {}),
      'text-color': textColor,
      // A halo in the ground colour is what keeps 11px labels legible over
      // extruded buildings without adding a second tone.
      'text-halo-color': '#06070a',
      'text-halo-width': 1.1,
      ...(layer.paint && 'icon-color' in layer.paint
        ? { 'icon-color': textColor }
        : {}),
    },
  } as LayerSpecification
}

function hidden(layer: LayerSpecification): LayerSpecification {
  return {
    ...layer,
    layout: { ...(layer.layout ?? {}), visibility: 'none' },
  } as LayerSpecification
}

/**
 * Inject the pack's raster-dem source, returning its id or null.
 *
 * Every field comes from the pack's own TerrainSpec rather than being
 * hardcoded here, because the specs genuinely differ: 256px Mapbox-encoded
 * PNG for Copernicus, 512px terrarium WebP for Mapterhorn. Getting `encoding`
 * wrong yields confidently wrong elevations rather than an error — see the
 * note at the top of sources.ts.
 *
 * The edge style already declares its own terrain source, so it is replaced
 * in place to keep a single id for setTerrain to target.
 */
function ensureTerrainSource(
  style: StyleSpecification,
  pack: SourcePack,
): string | null {
  const spec = pack.terrain
  if (!spec) return null

  style.sources[TERRAIN_SOURCE] = {
    type: 'raster-dem',
    ...(spec.url ? { url: spec.url } : { tiles: spec.tiles ?? [] }),
    tileSize: spec.tileSize,
    ...(spec.minzoom !== undefined ? { minzoom: spec.minzoom } : {}),
    maxzoom: spec.maxzoom,
    ...(spec.bounds ? { bounds: [...spec.bounds] } : {}),
    encoding: spec.encoding,
    attribution: spec.attribution,
  }

  // TERRAIN_SOURCE deliberately matches the id the v1 edge style already uses
  // for its DEM, so its hillshade layer keeps resolving after the swap.
  return TERRAIN_SOURCE
}

export interface TerrainConfig {
  source: string
  exaggeration: number
}

export interface BuiltStyle {
  style: StyleSpecification
  /** Applied via map.setTerrain AFTER style load — never inside the style. */
  terrain: TerrainConfig | null
}

/**
 * Build the style for a pack and view mode.
 *
 * Returns a complete StyleSpecification rather than mutating a live map,
 * because switching packs has to swap sources wholesale anyway — and a single
 * setStyle is atomic where a sequence of add/remove calls can leave the map
 * in a half-applied state if one throws.
 *
 * Terrain comes back SEPARATELY and deliberately. Declaring `terrain` inside
 * the style object makes MapLibre run its terrain depth pass against a source
 * whose GPU programs are not built yet, and it throws on
 * `shaderPreludeCode` every single frame — verified here, ~120 errors/sec,
 * while the map still renders so the failure is silent unless you open the
 * console. Applying it after `style.load` sequences it correctly.
 */
export async function buildMapStyle(
  packId: SourcePackId,
  mode: ViewMode,
): Promise<BuiltStyle> {
  const pack = getPack(packId)
  const style = await loadBaseStyle(pack)

  // Photoreal supplies its own geometry and textures. No vector transforms,
  // no MapLibre terrain, and deliberately no label neutralising — the whole
  // point of the mode is that it looks like the real thing.
  if (pack.renderer === 'photoreal') {
    return { style, terrain: null }
  }

  const terrainSource = ensureTerrainSource(style, pack)

  style.layers = style.layers.map((layer) => {
    if (layer.id === HILLSHADE_LAYER) {
      return mode.hillshade ? layer : hidden(layer)
    }
    if (isBuildingLayer(layer)) {
      return mode.buildings3d ? extrudeBuildings(layer) : layer
    }
    if (isPoiLayer(layer)) {
      return mode.pois ? neutraliseLabels(layer) : hidden(layer)
    }
    return neutraliseLabels(layer)
  })

  // Never leave a terrain block on the style itself; see the note above.
  delete style.terrain

  const terrain: TerrainConfig | null =
    mode.terrain && terrainSource
      ? { source: terrainSource, exaggeration: mode.terrainExaggeration }
      : null

  // The style file carries v1's saved camera. The map owns the camera here,
  // so strip it — otherwise every style swap yanks the operator back to the
  // CBD mid-task.
  delete style.center
  delete style.zoom
  delete style.bearing
  delete style.pitch

  return { style, terrain }
}
