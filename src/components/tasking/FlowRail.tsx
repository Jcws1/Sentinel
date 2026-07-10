import { FLOW_STEPS } from '../../api/flow'
import type { OperatorFlowStage } from '../../api/types'

export function FlowRail({
  stage,
  pendingCount,
}: {
  stage: OperatorFlowStage
  pendingCount: number
}) {
  return (
    <div className="flow-rail map-ui-surface" aria-label="Operator flow">
      {FLOW_STEPS.map((step) => {
        const activeStep = step === stage
        const reached = FLOW_STEPS.indexOf(step) <= FLOW_STEPS.indexOf(stage)
        const decideCount = step === 'decide' ? pendingCount : 0
        return (
          <div
            key={step}
            className={[
              'flow-rail__step',
              reached ? 'is-reached' : '',
              activeStep ? 'is-active' : '',
              decideCount > 0 && step === 'decide' ? 'has-queue' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="flow-rail__dot" />
            <span className="flow-rail__label">{step}</span>
            {decideCount > 0 && <span className="flow-rail__count mono">{decideCount}</span>}
          </div>
        )
      })}
    </div>
  )
}
