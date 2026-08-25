import type {
  SimEvent,
  SimFault,
  SimHandshake,
  SimSnapshot,
  SimVehicle,
} from '../src/api/simTypes'
import { syncGatewayFleet } from '../server/simGateway'
import { createInitialState } from '../server/state'
import { geodeticToEnu, type GeodeticPosition } from './geodesy'
import type { PositionEstimateFrame } from './types'

function isoFromNs(timestampNs: string): string {
  return new Date(Number(BigInt(timestampNs) / 1_000_000n)).toISOString()
}

export interface SentinelCapture {
  evaluationFrames: PositionEstimateFrame[]
  nativeFleetRecords: Array<{
    correlation: { sequence: number; sourceTimestampNs: string }
    drone: ReturnType<typeof createInitialState>['drones'][number]
  }>
}

function vehicleFromFrame(frame: PositionEstimateFrame): SimVehicle {
  return {
    vehicleId: frame.vehicleId,
    platformId: 'real-uav-dataset-replay',
    displayName: frame.vehicleId,
    role: 'scout',
    groupId: 'accuracy-evaluation',
    controlBackend: 'px4_sitl',
    lifecycle: 'ACTIVE',
    source: 'runtime',
    pose: {
      frame: 'LOCAL_ENU',
      eastM: frame.position.eastM,
      northM: frame.position.northM,
      upM: frame.position.upM,
      rollRad: 0,
      pitchRad: 0,
      yawRad: 0,
    },
    navigationSource:
      frame.navigationSource === 'GNSS' ? 'GNSS' : 'SIMULATED_VIO',
    updatedAt: isoFromNs(frame.sourceTimestampNs),
  }
}

/** Exact existing sentinel-sim telemetry envelope, with no evaluation-only fields. */
export function toGatewayTelemetryEvents(
  input: PositionEstimateFrame[],
): SimEvent<SimVehicle>[] {
  return input.map((frame, index) => ({
    protocol: 'sentinel-sim',
    protocolVersion: '1.0',
    messageId: `accuracy-${frame.vehicleId}-${String(index).padStart(6, '0')}`,
    sequence: index,
    timestamp: isoFromNs(frame.sourceTimestampNs),
    scenarioId: 'accuracy-evaluation',
    type: 'telemetry.frame',
    data: vehicleFromFrame(frame),
  }))
}

/** Exercise Sentinel's production simulator-to-fleet normalization offline. */
export function captureThroughSentinelNormalization(
  input: PositionEstimateFrame[],
  origin: GeodeticPosition,
): SentinelCapture {
  const state = createInitialState()
  const handshake: SimHandshake = {
    protocol: 'sentinel-sim',
    version: '1.0',
    scenarioId: 'accuracy-evaluation',
    worldName: 'real-uav-replay',
    coordinateFrame: 'ENU',
    origin: {
      latDeg: origin.latitudeDeg,
      lngDeg: origin.longitudeDeg,
      elevationM: origin.heightM,
    },
    limits: { maxVehicles: 1, px4HotSpawn: false },
    capabilities: ['telemetry.frame', 'fault.updated'],
  }
  const evaluationFrames: PositionEstimateFrame[] = []
  const nativeFleetRecords: SentinelCapture['nativeFleetRecords'] = []

  for (const frame of input) {
    const updatedAt = isoFromNs(frame.sourceTimestampNs)
    const vehicle = vehicleFromFrame(frame)
    const denied = frame.fixStatus === 'UNAVAILABLE'
    const faults: SimFault[] = denied
      ? [
          {
            faultId: `evaluation-gnss-${frame.vehicleId}`,
            vehicleId: frame.vehicleId,
            kind: 'gnss_denied',
            active: true,
            parameters: { source: 'controlled-real-trajectory-replay' },
            updatedAt,
          },
        ]
      : []
    const snapshot: SimSnapshot = {
      scenarioId: 'accuracy-evaluation',
      origin: handshake.origin,
      vehicles: [vehicle],
      faults,
    }
    const originalDateNow = Date.now
    Date.now = () => Number(BigInt(frame.sourceTimestampNs) / 1_000_000n)
    try {
      syncGatewayFleet(state, snapshot, handshake)
    } finally {
      Date.now = originalDateNow
    }
    const drone = structuredClone(state.drones[0]!)
    nativeFleetRecords.push({
      correlation: {
        sequence: frame.sequence,
        sourceTimestampNs: frame.sourceTimestampNs,
      },
      drone,
    })
    const normalizedEnu = geodeticToEnu(
      {
        latitudeDeg: drone.position.lat,
        longitudeDeg: drone.position.lng,
        heightM: drone.position.alt,
      },
      origin,
    )
    evaluationFrames.push({
      ...frame,
      position: normalizedEnu,
      navigationSource:
        drone.navigationSource === 'SIMULATED_VIO' ? 'VIO' : 'GNSS',
      quality: {
        reportedUncertaintyM: drone.positionUncertaintyM,
        confidence: drone.positioningConfidence,
        confidenceSemantics: 'HEURISTIC',
      },
      provenance: { ...frame.provenance, sourceKind: 'DERIVED' },
    })
  }
  return { evaluationFrames, nativeFleetRecords }
}
