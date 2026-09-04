import type { Platform } from '@/types/swarm'

/* ===========================================================================
   PLATFORMS — airframe spec sheets.

   Manufacturer figures, converted to SI once, here, so nothing downstream
   does arithmetic on a unit it had to guess. Published km/h becomes m/s at
   this boundary and is converted back only for display.

   The published numbers are qualified: range and endurance depend on battery
   capacity, weather, payload weight and how the operator flies. They are a
   type certificate, not a promise about the aircraft on the pad — which is
   why a Drone carries its own live endurance rather than reading it here.
=========================================================================== */

const KMH = 1 / 3.6

export const STING: Platform = {
  id: 'sting',
  name: 'STING',
  manufacturer: 'Wild Hornet',
  role: 'FPV interceptor',

  // Published 140–170 km/h.
  cruiseSpeedMs: [140 * KMH, 170 * KMH],
  // Published 280 km/h. Reachable, but it burns the endurance below.
  maxSpeedMs: 280 * KMH,
  climbRateMs: 30,

  serviceCeilingM: 5000,
  maxCeilingM: 7000,

  maxRangeM: 37000,
  // 18.5 km — the one that bounds tasking, because it includes coming back.
  combatRadiusM: 18500,

  enduranceCruiseS: 15 * 60,
  enduranceDashS: 6 * 60,

  payloadG: 500,
  mtowKg: 4,

  battery: '8s3p',
  controlLink: 'ELRS',
  videoLink: 'HV digital / analog',
}

export const PLATFORMS: readonly Platform[] = [STING]

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]))

/**
 * Throws on an unknown id, unlike getDrone below.
 *
 * A platform id comes from our own table, never from the wire: a miss is a
 * programming error and should fail where it is introduced, not render a
 * detail panel full of blanks.
 */
export function getPlatform(id: string): Platform {
  const platform = BY_ID.get(id)
  if (!platform) throw new Error(`Unknown platform: ${id}`)
  return platform
}
