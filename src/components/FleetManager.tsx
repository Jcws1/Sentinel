import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiRequest } from '../api/httpClient'
import type { SavedScenario } from '../api/scenarioTypes'
import type {
  SimBatchSpawnRequest,
  SimBatchSpawnResponse,
  SimPlatform,
  SimSnapshot,
  SimSpawnRequest,
} from '../api/simTypes'
import type {
  AssignmentPlan,
  OperationalMissionType,
  OperationalObjective,
} from '../types/missionPlanning'
import { useAppDispatch, useAppSelector } from '../store'
import { selectDrone } from '../store/fleetSlice'
import { droneHealth, healthLabel } from '../utils/health'

type GatewayStatus = {
  connected: boolean
  compatible: boolean
  configuredUrl: string
  protocolVersion: string | null
  error: string | null
}

type AddDraft = {
  idPrefix: string
  count: string
  platformId: string
  role: string
  groupId: string
  spacingM: string
  eastM: string
  northM: string
  upM: string
  yawDeg: string
}

const EMPTY_DRAFT: AddDraft = {
  idPrefix: '',
  count: '1',
  platformId: '',
  role: 'Scout',
  groupId: 'unassigned',
  spacingM: '6',
  eastM: '0',
  northM: '0',
  upM: '3',
  yawDeg: '0',
}

async function loadFleetResources() {
  const status = await apiRequest<GatewayStatus>('/api/v1/sim/status')
  if (!status.connected) {
    return {
      status,
      platforms: [] as SimPlatform[],
      snapshot: null as SimSnapshot | null,
      scenarios: [] as SavedScenario[],
    }
  }
  const [platforms, snapshot, scenarios] = await Promise.all([
    apiRequest<{ platforms: SimPlatform[] }>('/api/v1/sim/platforms'),
    apiRequest<SimSnapshot>('/api/v1/sim/state'),
    apiRequest<{ scenarios: SavedScenario[] }>('/api/v1/scenarios'),
  ])
  return {
    status,
    platforms: platforms.platforms,
    snapshot,
    scenarios: scenarios.scenarios,
  }
}

export function FleetManager() {
  const dispatch = useAppDispatch()
  const drones = useAppSelector((state) => state.fleet.drones)
  const selectedDroneId = useAppSelector((state) => state.fleet.selectedDroneId)
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [platforms, setPlatforms] = useState<SimPlatform[]>([])
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null)
  const [scenarios, setScenarios] = useState<SavedScenario[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<AddDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scenarioName, setScenarioName] = useState('Operational showcase')
  const [behaviorGroup, setBehaviorGroup] = useState('all')
  const [missionType, setMissionType] =
    useState<OperationalMissionType>('patrol_route')
  const [missionTarget, setMissionTarget] = useState<{
    lat: number
    lng: number
  } | null>(null)
  const [missionTargeting, setMissionTargeting] = useState(false)
  const [missionPlan, setMissionPlan] = useState<AssignmentPlan | null>(null)

  const refresh = async () => {
    try {
      const resources = await loadFleetResources()
      setStatus(resources.status)
      setPlatforms(resources.platforms)
      setSnapshot(resources.snapshot)
      setScenarios(resources.scenarios)
      setError(resources.status.error)
      if (!draft.platformId && resources.platforms[0]) {
        setDraft((value) => ({
          ...value,
          platformId: resources.platforms[0].platformId,
        }))
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to load simulator fleet',
      )
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(timer)
    // draft.platformId is intentionally initialized by the first refresh only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if ((!addOpen && !missionTargeting) || !snapshot) return
    const onMapPoint = (event: Event) => {
      const point = (event as CustomEvent<{ lat: number; lng: number }>).detail
      const radius = 6_378_137
      const latRad = (snapshot.origin.latDeg * Math.PI) / 180
      const eastM =
        ((point.lng - snapshot.origin.lngDeg) * Math.PI) /
        180 *
        radius *
        Math.cos(latRad)
      const northM =
        ((point.lat - snapshot.origin.latDeg) * Math.PI) / 180 * radius
      if (addOpen) {
        setDraft((value) => ({
          ...value,
          eastM: eastM.toFixed(1),
          northM: northM.toFixed(1),
        }))
      }
      if (missionTargeting) {
        setMissionTarget(point)
        setMissionTargeting(false)
      }
    }
    window.addEventListener('sentinel:map-point', onMapPoint)
    return () => window.removeEventListener('sentinel:map-point', onMapPoint)
  }, [addOpen, missionTargeting, snapshot])

  const counts = useMemo(() => {
    let ready = 0
    let active = 0
    let degraded = 0
    let isolated = 0
    for (const drone of drones) {
      const health = droneHealth(drone)
      if (drone.assignedTrackId) active += 1
      else if (health === 'nominal') ready += 1
      else degraded += 1
      if (drone.comms === 'lost') isolated += 1
    }
    return { ready, active, degraded, isolated }
  }, [drones])

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof drones>()
    for (const drone of drones) {
      const name = drone.groupId || 'Unassigned'
      groups.set(name, [...(groups.get(name) ?? []), drone])
    }
    return [...groups.entries()]
  }, [drones])

  const spawn = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body: SimBatchSpawnRequest = {
        idPrefix: draft.idPrefix,
        count: Number(draft.count),
        platformId: draft.platformId,
        role: draft.role,
        groupId: draft.groupId === 'unassigned' ? null : draft.groupId,
        spacingM: Number(draft.spacingM),
        pose: [
          Number(draft.eastM),
          Number(draft.northM),
          Number(draft.upM),
          0,
          0,
          (Number(draft.yawDeg) * Math.PI) / 180,
        ],
      }
      const result = await apiRequest<SimBatchSpawnResponse>(
        '/api/v1/sim/vehicles/batch',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )
      setAddOpen(false)
      setDraft((value) => ({ ...EMPTY_DRAFT, platformId: value.platformId }))
      await refresh()
      if (result.vehicles[0]) dispatch(selectDrone(result.vehicles[0].vehicleId))
    } catch (spawnError) {
      setError(spawnError instanceof Error ? spawnError.message : 'Spawn failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (vehicleId: string) => {
    setBusy(true)
    setError(null)
    try {
      await apiRequest(`/api/v1/sim/vehicles/${encodeURIComponent(vehicleId)}`, {
        method: 'DELETE',
      })
      if (selectedDroneId === vehicleId) dispatch(selectDrone(null))
      await refresh()
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : 'Removal failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const follow = async (vehicleId: string) => {
    try {
      await apiRequest('/api/v1/sim/camera', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'follow',
          targetVehicleId: vehicleId,
        }),
      })
    } catch (cameraError) {
      setError(
        cameraError instanceof Error ? cameraError.message : 'Camera command failed',
      )
    }
  }

  const toggleGnssDenial = async (vehicleId: string, active: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await apiRequest('/api/v1/sim/faults', {
        method: 'POST',
        body: JSON.stringify({
          faultId: `gnss-${vehicleId}`,
          vehicleId,
          kind: 'gnss_denied',
          active,
          parameters: { seed: 42 },
        }),
      })
      await refresh()
    } catch (faultError) {
      setError(
        faultError instanceof Error ? faultError.message : 'Fault command failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const setFleetBehavior = async (
    mode: 'hold' | 'line' | 'column' | 'wedge' | 'flocking',
  ) => {
    setBusy(true)
    setError(null)
    try {
      await apiRequest('/api/v1/sim/fleet/behaviors', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          ...(behaviorGroup === 'all' ? {} : { groupId: behaviorGroup }),
          spacingM: 8,
          missionVelocity:
            mode === 'hold' ? { eastMS: 0, northMS: 0 } : { eastMS: 1, northMS: 0 },
        }),
      })
    } catch (behaviorError) {
      setError(
        behaviorError instanceof Error
          ? behaviorError.message
          : 'Fleet behavior failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const setVehicleFailure = async (vehicleId: string, active: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await apiRequest('/api/v1/sim/faults', {
        method: 'POST',
        body: JSON.stringify({
          faultId: `failure-${vehicleId}`,
          vehicleId,
          kind: 'vehicle_failure',
          active,
          parameters: { mobilityScale: 0 },
        }),
      })
      await refresh()
    } catch (faultError) {
      setError(
        faultError instanceof Error ? faultError.message : 'Vehicle fault failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const saveScenario = async () => {
    if (!snapshot) return
    setBusy(true)
    setError(null)
    try {
      const vehicles: SimSpawnRequest[] = snapshot.vehicles
        .filter((vehicle) => vehicle.controlBackend === 'gazebo_velocity')
        .map((vehicle) => ({
          vehicleId: vehicle.vehicleId,
          platformId: vehicle.platformId,
          displayName: vehicle.displayName,
          role: vehicle.role,
          groupId: vehicle.groupId,
          pose: [
            vehicle.pose.eastM,
            vehicle.pose.northM,
            vehicle.pose.upM,
            vehicle.pose.rollRad,
            vehicle.pose.pitchRad,
            vehicle.pose.yawRad,
          ],
        }))
      await apiRequest('/api/v1/scenarios', {
        method: 'POST',
        body: JSON.stringify({
          name: scenarioName,
          origin: snapshot.origin,
          groups: grouped
            .filter(([name]) => name !== 'Unassigned')
            .map(([name], index) => ({
              id: name,
              name,
              color: ['#4c8bf5', '#31c48d', '#c4921a'][index % 3],
            })),
          vehicles,
          missions: [],
        }),
      })
      await refresh()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Scenario save failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const activateScenario = async (scenarioId: string) => {
    setBusy(true)
    setError(null)
    try {
      await apiRequest(`/api/v1/scenarios/${encodeURIComponent(scenarioId)}/activate`, {
        method: 'POST',
      })
      await refresh()
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : 'Scenario activation failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const optimizeMission = async () => {
    if (!snapshot) return
    setBusy(true)
    setError(null)
    try {
      const objective: OperationalObjective = {
        id: `objective-${Date.now()}`,
        name: missionType.replaceAll('_', ' '),
        type: missionType,
        priority: missionType === 'intercept_track' ? 95 : 60,
        targetPosition:
          missionType === 'hold' || missionType === 'return'
            ? undefined
            : {
                lat: missionTarget?.lat ?? snapshot.origin.latDeg,
                lng: missionTarget?.lng ?? snapshot.origin.lngDeg,
                alt: snapshot.origin.elevationM + 12,
              },
        requiredCapabilities: [],
        minVehicles: 1,
        maxVehicles: 1,
        batteryReservePercent: 25,
      }
      const plan = await apiRequest<AssignmentPlan>('/api/v1/missions/optimize', {
        method: 'POST',
        body: JSON.stringify({ objectives: [objective] }),
      })
      setMissionPlan(plan)
    } catch (missionError) {
      setError(
        missionError instanceof Error
          ? missionError.message
          : 'Mission optimization failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmMission = async () => {
    if (!missionPlan) return
    setBusy(true)
    setError(null)
    try {
      setMissionPlan(
        await apiRequest<AssignmentPlan>(
          `/api/v1/missions/plans/${encodeURIComponent(missionPlan.id)}/confirm`,
          { method: 'POST' },
        ),
      )
    } catch (missionError) {
      setError(
        missionError instanceof Error
          ? missionError.message
          : 'Mission confirmation failed',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="fleet-manager">
      <header className="fleet-manager__header">
        <div>
          <p className="panel__eyebrow">Simulator fleet</p>
          <h1>Fleet Manager</h1>
          <p className="fleet-manager__connection mono">
            <i className={status?.connected ? 'is-online' : 'is-offline'} />
            {status?.connected
              ? `LIVE · PROTOCOL ${status.protocolVersion}`
              : `OFFLINE · ${status?.configuredUrl ?? 'gateway unavailable'}`}
          </p>
        </div>
        <button
          type="button"
          className="fleet-manager__add"
          disabled={!status?.connected}
          onClick={() => setAddOpen(true)}
        >
          + ADD ASSET
        </button>
      </header>

      <div className="fleet-manager__summary" aria-label="Fleet status summary">
        <div><strong>{counts.ready}</strong><span>Ready</span></div>
        <div><strong>{counts.active}</strong><span>Active</span></div>
        <div><strong>{counts.degraded}</strong><span>Degraded</span></div>
        <div><strong>{counts.isolated}</strong><span>Isolated</span></div>
      </div>

      <section className="fleet-behavior">
        <div>
          <p className="panel__eyebrow">Collective autonomy</p>
          <strong>Formation / neighbour consensus</strong>
        </div>
        <select
          aria-label="Behavior group"
          value={behaviorGroup}
          onChange={(event) => setBehaviorGroup(event.target.value)}
        >
          <option value="all">All eligible assets</option>
          {grouped
            .filter(([name]) => name !== 'Unassigned')
            .map(([name]) => <option key={name}>{name}</option>)}
        </select>
        <div className="fleet-behavior__buttons">
          {(['line', 'column', 'wedge', 'flocking', 'hold'] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              disabled={busy || !status?.connected}
              onClick={() => void setFleetBehavior(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      <section className="fleet-mission">
        <div>
          <p className="panel__eyebrow">Operational mission</p>
          <strong>Deterministic capability / distance assignment</strong>
        </div>
        <select
          aria-label="Mission type"
          value={missionType}
          onChange={(event) => {
            setMissionType(event.target.value as OperationalMissionType)
            setMissionPlan(null)
          }}
        >
          {[
            'patrol_route',
            'recon_area',
            'relay_position',
            'intercept_track',
            'escort_group',
            'hold',
            'return',
          ].map((type) => (
            <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={missionType === 'hold' || missionType === 'return'}
          className={missionTargeting ? 'is-targeting' : ''}
          onClick={() => setMissionTargeting(true)}
        >
          {missionTarget
            ? `${missionTarget.lat.toFixed(4)}, ${missionTarget.lng.toFixed(4)}`
            : missionTargeting
              ? 'TAP MAP NOW'
              : 'PICK MAP TARGET'}
        </button>
        <button
          type="button"
          disabled={busy || !status?.connected}
          onClick={() => void optimizeMission()}
        >
          OPTIMIZE + DISPATCH
        </button>
        {missionPlan && (
          <div className="fleet-mission__plan">
            <span className="mono">{missionPlan.status}</span>
            <strong>{missionPlan.summary}</strong>
            {missionPlan.assignments.map((assignment) => (
              <small key={`${assignment.objectiveId}:${assignment.vehicleId}`}>
                {assignment.vehicleId} · cost {assignment.cost} ·{' '}
                {assignment.reasons.join(' / ')}
              </small>
            ))}
            {missionPlan.status === 'PROPOSED' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmMission()}
              >
                OPERATOR CONFIRM
              </button>
            )}
          </div>
        )}
      </section>

      {error && <p className="fleet-manager__error">{error}</p>}

      <div className="fleet-manager__groups">
        {grouped.map(([groupName, vehicles]) => (
          <section className="fleet-group" key={groupName}>
            <header>
              <h2>{groupName}</h2>
              <span className="mono">{vehicles.length}</span>
            </header>
            <ul>
              {vehicles.map((drone) => {
                const health = droneHealth(drone)
                const selected = selectedDroneId === drone.id
                const gnssDenied = snapshot?.faults.some(
                  (fault) =>
                    fault.vehicleId === drone.id &&
                    fault.kind === 'gnss_denied' &&
                    fault.active,
                )
                return (
                  <li key={drone.id} className={selected ? 'is-selected' : ''}>
                    <button
                      type="button"
                      className="fleet-group__select"
                      onClick={() => {
                        dispatch(selectDrone(drone.id))
                        void follow(drone.id)
                      }}
                      aria-pressed={selected}
                      title={`Control ${drone.displayName || drone.id} and follow it in Gazebo`}
                    >
                      <span className={`fleet-group__glyph is-${health}`}>✦</span>
                      <span>
                        <strong>{drone.displayName || drone.id}</strong>
                        <small className="mono">
                          {drone.platformId || drone.type} ·{' '}
                          {drone.lifecycle || 'READY'}
                        </small>
                      </span>
                      <span className="fleet-group__health">
                        <i className={`is-${health}`} />
                        {healthLabel(health)}
                      </span>
                      <span className="mono">{Math.round(drone.battery)}%</span>
                    </button>
                    {selected && (
                      <div className="fleet-group__actions">
                        <button type="button" onClick={() => void follow(drone.id)}>
                          RE-CENTRE IN GAZEBO
                        </button>
                        {drone.controlBackend === 'px4_sitl' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void toggleGnssDenial(drone.id, !gnssDenied)
                            }
                          >
                            {gnssDenied ? 'RESTORE GNSS' : 'DENY GNSS'}
                          </button>
                        )}
                        {drone.controlBackend !== 'px4_sitl' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setVehicleFailure(drone.id, true)}
                            >
                              FAIL RESPONSE
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setVehicleFailure(drone.id, false)}
                            >
                              RECOVER
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={busy || drone.controlBackend === 'px4_sitl'}
                          onClick={() => void remove(drone.id)}
                        >
                          REMOVE
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <footer className="fleet-manager__save">
        <label>
          <span>Scenario name</span>
          <input
            value={scenarioName}
            onChange={(event) => setScenarioName(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!snapshot || busy}
          onClick={() => void saveScenario()}
        >
          SAVE SCENARIO
        </button>
        <select
          aria-label="Saved scenario"
          defaultValue=""
          disabled={busy || scenarios.length === 0}
          onChange={(event) => {
            if (event.target.value) void activateScenario(event.target.value)
          }}
        >
          <option value="" disabled>{scenarios.length} SAVED</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.active ? '● ' : ''}{scenario.name}
            </option>
          ))}
        </select>
      </footer>

      {addOpen && (
        <div className="fleet-add-overlay" role="dialog" aria-modal="true">
          <form className="fleet-add-drawer" onSubmit={spawn}>
            <header>
              <div>
                <p className="panel__eyebrow">Runtime creation</p>
                <h2>Add fleet assets</h2>
              </div>
              <button type="button" onClick={() => setAddOpen(false)}>×</button>
            </header>
            <label>
              <span>{Number(draft.count) > 1 ? 'ID prefix' : 'Vehicle ID'}</span>
              <input
                required
                pattern="[A-Za-z][A-Za-z0-9_-]{1,47}"
                value={draft.idPrefix}
                onChange={(event) =>
                  setDraft({ ...draft, idPrefix: event.target.value })
                }
                placeholder={Number(draft.count) > 1 ? 'scout' : 'scout_02'}
              />
              {Number(draft.count) > 1 && (
                <small className="mono">
                  Creates {draft.idPrefix || 'scout'}_01 through{' '}
                  {draft.idPrefix || 'scout'}_
                  {String(Number(draft.count) || 1).padStart(2, '0')}
                </small>
              )}
            </label>
            <div className="fleet-add-drawer__row">
              <label>
                <span>Quantity</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="32"
                  step="1"
                  value={draft.count}
                  onChange={(event) =>
                    setDraft({ ...draft, count: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Spacing metres</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={draft.spacingM}
                  onChange={(event) =>
                    setDraft({ ...draft, spacingM: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              <span>Platform</span>
              <select
                required
                value={draft.platformId}
                onChange={(event) =>
                  setDraft({ ...draft, platformId: event.target.value })
                }
              >
                {platforms.map((platform) => (
                  <option key={platform.platformId} value={platform.platformId}>
                    {platform.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="fleet-add-drawer__row">
              <label>
                <span>Role</span>
                <select
                  value={draft.role}
                  onChange={(event) =>
                    setDraft({ ...draft, role: event.target.value })
                  }
                >
                  {['Interceptor', 'Scout', 'Relay', 'Escort', 'Observer', 'Target'].map(
                    (role) => <option key={role}>{role}</option>,
                  )}
                </select>
              </label>
              <label>
                <span>Group</span>
                <input
                  value={draft.groupId}
                  onChange={(event) =>
                    setDraft({ ...draft, groupId: event.target.value })
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>Spawn pose · local ENU metres</legend>
              <div className="fleet-add-drawer__pose">
                {[
                  ['East', 'eastM'],
                  ['North', 'northM'],
                  ['Up', 'upM'],
                  ['Heading°', 'yawDeg'],
                ].map(([label, key]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      required
                      type="number"
                      step="0.1"
                      value={draft[key as keyof AddDraft]}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: event.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <p>
                Tap an empty point on the map to fill East/North from the shared
                geodetic origin, or use numeric entry for precise staging.
              </p>
            </fieldset>
            <button type="submit" disabled={busy || !draft.platformId}>
              {busy
                ? 'SPAWNING…'
                : `SPAWN ${Number(draft.count) || 1} IN GAZEBO`}
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
