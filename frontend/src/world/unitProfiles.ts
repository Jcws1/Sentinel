import type { UnitPlacement, UnitProfile } from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';

export const unitProfiles = {
  'hornet-10-v1': {
    label: 'Quadcopter / strike',
    cruiseKmh: 80,
    pursuitKmh: 120,
  },
  'sting-v1': { label: 'STING interceptor', cruiseKmh: 170, pursuitKmh: 280 },
  'lancet-3-v1': { label: 'Lancet-3', cruiseKmh: 110, pursuitKmh: 110 },
  'shahed-136-v1': { label: 'Shahed-136', cruiseKmh: 185, pursuitKmh: 185 },
} as const;
export const profileOptions = {
  friendly: ['hornet-10-v1', 'sting-v1'],
  hostile: ['hornet-10-v1', 'lancet-3-v1', 'shahed-136-v1'],
  unknown: [],
} as const;
export function placementSpeed(unit: Pick<UnitPlacement, 'profileId'>) {
  return (unit.profileId ? unitProfiles[unit.profileId].cruiseKmh : 155) / 3.6;
}
export function validateProfiles(
  profiles?: DeepReadonly<Record<string, UnitProfile>>,
) {
  for (const p of Object.values(profiles ?? {})) {
    const expected = unitProfiles[p.id];
    if (
      !expected ||
      p.label !== expected.label ||
      p.cruiseMps !== expected.cruiseKmh / 3.6 ||
      p.pursuitMps !== expected.pursuitKmh / 3.6
    )
      throw new Error('Versioned unit profile values changed.');
  }
}
