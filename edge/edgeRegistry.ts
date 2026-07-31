import { createHash, randomUUID } from 'node:crypto'
import type {
  AcceptedObservation,
  EdgeEvent,
  EdgeSourceRecord,
  EdgeSourceRegistration,
  ObservationBatch,
  PublishAck,
  SensorObservation,
  SourceHealth,
} from '../contracts/edgeTypes'
import {
  validateObservation,
  validateSourceRegistration,
} from '../contracts/edgeTypes'

type EventListener = (event: EdgeEvent) => void

export class EdgeRegistry {
  private readonly sources = new Map<string, EdgeSourceRecord>()
  private readonly health = new Map<string, SourceHealth>()
  private readonly observations: AcceptedObservation[] = []
  private readonly observationHashes = new Map<string, string>()
  private readonly sequences = new Map<string, number>()
  private readonly listeners = new Set<EventListener>()
  private eventSequence = 0
  private ingressSequence = 0
  private readonly observationLimit: number

  constructor(observationLimit = 5_000) {
    this.observationLimit = observationLimit
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  register(value: unknown, now = new Date()): EdgeSourceRecord {
    const errors = validateSourceRegistration(value)
    if (errors.length) throw new Error(errors.join('; '))
    const registration = value as EdgeSourceRegistration
    const prior = this.sources.get(registration.sourceId)
    const record: EdgeSourceRecord = {
      ...registration,
      registeredAt: prior?.registeredAt ?? now.toISOString(),
      lastSeenAt: now.toISOString(),
      lifecycle: 'ACTIVE',
    }
    this.sources.set(record.sourceId, record)
    this.emit('source.lifecycle', record, now)
    return { ...record }
  }

  listSources(nowMs = Date.now()): EdgeSourceRecord[] {
    return [...this.sources.values()].map((source) => {
      const ageMs = nowMs - Date.parse(source.lastSeenAt)
      const lifecycle =
        ageMs > 30_000 ? 'OFFLINE' : ageMs > 10_000 ? 'STALE' : 'ACTIVE'
      return { ...source, lifecycle }
    })
  }

  publishHealth(value: SourceHealth, now = new Date()): SourceHealth {
    const source = this.requireSource(value.sourceId, value.instanceId)
    if (!Number.isInteger(value.sequence) || value.sequence < 0) {
      throw new Error('health sequence must be a non-negative integer')
    }
    if (!Number.isFinite(Date.parse(value.observedAt))) {
      throw new Error('health observedAt must be an ISO timestamp')
    }
    source.lastSeenAt = now.toISOString()
    this.health.set(value.sourceId, structuredClone(value))
    this.emit('source.health', value, now)
    return structuredClone(value)
  }

  listHealth(): SourceHealth[] {
    return [...this.health.values()].map((value) => structuredClone(value))
  }

  publish(
    batch: ObservationBatch,
    now = new Date(),
  ): PublishAck {
    if (!batch || !Array.isArray(batch.observations)) {
      throw new Error('observations must be an array')
    }
    if (batch.observations.length > 256) {
      throw new Error('observation batch exceeds the 256 item limit')
    }
    const errors: PublishAck['errors'] = []
    let accepted = 0
    for (const [index, observation] of batch.observations.entries()) {
      const validation = validateObservation(observation, now.getTime())
      if (validation.length) {
        errors.push({ index, message: validation.join('; ') })
        continue
      }
      try {
        this.acceptObservation(observation, now)
        accepted += 1
      } catch (error) {
        errors.push({
          index,
          message: error instanceof Error ? error.message : 'observation rejected',
        })
      }
    }
    return {
      accepted,
      rejected: errors.length,
      ingressSequence: this.ingressSequence,
      errors,
    }
  }

  listObservations(afterIngressSequence = 0): AcceptedObservation[] {
    return this.observations
      .filter((item) => item.gateway.ingressSequence > afterIngressSequence)
      .map((item) => structuredClone(item))
  }

  private acceptObservation(
    observation: SensorObservation,
    now: Date,
  ): void {
    const source = this.requireSource(
      observation.source.sourceId,
      observation.source.instanceId,
    )
    if (source.mode !== observation.source.mode) {
      throw new Error('observation source mode does not match registration')
    }
    const canonical = JSON.stringify(observation)
    const hash = createHash('sha256').update(canonical).digest('hex')
    const priorHash = this.observationHashes.get(observation.observationId)
    if (priorHash) {
      throw new Error(
        priorHash === hash
          ? 'duplicate observationId'
          : 'observationId reused with different content',
      )
    }
    const sequenceKey = `${observation.source.sourceId}:${observation.source.sensorId}`
    const priorSequence = this.sequences.get(sequenceKey)
    if (priorSequence !== undefined && observation.sequence <= priorSequence) {
      throw new Error('observation sequence is not monotonic')
    }
    this.ingressSequence += 1
    const accepted: AcceptedObservation = {
      ...structuredClone(observation),
      gateway: {
        receivedAt: now.toISOString(),
        ingressSequence: this.ingressSequence,
      },
    }
    this.observationHashes.set(observation.observationId, hash)
    this.sequences.set(sequenceKey, observation.sequence)
    this.observations.push(accepted)
    while (this.observations.length > this.observationLimit) {
      const removed = this.observations.shift()
      if (removed) this.observationHashes.delete(removed.observationId)
    }
    source.lastSeenAt = now.toISOString()
    this.emit('sensor.observation', accepted, now)
  }

  private requireSource(sourceId: string, instanceId: string): EdgeSourceRecord {
    const source = this.sources.get(sourceId)
    if (!source) throw new Error(`source ${sourceId} is not registered`)
    if (source.instanceId !== instanceId) {
      throw new Error(`source ${sourceId} instance does not match registration`)
    }
    return source
  }

  private emit(type: EdgeEvent['type'], data: unknown, now: Date): void {
    this.eventSequence += 1
    const event: EdgeEvent = {
      protocol: 'sentinel-edge',
      protocolVersion: '1.0',
      messageId: randomUUID(),
      sequence: this.eventSequence,
      timestamp: now.toISOString(),
      type,
      data,
    }
    for (const listener of this.listeners) listener(event)
  }
}
