import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type WorkspaceView = 'tracks' | 'operations' | 'fleet' | 'policy' | 'sensors'
export type DeploymentMode = 'cloud' | 'edge'
/** PRD v3.0 primary UI modes */
export type ModeId = 'defense' | 'recon' | 'attack'
export type AutoEngageState = 'on' | 'off' | 'locked'
/** Map overlay focus: military bases vs PRD scenario anchors */
export type MapOverlayTab = 'bases' | 'scenarios'

interface UiState {
  mode: ModeId
  pendingModeSwitch: ModeId | null
  autoEngage: AutoEngageState
  mapOverlayTab: MapOverlayTab
  overflowMenuOpen: boolean
  alertsOpen: boolean
  workspace: WorkspaceView
  deploymentMode: DeploymentMode
  trackDetailOpen: boolean
  investigationCollapsed: boolean
  ontologyCollapsed: boolean
  alertChirpEnabled: boolean
}

const initialState: UiState = {
  mode: 'defense',
  pendingModeSwitch: null,
  autoEngage: 'off',
  mapOverlayTab: 'bases',
  overflowMenuOpen: false,
  alertsOpen: false,
  workspace: 'tracks',
  deploymentMode:
    typeof globalThis.location !== 'undefined' &&
    new URLSearchParams(globalThis.location.search).get('deployment') === 'edge'
      ? 'edge'
      : 'cloud',
  trackDetailOpen: true,
  investigationCollapsed: false,
  ontologyCollapsed: false,
  alertChirpEnabled: false,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<ModeId>) {
      state.mode = action.payload
      state.pendingModeSwitch = null
      state.overflowMenuOpen = false
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
    },
    setAlertsOpen(state, action: PayloadAction<boolean>) {
      state.alertsOpen = action.payload
    },
    setMapOverlayTab(state, action: PayloadAction<MapOverlayTab>) {
      state.mapOverlayTab = action.payload
    },
    setWorkspace(state, action: PayloadAction<WorkspaceView>) {
      state.workspace = action.payload
    },
    toggleDeploymentMode(state) {
      state.deploymentMode = state.deploymentMode === 'cloud' ? 'edge' : 'cloud'
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
    toggleAlertChirp(state) {
      state.alertChirpEnabled = !state.alertChirpEnabled
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
  setWorkspace,
  toggleDeploymentMode,
  setTrackDetailOpen,
  setInvestigationCollapsed,
  setOntologyCollapsed,
  toggleInvestigationCollapsed,
  toggleOntologyCollapsed,
  toggleAlertChirp,
} = uiSlice.actions
export default uiSlice.reducer
