export type EdgeSourceMode = 'SIMULATED' | 'REPLAY' | 'LIVE'
export type EdgeSourceKind = 'SENSOR' | 'VEHICLE' | 'REPLAY'
export type SensorModality =
  | 'radar'
  | 'rf'
  | 'eo'
  | 'ir'
  | 'acoustic'
  | 'cooperative_id'

export interface EdgeSourceRegistration {
  schemaVersion: '1.0'
  sourceId: string
  displayName: string
  sourceKind: EdgeSourceKind
  mode: EdgeSourceMode
  adapterType: string
  capabilities: string[]
  instanceId: string
  startedAt: string
}

export interface EdgeSourceRecord extends EdgeSourceRegistration {
  registeredAt: string
  lastSeenAt: string
  lifecycle: 'ACTIVE' | 'STALE' | 'OFFLINE'
}

export interface SourceHealth {
  schemaVersion: '1.0'
  sourceId: string
  instanceId: string
  sequence: number
  observedAt: string
  status: 'HEALTHY' | 'DEGRADED' | 'FAULT' | 'OFFLINE'
  details?: Record<string, string | number | boolean | null>
}

export interface SensorPose {
  frame: 'LOCAL_ENU'
  eastM: number
  northM: number
  upM: number
  rollRad: number
  pitchRad: number
  yawRad: number
}

export interface SensorType {
  sensorTypeId: string
  displayName: string
  modality: SensorModality
  measurementKinds: string[]
  defaults: {
    maxRangeM: number
    horizontalFovDeg: number
    verticalFovDeg: number
    updateRateHz: number
  }
  evidenceStatus: 'authoritative' | 'public_partial' | 'notional'
}

export interface EdgeSensor {
  sensorId: string
  sourceId: string
  sensorTypeId: string
  displayName: string
  modality: SensorModality
  lifecycle: 'REQUESTED' | 'ACTIVE' | 'DEGRADED' | 'FAULT' | 'REMOVED'
  pose: SensorPose
  configuration: {
    maxRangeM: number
    horizontalFovDeg: number
    verticalFovDeg: number
    updateRateHz: number
    packetLossRate: number
    latencyMs: number
    noiseStdDevM: number
  }
  configurationRevision: number
  visualState: 'PENDING' | 'ACTIVE' | 'UNAVAILABLE'
  visualError?: string
  updatedAt: string
}

export interface CreateSensorRequest {
  commandId: string
  sensorId: string
  sensorTypeId: string
  displayName?: string
  pose: SensorPose
  configuration?: Partial<EdgeSensor['configuration']>
}

export interface RadarMeasurement {
  modality: 'radar'
  rangeM: number
  bearingRad: number
  elevationRad: number
  radialVelocityMS: number
  signalToNoiseDb: number
}

export interface RfMeasurement {
  modality: 'rf'
  bearingRad: number
  centerFrequencyHz: number
  bandwidthHz: number
  signalPowerDbm: number
  emitterFamily?: string
}

export interface ImageryMeasurement {
  modality: 'eo' | 'ir'
  bearingRad: number
  elevationRad: number
  classification: Array<{ label: string; confidence: number }>
  mediaRef?: string
}

export interface AcousticMeasurement {
  modality: 'acoustic'
  bearingRad: number
  peakFrequencyHz: number
  signalToNoiseDb: number
  classification: Array<{ label: string; confidence: number }>
}

export type EdgeMeasurement =
  | RadarMeasurement
  | RfMeasurement
  | ImageryMeasurement
  | AcousticMeasurement

export interface SensorObservation {
  schemaVersion: '1.0'
  observationId: string
  source: {
    sourceId: string
    instanceId: string
    sensorId: string
    sensorTypeId: string
    adapterType: string
    configurationRevision: number
    mode: EdgeSourceMode
  }
  sequence: number
  time: {
    observedAt: string
    sentAt: string
    clockQuality: 'gps' | 'ptp' | 'ntp' | 'estimated' | 'unknown'
    uncertaintyMs?: number
  }
  frame: {
    id: string
    convention: 'LOCAL_ENU' | 'SENSOR_POLAR'
    originRevision?: string
  }
  measurement: EdgeMeasurement
  quality: {
    detectionConfidence: number
    covariance: number[]
    processingLevel: 'measurement' | 'local_track' | 'classification'
    staleAfterMs: number
  }
  rawEvidence?: Array<{
    mediaType: string
    uri: string
    sha256?: string
  }>
}

export interface AcceptedObservation extends SensorObservation {
  gateway: {
    receivedAt: string
    ingressSequence: number
  }
}

export interface ObservationBatch {
  observations: SensorObservation[]
}

export interface PublishAck {
  accepted: number
  rejected: number
  ingressSequence: number
  errors: Array<{ index: number; message: string }>
}

export interface EdgeEvent<T = unknown> {
  protocol: 'sentinel-edge'
  protocolVersion: '1.0'
  messageId: string
  sequence: number
  timestamp: string
  type:
    | 'source.lifecycle'
    | 'source.health'
    | 'sensor.lifecycle'
    | 'sensor.configuration'
    | 'sensor.observation'
  data: T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function containsForbiddenTruthField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenTruthField)
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, nested]) =>
      key === 'truthEntityId' ||
      key === 'gazeboEntityId' ||
      containsForbiddenTruthField(nested),
  )
}

export function validateSourceRegistration(
  value: unknown,
): string[] {
  if (!isRecord(value)) return ['registration must be an object']
  const errors: string[] = []
  if (value.schemaVersion !== '1.0') errors.push('schemaVersion must be 1.0')
  if (typeof value.sourceId !== 'string' || !value.sourceId.trim()) {
    errors.push('sourceId is required')
  }
  if (typeof value.instanceId !== 'string' || !value.instanceId.trim()) {
    errors.push('instanceId is required')
  }
  if (!['SIMULATED', 'REPLAY', 'LIVE'].includes(String(value.mode))) {
    errors.push('mode is invalid')
  }
  if (!['SENSOR', 'VEHICLE', 'REPLAY'].includes(String(value.sourceKind))) {
    errors.push('sourceKind is invalid')
  }
  if (!Array.isArray(value.capabilities)) errors.push('capabilities must be an array')
  if (!Number.isFinite(Date.parse(String(value.startedAt)))) {
    errors.push('startedAt must be an ISO timestamp')
  }
  return errors
}

export function validateObservation(
  value: unknown,
  nowMs = Date.now(),
): string[] {
  if (!isRecord(value)) return ['observation must be an object']
  const errors: string[] = []
  if (containsForbiddenTruthField(value)) {
    errors.push('simulator truth identifiers are forbidden')
  }
  if (value.schemaVersion !== '1.0') errors.push('schemaVersion must be 1.0')
  if (typeof value.observationId !== 'string' || !value.observationId.trim()) {
    errors.push('observationId is required')
  }
  if (!Number.isInteger(value.sequence) || Number(value.sequence) < 0) {
    errors.push('sequence must be a non-negative integer')
  }
  if (!isRecord(value.source)) {
    errors.push('source is required')
  } else {
    for (const field of [
      'sourceId',
      'instanceId',
      'sensorId',
      'sensorTypeId',
      'adapterType',
    ]) {
      if (typeof value.source[field] !== 'string' || !String(value.source[field]).trim()) {
        errors.push(`source.${field} is required`)
      }
    }
    if (!Number.isInteger(value.source.configurationRevision)) {
      errors.push('source.configurationRevision must be an integer')
    }
    if (!['SIMULATED', 'REPLAY', 'LIVE'].includes(String(value.source.mode))) {
      errors.push('source.mode is invalid')
    }
  }
  if (!isRecord(value.time)) {
    errors.push('time is required')
  } else {
    const observedAt = Date.parse(String(value.time.observedAt))
    const sentAt = Date.parse(String(value.time.sentAt))
    if (!Number.isFinite(observedAt)) errors.push('time.observedAt is invalid')
    if (!Number.isFinite(sentAt)) errors.push('time.sentAt is invalid')
    if (Number.isFinite(observedAt) && observedAt > nowMs + 30_000) {
      errors.push('time.observedAt is too far in the future')
    }
  }
  if (!isRecord(value.frame)) {
    errors.push('frame is required')
  } else if (!['LOCAL_ENU', 'SENSOR_POLAR'].includes(String(value.frame.convention))) {
    errors.push('frame.convention is invalid')
  }
  if (!isRecord(value.measurement)) {
    errors.push('measurement is required')
  } else if (
    !['radar', 'rf', 'eo', 'ir', 'acoustic'].includes(
      String(value.measurement.modality),
    )
  ) {
    errors.push('measurement.modality is unsupported')
  }
  if (!isRecord(value.quality)) {
    errors.push('quality is required')
  } else {
    const confidence = Number(value.quality.detectionConfidence)
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push('quality.detectionConfidence must be between 0 and 1')
    }
    if (!Array.isArray(value.quality.covariance)) {
      errors.push('quality.covariance must be an array')
    }
  }
  return errors
}
