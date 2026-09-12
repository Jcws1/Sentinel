import { describe, expect, it } from 'vitest';
import { constrainCamera, regionalMissions } from '../../src/renderers/regions';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';

describe('Regional presentation and orientation', () => {
  it('limits only the explicitly identified mission and never mutates source camera intent', () => {
    const source = {
      center: { longitudeDeg: 115, latitudeDeg: 40 },
      groundSpanM: 5_000_000,
      headingTrueDeg: 24,
    };
    expect(regionalMissions['fixture-alpha']).toBeUndefined();
    expect(regionalMissions['fixture-bravo']).toBeUndefined();
    expect(constrainCamera(source)).toBe(source);
    expect(
      constrainCamera(source, regionalMissions['fixture-tactical']),
    ).toEqual({
      center: { longitudeDeg: 105.5, latitudeDeg: 7 },
      groundSpanM: 1_100_000,
      headingTrueDeg: 24,
    });
    expect(source.center.latitudeDeg).toBe(40);
    expect(
      constrainCamera(
        { ...source, groundSpanM: 0 },
        regionalMissions['fixture-tactical'],
      ).groundSpanM,
    ).toBe(150);
  });
  it('keeps independent pane and per-projection pitches with shared geographic intent', () => {
    const bridge = new WorkspaceBridge();
    bridge.setMapCamera('tactical', 'fixture-tactical', {
      center: { longitudeDeg: 103.8, latitudeDeg: 1.3 },
      groundSpanM: 2000,
      headingTrueDeg: 15,
      projection: 'tactical',
      pitchFromNadirDeg: 55,
    });
    bridge.setMapMode('tactical', 'three-d');
    expect(
      bridge.getMapCamera('tactical', 'fixture-tactical')?.pitchFromNadirDeg,
    ).toBeUndefined();
    bridge.setMapCamera('tactical', 'fixture-tactical', {
      center: { longitudeDeg: 103.9, latitudeDeg: 1.3 },
      groundSpanM: 2200,
      headingTrueDeg: 25,
      projection: 'three-d',
      pitchFromNadirDeg: 40,
    });
    bridge.setMapMode('tactical', 'tactical');
    expect(bridge.getMapCamera('tactical', 'fixture-tactical')).toMatchObject({
      center: { longitudeDeg: 103.9 },
      pitchFromNadirDeg: 55,
      headingTrueDeg: 25,
    });
    expect(bridge.getMapCamera('three-d', 'fixture-tactical')).toBeUndefined();
    expect(bridge.getMapCamera('tactical', 'fixture-bravo')).toBeUndefined();
    bridge.dispose();
  });
});
