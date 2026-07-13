import { useAppDispatch, useAppSelector } from '../../store'
import { MODE_PROFILES } from '../../modeProfiles'
import { requestModeSwitch, setMode, type ModeId } from '../../store/uiSlice'
import { useState } from 'react'

export function ModeSelector({ compact = false }: { compact?: boolean }) {
  const mode = useAppSelector((s) => s.ui.mode)
  const pendingCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'pending').length,
  )
  const engagedCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'confirmed').length,
  )
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(false)
  const current = MODE_PROFILES.find((m) => m.id === mode) ?? MODE_PROFILES[0]

  const pick = (next: ModeId) => {
    setOpen(false)
    if (next === mode) return
    if (pendingCount > 0 || engagedCount > 0) {
      dispatch(requestModeSwitch(next))
      return
    }
    dispatch(setMode(next))
  }

  return (
    <div className="v4-mode" data-operator-ui>
      <button
        type="button"
        className={['v4-mode__btn', compact ? 'v4-mode__btn--compact' : '']
          .filter(Boolean)
          .join(' ')}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        {current.shortLabel} ▾
      </button>
      {open && (
        <>
          <button
            type="button"
            className="v4-mode__backdrop"
            aria-label="Close mode menu"
            onClick={() => setOpen(false)}
          />
          <ul className="v4-mode__menu" role="listbox" aria-label="Mission mode">
            {MODE_PROFILES.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === mode}
                  className={m.id === mode ? 'is-active' : undefined}
                  onClick={() => pick(m.id)}
                >
                  {m.shortLabel}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
