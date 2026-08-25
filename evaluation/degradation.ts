import type { PositionEstimateFrame } from './types'

export interface DegradationTimeline {
  degradedStartSeconds: number
  deniedStartSeconds: number
  recoveryStartSeconds: number
  recoveredSeconds: number
}

export const DEFAULT_DEGRADATION_TIMELINE: DegradationTimeline = {
  degradedStartSeconds: 30,
  deniedStartSeconds: 45,
  recoveryStartSeconds: 85,
  recoveredSeconds: 100,
}

/**
 * Applies a deterministic fault overlay to a measured real-flight trajectory.
 * The underlying motion remains real. Every affected record is explicitly
 * marked MODELLED so it cannot be mistaken for naturally observed RFI.
 */
export function applyControlledGnssDegradation(
  input: PositionEstimateFrame[],
  timeline = DEFAULT_DEGRADATION_TIMELINE,
): PositionEstimateFrame[] {
  if (!input.length) return []
  const firstNs = BigInt(input[0]!.sourceTimestampNs)
  return input.map((frame, index) => {
    const elapsedSeconds = Number(BigInt(frame.sourceTimestampNs) - firstNs) / 1e9
    if (elapsedSeconds < timeline.degradedStartSeconds) return structuredClone(frame)

    const result = structuredClone(frame)
    result.provenance.sourceKind = 'MODELLED'
    if (elapsedSeconds < timeline.deniedStartSeconds) {
      const progress =
        (elapsedSeconds - timeline.degradedStartSeconds) /
        (timeline.deniedStartSeconds - timeline.degradedStartSeconds)
      result.fixStatus = 'DEGRADED'
      result.position.eastM += Math.sin(index * 0.31) * (0.8 + progress * 3.2)
      result.position.northM += Math.cos(index * 0.27) * (0.6 + progress * 2.5)
      result.position.upM += Math.sin(index * 0.19) * (0.5 + progress * 1.5)
      result.quality.reportedUncertaintyM = 2 + progress * 4
      return result
    }
    if (elapsedSeconds < timeline.recoveryStartSeconds) {
      const deniedAge = elapsedSeconds - timeline.deniedStartSeconds
      result.navigationSource = 'DEAD_RECKONING'
      result.fixStatus = 'UNAVAILABLE'
      result.position.eastM += deniedAge * 0.12
      result.position.northM -= deniedAge * 0.08
      result.position.upM += deniedAge * 0.035
      result.quality.reportedUncertaintyM = 3 + deniedAge * 0.18
      result.quality.fixAgeMs = Math.round(deniedAge * 1_000)
      result.quality.satellitesTracked = 0
      return result
    }
    if (elapsedSeconds < timeline.recoveredSeconds) {
      const recoveryProgress =
        (elapsedSeconds - timeline.recoveryStartSeconds) /
        (timeline.recoveredSeconds - timeline.recoveryStartSeconds)
      const remaining = 1 - recoveryProgress
      result.fixStatus = 'DEGRADED'
      result.position.eastM += remaining * 1.8
      result.position.northM -= remaining * 1.2
      result.position.upM += remaining * 0.8
      result.quality.reportedUncertaintyM = 2 + remaining * 4
      result.quality.fixAgeMs = 0
      return result
    }
    result.provenance.sourceKind = frame.provenance.sourceKind
    return result
  })
}
