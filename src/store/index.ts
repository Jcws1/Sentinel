import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import fleetReducer from './fleetSlice'
import missionReducer from './missionSlice'
import policyReducer from './policySlice'
import sessionReducer from './sessionSlice'
import taskingReducer from './taskingSlice'
import threatsReducer from './threatsSlice'
import uiReducer from './uiSlice'
import workflowReducer from './workflowSlice'
import commandQueueReducer from './commandQueueSlice'

export const store = configureStore({
  reducer: {
    mission: missionReducer,
    fleet: fleetReducer,
    threats: threatsReducer,
    tasking: taskingReducer,
    session: sessionReducer,
    policy: policyReducer,
    ui: uiReducer,
    workflow: workflowReducer,
    commandQueue: commandQueueReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // High-frequency C2 snapshots; checks are for atypical action shapes.
      serializableCheck: false,
      immutableCheck: false,
    }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
