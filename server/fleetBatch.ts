import type {
  SimBatchSpawnRequest,
  SimSpawnRequest,
} from '../src/api/simTypes'

const VEHICLE_ID = /^[A-Za-z][A-Za-z0-9_-]{1,47}$/

export function buildBatchSpawnRequests(
  request: SimBatchSpawnRequest,
): SimSpawnRequest[] {
  const count = Number(request.count)
  const spacingM = Number(request.spacingM ?? 6)
  const prefix = String(request.idPrefix ?? '').trim().replace(/_+$/, '')
  if (!Number.isInteger(count) || count < 1 || count > 32) {
    throw new Error('Vehicle count must be an integer from 1 to 32')
  }
  if (!Number.isFinite(spacingM) || spacingM < 1 || spacingM > 100) {
    throw new Error('Spawn spacing must be between 1 and 100 metres')
  }
  if (!VEHICLE_ID.test(prefix)) {
    throw new Error(
      'ID prefix must start with a letter and contain only letters, numbers, _ or -',
    )
  }
  if (!request.platformId) throw new Error('Platform type is required')
  if (
    request.pose.length !== 6 ||
    request.pose.some((component) => !Number.isFinite(component))
  ) {
    throw new Error('Spawn pose must contain six finite ENU values')
  }

  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const vehicleId =
      count === 1 ? prefix : `${prefix}_${String(index + 1).padStart(2, '0')}`
    if (!VEHICLE_ID.test(vehicleId)) {
      throw new Error(`Generated vehicle ID is invalid or too long: ${vehicleId}`)
    }
    return {
      vehicleId,
      platformId: request.platformId,
      displayName: count === 1 ? request.displayName : undefined,
      role: request.role,
      groupId: request.groupId,
      controlBackend: 'gazebo_velocity',
      pose: [
        request.pose[0] + (column - (columns - 1) / 2) * spacingM,
        request.pose[1] + (row - (rows - 1) / 2) * spacingM,
        request.pose[2],
        request.pose[3],
        request.pose[4],
        request.pose[5],
      ],
    }
  })
}
