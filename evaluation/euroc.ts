import type { GroundTruthFrame } from './types'

export interface EurocStateSample {
  timestampNs: string
  position: { eastM: number; northM: number; upM: number }
  velocity: { eastMS: number; northMS: number; upMS: number }
}

export function parseEurocGroundTruthCsv(csv: string): EurocStateSample[] {
  const samples: EurocStateSample[] = []
  for (const [lineIndex, rawLine] of csv.split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const fields = line.split(',').map((field) => field.trim())
    if (fields.length < 11) {
      throw new Error(`EuRoC row ${lineIndex + 1} has ${fields.length} fields`)
    }
    const numeric = fields.slice(1, 11).map(Number)
    if (numeric.some((value) => !Number.isFinite(value))) {
      throw new Error(`EuRoC row ${lineIndex + 1} contains a non-numeric state`)
    }
    samples.push({
      timestampNs: fields[0]!,
      position: { eastM: numeric[0]!, northM: numeric[1]!, upM: numeric[2]! },
      velocity: { eastMS: numeric[7]!, northMS: numeric[8]!, upMS: numeric[9]! },
    })
  }
  return samples
}

export function eurocTruthFrames(
  samples: EurocStateSample[],
  stride = 20,
): GroundTruthFrame[] {
  return samples
    .filter((_sample, index) => index % stride === 0)
    .map((sample, index) => ({
      schemaVersion: 'sentinel-position-truth/1.0',
      vehicleId: 'EUROC-MH01-MAV',
      timestampNs: sample.timestampNs,
      frameId: 'EUROC_MH01_R',
      position: sample.position,
      provenance: {
        dataset: 'EuRoC MAV',
        sequence: 'MH_01_easy',
        sourceRecord: String(index * stride + 2),
        sourceKind: 'MEASURED',
        instrument: 'Leica/Vicon-aligned published state ground truth',
      },
    }))
}
