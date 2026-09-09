import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type { Position, ThreatTrack } from '../types'
import type {
  ClassifiedMapObject,
  MapObjectCategory,
} from '../types/mapObjects'
import { useAppDispatch, useAppSelector } from '../store'
import { selectDrone } from '../store/fleetSlice'
import { operatorSelectTrack } from '../store/threatsSlice'
import {
  engageTrackCommand,
  requestPlanCommand,
} from '../store/commandThunks'
import {
  pushToast,
  setActiveRecommendation,
} from '../store/taskingSlice'
import {
  requestMapFocus,
  setActiveMapTool,
  setHeatmapMode,
  setMapOverlayTab,
  setTerrainPanelOpen,
  setWorkspace,
  toggleInvestigationCollapsed,
} from '../store/uiSlice'
import type { HeatmapMode } from '../store/uiSlice'
import { installationsForTab } from '../data/singaporeInstallations'
import { SENSOR_SOURCES } from '../data/sensorCatalog'
import { categoryForMapKinds } from '../utils/mapObjectClassification'
import { CollapsiblePanel } from './CollapsiblePanel'
import { EngageButton } from './EngageButton'
import { SwarmMovementTool } from './SwarmMovementTool'

type Side =
  | 'hostile'
  | 'unknown'
  | 'sensor'
  | 'friendly'
  | 'map-object'
  | 'location'
type OverviewGroupId = 'hostile' | 'unknown' | 'sensor' | 'friendly'
type NavigatorTab = 'overview' | 'tools' | 'missions'
type ToolGroup =
  | 'Measure'
  | 'Observe'
  | 'Move'
  | 'Heatmap'
  | 'Alert'
  | 'Coordinate'
type ToolAction =
  | 'range'
  | 'terrain'
  | 'sensors'
  | 'swarm'
  | `heatmap-${HeatmapMode}`

interface CommanderTool {
  id: string
  label: string
  description: string
  group: ToolGroup
  icon: string
  status: 'ready' | 'planned'
  action?: ToolAction
}

interface FieldObject {
  id: string
  label: string
  detail: string
  side: Side
  kind: 'track' | 'drone' | 'unit' | 'sensor' | 'map-object' | 'location'
  position?: Position
  searchText: string
  overlayTab?: 'bases' | 'scenarios'
  mapCategory?: MapObjectCategory
}

interface OverviewGroup {
  id: OverviewGroupId
  label: string
  tone: string
  objects: FieldObject[]
}

const GROUP_ORDER: OverviewGroupId[] = [
  'hostile',
  'unknown',
  'sensor',
  'friendly',
]

const MAP_CATEGORY_ORDER: MapObjectCategory[] = [
  'restricted',
  'military',
  'medical',
  'education',
  'transport',
  'infrastructure',
  'industrial',
  'housing',
  'commercial',
  'recreation',
  'other',
]

const MAP_CATEGORY_LABELS: Record<MapObjectCategory, string> = {
  restricted: 'Restricted airspace',
  military: 'Military facilities',
  medical: 'Medical facilities',
  education: 'Education',
  transport: 'Transport',
  infrastructure: 'Critical infrastructure',
  industrial: 'Industrial',
  housing: 'Residential',
  commercial: 'Commercial',
  recreation: 'Recreation',
  other: 'Others',
}

const TOOL_GROUPS: ToolGroup[] = [
  'Measure',
  'Observe',
  'Move',
  'Heatmap',
  'Alert',
  'Coordinate',
]

const TOOL_GROUP_META: Record<
  ToolGroup,
  { label: string; description: string; icon: string }
> = {
  Measure: {
    label: 'Measure',
    description: 'Distance, direction, area and precise map references.',
    icon: '○',
  },
  Observe: {
    label: 'Terrain & sensing',
    description: 'Analyze visibility, terrain and sensor coverage.',
    icon: '◒',
  },
  Move: {
    label: 'Mobility & comms',
    description: 'Plan routes and preserve operational connectivity.',
    icon: '⌁',
  },
  Heatmap: {
    label: 'Heatmaps',
    description: 'Aggregate live Sentinel observations across the map.',
    icon: '∴',
  },
  Alert: {
    label: 'Alerts',
    description: 'Watch selected areas, entities and operating conditions.',
    icon: '!',
  },
  Coordinate: {
    label: 'Coordinate',
    description: 'Share contacts and common operational references.',
    icon: '⌘',
  },
}

const COMMANDER_TOOLS: CommanderTool[] = [
  {
    id: 'range-bearing',
    label: 'Range & bearing',
    description: 'Drag from a map point to measure a radius and distance.',
    group: 'Measure',
    icon: '◎',
    status: 'ready',
    action: 'range',
  },
  {
    id: 'area-coordinate',
    label: 'Area & coordinates',
    description: 'Measure an area or copy a precise map reference.',
    group: 'Measure',
    icon: '⌗',
    status: 'planned',
  },
  {
    id: 'los-terrain',
    label: 'LOS & terrain',
    description: 'Check intervisibility and inspect terrain layers.',
    group: 'Observe',
    icon: '◉',
    status: 'ready',
    action: 'terrain',
  },
  {
    id: 'sensor-coverage',
    label: 'Sensor coverage',
    description: 'Expose coverage gaps, overlaps and blind sectors.',
    group: 'Observe',
    icon: '◔',
    status: 'planned',
  },
  {
    id: 'source-health',
    label: 'Source health',
    description: 'Open live sensor feeds, freshness and confidence.',
    group: 'Observe',
    icon: '≋',
    status: 'ready',
    action: 'sensors',
  },
  {
    id: 'swarm-movement',
    label: 'Swarm movement',
    description:
      'Move a simulator fleet in formation or neighbour-average flocking.',
    group: 'Move',
    icon: '◇',
    status: 'ready',
    action: 'swarm',
  },
  {
    id: 'route-corridor',
    label: 'Route & corridor',
    description: 'Plan movement around terrain and known threats.',
    group: 'Move',
    icon: '↝',
    status: 'planned',
  },
  {
    id: 'relay-placement',
    label: 'Relay placement',
    description: 'Find positions that preserve mesh connectivity.',
    group: 'Move',
    icon: '⌁',
    status: 'planned',
  },
  {
    id: 'enemy-activity-heatmap',
    label: 'Enemy activity',
    description: 'Fused hostile positions, movement trails and confidence.',
    group: 'Heatmap',
    icon: '◆',
    status: 'ready',
    action: 'heatmap-enemy',
  },
  {
    id: 'friendly-activity-heatmap',
    label: 'Friendly activity',
    description: 'Blue-team positions, movement trails and assignments.',
    group: 'Heatmap',
    icon: '△',
    status: 'ready',
    action: 'heatmap-friendly',
  },
  {
    id: 'sensor-confidence-heatmap',
    label: 'Sensor confidence',
    description: 'Fusion confidence and overlapping contributing sensors.',
    group: 'Heatmap',
    icon: '◉',
    status: 'ready',
    action: 'heatmap-sensor',
  },
  {
    id: 'terrain-heatmap',
    label: 'Terrain slope',
    description: 'Live slope sampling from the loaded elevation model.',
    group: 'Heatmap',
    icon: '◒',
    status: 'ready',
    action: 'heatmap-terrain',
  },
  {
    id: 'geofence',
    label: 'Geofence',
    description: 'Alert when selected entities enter or leave an area.',
    group: 'Alert',
    icon: '⬡',
    status: 'planned',
  },
  {
    id: 'proximity-status',
    label: 'Proximity & status',
    description: 'Trigger on distance, battery, link or track changes.',
    group: 'Alert',
    icon: '!',
    status: 'planned',
  },
  {
    id: 'quick-report',
    label: 'Quick report',
    description: 'Share a marked contact with confidence and notes.',
    group: 'Coordinate',
    icon: '✚',
    status: 'planned',
  },
  {
    id: 'grg-builder',
    label: 'GRG builder',
    description: 'Create a shared reference grid for an operating area.',
    group: 'Coordinate',
    icon: '▦',
    status: 'planned',
  },
]

function uniqueLocations(): FieldObject[] {
  const seen = new Set<string>()
  return ['bases', 'scenarios'].flatMap((tab) =>
    installationsForTab(tab as 'bases' | 'scenarios').features.flatMap(
      (feature) => {
        if (
          feature.properties.feature !== 'label' ||
          feature.geometry.type !== 'Point' ||
          seen.has(feature.properties.id)
        ) {
          return []
        }
        seen.add(feature.properties.id)
        const [lng, lat] = feature.geometry.coordinates
        const detail =
          feature.properties.operator ??
          feature.properties.prdScenario ??
          (tab === 'bases' ? 'Installation' : 'Scenario area')
        const mapCategory = categoryForMapKinds([feature.properties.kind])
        return [
          {
            id: feature.properties.id,
            label: feature.properties.name,
            detail,
            side: 'map-object' as const,
            kind: 'map-object' as const,
            position: { lng, lat, alt: 0 },
            overlayTab: tab as 'bases' | 'scenarios',
            mapCategory,
            searchText: [
              feature.properties.id,
              feature.properties.name,
              feature.properties.shortName,
              detail,
              tab,
              MAP_CATEGORY_LABELS[mapCategory],
              'map object',
            ]
              .join(' ')
              .toLowerCase(),
          },
        ]
      },
    ),
  )
}

const LOCATIONS = uniqueLocations()

function centerOfCoordinates(coordinates: [number, number][]): Position {
  const bounds = coordinates.reduce(
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

function SideMark({ side }: { side: Side }) {
  return (
    <span
      className={['field-nav__mark', `field-nav__mark--${side}`].join(' ')}
      aria-hidden="true"
    />
  )
}

function FieldObjectRow({
  object,
  active,
  onActivate,
  onSelect,
  nested = false,
}: {
  object: FieldObject
  active: boolean
  onActivate: (object: FieldObject) => void
  onSelect?: (object: FieldObject) => void
  nested?: boolean
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onActivate(object)
  }

  return (
    <li>
      <button
        type="button"
        className={[
          'field-nav__object',
          nested ? 'field-nav__object--nested' : '',
          active ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect?.(object)}
        onDoubleClick={() => onActivate(object)}
        onKeyDown={handleKeyDown}
        title={
          object.position
            ? `Double-click to locate ${object.label}`
            : `Double-click to open ${object.label}`
        }
      >
        <SideMark side={object.side} />
        <span className="field-nav__object-copy">
          <strong>{object.label}</strong>
          <small>{object.detail}</small>
        </span>
        <span className="field-nav__locate" aria-hidden="true">
          {object.position ? '⌖' : '→'}
        </span>
      </button>
    </li>
  )
}

function HostileObjectRow({
  object,
  track,
  active,
  expanded,
  missionAdded,
  missionBusy,
  selected,
  onToggle,
  onSelect,
  onLocate,
  onAddToMission,
}: {
  object: FieldObject
  track: ThreatTrack
  active: boolean
  expanded: boolean
  missionAdded: boolean
  missionBusy: boolean
  selected: boolean
  onToggle: () => void
  onSelect: (selected: boolean) => void
  onLocate: () => void
  onAddToMission: () => void
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onToggle()
  }

  return (
    <li
      className={[
        'field-nav__hostile',
        expanded ? 'is-expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label
        className="field-nav__hostile-select"
        title={`Select ${track.id} for a batch action`}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`Select ${track.id}`}
        />
        <span aria-hidden="true" />
      </label>
      <button
        type="button"
        className={[
          'field-nav__object',
          'field-nav__object--nested',
          active ? 'is-active' : '',
          expanded ? 'is-expanded' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(event) => {
          if (event.detail === 1) onToggle()
        }}
        onDoubleClick={onLocate}
        onKeyDown={handleKeyDown}
        aria-expanded={expanded}
        title={`Click for details · double-click to locate ${object.label}`}
      >
        <SideMark side="hostile" />
        <span className="field-nav__object-copy">
          <strong>{object.label}</strong>
          <small>{object.detail}</small>
        </span>
        <span className="field-nav__locate" aria-hidden="true">⌖</span>
      </button>
      {expanded && (
        <section
          className="field-nav__hostile-detail"
          aria-label={`${track.id} details and actions`}
        >
          <div className="field-nav__hostile-heading">
            <span><SideMark side="hostile" /> {track.id}</span>
            <span className="mono">Class {track.threatClass}</span>
          </div>
          <dl className="field-nav__hostile-stats">
            <div>
              <dt>ETA</dt>
              <dd>{track.etaAvailable === false ? 'N/A' : `${track.etaToAsset}s`}</dd>
            </div>
            <div>
              <dt>Fusion</dt>
              <dd>{track.sourceConfidenceAvailable === false ? 'N/A' : `${track.fusionConfidence}%`}</dd>
            </div>
            <div>
              <dt>Speed</dt>
              <dd>{track.speed} m/s</dd>
            </div>
          </dl>
          <div className="field-nav__hostile-actions">
            <EngageButton
              trackId={track.id}
              variant="sm"
              label="Emergency engage"
              className="field-nav__emergency"
            />
            <button
              type="button"
              className="btn btn--sm field-nav__add-mission"
              disabled={missionAdded || missionBusy}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                void onAddToMission()
              }}
            >
              {missionBusy
                ? 'Adding…'
                : missionAdded
                  ? 'In mission'
                  : track.sourceScenario && track.recommendedAction === 'Hold'
                    ? 'Authorize & add'
                    : 'Add to mission'}
            </button>
          </div>
        </section>
      )}
    </li>
  )
}

function ToolCard({
  tool,
  active,
  onSelect,
  compact = false,
}: {
  tool: CommanderTool
  active: boolean
  onSelect: (tool: CommanderTool) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      className={[
        'field-tool-card',
        compact ? 'field-tool-card--compact' : '',
        active ? 'is-active' : '',
        tool.status === 'planned' ? 'is-planned' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(tool)}
      aria-pressed={active}
      disabled={tool.status === 'planned'}
      title={`${tool.description} ${tool.status === 'ready' ? 'Available now.' : 'Planned.'}`}
    >
      <span className="field-tool-card__icon" aria-hidden="true">
        {tool.icon}
      </span>
      <span className="field-tool-card__copy">
        <strong>{tool.label}</strong>
        {compact && <small>{tool.description}</small>}
      </span>
      <span
        className={[
          'field-tool-card__status',
          tool.status === 'ready' ? 'is-ready' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {compact
          ? tool.status === 'ready'
            ? 'Open'
            : 'Planned'
          : ''}
      </span>
    </button>
  )
}

export function FieldNavigator() {
  const tracks = useAppSelector((state) => state.threats.tracks)
  const drones = useAppSelector((state) => state.fleet.drones)
  const policyZones = useAppSelector((state) => state.policy.zones)
  const recommendations = useAppSelector(
    (state) => state.tasking.recommendations,
  )
  const missionState = useAppSelector((state) => state.mission.state)
  const heatmapMode = useAppSelector((state) => state.ui.heatmapMode)
  const activeMapTool = useAppSelector((state) => state.ui.activeMapTool)
  const selectedTrackId = useAppSelector(
    (state) => state.threats.selectedTrackId,
  )
  const selectedDroneId = useAppSelector(
    (state) => state.fleet.selectedDroneId,
  )
  const collapsed = useAppSelector(
    (state) => state.ui.investigationCollapsed,
  )
  const dispatch = useAppDispatch()
  const [tab, setTab] = useState<NavigatorTab>('overview')
  const [query, setQuery] = useState('')
  const [lastLocatedId, setLastLocatedId] = useState<string | null>(null)
  const [expandedHostileId, setExpandedHostileId] = useState<string | null>(null)
  const [selectedHostileIds, setSelectedHostileIds] = useState<string[]>([])
  const [batchEngageBusy, setBatchEngageBusy] = useState(false)
  const [missionBusyTrackId, setMissionBusyTrackId] = useState<string | null>(null)
  const [activeToolId, setActiveToolId] = useState<string | null>(null)
  const [dynamicMapObjects, setDynamicMapObjects] = useState<
    ClassifiedMapObject[]
  >([])
  const [openGroups, setOpenGroups] = useState<Record<OverviewGroupId, boolean>>({
    hostile: true,
    unknown: false,
    sensor: false,
    friendly: true,
  })
  const [mapObjectsOpen, setMapObjectsOpen] = useState(true)
  const [openMapCategories, setOpenMapCategories] = useState<
    Record<MapObjectCategory, boolean>
  >({
    restricted: true,
    military: false,
    medical: false,
    education: false,
    transport: false,
    infrastructure: false,
    industrial: false,
    housing: false,
    commercial: false,
    recreation: false,
    other: false,
  })

  useEffect(() => {
    const receiveMapObjects = (event: Event) => {
      const detail = (event as CustomEvent<{ objects?: ClassifiedMapObject[] }>).detail
      setDynamicMapObjects(detail?.objects ?? [])
    }
    window.addEventListener('sentinel:map-objects', receiveMapObjects)
    return () =>
      window.removeEventListener('sentinel:map-objects', receiveMapObjects)
  }, [])

  useEffect(() => {
    const availableIds = new Set(tracks.map((track) => track.id))
    setSelectedHostileIds((current) =>
      current.filter((id) => availableIds.has(id)),
    )
  }, [tracks])

  const fieldObjects = useMemo<FieldObject[]>(() => {
    const hostileObjects = tracks.map((track) => ({
      id: track.id,
      label: track.id,
      detail: `Hostile · Class ${track.threatClass} · ETA ${track.etaToAsset}s`,
      side: 'hostile' as const,
      kind: 'track' as const,
      position: track.position,
      searchText: [
        track.id,
        'hostile',
        'track',
        `class ${track.threatClass}`,
        track.recommendedAction,
        ...track.sensors,
      ]
        .join(' ')
        .toLowerCase(),
    }))
    const friendlyObjects = drones.map((drone) => {
      const label = drone.displayName || drone.id
      const unit = drone.groupId ? ` · ${drone.groupId}` : ''
      return {
        id: drone.id,
        label,
        detail: `Blue team · ${drone.type}${unit}`,
        side: 'friendly' as const,
        kind: 'drone' as const,
        position: drone.position,
        searchText: [
          drone.id,
          label,
          'blue team friendly drone',
          drone.type,
          drone.groupId,
          drone.lifecycle,
          drone.comms,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      }
    })
    const sensorObjects: FieldObject[] = SENSOR_SOURCES.map((sensor) => ({
      id: sensor.id,
      label: sensor.name,
      detail: `${sensor.health} · ${sensor.kind} · ${sensor.lastPing}`,
      side: 'sensor',
      kind: 'sensor',
      searchText: [
        sensor.id,
        sensor.name,
        sensor.kind,
        sensor.feed,
        sensor.health,
        'sensor source',
      ]
        .join(' ')
        .toLowerCase(),
    }))
    const restrictedObjects: FieldObject[] = policyZones.map((zone) => ({
      id: `policy:${zone.id}`,
      label: zone.name,
      detail: `${zone.kind.replaceAll('-', ' ')} · Sentinel policy`,
      side: 'map-object',
      kind: 'map-object',
      position: centerOfCoordinates(zone.coordinates),
      mapCategory: 'restricted',
      searchText: [
        zone.id,
        zone.name,
        zone.kind,
        'restricted airspace policy zone map object',
      ]
        .join(' ')
        .toLowerCase(),
    }))
    const dynamicObjects: FieldObject[] = dynamicMapObjects.map((object) => ({
      id: object.id,
      label: object.name,
      detail: `${object.kind.replaceAll('_', ' ')} · live map`,
      side: 'map-object',
      kind: 'map-object',
      position: object.position,
      mapCategory: object.category,
      searchText: [
        object.id,
        object.name,
        object.kind,
        MAP_CATEGORY_LABELS[object.category],
        'map object',
      ]
        .join(' ')
        .toLowerCase(),
    }))
    const staticNames = new Set(
      LOCATIONS.filter((object) => object.mapCategory).map((object) =>
        object.label.toLowerCase(),
      ),
    )
    return [
      ...hostileObjects,
      ...friendlyObjects,
      ...sensorObjects,
      ...LOCATIONS,
      ...restrictedObjects,
      ...dynamicObjects.filter(
        (object) => !staticNames.has(object.label.toLowerCase()),
      ),
    ]
  }, [drones, tracks, policyZones, dynamicMapObjects])

  const overviewGroups = useMemo<OverviewGroup[]>(() => {
    const bySide: Record<OverviewGroupId, FieldObject[]> = {
      hostile: [],
      unknown: [],
      sensor: [],
      friendly: [],
    }
    for (const object of fieldObjects) {
      if (
        object.side === 'hostile' ||
        object.side === 'unknown' ||
        object.side === 'sensor' ||
        object.side === 'friendly'
      ) {
        bySide[object.side].push(object)
      }
    }
    const labels: Record<OverviewGroupId, string> = {
      hostile: 'Hostiles',
      unknown: 'Unknown',
      sensor: 'Sensors',
      friendly: 'Blue team',
    }
    return GROUP_ORDER.map((id) => ({
      id,
      label: labels[id],
      tone: id,
      objects: bySide[id],
    }))
  }, [fieldObjects])

  const mapObjectCategories = useMemo(
    () =>
      MAP_CATEGORY_ORDER.map((category) => ({
        id: category,
        label: MAP_CATEGORY_LABELS[category],
        objects: fieldObjects.filter(
          (object) =>
            object.kind === 'map-object' &&
            object.mapCategory === category,
        ),
      })),
    [fieldObjects],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const searchResults = useMemo(
    () =>
      normalizedQuery
        ? fieldObjects.filter((object) =>
            object.searchText.includes(normalizedQuery),
          )
        : fieldObjects,
    [fieldObjects, normalizedQuery],
  )
  const toolSearchResults = useMemo(
    () =>
      normalizedQuery
        ? COMMANDER_TOOLS.filter((tool) =>
            [
              tool.label,
              tool.description,
              tool.group,
              tool.status,
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery),
          )
        : [],
    [normalizedQuery],
  )
  const activeMissions = recommendations.filter(
    (recommendation) => recommendation.status === 'confirmed',
  ).length
  const pendingMissions = recommendations.filter(
    (recommendation) => recommendation.status === 'pending',
  ).length

  const isToolActive = (tool: CommanderTool) =>
    tool.action === 'range'
      ? activeMapTool === 'range'
      : tool.action?.startsWith('heatmap-')
        ? heatmapMode === tool.action.slice('heatmap-'.length)
        : activeToolId === tool.id

  const activateTool = (tool: CommanderTool) => {
    setTab('tools')
    setQuery('')
    if (tool.action === 'range') {
      const nextTool = activeMapTool === 'range' ? null : 'range'
      dispatch(setActiveMapTool(nextTool))
      setActiveToolId(nextTool ? tool.id : null)
      return
    }
    if (activeMapTool) dispatch(setActiveMapTool(null))
    if (tool.action?.startsWith('heatmap-')) {
      const mode = tool.action.slice('heatmap-'.length) as HeatmapMode
      const nextMode = heatmapMode === mode ? null : mode
      dispatch(setHeatmapMode(nextMode))
      setActiveToolId(nextMode ? tool.id : null)
      return
    }
    setActiveToolId(tool.id)
    if (tool.action === 'terrain') dispatch(setTerrainPanelOpen(true))
    if (tool.action === 'sensors') dispatch(setWorkspace('sensors'))
  }

  const locate = (object: FieldObject) => {
    setLastLocatedId(object.id)
    if (object.kind === 'sensor') {
      dispatch(setWorkspace('sensors'))
      return
    }
    if (object.kind === 'track') {
      dispatch(selectDrone(null))
      dispatch(operatorSelectTrack(object.id))
    } else if (object.kind === 'drone') {
      dispatch(operatorSelectTrack(null))
      dispatch(selectDrone(object.id))
    } else {
      dispatch(operatorSelectTrack(null))
      dispatch(selectDrone(null))
    }
    if (object.overlayTab) dispatch(setMapOverlayTab(object.overlayTab))
    if (!object.position) return
    dispatch(
      requestMapFocus({
        key: `${object.kind}:${object.id}`,
        position: object.position,
      }),
    )
  }

  const inspect = (object: FieldObject) => {
    if (object.kind !== 'drone') return
    setLastLocatedId(object.id)
    dispatch(operatorSelectTrack(null))
    dispatch(selectDrone(object.id))
  }

  const isActive = (object: FieldObject) =>
    lastLocatedId === object.id ||
    (object.kind === 'track' && selectedTrackId === object.id) ||
    (object.kind === 'drone' && selectedDroneId === object.id)

  const addToMission = async (trackId: string) => {
    const existing = recommendations.find(
      (recommendation) =>
        recommendation.trackId === trackId &&
        (recommendation.status === 'pending' ||
          recommendation.status === 'confirmed'),
    )
    if (existing) {
      dispatch(setActiveRecommendation(existing.id))
      dispatch(pushToast(`${trackId} is already in mission planning`))
      return
    }
    setMissionBusyTrackId(trackId)
    try {
      await dispatch(requestPlanCommand(trackId)).unwrap()
    } finally {
      setMissionBusyTrackId((current) =>
        current === trackId ? null : current,
      )
    }
  }

  const setHostileSelected = (trackId: string, selected: boolean) => {
    setSelectedHostileIds((current) =>
      selected
        ? current.includes(trackId)
          ? current
          : [...current, trackId]
        : current.filter((id) => id !== trackId),
    )
  }

  const emergencyEngageSelected = async () => {
    if (batchEngageBusy || selectedHostileIds.length === 0) return
    setBatchEngageBusy(true)
    const completed: string[] = []
    try {
      for (const trackId of selectedHostileIds) {
        try {
          await dispatch(engageTrackCommand(trackId)).unwrap()
          completed.push(trackId)
        } catch {
          // The command thunk reports the failure and preserves this selection.
        }
      }
    } finally {
      setSelectedHostileIds((current) =>
        current.filter((id) => !completed.includes(id)),
      )
      setBatchEngageBusy(false)
    }
  }

  return (
    <CollapsiblePanel
      side="left"
      eyebrow="Battlespace"
      title="Field navigator"
      count={tracks.length + drones.length}
      collapsed={collapsed}
      onToggleCollapse={() => dispatch(toggleInvestigationCollapsed())}
      className="panel--field-nav"
    >
      <div
        className="field-nav__tabs"
        role="tablist"
        aria-label="Field navigator"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={tab === 'overview' ? 'is-active' : ''}
          onClick={() => setTab('overview')}
        >
          <span className="field-nav__tab-icon field-nav__tab-icon--overview" />
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tools'}
          className={tab === 'tools' ? 'is-active' : ''}
          onClick={() => setTab('tools')}
        >
          <span className="field-nav__tab-icon field-nav__tab-icon--tools" />
          Tools
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'missions'}
          className={tab === 'missions' ? 'is-active' : ''}
          onClick={() => setTab('missions')}
          title="Missions workspace preview"
        >
          <span className="field-nav__tab-icon field-nav__tab-icon--missions" />
          Missions
        </button>
      </div>

      <label className="field-nav__search field-nav__search--persistent">
        <span aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find ID, unit, type or location…"
          aria-label="Find objects in the field"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </label>

      {normalizedQuery ? (
        <div className="field-nav__find" role="region" aria-label="Find results">
          <div className="field-nav__result-summary">
            <span>Matches</span>
            <strong className="mono">
              {searchResults.length + toolSearchResults.length}
            </strong>
          </div>
          {toolSearchResults.length > 0 && (
            <section className="field-nav__search-section">
              <h3>Tools</h3>
              <div className="field-nav__search-tools">
                {toolSearchResults.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    active={isToolActive(tool)}
                    onSelect={activateTool}
                    compact
                  />
                ))}
              </div>
            </section>
          )}
          {searchResults.length > 0 && (
            <section className="field-nav__search-section field-nav__search-section--objects">
              <h3>Map objects</h3>
              <ul className="field-nav__results">
                {searchResults.map((object) => (
                  <FieldObjectRow
                    key={`${object.kind}:${object.id}`}
                    object={object}
                    active={isActive(object)}
                    onActivate={locate}
                    onSelect={inspect}
                  />
                ))}
              </ul>
            </section>
          )}
          {searchResults.length + toolSearchResults.length === 0 && (
            <div className="field-nav__no-results">
              <span aria-hidden="true">⌖</span>
              <strong>No results found</strong>
              <small>Try an object ID, unit, location or tool name.</small>
            </div>
          )}
          <p className="field-nav__shortcut">
            Objects: double-click or press <kbd>Enter</kbd> to locate
          </p>
        </div>
      ) : tab === 'overview' ? (
        <div className="field-nav__overview" role="tabpanel">
          <p className="field-nav__hint">
            Operational picture · double-click an object to locate
          </p>
          <ul className="field-nav__tree">
            {overviewGroups.map((group) => {
              const open = openGroups[group.id]
              return (
                <li key={group.id} className="field-nav__group">
                  <button
                    type="button"
                    className="field-nav__group-button"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenGroups((current) => ({
                        ...current,
                        [group.id]: !current[group.id],
                      }))
                    }
                  >
                    <span
                      className={[
                        'field-nav__chevron',
                        open ? 'is-open' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    <SideMark side={group.id} />
                    <strong>{group.label}</strong>
                    <span className="field-nav__count mono">
                      {group.objects.length}
                    </span>
                  </button>
                  {open && (
                    <ul className="field-nav__children">
                      {group.id === 'hostile' &&
                        selectedHostileIds.length > 0 && (
                          <li className="field-nav__hostile-batch">
                            <button
                              type="button"
                              className="btn field-nav__hostile-batch-button"
                              disabled={batchEngageBusy}
                              onClick={() => void emergencyEngageSelected()}
                            >
                              <span aria-hidden="true">◇</span>
                              {batchEngageBusy
                                ? `Engaging ${selectedHostileIds.length}…`
                                : `Emergency engage ×${selectedHostileIds.length}`}
                            </button>
                            <button
                              type="button"
                              className="field-nav__hostile-clear"
                              aria-label="Clear hostile selection"
                              title="Clear selection"
                              disabled={batchEngageBusy}
                              onClick={() => setSelectedHostileIds([])}
                            >
                              ×
                            </button>
                          </li>
                        )}
                      {group.objects.length > 0 ? (
                        group.objects.map((object) => {
                          const track =
                            group.id === 'hostile'
                              ? tracks.find((item) => item.id === object.id)
                              : undefined
                          return track ? (
                            <HostileObjectRow
                              key={object.id}
                              object={object}
                              track={track}
                              active={isActive(object)}
                              expanded={expandedHostileId === object.id}
                              missionAdded={recommendations.some(
                                (recommendation) =>
                                  recommendation.trackId === object.id &&
                                  (recommendation.status === 'pending' ||
                                    recommendation.status === 'confirmed'),
                              )}
                              missionBusy={missionBusyTrackId === object.id}
                              selected={selectedHostileIds.includes(object.id)}
                              onToggle={() =>
                                setExpandedHostileId((current) =>
                                  current === object.id ? null : object.id,
                                )
                              }
                              onSelect={(selected) =>
                                setHostileSelected(object.id, selected)
                              }
                              onLocate={() => locate(object)}
                              onAddToMission={() => addToMission(object.id)}
                            />
                          ) : (
                            <FieldObjectRow
                              key={object.id}
                              object={object}
                              active={isActive(object)}
                              onActivate={locate}
                              onSelect={inspect}
                              nested
                            />
                          )
                        })
                      ) : (
                        <li className="field-nav__empty">No objects reported</li>
                      )}
                    </ul>
                  )}
                </li>
              )
            })}
            <li className="field-nav__group field-nav__group--map-objects">
              <button
                type="button"
                className="field-nav__group-button"
                aria-expanded={mapObjectsOpen}
                onClick={() => setMapObjectsOpen((open) => !open)}
              >
                <span
                  className={[
                    'field-nav__chevron',
                    mapObjectsOpen ? 'is-open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                >
                  ›
                </span>
                <SideMark side="map-object" />
                <strong>Map objects</strong>
                <span className="field-nav__count mono">
                  {mapObjectCategories.reduce(
                    (total, category) => total + category.objects.length,
                    0,
                  )}
                </span>
              </button>
              {mapObjectsOpen && (
                <ul className="field-nav__map-categories">
                  {mapObjectCategories.map((category) => {
                    const open = openMapCategories[category.id]
                    return (
                      <li key={category.id}>
                        <button
                          type="button"
                          className="field-nav__map-category"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenMapCategories((current) => ({
                              ...current,
                              [category.id]: !current[category.id],
                            }))
                          }
                        >
                          <span
                            className={[
                              'field-nav__chevron',
                              open ? 'is-open' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-hidden="true"
                          >
                            ›
                          </span>
                          <span>{category.label}</span>
                          <span className="field-nav__count mono">
                            {category.objects.length}
                          </span>
                        </button>
                        {open && (
                          <ul className="field-nav__children field-nav__children--map">
                            {category.objects.length > 0 ? (
                              category.objects.map((object) => (
                                <FieldObjectRow
                                  key={object.id}
                                  object={object}
                                  active={isActive(object)}
                                  onActivate={locate}
                                  nested
                                />
                              ))
                            ) : (
                              <li className="field-nav__empty">
                                None in the loaded map area
                              </li>
                            )}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          </ul>
        </div>
      ) : tab === 'tools' ? (
        <div className="field-nav__tools" role="tabpanel">
          {TOOL_GROUPS.map((group) => {
            const tools = COMMANDER_TOOLS.filter((tool) => tool.group === group)
            const meta = TOOL_GROUP_META[group]
            return (
              <section key={group} className="field-tool-group">
                <header>
                  <span className="field-tool-group__icon" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div>
                    <h3>{meta.label}</h3>
                    <p>{meta.description}</p>
                  </div>
                </header>
                <div className="field-tool-group__grid">
                  {tools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      active={isToolActive(tool)}
                      onSelect={activateTool}
                    />
                  ))}
                </div>
                {group === 'Move' && activeToolId === 'swarm-movement' && (
                  <SwarmMovementTool />
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="field-nav__fleet" role="tabpanel">
          <div className="field-nav__fleet-hero">
            <span className="field-nav__fleet-glyph" aria-hidden="true">◇</span>
            <p className="panel__eyebrow">Reserved workspace</p>
            <h3>Missions</h3>
            <p>
              Mission planning, assignment, execution and review will live
              here.
            </p>
            <span className="field-nav__planned-badge">Planned</span>
          </div>
          <dl className="field-nav__fleet-stats">
            <div>
              <dt>State</dt>
              <dd className="mono field-nav__mission-state">{missionState}</dd>
            </div>
            <div>
              <dt>Executing</dt>
              <dd className="mono tone-ok">{activeMissions}</dd>
            </div>
            <div>
              <dt>Pending</dt>
              <dd className="mono tone-warn">{pendingMissions}</dd>
            </div>
          </dl>
          <section className="field-nav__fleet-scope">
            <h3>Planned scope</h3>
            <ul>
              <li>Mission objectives, phases and approval gates</li>
              <li>Force assignment, routes and timing</li>
              <li>Execution status, replay and after-action review</li>
            </ul>
          </section>
        </div>
      )}
    </CollapsiblePanel>
  )
}
