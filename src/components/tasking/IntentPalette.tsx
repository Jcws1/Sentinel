import type { IntentAction, TaskingRecommendation } from '../../types'

const INTENT_GROUPS: Array<{
  label: string
  intents: IntentAction[]
}> = [
  {
    label: 'Tactical',
    intents: ['SWAP', 'REASSIGN', 'DELAY', 'PRIORITY_UP', 'PRIORITY_DOWN'],
  },
  {
    label: 'Disposition',
    intents: ['IGNORE', 'HOLD', 'ABORT'],
  },
  {
    label: 'Escalation',
    intents: ['ESCALATE', 'RECALL'],
  },
]

export function IntentPalette({
  lastVetoed,
  busy,
  onApplyIntent,
  onSkip,
}: {
  lastVetoed: TaskingRecommendation
  busy: boolean
  onApplyIntent: (intent: IntentAction) => void
  onSkip: () => void
}) {
  return (
    <div className="intent-palette map-ui-surface" role="dialog" aria-label="Structured intent">
      <div className="intent-palette__header">
        <div>
          <p className="panel__eyebrow">After veto</p>
          <h3>Choose operator intent</h3>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onSkip}>
          Skip
        </button>
      </div>
      <p className="intent-palette__context">{lastVetoed.summary}</p>
      {INTENT_GROUPS.map((group) => (
        <div key={group.label} className="intent-palette__group">
          <p className="intent-palette__group-label">{group.label}</p>
          <div className="intent-palette__grid">
            {group.intents.map((intent) => (
              <button
                key={intent}
                type="button"
                className="btn btn--intent"
                disabled={busy}
                onClick={() => onApplyIntent(intent)}
              >
                {intent.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
