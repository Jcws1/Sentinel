import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { alignToTruth, summarizeAccuracy } from './metrics'
import {
  captureThroughSentinelNormalization,
  toGatewayTelemetryEvents,
} from './sentinelCapture'
import {
  applyControlledGnssDegradation,
  DEFAULT_DEGRADATION_TIMELINE,
} from './degradation'
import {
  findClockOffsetMs,
  munFrlCandidateFrames,
  munFrlTruthFrames,
  parseMunFrlFlightLogCsv,
  parseMunFrlPpk,
} from './munFrl'

const dataRoot = path.resolve('evaluation/data/mun-frl')
const outputRoot = path.resolve('evaluation/output/mun-frl-quarry1')

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function toNdjson(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const [ppkText, flightLogText, previewPdf] = await Promise.all([
  readFile(path.join(dataRoot, 'quarry_1_ppk.pos'), 'utf8'),
  readFile(path.join(dataRoot, 'quarry1_flight_log_extracted.csv'), 'utf8'),
  readFile(path.join(dataRoot, 'quarry1-preview.pdf')),
])
const ppk = parseMunFrlPpk(ppkText)
const flightLog = parseMunFrlFlightLogCsv(flightLogText)
const truth = munFrlTruthFrames(ppk.samples, ppk.origin)
const calibrationDurationMs = 30_000
const firstElapsedMs = flightLog[0]!.elapsedMs
const calibrationFlightLog = flightLog.filter(
  (sample) => sample.elapsedMs - firstElapsedMs < calibrationDurationMs,
)
const clock = findClockOffsetMs(calibrationFlightLog, truth, ppk.origin)

const unalignedVertical = munFrlCandidateFrames(
  flightLog,
  ppk.origin,
  clock.offsetMs,
)
const initialAligned = alignToTruth(unalignedVertical.slice(0, 50), truth, 110)
if (initialAligned.length < 40) {
  throw new Error('Insufficient initial samples to establish the relative-height datum')
}
const verticalDatumM = median(
  initialAligned.map(
    (sample) => sample.truth.position.upM - sample.estimate.position.upM,
  ),
)
const candidate = munFrlCandidateFrames(
  flightLog,
  ppk.origin,
  clock.offsetMs,
  verticalDatumM,
)
const aligned = alignToTruth(candidate, truth, 110)
const firstCandidateNs = BigInt(candidate[0]!.sourceTimestampNs)
const holdoutStartNs = firstCandidateNs + BigInt(calibrationDurationMs) * 1_000_000n
const holdoutCandidate = candidate.filter(
  (frame) => BigInt(frame.sourceTimestampNs) >= holdoutStartNs,
)
const degradedCandidate = applyControlledGnssDegradation(candidate)
const degradedHoldoutCandidate = degradedCandidate.filter(
  (frame) => BigInt(frame.sourceTimestampNs) >= holdoutStartNs,
)
const firstDegradedNs = BigInt(degradedCandidate[0]!.sourceTimestampNs)
const degradedByPhase = Object.fromEntries(
  [
    ['BASELINE', 0, DEFAULT_DEGRADATION_TIMELINE.degradedStartSeconds],
    [
      'DEGRADED',
      DEFAULT_DEGRADATION_TIMELINE.degradedStartSeconds,
      DEFAULT_DEGRADATION_TIMELINE.deniedStartSeconds,
    ],
    [
      'DENIED',
      DEFAULT_DEGRADATION_TIMELINE.deniedStartSeconds,
      DEFAULT_DEGRADATION_TIMELINE.recoveryStartSeconds,
    ],
    [
      'RECOVERING',
      DEFAULT_DEGRADATION_TIMELINE.recoveryStartSeconds,
      DEFAULT_DEGRADATION_TIMELINE.recoveredSeconds,
    ],
    ['RECOVERED', DEFAULT_DEGRADATION_TIMELINE.recoveredSeconds, Number.POSITIVE_INFINITY],
  ].map(([name, start, end]) => {
    const phaseFrames = degradedCandidate.filter((frame) => {
      const elapsed = Number(BigInt(frame.sourceTimestampNs) - firstDegradedNs) / 1e9
      return elapsed >= Number(start) && elapsed < Number(end)
    })
    return [String(name), summarizeAccuracy(phaseFrames, truth)]
  }),
)
const sentinelNormal = captureThroughSentinelNormalization(candidate, ppk.origin)
const sentinelDegraded = captureThroughSentinelNormalization(
  degradedCandidate,
  ppk.origin,
)
const sentinelNormalHoldout = sentinelNormal.evaluationFrames.filter(
  (frame) => BigInt(frame.sourceTimestampNs) >= holdoutStartNs,
)
const sentinelDegradedHoldout = sentinelDegraded.evaluationFrames.filter(
  (frame) => BigInt(frame.sourceTimestampNs) >= holdoutStartNs,
)
const gatewayNormal = toGatewayTelemetryEvents(candidate)
const gatewayDegraded = toGatewayTelemetryEvents(degradedCandidate)
const normalizationDeltas = candidate.map((frame, index) => {
  const normalized = sentinelNormal.evaluationFrames[index]!
  return {
    horizontalM: Math.hypot(
      normalized.position.eastM - frame.position.eastM,
      normalized.position.northM - frame.position.northM,
    ),
    verticalM: Math.abs(normalized.position.upM - frame.position.upM),
  }
})
const normalizationRmse = (axis: 'horizontalM' | 'verticalM') =>
  Math.sqrt(
    normalizationDeltas.reduce((sum, value) => sum + value[axis] ** 2, 0) /
      normalizationDeltas.length,
  )
const ppkQualityCounts = Object.fromEntries(
  [...new Set(ppk.samples.map((sample) => sample.solutionQuality))].map(
    (quality) => [
      String(quality),
      ppk.samples.filter((sample) => sample.solutionQuality === quality).length,
    ],
  ),
)
const report = {
  classification: 'REAL_UAV_MEASURED_CANDIDATE_VS_PPK_REFERENCE',
  limitations: [
    'The candidate DJI CSV was recovered from Google Drive public preview pages because the raw file was quota-blocked.',
    'Clock offset was calibrated only on the first 30 seconds, then frozen before scoring the temporal holdout.',
    'DJI height is relative to takeoff; one constant vertical datum was estimated from the first five seconds of the calibration partition.',
    'The holdout is later data from the same flight, not an independently collected flight.',
    'The PPK reference and onboard GNSS are related GNSS sources, so this is not fully independent of common-mode GNSS errors.',
  ],
  dataset: {
    name: 'MUN-FRL',
    sequence: 'quarry1',
    officialPage: 'https://mun-frl-vil-dataset.readthedocs.io/en/latest/',
    licence: 'CC BY 4.0',
    flightLogRows: flightLog.length,
    ppkRows: ppk.samples.length,
    ppkQualityCounts,
    hashes: {
      ppkPosSha256: sha256(ppkText),
      drivePreviewPdfSha256: sha256(previewPdf),
      extractedFlightLogSha256: sha256(flightLogText),
    },
  },
  alignment: {
    gpsToUtcOffsetSeconds: 18,
    calibratedCandidateClockOffsetMs: clock.offsetMs,
    clockSearchHorizontalRmseM: clock.horizontalRmseM,
    verticalDatumM,
    calibrationDurationSeconds: calibrationDurationMs / 1_000,
    calibrationSamples: calibrationFlightLog.length,
    holdoutSamples: holdoutCandidate.length,
    alignedSamples: aligned.length,
  },
  accuracy: {
    scoringPartition: 'TEMPORAL_HOLDOUT_AFTER_FIRST_30_SECONDS',
    holdout: summarizeAccuracy(holdoutCandidate, truth),
    fullSequenceDiagnosticOnly: summarizeAccuracy(candidate, truth),
  },
  sentinelNormalization: {
    missingNativeFields: [
      'sourceTimestamp',
      'gatewayTimestamp',
      'perVehicleSequence',
      '3-axis velocity',
      'GNSS fix type',
      'satellite count',
      'position covariance',
    ],
    transportFidelity: {
      horizontalRmseM: normalizationRmse('horizontalM'),
      horizontalMaxM: Math.max(...normalizationDeltas.map((value) => value.horizontalM)),
      verticalRmseM: normalizationRmse('verticalM'),
      verticalMaxM: Math.max(...normalizationDeltas.map((value) => value.verticalM)),
    },
    normalAccuracy: summarizeAccuracy(sentinelNormalHoldout, truth),
  },
  controlledDegradation: {
    classification: 'MODELLED_FAULT_OVER_REAL_MEASURED_UAV_TRAJECTORY',
    timelineSeconds: DEFAULT_DEGRADATION_TIMELINE,
    accuracyByPhase: degradedByPhase,
    accuracy: summarizeAccuracy(degradedHoldoutCandidate, truth),
    sentinelNormalizedAccuracy: summarizeAccuracy(
      sentinelDegradedHoldout,
      truth,
    ),
  },
}

await mkdir(outputRoot, { recursive: true })
await Promise.all([
  writeFile(path.join(outputRoot, 'truth.private.ndjson'), toNdjson(truth)),
  writeFile(path.join(outputRoot, 'normal.anchor-input.ndjson'), toNdjson(candidate)),
  writeFile(
    path.join(outputRoot, 'gnss-degraded.anchor-input.ndjson'),
    toNdjson(degradedCandidate),
  ),
  writeFile(
    path.join(outputRoot, 'sentinel-normalized-normal.ndjson'),
    toNdjson(sentinelNormal.nativeFleetRecords),
  ),
  writeFile(
    path.join(outputRoot, 'sentinel-normalized-degraded.ndjson'),
    toNdjson(sentinelDegraded.nativeFleetRecords),
  ),
  writeFile(
    path.join(outputRoot, 'gateway-normal.telemetry.ndjson'),
    toNdjson(gatewayNormal),
  ),
  writeFile(
    path.join(outputRoot, 'gateway-gnss-degraded.telemetry.ndjson'),
    toNdjson(gatewayDegraded),
  ),
  writeFile(path.join(outputRoot, 'accuracy-report.json'), `${JSON.stringify(report, null, 2)}\n`),
])
console.log(JSON.stringify(report, null, 2))
