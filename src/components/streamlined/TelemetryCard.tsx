import { useAppDispatch, useAppSelector } from '../../store'
import { setTelemetryExpanded } from '../../store/uiSlice'
import { droneHealth, healthLabel } from '../../utils/health'

export function TelemetryCard() {
  const dispatch = useAppDispatch()
  const expanded = useAppSelector((s) => s.ui.telemetryExpanded)
  const droneId = useAppSelector((s) => s.fleet.selectedDroneId)
  const drone = useAppSelector((s) => s.fleet.drones.find((d) => d.id === droneId))
  const rec = useAppSelector((s) =>
    drone?.assignedTrackId
      ? s.tasking.recommendations.find((r) => r.trackId === drone.assignedTrackId)
      : null,
  )

  if (!expanded || !drone) return null

  const health = droneHealth(drone)
  const groundApprox = Math.max(0, Math.round(drone.position.alt - 15))

  return (
    <aside className="v4-telemetry" aria-label={`${drone.id} telemetry`} data-operator-ui>
      <header className="v4-telemetry__head">
        <div>
          <p className="v4-telemetry__eyebrow mono">{drone.type}</p>
          <h2 className="v4-telemetry__title">
            <span className={`v4-dot v4-dot--${health}`} aria-hidden="true" />
            {drone.id}
          </h2>
        </div>
        <button
          type="button"
          className="v4-telemetry__close"
          aria-label="Close"
          onClick={() => dispatch(setTelemetryExpanded(false))}
        >
          ✕
        </button>
      </header>

      <p className="v4-telemetry__status mono">
        {healthLabel(health)} · {Math.round(drone.battery)}% · {drone.comms}
      </p>

      <dl className="v4-telemetry__flight v4-telemetry__flight--compact">
        <div>
          <dt>AGL</dt>
          <dd className="mono">{groundApprox} m</dd>
        </div>
        <div>
          <dt>CONF</dt>
          <dd className="mono">{drone.positioningConfidence}%</dd>
        </div>
        <div>
          <dt>TASK</dt>
          <dd className="mono">{rec ? rec.trackId : 'Standby'}</dd>
        </div>
        <div>
          <dt>ETA</dt>
          <dd className="mono">{rec ? `${rec.etaSeconds}s` : '—'}</dd>
        </div>
      </dl>
    </aside>
  )
}
