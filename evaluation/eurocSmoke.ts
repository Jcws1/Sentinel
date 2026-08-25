import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { eurocTruthFrames, parseEurocGroundTruthCsv } from './euroc'
import { summarizeAccuracy } from './metrics'
import type { PositionEstimateFrame } from './types'

const inputPath = path.resolve(
  'evaluation/data/euroc/MH_01_easy_groundtruth.csv',
)
const outputRoot = path.resolve('evaluation/output/euroc-mh01-smoke')

function toNdjson(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
}

function modelEstimate(
  truth: ReturnType<typeof eurocTruthFrames>,
  degraded: boolean,
): PositionEstimateFrame[] {
  if (!truth.length) return []
  const firstNs = BigInt(truth[0]!.timestampNs)
  const lastNs = BigInt(truth.at(-1)!.timestampNs)
  const durationNs = lastNs - firstNs
  const outageStart = 0.35
  const outageEnd = 0.75
  const recoveryEnd = 0.9
  const outageAnchorIndex = truth.findIndex(
    (frame) => Number(BigInt(frame.timestampNs) - firstNs) / Number(durationNs) >= outageStart,
  )
  const outageAnchor = truth[Math.max(0, outageAnchorIndex)]!

  return truth.map((frame, index) => {
    const progress = Number(BigInt(frame.timestampNs) - firstNs) / Number(durationNs)
    let navigationSource: PositionEstimateFrame['navigationSource'] = 'GNSS'
    let fixStatus: PositionEstimateFrame['fixStatus'] = 'VALID'
    let uncertaintyM = 1.5
    let eastOffset = Math.sin(index * 0.071) * 0.55
    let northOffset = Math.cos(index * 0.053) * 0.4
    let upOffset = Math.sin(index * 0.041) * 0.25

    if (degraded && progress >= outageStart && progress < outageEnd) {
      const outageAgeSeconds =
        Number(BigInt(frame.timestampNs) - BigInt(outageAnchor.timestampNs)) / 1e9
      navigationSource = 'DEAD_RECKONING'
      fixStatus = 'UNAVAILABLE'
      eastOffset = outageAnchor.position.eastM - frame.position.eastM + outageAgeSeconds * 0.12
      northOffset = outageAnchor.position.northM - frame.position.northM - outageAgeSeconds * 0.08
      upOffset = outageAnchor.position.upM - frame.position.upM + outageAgeSeconds * 0.03
      uncertaintyM = 2 + outageAgeSeconds * 0.18
    } else if (degraded && progress >= outageEnd && progress < recoveryEnd) {
      const recoveryFraction = (progress - outageEnd) / (recoveryEnd - outageEnd)
      navigationSource = 'GNSS'
      fixStatus = 'DEGRADED'
      eastOffset *= 4 * (1 - recoveryFraction)
      northOffset *= 4 * (1 - recoveryFraction)
      upOffset *= 3 * (1 - recoveryFraction)
      uncertaintyM = 8 - recoveryFraction * 6
    } else if (degraded && progress >= 0.2 && progress < outageStart) {
      fixStatus = 'DEGRADED'
      eastOffset *= 5
      northOffset *= 5
      upOffset *= 3
      uncertaintyM = 5
    }

    return {
      schemaVersion: 'sentinel-position-evaluation/1.0',
      vehicleId: frame.vehicleId,
      sequence: index,
      sourceTimestampNs: frame.timestampNs,
      frame: { convention: 'LOCAL_ENU', frameId: frame.frameId },
      position: {
        eastM: frame.position.eastM + eastOffset,
        northM: frame.position.northM + northOffset,
        upM: frame.position.upM + upOffset,
      },
      navigationSource,
      fixStatus,
      quality: {
        reportedUncertaintyM: uncertaintyM,
        confidenceSemantics: 'UNKNOWN',
      },
      provenance: {
        dataset: 'EuRoC MAV',
        sequence: 'MH_01_easy',
        sourceRecord: frame.provenance.sourceRecord,
        sourceKind: 'MODELLED',
      },
    }
  })
}

const csv = await readFile(inputPath, 'utf8')
const sourceHash = createHash('sha256').update(csv).digest('hex')
const samples = parseEurocGroundTruthCsv(csv)
const truth = eurocTruthFrames(samples)
const nominal = modelEstimate(truth, false)
const degraded = modelEstimate(truth, true)
const report = {
  warning:
    'Pipeline smoke test only: the trajectory is measured real UAV motion, but candidate errors and GNSS degradation are modelled.',
  dataset: {
    name: 'EuRoC MAV',
    sequence: 'MH_01_easy',
    officialLandingPage: 'https://doi.org/10.3929/ethz-b-000690084',
    acquiredFrom:
      'https://sourceforge.net/projects/kimera-vio/files/dataset/MH_01_easy/mav0/state_groundtruth_estimate0/data.csv/',
    sha256: sourceHash,
    originalRows: samples.length,
    evaluatedRows: truth.length,
  },
  nominal: summarizeAccuracy(nominal, truth),
  degraded: summarizeAccuracy(degraded, truth),
}

await mkdir(outputRoot, { recursive: true })
await Promise.all([
  writeFile(path.join(outputRoot, 'truth.private.ndjson'), toNdjson(truth)),
  writeFile(path.join(outputRoot, 'normal.anchor-input.ndjson'), toNdjson(nominal)),
  writeFile(path.join(outputRoot, 'gnss-degraded.anchor-input.ndjson'), toNdjson(degraded)),
  writeFile(path.join(outputRoot, 'smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`),
])
console.log(JSON.stringify(report, null, 2))
