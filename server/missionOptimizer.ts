import { randomUUID } from 'node:crypto'
import type { Drone, Position } from '../src/types'
import type {
  AssignmentPlan,
  MissionAssignment,
  OperationalObjective,
} from '../src/types/missionPlanning'

const INFEASIBLE = 1_000_000_000

function distanceMeters(a: Position, b: Position): number {
  const dLat = (a.lat - b.lat) * 111_320
  const dLng =
    (a.lng - b.lng) *
    111_320 *
    Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

function capabilities(drone: Drone): Set<string> {
  const values = new Set<string>(['hold', 'return', 'patrol'])
  if (drone.type === 'Interceptor') {
    values.add('intercept')
    values.add('escort')
  }
  if (drone.type === 'Scout') {
    values.add('camera')
    values.add('recon')
    values.add('escort')
  }
  if (drone.type === 'Relay') {
    values.add('relay')
    values.add('comms')
  }
  return values
}

function missionCapability(type: OperationalObjective['type']): string {
  return {
    patrol_route: 'patrol',
    recon_area: 'recon',
    relay_position: 'relay',
    intercept_track: 'intercept',
    escort_group: 'escort',
    hold: 'hold',
    return: 'return',
  }[type]
}

function pairCost(
  drone: Drone,
  objective: OperationalObjective,
): { cost: number; etaSeconds: number | null; reasons: string[] } | null {
  const reserve = objective.batteryReservePercent ?? 20
  if (drone.comms === 'lost' || drone.battery <= reserve) return null
  if (
    drone.lifecycle === 'FAULT' ||
    drone.lifecycle === 'SPAWNING' ||
    drone.lifecycle === 'INITIALIZING'
  ) {
    return null
  }
  const available = capabilities(drone)
  const required = new Set([
    missionCapability(objective.type),
    ...objective.requiredCapabilities,
  ])
  if ([...required].some((value) => !available.has(value))) return null
  if (drone.type === 'Relay' && objective.type !== 'relay_position') return null

  const distance = objective.targetPosition
    ? distanceMeters(drone.position, objective.targetPosition)
    : 0
  const speed = drone.type === 'Interceptor' ? 28 : drone.type === 'Scout' ? 16 : 10
  const etaSeconds = objective.targetPosition
    ? Math.max(1, Math.round(distance / speed))
    : null
  const distanceCost = Math.round(distance / 5)
  const batteryCost = Math.round((100 - drone.battery) * 20)
  const linkCost = drone.comms === 'weak' ? 800 : 0
  const navCost = Math.round((100 - drone.positioningConfidence) * 10)
  const cost = distanceCost + batteryCost + linkCost + navCost
  return {
    cost,
    etaSeconds,
    reasons: [
      `${Math.round(distance)} m from objective`,
      `${Math.round(drone.battery)}% battery`,
      `${drone.comms} link`,
      `${drone.positioningMethod} ${drone.positioningConfidence}%`,
    ],
  }
}

/**
 * Rectangular Hungarian minimization. Rows must not exceed columns.
 * Returns the selected column index for every row.
 */
function hungarian(cost: number[][]): number[] {
  const rowCount = cost.length
  if (rowCount === 0) return []
  const columnCount = cost[0].length
  if (rowCount > columnCount) throw new Error('Hungarian matrix requires rows <= columns')
  const u = new Array<number>(rowCount + 1).fill(0)
  const v = new Array<number>(columnCount + 1).fill(0)
  const p = new Array<number>(columnCount + 1).fill(0)
  const way = new Array<number>(columnCount + 1).fill(0)

  for (let row = 1; row <= rowCount; row += 1) {
    p[0] = row
    let column0 = 0
    const min = new Array<number>(columnCount + 1).fill(Infinity)
    const used = new Array<boolean>(columnCount + 1).fill(false)
    do {
      used[column0] = true
      const row0 = p[column0]
      let delta = Infinity
      let column1 = 0
      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue
        const current = cost[row0 - 1][column - 1] - u[row0] - v[column]
        if (current < min[column]) {
          min[column] = current
          way[column] = column0
        }
        if (min[column] < delta) {
          delta = min[column]
          column1 = column
        }
      }
      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          u[p[column]] += delta
          v[column] -= delta
        } else {
          min[column] -= delta
        }
      }
      column0 = column1
    } while (p[column0] !== 0)

    do {
      const column1 = way[column0]
      p[column0] = p[column1]
      column0 = column1
    } while (column0 !== 0)
  }

  const assignment = new Array<number>(rowCount).fill(-1)
  for (let column = 1; column <= columnCount; column += 1) {
    if (p[column] !== 0) assignment[p[column] - 1] = column - 1
  }
  return assignment
}

export function optimizeAssignments(
  objectives: OperationalObjective[],
  drones: Drone[],
): AssignmentPlan {
  const slots = objectives.flatMap((objective) =>
    Array.from({ length: Math.max(0, objective.minVehicles) }, (_, index) => ({
      objective,
      index,
    })),
  )
  const columns = [
    ...drones.map((drone) => ({ kind: 'drone' as const, drone })),
    ...slots.map((_slot, index) => ({ kind: 'dummy' as const, index })),
  ]
  const details = new Map<string, ReturnType<typeof pairCost>>()
  const matrix = slots.map(({ objective }) =>
    columns.map((column) => {
      if (column.kind === 'dummy') {
        return 1_000_000 + Math.max(0, objective.priority) * 10_000
      }
      const detail = pairCost(column.drone, objective)
      details.set(`${objective.id}:${column.drone.id}`, detail)
      return detail?.cost ?? INFEASIBLE
    }),
  )
  const selectedColumns = hungarian(matrix)
  const assignments: MissionAssignment[] = []
  const unfilledObjectiveIds: string[] = []
  let totalCost = 0
  slots.forEach(({ objective }, row) => {
    const column = columns[selectedColumns[row]]
    if (!column || column.kind === 'dummy' || matrix[row][selectedColumns[row]] >= INFEASIBLE) {
      unfilledObjectiveIds.push(objective.id)
      return
    }
    const detail = details.get(`${objective.id}:${column.drone.id}`)
    if (!detail) {
      unfilledObjectiveIds.push(objective.id)
      return
    }
    totalCost += detail.cost
    assignments.push({
      objectiveId: objective.id,
      vehicleId: column.drone.id,
      cost: detail.cost,
      etaSeconds: detail.etaSeconds,
      reasons: detail.reasons,
    })
  })

  const authority = objectives.some(
    (objective) =>
      objective.type === 'intercept_track' || objective.priority >= 90,
  )
    ? 'OPERATOR_CONFIRM'
    : 'AUTO_EXECUTE'
  return {
    id: randomUUID(),
    createdAt: Date.now(),
    status: authority === 'AUTO_EXECUTE' ? 'AUTO_EXECUTED' : 'PROPOSED',
    authority,
    assignments,
    unfilledObjectiveIds: [...new Set(unfilledObjectiveIds)],
    totalCost,
    summary: `${assignments.length}/${slots.length} required slots allocated; ${authority === 'AUTO_EXECUTE' ? 'policy permits automatic execution' : 'operator confirmation required'}.`,
  }
}
