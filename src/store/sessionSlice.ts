import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface SessionState {
  connected: boolean
  connecting: boolean
  missionId: string | null
  policySummary: string[]
  lastSyncAt: number | null
  error: string | null
}

const initialState: SessionState = {
  connected: false,
  connecting: true,
  missionId: null,
  policySummary: [],
  lastSyncAt: null,
  error: null,
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setConnecting(state) {
      state.connecting = true
      state.error = null
    },
    setConnected(
      state,
      action: PayloadAction<{
        missionId: string
        policySummary: string[]
        lastSyncAt?: number
      }>,
    ) {
      state.connected = true
      state.connecting = false
      state.missionId = action.payload.missionId
      state.policySummary = action.payload.policySummary
      state.lastSyncAt = action.payload.lastSyncAt ?? Date.now()
      state.error = null
    },
    touchSync(state) {
      state.lastSyncAt = Date.now()
    },
    setDisconnected(state, action: PayloadAction<string | null>) {
      state.connected = false
      state.connecting = false
      state.error = action.payload
    },
  },
})

export const { setConnecting, setConnected, setDisconnected, touchSync } =
  sessionSlice.actions
export default sessionSlice.reducer
