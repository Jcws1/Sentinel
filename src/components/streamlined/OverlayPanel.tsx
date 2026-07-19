import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import {
  resetOverlaysForMode,
  toggleMapOverlay,
} from '../../store/uiSlice'
import {
  OVERLAY_ADVANCED_IDS,
  OVERLAY_PRIMARY_IDS,
  OVERLAY_TOGGLE_DEFS,
} from '../../streamlined/overlayDefaults'
import { isDegraded } from '../../modeProfiles'

export function OverlayPanel() {
  const open = useAppSelector((s) => s.ui.overlayPanelOpen)
  const visibility = useAppSelector((s) => s.ui.overlayVisibility)
  const mission = useAppSelector((s) => s.mission)
  const dispatch = useAppDispatch()
  const degraded = isDegraded(mission.gnss, mission.c2Link)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  if (!open) return null

  const defs = Object.fromEntries(OVERLAY_TOGGLE_DEFS.map((d) => [d.id, d]))

  const renderToggle = (id: (typeof OVERLAY_PRIMARY_IDS)[number]) => {
    const layer = defs[id]
    if (!layer) return null
    return (
      <li key={id}>
        <label className="v4-overlay-panel__check">
          <input
            type="checkbox"
            checked={visibility[id]}
            onChange={() => dispatch(toggleMapOverlay(id))}
          />
          <span>{layer.label}</span>
        </label>
      </li>
    )
  }

  return (
    <div className="v4-overlay-panel" role="region" aria-label="Map overlays" data-operator-ui>
      <ul className="v4-overlay-panel__grid v4-overlay-panel__grid--primary">
        {OVERLAY_PRIMARY_IDS.map(renderToggle)}
      </ul>
      <button
        type="button"
        className="v4-overlay-panel__more"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        {advancedOpen ? 'Less layers' : 'More layers'}
      </button>
      {advancedOpen && (
        <ul className="v4-overlay-panel__grid v4-overlay-panel__grid--advanced">
          {OVERLAY_ADVANCED_IDS.map(renderToggle)}
        </ul>
      )}
      <button
        type="button"
        className="v4-btn v4-btn--sm v4-overlay-panel__reset"
        onClick={() => dispatch(resetOverlaysForMode({ degraded }))}
      >
        Reset
      </button>
    </div>
  )
}
