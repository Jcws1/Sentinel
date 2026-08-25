import { useAppDispatch, useAppSelector } from '../store'
import { setOverflowMenuOpen, setWorkspace, type WorkspaceView } from '../store/uiSlice'

const ITEMS: Array<{ id: WorkspaceView; label: string; detail: string }> = [
  { id: 'scenarios', label: 'Scenarios', detail: 'Launch and monitor operational rehearsals' },
  { id: 'fleet', label: 'Fleet detail', detail: 'Assets, battery, mesh links' },
  { id: 'tracks', label: 'Sensor fusion', detail: 'Track provenance & correlation' },
  { id: 'policy', label: 'ROE config', detail: 'Engagement Authority only' },
  { id: 'operations', label: 'Mission logs', detail: 'AAR replay & decision audit' },
]

export function OverflowMenu() {
  const open = useAppSelector((s) => s.ui.overflowMenuOpen)
  const dispatch = useAppDispatch()

  if (!open) return null

  return (
    <div className="overflow-menu" role="dialog" aria-modal="true" aria-label="Utilities">
      <button
        type="button"
        className="overflow-menu__backdrop"
        aria-label="Close menu"
        onClick={() => dispatch(setOverflowMenuOpen(false))}
      />
      <div className="overflow-menu__drawer">
        <div className="overflow-menu__header">
          <h2 className="overflow-menu__title">Utilities</h2>
          <button
            type="button"
            className="overflow-menu__close"
            onClick={() => dispatch(setOverflowMenuOpen(false))}
          >
            Close
          </button>
        </div>
        <div className="overflow-menu__sections">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="overflow-menu__section"
              onClick={() => {
                dispatch(setWorkspace(item.id))
                dispatch(setOverflowMenuOpen(false))
              }}
            >
              <span className="overflow-menu__label">{item.label}</span>
              <span className="overflow-menu__detail">{item.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
