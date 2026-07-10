import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Drone, Position } from '../types'

interface FleetState {
  drones: Drone[]
  selectedDroneId: string | null
}

const initialState: FleetState = {
  drones: [],
  selectedDroneId: null,
}

const fleetSlice = createSlice({
  name: 'fleet',
  initialState,
  reducers: {
    hydrateDrones(state, action: PayloadAction<Drone[]>) {
      state.drones = action.payload
      if (
        state.selectedDroneId &&
        !action.payload.some((d) => d.id === state.selectedDroneId)
      ) {
        state.selectedDroneId = null
      }
    },
    updateDronePositions(
      state,
      action: PayloadAction<Record<string, Position>>,
    ) {
      for (const drone of state.drones) {
        const next = action.payload[drone.id]
        if (next) drone.position = next
      }
    },
    updateDroneTelemetry(
      state,
      action: PayloadAction<
        Partial<Drone> & { id: string }
      >,
    ) {
      const drone = state.drones.find((d) => d.id === action.payload.id)
      if (drone) Object.assign(drone, action.payload)
    },
    selectDrone(state, action: PayloadAction<string | null>) {
      state.selectedDroneId = action.payload
    },
    assignDroneToTrack(
      state,
      action: PayloadAction<{ droneIds: string[]; trackId: string | null }>,
    ) {
      for (const drone of state.drones) {
        if (action.payload.droneIds.includes(drone.id)) {
          drone.assignedTrackId = action.payload.trackId
        }
      }
    },
  },
})

export const {
  hydrateDrones,
  updateDronePositions,
  updateDroneTelemetry,
  selectDrone,
  assignDroneToTrack,
} = fleetSlice.actions
export default fleetSlice.reducer
