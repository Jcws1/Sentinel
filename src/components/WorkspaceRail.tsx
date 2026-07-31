import { useAppDispatch, useAppSelector } from '../store'
import { setWorkspace, type WorkspaceView } from '../store/uiSlice'

const ITEMS: Array<{
  id: WorkspaceView
  label: string
  icon: string
}> = [
  { id: 'tracks', label: 'Tracks', icon: 'tracks' },
  { id: 'operations', label: 'Ops', icon: 'ops' },
  { id: 'fleet', label: 'Assets', icon: 'fleet' },
  { id: 'sensors', label: 'Sensors', icon: 'sensors' },
  { id: 'policy', label: 'ROE', icon: 'policy' },
  { id: 'assistant', label: 'AI', icon: 'assistant' },
]

export function WorkspaceRail() {
  const workspace = useAppSelector((s) => s.ui.workspace)
  const pendingCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'pending').length,
  )
  const engagedCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'confirmed').length,
  )
  const dispatch = useAppDispatch()

  return (
    <nav className="rail" aria-label="Workspace" data-operator-ui>
      {ITEMS.map((item) => {
        const active = workspace === item.id
        const badge =
          item.id === 'operations'
            ? pendingCount + engagedCount
            : item.id === 'tracks'
              ? pendingCount
              : 0

        return (
          <button
            key={item.id}
            type="button"
            className={['rail__item', active ? 'is-active' : ''].filter(Boolean).join(' ')}
            title={item.label}
            aria-pressed={active}
            onClick={() => dispatch(setWorkspace(item.id))}
          >
            <span
              className={`rail__icon rail__icon--${item.icon}`}
              aria-hidden="true"
            />
            <span className="rail__label">{item.label}</span>
            {badge > 0 && (
              <span className="rail__badge mono" aria-label={`${badge} items`}>
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
