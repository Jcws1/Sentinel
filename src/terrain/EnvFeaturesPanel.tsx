import type { EnvLayerId, EnvLayerState, TerrainConfig } from './sgTerrainConfig'

export interface EnvFeaturesPanelProps {
  open: boolean
  onToggleOpen: () => void
  layers: EnvLayerState[]
  onToggleLayer: (id: EnvLayerId) => void
  config: TerrainConfig
  onExaggerationChange: (value: number) => void
  onContourIntervalChange: (interval: 10 | 20) => void
  losArmed: boolean
  onToggleLos: () => void
  losStatus: string | null
}

export function EnvFeaturesPanel({
  open,
  onToggleOpen,
  layers,
  onToggleLayer,
  config,
  onExaggerationChange,
  onContourIntervalChange,
  losArmed,
  onToggleLos,
  losStatus,
}: EnvFeaturesPanelProps) {
  return (
    <div className="env-features" data-operator-ui>
      <button
        type="button"
        className={['btn btn--ghost btn--sm', open ? 'is-active' : ''].filter(Boolean).join(' ')}
        onClick={onToggleOpen}
        aria-expanded={open}
      >
        Terrain
      </button>
      {open && (
        <div className="env-features__panel" role="region" aria-label="Terrain and environment">
          <p className="env-features__eyebrow mono">TOPOLOGY</p>
          <label className="env-features__row">
            <span>Exaggeration</span>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.1}
              value={config.exaggeration}
              onChange={(e) => onExaggerationChange(Number(e.target.value))}
            />
            <span className="mono">{config.exaggeration.toFixed(1)}×</span>
          </label>
          <label className="env-features__row">
            <span>Contour interval</span>
            <select
              value={config.contours.interval}
              onChange={(e) =>
                onContourIntervalChange(Number(e.target.value) === 10 ? 10 : 20)
              }
            >
              <option value={10}>10 m</option>
              <option value={20}>20 m</option>
            </select>
          </label>
          <ul className="env-features__list">
            {layers.map((layer) => (
              <li key={layer.id}>
                <label className="env-features__check">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={() => onToggleLayer(layer.id)}
                  />
                  <span>{layer.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={['btn btn--ghost btn--sm env-features__los', losArmed ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={onToggleLos}
            aria-pressed={losArmed}
          >
            {losArmed ? 'LOS: click 2 pts' : 'LOS check'}
          </button>
          {losStatus && <p className="env-features__status mono">{losStatus}</p>}
        </div>
      )}
    </div>
  )
}
