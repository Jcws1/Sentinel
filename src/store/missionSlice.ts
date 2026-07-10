import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { CommsState, GnssState, MissionSnapshot, MissionState } from '../types'

const initialState: MissionSnapshot = {
  state: 'ACTIVE',
  gnss: 'degraded',
  fallbackPositioning: 'ORB-SLAM3 + Mesh',
  c2Link: 'strong',
  swarmAutonomy: false,
  protectedAsset: { lng: 103.8198, lat: 1.3521, alt: 0 },
}

const missionSlice = createSlice({
  name: 'mission',
  initialState,
  reducers: {
    hydrateMission(_state, action: PayloadAction<MissionSnapshot>) {
      return action.payload
    },
    setMissionState(state, action: PayloadAction<MissionState>) {
      state.state = action.payload
    },

    setGnss(state, action: PayloadAction<GnssState>) {
      state.gnss = action.payload
      state.fallbackPositioning =
        action.payload === 'active' ? null : 'ORB-SLAM3 + Mesh'
    },
    setC2Link(state, action: PayloadAction<CommsState>) {
      state.c2Link = action.payload
      state.swarmAutonomy = action.payload === 'lost'
    },
  },
})

export const { hydrateMission, setMissionState, setGnss, setC2Link } =
  missionSlice.actions
export default missionSlice.reducer
