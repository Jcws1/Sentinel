import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
  DEFAULT_ENV_LAYERS,
  DEFAULT_TERRAIN_CONFIG,
  type EnvLayerId,
  type EnvLayerState,
  type TerrainConfig,
} from '../terrain/sgTerrainConfig'
import {
  envIdForOverlay,
  OVERLAY_DEFAULTS_BY_MODE,
  OVERLAY_DEFAULTS_DEGRADED,
  type MapChromeLayerId,
  type OverlayVisibility,
} from '../streamlined/overlayDefaults'

export type WorkspaceView = 'tracks' | 'operations' | 'fleet' | 'policy'
export type ModeId = 'defense' | 'recon' | 'attack'
export type AutoEngageState = 'on' | 'off' | 'locked'
export type MapOverlayTab = 'bases' | 'scenarios'
export type MapBasemap = 'minimal' | 'satellite'
export type MapViewMode = '2d' | '3d'

function syncEnvFromOverlays(envLayers: EnvLayerState[], overlays: OverlayVisibility) {
  for (const layer of envLayers) {
    if (layer.id === 'hillshade') layer.visible = overlays.terrain
    if (layer.id === 'contours') layer.visible = overlays.contours
    if (layer.id === 'buildings') layer.visible = overlays.buildings
    if (layer.id === 'water') layer.visible = overlays.water
    if (layer.id === 'roads') layer.visible = overlays.roads
    if (layer.id === 'restricted') layer.visible = overlays.masking
  }
}

interface UiState {
  mode: ModeId
  pendingModeSwitch: ModeId | null
  autoEngage: AutoEngageState
  mapOverlayTab: MapOverlayTab
  mapBasemap: MapBasemap
  mapView: MapViewMode
  overflowMenuOpen: boolean
  alertsOpen: boolean
  workspace: WorkspaceView
  trackDetailOpen: boolean
  investigationCollapsed: boolean
  ontologyCollapsed: boolean
  terrainPanelOpen: boolean
  terrainConfig: TerrainConfig
  envLayers: EnvLayerState[]
  /** PRD v4 streamlined chrome */
  fleetStripOpen: boolean
  overlayPanelOpen: boolean
  taskingSheetOpen: boolean
  overlayVisibility: OverlayVisibility
  holdArmed: boolean
  recallConfirmOpen: boolean
  offlinePrepOpen: boolean
  /** Full telemetry card — long-press fleet card to open. */
  telemetryExpanded: boolean
  /** Optional alert chirp on new threat alerts (off by default). */
  alertChirpEnabled: boolean
  helpOpen: boolean
}

const initialOverlays = OVERLAY_DEFAULTS_BY_MODE.defense

const initialState: UiState = {
  mode: 'defense',
  pendingModeSwitch: null,
  autoEngage: 'off',
  mapOverlayTab: 'bases',
  mapBasemap: 'satellite',
  mapView: '3d',
  overflowMenuOpen: false,
  alertsOpen: false,
  workspace: 'tracks',
  trackDetailOpen: true,
  investigationCollapsed: false,
  ontologyCollapsed: false,
  terrainPanelOpen: false,
  terrainConfig: {
    ...DEFAULT_TERRAIN_CONFIG,
    hillshade: initialOverlays.terrain,
    contours: { ...DEFAULT_TERRAIN_CONFIG.contours, enabled: initialOverlays.contours },
  },
  envLayers: DEFAULT_ENV_LAYERS.map((l) => {
    const copy = { ...l }
    if (copy.id === 'hillshade') copy.visible = initialOverlays.terrain
    if (copy.id === 'contours') copy.visible = initialOverlays.contours
    if (copy.id === 'buildings') copy.visible = initialOverlays.buildings
    if (copy.id === 'water') copy.visible = initialOverlays.water
    if (copy.id === 'roads') copy.visible = initialOverlays.roads
    if (copy.id === 'restricted') copy.visible = initialOverlays.masking
    return copy
  }),
  fleetStripOpen: false,
  overlayPanelOpen: false,
  taskingSheetOpen: false,
  overlayVisibility: { ...initialOverlays },
  holdArmed: false,
  recallConfirmOpen: false,
  offlinePrepOpen: false,
  telemetryExpanded: false,
  alertChirpEnabled: false,
  helpOpen: false,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<ModeId>) {
      state.mode = action.payload
      state.pendingModeSwitch = null
      state.overflowMenuOpen = false
      state.overlayVisibility = { ...OVERLAY_DEFAULTS_BY_MODE[action.payload] }
      syncEnvFromOverlays(state.envLayers, state.overlayVisibility)
      state.terrainConfig.hillshade = state.overlayVisibility.terrain
      state.terrainConfig.contours.enabled = state.overlayVisibility.contours
    },
    requestModeSwitch(state, action: PayloadAction<ModeId>) {
      if (action.payload === state.mode) {
        state.pendingModeSwitch = null
        return
      }
      state.pendingModeSwitch = action.payload
    },
    cancelModeSwitch(state) {
      state.pendingModeSwitch = null
    },
    setAutoEngage(state, action: PayloadAction<AutoEngageState>) {
      state.autoEngage = action.payload
    },
    cycleAutoEngage(state) {
      if (state.autoEngage === 'off') state.autoEngage = 'on'
      else if (state.autoEngage === 'on') state.autoEngage = 'locked'
      else state.autoEngage = 'off'
    },
    setOverflowMenuOpen(state, action: PayloadAction<boolean>) {
      state.overflowMenuOpen = action.payload
    },
    toggleOverflowMenu(state) {
      state.overflowMenuOpen = !state.overflowMenuOpen
      if (state.overflowMenuOpen) {
        state.fleetStripOpen = false
        state.overlayPanelOpen = false
      }
    },
    setAlertsOpen(state, action: PayloadAction<boolean>) {
      state.alertsOpen = action.payload
    },
    setMapOverlayTab(state, action: PayloadAction<MapOverlayTab>) {
      state.mapOverlayTab = action.payload
    },
    setMapBasemap(state, action: PayloadAction<MapBasemap>) {
      state.mapBasemap = action.payload
      state.mapView = '3d'
    },
    toggleMapBasemap(state) {
      state.mapBasemap = state.mapBasemap === 'satellite' ? 'minimal' : 'satellite'
      state.mapView = '3d'
    },
    setMapView(state, action: PayloadAction<MapViewMode>) {
      state.mapView = action.payload === '2d' ? '3d' : action.payload
    },
    toggleMapView(state) {
      state.mapView = '3d'
    },
    setWorkspace(state, action: PayloadAction<WorkspaceView>) {
      state.workspace = action.payload
    },
    setTrackDetailOpen(state, action: PayloadAction<boolean>) {
      state.trackDetailOpen = action.payload
    },
    setInvestigationCollapsed(state, action: PayloadAction<boolean>) {
      state.investigationCollapsed = action.payload
    },
    setOntologyCollapsed(state, action: PayloadAction<boolean>) {
      state.ontologyCollapsed = action.payload
    },
    toggleInvestigationCollapsed(state) {
      state.investigationCollapsed = !state.investigationCollapsed
    },
    toggleOntologyCollapsed(state) {
      state.ontologyCollapsed = !state.ontologyCollapsed
    },
    setTerrainPanelOpen(state, action: PayloadAction<boolean>) {
      state.terrainPanelOpen = action.payload
    },
    toggleTerrainPanel(state) {
      state.terrainPanelOpen = !state.terrainPanelOpen
    },
    setTerrainExaggerationUi(state, action: PayloadAction<number>) {
      state.terrainConfig.exaggeration = action.payload
    },
    setContourInterval(state, action: PayloadAction<10 | 20>) {
      state.terrainConfig.contours.interval = action.payload
    },
    toggleEnvLayer(state, action: PayloadAction<EnvLayerId>) {
      const layer = state.envLayers.find((l) => l.id === action.payload)
      if (!layer) return
      layer.visible = !layer.visible
      if (action.payload === 'contours') {
        state.terrainConfig.contours.enabled = layer.visible
        state.overlayVisibility.contours = layer.visible
      }
      if (action.payload === 'hillshade') {
        state.terrainConfig.hillshade = layer.visible
        state.overlayVisibility.terrain = layer.visible
      }
      if (action.payload === 'buildings') state.overlayVisibility.buildings = layer.visible
      if (action.payload === 'water') state.overlayVisibility.water = layer.visible
      if (action.payload === 'roads') state.overlayVisibility.roads = layer.visible
    },
    toggleFleetStrip(state) {
      state.fleetStripOpen = !state.fleetStripOpen
      if (state.fleetStripOpen) state.overlayPanelOpen = false
    },
    setFleetStripOpen(state, action: PayloadAction<boolean>) {
      state.fleetStripOpen = action.payload
    },
    toggleOverlayPanel(state) {
      state.overlayPanelOpen = !state.overlayPanelOpen
      if (state.overlayPanelOpen) state.fleetStripOpen = false
    },
    setOverlayPanelOpen(state, action: PayloadAction<boolean>) {
      state.overlayPanelOpen = action.payload
    },
    setTaskingSheetOpen(state, action: PayloadAction<boolean>) {
      state.taskingSheetOpen = action.payload
    },
    toggleMapOverlay(state, action: PayloadAction<MapChromeLayerId>) {
      const id = action.payload
      state.overlayVisibility[id] = !state.overlayVisibility[id]
      const envId = envIdForOverlay(id)
      if (envId) {
        const layer = state.envLayers.find((l) => l.id === envId)
        if (layer) layer.visible = state.overlayVisibility[id]
        if (envId === 'hillshade') state.terrainConfig.hillshade = state.overlayVisibility[id]
        if (envId === 'contours') {
          state.terrainConfig.contours.enabled = state.overlayVisibility[id]
        }
      }
      if (id === 'masking') {
        const restricted = state.envLayers.find((l) => l.id === 'restricted')
        if (restricted) restricted.visible = state.overlayVisibility.masking
      }
    },
    resetOverlaysForMode(state, action: PayloadAction<{ degraded?: boolean } | undefined>) {
      const degraded = action.payload?.degraded
      state.overlayVisibility = {
        ...(degraded ? OVERLAY_DEFAULTS_DEGRADED : OVERLAY_DEFAULTS_BY_MODE[state.mode]),
      }
      syncEnvFromOverlays(state.envLayers, state.overlayVisibility)
      state.terrainConfig.hillshade = state.overlayVisibility.terrain
      state.terrainConfig.contours.enabled = state.overlayVisibility.contours
    },
    applyDegradedOverlays(state) {
      state.overlayVisibility = { ...OVERLAY_DEFAULTS_DEGRADED }
      syncEnvFromOverlays(state.envLayers, state.overlayVisibility)
      state.terrainConfig.hillshade = true
      state.terrainConfig.contours.enabled = true
    },
    setHoldArmed(state, action: PayloadAction<boolean>) {
      state.holdArmed = action.payload
    },
    setRecallConfirmOpen(state, action: PayloadAction<boolean>) {
      state.recallConfirmOpen = action.payload
    },
    setOfflinePrepOpen(state, action: PayloadAction<boolean>) {
      state.offlinePrepOpen = action.payload
    },
    setTelemetryExpanded(state, action: PayloadAction<boolean>) {
      state.telemetryExpanded = action.payload
    },
    toggleAlertChirp(state) {
      state.alertChirpEnabled = !state.alertChirpEnabled
    },
    setHelpOpen(state, action: PayloadAction<boolean>) {
      state.helpOpen = action.payload
    },
    dismissBottomSheets(state) {
      state.fleetStripOpen = false
      state.overlayPanelOpen = false
      state.taskingSheetOpen = false
    },
  },
})

export const {
  setMode,
  requestModeSwitch,
  cancelModeSwitch,
  setAutoEngage,
  cycleAutoEngage,
  setOverflowMenuOpen,
  toggleOverflowMenu,
  setAlertsOpen,
  setMapOverlayTab,
  setMapBasemap,
  toggleMapBasemap,
  setMapView,
  toggleMapView,
  setWorkspace,
  setTrackDetailOpen,
  setInvestigationCollapsed,
  setOntologyCollapsed,
  toggleInvestigationCollapsed,
  toggleOntologyCollapsed,
  setTerrainPanelOpen,
  toggleTerrainPanel,
  setTerrainExaggerationUi,
  setContourInterval,
  toggleEnvLayer,
  toggleFleetStrip,
  setFleetStripOpen,
  toggleOverlayPanel,
  setOverlayPanelOpen,
  setTaskingSheetOpen,
  toggleMapOverlay,
  resetOverlaysForMode,
  applyDegradedOverlays,
  setHoldArmed,
  setRecallConfirmOpen,
  setOfflinePrepOpen,
  setTelemetryExpanded,
  toggleAlertChirp,
  setHelpOpen,
  dismissBottomSheets,
} = uiSlice.actions
export default uiSlice.reducer
