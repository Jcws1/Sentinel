import type { MissionTask, OperationalTrack } from '@/data/operations'

export interface WedgetailLaunchPoint {
  box_id: string
  description: string
  lat: number
  long: number
  elevation_m: number
  active: boolean
}

interface LaunchPointResponse {
  status: 'ok' | 'error'
  message: string
  launchpoints?: WedgetailLaunchPoint[]
}

export interface WedgetailTargetPayload {
  azimuth_d: number
  altitude_d: number
  distance_m: number
  speed_m_s: number
  direction_d: number
  unix_timestamp: number
  box_id: string
  label: string
}

export interface WedgetailDispatchResult {
  status: 'ok'
  message: string
  warning?: string
  received: WedgetailTargetPayload
  launchPoint: WedgetailLaunchPoint
}

const API_ROOT = '/wedgetail-sandbox'

const LITTORAL_TARGETS: Omit<WedgetailTargetPayload, 'unix_timestamp'>[] = [
  { azimuth_d: 20, altitude_d: 7, distance_m: 1500, speed_m_s: 28, direction_d: 205, box_id: 'box_3', label: 'LIT01' },
  { azimuth_d: 335, altitude_d: 6, distance_m: 1350, speed_m_s: 25, direction_d: 155, box_id: 'box_3', label: 'LIT02' },
  { azimuth_d: 95, altitude_d: 8, distance_m: 1450, speed_m_s: 31, direction_d: 275, box_id: 'box_2', label: 'LIT03' },
  { azimuth_d: 175, altitude_d: 5, distance_m: 1250, speed_m_s: 23, direction_d: 355, box_id: 'box_1', label: 'LIT04' },
]

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { message?: string }
  if (!response.ok) throw new Error(body.message ?? `Wedgetail sandbox returned HTTP ${response.status}`)
  return body
}

export function toWedgetailTarget(track: OperationalTrack, task: MissionTask, boxId: string): WedgetailTargetPayload {
  const distanceM = track.rangeM ?? Math.max(1, Math.round(track.speedKmh / 3.6 * track.etaSeconds))
  const verticalRatio = Math.min(1, Math.max(0, track.altitudeM / distanceM))
  const elevationDeg = Math.asin(verticalRatio) * 180 / Math.PI
  const label = track.id.replace(/[^a-z0-9]/gi, '').slice(0, 20) || task.id.replace(/[^a-z0-9]/gi, '').slice(0, 20)

  return {
    azimuth_d: track.bearingDeg,
    altitude_d: Math.round(elevationDeg * 10) / 10,
    distance_m: distanceM,
    speed_m_s: Math.round(track.speedKmh / 3.6 * 10) / 10,
    direction_d: track.headingDeg ?? 0,
    unix_timestamp: Math.floor(Date.now() / 1000),
    box_id: boxId,
    label,
  }
}

export async function listWedgetailLaunchPoints(): Promise<WedgetailLaunchPoint[]> {
  const response = await fetch(`${API_ROOT}/launchpoints`, { headers: { Accept: 'application/json' } })
  const body = await readJson<LaunchPointResponse>(response)
  if (body.status !== 'ok' || !body.launchpoints?.length) throw new Error(body.message || 'No Wedgetail launch points are available')
  return body.launchpoints
}

export async function dispatchWedgetailIntercept(task: MissionTask, track: OperationalTrack): Promise<WedgetailDispatchResult> {
  const launchpoints = await listWedgetailLaunchPoints()
  const launchPoint = launchpoints.find((point) => point.box_id === task.launchBoxId && point.active)
    ?? launchpoints.find((point) => point.active)
  if (!launchPoint) throw new Error('No active Wedgetail interceptor box is available')

  const payload = toWedgetailTarget(track, task, launchPoint.box_id)
  const response = await fetch(`${API_ROOT}/addtarget`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await readJson<Omit<WedgetailDispatchResult, 'launchPoint'>>(response)
  if (body.status !== 'ok') throw new Error('Wedgetail sandbox rejected the target')
  return { ...body, launchPoint }
}

export async function dispatchWedgetailLittoralIntercepts(): Promise<WedgetailDispatchResult[]> {
  const launchpoints = await listWedgetailLaunchPoints()
  const launchpointById = new Map(launchpoints.filter((point) => point.active).map((point) => [point.box_id, point]))
  const results: WedgetailDispatchResult[] = []

  for (const target of LITTORAL_TARGETS) {
    const launchPoint = launchpointById.get(target.box_id)
    if (!launchPoint) throw new Error(`Wedgetail launch point ${target.box_id} is unavailable`)
    const payload: WedgetailTargetPayload = { ...target, unix_timestamp: Math.floor(Date.now() / 1000) }
    const response = await fetch(`${API_ROOT}/addtarget`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await readJson<Omit<WedgetailDispatchResult, 'launchPoint'>>(response)
    if (body.status !== 'ok') throw new Error(`Wedgetail sandbox rejected ${payload.label}`)
    results.push({ ...body, launchPoint })
  }

  return results
}
