import { useAppDispatch, useAppSelector } from '../store'
import { selectDrone } from '../store/fleetSlice'
import { toggleOntologyCollapsed } from '../store/uiSlice'
import { droneHealth, healthGlyph, healthLabel } from '../utils/health'
import { CollapsiblePanel } from './CollapsiblePanel'

export function FleetPanel() {
  const drones = useAppSelector((s) => s.fleet.drones)
  const selectedDroneId = useAppSelector((s) => s.fleet.selectedDroneId)
  const policySummary = useAppSelector((s) => s.session.policySummary)
  const fleetFocus = useAppSelector((s) => s.ui.workspace) === 'fleet'
  const ontologyCollapsed = useAppSelector((s) => s.ui.ontologyCollapsed)
  const dispatch = useAppDispatch()

  return (
    <CollapsiblePanel
      side="right"
      eyebrow="Network"
      title="Assets"
      count={drones.length}
      collapsed={ontologyCollapsed}
      onToggleCollapse={() => dispatch(toggleOntologyCollapsed())}
      className={fleetFocus ? 'panel--focused' : ''}
    >
      <div className="panel__list-head panel__list-head--fleet">
        <span>Object</span>
        <span>Type</span>
        <span>Batt</span>
        <span>Health</span>
      </div>

      <ul className="object-list">
        {drones.map((drone) => {
          const health = droneHealth(drone)
          const isSelected = selectedDroneId === drone.id

          return (
            <li key={drone.id}>
              <button
                type="button"
                className={[
                  'object-row',
                  `object-row--${health}`,
                  isSelected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() =>
                  dispatch(selectDrone(isSelected ? null : drone.id))
                }
                aria-pressed={isSelected}
              >
                <div className="object-row__primary object-row__primary--fleet">
                  <span className="object-row__id mono">
                    <span className="symbol symbol--friendly" aria-hidden="true" />
                    {drone.id}
                  </span>
                  <span className="object-row__type">{drone.type}</span>
                  <span className="object-row__batt mono">
                    <span
                      className="object-row__batt-bar"
                      style={{ width: `${drone.battery}%` }}
                      aria-hidden="true"
                    />
                    {drone.battery}%
                  </span>
                  <span
                    className={`object-row__health tone-${health === 'nominal' ? 'ok' : health === 'degraded' ? 'warn' : 'crit'}`}
                  >
                    <span aria-hidden="true">{healthGlyph(health)}</span>
                    {healthLabel(health)}
                  </span>
                </div>

                {isSelected && (
                  <div className="object-row__detail">
                    <div className="object-row__secondary mono">
                      <span>{drone.comms.toUpperCase()}</span>
                      <span>
                        {drone.positioningMethod} · {drone.positioningConfidence}%
                      </span>
                      <span>{drone.payloadStatus}</span>
                    </div>
                    {drone.assignedTrackId && (
                      <p className="object-row__link mono">
                        Tasked → {drone.assignedTrackId}
                      </p>
                    )}
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <footer className="panel__footer">
        <p className="panel__eyebrow">Active Policy</p>
        <h3 className="panel__footer-title">Rules of Engagement</h3>
        <dl className="prop-list">
          {(policySummary.length
            ? policySummary
            : [
                'Weapon-Free: Class I within 2 km of protected asset',
                'Hold-Fire: Class II/III unless fusion ≥ 90%',
                'Auto-engage: disabled — operator confirm required',
              ]
          ).map((line) => {
            const [label, ...rest] = line.split(':')
            return (
              <div className="prop-list__row" key={line}>
                <dt>{label}</dt>
                <dd>{rest.join(':').trim() || line}</dd>
              </div>
            )
          })}
        </dl>
      </footer>
    </CollapsiblePanel>
  )
}
