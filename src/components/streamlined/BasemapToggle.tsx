import { useAppDispatch, useAppSelector } from '../../store'
import { setMapBasemap, type MapBasemap } from '../../store/uiSlice'

const MODES: Array<{ id: MapBasemap; label: string; short: string }> = [
  { id: 'satellite', label: 'Satellite', short: 'Sat' },
  { id: 'minimal', label: 'Minimal', short: 'Min' },
]

export function BasemapToggle() {
  const basemap = useAppSelector((s) => s.ui.mapBasemap)
  const dispatch = useAppDispatch()

  return (
    <div className="v4-basemap-switch" data-operator-ui>
      <span className="v4-basemap-switch__label">Map</span>
      <div className="v4-basemap-switch__group" role="group" aria-label="Basemap style">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={[
              'v4-basemap-switch__btn',
              mode.id === 'minimal' ? 'v4-basemap-switch__btn--minimal' : '',
              basemap === mode.id ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={basemap === mode.id}
            title={mode.id === 'minimal' ? 'Switch to minimal tactical basemap' : 'Switch to 3D satellite'}
            onClick={() => dispatch(setMapBasemap(mode.id))}
          >
            <span className="v4-basemap-switch__full">{mode.label}</span>
            <span className="v4-basemap-switch__short">{mode.short}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
