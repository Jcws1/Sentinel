import { geodeticToEnu, type GeodeticPosition } from './geodesy'
import { alignToTruth } from './metrics'
import type { GroundTruthFrame, PositionEstimateFrame } from './types'

const GPS_UTC_OFFSET_MS_2022 = 18_000

export interface MunFrlPpkSample extends GeodeticPosition {
  timestampNs: string
  solutionQuality: number
  satellites: number
  sigmaNorthM: number
  sigmaEastM: number
  sigmaUpM: number
}

export interface MunFrlFlightLogSample {
  elapsedMs: number
  datetimeUtc: string
  latitudeDeg: number
  longitudeDeg: number
  relativeHeightM: number
  satellites: number
  flightState: string
  sourceRecord: string
}

export function parseMunFrlPpk(text: string): {
  origin: GeodeticPosition
  samples: MunFrlPpkSample[]
} {
  const reference = text.match(
    /^% ref pos\s*:\s*(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/m,
  )
  if (!reference) throw new Error('MUN-FRL PPK reference position is missing')
  const origin = {
    latitudeDeg: Number(reference[1]),
    longitudeDeg: Number(reference[2]),
    heightM: Number(reference[3]),
  }
  const samples: MunFrlPpkSample[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('%')) continue
    const fields = line.trim().split(/\s+/)
    if (fields.length < 15) continue
    const isoGps = `${fields[0]!.replaceAll('/', '-')}T${fields[1]}Z`
    const gpsMs = Date.parse(isoGps)
    if (!Number.isFinite(gpsMs)) throw new Error(`Invalid PPK time: ${fields[0]} ${fields[1]}`)
    samples.push({
      timestampNs: String(BigInt(gpsMs - GPS_UTC_OFFSET_MS_2022) * 1_000_000n),
      latitudeDeg: Number(fields[2]),
      longitudeDeg: Number(fields[3]),
      heightM: Number(fields[4]),
      solutionQuality: Number(fields[5]),
      satellites: Number(fields[6]),
      sigmaNorthM: Number(fields[7]),
      sigmaEastM: Number(fields[8]),
      sigmaUpM: Number(fields[9]),
    })
  }
  return { origin, samples }
}

export function parseMunFrlFlightLogCsv(text: string): MunFrlFlightLogSample[] {
  const lines = text.trim().split(/\r?\n/)
  const header = lines.shift()?.split(',') ?? []
  const field = (name: string) => {
    const index = header.indexOf(name)
    if (index < 0) throw new Error(`Flight log field ${name} is missing`)
    return index
  }
  const indexes = {
    elapsed: field('elapsed_ms'),
    datetime: field('datetime_utc'),
    latitude: field('latitude_deg'),
    longitude: field('longitude_deg'),
    height: field('relative_height_ft'),
    satellites: field('satellites'),
    state: field('state'),
  }
  return lines.map((line, index) => {
    const values = line.split(',')
    return {
      elapsedMs: Number(values[indexes.elapsed]),
      datetimeUtc: values[indexes.datetime]!,
      latitudeDeg: Number(values[indexes.latitude]),
      longitudeDeg: Number(values[indexes.longitude]),
      relativeHeightM: Number(values[indexes.height]) * 0.3048,
      satellites: Number(values[indexes.satellites]),
      flightState: values.slice(indexes.state).join(','),
      sourceRecord: String(index + 2),
    }
  })
}

export function munFrlTruthFrames(
  samples: MunFrlPpkSample[],
  origin: GeodeticPosition,
): GroundTruthFrame[] {
  return samples.map((sample, index) => ({
    schemaVersion: 'sentinel-position-truth/1.0',
    vehicleId: 'MUN-FRL-QUARRY1-UAV',
    timestampNs: sample.timestampNs,
    frameId: 'MUN_FRL_QUARRY1_ENU',
    position: geodeticToEnu(sample, origin),
    provenance: {
      dataset: 'MUN-FRL',
      sequence: 'quarry1',
      sourceRecord: String(index + 27),
      sourceKind: 'MEASURED',
      instrument: 'RTKPOST combined kinematic PPK solution',
      statedAccuracyM: Math.hypot(sample.sigmaNorthM, sample.sigmaEastM),
    },
  }))
}

export function munFrlCandidateFrames(
  samples: MunFrlFlightLogSample[],
  origin: GeodeticPosition,
  clockOffsetMs = 0,
  verticalDatumM = 0,
): PositionEstimateFrame[] {
  if (!samples.length) return []
  const first = samples[0]!
  const firstTimeMs = Date.parse(first.datetimeUtc)
  return samples.map((sample, index) => {
    const timestampMs =
      firstTimeMs + (sample.elapsedMs - first.elapsedMs) + clockOffsetMs
    const horizontal = geodeticToEnu(
      {
        latitudeDeg: sample.latitudeDeg,
        longitudeDeg: sample.longitudeDeg,
        heightM: origin.heightM,
      },
      origin,
    )
    return {
      schemaVersion: 'sentinel-position-evaluation/1.0',
      vehicleId: 'MUN-FRL-QUARRY1-UAV',
      sequence: index,
      sourceTimestampNs: String(BigInt(Math.round(timestampMs)) * 1_000_000n),
      frame: { convention: 'LOCAL_ENU', frameId: 'MUN_FRL_QUARRY1_ENU' },
      position: {
        eastM: horizontal.eastM,
        northM: horizontal.northM,
        upM: sample.relativeHeightM + verticalDatumM,
      },
      navigationSource: 'GNSS',
      fixStatus: sample.flightState.includes('P-GPS') ? 'VALID' : 'DEGRADED',
      quality: {
        satellitesTracked: sample.satellites,
        confidenceSemantics: 'UNKNOWN',
      },
      provenance: {
        dataset: 'MUN-FRL',
        sequence: 'quarry1',
        sourceRecord: sample.sourceRecord,
        sourceKind: 'MEASURED',
      },
    }
  })
}

export function findClockOffsetMs(
  samples: MunFrlFlightLogSample[],
  truth: GroundTruthFrame[],
  origin: GeodeticPosition,
  rangeMs = 1_500,
  stepMs = 10,
): { offsetMs: number; horizontalRmseM: number } {
  let best = { offsetMs: 0, horizontalRmseM: Number.POSITIVE_INFINITY }
  for (let offsetMs = -rangeMs; offsetMs <= rangeMs; offsetMs += stepMs) {
    const aligned = alignToTruth(
      munFrlCandidateFrames(samples, origin, offsetMs),
      truth,
      110,
    )
    if (aligned.length < samples.length * 0.9) continue
    const rmse = Math.sqrt(
      aligned.reduce((sum, sample) => sum + sample.horizontalErrorM ** 2, 0) /
        aligned.length,
    )
    if (rmse < best.horizontalRmseM) best = { offsetMs, horizontalRmseM: rmse }
  }
  return best
}
