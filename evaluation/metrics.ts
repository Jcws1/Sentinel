import type {
  AccuracySummary,
  AlignedPositionSample,
  DistributionSummary,
  EnuVector,
  GroundTruthFrame,
  PositionEstimateFrame,
} from './types'

function timestampNs(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid nanosecond timestamp: ${value}`)
  return BigInt(value)
}

function interpolatePosition(
  before: GroundTruthFrame,
  after: GroundTruthFrame,
  targetNs: bigint,
): EnuVector {
  const beforeNs = timestampNs(before.timestampNs)
  const afterNs = timestampNs(after.timestampNs)
  if (afterNs === beforeNs) return before.position
  const ratio = Number(targetNs - beforeNs) / Number(afterNs - beforeNs)
  return {
    eastM: before.position.eastM + (after.position.eastM - before.position.eastM) * ratio,
    northM: before.position.northM + (after.position.northM - before.position.northM) * ratio,
    upM: before.position.upM + (after.position.upM - before.position.upM) * ratio,
  }
}

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? null
  const weight = index - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

function summarize(values: number[]): DistributionSummary {
  if (!values.length) {
    return { median: null, rmse: null, p95: null, p99: null, max: null }
  }
  const sorted = [...values].sort((left, right) => left - right)
  return {
    median: percentile(sorted, 0.5),
    rmse: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? null,
  }
}

export function alignToTruth(
  estimates: PositionEstimateFrame[],
  truth: GroundTruthFrame[],
  maximumGapMs = 100,
): AlignedPositionSample[] {
  const truthByVehicle = new Map<string, GroundTruthFrame[]>()
  for (const frame of truth) {
    const current = truthByVehicle.get(frame.vehicleId) ?? []
    current.push(frame)
    truthByVehicle.set(frame.vehicleId, current)
  }
  for (const frames of truthByVehicle.values()) {
    frames.sort((left, right) =>
      timestampNs(left.timestampNs) < timestampNs(right.timestampNs) ? -1 : 1,
    )
  }

  const maximumGapNs = BigInt(Math.round(maximumGapMs * 1_000_000))
  const aligned: AlignedPositionSample[] = []
  for (const estimate of estimates) {
    const candidates = truthByVehicle.get(estimate.vehicleId)
    if (!candidates?.length || estimate.frame.frameId !== candidates[0]?.frameId) continue
    const targetNs = timestampNs(estimate.sourceTimestampNs)
    let low = 0
    let high = candidates.length - 1
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      if (timestampNs(candidates[middle]!.timestampNs) < targetNs) low = middle + 1
      else high = middle - 1
    }
    const before = candidates[Math.max(0, low - 1)]
    const after = candidates[Math.min(candidates.length - 1, low)]
    if (!before || !after) continue
    const beforeNs = timestampNs(before.timestampNs)
    const afterNs = timestampNs(after.timestampNs)
    const nearestDelta = targetNs - beforeNs < afterNs - targetNs
      ? targetNs - beforeNs
      : afterNs - targetNs
    const absoluteDelta = nearestDelta < 0n ? -nearestDelta : nearestDelta
    if (absoluteDelta > maximumGapNs) continue
    const truthPosition = interpolatePosition(before, after, targetNs)
    const eastError = estimate.position.eastM - truthPosition.eastM
    const northError = estimate.position.northM - truthPosition.northM
    const verticalError = estimate.position.upM - truthPosition.upM
    aligned.push({
      estimate,
      truth: { ...before, timestampNs: estimate.sourceTimestampNs, position: truthPosition },
      timeOffsetMs: Number(absoluteDelta) / 1_000_000,
      horizontalErrorM: Math.hypot(eastError, northError),
      verticalErrorM: Math.abs(verticalError),
      error3dM: Math.hypot(eastError, northError, verticalError),
    })
  }
  return aligned
}

export function summarizeAccuracy(
  estimates: PositionEstimateFrame[],
  truth: GroundTruthFrame[],
  thresholdsM = [5, 10, 25],
): AccuracySummary {
  const aligned = alignToTruth(estimates, truth)
  const sequences = new Set<number>()
  let duplicates = 0
  let outOfOrder = 0
  let priorSequence: number | null = null
  for (const frame of estimates) {
    if (sequences.has(frame.sequence)) duplicates += 1
    sequences.add(frame.sequence)
    if (priorSequence !== null && frame.sequence < priorSequence) outOfOrder += 1
    priorSequence = frame.sequence
  }
  const withUncertainty = aligned.filter(
    (sample) => sample.estimate.quality.reportedUncertaintyM !== undefined,
  )
  const withinUncertainty = withUncertainty.filter(
    (sample) =>
      sample.error3dM <= (sample.estimate.quality.reportedUncertaintyM ?? -1),
  ).length
  return {
    inputEstimates: estimates.length,
    truthSamples: truth.length,
    alignedSamples: aligned.length,
    unmatchedEstimates: estimates.length - aligned.length,
    outOfOrderEstimates: outOfOrder,
    duplicateSequences: duplicates,
    horizontal: summarize(aligned.map((sample) => sample.horizontalErrorM)),
    vertical: summarize(aligned.map((sample) => sample.verticalErrorM)),
    error3d: summarize(aligned.map((sample) => sample.error3dM)),
    thresholdPassRate: Object.fromEntries(
      thresholdsM.map((threshold) => [
        `${threshold}m`,
        aligned.length
          ? aligned.filter((sample) => sample.error3dM <= threshold).length / aligned.length
          : 0,
      ]),
    ),
    reportedUncertaintyCoverage: withUncertainty.length
      ? withinUncertainty / withUncertainty.length
      : null,
    overconfidentSamples: withUncertainty.length - withinUncertainty,
  }
}
