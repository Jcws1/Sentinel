import { randomUUID } from 'node:crypto'
import type {
  CreateSensorRequest,
  EdgeSensor,
  ObservationBatch,
  PublishAck,
  SensorType,
  SourceHealth,
} from '../contracts/edgeTypes'
import type { SimVehicle } from '../src/api/simTypes'
import { SimGatewayClient } from '../server/simGateway'
import { simulateObservation } from './models'

const SENSOR_TYPES: SensorType[] = [
  {
    sensorTypeId: 'sim-radar-short-range-v1',
    displayName: 'Simulated short-range 3D radar',
    modality: 'radar',
    measurementKinds: [
      'range',
      'bearing',
      'elevation',
      'radial_velocity',
    ],
    defaults: {
      maxRangeM: 2_500,
      horizontalFovDeg: 120,
      verticalFovDeg: 60,
      updateRateHz: 2,
    },
    evidenceStatus: 'notional',
  },
  {
    sensorTypeId: 'sim-eo-tracker-v1',
    displayName: 'Simulated EO tracker',
    modality: 'eo',
    measurementKinds: ['bearing', 'elevation', 'classification', 'image_reference'],
    defaults: {
      maxRangeM: 1_800,
      horizontalFovDeg: 70,
      verticalFovDeg: 45,
      updateRateHz: 2,
    },
    evidenceStatus: 'notional',
  },
  {
    sensorTypeId: 'sim-ir-tracker-v1',
    displayName: 'Simulated thermal tracker',
    modality: 'ir',
    measurementKinds: ['bearing', 'elevation', 'classification', 'image_reference'],
    defaults: {
      maxRangeM: 1_400,
      horizontalFovDeg: 55,
      verticalFovDeg: 40,
      updateRateHz: 2,
    },
    evidenceStatus: 'notional',
  },
  {
    sensorTypeId: 'sim-acoustic-array-v1',
    displayName: 'Simulated acoustic array',
    modality: 'acoustic',
    measurementKinds: ['bearing', 'classification'],
    defaults: {
      maxRangeM: 600,
      horizontalFovDeg: 360,
      verticalFovDeg: 180,
      updateRateHz: 1,
    },
    evidenceStatus: 'notional',
  },
  {
    sensorTypeId: 'sim-rf-direction-finder-v1',
    displayName: 'Simulated RF direction finder',
    modality: 'rf',
    measurementKinds: ['bearing', 'emitter'],
    defaults: {
      maxRangeM: 3_500,
      horizontalFovDeg: 360,
      verticalFovDeg: 180,
      updateRateHz: 1,
    },
    evidenceStatus: 'notional',
  },
]

export interface SensorSimulatorOptions {
  edgeGatewayUrl: string
  gazeboGatewayUrl: string
  producerToken: string
  scenarioSeed: string
  bootstrapSensors?: boolean
}

export class SensorSimulator {
  readonly sourceId = 'sentinel-sensor-sim'
  readonly instanceId = randomUUID()
  readonly startedAt = new Date().toISOString()
  private readonly sensors = new Map<string, EdgeSensor>()
  private readonly commandResults = new Map<string, EdgeSensor>()
  private readonly sequences = new Map<string, number>()
  private readonly lastProducedAt = new Map<string, number>()
  private readonly gazebo: SimGatewayClient
  private timer: NodeJS.Timeout | null = null
  private healthSequence = 0
  private lastHealthAt = 0
  private stopped = true
  private readonly options: SensorSimulatorOptions

  constructor(options: SensorSimulatorOptions) {
    this.options = options
    this.gazebo = new SimGatewayClient(options.gazeboGatewayUrl)
    if (options.bootstrapSensors !== false) this.addBootstrapSensors()
  }

  get sensorTypes(): SensorType[] {
    return structuredClone(SENSOR_TYPES)
  }

  listSensors(): EdgeSensor[] {
    return [...this.sensors.values()].map((sensor) => structuredClone(sensor))
  }

  createSensor(request: CreateSensorRequest): EdgeSensor {
    const priorCommand = this.commandResults.get(request.commandId)
    if (priorCommand) return structuredClone(priorCommand)
    if (!request.commandId?.trim()) throw new Error('commandId is required')
    if (this.sensors.has(request.sensorId)) {
      throw new Error(`sensor ${request.sensorId} already exists`)
    }
    const type = SENSOR_TYPES.find(
      (item) => item.sensorTypeId === request.sensorTypeId,
    )
    if (!type) throw new Error(`unknown sensor type ${request.sensorTypeId}`)
    const now = new Date().toISOString()
    const sensor: EdgeSensor = {
      sensorId: request.sensorId,
      sourceId: this.sourceId,
      sensorTypeId: type.sensorTypeId,
      displayName: request.displayName?.trim() || type.displayName,
      modality: type.modality,
      lifecycle: 'ACTIVE',
      pose: structuredClone(request.pose),
      configuration: {
        ...type.defaults,
        packetLossRate: 0,
        latencyMs: 80,
        noiseStdDevM: type.modality === 'radar' ? 2 : 0,
        ...request.configuration,
      },
      configurationRevision: 1,
      visualState: 'PENDING',
      updatedAt: now,
    }
    this.validateSensor(sensor)
    this.sensors.set(sensor.sensorId, sensor)
    this.commandResults.set(request.commandId, structuredClone(sensor))
    return structuredClone(sensor)
  }

  updateSensor(
    sensorId: string,
    patch: Partial<Pick<EdgeSensor, 'displayName' | 'pose' | 'configuration' | 'lifecycle'>>,
  ): EdgeSensor {
    const sensor = this.sensors.get(sensorId)
    if (!sensor) throw new Error(`sensor ${sensorId} not found`)
    const next: EdgeSensor = {
      ...sensor,
      displayName: patch.displayName ?? sensor.displayName,
      pose: patch.pose ? { ...sensor.pose, ...patch.pose } : sensor.pose,
      configuration: patch.configuration
        ? { ...sensor.configuration, ...patch.configuration }
        : sensor.configuration,
      lifecycle: patch.lifecycle ?? sensor.lifecycle,
      configurationRevision: sensor.configurationRevision + 1,
      updatedAt: new Date().toISOString(),
    }
    this.validateSensor(next)
    this.sensors.set(sensorId, next)
    return structuredClone(next)
  }

  async createAndSyncSensor(
    request: CreateSensorRequest,
  ): Promise<EdgeSensor> {
    const sensor = this.createSensor(request)
    await this.syncVisual(sensor.sensorId)
    const synchronized = this.sensors.get(sensor.sensorId) ?? sensor
    this.commandResults.set(request.commandId, structuredClone(synchronized))
    return structuredClone(synchronized)
  }

  async updateAndSyncSensor(
    sensorId: string,
    patch: Partial<Pick<EdgeSensor, 'displayName' | 'pose' | 'configuration' | 'lifecycle'>>,
  ): Promise<EdgeSensor> {
    this.updateSensor(sensorId, patch)
    await this.syncVisual(sensorId)
    const sensor = this.sensors.get(sensorId)
    if (!sensor) throw new Error(`sensor ${sensorId} not found`)
    return structuredClone(sensor)
  }

  removeSensor(sensorId: string): EdgeSensor {
    const sensor = this.sensors.get(sensorId)
    if (!sensor) throw new Error(`sensor ${sensorId} not found`)
    const removed: EdgeSensor = {
      ...sensor,
      lifecycle: 'REMOVED',
      configurationRevision: sensor.configurationRevision + 1,
      updatedAt: new Date().toISOString(),
    }
    this.sensors.delete(sensorId)
    return removed
  }

  async removeAndSyncSensor(sensorId: string): Promise<EdgeSensor> {
    const sensor = this.sensors.get(sensorId)
    if (!sensor) throw new Error(`sensor ${sensorId} not found`)
    let visualError: string | undefined
    try {
      const response = await fetch(
        new URL(
          `/v1/visual-sensors/${encodeURIComponent(sensorId)}`,
          this.options.gazeboGatewayUrl,
        ),
        {
          method: 'DELETE',
          signal: AbortSignal.timeout(5_000),
        },
      )
      if (!response.ok && response.status !== 404) {
        throw new Error(`Gazebo visual removal returned ${response.status}`)
      }
    } catch (error) {
      visualError =
        error instanceof Error ? error.message : 'Gazebo visual removal failed'
    }
    const removed = this.removeSensor(sensorId)
    return {
      ...removed,
      visualState: visualError ? 'UNAVAILABLE' : 'ACTIVE',
      visualError,
    }
  }

  async start(): Promise<void> {
    if (!this.stopped) return
    this.stopped = false
    await this.register().catch(() => undefined)
    await this.gazebo.start(() => undefined)
    await Promise.allSettled(
      [...this.sensors].map(([sensorId]) => this.syncVisual(sensorId)),
    )
    this.timer = setInterval(() => void this.tick(), 100)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.gazebo.stop()
  }

  async tick(now = new Date()): Promise<PublishAck | null> {
    if (this.stopped) return null
    const snapshot = this.gazebo.snapshot
    if (!snapshot) {
      await this.publishPeriodicHealth(now, 'DEGRADED', {
        truthFeed: 'unavailable',
      })
      return null
    }
    await this.publishPeriodicHealth(now, 'HEALTHY', {
      truthFeed: 'connected',
      sensors: this.sensors.size,
      vehicles: snapshot.vehicles.length,
    })
    const observations = []
    for (const sensor of this.sensors.values()) {
      const intervalMs = 1_000 / sensor.configuration.updateRateHz
      const last = this.lastProducedAt.get(sensor.sensorId) ?? 0
      if (now.getTime() - last < intervalMs) continue
      this.lastProducedAt.set(sensor.sensorId, now.getTime())
      for (const vehicle of snapshot.vehicles) {
        const sequence = this.nextSequence(sensor.sensorId)
        const observation = simulateObservation({
          sourceId: this.sourceId,
          instanceId: this.instanceId,
          scenarioSeed: this.options.scenarioSeed,
          sensor,
          vehicle,
          sequence,
          now,
        })
        if (observation) observations.push(observation)
      }
    }
    if (!observations.length) return null
    try {
      return await this.post<PublishAck>('/v1/observations', {
        observations,
      } satisfies ObservationBatch)
    } catch {
      await this.register()
      return this.post<PublishAck>('/v1/observations', { observations })
    }
  }

  private async register(): Promise<void> {
    await this.post('/v1/sources/register', {
      schemaVersion: '1.0',
      sourceId: this.sourceId,
      displayName: 'Sentinel standalone sensor simulator',
      sourceKind: 'SENSOR',
      mode: 'SIMULATED',
      adapterType: 'sentinel-sensor-sim',
      capabilities: [
        'sensor.radar',
        'sensor.rf',
        'sensor.eo',
        'sensor.ir',
        'sensor.acoustic',
        'sensor.runtime-crud',
      ],
      instanceId: this.instanceId,
      startedAt: this.startedAt,
    })
  }

  private async publishHealth(
    status: SourceHealth['status'],
    details: SourceHealth['details'],
  ): Promise<void> {
    this.healthSequence += 1
    await this.post('/v1/source-health', {
      schemaVersion: '1.0',
      sourceId: this.sourceId,
      instanceId: this.instanceId,
      sequence: this.healthSequence,
      observedAt: new Date().toISOString(),
      status,
      details,
    } satisfies SourceHealth)
  }

  private async publishPeriodicHealth(
    now: Date,
    status: SourceHealth['status'],
    details: SourceHealth['details'],
  ): Promise<void> {
    if (now.getTime() - this.lastHealthAt < 2_000) return
    this.lastHealthAt = now.getTime()
    try {
      await this.publishHealth(status, details)
    } catch {
      try {
        await this.register()
        await this.publishHealth(status, details)
      } catch {
        // The simulator remains available locally while edge reconnects.
      }
    }
  }

  private nextSequence(sensorId: string): number {
    const next = (this.sequences.get(sensorId) ?? 0) + 1
    this.sequences.set(sensorId, next)
    return next
  }

  private validateSensor(sensor: EdgeSensor): void {
    const numbers = [
      sensor.configuration.maxRangeM,
      sensor.configuration.horizontalFovDeg,
      sensor.configuration.verticalFovDeg,
      sensor.configuration.updateRateHz,
      sensor.configuration.packetLossRate,
      sensor.configuration.latencyMs,
      sensor.configuration.noiseStdDevM,
    ]
    if (numbers.some((value) => !Number.isFinite(value))) {
      throw new Error('sensor configuration must contain finite numbers')
    }
    if (sensor.configuration.maxRangeM <= 0) throw new Error('maxRangeM must be positive')
    if (sensor.configuration.updateRateHz <= 0) throw new Error('updateRateHz must be positive')
    if (
      sensor.configuration.packetLossRate < 0 ||
      sensor.configuration.packetLossRate > 1
    ) {
      throw new Error('packetLossRate must be between 0 and 1')
    }
  }

  private async syncVisual(sensorId: string): Promise<void> {
    const sensor = this.sensors.get(sensorId)
    if (!sensor) return
    const payload = {
      sensorId: sensor.sensorId,
      displayName: sensor.displayName,
      modality: sensor.modality,
      pose: sensor.pose,
      configurationRevision: sensor.configurationRevision,
    }
    try {
      let response = await fetch(
        new URL('/v1/visual-sensors', this.options.gazeboGatewayUrl),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5_000),
        },
      )
      if (response.status === 409) {
        response = await fetch(
          new URL(
            `/v1/visual-sensors/${encodeURIComponent(sensor.sensorId)}`,
            this.options.gazeboGatewayUrl,
          ),
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5_000),
          },
        )
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(
          body?.error ?? `Gazebo visual gateway returned ${response.status}`,
        )
      }
      this.sensors.set(sensorId, {
        ...sensor,
        visualState: 'ACTIVE',
        visualError: undefined,
      })
    } catch (error) {
      this.sensors.set(sensorId, {
        ...sensor,
        visualState: 'UNAVAILABLE',
        visualError:
          error instanceof Error ? error.message : 'Gazebo visual unavailable',
      })
    }
  }

  private addBootstrapSensors(): void {
    const origin = {
      frame: 'LOCAL_ENU' as const,
      eastM: 0,
      northM: 0,
      upM: 2,
      rollRad: 0,
      pitchRad: 0,
      yawRad: 0,
    }
    this.createSensor({
      commandId: 'bootstrap-radar',
      sensorId: 'sim-radar-01',
      sensorTypeId: 'sim-radar-short-range-v1',
      displayName: 'Demo radar',
      pose: origin,
      configuration: { horizontalFovDeg: 360 },
    })
    this.createSensor({
      commandId: 'bootstrap-rf',
      sensorId: 'sim-rf-01',
      sensorTypeId: 'sim-rf-direction-finder-v1',
      displayName: 'Demo RF direction finder',
      pose: origin,
    })
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetch(new URL(path, this.options.edgeGatewayUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-edge-token': this.options.producerToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      throw new Error(payload?.error ?? `edge gateway returned ${response.status}`)
    }
    return (await response.json()) as T
  }
}

export function makeTestVehicle(
  overrides: Partial<SimVehicle> = {},
): SimVehicle {
  return {
    vehicleId: 'test-vehicle',
    platformId: 'commercial-quad',
    displayName: 'Test vehicle',
    role: 'scout',
    groupId: null,
    controlBackend: 'gazebo_velocity',
    lifecycle: 'ACTIVE',
    source: 'runtime',
    pose: {
      frame: 'LOCAL_ENU',
      eastM: 100,
      northM: 100,
      upM: 30,
      rollRad: 0,
      pitchRad: 0,
      yawRad: 0,
    },
    velocity: { eastMS: 1, northMS: 0, upMS: 0 },
    updatedAt: '2026-07-27T00:00:00.000Z',
    ...overrides,
  }
}
