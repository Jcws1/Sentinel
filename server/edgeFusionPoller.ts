import type {
  AcceptedObservation,
  EdgeSensor,
} from '../contracts/edgeTypes'
import type { SensorFusionSnapshot } from '../src/api/edgeFusionTypes'
import { SensorFusionEngine } from './sensorFusion'

export class EdgeFusionPoller {
  private readonly engine = new SensorFusionEngine()
  private timer: NodeJS.Timeout | null = null
  private running = false
  private sourceStatus: SensorFusionSnapshot['sourceStatus'] = 'OFFLINE'
  private error: string | null = null
  private readonly edgeGatewayUrl: string
  private readonly intervalMs: number

  constructor(
    edgeGatewayUrl: string,
    intervalMs = 250,
  ) {
    this.edgeGatewayUrl = edgeGatewayUrl
    this.intervalMs = intervalMs
  }

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  snapshot(): SensorFusionSnapshot {
    return this.engine.snapshot(this.sourceStatus, this.error)
  }

  async poll(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const after = this.engine.snapshot().lastIngressSequence
      const [observationResponse, sensorResponse] = await Promise.all([
        fetch(
          `${this.edgeGatewayUrl}/v1/observations?afterIngressSequence=${after}`,
          { signal: AbortSignal.timeout(3_000) },
        ),
        fetch(`${this.edgeGatewayUrl}/v1/sensors`, {
          signal: AbortSignal.timeout(3_000),
        }),
      ])
      if (!observationResponse.ok || !sensorResponse.ok) {
        throw new Error(
          `edge fusion input returned ${observationResponse.status}/${sensorResponse.status}`,
        )
      }
      const observationBody = (await observationResponse.json()) as {
        observations: AcceptedObservation[]
      }
      const sensorBody = (await sensorResponse.json()) as {
        sensors: EdgeSensor[]
      }
      this.engine.ingest(observationBody.observations, sensorBody.sensors)
      this.sourceStatus = 'CONNECTED'
      this.error = null
    } catch (error) {
      this.sourceStatus =
        this.sourceStatus === 'CONNECTED' ? 'DEGRADED' : 'OFFLINE'
      this.error =
        error instanceof Error ? error.message : 'edge fusion input unavailable'
    } finally {
      this.running = false
    }
  }
}
