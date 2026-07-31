import type { MissionSnapshotDto } from '../src/api/types'
import type { CompactC2Context } from './types'
import { requireLoopbackHttpUrl } from './networkBoundary'

type FetchLike = typeof fetch

export class ReadOnlyC2Client {
  readonly baseUrl: URL
  private readonly fetchImpl: FetchLike

  constructor(
    baseUrl = 'http://127.0.0.1:3001',
    fetchImpl: FetchLike = fetch,
  ) {
    this.baseUrl = requireLoopbackHttpUrl(baseUrl, 'C2 base URL')
    this.fetchImpl = fetchImpl
  }

  private async getSnapshot(): Promise<MissionSnapshotDto> {
    const response = await this.fetchImpl(
      new URL('/api/v1/snapshot', this.baseUrl),
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(2_000),
      },
    )
    if (!response.ok) {
      throw new Error(`C2 snapshot failed with HTTP ${response.status}`)
    }
    return (await response.json()) as MissionSnapshotDto
  }

  async getCompactContext(): Promise<CompactC2Context> {
    const snapshot = await this.getSnapshot()
    const retrievedAt = new Date().toISOString()
    return {
      retrievedAt,
      source: 'SENTINEL_C2_CANONICAL_SNAPSHOT',
      mission: {
        id: snapshot.missionId,
        state: snapshot.mission.state,
        c2Link: snapshot.mission.c2Link,
        gnss: snapshot.mission.gnss,
      },
      assets: snapshot.drones.map((drone) => ({
        assetId: drone.id,
        displayName: drone.displayName || drone.id,
        platformType: drone.type,
        batteryPercent: drone.battery,
        position: drone.position,
        positioningConfidence: drone.positioningConfidence,
        linkState: drone.comms,
        payloadStatus: drone.payloadStatus,
        assignedMissionId: drone.assignedTrackId,
        lifecycle: drone.lifecycle || 'UNKNOWN',
      })),
      tracks: snapshot.tracks.slice(0, 50).map((track) => ({
        trackId: track.id,
        threatClass: String(track.threatClass),
        position: track.position,
        speed: track.speed,
        altitude: track.altitude,
        etaToProtectedAssetSeconds: track.etaToAsset,
        fusionConfidence: track.fusionConfidence,
        contributingSensors: track.sensors.slice(0, 8),
        alert: snapshot.alertTrackIds.includes(track.id),
      })),
      policy: {
        summary: snapshot.policy.summary.slice(0, 20),
        machineEvaluable: false,
        limitation:
          'Current policy summaries are advisory text. The assistant cannot authorize or execute a task.',
      },
      limitations: [
        'The assistant receives the canonical C2 snapshot only.',
        'No Gazebo truth, sensor-simulator control API, raw MAVLink, or execution endpoint is available.',
        'Current asset records do not yet carry complete observation-time and commandability metadata.',
        'Current fused track records do not yet carry per-track observation timestamps, affiliation evidence, or authoritative identity.',
      ],
    }
  }
}
