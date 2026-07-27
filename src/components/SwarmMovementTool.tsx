import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../api/httpClient'
import type {
  SimFleetBehaviorRequest,
  SimFleetWaypointRequest,
  SimFleetWaypointResponse,
  SimSnapshot,
} from '../api/simTypes'
import { useAppSelector } from '../store'

type MapPoint = { lat: number; lng: number }

function toEnu(point: MapPoint, origin: SimSnapshot['origin']) {
  const radius = 6_378_137
  return {
    eastM:
      ((point.lng - origin.lngDeg) * Math.PI) /
      180 *
      radius *
      Math.cos((origin.latDeg * Math.PI) / 180),
    northM: ((point.lat - origin.latDeg) * Math.PI) / 180 * radius,
  }
}

export function SwarmMovementTool() {
  const drones = useAppSelector((state) => state.fleet.drones)
  const eligible = useMemo(
    () => drones.filter((drone) => drone.controlBackend === 'gazebo_velocity'),
    [drones],
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formation, setFormation] =
    useState<SimFleetWaypointRequest['formation']>('flocking')
  const [speedMS, setSpeedMS] = useState(2.5)
  const [spacingM, setSpacingM] = useState(8)
  const [clearanceM, setClearanceM] = useState(12)
  const [waypoint, setWaypoint] = useState<MapPoint | null>(null)
  const [awaitingMap, setAwaitingMap] = useState(false)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState(
    'Select aircraft, then place one destination on the map.',
  )

  useEffect(() => {
    setSelected((current) => {
      const valid = new Set(
        [...current].filter((id) => eligible.some((drone) => drone.id === id)),
      )
      return valid.size ? valid : new Set(eligible.map((drone) => drone.id))
    })
  }, [eligible])

  useEffect(() => {
    const onMapPoint = (event: Event) => {
      if (!awaitingMap) return
      const point = (event as CustomEvent<MapPoint>).detail
      setWaypoint(point)
      setAwaitingMap(false)
      setMessage(
        `Waypoint set at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}.`,
      )
    }
    window.addEventListener('sentinel:map-point', onMapPoint)
    return () => window.removeEventListener('sentinel:map-point', onMapPoint)
  }, [awaitingMap])

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const dispatch = async () => {
    if (!waypoint || selected.size === 0) return
    setBusy(true)
    try {
      const snapshot = await apiRequest<SimSnapshot>('/api/v1/sim/state')
      const result = await apiRequest<SimFleetWaypointResponse>(
        '/api/v1/sim/fleet/waypoint',
        {
          method: 'POST',
          body: JSON.stringify({
            vehicleIds: [...selected],
            formation,
            targetPose: toEnu(waypoint, snapshot.origin),
            spacingM,
            maxSpeedMS: speedMS,
            minimumTerrainClearanceM: clearanceM,
          } satisfies SimFleetWaypointRequest),
        },
      )
      setActive(true)
      setMessage(
        `${result.vehicleIds.length} aircraft en route via ${result.routeWaypoints.length} map-planned leg${result.routeWaypoints.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      setActive(false)
      setMessage(error instanceof Error ? error.message : 'Swarm task failed')
    } finally {
      setBusy(false)
    }
  }

  const hold = async () => {
    if (!selected.size) return
    setBusy(true)
    try {
      await apiRequest('/api/v1/sim/fleet/behaviors', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'hold',
          vehicleIds: [...selected],
        } satisfies SimFleetBehaviorRequest),
      })
      setActive(false)
      setMessage(`${selected.size} selected aircraft holding position.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Hold failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="swarm-movement-tool" aria-label="Swarm waypoint movement">
      <header>
        <div>
          <p className="panel__eyebrow">Live autonomous tasking</p>
          <h3>Swarm movement</h3>
          <p>
            Explicit selection, map waypoint, Hungarian slot assignment and
            neighbour separation using live Gazebo odometry.
          </p>
        </div>
        <span className={active ? 'is-active' : ''}>
          {active ? 'EN ROUTE' : 'HELD'}
        </span>
      </header>

      <div className="swarm-movement-tool__selector">
        <div className="swarm-movement-tool__selector-head">
          <strong>Aircraft ({selected.size}/{eligible.length})</strong>
          <button
            type="button"
            onClick={() =>
              setSelected(
                selected.size === eligible.length
                  ? new Set()
                  : new Set(eligible.map((drone) => drone.id)),
              )
            }
          >
            {selected.size === eligible.length ? 'CLEAR' : 'SELECT ALL'}
          </button>
        </div>
        <div className="swarm-movement-tool__aircraft">
          {eligible.map((drone) => (
            <label key={drone.id}>
              <input
                type="checkbox"
                checked={selected.has(drone.id)}
                onChange={() => toggle(drone.id)}
              />
              <span>{drone.displayName ?? drone.id}</span>
              <small>{drone.platformId ?? drone.type}</small>
            </label>
          ))}
        </div>
      </div>

      <div className="swarm-movement-tool__settings">
        <label>
          <span>Movement law</span>
          <select
            value={formation}
            onChange={(event) =>
              setFormation(event.target.value as typeof formation)
            }
          >
            <option value="flocking">Neighbour-average flocking</option>
            <option value="line">Line formation</option>
            <option value="column">Column formation</option>
            <option value="wedge">Wedge formation</option>
          </select>
        </label>
        <label>
          <span>Speed m/s</span>
          <input type="number" min="0.5" max="6" step="0.5" value={speedMS}
            onChange={(event) => setSpeedMS(Number(event.target.value))} />
        </label>
        <label>
          <span>Spacing m</span>
          <input type="number" min="2" max="100" value={spacingM}
            onChange={(event) => setSpacingM(Number(event.target.value))} />
        </label>
        <label>
          <span>Terrain clearance m</span>
          <input type="number" min="3" max="120" value={clearanceM}
            onChange={(event) => setClearanceM(Number(event.target.value))} />
        </label>
      </div>

      <div className="swarm-movement-tool__waypoint">
        <button
          type="button"
          className={awaitingMap ? 'is-selected' : ''}
          onClick={() => {
            setAwaitingMap(true)
            setMessage('Click the desired destination on the map.')
          }}
        >
          {awaitingMap ? 'CLICK MAP NOW' : waypoint ? 'CHANGE WAYPOINT' : 'PLACE WAYPOINT'}
        </button>
        <span className="mono">
          {waypoint
            ? `${waypoint.lat.toFixed(5)}, ${waypoint.lng.toFixed(5)}`
            : 'No waypoint selected'}
        </span>
      </div>

      <div className="swarm-movement-tool__execute">
        <button type="button" disabled={busy || !waypoint || !selected.size} onClick={dispatch}>
          {busy ? 'TRANSMITTING…' : `DISPATCH ${selected.size} AIRCRAFT`}
        </button>
        <button type="button" disabled={busy || !selected.size} onClick={hold}>
          HOLD
        </button>
        <p className="mono">{message}</p>
        <small>
          Avoidance uses the offline terrain/building model and inter-aircraft
          odometry. RGB cameras are not represented as obstacle sensors.
        </small>
      </div>
    </section>
  )
}
