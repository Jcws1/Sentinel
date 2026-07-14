import { useAppDispatch, useAppSelector } from '../../store'
import {
  engageTrackCommand,
  submitDecisionCommand,
} from '../../store/commandThunks'
import {
  selectPendingRecommendations,
  selectTopPriorityPending,
} from '../../store/selectors'
import { setIntentPaletteOpen } from '../../store/taskingSlice'
import { setTaskingSheetOpen } from '../../store/uiSlice'
import type { IntentAction } from '../../types'

const INTENTS: IntentAction[] = ['DELAY', 'SWAP', 'IGNORE', 'ESCALATE']

export function TaskingCard() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.taskingSheetOpen)
  const pending = useAppSelector(selectPendingRecommendations)
  const activeId = useAppSelector((s) => s.tasking.activeRecommendationId)
  const topPriority = useAppSelector(selectTopPriorityPending)
  const active = pending.find((r) => r.id === activeId) ?? topPriority
  const paletteOpen = useAppSelector((s) => s.tasking.intentPaletteOpen)

  if (!active) return null
  if (!open && !paletteOpen) return null

  return (
    <div className="v4-tasking-card" role="dialog" aria-label="Tasking recommendation" data-operator-ui>
      <p className="v4-tasking-card__eyebrow mono">INTERCEPT {active.trackId}</p>
      <p className="v4-tasking-card__line">
        Drones: <strong>{active.droneIds.join(', ')}</strong>
      </p>
      <p className="v4-tasking-card__line">Route: Alpha-3 (terrain-following)</p>
      <p className="v4-tasking-card__line">
        ETA: <strong className="mono">{active.etaSeconds}s</strong> · Confidence:{' '}
        <strong className="mono">{active.confidence}%</strong>
      </p>
      <p className="v4-tasking-card__summary">{active.summary}</p>

      <div className="v4-tasking-card__actions">
        <button
          type="button"
          className="v4-btn v4-btn--confirm is-ready"
          onClick={() => {
            void dispatch(engageTrackCommand(active.trackId))
            dispatch(setTaskingSheetOpen(false))
            dispatch(setIntentPaletteOpen(false))
          }}
        >
          CONFIRM
        </button>
        {INTENTS.map((intent) => (
          <button
            key={intent}
            type="button"
            className="v4-btn v4-btn--sm"
            onClick={() => {
              void dispatch(
                submitDecisionCommand({
                  recommendationId: active.id,
                  decision: 'veto',
                  intent,
                }),
              )
              dispatch(setTaskingSheetOpen(false))
              dispatch(setIntentPaletteOpen(false))
            }}
          >
            {intent}
          </button>
        ))}
        <button
          type="button"
          className="v4-btn v4-btn--sm"
          onClick={() => {
            dispatch(setTaskingSheetOpen(false))
            dispatch(setIntentPaletteOpen(false))
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  )
}
