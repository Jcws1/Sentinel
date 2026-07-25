import { useAppDispatch, useAppSelector, store } from '../../store'
import {
  submitDecisionCommand,
} from '../../store/commandThunks'
import {
  selectConfirmReadiness,
  selectPendingRecommendations,
  selectTopPriorityPending,
} from '../../store/selectors'
import { setIntentPaletteOpen } from '../../store/taskingSlice'
import { setTaskingSheetOpen, disarmConfirm, armConfirm } from '../../store/uiSlice'
import { executePrimaryConfirm } from '../../utils/operatorActions'
import type { IntentAction } from '../../types'
import { DecisionEvidenceStrip } from './DecisionEvidenceStrip'

const INTENTS: IntentAction[] = ['DELAY', 'SWAP', 'IGNORE', 'ESCALATE']

export function TaskingCard() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.taskingSheetOpen)
  const pending = useAppSelector(selectPendingRecommendations)
  const activeId = useAppSelector((s) => s.tasking.activeRecommendationId)
  const topPriority = useAppSelector(selectTopPriorityPending)
  const active = pending.find((r) => r.id === activeId) ?? topPriority
  const paletteOpen = useAppSelector((s) => s.tasking.intentPaletteOpen)
  const readiness = useAppSelector(selectConfirmReadiness)
  const confirmArmed = useAppSelector((s) => s.ui.confirmArmed)
  const confirmExpires = useAppSelector((s) => s.ui.confirmArmExpiresAt)
  const multi = pending.length > 1
  const armValid =
    confirmArmed && confirmExpires != null && Date.now() < confirmExpires

  if (!active) return null
  if (!open && !paletteOpen) return null

  const canConfirm = readiness.ready

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

      <DecisionEvidenceStrip trackId={active.trackId} />

      <div className="v4-tasking-card__actions">
        <button
          type="button"
          className={[
            'v4-btn v4-btn--confirm',
            canConfirm ? 'is-ready' : 'is-disabled',
            multi && armValid ? 'is-armed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={!canConfirm}
          onClick={() => {
            if (multi && !armValid) {
              dispatch(armConfirm())
              return
            }
            executePrimaryConfirm(dispatch, store.getState, pending, active)
            dispatch(setTaskingSheetOpen(false))
            dispatch(setIntentPaletteOpen(false))
          }}
        >
          {multi && !armValid ? `ARM (${pending.length})` : 'CONFIRM'}
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
              dispatch(disarmConfirm())
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
            dispatch(disarmConfirm())
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  )
}
