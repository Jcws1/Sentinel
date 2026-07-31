import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface ReplayState {
  selectedMissionId: string | null
  positionMs: number
  playing: boolean
  speed: 0.5 | 1 | 2 | 4
}

const initialState: ReplayState = {
  selectedMissionId: null,
  positionMs: 0,
  playing: false,
  speed: 1,
}

const replaySlice = createSlice({
  name: 'replay',
  initialState,
  reducers: {
    selectReplayMission(state, action: PayloadAction<string | null>) {
      state.selectedMissionId = action.payload
      state.positionMs = 0
      state.playing = action.payload != null
    },
    setReplayPosition(state, action: PayloadAction<number>) {
      state.positionMs = Math.max(0, action.payload)
    },
    advanceReplay(
      state,
      action: PayloadAction<{ deltaMs: number; durationMs: number }>,
    ) {
      state.positionMs = Math.min(
        action.payload.durationMs,
        state.positionMs + action.payload.deltaMs * state.speed,
      )
      if (state.positionMs >= action.payload.durationMs) state.playing = false
    },
    setReplayPlaying(state, action: PayloadAction<boolean>) {
      state.playing = action.payload
    },
    setReplaySpeed(state, action: PayloadAction<ReplayState['speed']>) {
      state.speed = action.payload
    },
    exitReplay(state) {
      state.selectedMissionId = null
      state.positionMs = 0
      state.playing = false
    },
  },
})

export const {
  selectReplayMission,
  setReplayPosition,
  advanceReplay,
  setReplayPlaying,
  setReplaySpeed,
  exitReplay,
} = replaySlice.actions
export default replaySlice.reducer
