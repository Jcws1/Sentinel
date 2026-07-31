import type {
  AcceptedObservation,
  EdgeSensor,
} from '../contracts/edgeTypes'
import type {
  FusedSensorTrack,
  SensorFusionSnapshot,
} from '../src/api/edgeFusionTypes'

type MutableTrack = FusedSensorTrack & {
  classificationScores: Map<string, number>
}

function normalizeAngle(value: number): number {
  let result = value
  while (result > Math.PI) result -= Math.PI * 2
  while (result < -Math.PI) result += Math.PI * 2
  return result
}

function classificationValues(
  observation: AcceptedObservation,
): Array<{ label: string; confidence: number }> {
  const measurement = observation.measurement
  return 'classification' in measurement ? measurement.classification : []
}

function observationPosition(
  observation: AcceptedObservation,
  sensor: EdgeSensor,
): FusedSensorTrack['positionEnuM'] | null {
  if (observation.measurement.modality !== 'radar') return null
  const measurement = observation.measurement
  const horizontalRange = measurement.rangeM * Math.cos(measurement.elevationRad)
  const worldBearing = sensor.pose.yawRad + measurement.bearingRad
  return {
    east:
      sensor.pose.eastM + Math.sin(worldBearing) * horizontalRange,
    north:
      sensor.pose.northM + Math.cos(worldBearing) * horizontalRange,
    up:
      sensor.pose.upM +
      Math.sin(measurement.elevationRad) * measurement.rangeM,
  }
}

function distance3d(
  first: FusedSensorTrack['positionEnuM'],
  second: FusedSensorTrack['positionEnuM'],
): number {
  return Math.hypot(
    first.east - second.east,
    first.north - second.north,
    first.up - second.up,
  )
}

function bearingResidual(
  observation: AcceptedObservation,
  sensor: EdgeSensor,
  track: MutableTrack,
): number {
  const measurement = observation.measurement
  if (!('bearingRad' in measurement)) return Number.POSITIVE_INFINITY
  const east = track.positionEnuM.east - sensor.pose.eastM
  const north = track.positionEnuM.north - sensor.pose.northM
  const expected = normalizeAngle(
    Math.atan2(east, north) - sensor.pose.yawRad,
  )
  let residual = Math.abs(
    normalizeAngle(measurement.bearingRad - expected),
  )
  if ('elevationRad' in measurement) {
    const up = track.positionEnuM.up - sensor.pose.upM
    const expectedElevation = Math.atan2(up, Math.max(0.01, Math.hypot(east, north)))
    residual += Math.abs(measurement.elevationRad - expectedElevation) * 0.6
  }
  return residual
}

export class SensorFusionEngine {
  private readonly tracks = new Map<string, MutableTrack>()
  private trackSequence = 0
  private unassociatedBearingCount = 0
  private lastIngressSequence = 0
  private updatedAt: string | null = null

  ingest(
    observations: AcceptedObservation[],
    sensors: EdgeSensor[],
    now = new Date(),
  ): void {
    const sensorById = new Map(
      sensors.map((sensor) => [sensor.sensorId, sensor]),
    )
    const ordered = [...observations].sort(
      (left, right) =>
        left.gateway.ingressSequence - right.gateway.ingressSequence,
    )
    for (const observation of ordered) {
      if (observation.gateway.ingressSequence <= this.lastIngressSequence) {
        continue
      }
      this.lastIngressSequence = observation.gateway.ingressSequence
      const sensor = sensorById.get(observation.source.sensorId)
      if (!sensor || sensor.lifecycle !== 'ACTIVE') continue
      const position = observationPosition(observation, sensor)
      if (position) {
        this.ingestPosition(observation, sensor, position)
      } else {
        this.ingestBearing(observation, sensor)
      }
    }
    this.updatedAt = now.toISOString()
    this.expire(now)
  }

  snapshot(
    sourceStatus: SensorFusionSnapshot['sourceStatus'] = 'CONNECTED',
    error: string | null = null,
    now = new Date(),
  ): SensorFusionSnapshot {
    this.expire(now)
    return {
      tracks: [...this.tracks.values()].map((track) => {
        const {
          classificationScores: _classificationScores,
          ...publicTrack
        } = track
        return structuredClone(publicTrack)
      }),
      unassociatedBearingCount: this.unassociatedBearingCount,
      lastIngressSequence: this.lastIngressSequence,
      updatedAt: this.updatedAt,
      sourceStatus,
      error,
    }
  }

  private ingestPosition(
    observation: AcceptedObservation,
    sensor: EdgeSensor,
    position: FusedSensorTrack['positionEnuM'],
  ): void {
    const measurementVariance = Math.max(
      1,
      Number(observation.quality.covariance[0] ?? 25),
    )
    const gateM = Math.max(60, Math.sqrt(measurementVariance) * 8)
    const observedMs = Date.parse(observation.time.observedAt)
    const candidate = [...this.tracks.values()]
      .filter(
        (track) =>
          observedMs - Date.parse(track.lastObservedAt) < 6_000 &&
          distance3d(track.positionEnuM, position) <= gateM,
      )
      .sort(
        (left, right) =>
          distance3d(left.positionEnuM, position) -
          distance3d(right.positionEnuM, position),
      )[0]
    if (!candidate) {
      this.trackSequence += 1
      const scores = new Map<string, number>()
      this.updateClassification(scores, observation)
      const track: MutableTrack = {
        trackId: `SF-${this.trackSequence.toString().padStart(4, '0')}`,
        lifecycle: 'TENTATIVE',
        positionEnuM: position,
        velocityEnuMS: { east: 0, north: 0, up: 0 },
        covarianceM2: [measurementVariance, 0, 0, measurementVariance],
        confidence: observation.quality.detectionConfidence,
        classifications: this.toClassifications(scores),
        classificationScores: scores,
        sensorIds: [sensor.sensorId],
        modalities: ['radar'],
        observationIds: [observation.observationId],
        firstObservedAt: observation.time.observedAt,
        lastObservedAt: observation.time.observedAt,
        updateCount: 1,
      }
      this.tracks.set(track.trackId, track)
      return
    }

    const previousPosition = { ...candidate.positionEnuM }
    const elapsedSeconds = Math.max(
      0.05,
      (observedMs - Date.parse(candidate.lastObservedAt)) / 1_000,
    )
    const confidence = observation.quality.detectionConfidence
    const alpha = Math.min(0.82, Math.max(0.28, confidence * 0.72))
    candidate.positionEnuM = {
      east:
        previousPosition.east * (1 - alpha) + position.east * alpha,
      north:
        previousPosition.north * (1 - alpha) + position.north * alpha,
      up: previousPosition.up * (1 - alpha) + position.up * alpha,
    }
    const measuredVelocity = {
      east: (candidate.positionEnuM.east - previousPosition.east) / elapsedSeconds,
      north:
        (candidate.positionEnuM.north - previousPosition.north) / elapsedSeconds,
      up: (candidate.positionEnuM.up - previousPosition.up) / elapsedSeconds,
    }
    candidate.velocityEnuMS = {
      east: candidate.velocityEnuMS.east * 0.65 + measuredVelocity.east * 0.35,
      north:
        candidate.velocityEnuMS.north * 0.65 + measuredVelocity.north * 0.35,
      up: candidate.velocityEnuMS.up * 0.65 + measuredVelocity.up * 0.35,
    }
    candidate.covarianceM2 = [
      Math.max(0.5, Math.min(candidate.covarianceM2[0] ?? measurementVariance, measurementVariance) * 0.82),
      0,
      0,
      Math.max(0.5, Math.min(candidate.covarianceM2[3] ?? measurementVariance, measurementVariance) * 0.82),
    ]
    this.updateTrackEvidence(candidate, observation, sensor)
  }

  private ingestBearing(
    observation: AcceptedObservation,
    sensor: EdgeSensor,
  ): void {
    const gateRad =
      observation.measurement.modality === 'acoustic'
        ? 0.22
        : observation.measurement.modality === 'rf'
          ? 0.16
          : 0.11
    const candidate = [...this.tracks.values()]
      .map((track) => ({
        track,
        residual: bearingResidual(observation, sensor, track),
        range: Math.hypot(
          track.positionEnuM.east - sensor.pose.eastM,
          track.positionEnuM.north - sensor.pose.northM,
          track.positionEnuM.up - sensor.pose.upM,
        ),
      }))
      .filter(
        (item) =>
          item.residual <= gateRad &&
          item.range <= sensor.configuration.maxRangeM,
      )
      .sort((left, right) => left.residual - right.residual)[0]
    if (!candidate) {
      this.unassociatedBearingCount += 1
      return
    }
    this.updateTrackEvidence(candidate.track, observation, sensor)
  }

  private updateTrackEvidence(
    track: MutableTrack,
    observation: AcceptedObservation,
    sensor: EdgeSensor,
  ): void {
    track.lastObservedAt = observation.time.observedAt
    track.updateCount += 1
    track.confidence =
      1 -
      (1 - track.confidence) *
        (1 - observation.quality.detectionConfidence * 0.55)
    if (!track.sensorIds.includes(sensor.sensorId)) {
      track.sensorIds.push(sensor.sensorId)
    }
    const modality = observation.measurement.modality
    if (!track.modalities.includes(modality)) track.modalities.push(modality)
    track.observationIds.push(observation.observationId)
    track.observationIds = track.observationIds.slice(-32)
    this.updateClassification(track.classificationScores, observation)
    track.classifications = this.toClassifications(track.classificationScores)
    track.lifecycle =
      track.updateCount >= 2 || track.modalities.length >= 2
        ? 'CONFIRMED'
        : 'TENTATIVE'
  }

  private updateClassification(
    scores: Map<string, number>,
    observation: AcceptedObservation,
  ): void {
    for (const item of classificationValues(observation)) {
      const prior = scores.get(item.label) ?? 0
      scores.set(
        item.label,
        1 - (1 - prior) * (1 - Math.max(0, Math.min(1, item.confidence))),
      )
    }
  }

  private toClassifications(
    scores: Map<string, number>,
  ): FusedSensorTrack['classifications'] {
    return [...scores.entries()]
      .map(([label, confidence]) => ({ label, confidence }))
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 5)
  }

  private expire(now: Date): void {
    for (const [trackId, track] of this.tracks) {
      const ageMs = now.getTime() - Date.parse(track.lastObservedAt)
      if (ageMs > 8_000) {
        this.tracks.delete(trackId)
      } else if (ageMs > 2_500) {
        track.lifecycle = 'COASTING'
        track.confidence *= 0.96
      }
    }
  }
}
