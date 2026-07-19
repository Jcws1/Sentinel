import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapboxMap,
  RasterDEMSourceSpecification,
} from 'mapbox-gl'
import {
  BUILDINGS_3D_LAYER,
  BUILDINGS_EDGE_LAYER,
  DEFAULT_TERRAIN_CONFIG,
  ENV_STYLE_LAYER_MATCH,
  LANDMARK_LAYER,
  LANDMARK_SOURCE,
  LOS_LAYER,
  LOS_SOURCE,
  MASK_LAYER,
  MASK_SOURCE,
  RESTRICTED_FILL_LAYER,
  RESTRICTED_OUTLINE_LAYER,
  RESTRICTED_SOURCE,
  SG_RESTRICTED_AREAS,
  SG_VISUAL_LANDMARKS,
  TERRAIN_CONTOUR_LABEL_LAYER,
  TERRAIN_CONTOUR_LAYER,
  TERRAIN_CONTOUR_SOURCE,
  TERRAIN_DEM_SOURCE,
  TERRAIN_HILLSHADE_LAYER,
  type EnvLayerId,
  type EnvLayerState,
  type TerrainConfig,
} from './sgTerrainConfig'
import type { LosResult } from './losAnalysis'
import { layerAfterSatellite, polishBasemap } from './polishTopoBasemap'
import type { MapBasemap } from '../store/uiSlice'

function firstSymbolLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers
  if (!layers) return undefined
  for (const layer of layers) {
    if (layer.type === 'symbol') return layer.id
  }
  return undefined
}

function hillshadeBeforeId(map: MapboxMap): string | undefined {
  return layerAfterSatellite(map) ?? firstSymbolLayerId(map)
}

export function applyTerrainBase(
  map: MapboxMap,
  config: TerrainConfig = DEFAULT_TERRAIN_CONFIG,
  basemap: MapBasemap = 'satellite',
) {
  if (!map.isStyleLoaded()) return

  polishBasemap(map, basemap)

  if (!map.getSource(TERRAIN_DEM_SOURCE)) {
    const demSource: RasterDEMSourceSpecification =
      config.demTiles && config.demTiles.length > 0
        ? {
            type: 'raster-dem',
            tiles: config.demTiles,
            tileSize: 512,
            maxzoom: 14,
            encoding: config.demEncoding ?? 'mapbox',
          }
        : {
            type: 'raster-dem',
            url: config.demUrl,
            tileSize: 512,
            maxzoom: 14,
          }
    map.addSource(TERRAIN_DEM_SOURCE, demSource)
  }

  map.setTerrain({
    source: TERRAIN_DEM_SOURCE,
    exaggeration: config.exaggeration,
  })

  if (config.hillshade) {
    const hillshadePaint = {
      'hillshade-exaggeration': 0.55,
      'hillshade-shadow-color': '#142018',
      'hillshade-highlight-color': '#fff6e0',
      'hillshade-accent-color': '#7a9a5c',
      'hillshade-illumination-direction': 315,
      'hillshade-illumination-anchor': 'viewport' as const,
    }
    if (!map.getLayer(TERRAIN_HILLSHADE_LAYER)) {
      map.addLayer(
        {
          id: TERRAIN_HILLSHADE_LAYER,
          type: 'hillshade',
          source: TERRAIN_DEM_SOURCE,
          minzoom: 9,
          layout: { visibility: 'visible' },
          paint: hillshadePaint,
        },
        hillshadeBeforeId(map),
      )
    } else {
      map.setLayoutProperty(TERRAIN_HILLSHADE_LAYER, 'visibility', 'visible')
      for (const key of Object.keys(hillshadePaint) as Array<keyof typeof hillshadePaint>) {
        map.setPaintProperty(TERRAIN_HILLSHADE_LAYER, key, hillshadePaint[key])
      }
    }
  } else if (map.getLayer(TERRAIN_HILLSHADE_LAYER)) {
    map.setLayoutProperty(TERRAIN_HILLSHADE_LAYER, 'visibility', 'none')
  }

  if (!map.getSource(TERRAIN_CONTOUR_SOURCE)) {
    if (config.contourUrl && !config.contourUrl.startsWith('mapbox://')) {
      map.addSource(TERRAIN_CONTOUR_SOURCE, {
        type: 'vector',
        tiles: [config.contourUrl],
        maxzoom: 14,
      })
    } else {
      map.addSource(TERRAIN_CONTOUR_SOURCE, {
        type: 'vector',
        url: config.contourUrl ?? 'mapbox://mapbox.mapbox-terrain-v2',
      })
    }
  }

  const contourFilter =
    config.contours.interval >= 20
      ? (['==', ['%', ['get', 'ele'], 20], 0] as ExpressionSpecification)
      : (['==', ['%', ['get', 'ele'], 10], 0] as ExpressionSpecification)

  const contourPaint = {
    'line-color': [
      'case',
      ['==', ['%', ['get', 'ele'], 100], 0],
      '#f0d78c',
      config.contours.color,
    ] as ExpressionSpecification,
    'line-width': [
      'case',
      ['==', ['%', ['get', 'ele'], 100], 0],
      1.55,
      ['==', ['%', ['get', 'ele'], 40], 0],
      1.05,
      0.55,
    ] as ExpressionSpecification,
    'line-opacity': 0.8,
  }

  if (!map.getLayer(TERRAIN_CONTOUR_LAYER)) {
    map.addLayer(
      {
        id: TERRAIN_CONTOUR_LAYER,
        type: 'line',
        source: TERRAIN_CONTOUR_SOURCE,
        'source-layer': 'contour',
        minzoom: 11,
        layout: {
          visibility: config.contours.enabled ? 'visible' : 'none',
          'line-join': 'round',
        },
        paint: contourPaint,
        filter: contourFilter,
      },
      firstSymbolLayerId(map),
    )
  } else {
    map.setLayoutProperty(
      TERRAIN_CONTOUR_LAYER,
      'visibility',
      config.contours.enabled ? 'visible' : 'none',
    )
    map.setFilter(TERRAIN_CONTOUR_LAYER, contourFilter)
    for (const key of Object.keys(contourPaint) as Array<keyof typeof contourPaint>) {
      map.setPaintProperty(TERRAIN_CONTOUR_LAYER, key, contourPaint[key])
    }
  }

  if (!map.getLayer(TERRAIN_CONTOUR_LABEL_LAYER)) {
    map.addLayer({
      id: TERRAIN_CONTOUR_LABEL_LAYER,
      type: 'symbol',
      source: TERRAIN_CONTOUR_SOURCE,
      'source-layer': 'contour',
      minzoom: 12.5,
      layout: {
        visibility: config.contours.enabled ? 'visible' : 'none',
        'symbol-placement': 'line',
        'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
        'text-size': 10,
        'text-max-angle': 25,
        'text-padding': 2,
      },
      paint: {
        'text-color': '#fff4d0',
        'text-halo-color': 'rgba(20, 28, 18, 0.9)',
        'text-halo-width': 1.4,
      },
      filter: ['==', ['%', ['get', 'ele'], 40], 0],
    })
  } else {
    map.setLayoutProperty(
      TERRAIN_CONTOUR_LABEL_LAYER,
      'visibility',
      config.contours.enabled ? 'visible' : 'none',
    )
  }

  ensureRestrictedLayers(map)
  ensureLandmarkLayers(map)
  ensureLosLayers(map)
  ensureMaskLayer(map)
}

export function clearTerrainBase(map: MapboxMap) {
  if (!map.isStyleLoaded()) return
  map.setTerrain(null)
  for (const id of [
    TERRAIN_HILLSHADE_LAYER,
    TERRAIN_CONTOUR_LAYER,
    TERRAIN_CONTOUR_LABEL_LAYER,
  ]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
  }
}

function ensureRestrictedLayers(map: MapboxMap) {
  if (!map.getSource(RESTRICTED_SOURCE)) {
    map.addSource(RESTRICTED_SOURCE, {
      type: 'geojson',
      data: SG_RESTRICTED_AREAS,
    })
  }
  if (!map.getLayer(RESTRICTED_FILL_LAYER)) {
    map.addLayer(
      {
        id: RESTRICTED_FILL_LAYER,
        type: 'fill',
        source: RESTRICTED_SOURCE,
        paint: {
          'fill-color': [
            'match',
            ['get', 'kind'],
            'danger',
            '#c44b4b',
            'nofly',
            '#a855f7',
            '#c4921a',
          ],
          'fill-opacity': 0.18,
        },
      },
      firstSymbolLayerId(map),
    )
  }
  if (!map.getLayer(RESTRICTED_OUTLINE_LAYER)) {
    map.addLayer({
      id: RESTRICTED_OUTLINE_LAYER,
      type: 'line',
      source: RESTRICTED_SOURCE,
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'danger',
          '#ff6b6b',
          'nofly',
          '#c084fc',
          '#e0b84a',
        ],
        'line-width': 1.5,
        'line-dasharray': [2, 1.5],
      },
    })
  }
}

function ensureLandmarkLayers(map: MapboxMap) {
  if (!map.getSource(LANDMARK_SOURCE)) {
    map.addSource(LANDMARK_SOURCE, {
      type: 'geojson',
      data: SG_VISUAL_LANDMARKS,
    })
  }
  if (!map.getLayer(`${LANDMARK_LAYER}-dot`)) {
    map.addLayer({
      id: `${LANDMARK_LAYER}-dot`,
      type: 'circle',
      source: LANDMARK_SOURCE,
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 5,
        'circle-color': '#7ee0c3',
        'circle-stroke-color': '#06070a',
        'circle-stroke-width': 1.5,
      },
    })
  }
  if (!map.getLayer(LANDMARK_LAYER)) {
    map.addLayer({
      id: LANDMARK_LAYER,
      type: 'symbol',
      source: LANDMARK_SOURCE,
      layout: {
        visibility: 'none',
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#7ee0c3',
        'text-halo-color': '#06070a',
        'text-halo-width': 1.4,
      },
    })
  }
}

function ensureLosLayers(map: MapboxMap) {
  if (!map.getSource(LOS_SOURCE)) {
    map.addSource(LOS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(LOS_LAYER)) {
    map.addLayer({
      id: LOS_LAYER,
      type: 'line',
      source: LOS_SOURCE,
      paint: {
        'line-color': ['case', ['get', 'clear'], '#3dd68c', '#ff5c5c'],
        'line-width': 3,
        'line-opacity': 0.9,
      },
    })
  }
}

function ensureMaskLayer(map: MapboxMap) {
  if (!map.getSource(MASK_SOURCE)) {
    map.addSource(MASK_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(MASK_LAYER)) {
    map.addLayer(
      {
        id: MASK_LAYER,
        type: 'fill',
        source: MASK_SOURCE,
        paint: {
          'fill-color': '#c44b4b',
          'fill-opacity': 0.2,
        },
      },
      firstSymbolLayerId(map),
    )
  }
}

export function setEnvLayerVisibility(
  map: MapboxMap,
  layers: EnvLayerState[],
  buildingsLayerId = BUILDINGS_3D_LAYER,
) {
  if (!map.isStyleLoaded()) return
  const byId = Object.fromEntries(layers.map((l) => [l.id, l])) as Record<
    EnvLayerId,
    EnvLayerState
  >

  const hill = byId.hillshade
  if (map.getLayer(TERRAIN_HILLSHADE_LAYER) && hill) {
    map.setLayoutProperty(
      TERRAIN_HILLSHADE_LAYER,
      'visibility',
      hill.visible ? 'visible' : 'none',
    )
  }

  const contours = byId.contours
  for (const id of [TERRAIN_CONTOUR_LAYER, TERRAIN_CONTOUR_LABEL_LAYER]) {
    if (map.getLayer(id) && contours) {
      map.setLayoutProperty(id, 'visibility', contours.visible ? 'visible' : 'none')
    }
  }

  const buildings = byId.buildings
  for (const id of [buildingsLayerId, BUILDINGS_EDGE_LAYER]) {
    if (map.getLayer(id) && buildings) {
      map.setLayoutProperty(id, 'visibility', buildings.visible ? 'visible' : 'none')
    }
  }
  if (map.getLayer(buildingsLayerId) && buildings?.visible) {
    map.setPaintProperty(buildingsLayerId, 'fill-extrusion-opacity', 0.94)
    // Keep extrusions above hillshade/contours so 3D massing stays crisp on topo.
    try {
      map.moveLayer(buildingsLayerId, firstSymbolLayerId(map))
      if (map.getLayer(BUILDINGS_EDGE_LAYER)) {
        map.moveLayer(BUILDINGS_EDGE_LAYER, firstSymbolLayerId(map))
      }
    } catch {
      /* layer order optional */
    }
  }

  const restricted = byId.restricted
  for (const id of [RESTRICTED_FILL_LAYER, RESTRICTED_OUTLINE_LAYER]) {
    if (map.getLayer(id) && restricted) {
      map.setLayoutProperty(id, 'visibility', restricted.visible ? 'visible' : 'none')
      if (id === RESTRICTED_FILL_LAYER && restricted.visible) {
        map.setPaintProperty(id, 'fill-opacity', restricted.opacity)
      }
    }
  }

  for (const key of Object.keys(ENV_STYLE_LAYER_MATCH) as Array<
    keyof typeof ENV_STYLE_LAYER_MATCH
  >) {
    const state = byId[key]
    if (!state) continue
    const needles = ENV_STYLE_LAYER_MATCH[key]
    for (const layer of map.getStyle()?.layers ?? []) {
      if (!needles.some((n) => layer.id.includes(n))) continue
      try {
        map.setLayoutProperty(layer.id, 'visibility', state.visible ? 'visible' : 'none')
      } catch {
        /* ignore */
      }
    }
  }
}

export function setDegradedLandmarksVisible(map: MapboxMap, visible: boolean) {
  const vis = visible ? 'visible' : 'none'
  if (map.getLayer(LANDMARK_LAYER)) {
    map.setLayoutProperty(LANDMARK_LAYER, 'visibility', vis)
  }
  if (map.getLayer(`${LANDMARK_LAYER}-dot`)) {
    map.setLayoutProperty(`${LANDMARK_LAYER}-dot`, 'visibility', vis)
  }
}

export function setLosResultOnMap(map: MapboxMap, los: LosResult | null) {
  const source = map.getSource(LOS_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  if (!los) {
    source.setData({ type: 'FeatureCollection', features: [] })
    return
  }
  source.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { clear: los.clear },
        geometry: {
          type: 'LineString',
          coordinates: [
            [los.from.lng, los.from.lat],
            [los.to.lng, los.to.lat],
          ],
        },
      },
    ],
  })
}

/** Approximate terrain-mask wedges from LOS blocking samples. */
export function setTerrainMaskFromLos(map: MapboxMap, los: LosResult | null) {
  const source = map.getSource(MASK_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  if (!los || los.clear) {
    source.setData({ type: 'FeatureCollection', features: [] })
    return
  }
  const blocked = los.samples.filter((s, i) => {
    if (i === 0 || i === los.samples.length - 1) return false
    return s.losM - s.groundM < 5
  })
  if (blocked.length === 0) {
    source.setData({ type: 'FeatureCollection', features: [] })
    return
  }
  const features = blocked.slice(0, 6).map((s, idx) => ({
    type: 'Feature' as const,
    properties: { id: `mask-${idx}` },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [s.lng - 0.0015, s.lat - 0.0012],
          [s.lng + 0.0015, s.lat - 0.0012],
          [s.lng + 0.0015, s.lat + 0.0012],
          [s.lng - 0.0015, s.lat + 0.0012],
          [s.lng - 0.0015, s.lat - 0.0012],
        ],
      ],
    },
  }))
  source.setData({ type: 'FeatureCollection', features })
}

export function setTerrainExaggeration(map: MapboxMap, exaggeration: number) {
  if (!map.getSource(TERRAIN_DEM_SOURCE)) return
  map.setTerrain({ source: TERRAIN_DEM_SOURCE, exaggeration })
}
