import { useAppDispatch, useAppSelector } from '../store'
import { describeModeSwitchImpact } from '../modeProfiles'
import { cancelModeSwitch, setMode } from '../store/uiSlice'

export function ModeSwitchDialog() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((s) => s.ui.mode)
  const pendingModeSwitch = useAppSelector((s) => s.ui.pendingModeSwitch)
  const pendingCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'pending').length,
  )
  const engagedCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'confirmed').length,
  )

  if (!pendingModeSwitch) return null

  const { title, detail } = describeModeSwitchImpact(
    mode,
    pendingModeSwitch,
    pendingCount,
    engagedCount,
  )

  return (
    <div className="mode-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="mode-switch-title">
      <div className="mode-switch-dialog__card">
        <p className="panel__eyebrow">Mode lock</p>
        <h3 id="mode-switch-title">{title}</h3>
        <p className="mode-switch-dialog__detail">{detail}</p>
        <div className="mode-switch-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => dispatch(cancelModeSwitch())}>
            Stay
          </button>
          <button
            type="button"
            className="btn btn--ghost-warn"
            onClick={() => dispatch(setMode(pendingModeSwitch))}
          >
            Switch
          </button>
        </div>
      </div>
    </div>
  )
}
