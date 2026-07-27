import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl, {
  type GeoJSONSource,
  type ImageSource,
  type Map as MapboxMap,
  type MapMouseEvent,
} from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { useAppDispatch, useAppSelector } from '../store'
import { selectDrone } from '../store/fleetSlice'
import { operatorSelectTrack } from '../store/threatsSlice'
import { setActiveRecommendation } from '../store/taskingSlice'
import {
  setActiveMapTool,
  setHeatmapMode,
  setMapOverlayTab,
  setOfflinePrepOpen,
  setTelemetryExpanded,
} from '../store/uiSlice'
import { ThreatCallout } from './ThreatCallout'
import type { Drone, Position, TaskingRecommendation, ThreatTrack } from '../types'
import {
  INSTALLATIONS_ATTRIBUTION,
  installationsForTab,
} from '../data/singaporeInstallations'
import type { HeatmapMode, ModeId } from '../store/uiSlice'
import { isOperatorUiTarget } from '../utils/ui'
import { TerrainLayer } from '../terrain/TerrainLayer'
import { DegradedTerrainOverlay } from '../terrain/DegradedTerrainOverlay'
import {
  resolveOfflineMapConfig,
  resolveTerrainConfig,
} from '../terrain/offlineMapConfig'
import { prefetchOperationalTerrain } from '../terrain/prefetchTerrain'
import { isDegraded } from '../modeProfiles'
import { OfflinePrepPanel } from './streamlined/OfflinePrepPanel'
import { applyMapOverlayVisibility } from '../map/applyMapOverlayVisibility'
import type { OverlayVisibility } from '../streamlined/overlayDefaults'
import { analyzeLineOfSight } from '../terrain/losAnalysis'
import { computeTerrainDrift } from '../terrain/useTerrainDrift'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useSecondsSinceFix } from '../hooks/useSecondsSinceFix'
import { mapMotionDuration } from '../utils/mapMotion'
import { getMapPerfConfig } from '../utils/mapPerf'
import type {
  ClassifiedMapObject,
} from '../types/mapObjects'
import {
  categoryForMapKinds,
  normalizeMapKind,
} from '../utils/mapObjectClassification'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'
const EDGE_MAP_STYLE = '/edge-map/style.json'
const TRAIL_LENGTH = 28

/** Meters on ground → circle pixel radius at feature lat/zoom. */
const METER_HALO_RADIUS: mapboxgl.ExpressionSpecification = [
  'max',
  4,
  [
    '/',
    ['get', 'radiusM'],
    [
      '/',
      ['*', 156543.03392, ['cos', ['*', ['get', 'lat'], 0.01745329251]]],
      ['^', 2, ['zoom']],
    ],
  ],
]

const LERP = 0.2
const HILLSHADE_LAYER = 'terrain-hillshade'
const BUILDINGS_LAYER = '3d-buildings'
const HEATMAP_SOURCE = 'sentinel-heatmap'
const HEATMAP_LAYER = 'sentinel-heatmap-layer'
const TERRAIN_HEATMAP_SOURCE = 'sentinel-terrain-heatmap'
const TERRAIN_HEATMAP_LAYER = 'sentinel-terrain-heatmap-layer'
const RANGE_SOURCE = 'sentinel-range-measurements'
const RANGE_CIRCLE_LAYER = 'sentinel-range-circles'
const RANGE_LINE_LAYER = 'sentinel-range-lines'
const RANGE_LABEL_LAYER = 'sentinel-range-labels'
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL6WQAAAABJRU5ErkJggg=='
type MapRenderer = 'mapbox' | 'maplibre'

const HEATMAP_LABELS: Record<HeatmapMode, string> = {
  enemy: 'Enemy activity',
  friendly: 'Friendly activity',
  sensor: 'Sensor confidence',
  terrain: 'Terrain slope',
}

const HEATMAP_PALETTES: Record<
  HeatmapMode,
  mapboxgl.ExpressionSpecification
> = {
  enemy: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(25, 8, 12, 0)',
    0.2,
    'rgba(114, 25, 36, 0.34)',
    0.45,
    'rgba(214, 62, 57, 0.62)',
    0.72,
    'rgba(255, 151, 55, 0.78)',
    1,
    'rgba(255, 239, 176, 0.92)',
  ],
  friendly: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(3, 21, 42, 0)',
    0.2,
    'rgba(26, 86, 164, 0.34)',
    0.5,
    'rgba(38, 146, 224, 0.64)',
    0.78,
    'rgba(62, 218, 219, 0.8)',
    1,
    'rgba(218, 255, 251, 0.94)',
  ],
  sensor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(5, 25, 28, 0)',
    0.2,
    'rgba(18, 97, 89, 0.32)',
    0.48,
    'rgba(31, 179, 132, 0.62)',
    0.76,
    'rgba(159, 222, 87, 0.8)',
    1,
    'rgba(247, 255, 203, 0.94)',
  ],
  terrain: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(5, 28, 24, 0)',
    0.06,
    'rgba(18, 84, 55, 0.38)',
    0.22,
    'rgba(42, 157, 92, 0.65)',
    0.48,
    'rgba(222, 200, 55, 0.8)',
    0.74,
    'rgba(235, 112, 39, 0.9)',
    1,
    'rgba(205, 42, 48, 0.98)',
  ],
}

const edgePmtilesProtocol = new Protocol()
maplibregl.addProtocol('pmtiles', edgePmtilesProtocol.tile)

/** Pitched camera over a flat ground plane; volume comes from building extrusions only. */
const MODE_CAMERA: Record<ModeId, { pitch: number; bearing: number; zoom?: number }> = {
  defense: { pitch: 55, bearing: -24, zoom: 14.4 },
  recon: { pitch: 68, bearing: -38, zoom: 14.8 },
  attack: { pitch: 58, bearing: -28, zoom: 14.5 },
}

type MapFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] }
}

type RangeMeasurement = {
  id: string
  start: [number, number]
  end: [number, number]
  distanceM: number
}

type DisplayPoint = {
  lng: number
  lat: number
  alt: number
  targetLng: number
  targetLat: number
  targetAlt: number
  kind: 'friendly' | 'threat' | 'asset'
  id: string
  selected: boolean
  alert: boolean
  confidence: number
}

type LiveState = {
  drones: Drone[]
  tracks: ThreatTrack[]
  recommendations: TaskingRecommendation[]
  selectedDroneId: string | null
  selectedTrackId: string | null
  alertTrackIds: string[]
  asset: Position
  connected: boolean
  gnssDegraded: boolean
  secondsSinceFix: number
  reducedMotion: boolean
}

function featureCenter(geometry: unknown): Position | null {
  if (
    !geometry ||
    typeof geometry !== 'object' ||
    !('coordinates' in geometry)
  ) {
    return null
  }
  const points: Array<[number, number]> = []
  const collect = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      points.push([value[0], value[1]])
      return
    }
    if (Array.isArray(value)) value.forEach(collect)
  }
  collect((geometry as { coordinates?: unknown }).coordinates)
  if (points.length === 0) return null
  const bounds = points.reduce(
    (result, [lng, lat]) => ({
      minLng: Math.min(result.minLng, lng),
      maxLng: Math.max(result.maxLng, lng),
      minLat: Math.min(result.minLat, lat),
      maxLat: Math.max(result.maxLat, lat),
    }),
    {
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    },
  )
  return {
    lng: (bounds.minLng + bounds.maxLng) / 2,
    lat: (bounds.minLat + bounds.maxLat) / 2,
    alt: 0,
  }
}

function classifyLoadedMapObjects(
  map: MapboxMap,
  renderer: MapRenderer,
): ClassifiedMapObject[] {
  const source = renderer === 'maplibre' ? 'sentinel-buildings' : 'composite'
  const sourceLayers =
    renderer === 'maplibre' ? ['landuse', 'pois'] : ['landuse', 'poi_label']
  const objects = new Map<string, ClassifiedMapObject>()

  for (const sourceLayer of sourceLayers) {
    let features: ReturnType<MapboxMap['querySourceFeatures']> = []
    try {
      features = map.querySourceFeatures(source, { sourceLayer })
    } catch {
      continue
    }
    for (const feature of features) {
      const properties = feature.properties ?? {}
      const kinds = [
        properties.kind,
        properties.class,
        properties.type,
        properties.kind_detail,
      ]
        .map(normalizeMapKind)
        .filter(Boolean)
      const kind = kinds[0] ?? 'unclassified'
      const category = categoryForMapKinds(kinds)
      const position = featureCenter(feature.geometry)
      if (!position) continue
      const name = String(
        properties.name ??
          properties.name_en ??
          `${kind.replaceAll('_', ' ')} area`,
      )
      const rawId =
        properties.id ??
        properties.osm_id ??
        feature.id ??
        `${name}:${position.lng.toFixed(5)}:${position.lat.toFixed(5)}`
      const key = `${category}:${rawId}`
      if (objects.has(key)) continue
      objects.set(key, {
        id: `map:${key}`,
        name,
        category,
        kind,
        source: 'vector-map',
        position,
      })
    }
  }

  return [...objects.values()]
}

function pointFeature(
  id: string,
  position: Pick<Position, 'lng' | 'lat'>,
  properties: Record<string, unknown>,
): MapFeature {
  return {
    type: 'Feature',
    properties: { id, ...properties },
    geometry: {
      type: 'Point',
      coordinates: [position.lng, position.lat],
    },
  }
}

function lineFeature(
  id: string,
  coordinates: [number, number][],
  properties: Record<string, unknown> = {},
): MapFeature {
  return {
    type: 'Feature',
    properties: { id, ...properties },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  }
}

const EARTH_RADIUS_M = 6_371_008.8

function distanceMeters(start: [number, number], end: [number, number]) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const lat1 = toRadians(start[1])
  const lat2 = toRadians(end[1])
  const deltaLat = lat2 - lat1
  const deltaLng = toRadians(end[0] - start[0])
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

function rangeCircle(
  center: [number, number],
  radiusM: number,
): [number, number][] {
  const angularDistance = radiusM / EARTH_RADIUS_M
  const centerLat = (center[1] * Math.PI) / 180
  const centerLng = (center[0] * Math.PI) / 180
  const coordinates: [number, number][] = []
  for (let step = 0; step <= 96; step++) {
    const bearing = (step / 96) * Math.PI * 2
    const lat = Math.asin(
      Math.sin(centerLat) * Math.cos(angularDistance) +
        Math.cos(centerLat) * Math.sin(angularDistance) * Math.cos(bearing),
    )
    const lng =
      centerLng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLat),
        Math.cos(angularDistance) - Math.sin(centerLat) * Math.sin(lat),
      )
    coordinates.push([(lng * 180) / Math.PI, (lat * 180) / Math.PI])
  }
  return coordinates
}

function rangeLabel(distanceM: number) {
  return `${Math.round(distanceM)}m/${(distanceM / 1000).toFixed(1)}km`
}

function rangeFeatures(measurements: readonly RangeMeasurement[]): MapFeature[] {
  return measurements.flatMap((measurement) => {
    const midpoint: [number, number] = [
      (measurement.start[0] + measurement.end[0]) / 2,
      (measurement.start[1] + measurement.end[1]) / 2,
    ]
    return [
      {
        type: 'Feature' as const,
        properties: { id: measurement.id, kind: 'circle' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [rangeCircle(measurement.start, measurement.distanceM)],
        },
      },
      lineFeature(
        `${measurement.id}:radius`,
        [measurement.start, measurement.end],
        { kind: 'radius' },
      ),
      pointFeature(`${measurement.id}:label`, {
        lng: midpoint[0],
        lat: midpoint[1],
      }, {
        kind: 'label',
        label: rangeLabel(measurement.distanceM),
      }),
    ]
  })
}

function firstSymbolLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers
  if (!layers) return undefined
  for (const layer of layers) {
    if (layer.type === 'symbol') return layer.id
  }
  return undefined
}

function enableVolume3d(map: MapboxMap, renderer: MapRenderer) {
  if (!map.isStyleLoaded()) return

  const edgeTerrainAvailable = renderer === 'maplibre' && Boolean(map.getSource('sentinel-terrain'))
  map.setTerrain(edgeTerrainAvailable ? { source: 'sentinel-terrain', exaggeration: 1 } : null)
  if (map.getLayer(HILLSHADE_LAYER)) {
    map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', edgeTerrainAvailable ? 'visible' : 'none')
  }

  try {
    if (renderer === 'mapbox') map.setLights([
      {
        id: 'sentinel-ambient',
        type: 'ambient',
        properties: {
          color: 'rgba(140, 160, 190, 1)',
          intensity: 0.35,
        },
      },
      {
        id: 'sentinel-sun',
        type: 'directional',
        properties: {
          color: 'rgba(255, 250, 240, 1)',
          intensity: 0.95,
          direction: [210, 40],
          'cast-shadows': true,
          'shadow-intensity': 0.85,
        },
      },
    ])
    else {
      ;(map as unknown as { setLight: (light: Record<string, unknown>) => void }).setLight({
        anchor: 'map',
        color: '#d9e2f1',
        intensity: 0.72,
        position: [1.4, 210, 40],
      })
    }
  } catch {
    /* lights optional */
  }

  const buildingHeight: mapboxgl.ExpressionSpecification = [
    'case',
    ['has', 'height'],
    ['to-number', ['get', 'height']],
    ['has', 'render_height'],
    ['to-number', ['get', 'render_height']],
    18,
  ]

  // Light steel massing on near-black ground for readable contrast.
  const buildingColor: mapboxgl.ExpressionSpecification = [
    'interpolate',
    ['linear'],
    buildingHeight,
    0,
    '#6e7b90',
    30,
    '#8a97ab',
    80,
    '#aeb8c8',
    160,
    '#c9d0db',
    280,
    '#e2e6ee',
  ]

  const buildingPaint = {
    'fill-extrusion-color': buildingColor,
    'fill-extrusion-height': buildingHeight,
    'fill-extrusion-base': [
      'case',
      ['has', 'min_height'],
      ['to-number', ['get', 'min_height']],
      0,
    ] as mapboxgl.ExpressionSpecification,
    'fill-extrusion-opacity': 1,
    'fill-extrusion-vertical-gradient': true,
    ...(renderer === 'mapbox'
      ? {
          'fill-extrusion-ambient-occlusion-intensity': 0.65,
          'fill-extrusion-ambient-occlusion-radius': 6,
        }
      : {}),
  }

  const buildingSource = renderer === 'mapbox' ? 'composite' : 'sentinel-buildings'
  const buildingSourceDefinition = map.getStyle()?.sources?.[buildingSource]
  const buildingSourceLayer = buildingSourceDefinition?.type === 'vector'
    ? renderer === 'maplibre' ? 'buildings' : 'building'
    : undefined

  if (map.getSource(buildingSource) && !map.getLayer(BUILDINGS_LAYER)) {
    const before = firstSymbolLayerId(map)
    map.addLayer(
      {
        id: BUILDINGS_LAYER,
        source: buildingSource,
        ...(buildingSourceLayer ? { 'source-layer': buildingSourceLayer } : {}),
        filter: [
          'any',
          ['==', ['get', 'extrude'], 'true'],
          ['has', 'height'],
          ['has', 'render_height'],
          ['==', ['geometry-type'], 'Polygon'],
        ],
        type: 'fill-extrusion',
        minzoom: 12,
        layout: { visibility: 'visible' },
        paint: buildingPaint,
      },
      before,
    )
  } else if (map.getLayer(BUILDINGS_LAYER)) {
    map.setLayoutProperty(BUILDINGS_LAYER, 'visibility', 'visible')
    map.setPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-color', buildingColor)
    map.setPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-height', buildingHeight)
    map.setPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-opacity', 1)
    if (renderer === 'mapbox') {
      map.setPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-ambient-occlusion-intensity', 0.65)
    }
  }

  if (map.getSource(buildingSource) && !map.getLayer('3d-building-edges')) {
    map.addLayer(
      {
        id: '3d-building-edges',
        type: 'line',
        source: buildingSource,
        ...(buildingSourceLayer ? { 'source-layer': buildingSourceLayer } : {}),
        minzoom: 13,
        layout: { visibility: 'visible' },
        paint: {
          'line-color': '#e8eef8',
          'line-width': 0.9,
          'line-opacity': 0.65,
        },
      },
      BUILDINGS_LAYER,
    )
  } else if (map.getLayer('3d-building-edges')) {
    map.setLayoutProperty('3d-building-edges', 'visibility', 'visible')
  }

  for (const layer of map.getStyle()?.layers ?? []) {
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', '#06070a')
      }
      if (
        layer.type === 'fill' &&
        (layer.id.includes('land') ||
          layer.id.includes('landuse') ||
          layer.id.includes('park'))
      ) {
        map.setPaintProperty(layer.id, 'fill-color', '#0a0c10')
      }
      if (layer.type === 'fill' && layer.id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', '#04060a')
      }
    } catch {
      /* style-dependent */
    }
  }

  for (const layer of map.getStyle()?.layers ?? []) {
    if (
      layer.id !== BUILDINGS_LAYER &&
      layer.id !== '3d-building-edges' &&
      (layer.id.includes('building') || layer.id.includes('housenum'))
    ) {
      try {
        if (layer.type === 'fill' || layer.type === 'line') {
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (renderer === 'mapbox' && !map.getLayer('sky')) {
    map.addLayer({
      id: 'sky',
      type: 'sky',
      paint: {
        'sky-type': 'atmosphere',
        'sky-atmosphere-sun': [0.0, 70.0],
        'sky-atmosphere-sun-intensity': 18,
        'sky-atmosphere-color': 'rgb(18, 24, 38)',
        'sky-atmosphere-halo-color': 'rgb(60, 80, 120)',
      },
    })
  }

  if (renderer === 'mapbox') {
    map.setFog({
      color: 'rgb(6, 8, 12)',
      'high-color': 'rgb(30, 40, 60)',
      'horizon-blend': 0.05,
      'space-color': 'rgb(2, 3, 6)',
      'star-intensity': 0.12,
      range: [1.0, 14],
    })
  } else {
    ;(map as unknown as { setSky: (sky: Record<string, unknown>) => void }).setSky({
      'sky-color': '#121826',
      'horizon-color': '#06080c',
      'fog-color': '#06080c',
      'sky-horizon-blend': 0.45,
      'horizon-fog-blend': 0.82,
    })
  }
}

function coordinateBounds(coordinates: [number, number][]): [[number, number], [number, number]] {
  let west = coordinates[0][0]
  let east = coordinates[0][0]
  let south = coordinates[0][1]
  let north = coordinates[0][1]
  for (const [lng, lat] of coordinates.slice(1)) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [[west, south], [east, north]]
}

type EdgePackHealth = {
  ok: boolean
  packId?: string
  coverage?: string
  stale?: boolean
  error?: string
}

function disableVolume3d(map: MapboxMap, renderer: MapRenderer) {
  if (!map.isStyleLoaded()) return
  map.setTerrain(null)
  if (renderer === 'mapbox') map.setFog(null)
  else {
    ;(map as unknown as { setSky: (sky: Record<string, unknown>) => void }).setSky({
      'sky-color': '#06070a',
      'horizon-color': '#06070a',
      'fog-color': '#06070a',
      'sky-horizon-blend': 0,
    })
  }
  try {
    if (renderer === 'mapbox') map.setLights([])
  } catch {
    /* ignore */
  }
  if (map.getLayer(HILLSHADE_LAYER)) {
    map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', 'none')
  }
  if (map.getLayer(BUILDINGS_LAYER)) {
    map.setLayoutProperty(BUILDINGS_LAYER, 'visibility', 'none')
  }
  if (map.getLayer('3d-building-edges')) {
    map.setLayoutProperty('3d-building-edges', 'visibility', 'none')
  }
}

function applyModeCamera(
  map: MapboxMap,
  mode: ModeId,
  preferFlat: boolean,
  animate: boolean,
  renderer: MapRenderer,
  reducedMotion = false,
) {
  const preset = MODE_CAMERA[mode]
  const pitch = preferFlat ? 0 : preset.pitch
  const bearing = preferFlat ? 0 : preset.bearing
  const zoom = preferFlat ? map.getZoom() : (preset.zoom ?? map.getZoom())

  if (preferFlat) disableVolume3d(map, renderer)
  else enableVolume3d(map, renderer)

  const duration = mapMotionDuration(reducedMotion, animate ? 900 : 0)
  const camera = { pitch, bearing, zoom, duration }
  if (animate && duration > 0) map.easeTo(camera)
  else map.jumpTo({ pitch, bearing, zoom })
}

const THREAT_INTERACTIVE_LAYERS = [
  'threat-hit',
  'threat-points',
  'threat-labels',
  'threat-uncertainty',
] as const

function resolveThreatId(
  map: MapboxMap,
  point: mapboxgl.PointLike,
  features?: mapboxgl.GeoJSONFeature[],
): string | null {
  const hits =
    features && features.length > 0
      ? features
      : map.queryRenderedFeatures(point, {
          layers: [...THREAT_INTERACTIVE_LAYERS],
        })

  for (const feature of hits) {
    const props = (feature as { properties?: { id?: string } }).properties
    const id = props?.id
    if (
      id &&
      (feature.source === 'threats' || feature.source === 'threat-halos')
    ) {
      return String(id)
    }
  }
  return null
}

function heatmapPoint(
  id: string,
  coordinates: [number, number],
  weight: number,
  kind: HeatmapMode,
): MapFeature {
  return {
    type: 'Feature',
    properties: {
      id,
      kind,
      weight: Math.max(0.02, Math.min(1, weight)),
    },
    geometry: { type: 'Point', coordinates },
  }
}

function configureHeatmapLayer(map: MapboxMap, mode: HeatmapMode | null) {
  if (map.getLayer(HEATMAP_LAYER)) {
    map.setLayoutProperty(
      HEATMAP_LAYER,
      'visibility',
      mode && mode !== 'terrain' ? 'visible' : 'none',
    )
  }
  if (map.getLayer(TERRAIN_HEATMAP_LAYER)) {
    map.setLayoutProperty(
      TERRAIN_HEATMAP_LAYER,
      'visibility',
      mode === 'terrain' ? 'visible' : 'none',
    )
  }
  if (!mode || mode === 'terrain' || !map.getLayer(HEATMAP_LAYER)) return
  map.setPaintProperty(HEATMAP_LAYER, 'heatmap-color', HEATMAP_PALETTES[mode])
  map.setPaintProperty(
    HEATMAP_LAYER,
    'heatmap-radius',
    ['interpolate', ['linear'], ['zoom'], 9, 12, 13, 24, 17, 38],
  )
  map.setPaintProperty(
    HEATMAP_LAYER,
    'heatmap-intensity',
    ['interpolate', ['linear'], ['zoom'], 9, 0.85, 15, 1.35],
  )
  map.setPaintProperty(
    HEATMAP_LAYER,
    'heatmap-opacity',
    ['interpolate', ['linear'], ['zoom'], 8, 0.72, 17, 0.9],
  )
}

function operationalHeatmapFeatures(
  mode: Exclude<HeatmapMode, 'terrain'>,
  drones: Drone[],
  tracks: ThreatTrack[],
  trails: Map<string, [number, number][]>,
): MapFeature[] {
  const features: MapFeature[] = []

  if (mode === 'enemy') {
    for (const track of tracks) {
      const classWeight =
        track.threatClass === 'I' ? 0.2 : track.threatClass === 'II' ? 0.12 : 0.06
      features.push(
        heatmapPoint(
          `enemy:${track.id}`,
          [track.position.lng, track.position.lat],
          0.48 + track.fusionConfidence / 250 + classWeight,
          mode,
        ),
      )
      const history = trails.get(`threat:${track.id}`) ?? []
      history.forEach((coordinates, index) => {
        const recency = (index + 1) / Math.max(1, history.length)
        features.push(
          heatmapPoint(
            `enemy-trail:${track.id}:${index}`,
            coordinates,
            0.08 + recency * 0.28,
            mode,
          ),
        )
      })
    }
    return features
  }

  if (mode === 'friendly') {
    for (const drone of drones) {
      features.push(
        heatmapPoint(
          `friendly:${drone.id}`,
          [drone.position.lng, drone.position.lat],
          0.52 + (drone.assignedTrackId ? 0.28 : 0.08),
          mode,
        ),
      )
      const history = trails.get(`friendly:${drone.id}`) ?? []
      history.forEach((coordinates, index) => {
        const recency = (index + 1) / Math.max(1, history.length)
        features.push(
          heatmapPoint(
            `friendly-trail:${drone.id}:${index}`,
            coordinates,
            0.06 + recency * 0.22,
            mode,
          ),
        )
      })
    }
    return features
  }

  for (const track of tracks) {
    const overlap = Math.min(1, track.sensors.length / 4)
    features.push(
      heatmapPoint(
        `sensor:${track.id}`,
        [track.position.lng, track.position.lat],
        track.fusionConfidence / 140 + overlap * 0.28,
        mode,
      ),
    )
  }
  return features
}

const TERRAIN_COLOR_STOPS = [
  { at: 0, color: [8, 55, 38, 0] },
  { at: 0.05, color: [12, 90, 50, 42] },
  { at: 0.18, color: [35, 145, 80, 112] },
  { at: 0.42, color: [80, 180, 80, 154] },
  { at: 0.65, color: [222, 200, 55, 182] },
  { at: 0.82, color: [235, 112, 39, 205] },
  { at: 1, color: [205, 42, 48, 228] },
] as const

function terrainColor(value: number): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, value))
  for (let index = 1; index < TERRAIN_COLOR_STOPS.length; index++) {
    const upper = TERRAIN_COLOR_STOPS[index]
    const lower = TERRAIN_COLOR_STOPS[index - 1]
    if (clamped > upper.at) continue
    const range = Math.max(0.0001, upper.at - lower.at)
    const progress = (clamped - lower.at) / range
    return lower.color.map((channel, channelIndex) =>
      Math.round(
        channel +
          (upper.color[channelIndex] - channel) * progress,
      ),
    ) as [number, number, number, number]
  }
  return [...TERRAIN_COLOR_STOPS[TERRAIN_COLOR_STOPS.length - 1].color]
}

function absoluteSlopeWeight(slopeDegrees: number): number {
  if (slopeDegrees <= 1) return 0
  if (slopeDegrees <= 3) {
    return 0.04 + ((slopeDegrees - 1) / 2) * 0.14
  }
  if (slopeDegrees <= 6) {
    return 0.18 + ((slopeDegrees - 3) / 3) * 0.24
  }
  if (slopeDegrees <= 12) {
    return 0.42 + ((slopeDegrees - 6) / 6) * 0.3
  }
  if (slopeDegrees <= 20) {
    return 0.72 + ((slopeDegrees - 12) / 8) * 0.28
  }
  return 1
}

function renderTerrainSurface(
  weights: number[],
  gridSize: number,
  outputSize: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) return TRANSPARENT_PIXEL
  const image = context.createImageData(outputSize, outputSize)
  const weightAt = (row: number, column: number) =>
    weights[row * gridSize + column] ?? 0

  for (let y = 0; y < outputSize; y++) {
    const gridY =
      (1 - y / Math.max(1, outputSize - 1)) * (gridSize - 1)
    const row0 = Math.floor(gridY)
    const row1 = Math.min(gridSize - 1, row0 + 1)
    const yMix = gridY - row0
    for (let x = 0; x < outputSize; x++) {
      const gridX = (x / Math.max(1, outputSize - 1)) * (gridSize - 1)
      const column0 = Math.floor(gridX)
      const column1 = Math.min(gridSize - 1, column0 + 1)
      const xMix = gridX - column0
      const top =
        weightAt(row0, column0) * (1 - xMix) +
        weightAt(row0, column1) * xMix
      const bottom =
        weightAt(row1, column0) * (1 - xMix) +
        weightAt(row1, column1) * xMix
      const weight = top * (1 - yMix) + bottom * yMix
      const color = terrainColor(weight)
      const offset = (y * outputSize + x) * 4
      image.data[offset] = color[0]
      image.data[offset + 1] = color[1]
      image.data[offset + 2] = color[2]
      image.data[offset + 3] = color[3]
    }
  }

  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function addOverlayLayers(map: MapboxMap) {
  const sourceIds = [
    HEATMAP_SOURCE,
    'policy-zones',
    'installations',
    'asset',
    'mesh',
    'routes',
    'trails',
    'drones',
    'threats',
    'uncertainty',
    'threat-halos',
    'threat-alert-rings',
    RANGE_SOURCE,
  ]

  for (const id of sourceIds) {
    if (map.getSource(id)) continue
    map.addSource(id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }

  if (!map.getSource(TERRAIN_HEATMAP_SOURCE)) {
    map.addSource(TERRAIN_HEATMAP_SOURCE, {
      type: 'image',
      url: TRANSPARENT_PIXEL,
      coordinates: [
        [103.55, 1.58],
        [104.1, 1.58],
        [104.1, 1.15],
        [103.55, 1.15],
      ],
    })
  }

  const layers: mapboxgl.AnyLayer[] = [
    {
      id: TERRAIN_HEATMAP_LAYER,
      type: 'raster',
      source: TERRAIN_HEATMAP_SOURCE,
      layout: { visibility: 'none' },
      paint: {
        'raster-opacity': 0.82,
        'raster-resampling': 'linear',
        'raster-fade-duration': 100,
      },
    },
    {
      id: HEATMAP_LAYER,
      type: 'heatmap',
      source: HEATMAP_SOURCE,
      layout: { visibility: 'none' },
      maxzoom: 20,
      paint: {
        'heatmap-weight': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'weight'], 0],
          0,
          0,
          1,
          1,
        ],
        'heatmap-intensity': 1,
        'heatmap-radius': 24,
        'heatmap-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          0.72,
          17,
          0.9,
        ],
        'heatmap-color': HEATMAP_PALETTES.enemy,
      },
    },
    {
      id: RANGE_CIRCLE_LAYER,
      type: 'line',
      source: RANGE_SOURCE,
      filter: ['==', ['get', 'kind'], 'circle'],
      paint: {
        'line-color': '#64d8ff',
        'line-opacity': 0.8,
        'line-width': 1.5,
      },
    },
    {
      id: RANGE_LINE_LAYER,
      type: 'line',
      source: RANGE_SOURCE,
      filter: ['==', ['get', 'kind'], 'radius'],
      paint: {
        'line-color': '#b9efff',
        'line-opacity': 0.95,
        'line-width': 2,
        'line-dasharray': [0, 4, 3],
      },
    },
    {
      id: RANGE_LABEL_LAYER,
      type: 'symbol',
      source: RANGE_SOURCE,
      filter: ['==', ['get', 'kind'], 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#e6f9ff',
        'text-halo-color': '#071018',
        'text-halo-width': 2,
      },
    },
    {
      id: 'installations-fill',
      type: 'fill',
      source: 'installations',
      filter: ['==', ['get', 'feature'], 'footprint'],
      paint: {
        'fill-color': [
          'match',
          ['get', 'kind'],
          'military_airbase',
          '#c4921a',
          'military_naval',
          '#2f6fed',
          'military_land',
          '#3d9b6e',
          'prd_anchor',
          '#a855f7',
          '#8a8c90',
        ],
        'fill-opacity': [
          'match',
          ['get', 'kind'],
          'military_airbase',
          0.24,
          'military_naval',
          0.22,
          'military_land',
          0.2,
          'prd_anchor',
          0.16,
          0.1,
        ],
      },
    },
    {
      id: 'installations-outline',
      type: 'line',
      source: 'installations',
      filter: ['==', ['get', 'feature'], 'footprint'],
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'military_airbase',
          '#e0b84a',
          'military_naval',
          '#6ea8ff',
          'military_land',
          '#5fd49a',
          'prd_anchor',
          '#c084fc',
          '#8a8c90',
        ],
        'line-width': [
          'match',
          ['get', 'kind'],
          'military_airbase',
          2.2,
          'military_naval',
          2,
          'military_land',
          1.8,
          1.4,
        ],
        'line-opacity': 0.95,
      },
    },
    {
      id: 'installations-runway',
      type: 'line',
      source: 'installations',
      filter: ['==', ['get', 'feature'], 'runway'],
      paint: {
        'line-color': '#f0e6c8',
        'line-width': 3,
        'line-opacity': 0.95,
      },
    },
    {
      id: 'installations-labels',
      type: 'symbol',
      source: 'installations',
      filter: ['==', ['get', 'feature'], 'label'],
      layout: {
        'text-field': [
          'format',
          ['get', 'shortName'],
          { 'font-scale': 1 },
          '\n',
          {},
          [
            'case',
            ['has', 'icao'],
            ['get', 'icao'],
            ['has', 'domain'],
            ['upcase', ['get', 'domain']],
            ['has', 'prdScenario'],
            ['get', 'prdScenario'],
            '',
          ],
          { 'font-scale': 0.78 },
        ],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.6],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': true,
      },
      paint: {
        'text-color': [
          'match',
          ['get', 'kind'],
          'military_airbase',
          '#f0d78c',
          'military_naval',
          '#9ec0ff',
          'military_land',
          '#8fd9b0',
          'prd_anchor',
          '#e9d5ff',
          '#d8d9db',
        ],
        'text-halo-color': '#06070a',
        'text-halo-width': 1.6,
      },
    },
    {
      id: 'policy-zones-fill',
      type: 'fill',
      source: 'policy-zones',
      paint: {
        'fill-color': [
          'match',
          ['get', 'kind'],
          'weapon-free',
          '#2f6fed',
          'hold-fire',
          '#c4921a',
          'no-go',
          '#c44b4b',
          '#5a5c60',
        ],
        'fill-opacity': [
          'match',
          ['get', 'kind'],
          'weapon-free',
          0.08,
          'hold-fire',
          0.05,
          'no-go',
          0.12,
          0.06,
        ],
      },
    },
    {
      id: 'policy-zones-outline',
      type: 'line',
      source: 'policy-zones',
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'weapon-free',
          '#2f6fed',
          'hold-fire',
          '#c4921a',
          'no-go',
          '#c44b4b',
          '#8a8c90',
        ],
        'line-opacity': 0.55,
        'line-width': 1.5,
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'trails-friendly',
      type: 'line',
      source: 'trails',
      filter: ['==', ['get', 'kind'], 'friendly'],
      paint: {
        'line-color': '#5b9fd4',
        'line-opacity': 0.5,
        'line-width': 1.5,
      },
    },
    {
      id: 'trails-threat',
      type: 'line',
      source: 'trails',
      filter: ['==', ['get', 'kind'], 'threat'],
      paint: {
        'line-color': '#c44b4b',
        'line-opacity': 0.55,
        'line-width': 1.5,
      },
    },
    {
      id: 'mesh-links',
      type: 'line',
      source: 'mesh',
      paint: {
        'line-color': '#2f6fed',
        'line-opacity': 0.28,
        'line-width': 1.25,
      },
    },
    {
      id: 'routes-preview',
      type: 'line',
      source: 'routes',
      paint: {
        'line-color': '#c4921a',
        'line-width': 1.75,
        'line-dasharray': [1.5, 1.5],
        'line-opacity': 0.95,
      },
    },
    {
      id: 'uncertainty-halos',
      type: 'circle',
      source: 'uncertainty',
      paint: {
        'circle-radius': METER_HALO_RADIUS,
        'circle-color': '#5b9fd4',
        'circle-opacity': 0.12,
        'circle-stroke-color': '#5b9fd4',
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.3,
      },
    },
    {
      id: 'threat-uncertainty',
      type: 'circle',
      source: 'threat-halos',
      paint: {
        'circle-radius': METER_HALO_RADIUS,
        'circle-color': '#c44b4b',
        'circle-opacity': 0.12,
        'circle-stroke-color': '#c44b4b',
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.3,
      },
    },
    {
      id: 'asset-ring',
      type: 'circle',
      source: 'asset',
      paint: {
        'circle-radius': 14,
        'circle-color': 'transparent',
        'circle-stroke-color': '#8a8c90',
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'asset-core',
      type: 'circle',
      source: 'asset',
      paint: {
        'circle-radius': 4,
        'circle-color': '#8a8c90',
      },
    },
    {
      id: 'drone-points',
      type: 'circle',
      source: 'drones',
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['get', 'selected'], false],
          9,
          7,
        ],
        'circle-color': '#5b9fd4',
        'circle-stroke-color': [
          'case',
          ['boolean', ['get', 'selected'], false],
          '#ffffff',
          '#0a0b0c',
        ],
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'drone-labels',
      type: 'symbol',
      source: 'drones',
      layout: {
        'text-field': ['get', 'id'],
        'text-size': 11,
        'text-offset': [0, 1.35],
        'text-anchor': 'top',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#5b9fd4',
        'text-halo-color': '#0a0b0c',
        'text-halo-width': 1.25,
      },
    },
    {
      id: 'threat-alert-pulse',
      type: 'circle',
      source: 'threat-alert-rings',
      paint: {
        'circle-radius': ['get', 'pulseRadius'],
        'circle-color': '#c4921a',
        'circle-opacity': ['get', 'pulseOpacity'],
        'circle-stroke-color': '#c4921a',
        'circle-stroke-width': 2,
        'circle-stroke-opacity': ['get', 'pulseOpacity'],
      },
    },
    {
      id: 'threat-points',
      type: 'circle',
      source: 'threats',
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['get', 'selected'], false],
          9,
          7,
        ],
        'circle-color': '#c44b4b',
        'circle-stroke-color': [
          'case',
          ['boolean', ['get', 'alert'], false],
          '#c4921a',
          [
            'case',
            ['boolean', ['get', 'selected'], false],
            '#ffffff',
            '#0a0b0c',
          ],
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['get', 'alert'], false],
          2.5,
          2,
        ],
      },
    },
    {
      id: 'threat-labels',
      type: 'symbol',
      source: 'threats',
      layout: {
        'text-field': ['get', 'id'],
        'text-size': 11,
        'text-offset': [0, 1.35],
        'text-anchor': 'top',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#c44b4b',
        'text-halo-color': '#0a0b0c',
        'text-halo-width': 1.25,
      },
    },
    {
      id: 'threat-hit',
      type: 'circle',
      source: 'threats',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          18,
          13,
          22,
          16,
          30,
        ],
        'circle-color': '#c44b4b',
        'circle-opacity': [
          'case',
          ['boolean', ['get', 'selected'], false],
          0.14,
          0.04,
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['get', 'selected'], false],
          '#ffffff',
          '#c44b4b',
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['get', 'selected'], false],
          2,
          1,
        ],
        'circle-stroke-opacity': [
          'case',
          ['boolean', ['get', 'hovered'], false],
          0.9,
          0.35,
        ],
      },
    },
  ]

  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer)
  }
  for (const layerId of [
    RANGE_CIRCLE_LAYER,
    RANGE_LINE_LAYER,
    RANGE_LABEL_LAYER,
  ]) {
    if (map.getLayer(layerId)) map.moveLayer(layerId)
  }
}

function syncOverlayLayers(
  map: MapboxMap,
  overlays: OverlayVisibility,
  volume3d: boolean,
) {
  applyMapOverlayVisibility(map, overlays, { volume3d })
}

function setSourceData(
  map: MapboxMap,
  sourceId: string,
  features: MapFeature[],
) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  source?.setData({ type: 'FeatureCollection', features })
}

function upsertDisplay(
  display: Map<string, DisplayPoint>,
  key: string,
  id: string,
  kind: DisplayPoint['kind'],
  position: Position,
  selected: boolean,
  alert: boolean,
  confidence: number,
) {
  const existing = display.get(key)
  if (!existing) {
    display.set(key, {
      id,
      kind,
      lng: position.lng,
      lat: position.lat,
      alt: position.alt,
      targetLng: position.lng,
      targetLat: position.lat,
      targetAlt: position.alt,
      selected,
      alert,
      confidence,
    })
    return
  }
  existing.targetLng = position.lng
  existing.targetLat = position.lat
  existing.targetAlt = position.alt
  existing.selected = selected
  existing.alert = alert
  existing.confidence = confidence
  existing.id = id
  existing.kind = kind
}

export function BattlespaceMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const displayRef = useRef(new globalThis.Map<string, DisplayPoint>())
  const trailsRef = useRef(new globalThis.Map<string, [number, number][]>())
  const liveRef = useRef<LiveState | null>(null)
  const followKeyRef = useRef<string | null>(null)
  const didInitialFitRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastGeoPushRef = useRef(0)
  const lastPanAtRef = useRef(0)
  const lastFlownTrackRef = useRef<string | null>(null)
  const hoverLeaveTimerRef = useRef<number | null>(null)
  const pinnedThreatRef = useRef<string | null>(null)
  const hoveredThreatRef = useRef<string | null>(null)
  const calloutTrackRef = useRef<string | null>(null)
  const calloutOverRef = useRef(false)
  const rangeMeasurementsRef = useRef<RangeMeasurement[]>([])
  const rangeDraftRef = useRef<RangeMeasurement | null>(null)
  const rangeSequenceRef = useRef(0)
  const activeMapToolRef = useRef<'range' | null>(null)
  const suppressPanRef = useRef(false)
  const getThreatPositionRef = useRef<() => Position | null>(() => null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [hoveredThreatId, setHoveredThreatId] = useState<string | null>(null)
  const [pinnedThreatId, setPinnedThreatId] = useState<string | null>(null)
  const [preferFlat, setPreferFlat] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorView, setInspectorView] = useState<'logs' | 'asset'>('logs')
  const [heatmapStatus, setHeatmapStatus] = useState('Waiting for data')
  const [edgePackHealth, setEdgePackHealth] = useState<EdgePackHealth | null>(null)
  const [styleEpoch, setStyleEpoch] = useState(0)
  const dispatch = useAppDispatch()

  const mode = useAppSelector((s) => s.ui.mode)
  const deploymentMode = useAppSelector((s) => s.ui.deploymentMode)
  const renderer: MapRenderer = deploymentMode === 'edge' ? 'maplibre' : 'mapbox'
  const mapOverlayTab = useAppSelector((s) => s.ui.mapOverlayTab)
  const mapBasemap = useAppSelector((s) => s.ui.mapBasemap)
  const overlayVisibility = useAppSelector((s) => s.ui.overlayVisibility)
  const offlinePrepOpen = useAppSelector((s) => s.ui.offlinePrepOpen)
  const mapFocusRequest = useAppSelector((s) => s.ui.mapFocusRequest)
  const terrainConfigUi = useAppSelector((s) => s.ui.terrainConfig)
  const envLayers = useAppSelector((s) => s.ui.envLayers)
  const heatmapMode = useAppSelector((s) => s.ui.heatmapMode)
  const activeMapTool = useAppSelector((s) => s.ui.activeMapTool)
  const mission = useAppSelector((s) => s.mission)
  const gnssDegraded = isDegraded(mission.gnss, mission.c2Link)
  const offlineMap = useMemo(() => resolveOfflineMapConfig(mapBasemap), [mapBasemap])
  const terrainConfig = useMemo(() => {
    const base = resolveTerrainConfig(offlineMap)
    return {
      ...base,
      ...terrainConfigUi,
      demUrl: base.demUrl,
      demTiles: base.demTiles,
      demEncoding: base.demEncoding,
      contourUrl: base.contourUrl,
      source: base.source,
    }
  }, [offlineMap, terrainConfigUi])
  const preferFlatRef = useRef(preferFlat)
  const modeRef = useRef(mode)
  const mapBasemapRef = useRef(mapBasemap)
  const prevBasemapRef = useRef(mapBasemap)
  const overlayVisibilityRef = useRef(overlayVisibility)
  const heatmapModeRef = useRef(heatmapMode)
  preferFlatRef.current = preferFlat
  modeRef.current = mode
  mapBasemapRef.current = mapBasemap
  overlayVisibilityRef.current = overlayVisibility
  heatmapModeRef.current = heatmapMode
  activeMapToolRef.current = activeMapTool

  const drones = useAppSelector((s) => s.fleet.drones)
  const selectedDroneId = useAppSelector((s) => s.fleet.selectedDroneId)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const selectionKind = useAppSelector((s) => s.threats.selectionKind)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const decisionLog = useAppSelector((s) => s.tasking.decisionLog)
  const asset = useAppSelector((s) => s.mission.protectedAsset)
  const policyZones = useAppSelector((s) => s.policy.zones)
  const connected = useAppSelector((s) => s.session.connected)
  const lastSyncAt = useAppSelector((s) => s.session.lastSyncAt)
  const reducedMotion = usePrefersReducedMotion()
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  const secondsSinceFix = useSecondsSinceFix(lastSyncAt, gnssDegraded)
  const perfRef = useRef(getMapPerfConfig(0, connected))
  const selectedDrone = drones.find((drone) => drone.id === selectedDroneId)

  useEffect(() => {
    if (selectedDroneId) {
      setInspectorView('asset')
      setInspectorOpen(true)
    } else {
      setInspectorView('logs')
    }
  }, [selectedDroneId])

  useEffect(() => {
    const timer = window.setTimeout(() => mapRef.current?.resize(), 220)
    return () => window.clearTimeout(timer)
  }, [inspectorOpen])

  const losResult = useMemo(() => {
    if (!gnssDegraded || !mapReady || !mapRef.current) return null
    const map = mapRef.current
    const drone =
      drones.find((d) => d.id === selectedDroneId) ??
      drones.find((d) => d.type === 'Scout') ??
      drones[0]
    const threat =
      tracks.find((t) => t.id === selectedTrackId) ??
      tracks.find((t) => alertTrackIds.includes(t.id))
    if (!drone || !threat) return null
    try {
      return analyzeLineOfSight(map, drone.position, threat.position)
    } catch {
      return null
    }
  }, [
    gnssDegraded,
    mapReady,
    drones,
    selectedDroneId,
    tracks,
    selectedTrackId,
    alertTrackIds,
    styleEpoch,
  ])

  const pinThreat = useCallback(
    (threatId: string, options?: { suppressPan?: boolean }) => {
      calloutTrackRef.current = threatId
      pinnedThreatRef.current = threatId
      setPinnedThreatId(threatId)
      setHoveredThreatId(null)
      dispatch(operatorSelectTrack(threatId))
      const pendingRec = liveRef.current?.recommendations.find(
        (r) => r.trackId === threatId && r.status === 'pending',
      )
      if (pendingRec) dispatch(setActiveRecommendation(pendingRec.id))

      if (options?.suppressPan) {
        suppressPanRef.current = true
        return
      }

      suppressPanRef.current = false
      lastFlownTrackRef.current = threatId
      followKeyRef.current = `threat:${threatId}`
      const map = mapRef.current
      if (!map) return
      const display = displayRef.current.get(`threat:${threatId}`)
      const track = liveRef.current?.tracks.find((t) => t.id === threatId)
      const lng = display?.lng ?? track?.position.lng
      const lat = display?.lat ?? track?.position.lat
      if (lng == null || lat == null) return
      const pitch = preferFlatRef.current ? 0 : MODE_CAMERA[modeRef.current].pitch
      const zoomTarget = preferFlatRef.current
        ? 14
        : (MODE_CAMERA[modeRef.current].zoom ?? 14.4)
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), zoomTarget),
        pitch,
        duration: mapMotionDuration(reducedMotionRef.current, 700),
        essential: true,
        offset: [0, 48],
      })
    },
    [dispatch],
  )

  const unpinThreat = useCallback(() => {
    calloutTrackRef.current = null
    pinnedThreatRef.current = null
    setPinnedThreatId(null)
    setHoveredThreatId(null)
    lastFlownTrackRef.current = null
  }, [])

  useEffect(() => {
    pinnedThreatRef.current = pinnedThreatId
  }, [pinnedThreatId])

  useEffect(() => {
    hoveredThreatRef.current = hoveredThreatId
  }, [hoveredThreatId])

  // Pin callout only for operator map/queue selection — not auto-focus.
  useEffect(() => {
    if (selectionKind !== 'operator' || !selectedTrackId) return
    calloutTrackRef.current = selectedTrackId
    pinnedThreatRef.current = selectedTrackId
    setPinnedThreatId(selectedTrackId)
  }, [selectedTrackId, selectionKind])

  // Fly once per track selection; operator picks get full fly, auto-focus is gentler.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !selectedTrackId || !selectionKind) return
    if (suppressPanRef.current) {
      suppressPanRef.current = false
      return
    }
    if (lastFlownTrackRef.current === selectedTrackId) return

    const run = () => {
      const display = displayRef.current.get(`threat:${selectedTrackId}`)
      const track = liveRef.current?.tracks.find((t) => t.id === selectedTrackId)
      const lng = display?.lng ?? track?.position.lng
      const lat = display?.lat ?? track?.position.lat
      if (lng == null || lat == null) return false

      lastFlownTrackRef.current = selectedTrackId
      followKeyRef.current = `threat:${selectedTrackId}`
      const pitch = preferFlatRef.current ? 0 : MODE_CAMERA[modeRef.current].pitch
      const zoomTarget = preferFlatRef.current
        ? 14
        : (MODE_CAMERA[modeRef.current].zoom ?? 14.4)
      map.easeTo({
        center: [lng, lat],
        zoom:
          selectionKind === 'operator'
            ? Math.max(map.getZoom(), zoomTarget)
            : Math.max(map.getZoom(), zoomTarget - 0.8),
        pitch,
        duration: mapMotionDuration(
          reducedMotionRef.current,
          selectionKind === 'operator' ? 700 : 900,
        ),
        essential: true,
        offset: [0, 48],
      })
      return true
    }

    if (run()) return
    const raf = requestAnimationFrame(() => {
      run()
    })
    return () => cancelAnimationFrame(raf)
  }, [selectedTrackId, selectionKind, mapReady])

  const activeCalloutId = pinnedThreatId ?? hoveredThreatId
  const activeCalloutTrack = activeCalloutId
    ? tracks.find((t) => t.id === activeCalloutId)
    : null
  const calloutMode = pinnedThreatId ? 'pinned' : 'hover'

  getThreatPositionRef.current = () => {
    if (!activeCalloutId) return null
    const point = displayRef.current.get(`threat:${activeCalloutId}`)
    if (!point) return null
    return { lng: point.lng, lat: point.lat, alt: point.alt }
  }

  const getThreatPosition = useCallback(
    () => getThreatPositionRef.current(),
    [],
  )

  // Keep latest store values available to the rAF loop without restarting it.
  liveRef.current = {
    drones,
    tracks,
    recommendations,
    selectedDroneId,
    selectedTrackId,
    alertTrackIds,
    asset,
    connected,
    gnssDegraded,
    secondsSinceFix,
    reducedMotion,
  }
  perfRef.current = getMapPerfConfig(drones.length + tracks.length, connected)

  useEffect(() => {
    if (renderer !== 'maplibre') {
      setEdgePackHealth(null)
      return
    }
    const controller = new AbortController()
    void fetch('/api/v1/edge-map/health', { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as EdgePackHealth
        if (!response.ok || !body.ok) throw new Error(body.error ?? 'Edge map pack unavailable')
        setEdgePackHealth(body)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setEdgePackHealth({
          ok: false,
          error: error instanceof Error ? error.message : 'Edge map pack unavailable',
        })
      })
    return () => controller.abort()
  }, [renderer])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const offlineConfig = resolveOfflineMapConfig(mapBasemapRef.current)
    if (renderer === 'mapbox' && !offlineConfig.mapboxToken && !offlineConfig.offlinePreferred) {
      setMapError('Missing VITE_MAPBOX_TOKEN. Add it to .env or set VITE_OFFLINE_MODE=true.')
      return
    }

    if (renderer === 'mapbox') {
      mapboxgl.accessToken = offlineConfig.mapboxToken || MAPBOX_TOKEN || ''
    }

    const camera = MODE_CAMERA[modeRef.current]
    const mapEngine = renderer === 'mapbox'
      ? mapboxgl
      : (maplibregl as unknown as typeof mapboxgl)

    const styleUrl =
      renderer === 'mapbox'
        ? offlineConfig.styleUrl || MAP_STYLE
        : EDGE_MAP_STYLE

    const map = new mapEngine.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [103.8198, 1.3521],
      zoom: 13.4,
      pitch: preferFlatRef.current ? 0 : camera.pitch,
      bearing: preferFlatRef.current ? 0 : camera.bearing,
      maxPitch: 85,
      antialias: renderer === 'maplibre',
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      attributionControl: true,
      logoPosition: 'bottom-right',
    })

    map.addControl(
      new mapEngine.NavigationControl({
        showCompass: true,
        visualizePitch: true,
        showZoom: true,
      }),
      'top-right',
    )

    const ensureLayers = () => {
      // Terrain first so hillshade sits under operator overlays.
      applyModeCamera(
        map,
        modeRef.current,
        preferFlatRef.current,
        false,
        renderer,
        reducedMotionRef.current,
      )
      addOverlayLayers(map)
      configureHeatmapLayer(map, heatmapModeRef.current)
      syncOverlayLayers(
        map,
        overlayVisibilityRef.current,
        !preferFlatRef.current,
      )
      const installations = map.getSource('installations') as GeoJSONSource | undefined
      installations?.setData(installationsForTab('bases'))
      setMapReady(true)
      setMapError(null)
    }

    const publishMapObjects = () => {
      const objects = classifyLoadedMapObjects(map, renderer)
      window.dispatchEvent(
        new CustomEvent('sentinel:map-objects', {
          detail: { objects },
        }),
      )
    }

    map.once('load', ensureLayers)
    map.on('idle', publishMapObjects)
    map.on('style.load', () => {
      setStyleEpoch((e) => e + 1)
      applyModeCamera(
        map,
        modeRef.current,
        preferFlatRef.current,
        false,
        renderer,
        reducedMotionRef.current,
      )
      addOverlayLayers(map)
      configureHeatmapLayer(map, heatmapModeRef.current)
      syncOverlayLayers(
        map,
        overlayVisibilityRef.current,
        !preferFlatRef.current,
      )
      const installations = map.getSource('installations') as GeoJSONSource | undefined
      installations?.setData(installationsForTab('bases'))
    })

    map.on('error', (event) => {
      const message = event.error?.message ?? `${renderer === 'mapbox' ? 'Mapbox' : 'Edge map'} failed to load`
      const lower = message.toLowerCase()
      if (lower.includes('terrain') || lower.includes('dem')) {
        setMapError(`3D terrain failed: ${message}`)
        return
      }
      if (!lower.includes('imagery')) setMapError(message)
    })

    mapRef.current = map

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      map.off('idle', publishMapObjects)
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
    // Map instance is created once; mode/pitch updates handled in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || renderer !== 'mapbox') return
    if (prevBasemapRef.current === mapBasemap) return
    prevBasemapRef.current = mapBasemap

    const config = resolveOfflineMapConfig(mapBasemap)
    map.setStyle(config.styleUrl)
  }, [mapBasemap, mapReady, renderer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.isStyleLoaded()) return
    applyModeCamera(
      map,
      mode,
      preferFlat,
      true,
      renderer,
      reducedMotionRef.current,
    )
  }, [mapBasemap, styleEpoch, mapReady, mode, preferFlat, renderer])

  useEffect(() => {
    if (renderer !== 'mapbox') return
    const onConnChange = () => {
      const map = mapRef.current
      if (!map || !mapReady) return
      const config = resolveOfflineMapConfig(mapBasemapRef.current)
      map.setStyle(config.styleUrl)
    }
    window.addEventListener('online', onConnChange)
    window.addEventListener('offline', onConnChange)
    return () => {
      window.removeEventListener('online', onConnChange)
      window.removeEventListener('offline', onConnChange)
    }
  }, [mapReady, renderer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || offlineMap.offlinePreferred || renderer !== 'mapbox') return
    void prefetchOperationalTerrain(map)
  }, [mapReady, offlineMap.offlinePreferred, renderer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    applyModeCamera(
      map,
      mode,
      preferFlat,
      true,
      renderer,
      reducedMotionRef.current,
    )
  }, [mode, preferFlat, mapReady, renderer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.isStyleLoaded()) return
    syncOverlayLayers(map, overlayVisibility, !preferFlat)
  }, [overlayVisibility, mapReady, styleEpoch, preferFlat])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!map.getSource(HEATMAP_SOURCE)) {
      setHeatmapStatus('Heatmap source unavailable')
      return
    }
    configureHeatmapLayer(map, heatmapMode)
    if (!heatmapMode) {
      setSourceData(map, HEATMAP_SOURCE, [])
      setHeatmapStatus('Waiting for data')
      return
    }
    if (heatmapMode === 'terrain') return

    const features = operationalHeatmapFeatures(
      heatmapMode,
      drones,
      tracks,
      trailsRef.current,
    )
    setSourceData(map, HEATMAP_SOURCE, features)
    if (heatmapMode === 'enemy') {
      setHeatmapStatus(
        `${tracks.length} fused track${tracks.length === 1 ? '' : 's'} · live`,
      )
    } else if (heatmapMode === 'friendly') {
      setHeatmapStatus(
        `${drones.length} reporting asset${drones.length === 1 ? '' : 's'} · live`,
      )
    } else {
      const contributors = tracks.reduce(
        (total, track) => total + track.sensors.length,
        0,
      )
      setHeatmapStatus(
        `${contributors} sensor contribution${contributors === 1 ? '' : 's'} · live`,
      )
    }
  }, [heatmapMode, drones, tracks, mapReady, styleEpoch])

  useEffect(() => {
    if (heatmapMode !== 'terrain') return
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!map.getSource(TERRAIN_HEATMAP_SOURCE)) {
      setHeatmapStatus('Terrain surface unavailable')
      return
    }

    let cancelled = false
    let timer: number | null = null
    let terrainRetryCount = 0

    const calculate = () => {
      timer = null
      if (cancelled || !map.getSource(TERRAIN_HEATMAP_SOURCE)) return

      const bounds = map.getBounds()
      if (!bounds) {
        setHeatmapStatus('Map bounds unavailable')
        return
      }
      const hardwareThreads = navigator.hardwareConcurrency ?? 4
      const compactDevice = window.innerWidth < 900 || hardwareThreads <= 4
      const tier = perfRef.current.tier
      const gridSize = compactDevice
        ? 15
        : tier === 'full'
          ? 23
          : tier === 'reduced'
            ? 19
            : 15
      const west = bounds.getWest()
      const east = bounds.getEast()
      const south = bounds.getSouth()
      const north = bounds.getNorth()
      const lngStep = (east - west) / Math.max(1, gridSize - 1)
      const latStep = (north - south) / Math.max(1, gridSize - 1)
      const elevations: Array<number | null> = []

      for (let row = 0; row < gridSize; row++) {
        const lat = south + latStep * row
        for (let column = 0; column < gridSize; column++) {
          const lng = west + lngStep * column
          try {
            elevations.push(
              map.queryTerrainElevation(
                { lng, lat },
                { exaggerated: false },
              ) ?? null,
            )
          } catch {
            elevations.push(null)
          }
        }
      }

      const validSamples = elevations.filter(
        (elevation): elevation is number => elevation != null,
      ).length
      if (validSamples < gridSize) {
        setHeatmapStatus('DEM unavailable in this viewport')
        return
      }
      const numericElevations = elevations as number[]
      const elevationRange =
        Math.max(...numericElevations) - Math.min(...numericElevations)
      if (elevationRange < 0.5 && terrainRetryCount < 6) {
        terrainRetryCount += 1
        setHeatmapStatus(`Loading DEM tiles · retry ${terrainRetryCount}/6`)
        timer = window.setTimeout(calculate, 650)
        return
      }

      const slopeSamples: Array<{
        id: string
        coordinates: [number, number]
        slopeDegrees: number
      }> = []
      const elevationAt = (row: number, column: number) =>
        elevations[row * gridSize + column] ?? 0

      for (let row = 0; row < gridSize; row++) {
        const lat = south + latStep * row
        const metersPerLng =
          111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))
        const xDistance = Math.max(1, Math.abs(lngStep) * metersPerLng)
        const yDistance = Math.max(1, Math.abs(latStep) * 110_540)
        for (let column = 0; column < gridSize; column++) {
          const lng = west + lngStep * column
          const left = elevationAt(row, Math.max(0, column - 1))
          const right = elevationAt(row, Math.min(gridSize - 1, column + 1))
          const below = elevationAt(Math.max(0, row - 1), column)
          const above = elevationAt(Math.min(gridSize - 1, row + 1), column)
          const xDivisor =
            (column === 0 || column === gridSize - 1 ? 1 : 2) * xDistance
          const yDivisor =
            (row === 0 || row === gridSize - 1 ? 1 : 2) * yDistance
          const gradientX = (right - left) / xDivisor
          const gradientY = (above - below) / yDivisor
          const slopeDegrees =
            (Math.atan(Math.hypot(gradientX, gradientY)) * 180) / Math.PI
          slopeSamples.push({
            id: `terrain:${row}:${column}`,
            coordinates: [lng, lat],
            slopeDegrees,
          })
        }
      }

      if (cancelled) return
      const orderedSlopes = slopeSamples
        .map((sample) => sample.slopeDegrees)
        .sort((a, b) => a - b)
      const percentileIndex = Math.min(
        orderedSlopes.length - 1,
        Math.floor(orderedSlopes.length * 0.95),
      )
      const referenceSlope = orderedSlopes[percentileIndex] ?? 0
      const weights = slopeSamples.map((sample) =>
        absoluteSlopeWeight(sample.slopeDegrees),
      )
      const outputSize = compactDevice ? 160 : 256
      const imageUrl = renderTerrainSurface(weights, gridSize, outputSize)
      const source = map.getSource(TERRAIN_HEATMAP_SOURCE) as
        | ImageSource
        | undefined
      source?.updateImage({
        url: imageUrl,
        coordinates: [
          [west, north],
          [east, north],
          [east, south],
          [west, south],
        ],
      })
      map.triggerRepaint()
      setHeatmapStatus(
        `${validSamples} DEM samples · absolute slope · P95 ${referenceSlope.toFixed(1)}°`,
      )
    }

    const schedule = () => {
      if (timer != null) window.clearTimeout(timer)
      terrainRetryCount = 0
      timer = window.setTimeout(calculate, 120)
    }

    configureHeatmapLayer(map, 'terrain')
    schedule()
    map.on('moveend', schedule)
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
      map.off('moveend', schedule)
    }
  }, [heatmapMode, mapReady, styleEpoch])

  // Sync server positions into display targets.
  useEffect(() => {
    const display = displayRef.current
    const liveKeys = new Set<string>()

    const track = (key: string) => {
      liveKeys.add(key)
    }

    track('asset')
    upsertDisplay(display, 'asset', 'ASSET', 'asset', asset, false, false, 100)

    for (const drone of drones) {
      const key = `friendly:${drone.id}`
      track(key)
      upsertDisplay(
        display,
        key,
        drone.id,
        'friendly',
        drone.position,
        drone.id === selectedDroneId,
        false,
        drone.positioningConfidence,
      )
    }

    for (const threat of tracks) {
      const key = `threat:${threat.id}`
      track(key)
      upsertDisplay(
        display,
        key,
        threat.id,
        'threat',
        threat.position,
        threat.id === selectedTrackId,
        alertTrackIds.includes(threat.id),
        threat.fusionConfidence,
      )
    }

    for (const key of [...display.keys()]) {
      if (!liveKeys.has(key)) {
        display.delete(key)
        trailsRef.current.delete(key)
      }
    }
  }, [
    asset,
    drones,
    tracks,
    selectedDroneId,
    selectedTrackId,
    alertTrackIds,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map?.getSource('policy-zones')) return
    const polygonFeatures = policyZones.map((zone) => ({
      type: 'Feature' as const,
      properties: { id: zone.id, kind: zone.kind, name: zone.name },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [zone.coordinates],
      },
    }))
    const source = map.getSource('policy-zones') as GeoJSONSource
    source.setData({ type: 'FeatureCollection', features: polygonFeatures })
  }, [mapReady, policyZones])

  // Swap bases Γåö scenarios overlay and frame the active set.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    const collection = installationsForTab(mapOverlayTab)
    const source = map.getSource('installations') as GeoJSONSource | undefined
    source?.setData(collection)

    const points = collection.features.filter((f) => f.properties.feature === 'label')
    if (points.length === 0) return
    const coords = points.map((f) => f.geometry.coordinates as [number, number])
    const bounds = coordinateBounds(coords)
    map.fitBounds(bounds, {
      padding: { top: 72, bottom: 140, left: 80, right: 80 },
      maxZoom: mapOverlayTab === 'bases' ? 11.6 : 12.2,
      duration: mapMotionDuration(reducedMotionRef.current, 800),
      pitch: preferFlatRef.current ? 0 : MODE_CAMERA[modeRef.current].pitch * 0.75,
    })
  }, [mapReady, mapOverlayTab])

  // Re-frame when selection changes.
  useEffect(() => {
    followKeyRef.current = null
  }, [selectedTrackId, selectedDroneId])

  // Field navigator requests always re-frame, including a repeated selection.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !mapFocusRequest) return
    followKeyRef.current = mapFocusRequest.key
    map.easeTo({
      center: [mapFocusRequest.position.lng, mapFocusRequest.position.lat],
      zoom: Math.max(map.getZoom(), preferFlatRef.current ? 14 : 14.4),
      pitch: preferFlatRef.current ? 0 : MODE_CAMERA[modeRef.current].pitch,
      duration: mapMotionDuration(reducedMotionRef.current, 700),
      essential: true,
      offset: [120, 40],
    })
  }, [mapFocusRequest, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return

    const syncMeasurements = () => {
      const measurements = rangeDraftRef.current
        ? [...rangeMeasurementsRef.current, rangeDraftRef.current]
        : rangeMeasurementsRef.current
      setSourceData(map, RANGE_SOURCE, rangeFeatures(measurements))
    }

    if (activeMapTool !== 'range') {
      rangeMeasurementsRef.current = []
      rangeDraftRef.current = null
      syncMeasurements()
      return
    }

    let drawing = false
    let restoreDragPan = false
    const updateDraft = (end: [number, number]) => {
      const draft = rangeDraftRef.current
      if (!draft) return
      draft.end = end
      draft.distanceM = distanceMeters(draft.start, end)
      syncMeasurements()
    }
    const finishDrawing = () => {
      if (!drawing) return
      drawing = false
      const draft = rangeDraftRef.current
      if (draft && draft.distanceM >= 1) {
        rangeMeasurementsRef.current = [
          ...rangeMeasurementsRef.current,
          draft,
        ]
      }
      rangeDraftRef.current = null
      syncMeasurements()
      if (restoreDragPan) map.dragPan.enable()
      restoreDragPan = false
    }
    const onMouseDown = (event: MapMouseEvent) => {
      if (event.originalEvent.button !== 0) return
      event.preventDefault()
      const start: [number, number] = [event.lngLat.lng, event.lngLat.lat]
      drawing = true
      restoreDragPan = map.dragPan.isEnabled()
      map.dragPan.disable()
      rangeSequenceRef.current += 1
      rangeDraftRef.current = {
        id: `range:${rangeSequenceRef.current}`,
        start,
        end: start,
        distanceM: 0,
      }
      syncMeasurements()
    }
    const onMouseMove = (event: MapMouseEvent) => {
      if (!drawing) return
      updateDraft([event.lngLat.lng, event.lngLat.lat])
    }
    const onMouseUp = (event: MapMouseEvent) => {
      if (!drawing) return
      updateDraft([event.lngLat.lng, event.lngLat.lat])
      finishDrawing()
    }
    const onWindowMouseUp = () => finishDrawing()

    syncMeasurements()
    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
    window.addEventListener('mouseup', onWindowMouseUp)

    const dashFrames = [
      [0, 4, 3],
      [0.5, 4, 2.5],
      [1, 4, 2],
      [1.5, 4, 1.5],
      [2, 4, 1],
      [2.5, 4, 0.5],
      [3, 4, 0],
    ]
    let dashFrame = 0
    const dashTimer = window.setInterval(() => {
      if (!map.getLayer(RANGE_LINE_LAYER)) return
      dashFrame = (dashFrame + 1) % dashFrames.length
      map.setPaintProperty(
        RANGE_LINE_LAYER,
        'line-dasharray',
        dashFrames[dashFrame],
      )
    }, 90)

    return () => {
      window.clearInterval(dashTimer)
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      window.removeEventListener('mouseup', onWindowMouseUp)
      if (restoreDragPan) map.dragPan.enable()
    }
  }, [activeMapTool, mapReady, styleEpoch])

  // Persistent render loop.
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return

    const threatLayers = [...THREAT_INTERACTIVE_LAYERS]
    const droneLayers = ['drone-points', 'drone-labels']

    const onThreatClick = (e: MapMouseEvent) => {
      if (isOperatorUiTarget(e.originalEvent.target)) return
      const threatId = resolveThreatId(map, e.point, e.features)
      if (!threatId) return
      e.preventDefault()
      pinThreat(threatId)
    }

    const onMapClick = (e: MapMouseEvent) => {
      if (isOperatorUiTarget(e.originalEvent.target)) return
      if (activeMapToolRef.current === 'range') return

      const threatId = resolveThreatId(map, e.point)
      if (threatId) return

      const droneHits = map.queryRenderedFeatures(e.point, { layers: droneLayers })
      const droneProps = (droneHits[0] as { properties?: { id?: string } } | undefined)
        ?.properties
      const droneId = droneProps?.id
      if (droneId && droneHits[0]?.source === 'drones') {
        dispatch(selectDrone(String(droneId)))
        dispatch(setTelemetryExpanded(false))
        unpinThreat()
        return
      }

      window.dispatchEvent(
        new CustomEvent('sentinel:map-point', {
          detail: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        }),
      )

      if (!calloutOverRef.current) {
        unpinThreat()
      }
    }

    const onThreatEnter = (e: MapMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer'
      const threatId = resolveThreatId(map, e.point, e.features)
      if (!threatId || pinnedThreatRef.current) return
      calloutTrackRef.current = threatId
      if (hoveredThreatRef.current !== threatId) {
        hoveredThreatRef.current = threatId
        setHoveredThreatId(threatId)
      }
    }

    const onThreatMove = (e: MapMouseEvent) => {
      const threatId = resolveThreatId(map, e.point, e.features)
      if (!threatId || pinnedThreatRef.current) return
      calloutTrackRef.current = threatId
      if (hoveredThreatRef.current !== threatId) {
        hoveredThreatRef.current = threatId
        setHoveredThreatId(threatId)
      }
    }

    const onThreatLeave = () => {
      if (hoverLeaveTimerRef.current != null) {
        window.clearTimeout(hoverLeaveTimerRef.current)
      }
      hoverLeaveTimerRef.current = window.setTimeout(() => {
        hoverLeaveTimerRef.current = null
        if (pinnedThreatRef.current || calloutOverRef.current) return
        hoveredThreatRef.current = null
        setHoveredThreatId(null)
        calloutTrackRef.current = null
        map.getCanvas().style.cursor = ''
      }, 100)
    }

    const onDroneEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const onDroneLeave = () => {
      if (!hoveredThreatRef.current && !pinnedThreatRef.current) {
        map.getCanvas().style.cursor = ''
      }
    }

    const onThreatTouch = (e: mapboxgl.MapTouchEvent) => {
      const threatId = resolveThreatId(map, e.point, e.features)
      if (!threatId || pinnedThreatRef.current) return
      calloutTrackRef.current = threatId
      hoveredThreatRef.current = threatId
      setHoveredThreatId(threatId)
    }

    map.on('click', onMapClick)
    for (const layer of threatLayers) {
      map.on('click', layer, onThreatClick)
      map.on('mouseenter', layer, onThreatEnter)
      map.on('mousemove', layer, onThreatMove)
      map.on('mouseleave', layer, onThreatLeave)
      map.on('touchstart', layer, onThreatTouch)
    }
    for (const layer of droneLayers) {
      map.on('mouseenter', layer, onDroneEnter)
      map.on('mouseleave', layer, onDroneLeave)
    }

    const paint = () => {
      const current = mapRef.current
      const live = liveRef.current
      if (!current || !live || !current.getSource('drones')) {
        rafRef.current = requestAnimationFrame(paint)
        return
      }

      const now = performance.now()
      const pushGeo = now - lastGeoPushRef.current >= perfRef.current.geoPushMs
      const trailMax = Math.min(TRAIL_LENGTH, perfRef.current.trailLength)
      const showMesh = perfRef.current.meshLinks
      const pulseAlerts = perfRef.current.alertPulse && !live.reducedMotion
      const display = displayRef.current
      const trails = trailsRef.current

      for (const [, point] of display) {
        point.lng += (point.targetLng - point.lng) * LERP
        point.lat += (point.targetLat - point.lat) * LERP
        point.alt += (point.targetAlt - point.alt) * LERP
      }

      let hasAlerts = false
      for (const point of display.values()) {
        if (point.kind === 'threat' && point.alert) {
          hasAlerts = true
          break
        }
      }

      if (pushGeo) {
        const droneFeatures: MapFeature[] = []
        const threatFeatures: MapFeature[] = []
        const trailFeatures: MapFeature[] = []
        const uncertaintyFeatures: MapFeature[] = []
        const threatHaloFeatures: MapFeature[] = []
        const threatAlertRingFeatures: MapFeature[] = []
        const meshFeatures: MapFeature[] = []
        let assetFeature: MapFeature | null = null
        const alertPulse = pulseAlerts ? 0.5 + 0.5 * Math.sin(now / 550) : 0.65

        for (const [key, point] of display) {
          const coord: [number, number] = [point.lng, point.lat]
          const history = trails.get(key) ?? []
          const last = history[history.length - 1]
          if (
            !last ||
            Math.hypot(last[0] - coord[0], last[1] - coord[1]) > 0.000008
          ) {
            history.push(coord)
            while (history.length > trailMax) history.shift()
            trails.set(key, history)
          }

          if (history.length > 1 && point.kind !== 'asset') {
            trailFeatures.push(
              lineFeature(key, [...history], { kind: point.kind, id: point.id }),
            )
          }

          if (point.kind === 'asset') {
            assetFeature = pointFeature('asset', point, { kind: 'asset' })
            continue
          }

          const feature = pointFeature(point.id, point, {
            id: point.id,
            selected: point.selected,
            alert: point.alert,
            confidence: point.confidence,
            hovered:
              point.id === hoveredThreatRef.current ||
              point.id === pinnedThreatRef.current,
          })

          if (point.kind === 'friendly') {
            droneFeatures.push(feature)
            let radiusM = Math.max(8, (100 - point.confidence) * 0.6)
            let uncertain = point.confidence < 85
            if (live.gnssDegraded) {
              const drift = computeTerrainDrift({
                lng: point.lng,
                lat: point.lat,
                secondsSinceFix: live.secondsSinceFix,
                confidence: point.confidence,
                gnssDenied: true,
              })
              radiusM = Math.max(radiusM, drift.uncertaintyRadiusM)
              uncertain = true
            }
            if (uncertain) {
              uncertaintyFeatures.push(
                pointFeature(point.id, point, {
                  id: point.id,
                  lat: point.lat,
                  radiusM,
                }),
              )
            }
          } else {
            threatFeatures.push(feature)
            if (point.confidence < 85) {
              threatHaloFeatures.push(
                pointFeature(point.id, point, {
                  id: point.id,
                  lat: point.lat,
                  radiusM: Math.max(15, (100 - point.confidence) * 1.2),
                }),
              )
            }
            if (point.alert) {
              const ringRadius = pulseAlerts ? 16 + alertPulse * 10 : 18
              const ringOpacity = pulseAlerts ? 0.18 + alertPulse * 0.28 : 0.35
              threatAlertRingFeatures.push(
                pointFeature(`${point.id}-alert-ring`, point, {
                  id: point.id,
                  pulseRadius: ringRadius,
                  pulseOpacity: ringOpacity,
                }),
              )
            }
          }
        }

        const droneById = new globalThis.Map(
          [...display.values()]
            .filter((p) => p.kind === 'friendly')
            .map((p) => [p.id, p]),
        )
        const seenLinks = new Set<string>()
        if (showMesh) {
          for (const drone of live.drones) {
            const from = droneById.get(drone.id)
            if (!from) continue
            for (const linkId of drone.meshLinks) {
              const linkKey = [drone.id, linkId].sort().join('|')
              if (seenLinks.has(linkKey)) continue
              seenLinks.add(linkKey)
              const to = droneById.get(linkId)
              if (!to) continue
              meshFeatures.push(
                lineFeature(linkKey, [
                  [from.lng, from.lat],
                  [to.lng, to.lat],
                ]),
              )
            }
          }
        }

        const routeFeatures: MapFeature[] = live.recommendations
          .filter((r) => r.status === 'pending' || r.status === 'confirmed')
          .map((r) => {
            const track = display.get(`threat:${r.trackId}`)
            const primary = display.get(`friendly:${r.droneIds[0]}`)
            const coords: [number, number][] = []
            if (primary) coords.push([primary.lng, primary.lat])
            else if (r.route.waypoints[0]) {
              coords.push([r.route.waypoints[0].lng, r.route.waypoints[0].lat])
            }
            for (const waypoint of r.route.waypoints.slice(1, -1)) {
              coords.push([waypoint.lng, waypoint.lat])
            }
            if (track) coords.push([track.lng, track.lat])
            else {
              const last = r.route.waypoints[r.route.waypoints.length - 1]
              if (last) coords.push([last.lng, last.lat])
            }
            return lineFeature(r.id, coords, { id: r.id, status: r.status })
          })

        setSourceData(current, 'asset', assetFeature ? [assetFeature] : [])
        setSourceData(current, 'drones', droneFeatures)
        setSourceData(current, 'threats', threatFeatures)
        setSourceData(current, 'trails', trailFeatures)
        setSourceData(current, 'uncertainty', uncertaintyFeatures)
        setSourceData(current, 'threat-halos', threatHaloFeatures)
        setSourceData(current, 'threat-alert-rings', threatAlertRingFeatures)
        setSourceData(current, 'mesh', meshFeatures)
        setSourceData(current, 'routes', routeFeatures)
        lastGeoPushRef.current = now
      } else if (hasAlerts && pulseAlerts) {
        const alertPulse = 0.5 + 0.5 * Math.sin(now / 550)
        const threatAlertRingFeatures: MapFeature[] = []
        for (const [, point] of display) {
          if (point.kind !== 'threat' || !point.alert) continue
          threatAlertRingFeatures.push(
            pointFeature(`${point.id}-alert-ring`, point, {
              id: point.id,
              pulseRadius: 16 + alertPulse * 10,
              pulseOpacity: 0.18 + alertPulse * 0.28,
            }),
          )
        }
        setSourceData(current, 'threat-alert-rings', threatAlertRingFeatures)
      }

      // Continuous chase only for non-pinned selection changes handled above.
      // Keep soft follow when a track is selected and drifts out of frame.
      const followKey =
        suppressPanRef.current
          ? null
          : live.selectedTrackId
            ? `threat:${live.selectedTrackId}`
            : live.selectedDroneId
              ? `friendly:${live.selectedDroneId}`
              : null

      if (suppressPanRef.current) {
        suppressPanRef.current = false
      }

      if (followKey && followKey.startsWith('threat:')) {
        const target = display.get(followKey)
        const bounds = current.getBounds()
        const isPinned = pinnedThreatRef.current === live.selectedTrackId
        if (target && bounds && isPinned) {
          const ne = bounds.getNorthEast()
          const sw = bounds.getSouthWest()
          const lngSpan = Math.max(ne.lng - sw.lng, 0.0001)
          const latSpan = Math.max(ne.lat - sw.lat, 0.0001)
          const pad = 0.15
          const outside =
            target.lng < sw.lng + lngSpan * pad ||
            target.lng > ne.lng - lngSpan * pad ||
            target.lat < sw.lat + latSpan * pad ||
            target.lat > ne.lat - latSpan * pad

          // Soft re-center if adversary drifts out of frame (no full re-fly).
          if (outside && followKeyRef.current === followKey) {
            if (!current.isMoving() && now - lastPanAtRef.current > 800) {
              lastPanAtRef.current = now
              current.easeTo({
                center: [target.lng, target.lat],
                duration: mapMotionDuration(live.reducedMotion, 350),
                essential: true,
              })
            }
          }
        }
      } else if (followKey) {
        const target = display.get(followKey)
        const bounds = current.getBounds()
        if (target && bounds) {
          const ne = bounds.getNorthEast()
          const sw = bounds.getSouthWest()
          const lngSpan = Math.max(ne.lng - sw.lng, 0.0001)
          const latSpan = Math.max(ne.lat - sw.lat, 0.0001)
          const pad = 0.2
          const outside =
            target.lng < sw.lng + lngSpan * pad ||
            target.lng > ne.lng - lngSpan * pad ||
            target.lat < sw.lat + latSpan * pad ||
            target.lat > ne.lat - latSpan * pad

          if (outside || followKeyRef.current !== followKey) {
            if (!current.isMoving() && now - lastPanAtRef.current > 600) {
              followKeyRef.current = followKey
              lastPanAtRef.current = now
              current.easeTo({
                center: [target.lng, target.lat],
                duration: mapMotionDuration(live.reducedMotion, 400),
                essential: true,
              })
            }
          }
        }
      } else if (
        live.connected &&
        !didInitialFitRef.current &&
        display.size > 1
      ) {
        const coords = [...display.values()].map(
          (p) => [p.lng, p.lat] as [number, number],
        )
        const bounds = coordinateBounds(coords)
        current.fitBounds(bounds, {
          padding: { top: 80, bottom: 160, left: 360, right: 360 },
          maxZoom: 14,
          duration: mapMotionDuration(live.reducedMotion, 700),
        })
        didInitialFitRef.current = true
      }

      rafRef.current = requestAnimationFrame(paint)
    }

    rafRef.current = requestAnimationFrame(paint)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (hoverLeaveTimerRef.current != null) {
        window.clearTimeout(hoverLeaveTimerRef.current)
      }
      map.off('click', onMapClick)
      for (const layer of threatLayers) {
        map.off('click', layer, onThreatClick)
        map.off('mouseenter', layer, onThreatEnter)
        map.off('mousemove', layer, onThreatMove)
        map.off('mouseleave', layer, onThreatLeave)
        map.off('touchstart', layer, onThreatTouch)
      }
      for (const layer of droneLayers) {
        map.off('mouseenter', layer, onDroneEnter)
        map.off('mouseleave', layer, onDroneLeave)
      }
    }
  }, [mapReady, dispatch, pinThreat, unpinThreat])

  return (
    <div
      className={[
        'map-shell',
        inspectorOpen ? 'is-inspector-open' : '',
        activeMapTool === 'range' ? 'is-range-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-map-renderer={renderer}
    >
      <div ref={containerRef} className="map-canvas" />
      <TerrainLayer
        map={mapRef.current}
        mapReady={mapReady}
        styleEpoch={styleEpoch}
        basemap={mapBasemap}
        volume3d={!preferFlat}
        config={terrainConfig}
        envLayers={envLayers}
      />
      <DegradedTerrainOverlay
        map={mapRef.current}
        mapReady={mapReady}
        active={gnssDegraded}
        drones={drones}
        asset={asset}
        selectedDroneId={selectedDroneId}
        losResult={losResult}
        secondsSinceFix={secondsSinceFix}
      />
      {offlineMap.offlinePreferred && renderer === 'mapbox' && (
        <div className="map-offline-hint" role="status" data-operator-ui>
          Offline basemap — uncached tiles show as dark gaps
        </div>
      )}
      {offlinePrepOpen && (
        <OfflinePrepPanel
          map={mapRef.current}
          onClose={() => dispatch(setOfflinePrepOpen(false))}
        />
      )}
      {renderer === 'maplibre' && edgePackHealth && (
        <div
          className={[
            'edge-pack-status',
            !edgePackHealth.ok ? 'tone-crit' : edgePackHealth.stale ? 'tone-warn' : 'tone-ok',
          ].join(' ')}
          title={edgePackHealth.error ?? edgePackHealth.coverage}
        >
          <span className="edge-pack-status__dot" aria-hidden="true" />
          <span>EDGE MAP</span>
          <strong className="mono">
            {!edgePackHealth.ok ? 'UNAVAILABLE' : edgePackHealth.stale ? 'STALE' : edgePackHealth.packId}
          </strong>
        </div>
      )}
      {heatmapMode && (
        <div
          className={`map-heatmap-key map-heatmap-key--${heatmapMode}`}
          role="status"
          data-operator-ui
        >
          <div className="map-heatmap-key__heading">
            <div>
              <span className="panel__eyebrow">Live heatmap</span>
              <strong>{HEATMAP_LABELS[heatmapMode]}</strong>
            </div>
            <button
              type="button"
              aria-label={`Close ${HEATMAP_LABELS[heatmapMode]} heatmap`}
              onClick={() => dispatch(setHeatmapMode(null))}
            >
              ×
            </button>
          </div>
          <div className="map-heatmap-key__scale" aria-hidden="true" />
          <div className="map-heatmap-key__labels">
            <span>{heatmapMode === 'terrain' ? '0–1°' : 'Lower'}</span>
            <span>{heatmapMode === 'terrain' ? '20°+' : 'Higher'}</span>
          </div>
          <small className="mono">{heatmapStatus}</small>
        </div>
      )}
      {activeMapTool === 'range' && (
        <div className="map-range-hint" role="status" data-operator-ui>
          <div>
            <span className="panel__eyebrow">Range tool active</span>
            <strong>Click and drag to draw a radius</strong>
          </div>
          <button
            type="button"
            onClick={() => dispatch(setActiveMapTool(null))}
            aria-label="Close range tool and clear measurements"
          >
            Clear & close
          </button>
        </div>
      )}
      {mapReady && (
        <div className="map-overlay-tabs" role="tablist" aria-label="Map overlay">
          <button
            type="button"
            role="tab"
            aria-selected={mapOverlayTab === 'bases'}
            className={['map-overlay-tabs__btn', mapOverlayTab === 'bases' ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => dispatch(setMapOverlayTab('bases'))}
          >
            Bases
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mapOverlayTab === 'scenarios'}
            className={['map-overlay-tabs__btn', mapOverlayTab === 'scenarios' ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => dispatch(setMapOverlayTab('scenarios'))}
          >
            Scenarios
          </button>
        </div>
      )}
      {mapReady && (
        <div className="map-view-toggle" role="group" aria-label="Map projection">
          <button
            type="button"
            className={['btn btn--ghost btn--sm', preferFlat ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setPreferFlat(true)}
            aria-pressed={preferFlat}
          >
            2D
          </button>
          <button
            type="button"
            className={['btn btn--ghost btn--sm', !preferFlat ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setPreferFlat(false)}
            aria-pressed={!preferFlat}
          >
            3D
          </button>
          {!preferFlat && (
            <span className="map-view-toggle__hint mono" title="Flat ground ┬╖ extruded buildings">
              BUILDINGS
            </span>
          )}
          <button
            type="button"
            className={[
              'map-inspector-toggle',
              inspectorOpen ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={inspectorOpen ? 'Close map inspector' : 'Open map inspector'}
            aria-expanded={inspectorOpen}
            title={inspectorOpen ? 'Close inspector' : 'Open logs'}
            onClick={() => {
              if (inspectorOpen) {
                setInspectorOpen(false)
              } else {
                setInspectorView('logs')
                setInspectorOpen(true)
              }
            }}
          >
            <span aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      )}
      <aside
        className={[
          'map-inspector',
          inspectorOpen ? 'is-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={!inspectorOpen}
        data-operator-ui
      >
        <header className="map-inspector__header">
          <div>
            <p className="panel__eyebrow">
              {inspectorView === 'asset' ? 'Selection' : 'System'}
            </p>
            <h2>{inspectorView === 'asset' ? 'Asset details' : 'Logs'}</h2>
          </div>
          <div className="map-inspector__header-actions">
            {inspectorView === 'asset' && (
              <button type="button" onClick={() => setInspectorView('logs')}>
                Logs
              </button>
            )}
            <button
              type="button"
              aria-label="Close inspector"
              onClick={() => setInspectorOpen(false)}
            >
              ×
            </button>
          </div>
        </header>

        {inspectorView === 'asset' && selectedDrone ? (
          <div className="map-inspector__asset">
            <section className="map-inspector__asset-identity">
              <span className="map-inspector__asset-glyph" aria-hidden="true">△</span>
              <div>
                <h3>{selectedDrone.displayName || selectedDrone.id}</h3>
                <p className="mono">
                  {selectedDrone.type} · {selectedDrone.lifecycle ?? 'ACTIVE'}
                </p>
              </div>
              <span
                className={[
                  'map-inspector__status',
                  selectedDrone.comms === 'lost' ? 'is-critical' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {selectedDrone.comms}
              </span>
            </section>

            <section className="map-inspector__section">
              <h3>Telemetry</h3>
              <dl className="map-inspector__properties">
                <div><dt>Battery</dt><dd>{selectedDrone.battery}%</dd></div>
                <div><dt>Positioning</dt><dd>{selectedDrone.positioningMethod}</dd></div>
                <div><dt>Confidence</dt><dd>{selectedDrone.positioningConfidence}%</dd></div>
                <div><dt>Navigation</dt><dd>{selectedDrone.navigationSource ?? 'Nominal'}</dd></div>
              </dl>
            </section>

            <section className="map-inspector__section">
              <h3>Position</h3>
              <dl className="map-inspector__properties">
                <div><dt>Latitude</dt><dd className="mono">{selectedDrone.position.lat.toFixed(5)}</dd></div>
                <div><dt>Longitude</dt><dd className="mono">{selectedDrone.position.lng.toFixed(5)}</dd></div>
                <div><dt>Altitude</dt><dd className="mono">{Math.round(selectedDrone.position.alt)} m</dd></div>
                <div><dt>Uncertainty</dt><dd className="mono">{selectedDrone.positionUncertaintyM ?? 0} m</dd></div>
              </dl>
            </section>

            <section className="map-inspector__section">
              <h3>Assignment</h3>
              <dl className="map-inspector__properties">
                <div><dt>Mission target</dt><dd>{selectedDrone.assignedTrackId ?? 'Unassigned'}</dd></div>
                <div><dt>Group</dt><dd>{selectedDrone.groupId ?? 'Independent'}</dd></div>
                <div><dt>Payload</dt><dd>{selectedDrone.payloadStatus}</dd></div>
                <div><dt>Mesh links</dt><dd>{selectedDrone.meshLinks.length}</dd></div>
              </dl>
            </section>
          </div>
        ) : (
          <div className="map-inspector__logs" role="log" aria-live="polite">
            <div className="map-inspector__log-entry">
              <time className="mono">
                {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : '--:--:--'}
              </time>
              <span className={connected ? 'tone-ok' : 'tone-crit'}>
                {connected ? 'C2 link synchronized' : 'C2 link unavailable'}
              </span>
            </div>
            <div className="map-inspector__log-entry">
              <time className="mono">MAP</time>
              <span>
                {renderer === 'mapbox' ? 'Cloud' : 'Edge'} renderer active · {tracks.length} tracks
              </span>
            </div>
            <div className="map-inspector__log-entry">
              <time className="mono">FLEET</time>
              <span>{drones.length} blue-team assets reporting</span>
            </div>
            {[...decisionLog]
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 20)
              .map((entry, index) => (
                <div
                  key={`${entry.timestamp}:${entry.action}:${index}`}
                  className="map-inspector__log-entry"
                >
                  <time className="mono">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </time>
                  <span><strong>{entry.action}</strong> · {entry.detail}</span>
                </div>
              ))}
          </div>
        )}
      </aside>
      {mapReady && mapRef.current && activeCalloutTrack && activeCalloutId && (
        <div className="threat-callout-layer" aria-live="polite" data-operator-ui>
          <ThreatCallout
            map={mapRef.current}
            getPosition={getThreatPosition}
            track={activeCalloutTrack}
            mode={calloutMode}
            onPin={() => pinThreat(activeCalloutTrack.id, { suppressPan: true })}
            onClose={unpinThreat}
            onPointerEnter={() => {
              calloutOverRef.current = true
            }}
            onPointerLeave={() => {
              calloutOverRef.current = false
              if (!pinnedThreatRef.current) {
                window.setTimeout(() => {
                  if (!calloutOverRef.current && !pinnedThreatRef.current) {
                    setHoveredThreatId(null)
                    calloutTrackRef.current = null
                  }
                }, 120)
              }
            }}
          />
        </div>
      )}
      {mapError && (
        <div className="map-error" role="alert">
          {mapError}
        </div>
      )}
      <div className="map-legend">
        {mapOverlayTab === 'bases' ? (
          <>
            <span>
              <i className="swatch swatch--airbase" aria-hidden="true" /> Air
            </span>
            <span>
              <i className="swatch swatch--naval" aria-hidden="true" /> Sea
            </span>
            <span>
              <i className="swatch swatch--land" aria-hidden="true" /> Land
            </span>
          </>
        ) : (
          <span>
            <i className="swatch swatch--prd" aria-hidden="true" /> PRD scenario
          </span>
        )}
        <span>
          <i className="swatch swatch--friendly" aria-hidden="true" /> Friendly
        </span>
        <span>
          <i className="swatch swatch--threat" aria-hidden="true" /> Threat
        </span>
        <span>
          <i className="swatch swatch--route" aria-hidden="true" /> Intercept
        </span>
        <span className="map-legend__attrib" title={INSTALLATIONS_ATTRIBUTION}>
          Open data
        </span>
      </div>
    </div>
  )
}
