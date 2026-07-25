import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { MissionState } from '../types'
import type { TaskingDecisionRequest } from '../api/types'

export type QueuedCommandKind =
  | 'engage'
  | 'hold_track'
  | 'abort'
  | 'decision'
  | 'confirm_all'
  | 'mission_state'

export interface QueuedCommand {
  id: string
  kind: QueuedCommandKind
  payload: string | string[] | TaskingDecisionRequest | MissionState
  enqueuedAt: number
  status: 'queued' | 'sending' | 'failed'
  error: string | null
}

interface CommandQueueState {
  queue: QueuedCommand[]
  flushing: boolean
}

const initialState: CommandQueueState = {
  queue: [],
  flushing: false,
}

const commandQueueSlice = createSlice({
  name: 'commandQueue',
  initialState,
  reducers: {
    enqueueCommand(
      state,
      action: PayloadAction<Omit<QueuedCommand, 'enqueuedAt' | 'status' | 'error'>>,
    ) {
      state.queue.push({
        ...action.payload,
        enqueuedAt: Date.now(),
        status: 'queued',
        error: null,
      })
    },
    markCommandSending(state, action: PayloadAction<string>) {
      const cmd = state.queue.find((c) => c.id === action.payload)
      if (cmd) cmd.status = 'sending'
    },
    removeQueuedCommand(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter((c) => c.id !== action.payload)
    },
    markCommandFailed(
      state,
      action: PayloadAction<{ id: string; error: string }>,
    ) {
      const cmd = state.queue.find((c) => c.id === action.payload.id)
      if (!cmd) return
      cmd.status = 'failed'
      cmd.error = action.payload.error
    },
    setQueueFlushing(state, action: PayloadAction<boolean>) {
      state.flushing = action.payload
    },
    clearFailedCommands(state) {
      state.queue = state.queue.filter((c) => c.status !== 'failed')
    },
  },
})

export const {
  enqueueCommand,
  markCommandSending,
  removeQueuedCommand,
  markCommandFailed,
  setQueueFlushing,
  clearFailedCommands,
} = commandQueueSlice.actions
export default commandQueueSlice.reducer
