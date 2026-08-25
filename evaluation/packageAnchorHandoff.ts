import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sourceRoot = path.resolve('evaluation/output/mun-frl-quarry1')
const blindRoot = path.resolve('evaluation/output/anchor-blind-handoff')
const internalRoot = path.resolve('evaluation/output/internal-evaluation')

function hash(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function copyFiles(
  destinationRoot: string,
  copies: Record<string, string>,
): Promise<string[]> {
  await mkdir(destinationRoot, { recursive: true })
  await Promise.all(
    Object.entries(copies).map(([source, destination]) =>
      copyFile(path.join(sourceRoot, source), path.join(destinationRoot, destination)),
    ),
  )
  return Object.values(copies)
}

async function writeChecksums(root: string, files: string[]): Promise<void> {
  const checksums = []
  for (const file of files) {
    const contents = await readFile(path.join(root, file))
    checksums.push({ file, sha256: hash(contents), bytes: contents.length })
  }
  await writeFile(
    path.join(root, 'SHA256SUMS.txt'),
    `${checksums.map((item) => `${item.sha256}  ${item.file}`).join('\n')}\n`,
  )
  await writeFile(
    path.join(root, 'RECORDING_MANIFEST.json'),
    `${JSON.stringify({
      format: 'sentinel-anchor-handoff/1.1',
      source: {
        dataset: 'MUN-FRL',
        sequence: 'quarry1',
        platform: 'DJI M600 hexacopter',
        licence: 'CC BY 4.0',
        officialPage: 'https://mun-frl-vil-dataset.readthedocs.io/en/latest/',
      },
      files: checksums,
    }, null, 2)}\n`,
  )
}

const blindFiles = await copyFiles(blindRoot, {
  'gateway-normal.telemetry.ndjson': 'gateway-normal.telemetry.ndjson',
  'gateway-gnss-degraded.telemetry.ndjson':
    'gateway-gnss-degraded.telemetry.ndjson',
})

const normalFirstLine = (
  await readFile(path.join(blindRoot, 'gateway-normal.telemetry.ndjson'), 'utf8')
).split(/\r?\n/)[0]!
const sample = JSON.stringify(JSON.parse(normalFirstLine), null, 2)
const handshake = {
  protocol: 'sentinel-sim',
  version: '1.0',
  scenarioId: 'accuracy-evaluation',
  worldName: 'real-uav-replay',
  coordinateFrame: 'ENU',
  origin: {
    latDeg: 47.480313667,
    lngDeg: -53.009514108,
    elevationM: 36.7569,
  },
  note: 'Origin is the reference position declared in the MUN-FRL quarry1 PPK file.',
}
await writeFile(
  path.join(blindRoot, 'gateway-handshake.json'),
  `${JSON.stringify(handshake, null, 2)}\n`,
)

const readme = `# Sentinel to Anchor blind handoff

This package contains existing-format \`sentinel-sim\` gateway telemetry from a
real DJI M600 trajectory in the MUN-FRL quarry1 dataset.

## Recordings

- \`gateway-normal.telemetry.ndjson\`: measured onboard DJI GNSS trajectory,
  transformed into local ENU and wrapped in Sentinel's existing gateway event.
- \`gateway-gnss-degraded.telemetry.ndjson\`: the same measured motion with a
  deterministic MODELLED fault overlay. It is not a naturally recorded jammer.

The independent PPK truth, degradation timeline, enriched sidecars, and accuracy
results are intentionally excluded so Anchor can be assessed blind. Sentinel
retains those in a separate private package.

## Limitations

The raw DJI CSV download was quota-blocked by Google Drive. The candidate
trajectory was recovered from Drive's public CSV preview PDF with a reproducible
extractor and hashed. Onboard GNSS and PPK are related GNSS sources, so
common-mode GNSS error is not independently observable in this sequence.

## Existing gateway sample

\`\`\`json
${sample}
\`\`\`

Run Anchor in shadow mode. Do not feed decisions back into Sentinel or the
aircraft during this evaluation.
`

const dictionary = `# Field dictionary

| Field | Type | Meaning |
|---|---|---|
| \`protocol\` | string | Always \`sentinel-sim\` for this interface. |
| \`protocolVersion\` | string | Gateway contract version; \`1.0\` here. |
| \`messageId\` | string | Deterministic unique message identifier. |
| \`sequence\` | integer | Monotonic event sequence within the recording. |
| \`timestamp\` | ISO-8601 UTC | Source-correlated event time after documented clock alignment. |
| \`scenarioId\` | string | Evaluation stream identifier. |
| \`type\` | string | \`telemetry.frame\`. |
| \`data.vehicleId\` | string | Stable cooperative vehicle identity. |
| \`data.lifecycle\` | string | \`ACTIVE\` in this recording. |
| \`data.pose.frame\` | string | \`LOCAL_ENU\`: x east, y north, z up. |
| \`data.pose.eastM\` | metres | East displacement from handshake origin. |
| \`data.pose.northM\` | metres | North displacement from handshake origin. |
| \`data.pose.upM\` | metres | Relative height aligned once to the PPK vertical datum. |
| \`data.pose.rollRad/pitchRad/yawRad\` | radians | Zero; attitude was unavailable and must not be evaluated. |
| \`data.navigationSource\` | enum | \`GNSS\` normally; \`SIMULATED_VIO\` during controlled denial. |
| \`data.updatedAt\` | ISO-8601 UTC | Vehicle source update time. |

The existing record does not carry GNSS fix type, satellites, covariance,
statistically defined confidence, fix age, or three-axis velocity.
`

await Promise.all([
  writeFile(path.join(blindRoot, 'README.md'), readme),
  writeFile(path.join(blindRoot, 'FIELD_DICTIONARY.md'), dictionary),
])
blindFiles.push('gateway-handshake.json', 'README.md', 'FIELD_DICTIONARY.md')
await writeChecksums(blindRoot, blindFiles)

const internalFiles = await copyFiles(internalRoot, {
  'sentinel-normalized-normal.ndjson': 'sentinel-normalized-normal.ndjson',
  'sentinel-normalized-degraded.ndjson': 'sentinel-normalized-degraded.ndjson',
  'normal.anchor-input.ndjson': 'evaluation-sidecar-normal.ndjson',
  'gnss-degraded.anchor-input.ndjson': 'evaluation-sidecar-degraded.ndjson',
  'accuracy-report.json': 'ACCURACY_RESULTS.json',
})
const report = JSON.parse(
  await readFile(path.join(sourceRoot, 'accuracy-report.json'), 'utf8'),
)
const number = (value: number | null) =>
  value === null ? 'n/a' : Number(value).toFixed(3)
const percent = (value: number | null) =>
  value === null ? 'n/a' : `${(Number(value) * 100).toFixed(1)}%`
const internalReport = `# Sentinel accuracy evaluation — internal

## Result

The coordinate transport itself is effectively lossless, but the current
Sentinel uncertainty/confidence semantics are not calibrated against real 3D
error. Treat them as heuristic display values, not statistical accuracy bounds.

| Measure | Temporal holdout result |
|---|---:|
| Candidate horizontal RMSE | ${number(report.accuracy.holdout.horizontal.rmse)} m |
| Candidate horizontal p95 | ${number(report.accuracy.holdout.horizontal.p95)} m |
| Candidate vertical RMSE | ${number(report.accuracy.holdout.vertical.rmse)} m |
| Candidate 3D RMSE | ${number(report.accuracy.holdout.error3d.rmse)} m |
| Sentinel transform horizontal RMSE | ${number(report.sentinelNormalization.transportFidelity.horizontalRmseM)} m |
| Sentinel-reported uncertainty coverage | ${percent(report.sentinelNormalization.normalAccuracy.reportedUncertaintyCoverage)} |
| Sentinel overconfident samples | ${report.sentinelNormalization.normalAccuracy.overconfidentSamples} |

Clock offset was fitted only on the first 30 seconds and then frozen. All
accuracy values in the primary result are from the later temporal holdout. This
is stronger than scoring the calibration samples, but remains a same-flight
holdout rather than a separate flight.

## Controlled degradation

The degraded recording overlays deterministic modelled drift on measured real
UAV motion. It tests Anchor's decision logic repeatably; it does not claim to
reproduce every RF, multipath, spoofing, or autopilot failure mode.

Holdout degraded horizontal RMSE: ${number(report.controlledDegradation.accuracy.horizontal.rmse)} m.  
Holdout degraded 3D RMSE: ${number(report.controlledDegradation.accuracy.error3d.rmse)} m.

## Interpretation limits

- Onboard DJI GNSS and PPK can share common-mode GNSS errors.
- DJI height is relative to takeoff; PPK height is ellipsoidal. A constant datum
  fitted on the calibration partition does not remove time-varying barometric
  or vertical-source disagreement.
- The extracted candidate has 11–16 satellites but no trustworthy fix-quality
  or covariance field in the public preview.
- Validate final hardware with independent surveyed RTK truth and synchronized
  clocks before making safety or operational claims.
`
const timeline = `# Private controlled-degradation timeline

| Flight time | Phase | Treatment |
|---|---|---|
| 0–30 s | Calibration/baseline | Original measured onboard GNSS; used to fit clock and height datum. |
| 30–45 s | Degraded | Increasing deterministic position disturbance. |
| 45–85 s | Denied | Fallback source with accumulating drift. |
| 85–100 s | Recovering | GNSS return with decaying validation offset. |
| 100 s–end | Recovered | Original measured onboard GNSS. |

Keep this timeline private until Anchor returns its first decisions.
`
await Promise.all([
  writeFile(path.join(internalRoot, 'INTERNAL_ACCURACY_REPORT.md'), internalReport),
  writeFile(path.join(internalRoot, 'DEGRADATION_TIMELINE.private.md'), timeline),
])
internalFiles.push('INTERNAL_ACCURACY_REPORT.md', 'DEGRADATION_TIMELINE.private.md')
await writeChecksums(internalRoot, internalFiles)

console.log(JSON.stringify({ blindRoot, internalRoot }, null, 2))
