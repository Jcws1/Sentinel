import { createHash } from 'node:crypto'
import type {
  AcceptedObservation,
  EdgeSourceRegistration,
  SensorObservation,
} from '../contracts/edgeTypes'

export interface ReplayOptions {
  sourceId: string
  instanceId: string
  anchorTime: Date
  speed: number
}

export interface ScheduledReplayObservation {
  delayMs: number
  observation: SensorObservation
}

function deterministicId(
  sourceId: string,
  instanceId: string,
  originalId: string,
  sequence: number,
): string {
  return createHash('sha256')
    .update(`${sourceId}:${instanceId}:${originalId}:${sequence}`)
    .digest('hex')
    .slice(0, 32)
}

export function parseRecording(text: string): AcceptedObservation[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as AcceptedObservation
      } catch {
        throw new Error(`invalid NDJSON at line ${index + 1}`)
      }
    })
}

export function buildReplaySchedule(
  recording: AcceptedObservation[],
  options: ReplayOptions,
): ScheduledReplayObservation[] {
  if (!Number.isFinite(options.speed) || options.speed <= 0) {
    throw new Error('replay speed must be greater than zero')
  }
  const ordered = [...recording].sort(
    (left, right) =>
      Date.parse(left.time.observedAt) - Date.parse(right.time.observedAt) ||
      left.gateway.ingressSequence - right.gateway.ingressSequence,
  )
  if (!ordered.length) return []
  const firstObservedMs = Date.parse(ordered[0].time.observedAt)
  if (!Number.isFinite(firstObservedMs)) {
    throw new Error('recording contains an invalid observedAt timestamp')
  }
  const sequences = new Map<string, number>()
  return ordered.map((accepted) => {
    const observedMs = Date.parse(accepted.time.observedAt)
    const sentMs = Date.parse(accepted.time.sentAt)
    if (!Number.isFinite(observedMs) || !Number.isFinite(sentMs)) {
      throw new Error('recording contains an invalid timestamp')
    }
    const delayMs = Math.max(
      0,
      Math.round((observedMs - firstObservedMs) / options.speed),
    )
    const sensorId = accepted.source.sensorId
    const sequence = (sequences.get(sensorId) ?? 0) + 1
    sequences.set(sensorId, sequence)
    const observedAt = new Date(
      options.anchorTime.getTime() + delayMs,
    ).toISOString()
    const transportDelayMs = Math.max(0, sentMs - observedMs)
    const { gateway: _gateway, ...recordedObservation } = accepted
    return {
      delayMs,
      observation: {
        ...recordedObservation,
        observationId: deterministicId(
          options.sourceId,
          options.instanceId,
          accepted.observationId,
          sequence,
        ),
        source: {
          ...accepted.source,
          sourceId: options.sourceId,
          instanceId: options.instanceId,
          adapterType: 'sentinel-replay',
          mode: 'REPLAY',
        },
        sequence,
        time: {
          ...accepted.time,
          observedAt,
          sentAt: new Date(
            options.anchorTime.getTime() +
              delayMs +
              Math.round(transportDelayMs / options.speed),
          ).toISOString(),
        },
      },
    }
  })
}

export function replayRegistration(
  schedule: ScheduledReplayObservation[],
  options: ReplayOptions,
): EdgeSourceRegistration {
  const modalities = new Set(
    schedule.map((item) => item.observation.measurement.modality),
  )
  return {
    schemaVersion: '1.0',
    sourceId: options.sourceId,
    displayName: 'Sentinel observation replay',
    sourceKind: 'REPLAY',
    mode: 'REPLAY',
    adapterType: 'sentinel-replay',
    capabilities: [...modalities].map((modality) => `sensor.${modality}`),
    instanceId: options.instanceId,
    startedAt: options.anchorTime.toISOString(),
  }
}

