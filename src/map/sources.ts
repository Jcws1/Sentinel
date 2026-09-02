import type { Bounds } from '@/lib/format'

/* ===========================================================================
   MAP SOURCES

   Hard rule, unchanged: the console must boot and stay usable with no
   network. That is why packs are graded by `offline` and why the one pack
   that cannot ever satisfy it — Google photorealistic mesh — is quarantined
   behind its own renderer and a dynamic import, so nothing it needs is even
   downloaded unless an operator deliberately selects it.

   Two axes, deliberately separated:
     renderer  how the world is drawn — a vector basemap, or a streamed mesh
     terrain   where elevation comes from, if anywhere

   ENCODING IS NOT INTERCHANGEABLE. Terrain-RGB comes in two flavours and
   decoding one as the other produces plausible-looking but wrong elevations
   rather than an error — the worst failure mode on a map used for routing.
   Copernicus (the v1 pipeline) is `mapbox`; Mapterhorn is `terrarium`. Every
   spec below states its own.
=========================================================================== */

export type SourcePackId =
  | 'edge'
  | 'seasia'
  | 'terrain-free'
  | 'photoreal'
  | 'void'

/**
 * How the pack paints the world.
 * - `vector`   MapLibre vector basemap, optionally draped over a DEM.
 * - `photoreal` streamed 3D Tiles mesh drawn by deck.gl; MapLibre is reduced
 *   to a transparent camera host, because a photogrammetry mesh already
 *   contains the ground, the buildings and their textures.
 */
export type PackRenderer = 'vector' | 'photoreal'

/**
 * Which credential a pack needs, if any.
 *
 * Only Google remains: the MapTiler terrain pack was removed because it was
 * measurably the same ~30m data as Mapterhorn over this operating area, and a
 * pack that needs a key, cannot go offline, and is no more accurate is a
 * liability rather than an option.
 */
export type KeyRequirement = 'google' | 'ion'

export interface TerrainSpec {
  /** XYZ template, or a pmtiles:// URL via `url`. */
  tiles?: string[]
  url?: string
  encoding: 'mapbox' | 'terrarium'
  tileSize: number
  minzoom?: number
  maxzoom: number
  bounds?: Bounds
  attribution: string
}

export interface SourcePack {
  id: SourcePackId
  label: string
  renderer: PackRenderer
  /** True only if every byte resolves off-box. */
  offline: boolean
  requiresKey?: KeyRequirement
  description: string
  /** Base style URL. Null for photoreal, which supplies its own geometry. */
  basemapStyle: string | null
  /**
   * Repoint the style's vector source at a different archive.
   *
   * Lets a pack reuse an existing style file wholesale rather than cloning it.
   * The v1 edge style is 70 tuned dark layers against the Protomaps schema;
   * any Protomaps-schema archive can be swapped underneath it, so a wider
   * extract inherits the whole design and every transform in mapStyle.ts.
   */
  basemapSourceOverride?: string
  terrain: TerrainSpec | null
  /** Where the pack has data at all. Absent means worldwide. */
  bounds?: Bounds
  /** On-disk size of the local archives, MB. Local packs only. */
  footprintMB?: number
  /** Which elevation dataset, named — provenance matters more than pixels. */
  demLabel?: string
  /**
   * Hosts this pack contacts, for the operator to see BEFORE selecting it.
   * Empty for offline packs. This is the honest answer to "why does it need
   * the internet" — it names what is fetched rather than asserting a badge.
   */
  needs?: string[]
  attribution: string
}

/* --- credentials -------------------------------------------------------- */

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ''

/**
 * Optional local Mapterhorn extract. Set VITE_TERRAIN_PMTILES to a path like
 * `pmtiles:///edge-map/data/seasia-terrain.pmtiles` and the free terrain pack
 * flips from streaming to fully offline with no other change — which is the
 * "self-hosted tiles can be dropped in" requirement, honoured for elevation
 * as well as for the basemap.
 */
const LOCAL_TERRAIN = import.meta.env.VITE_TERRAIN_PMTILES ?? ''

export function keyFor(requirement: KeyRequirement): string {
  return requirement === 'google' ? GOOGLE_KEY : ION_TOKEN
}

/**
 * Photoreal needs EITHER credential — it resolves Google direct first and
 * falls back to ion — so a pack requiring 'google' is satisfied by either.
 */
export function hasKey(pack: SourcePack): boolean {
  if (!pack.requiresKey) return true
  if (pack.renderer === 'photoreal') {
    return GOOGLE_KEY.length > 0 || ION_TOKEN.length > 0
  }
  return keyFor(pack.requiresKey).length > 0
}

/* --- the local edge pack ------------------------------------------------ */

export const EDGE_BOUNDS: Bounds = [103.45, 1.1, 104.25, 1.65]

/**
 * Peninsular Malaysia, Singapore, Johor, Riau.
 *
 * Chosen for relief, not just area: Cameron Highlands ~2,000m and Gunung
 * Ledang 1,276m give terrain something to show, where Singapore alone tops
 * out at 164m and renders nearly flat at any exaggeration.
 */
export const SEASIA_BOUNDS: Bounds = [99.0, -1.5, 105.5, 7.0]

/**
 * Hard camera clamp for the photoreal mode: Singapore, Johor Bahru, and the
 * northern Riau islands.
 *
 * This is a COST CONTROL, not a data boundary — Google's mesh is global.
 * Photoreal tiles bill per request, and the cheapest request is the one never
 * made, so the camera is fenced to the operating area and prevented from
 * zooming out (see PHOTOREAL_MIN_ZOOM). A camera that cannot wander cannot
 * run up a bill.
 */
export const PHOTOREAL_BOUNDS: Bounds = [103.55, 1.1, 104.15, 1.55]

/**
 * Floor on zoom while photoreal is active.
 *
 * Zooming out is the expensive direction: a wider view pulls far more tiles
 * across the whole visible extent. z12 shows roughly the clamped area edge to
 * edge, so there is nothing to gain below it anyway.
 */
export const PHOTOREAL_MIN_ZOOM = 12

export const EDGE = {
  root: '/edge-map',
  manifest: '/edge-map/manifest.json',
  style: '/edge-map/style.json',
  basemap: 'pmtiles:///edge-map/data/singapore.pmtiles',
  bounds: EDGE_BOUNDS,
} as const

/* --- pack definitions --------------------------------------------------- */

export const SOURCE_PACKS: readonly SourcePack[] = [
  {
    id: 'edge',
    label: 'Edge pack',
    renderer: 'vector',
    offline: true,
    description:
      'Minimal footprint, single-provenance DEM. Same accuracy as the SE Asia ' +
      'pack over Singapore, at 1/24th the size — the one to provision when ' +
      'storage or transfer is tight.',
    basemapStyle: EDGE.style,
    bounds: EDGE_BOUNDS,
    terrain: {
      tiles: ['/edge-map/data/terrain/{z}/{x}/{y}.png'],
      // Baked to Mapbox Terrain-RGB by the Sentinel v1 pipeline.
      encoding: 'mapbox',
      tileSize: 256,
      minzoom: 8,
      maxzoom: 12,
      bounds: EDGE_BOUNDS,
      attribution: 'Copernicus DEM GLO-30 / European Union',
    },
    footprintMB: 41,
    demLabel: 'Copernicus GLO-30',
    needs: [],
    attribution: 'OpenStreetMap contributors / Protomaps · Copernicus GLO-30',
  },

  {
    id: 'terrain-free',
    label: 'Global 3D — free',
    renderer: 'vector',
    // Flips to true the moment a local extract is configured.
    offline: LOCAL_TERRAIN.length > 0,
    description: LOCAL_TERRAIN
      ? 'OpenFreeMap vector over a local Mapterhorn extract. Keyless.'
      : 'OpenFreeMap vector over Mapterhorn global terrain. Keyless, ' +
        'CC BY 4.0, worldwide. 512px tiles ≈ 2× the edge pack’s resolution.',
    basemapStyle: 'https://tiles.openfreemap.org/styles/positron',
    terrain: {
      ...(LOCAL_TERRAIN
        ? { url: LOCAL_TERRAIN }
        : { tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'] }),
      // Mapterhorn serves terrarium, NOT mapbox. Verified from its TileJSON.
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: 12,
      attribution: '© Mapterhorn (CC BY 4.0)',
    },
    demLabel: 'Mapterhorn (blended open DEMs)',
    needs: ['tiles.openfreemap.org', 'tiles.mapterhorn.com'],
    attribution: 'OpenStreetMap contributors · © Mapterhorn',
  },

  {
    id: 'seasia',
    label: 'SE Asia 3D — offline',
    renderer: 'vector',
    // Both halves are local: nothing here touches the network.
    offline: true,
    description:
      'Wide-area offline pack. Supersedes the edge pack on coverage, DEM ' +
      'resolution and map vintage — at 24× the disk. The default for normal ' +
      'operations.',
    // Reuses the v1 dark style, repointed at the wider archive.
    basemapStyle: EDGE.style,
    basemapSourceOverride: 'pmtiles:///edge-map/data/seasia-base.pmtiles',
    bounds: SEASIA_BOUNDS,
    terrain: {
      url: 'pmtiles:///edge-map/data/seasia-terrain.pmtiles',
      // Mapterhorn is terrarium, NOT mapbox. Measured against known summits:
      // Gunung Ledang decodes ~1127m against a true 1276m, which is a 30m DEM
      // smoothing a sharp peak. A crossed encoding would be wildly off, not
      // slightly under.
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: 12,
      bounds: SEASIA_BOUNDS,
      attribution: '© Mapterhorn (CC BY 4.0)',
    },
    footprintMB: 1005,
    demLabel: 'Mapterhorn (blended open DEMs)',
    needs: [],
    attribution: 'OpenStreetMap contributors / Protomaps · © Mapterhorn',
  },

  {
    id: 'photoreal',
    label: "God's Eye — photoreal",
    renderer: 'photoreal',
    offline: false,
    requiresKey: 'google',
    description:
      'Google Earth imagery — textured photogrammetry mesh. Briefing use ' +
      'only: streams per view, cannot be cached, and the camera is fenced to ' +
      'Singapore and Johor to bound API spend.',
    // No MapLibre style: the mesh IS the world. A transparent host style is
    // substituted at build time.
    basemapStyle: null,
    terrain: null,
    bounds: PHOTOREAL_BOUNDS,
    demLabel: 'none — mesh carries its own ground',
    needs: ['tile.googleapis.com', 'api.cesium.com'],
    attribution: 'Google · Photorealistic 3D Tiles',
  },

  {
    id: 'void',
    label: 'No basemap',
    renderer: 'vector',
    offline: true,
    description: 'Empty geographic void. Overlays only.',
    basemapStyle: '/basemap/style.void.json',
    terrain: null,
    footprintMB: 0,
    needs: [],
    attribution: '',
  },
]

const BY_ID = new Map(SOURCE_PACKS.map((p) => [p.id, p]))

export function getPack(id: SourcePackId): SourcePack {
  const pack = BY_ID.get(id)
  if (!pack) throw new Error(`Unknown source pack: ${id}`)
  return pack
}

/** Where the map opens when there is no saved camera. Singapore CBD. */
export const HOME_CAMERA = {
  center: [103.8198, 1.3521] as [number, number],
  zoom: 13.4,
  bearing: -24,
  pitch: 55,
} as const

/**
 * Which pack to boot with.
 *
 * Defaults to the edge pack because that is what ships to the node. It never
 * defaults to anything needing a key or a network, however configured — a
 * console that opens on a blank screen because a credential expired is worse
 * than one that opens on a smaller map.
 */
export function defaultPack(): SourcePackId {
  const configured = import.meta.env.VITE_MAP_PACK
  if (!configured) return 'edge'

  const pack = BY_ID.get(configured as SourcePackId)
  if (!pack) return 'edge'
  if (!hasKey(pack)) return 'edge'
  return pack.id
}
