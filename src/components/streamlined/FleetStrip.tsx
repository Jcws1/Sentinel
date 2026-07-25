import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { selectDrone } from '../../store/fleetSlice'
import { setTelemetryExpanded } from '../../store/uiSlice'
import { droneHealth } from '../../utils/health'
import { useLongPress } from './useLongPress'

const TYPE_SHORT: Record<string, string> = {
  Interceptor: 'INT',
  Scout: 'SCT',
  Relay: 'RLY',
}

function commsLabel(comms: string): string {
  return comms.toUpperCase()
}

function FleetCard({
  droneId,
  selected,
}: {
  droneId: string
  selected: boolean
}) {
  const dispatch = useAppDispatch()
  const drone = useAppSelector((s) => s.fleet.drones.find((d) => d.id === droneId))

  const onTap = useCallback(() => {
    if (!drone) return
    if (selected) {
      dispatch(selectDrone(null))
      dispatch(setTelemetryExpanded(false))
      return
    }
    dispatch(selectDrone(drone.id))
    dispatch(setTelemetryExpanded(false))
  }, [dispatch, drone, selected])

  const onLongPress = useCallback(() => {
    if (!drone) return
    dispatch(selectDrone(drone.id))
    dispatch(setTelemetryExpanded(true))
  }, [dispatch, drone])

  const press = useLongPress({ onTap, onLongPress, ms: 500 })

  if (!drone) return null

  const health = droneHealth(drone)

  return (
    <button
      type="button"
      className={[
        'v4-fleet-card',
        `v4-fleet-card--${health}`,
        selected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={selected}
      aria-label={`${drone.id}, ${Math.round(drone.battery)} percent battery, ${commsLabel(drone.comms)} comms`}
      {...press}
    >
      <span className="v4-fleet-card__id mono">{drone.id}</span>
      <span className="v4-fleet-card__type">{TYPE_SHORT[drone.type] ?? drone.type.slice(0, 3)}</span>
      <span className="v4-fleet-card__batt" aria-hidden="true">
        <i style={{ width: `${Math.max(4, Math.min(100, drone.battery))}%` }} />
      </span>
      <span className="v4-fleet-card__pct mono">{Math.round(drone.battery)}%</span>
    </button>
  )
}

export function FleetStrip() {
  const open = useAppSelector((s) => s.ui.fleetStripOpen)
  const drones = useAppSelector((s) => s.fleet.drones)
  const selectedId = useAppSelector((s) => s.fleet.selectedDroneId)
  const selected = drones.find((d) => d.id === selectedId)

  if (!open) return null

  return (
    <div className="v4-fleet-strip" role="region" aria-label="Fleet" data-operator-ui>
      <ul className="v4-fleet-strip__list">
        {drones.map((drone) => (
          <li key={drone.id}>
            <FleetCard droneId={drone.id} selected={selectedId === drone.id} />
          </li>
        ))}
      </ul>
      {selected && (
        <p className="v4-fleet-strip__detail mono">
          <span>{Math.round(selected.battery)}%</span>
          <span>·</span>
          <span>{commsLabel(selected.comms)}</span>
          <span>·</span>
          <span>{selected.positioningMethod}</span>
          {selected.assignedTrackId && (
            <>
              <span>·</span>
              <span>→ {selected.assignedTrackId}</span>
            </>
          )}
        </p>
      )}
    </div>
  )
}
