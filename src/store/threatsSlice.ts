import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Position, ThreatTrack } from '../types'

interface ThreatsState {
  tracks: ThreatTrack[]
  selectedTrackId: string | null
  alertTrackIds: string[]
  /** Timestamp — auto-focus pauses briefly after operator map selection. */
  lastManualSelectAt: number
  /** Distinguishes programmatic auto-focus from operator map/queue picks. */
  selectionKind: 'auto' | 'operator' | null
}

const initialState: ThreatsState = {
  tracks: [],
  selectedTrackId: null,
  alertTrackIds: [],
  lastManualSelectAt: 0,
  selectionKind: null,
}

const threatsSlice = createSlice({
  name: 'threats',
  initialState,
  reducers: {
    hydrateTracks(
      state,
      action: PayloadAction<{ tracks: ThreatTrack[]; alertTrackIds: string[] }>,
    ) {
      state.tracks = action.payload.tracks
      state.alertTrackIds = action.payload.alertTrackIds
      if (
        state.selectedTrackId &&
        !action.payload.tracks.some((t) => t.id === state.selectedTrackId)
      ) {
        state.selectedTrackId = null
      }
    },
    updateThreatPositions(
      state,
      action: PayloadAction<Record<string, Position>>,
    ) {
      for (const track of state.tracks) {
        const next = action.payload[track.id]
        if (next) {
          track.position = next
          track.altitude = next.alt
        }
      }
    },
    updateThreatEtas(state, action: PayloadAction<Record<string, number>>) {
      for (const track of state.tracks) {
        const eta = action.payload[track.id]
        if (eta !== undefined) track.etaToAsset = eta
      }
    },
    selectTrack(state, action: PayloadAction<string | null>) {
      state.selectedTrackId = action.payload
      state.selectionKind = action.payload ? 'auto' : null
    },
    operatorSelectTrack(state, action: PayloadAction<string | null>) {
      state.selectedTrackId = action.payload
      state.selectionKind = action.payload ? 'operator' : null
      if (action.payload) {
        state.lastManualSelectAt = Date.now()
      }
    },
    clearAlert(state, action: PayloadAction<string>) {
      state.alertTrackIds = state.alertTrackIds.filter(
        (id) => id !== action.payload,
      )
    },
    cycleThreat(state, action: PayloadAction<'next' | 'prev'>) {
      const { tracks, alertTrackIds } = state
      if (tracks.length === 0) return
      const sorted = [...tracks].sort((a, b) => {
        const aAlert = alertTrackIds.includes(a.id) ? 0 : 1
        const bAlert = alertTrackIds.includes(b.id) ? 0 : 1
        if (aAlert !== bAlert) return aAlert - bAlert
        if (a.threatClass !== b.threatClass) return a.threatClass.localeCompare(b.threatClass)
        return a.etaToAsset - b.etaToAsset
      })
      const idx = sorted.findIndex((t) => t.id === state.selectedTrackId)
      const nextIdx =
        action.payload === 'next'
          ? (idx + 1) % sorted.length
          : (idx <= 0 ? sorted.length : idx) - 1
      const next = sorted[nextIdx]!
      state.selectedTrackId = next.id
      state.selectionKind = 'operator'
      state.lastManualSelectAt = Date.now()
    },
    removeTrack(state, action: PayloadAction<string>) {
      state.tracks = state.tracks.filter((t) => t.id !== action.payload)
      state.alertTrackIds = state.alertTrackIds.filter(
        (id) => id !== action.payload,
      )
      if (state.selectedTrackId === action.payload) {
        state.selectedTrackId = null
      }
    },
  },
})

export const {
  hydrateTracks,
  updateThreatPositions,
  updateThreatEtas,
  selectTrack,
  operatorSelectTrack,
  clearAlert,
  cycleThreat,
  removeTrack,
} = threatsSlice.actions
export default threatsSlice.reducer
