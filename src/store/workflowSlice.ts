import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { setActiveRecommendation } from './taskingSlice'
import { selectTrack, operatorSelectTrack } from './threatsSlice'

export type WorkflowStage = 'detect' | 'decide' | 'execute'
export type CommandStatus = 'pending' | 'succeeded' | 'failed'

export interface WorkflowCommand {
  id: string
  kind:
    | 'engage'
    | 'plan'
    | 'hold'
    | 'abort'
    | 'decision'
    | 'confirm_all'
    | 'mission_state'
  targetId: string
  status: CommandStatus
  startedAt: number
  endedAt: number | null
  error: string | null
}

interface WorkflowState {
  stage: WorkflowStage
  focusedTrackId: string | null
  focusedRecommendationId: string | null
  commands: Record<string, WorkflowCommand>
}

const initialState: WorkflowState = {
  stage: 'detect',
  focusedTrackId: null,
  focusedRecommendationId: null,
  commands: {},
}

function deriveStage(
  recommendations: Array<{ status: string }>,
): WorkflowStage {
  if (recommendations.some((r) => r.status === 'confirmed')) return 'execute'
  if (recommendations.some((r) => r.status === 'pending')) return 'decide'
  return 'detect'
}

const workflowSlice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    hydrateWorkflow(
      state,
      action: PayloadAction<{
        recommendations: Array<{ status: string }>
        selectedTrackId?: string | null
        activeRecommendationId?: string | null
      }>,
    ) {
      state.stage = deriveStage(action.payload.recommendations)
      if (action.payload.selectedTrackId !== undefined) {
        state.focusedTrackId = action.payload.selectedTrackId
      }
      if (action.payload.activeRecommendationId !== undefined) {
        state.focusedRecommendationId = action.payload.activeRecommendationId
      }
    },
    commandStarted(
      state,
      action: PayloadAction<{
        id: string
        kind: WorkflowCommand['kind']
        targetId: string
      }>,
    ) {
      state.commands[action.payload.id] = {
        id: action.payload.id,
        kind: action.payload.kind,
        targetId: action.payload.targetId,
        status: 'pending',
        startedAt: Date.now(),
        endedAt: null,
        error: null,
      }
    },
    commandSucceeded(state, action: PayloadAction<{ id: string }>) {
      const cmd = state.commands[action.payload.id]
      if (!cmd) return
      cmd.status = 'succeeded'
      cmd.endedAt = Date.now()
      cmd.error = null
    },
    commandFailed(
      state,
      action: PayloadAction<{ id: string; error: string }>,
    ) {
      const cmd = state.commands[action.payload.id]
      if (!cmd) return
      cmd.status = 'failed'
      cmd.endedAt = Date.now()
      cmd.error = action.payload.error
    },
    pruneCommands(state) {
      const now = Date.now()
      for (const [id, cmd] of Object.entries(state.commands)) {
        if (cmd.endedAt && now - cmd.endedAt > 30_000) {
          delete state.commands[id]
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(selectTrack, (state, action) => {
      state.focusedTrackId = action.payload
    })
    builder.addCase(operatorSelectTrack, (state, action) => {
      state.focusedTrackId = action.payload
    })
    builder.addCase(setActiveRecommendation, (state, action) => {
      state.focusedRecommendationId = action.payload
    })
  },
})

export const {
  hydrateWorkflow,
  commandStarted,
  commandSucceeded,
  commandFailed,
  pruneCommands,
} = workflowSlice.actions
export default workflowSlice.reducer
