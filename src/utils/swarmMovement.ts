import type { SimFleetBehaviorRequest } from '../api/simTypes'

export type SwarmDirection =
  | 'north'
  | 'north-east'
  | 'east'
  | 'south-east'
  | 'south'
  | 'south-west'
  | 'west'
  | 'north-west'

const UNIT_VECTORS: Record<SwarmDirection, [number, number]> = {
  north: [0, 1],
  'north-east': [Math.SQRT1_2, Math.SQRT1_2],
  east: [1, 0],
  'south-east': [Math.SQRT1_2, -Math.SQRT1_2],
  south: [0, -1],
  'south-west': [-Math.SQRT1_2, -Math.SQRT1_2],
  west: [-1, 0],
  'north-west': [-Math.SQRT1_2, Math.SQRT1_2],
}

export function swarmVelocity(
  direction: SwarmDirection,
  speedMS: number,
): { eastMS: number; northMS: number } {
  if (!Number.isFinite(speedMS) || speedMS <= 0 || speedMS > 4) {
    throw new Error('Swarm speed must be greater than 0 and at most 4 m/s')
  }
  const [east, north] = UNIT_VECTORS[direction]
  return {
    eastMS: Number((east * speedMS).toFixed(4)),
    northMS: Number((north * speedMS).toFixed(4)),
  }
}

export function buildSwarmMovementRequest(options: {
  formation: 'line' | 'column' | 'wedge' | 'flocking'
  direction: SwarmDirection
  speedMS: number
  spacingM: number
  groupId?: string
}): SimFleetBehaviorRequest {
  if (
    !Number.isFinite(options.spacingM) ||
    options.spacingM < 2 ||
    options.spacingM > 100
  ) {
    throw new Error('Swarm spacing must be between 2 and 100 metres')
  }
  return {
    mode: options.formation,
    spacingM: options.spacingM,
    missionVelocity: swarmVelocity(options.direction, options.speedMS),
    ...(options.groupId ? { groupId: options.groupId } : {}),
  }
}
