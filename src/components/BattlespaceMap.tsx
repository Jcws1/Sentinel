import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl, {
  type GeoJSONSource,
  type Map as MapboxMap,
  type MapMouseEvent,
} from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useAppDispatch, useAppSelector } from '../store'
import { selectDrone } from '../store/fleetSlice'
import { selectTrack } from '../store/threatsSlice'
import { setActiveRecommendation } from '../store/taskingSlice'
import { setMapOverlayTab } from '../store/uiSlice'
import { ThreatCallout } from './ThreatCallout'
import type { Drone, Position, TaskingRecommendation, ThreatTrack } from '../types'
import {
  INSTALLATIONS_ATTRIBUTION,
  installationsForTab,
} from '../data/singaporeInstallations'
import type { ModeId } from '../store/uiSlice'
import { isOperatorUiTarget } from '../utils/ui'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'
const TRAIL_LENGTH = 28
const LERP = 0.2
const HILLSHADE_LAYER = 'terrain-hillshade'
const BUILDINGS_LAYER = '3d-buildings'

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

function firstSymbolLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers
  if (!layers) return undefined
  for (const layer of layers) {
    if (layer.type === 'symbol') return layer.id
  }
  return undefined
}

function enableVolume3d(map: MapboxMap) {
  if (!map.isStyleLoaded()) return

  // Flat ground — no DEM mesh / terrain bumps.
  map.setTerrain(null)
  if (map.getLayer(HILLSHADE_LAYER)) {
    map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', 'none')
  }

  try {
    map.setLights([
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
    'fill-extrusion-ambient-occlusion-intensity': 0.65,
    'fill-extrusion-ambient-occlusion-radius': 6,
  }

  if (map.getSource('composite') && !map.getLayer(BUILDINGS_LAYER)) {
    const before = firstSymbolLayerId(map)
    map.addLayer(
      {
        id: BUILDINGS_LAYER,
        source: 'composite',
        'source-layer': 'building',
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
    map.setPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-ambient-occlusion-intensity', 0.65)
  }

  if (map.getSource('composite') && !map.getLayer('3d-building-edges')) {
    map.addLayer(
      {
        id: '3d-building-edges',
        type: 'line',
        source: 'composite',
        'source-layer': 'building',
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

  if (!map.getLayer('sky')) {
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

  map.setFog({
    color: 'rgb(6, 8, 12)',
    'high-color': 'rgb(30, 40, 60)',
    'horizon-blend': 0.05,
    'space-color': 'rgb(2, 3, 6)',
    'star-intensity': 0.12,
    range: [1.0, 14],
  })
}

function disableVolume3d(map: MapboxMap) {
  if (!map.isStyleLoaded()) return
  map.setTerrain(null)
  map.setFog(null)
  try {
    map.setLights([])
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
) {
  const preset = MODE_CAMERA[mode]
  const pitch = preferFlat ? 0 : preset.pitch
  const bearing = preferFlat ? 0 : preset.bearing
  const zoom = preferFlat ? map.getZoom() : (preset.zoom ?? map.getZoom())

  if (preferFlat) disableVolume3d(map)
  else enableVolume3d(map)

  const camera = { pitch, bearing, zoom, duration: animate ? 900 : 0 }
  if (animate) map.easeTo(camera)
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

function addOverlayLayers(map: MapboxMap) {
  const sourceIds = [
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
  ]

  for (const id of sourceIds) {
    if (map.getSource(id)) continue
    map.addSource(id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }

  const layers: mapboxgl.AnyLayer[] = [
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
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          10,
          15,
          22,
        ],
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
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          10,
          15,
          22,
        ],
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
  const pinnedThreatRef = useRef<string | null>(null)
  const hoveredThreatRef = useRef<string | null>(null)
  const calloutTrackRef = useRef<string | null>(null)
  const calloutOverRef = useRef(false)
  const suppressPanRef = useRef(false)
  const getThreatPositionRef = useRef<() => Position | null>(() => null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [hoveredThreatId, setHoveredThreatId] = useState<string | null>(null)
  const [pinnedThreatId, setPinnedThreatId] = useState<string | null>(null)
  const [preferFlat, setPreferFlat] = useState(false)
  const dispatch = useAppDispatch()

  const mode = useAppSelector((s) => s.ui.mode)
  const mapOverlayTab = useAppSelector((s) => s.ui.mapOverlayTab)
  const preferFlatRef = useRef(preferFlat)
  const modeRef = useRef(mode)
  preferFlatRef.current = preferFlat
  modeRef.current = mode

  const drones = useAppSelector((s) => s.fleet.drones)
  const selectedDroneId = useAppSelector((s) => s.fleet.selectedDroneId)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const asset = useAppSelector((s) => s.mission.protectedAsset)
  const policyZones = useAppSelector((s) => s.policy.zones)
  const connected = useAppSelector((s) => s.session.connected)

  const pinThreat = useCallback(
    (threatId: string, options?: { suppressPan?: boolean }) => {
      calloutTrackRef.current = threatId
      pinnedThreatRef.current = threatId
      setPinnedThreatId(threatId)
      setHoveredThreatId(null)
      dispatch(selectTrack(threatId))
      const pendingRec = liveRef.current?.recommendations.find(
        (r) => r.trackId === threatId && r.status === 'pending',
      )
      if (pendingRec) dispatch(setActiveRecommendation(pendingRec.id))

      if (options?.suppressPan) {
        suppressPanRef.current = true
        return
      }

      suppressPanRef.current = false
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
        duration: 700,
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
  }, [])

  useEffect(() => {
    pinnedThreatRef.current = pinnedThreatId
  }, [pinnedThreatId])

  useEffect(() => {
    hoveredThreatRef.current = hoveredThreatId
  }, [hoveredThreatId])

  // Show pinned callout when a track is selected from the queue / map.
  useEffect(() => {
    if (!selectedTrackId) return
    if (!tracks.some((t) => t.id === selectedTrackId)) return
    calloutTrackRef.current = selectedTrackId
    pinnedThreatRef.current = selectedTrackId
    setPinnedThreatId(selectedTrackId)
  }, [selectedTrackId, tracks])

  // Fly when selection comes from queue / tasking (not map pinThreat, which already flew).
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !selectedTrackId) return
    if (suppressPanRef.current) {
      suppressPanRef.current = false
      return
    }
    if (followKeyRef.current === `threat:${selectedTrackId}`) return

    const run = () => {
      const display = displayRef.current.get(`threat:${selectedTrackId}`)
      const track = liveRef.current?.tracks.find((t) => t.id === selectedTrackId)
      const lng = display?.lng ?? track?.position.lng
      const lat = display?.lat ?? track?.position.lat
      if (lng == null || lat == null) return false

      followKeyRef.current = `threat:${selectedTrackId}`
      const pitch = preferFlatRef.current ? 0 : MODE_CAMERA[modeRef.current].pitch
      const zoomTarget = preferFlatRef.current
        ? 14
        : (MODE_CAMERA[modeRef.current].zoom ?? 14.4)
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), zoomTarget),
        pitch,
        duration: 700,
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
  }, [selectedTrackId, mapReady])

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
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    if (!MAPBOX_TOKEN) {
      setMapError('Missing VITE_MAPBOX_TOKEN. Add it to .env and restart Vite.')
      return
    }

    mapboxgl.accessToken = MAPBOX_TOKEN

    const camera = MODE_CAMERA[modeRef.current]

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [103.8198, 1.3521],
      zoom: 13.4,
      pitch: preferFlatRef.current ? 0 : camera.pitch,
      bearing: preferFlatRef.current ? 0 : camera.bearing,
      maxPitch: 85,
      antialias: true,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      attributionControl: true,
      logoPosition: 'bottom-right',
    })

    map.addControl(
      new mapboxgl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
        showZoom: true,
      }),
      'top-right',
    )

    const ensureLayers = () => {
      // Terrain first so hillshade sits under operator overlays.
      applyModeCamera(map, modeRef.current, preferFlatRef.current, false)
      addOverlayLayers(map)
      const installations = map.getSource('installations') as GeoJSONSource | undefined
      installations?.setData(installationsForTab('bases'))
      setMapReady(true)
      setMapError(null)
    }

    map.once('load', ensureLayers)
    map.on('style.load', () => {
      applyModeCamera(map, modeRef.current, preferFlatRef.current, false)
      addOverlayLayers(map)
      const installations = map.getSource('installations') as GeoJSONSource | undefined
      installations?.setData(installationsForTab('bases'))
    })

    map.on('error', (event) => {
      const message = event.error?.message ?? 'Mapbox failed to load'
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
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
    // Map instance is created once; mode/pitch updates handled in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    applyModeCamera(map, mode, preferFlat, true)
  }, [mode, preferFlat, mapReady])

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

  // Swap bases ↔ scenarios overlay and frame the active set.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    const collection = installationsForTab(mapOverlayTab)
    const source = map.getSource('installations') as GeoJSONSource | undefined
    source?.setData(collection)

    const points = collection.features.filter((f) => f.properties.feature === 'label')
    if (points.length === 0) return
    const coords = points.map((f) => f.geometry.coordinates as [number, number])
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0]),
    )
    map.fitBounds(bounds, {
      padding: { top: 72, bottom: 140, left: 80, right: 80 },
      maxZoom: mapOverlayTab === 'bases' ? 11.6 : 12.2,
      duration: 800,
      pitch: preferFlatRef.current ? 0 : MODE_CAMERA[modeRef.current].pitch * 0.75,
    })
  }, [mapReady, mapOverlayTab])

  // Re-frame when selection changes.
  useEffect(() => {
    followKeyRef.current = null
  }, [selectedTrackId, selectedDroneId])

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

      const threatId = resolveThreatId(map, e.point)
      if (threatId) return

      const droneHits = map.queryRenderedFeatures(e.point, { layers: droneLayers })
      const droneProps = (droneHits[0] as { properties?: { id?: string } } | undefined)
        ?.properties
      const droneId = droneProps?.id
      if (droneId && droneHits[0]?.source === 'drones') {
        dispatch(selectDrone(String(droneId)))
        unpinThreat()
        return
      }

      if (!calloutOverRef.current) {
        unpinThreat()
      }
    }

    const onThreatEnter = (e: MapMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer'
      const threatId = resolveThreatId(map, e.point, e.features)
      if (!threatId || pinnedThreatRef.current) return
      calloutTrackRef.current = threatId
      setHoveredThreatId(threatId)
    }

    const onThreatMove = (e: MapMouseEvent) => {
      const threatId = resolveThreatId(map, e.point, e.features)
      if (!threatId || pinnedThreatRef.current) return
      calloutTrackRef.current = threatId
      setHoveredThreatId(threatId)
    }

    const onThreatLeave = () => {
      window.setTimeout(() => {
        if (pinnedThreatRef.current || calloutOverRef.current) return
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

    map.on('click', onMapClick)
    for (const layer of threatLayers) {
      map.on('click', layer, onThreatClick)
      map.on('mouseenter', layer, onThreatEnter)
      map.on('mousemove', layer, onThreatMove)
      map.on('mouseleave', layer, onThreatLeave)
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

      const display = displayRef.current
      const trails = trailsRef.current
      const droneFeatures: MapFeature[] = []
      const threatFeatures: MapFeature[] = []
      const trailFeatures: MapFeature[] = []
      const uncertaintyFeatures: MapFeature[] = []
      const threatHaloFeatures: MapFeature[] = []
      const meshFeatures: MapFeature[] = []
      let assetFeature: MapFeature | null = null

      for (const [key, point] of display) {
        point.lng += (point.targetLng - point.lng) * LERP
        point.lat += (point.targetLat - point.lat) * LERP
        point.alt += (point.targetAlt - point.alt) * LERP

        const coord: [number, number] = [point.lng, point.lat]
        const history = trails.get(key) ?? []
        const last = history[history.length - 1]
        if (
          !last ||
          Math.hypot(last[0] - coord[0], last[1] - coord[1]) > 0.000008
        ) {
          history.push(coord)
          while (history.length > TRAIL_LENGTH) history.shift()
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
          if (point.confidence < 85) uncertaintyFeatures.push(feature)
        } else {
          threatFeatures.push(feature)
          if (point.confidence < 85) threatHaloFeatures.push(feature)
        }
      }

      const droneById = new globalThis.Map(
        [...display.values()]
          .filter((p) => p.kind === 'friendly')
          .map((p) => [p.id, p]),
      )
      const seenLinks = new Set<string>()
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
      setSourceData(current, 'mesh', meshFeatures)
      setSourceData(current, 'routes', routeFeatures)

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
        if (target && bounds) {
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
            current.easeTo({
              center: [target.lng, target.lat],
              duration: 350,
              essential: true,
            })
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
            followKeyRef.current = followKey
            current.easeTo({
              center: [target.lng, target.lat],
              duration: 400,
              essential: true,
            })
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
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(coords[0], coords[0]),
        )
        current.fitBounds(bounds, {
          padding: { top: 80, bottom: 160, left: 360, right: 360 },
          maxZoom: 14,
          duration: 700,
        })
        didInitialFitRef.current = true
      }

      rafRef.current = requestAnimationFrame(paint)
    }

    rafRef.current = requestAnimationFrame(paint)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      map.off('click', onMapClick)
      for (const layer of threatLayers) {
        map.off('click', layer, onThreatClick)
        map.off('mouseenter', layer, onThreatEnter)
        map.off('mousemove', layer, onThreatMove)
        map.off('mouseleave', layer, onThreatLeave)
      }
      for (const layer of droneLayers) {
        map.off('mouseenter', layer, onDroneEnter)
        map.off('mouseleave', layer, onDroneLeave)
      }
    }
  }, [mapReady, dispatch, pinThreat, unpinThreat])

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-canvas" />
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
            <span className="map-view-toggle__hint mono" title="Flat ground · extruded buildings">
              BUILDINGS
            </span>
          )}
        </div>
      )}
      {mapReady && mapRef.current && activeCalloutTrack && activeCalloutId && (
        <div className="threat-callout-layer" aria-live="polite" data-operator-ui>
          <ThreatCallout
            map={mapRef.current}
            getPosition={() => getThreatPositionRef.current()}
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
