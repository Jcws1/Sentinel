import { createAsyncThunk } from '@reduxjs/toolkit'
import { c2Client } from '../api/sync'
import type { MissionState } from '../types'
import type { TaskingDecisionRequest } from '../api/types'
import type { RootState } from './index'
import {
  pushToast,
  pushUndoToast,
  setActiveRecommendation,
  setIntentPaletteOpen,
  setLastVetoedId,
  upsertRecommendation,
} from './taskingSlice'
import {
  commandFailed,
  commandStarted,
  commandSucceeded,
} from './workflowSlice'
import {
  enqueueCommand,
  markCommandFailed,
  markCommandSending,
  removeQueuedCommand,
  setQueueFlushing,
} from './commandQueueSlice'
import { disarmConfirm } from './uiSlice'

export const requestPlanCommand = createAsyncThunk(
  'commands/requestPlan',
  async (trackId: string, thunkApi) => {
    const { dispatch, requestId, rejectWithValue, getState } = thunkApi
    const state = getState() as RootState
    dispatch(commandStarted({ id: requestId, kind: 'plan', targetId: trackId }))
    try {
      if (!state.session.connected) {
        const message = 'C2 offline — unable to add to mission'
        dispatch(commandFailed({ id: requestId, error: message }))
        dispatch(pushToast(message))
        return rejectWithValue(message)
      }
      const recommendation = await c2Client.requestPlan({ trackId })
      dispatch(upsertRecommendation(recommendation))
      dispatch(setActiveRecommendation(recommendation.id))
      dispatch(pushToast(`${trackId} added to mission planning`))
      dispatch(commandSucceeded({ id: requestId }))
      return recommendation
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Add to mission failed'
      dispatch(commandFailed({ id: requestId, error: message }))
      dispatch(pushToast(message))
      return rejectWithValue(message)
    }
  },
)

export const engageTrackCommand = createAsyncThunk(
  'commands/engageTrack',
  async (trackId: string, thunkApi) => {
    const { dispatch, requestId, rejectWithValue, getState } = thunkApi
    const state = getState() as RootState
    dispatch(commandStarted({ id: requestId, kind: 'engage', targetId: trackId }))
    try {
      if (!state.session.connected) {
        dispatch(enqueueCommand({ id: requestId, kind: 'engage', payload: trackId }))
        dispatch(pushToast('Queued — C2 offline'))
        dispatch(commandSucceeded({ id: requestId }))
        return { accepted: true, queued: true as const, trackId, droneIds: [] as string[] }
      }
      const result = await c2Client.engageTrack(trackId)
      dispatch(pushUndoToast({ trackId }))
      dispatch(disarmConfirm())
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
    const { dispatch, requestId, rejectWithValue, getState } = thunkApi
    const state = getState() as RootState
    dispatch(commandStarted({ id: requestId, kind: 'hold', targetId: trackId }))
    try {
      if (!state.session.connected) {
        dispatch(enqueueCommand({ id: requestId, kind: 'hold_track', payload: trackId }))
        dispatch(pushToast('Queued — C2 offline'))
        dispatch(commandSucceeded({ id: requestId }))
        return { accepted: true, queued: true }
      }
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
    const { dispatch, requestId, rejectWithValue, getState } = thunkApi
    const state = getState() as RootState
    dispatch(commandStarted({ id: requestId, kind: 'abort', targetId: trackId }))
    try {
      if (!state.session.connected) {
        dispatch(enqueueCommand({ id: requestId, kind: 'abort', payload: trackId }))
        dispatch(pushToast('Queued — C2 offline'))
        dispatch(commandSucceeded({ id: requestId }))
        return { accepted: true, queued: true }
      }
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
    const { dispatch, requestId, rejectWithValue, getState } = thunkApi
    const state = getState() as RootState
    dispatch(
      commandStarted({
        id: requestId,
        kind: 'decision',
        targetId: body.recommendationId,
      }),
    )
    try {
      if (!state.session.connected) {
        dispatch(enqueueCommand({ id: requestId, kind: 'decision', payload: body }))
        dispatch(pushToast('Queued — C2 offline'))
        dispatch(commandSucceeded({ id: requestId }))
        return { accepted: true, queued: true }
      }
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
    const { dispatch, requestId, rejectWithValue, getState } = thunkApi
    const state = getState() as RootState
    dispatch(
      commandStarted({
        id: requestId,
        kind: 'confirm_all',
        targetId: recommendationIds.join(','),
      }),
    )
    try {
      if (!state.session.connected) {
        dispatch(
          enqueueCommand({
            id: requestId,
            kind: 'confirm_all',
            payload: recommendationIds,
          }),
        )
        dispatch(pushToast(`Queued ${recommendationIds.length} confirms — C2 offline`))
        dispatch(disarmConfirm())
        dispatch(commandSucceeded({ id: requestId }))
        return { accepted: true, queued: true }
      }
      const confirmed: string[] = []
      for (const recommendationId of recommendationIds) {
        try {
          await c2Client.submitDecision({
            recommendationId,
            decision: 'confirm',
          })
          confirmed.push(recommendationId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Confirm failed'
          dispatch(
            pushToast(
              `Partial confirm: ${confirmed.length}/${recommendationIds.length} — ${message}`,
            ),
          )
          dispatch(commandFailed({ id: requestId, error: message }))
          return rejectWithValue(message)
        }
      }
      dispatch(pushToast(`Confirmed all (${recommendationIds.length})`))
      dispatch(disarmConfirm())
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
  async (missionState: MissionState, thunkApi) => {
    const { dispatch, requestId, rejectWithValue, getState } = thunkApi
    const root = getState() as RootState
    dispatch(
      commandStarted({
        id: requestId,
        kind: 'mission_state',
        targetId: missionState,
      }),
    )
    try {
      if (!root.session.connected) {
        dispatch(
          enqueueCommand({ id: requestId, kind: 'mission_state', payload: missionState }),
        )
        dispatch(pushToast('Queued — C2 offline'))
        dispatch(commandSucceeded({ id: requestId }))
        return { accepted: true, queued: true }
      }
      const result = await c2Client.setMissionState(missionState)
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

export const flushCommandQueue = createAsyncThunk(
  'commands/flushQueue',
  async (_, { dispatch, getState }) => {
    const root = getState() as RootState
    const queue = root.commandQueue.queue.filter((c) => c.status === 'queued')
    if (queue.length === 0) return { flushed: 0 }
    dispatch(setQueueFlushing(true))
    let flushed = 0
    for (const cmd of queue) {
      dispatch(markCommandSending(cmd.id))
      try {
        switch (cmd.kind) {
          case 'engage':
            await c2Client.engageTrack(cmd.payload as string)
            dispatch(pushUndoToast({ trackId: cmd.payload as string }))
            break
          case 'hold_track':
            await c2Client.holdTrack(cmd.payload as string)
            break
          case 'abort':
            await c2Client.abortEngagement(cmd.payload as string)
            break
          case 'decision':
            await c2Client.submitDecision(cmd.payload as TaskingDecisionRequest)
            break
          case 'confirm_all':
            for (const id of cmd.payload as string[]) {
              await c2Client.submitDecision({ recommendationId: id, decision: 'confirm' })
            }
            break
          case 'mission_state':
            await c2Client.setMissionState(cmd.payload as MissionState)
            break
        }
        dispatch(removeQueuedCommand(cmd.id))
        flushed++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Send failed'
        dispatch(markCommandFailed({ id: cmd.id, error: message }))
      }
    }
    dispatch(setQueueFlushing(false))
    if (flushed > 0) {
      dispatch(pushToast(`Sent ${flushed} queued command${flushed === 1 ? '' : 's'}`))
    }
    return { flushed }
  },
)
