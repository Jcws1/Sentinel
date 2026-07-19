import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { IntentAction, TaskingRecommendation } from '../types'

interface TaskingState {
  recommendations: TaskingRecommendation[]
  activeRecommendationId: string | null
  lastVetoedId: string | null
  intentPaletteOpen: boolean
  decisionLog: Array<{
    timestamp: number
    action: string
    detail: string
  }>
  toasts: Array<{
    id: string
    message: string
    expiresAt: number
    undoTrackId?: string
  }>
}

const initialState: TaskingState = {
  recommendations: [],
  activeRecommendationId: null,
  lastVetoedId: null,
  intentPaletteOpen: false,
  decisionLog: [],
  toasts: [],
}

const taskingSlice = createSlice({
  name: 'tasking',
  initialState,
  reducers: {
    upsertRecommendation(state, action: PayloadAction<TaskingRecommendation>) {
      const idx = state.recommendations.findIndex(
        (r) => r.id === action.payload.id || r.trackId === action.payload.trackId,
      )
      if (idx >= 0) {
        state.recommendations[idx] = action.payload
      } else {
        state.recommendations.push(action.payload)
      }
      if (action.payload.status === 'pending') {
        state.activeRecommendationId = action.payload.id
      }
    },
    confirmRecommendation(state, action: PayloadAction<string>) {
      const rec = state.recommendations.find((r) => r.id === action.payload)
      if (!rec || rec.status !== 'pending') return
      rec.status = 'confirmed'
      rec.autoExecuteAt = null
      state.decisionLog.push({
        timestamp: Date.now(),
        action: 'CONFIRM',
        detail: rec.summary,
      })
      state.toasts.push({
        id: `toast-${Date.now()}`,
        message: `Confirmed: ${rec.summary}`,
        expiresAt: Date.now() + 5000,
      })
      if (state.activeRecommendationId === rec.id) {
        state.activeRecommendationId = null
      }
    },
    vetoRecommendation(state, action: PayloadAction<string>) {
      const rec = state.recommendations.find((r) => r.id === action.payload)
      if (!rec || rec.status !== 'pending') return
      rec.status = 'vetoed'
      rec.autoExecuteAt = null
      state.decisionLog.push({
        timestamp: Date.now(),
        action: 'VETO',
        detail: rec.summary,
      })
      state.intentPaletteOpen = true
      if (state.activeRecommendationId === rec.id) {
        state.activeRecommendationId = null
      }
    },
    applyIntent(
      state,
      action: PayloadAction<{ recommendationId: string; intent: IntentAction }>,
    ) {
      const rec = state.recommendations.find(
        (r) => r.id === action.payload.recommendationId,
      )
      state.decisionLog.push({
        timestamp: Date.now(),
        action: action.payload.intent,
        detail: rec?.summary ?? action.payload.recommendationId,
      })
      state.intentPaletteOpen = false
      state.toasts.push({
        id: `toast-${Date.now()}`,
        message: `Intent applied: ${action.payload.intent}`,
        expiresAt: Date.now() + 5000,
      })
    },
    confirmAllPending(state) {
      for (const rec of state.recommendations) {
        if (rec.status === 'pending') {
          rec.status = 'confirmed'
          rec.autoExecuteAt = null
          state.decisionLog.push({
            timestamp: Date.now(),
            action: 'CONFIRM_ALL',
            detail: rec.summary,
          })
        }
      }
      state.activeRecommendationId = null
      state.toasts.push({
        id: `toast-${Date.now()}`,
        message: 'All pending taskings confirmed',
        expiresAt: Date.now() + 5000,
      })
    },
    setActiveRecommendation(state, action: PayloadAction<string | null>) {
      state.activeRecommendationId = action.payload
    },
    setIntentPaletteOpen(state, action: PayloadAction<boolean>) {
      state.intentPaletteOpen = action.payload
    },
    setLastVetoedId(state, action: PayloadAction<string | null>) {
      state.lastVetoedId = action.payload
    },
    hydrateTasking(
      state,
      action: PayloadAction<{
        recommendations: TaskingRecommendation[]
        decisionLog: Array<{ timestamp: number; action: string; detail: string }>
      }>,
    ) {
      state.recommendations = action.payload.recommendations
      state.decisionLog = action.payload.decisionLog
      const activeStillPending = action.payload.recommendations.find(
        (r) =>
          r.id === state.activeRecommendationId && r.status === 'pending',
      )
      if (!activeStillPending) {
        const firstPending = action.payload.recommendations.find(
          (r) => r.status === 'pending',
        )
        state.activeRecommendationId = firstPending?.id ?? null
      }
      if (
        state.lastVetoedId &&
        !action.payload.recommendations.some((r) => r.id === state.lastVetoedId)
      ) {
        state.lastVetoedId = null
        state.intentPaletteOpen = false
      }
    },
    pushToast(state, action: PayloadAction<string>) {
      state.toasts.push({
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message: action.payload,
        expiresAt: Date.now() + 5000,
      })
      if (state.toasts.length > 4) {
        state.toasts = state.toasts.slice(-4)
      }
    },
    pushUndoToast(state, action: PayloadAction<{ trackId: string }>) {
      const { trackId } = action.payload
      state.toasts.push({
        id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message: `Intercept ${trackId}`,
        expiresAt: Date.now() + 3000,
        undoTrackId: trackId,
      })
      if (state.toasts.length > 4) {
        state.toasts = state.toasts.slice(-4)
      }
    },

    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload)
    },
    pruneToasts(state) {
      const now = Date.now()
      state.toasts = state.toasts.filter((t) => t.expiresAt > now)
    },
  },
})

export const {
  upsertRecommendation,
  confirmRecommendation,
  vetoRecommendation,
  applyIntent,
  confirmAllPending,
  setActiveRecommendation,
  setIntentPaletteOpen,
  setLastVetoedId,
  hydrateTasking,
  pushToast,
  pushUndoToast,
  dismissToast,
  pruneToasts,
} = taskingSlice.actions
export default taskingSlice.reducer
