import { createHash } from 'node:crypto'
import type {
  EdgeSensor,
  SensorObservation,
} from '../contracts/edgeTypes'
import type { SimVehicle } from '../src/api/simTypes'

function seededUnit(seed: string): number {
  const bytes = createHash('sha256').update(seed).digest()
  return bytes.readUInt32LE(0) / 0xffff_ffff
}

function gaussian(seed: string): number {
  const a = Math.max(Number.EPSILON, seededUnit(`${seed}:a`))
  const b = seededUnit(`${seed}:b`)
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b)
}

function normalizeAngle(value: number): number {
  let result = value
  while (result > Math.PI) result -= Math.PI * 2
  while (result < -Math.PI) result += Math.PI * 2
  return result
}

function targetSignature(vehicle: SimVehicle): string {
  return `${vehicle.platformId} ${vehicle.role}`.toLowerCase()
}

function targetClass(vehicle: SimVehicle): string {
  const signature = targetSignature(vehicle)
  if (
    signature.includes('fixed') ||
    signature.includes('wing') ||
    signature.includes('owa')
  ) {
    return 'fixed_wing_uas'
  }
  if (signature.includes('bird')) return 'bird'
  return 'multirotor_uas'
}

function observationId(
  scenarioSeed: string,
  sensorId: string,
  sequence: number,
  vehicle: SimVehicle,
): string {
  return createHash('sha256')
    .update(
      `${scenarioSeed}:${sensorId}:${sequence}:${vehicle.vehicleId}:${vehicle.updatedAt}`,
    )
    .digest('hex')
    .slice(0, 32)
}

function geometry(sensor: EdgeSensor, vehicle: SimVehicle) {
  const east = vehicle.pose.eastM - sensor.pose.eastM
  const north = vehicle.pose.northM - sensor.pose.northM
  const up = vehicle.pose.upM - sensor.pose.upM
  const groundRange = Math.hypot(east, north)
  const range = Math.hypot(groundRange, up)
  const worldBearing = Math.atan2(east, north)
  const bearing = normalizeAngle(worldBearing - sensor.pose.yawRad)
  const elevation = Math.atan2(up, Math.max(groundRange, Number.EPSILON))
  return { east, north, up, range, bearing, elevation }
}

function visible(sensor: EdgeSensor, vehicle: SimVehicle): boolean {
  const relative = geometry(sensor, vehicle)
  return (
    relative.range <= sensor.configuration.maxRangeM &&
    Math.abs(relative.bearing) <=
      (sensor.configuration.horizontalFovDeg * Math.PI) / 360 &&
    Math.abs(relative.elevation) <=
      (sensor.configuration.verticalFovDeg * Math.PI) / 360
  )
}

function sourceFields(
  sensor: EdgeSensor,
  sourceId: string,
  instanceId: string,
) {
  return {
    sourceId,
    instanceId,
    sensorId: sensor.sensorId,
    sensorTypeId: sensor.sensorTypeId,
    adapterType: 'sentinel-sensor-sim',
    configurationRevision: sensor.configurationRevision,
    mode: 'SIMULATED' as const,
  }
}

export interface ObservationModelContext {
  sourceId: string
  instanceId: string
  scenarioSeed: string
  sensor: EdgeSensor
  vehicle: SimVehicle
  sequence: number
  now: Date
}

export function simulateObservation(
  context: ObservationModelContext,
): SensorObservation | null {
  const { sensor, vehicle, sequence, scenarioSeed, now } = context
  if (sensor.lifecycle !== 'ACTIVE' || !visible(sensor, vehicle)) return null
  const seed = `${scenarioSeed}:${sensor.sensorId}:${sequence}:${vehicle.vehicleId}`
  if (seededUnit(`${seed}:loss`) < sensor.configuration.packetLossRate) return null
  const relative = geometry(sensor, vehicle)
  const observedAt = new Date(
    now.getTime() - Math.max(0, sensor.configuration.latencyMs),
  ).toISOString()
  const base = {
    schemaVersion: '1.0' as const,
    observationId: observationId(
      scenarioSeed,
      sensor.sensorId,
      sequence,
      vehicle,
    ),
    source: sourceFields(sensor, context.sourceId, context.instanceId),
    sequence,
    time: {
      observedAt,
      sentAt: now.toISOString(),
      clockQuality: 'estimated' as const,
      uncertaintyMs: 2,
    },
    frame: {
      id: sensor.sensorId,
      convention: 'SENSOR_POLAR' as const,
    },
  }

  if (sensor.modality === 'radar') {
    const rangeNoise =
      gaussian(`${seed}:range`) * sensor.configuration.noiseStdDevM
    const velocity = vehicle.velocity ?? { eastMS: 0, northMS: 0, upMS: 0 }
    const radialVelocity =
      relative.range > 0
        ? (velocity.eastMS * relative.east +
            velocity.northMS * relative.north +
            velocity.upMS * relative.up) /
          relative.range
        : 0
    const distanceFraction = relative.range / sensor.configuration.maxRangeM
    const confidence = Math.max(
      0.05,
      Math.min(0.99, 0.98 - distanceFraction * 0.45),
    )
    return {
      ...base,
      measurement: {
        modality: 'radar',
        rangeM: Math.max(0, relative.range + rangeNoise),
        bearingRad:
          relative.bearing + gaussian(`${seed}:bearing`) * 0.003,
        elevationRad:
          relative.elevation + gaussian(`${seed}:elevation`) * 0.004,
        radialVelocityMS:
          radialVelocity + gaussian(`${seed}:velocity`) * 0.15,
        signalToNoiseDb: 24 - distanceFraction * 18,
      },
      quality: {
        detectionConfidence: confidence,
        covariance: [
          sensor.configuration.noiseStdDevM ** 2,
          0,
          0,
          0.003 ** 2,
        ],
        processingLevel: 'measurement',
        staleAfterMs: Math.ceil(3_000 / sensor.configuration.updateRateHz),
      },
    }
  }

  if (sensor.modality === 'rf') {
    const signature = targetSignature(vehicle)
    if (
      signature.includes('silent') ||
      signature.includes('one-way') ||
      signature.includes('owa')
    ) {
      return null
    }
    const distanceFraction = relative.range / sensor.configuration.maxRangeM
    return {
      ...base,
      measurement: {
        modality: 'rf',
        bearingRad:
          relative.bearing + gaussian(`${seed}:bearing`) * 0.02,
        centerFrequencyHz: 2_437_000_000,
        bandwidthHz: 20_000_000,
        signalPowerDbm:
          -35 -
          distanceFraction * 45 +
          gaussian(`${seed}:power`) * 2,
        emitterFamily: 'unclassified_uas_link',
      },
      quality: {
        detectionConfidence: Math.max(
          0.05,
          Math.min(0.95, 0.92 - distanceFraction * 0.5),
        ),
        covariance: [0.02 ** 2],
        processingLevel: 'measurement',
        staleAfterMs: Math.ceil(3_000 / sensor.configuration.updateRateHz),
      },
    }
  }

  if (sensor.modality === 'eo' || sensor.modality === 'ir') {
    const distanceFraction = relative.range / sensor.configuration.maxRangeM
    const confidence = Math.max(
      0.08,
      Math.min(0.94, 0.9 - distanceFraction * 0.58),
    )
    return {
      ...base,
      measurement: {
        modality: sensor.modality,
        bearingRad:
          relative.bearing + gaussian(`${seed}:bearing`) * 0.006,
        elevationRad:
          relative.elevation + gaussian(`${seed}:elevation`) * 0.007,
        classification: [
          { label: targetClass(vehicle), confidence },
          { label: 'unknown', confidence: 1 - confidence },
        ],
        mediaRef: `sim-media://${sensor.sensorId}/${base.observationId}`,
      },
      quality: {
        detectionConfidence: confidence,
        covariance: [0.006 ** 2, 0, 0, 0.007 ** 2],
        processingLevel: 'classification',
        staleAfterMs: Math.ceil(3_000 / sensor.configuration.updateRateHz),
      },
    }
  }

  if (sensor.modality === 'acoustic') {
    const distanceFraction = relative.range / sensor.configuration.maxRangeM
    const confidence = Math.max(
      0.05,
      Math.min(0.88, 0.82 - distanceFraction * 0.62),
    )
    const classLabel = targetClass(vehicle)
    return {
      ...base,
      measurement: {
        modality: 'acoustic',
        bearingRad:
          relative.bearing + gaussian(`${seed}:bearing`) * 0.04,
        peakFrequencyHz:
          (classLabel === 'fixed_wing_uas' ? 115 : 185) +
          gaussian(`${seed}:frequency`) * 8,
        signalToNoiseDb: 18 - distanceFraction * 15,
        classification: [
          { label: classLabel, confidence },
          { label: 'background', confidence: 1 - confidence },
        ],
      },
      quality: {
        detectionConfidence: confidence,
        covariance: [0.04 ** 2],
        processingLevel: 'classification',
        staleAfterMs: Math.ceil(4_000 / sensor.configuration.updateRateHz),
      },
    }
  }

  return null
}
