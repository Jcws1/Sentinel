import { describe, expect, it } from 'vitest';
import {
  cockpitEnvironmentKey,
  cockpitNotice,
  cockpitPoseAge,
  cockpitReportAge,
  readCockpitEnvironment,
  saveCockpitEnvironment,
} from '../../src/features/cockpit/presentation';
import type { CockpitPhase, CockpitState } from '../../src/world/cockpit';

const provider = {
  imageryAssetId: 2,
  terrainAssetId: 1,
  buildingsAssetId: 96188,
};
function storage(value: string | null = null) {
  const writes: string[][] = [];
  return {
    writes,
    getItem: () => value,
    setItem(key: string, next: string) {
      writes.push([key, next]);
      value = next;
    },
  };
}
const state = (phase: CockpitPhase): CockpitState => ({
  phase,
  status: 'Intentionally unrelated display wording',
  reason: 'Unsupported altitude reference',
  followSelection: false,
  yaw: 0,
  pitch: 0,
  interpolating: false,
});
describe('cockpit lifecycle presentation and explicit environment preference', () => {
  it.each([
    ['non-op', 'VIEW INACTIVE'],
    ['ended', 'DEMO ENDED'],
    ['disconnected', 'CONNECTION LOST'],
    ['stale', 'STALE DATA'],
    ['unavailable', 'VIEW UNAVAILABLE'],
  ] as const)(
    'discloses %s from typed state, without interpreting label strings',
    (phase, title) => {
      expect(cockpitNotice(state(phase))?.title).toBe(title);
    },
  );
  it.each(['ready', 'running', 'paused', 'recorded'] as const)(
    'does not claim loss of connection or unavailable imagery for %s',
    (phase) => expect(cockpitNotice(state(phase))).toBeUndefined(),
  );
  it('only asks for live age on stale/disconnected notices and explains unavailable poses', () => {
    expect(cockpitNotice(state('disconnected'))?.age).toBe(true);
    expect(cockpitNotice(state('stale'))?.age).toBe(true);
    expect(cockpitNotice(state('non-op'))?.age).toBeUndefined();
    expect(cockpitNotice(state('unavailable'))?.detail).toBe(
      'Unsupported altitude reference',
    );
  });
  it('uses Google only when configured, including the ion asset route; default reads never write', () => {
    const local = storage();
    expect(readCockpitEnvironment(provider, local)).toBe('standard');
    expect(
      readCockpitEnvironment({ ...provider, googleKey: 'test' }, local),
    ).toBe('photorealistic');
    expect(
      readCockpitEnvironment(
        { ...provider, token: 'test', photorealisticAssetId: 1 },
        local,
      ),
    ).toBe('photorealistic');
    expect(
      readCockpitEnvironment({ ...provider, photorealisticAssetId: 1 }, local),
    ).toBe('standard');
    expect(local.writes).toEqual([]);
  });
  it('honours explicit choices after reopening and configuration changes, without altering other preferences', () => {
    const local = storage('standard');
    expect(
      readCockpitEnvironment({ ...provider, googleKey: 'test' }, local),
    ).toBe('standard');
    saveCockpitEnvironment('photorealistic', local);
    expect(readCockpitEnvironment(provider, local)).toBe('photorealistic');
    expect(local.writes).toEqual([[cockpitEnvironmentKey, 'photorealistic']]);
  });
  it('tolerates malformed or blocked storage without preventing a configured view', () => {
    const broken = {
      getItem() {
        throw Error('Denied');
      },
      setItem() {
        throw Error('Denied');
      },
    };
    expect(
      readCockpitEnvironment({ ...provider, googleKey: 'test' }, broken),
    ).toBe('photorealistic');
    expect(readCockpitEnvironment(provider, storage('unknown'))).toBe(
      'standard',
    );
    expect(() => saveCockpitEnvironment('standard', broken)).not.toThrow();
  });
  it('keeps pose observation age distinct from fresh source heartbeats', () => {
    const pose = { observedAt: '2026-09-19T01:00:00Z' } as Parameters<
      typeof cockpitPoseAge
    >[0];
    expect(cockpitPoseAge(pose, Date.parse('2026-09-19T01:00:35Z'))).toBe(
      '35 s since pose observation',
    );
    expect(
      cockpitPoseAge(
        { ...pose, reportAt: '2026-09-19T01:00:30Z' },
        Date.parse('2026-09-19T01:00:35Z'),
      ),
    ).toBe('35 s since pose observation');
    expect(
      cockpitReportAge(
        { ...pose, reportAt: '2026-09-19T01:00:30Z' },
        Date.parse('2026-09-19T01:00:35Z'),
      ),
    ).toBe('5 s since source report');
    expect(cockpitPoseAge(pose, Date.parse('2026-09-19T00:59:59Z'))).toBe(
      '0 s since pose observation',
    );
  });
});
