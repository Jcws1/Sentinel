import { createAsyncThunk } from '@reduxjs/toolkit'
import { c2Client } from '../api/sync'
import type { MissionState } from '../types'
import type { TaskingDecisionRequest } from '../api/types'
import {
  pushToast,
  setIntentPaletteOpen,
  setLastVetoedId,
} from './taskingSlice'
import {
  commandFailed,
  commandStarted,
  commandSucceeded,
} from './workflowSlice'

export const engageTrackCommand = createAsyncThunk(
  'commands/engageTrack',
  async (trackId: string, thunkApi) => {
    const { dispatch, requestId, rejectWithValue } = thunkApi
    dispatch(commandStarted({ id: requestId, kind: 'engage', targetId: trackId }))
    try {
      const result = await c2Client.engageTrack(trackId)
      dispatch(
        pushToast(`Engaged ${trackId} — interceptors ${result.droneIds.join(', ')}`),
      )
      dispatch(commandSucceeded({ id: requestId }))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Engage failed'
      dispatch(commandFailed({ id: requestId, error: message }))
      dispatch(pushToast(message))
      return rejectWithValue(message)
    }
  },
)

export const holdTrackCommand = createAsyncThunk(
  'commands/holdTrack',
  async (trackId: string, thunkApi) => {
    const { dispatch, requestId, rejectWithValue } = thunkApi
    dispatch(commandStarted({ id: requestId, kind: 'hold', targetId: trackId }))
    try {
      await c2Client.holdTrack(trackId)
      dispatch(pushToast(`${trackId} on hold`))
      dispatch(commandSucceeded({ id: requestId }))
      return { accepted: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hold failed'
      dispatch(commandFailed({ id: requestId, error: message }))
      dispatch(pushToast(message))
      return rejectWithValue(message)
    }
  },
)

export const abortEngagementCommand = createAsyncThunk(
  'commands/abortEngagement',
  async (trackId: string, thunkApi) => {
    const { dispatch, requestId, rejectWithValue } = thunkApi
    dispatch(commandStarted({ id: requestId, kind: 'abort', targetId: trackId }))
    try {
      await c2Client.abortEngagement(trackId)
      dispatch(pushToast(`Aborted ${trackId}`))
      dispatch(commandSucceeded({ id: requestId }))
      return { accepted: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Abort failed'
      dispatch(commandFailed({ id: requestId, error: message }))
      dispatch(pushToast(message))
      return rejectWithValue(message)
    }
  },
)

export const submitDecisionCommand = createAsyncThunk(
  'commands/submitDecision',
  async (body: TaskingDecisionRequest, thunkApi) => {
    const { dispatch, requestId, rejectWithValue } = thunkApi
    dispatch(
      commandStarted({
        id: requestId,
        kind: 'decision',
        targetId: body.recommendationId,
      }),
    )
    try {
      await c2Client.submitDecision({
        recommendationId: body.recommendationId,
        decision: body.decision,
        intent: body.intent,
      })
      if (body.decision === 'veto' && !body.intent) {
        dispatch(setLastVetoedId(body.recommendationId))
        dispatch(setIntentPaletteOpen(true))
      }
      if (body.intent) {
        dispatch(pushToast(`Intent: ${body.intent.replaceAll('_', ' ')}`))
      }
      dispatch(commandSucceeded({ id: requestId }))
      return { accepted: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Decision failed'
      dispatch(commandFailed({ id: requestId, error: message }))
      dispatch(pushToast(message))
      return rejectWithValue(message)
    }
  },
)

export const confirmAllPendingCommand = createAsyncThunk(
  'commands/confirmAllPending',
  async (recommendationIds: string[], thunkApi) => {
    const { dispatch, requestId, rejectWithValue } = thunkApi
    dispatch(
      commandStarted({
        id: requestId,
        kind: 'confirm_all',
        targetId: recommendationIds.join(','),
      }),
    )
    try {
      for (const recommendationId of recommendationIds) {
        await c2Client.submitDecision({
          recommendationId,
          decision: 'confirm',
        })
      }
      dispatch(pushToast(`Confirmed all (${recommendationIds.length})`))
      dispatch(commandSucceeded({ id: requestId }))
      return { accepted: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Confirm all failed'
      dispatch(commandFailed({ id: requestId, error: message }))
      dispatch(pushToast(message))
      return rejectWithValue(message)
    }
  },
)

export const setMissionStateCommand = createAsyncThunk(
  'commands/setMissionState',
  async (state: MissionState, thunkApi) => {
    const { dispatch, requestId, rejectWithValue } = thunkApi
    dispatch(
      commandStarted({
        id: requestId,
        kind: 'mission_state',
        targetId: state,
      }),
    )
    try {
      const result = await c2Client.setMissionState(state)
      dispatch(commandSucceeded({ id: requestId }))
      return result
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Mission state update failed'
      dispatch(commandFailed({ id: requestId, error: message }))
      dispatch(pushToast(message))
      return rejectWithValue(message)
    }
  },
)
