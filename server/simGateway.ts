import WebSocket from 'ws'
import type {
  SimBatchSpawnRequest,
  SimCommand,
  SimCommandAck,
  SimEvent,
  SimFault,
  SimFleetBehaviorRequest,
  SimFleetWaypointRequest,
  SimFleetWaypointResponse,
  SimHandshake,
  SimPlatform,
  SimSnapshot,
  SimSpawnRequest,
  SimVehicle,
} from '../src/api/simTypes'
import { buildBatchSpawnRequests } from './fleetBatch'
import type { C2State } from './state'
import type { Drone, DroneType, Position } from '../src/types'

export type SimGatewayStatus = {
  configuredUrl: string
  connected: boolean
  compatible: boolean
  protocolVersion: string | null
  scenarioId: string | null
  lastEventAt: string | null
  error: string | null
}

const SUPPORTED_MAJOR = '1'

function enuToWgs84(
  eastM: number,
  northM: number,
  upM: number,
  origin: SimHandshake['origin'],
): Position {
  const latRad = (origin.latDeg * Math.PI) / 180
  const sinLat = Math.sin(latRad)
  const eccentricitySquared = 6.69437999014e-3
  const radius = 6_378_137
  const primeVertical =
    radius / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat)
  const meridional =
    (radius * (1 - eccentricitySquared)) /
    Math.pow(1 - eccentricitySquared * sinLat * sinLat, 1.5)
  return {
    lat: origin.latDeg + (northM / meridional) * (180 / Math.PI),
    lng:
      origin.lngDeg +
      (eastM / (primeVertical * Math.cos(latRad))) * (180 / Math.PI),
    alt: origin.elevationM + upM,
  }
}

function inferType(vehicle: SimVehicle): DroneType {
  const value = `${vehicle.role} ${vehicle.platformId}`.toLowerCase()
  if (value.includes('relay')) return 'Relay'
  if (value.includes('scout') || value.includes('isr') || value.includes('recon')) {
    return 'Scout'
  }
  return 'Interceptor'
}

export function syncGatewayFleet(
  c2State: C2State,
  snapshot: SimSnapshot,
  handshake: SimHandshake,
): void {
  const existing = new Map(c2State.drones.map((drone) => [drone.id, drone]))
  const deniedFaults = snapshot.faults.filter(
    (fault) => fault.kind === 'gnss_denied' && fault.active,
  )
  const deniedVehicles = new Set(
    deniedFaults
      .map((fault) => fault.vehicleId)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId)),
  )
  c2State.mission.gnss = deniedFaults.length > 0 ? 'denied' : 'active'
  c2State.mission.fallbackPositioning =
    deniedFaults.length > 0 ? 'Simulated VIO + Mesh' : null
  c2State.mission.protectedAsset = {
    lng: handshake.origin.lngDeg,
    lat: handshake.origin.latDeg,
    alt: handshake.origin.elevationM,
  }
  c2State.drones = snapshot.vehicles
    .filter((vehicle) => vehicle.lifecycle !== 'REMOVED')
    .map((vehicle): Drone => {
      const prior = existing.get(vehicle.vehicleId)
      const isPx4 = vehicle.controlBackend === 'px4_sitl'
      const denied = deniedVehicles.has(vehicle.vehicleId)
      const fault = deniedFaults.find(
        (item) => item.vehicleId === vehicle.vehicleId,
      )
      const deniedAgeSeconds = fault
        ? Math.max(0, (Date.now() - Date.parse(fault.updatedAt)) / 1000)
        : 0
      const uncertaintyM = denied
        ? 0.08 + 0.015 * Math.sqrt(deniedAgeSeconds)
        : isPx4
          ? 1.2
          : 0.5
      return {
        id: vehicle.vehicleId,
        type: inferType(vehicle),
        platformId: vehicle.platformId,
        displayName: vehicle.displayName,
        groupId: vehicle.groupId,
        lifecycle:
          vehicle.lifecycle === 'REMOVED' ? undefined : vehicle.lifecycle,
        controlBackend: vehicle.controlBackend,
        navigationSource: denied
          ? 'SIMULATED_VIO'
          : isPx4
            ? 'GNSS'
            : 'MESH',
        positionUncertaintyM: uncertaintyM,
        battery: prior?.battery ?? 100,
        position: enuToWgs84(
          vehicle.pose.eastM,
          vehicle.pose.northM,
          vehicle.pose.upM,
          handshake.origin,
        ),
        positioningMethod: denied ? 'VIO' : isPx4 ? 'GNSS' : 'Mesh',
        positioningConfidence: denied
          ? Math.max(20, Math.round(99 - uncertaintyM * 4))
          : prior?.positioningConfidence ?? (isPx4 ? 96 : 90),
        comms: prior?.comms ?? 'strong',
        payloadStatus: prior?.payloadStatus ?? 'Ready',
        assignedTrackId: prior?.assignedTrackId ?? null,
        meshLinks: prior?.meshLinks ?? [],
      }
    })
}

export class SimGatewayClient {
  private readonly baseUrl: string
  private socket: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private stopped = true
  private handshakeValue: SimHandshake | null = null
  private snapshotValue: SimSnapshot | null = null
  private platformsValue: SimPlatform[] = []
  private readonly statusValue: SimGatewayStatus

  constructor(
    baseUrl = process.env.SIM_GATEWAY_URL?.trim() || 'http://127.0.0.1:8080',
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.statusValue = {
      configuredUrl: this.baseUrl,
      connected: false,
      compatible: false,
      protocolVersion: null,
      scenarioId: null,
      lastEventAt: null,
      error: null,
    }
  }

  get status(): SimGatewayStatus {
    return { ...this.statusValue }
  }

  get handshake(): SimHandshake | null {
    return this.handshakeValue
  }

  get snapshot(): SimSnapshot | null {
    return this.snapshotValue
  }

  get platforms(): SimPlatform[] {
    return [...this.platformsValue]
  }

  async start(onEvent: (event: SimEvent) => void): Promise<void> {
    this.stopped = false
    try {
      await this.refresh()
      this.connectEvents(onEvent)
    } catch (error) {
      this.recordError(error)
      this.scheduleReconnect(onEvent)
    }
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    this.statusValue.connected = false
  }

  async refresh(): Promise<SimSnapshot> {
    const [handshake, platformResponse, snapshot] = await Promise.all([
      this.request<SimHandshake>('/v1/handshake'),
      this.request<{ platforms: SimPlatform[] }>('/v1/platforms'),
      this.request<SimSnapshot>('/v1/state'),
    ])
    const compatible =
      handshake.protocol === 'sentinel-sim' &&
      handshake.version.split('.')[0] === SUPPORTED_MAJOR
    this.handshakeValue = handshake
    this.platformsValue = platformResponse.platforms
    this.snapshotValue = snapshot
    this.statusValue.compatible = compatible
    this.statusValue.protocolVersion = handshake.version
    this.statusValue.scenarioId = handshake.scenarioId
    this.statusValue.error = compatible
      ? null
      : `Unsupported simulator protocol ${handshake.version}`
    if (!compatible) throw new Error(this.statusValue.error)
    return snapshot
  }

  spawn(body: SimSpawnRequest): Promise<SimVehicle> {
    return this.request('/v1/vehicles', { method: 'POST', body })
  }

  async spawnBatch(body: SimBatchSpawnRequest): Promise<SimVehicle[]> {
    const requests = buildBatchSpawnRequests(body)
    const existing = new Set(
      this.snapshotValue?.vehicles.map((vehicle) => vehicle.vehicleId) ?? [],
    )
    const duplicate = requests.find((request) => existing.has(request.vehicleId))
    if (duplicate) throw new Error(`Vehicle ${duplicate.vehicleId} already exists`)
    const maximum = this.handshakeValue?.limits.maxVehicles ?? 32
    const current = this.snapshotValue?.vehicles.length ?? 0
    if (requests.length > maximum - current) {
      throw new Error(
        `Fleet capacity exceeded: ${maximum - current} of ${maximum} slots remain`,
      )
    }

    const created: SimVehicle[] = []
    try {
      for (const request of requests) created.push(await this.spawn(request))
      return created
    } catch (error) {
      await Promise.allSettled(
        [...created]
          .reverse()
          .map((vehicle) => this.remove(vehicle.vehicleId)),
      )
      throw error
    }
  }

  remove(vehicleId: string): Promise<SimVehicle> {
    return this.request(`/v1/vehicles/${encodeURIComponent(vehicleId)}`, {
      method: 'DELETE',
    })
  }

  command(body: SimCommand): Promise<SimCommandAck> {
    return this.request('/v1/commands', { method: 'POST', body })
  }

  injectFault(
    body: Omit<SimFault, 'updatedAt'>,
  ): Promise<SimFault> {
    return this.request('/v1/faults', { method: 'POST', body })
  }

  camera(body: {
    mode: 'free' | 'follow' | 'group-follow'
    targetVehicleId?: string
  }): Promise<Record<string, unknown>> {
    return this.request('/v1/camera', { method: 'POST', body })
  }

  fleetBehavior(body: SimFleetBehaviorRequest): Promise<Record<string, unknown>> {
    return this.request('/v1/fleet/behaviors', { method: 'POST', body })
  }

  fleetWaypoint(body: SimFleetWaypointRequest): Promise<SimFleetWaypointResponse> {
    return this.request('/v1/fleet/waypoint', { method: 'POST', body })
  }

  private connectEvents(onEvent: (event: SimEvent) => void): void {
    if (this.stopped) return
    const url = new URL('/v1/events', this.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    this.socket = new WebSocket(url)
    this.socket.on('open', () => {
      this.statusValue.connected = true
      this.statusValue.error = null
    })
    this.socket.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString()) as SimEvent
        this.statusValue.lastEventAt = event.timestamp
        this.applyEvent(event)
        onEvent(event)
      } catch (error) {
        this.recordError(error)
      }
    })
    this.socket.on('error', (error) => this.recordError(error))
    this.socket.on('close', () => {
      this.statusValue.connected = false
      this.socket = null
      this.scheduleReconnect(onEvent)
    })
  }

  private applyEvent(event: SimEvent): void {
    if (event.type === 'state.snapshot') {
      this.snapshotValue = event.data as SimSnapshot
      return
    }
    if (!this.snapshotValue) return
    if (event.type === 'telemetry.frame' || event.type === 'vehicle.lifecycle') {
      const vehicle = event.data as SimVehicle
      const index = this.snapshotValue.vehicles.findIndex(
        (item) => item.vehicleId === vehicle.vehicleId,
      )
      if (vehicle.lifecycle === 'REMOVED') {
        if (index >= 0) this.snapshotValue.vehicles.splice(index, 1)
      } else if (index >= 0) {
        this.snapshotValue.vehicles[index] = vehicle
      } else {
        this.snapshotValue.vehicles.push(vehicle)
      }
      return
    }
    if (event.type === 'fault.updated') {
      const fault = event.data as SimFault
      const index = this.snapshotValue.faults.findIndex(
        (item) => item.faultId === fault.faultId,
      )
      if (index >= 0) this.snapshotValue.faults[index] = fault
      else this.snapshotValue.faults.push(fault)
    }
  }

  private scheduleReconnect(onEvent: (event: SimEvent) => void): void {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.refresh()
        this.connectEvents(onEvent)
      } catch (error) {
        this.recordError(error)
        this.scheduleReconnect(onEvent)
      }
    }, 1500)
  }

  private recordError(error: unknown): void {
    this.statusValue.connected = false
    this.statusValue.error =
      error instanceof Error ? error.message : 'Simulator gateway unavailable'
  }

  private async request<T>(
    path: string,
    options?: {
      method?: 'POST' | 'DELETE'
      body?: unknown
    },
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options?.method,
      headers: options?.body ? { 'content-type': 'application/json' } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      throw new Error(body?.error ?? `Simulator gateway returned ${response.status}`)
    }
    return (await response.json()) as T
  }
}
