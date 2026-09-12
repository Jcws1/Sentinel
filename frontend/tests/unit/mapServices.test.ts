import { describe, expect, it } from 'vitest';
import { assetId, cesiumProvider } from '../../src/renderers/cesium/config';
import { visualHeight } from '../../src/renderers/cesium/altitude';
import {
  configuredProvider,
  defaultTacticalStyle,
  hasTacticalCredentials,
  resourceUrl,
} from '../../src/renderers/providers';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';

describe('map services configuration and boundaries', () => {
  it('fills public defaults without creating credentials or provider requests', () => {
    expect(defaultTacticalStyle).toBe(
      'https://api.maptiler.com/maps/streets-v4/style.json',
    );
    expect(hasTacticalCredentials({ styleUrl: defaultTacticalStyle })).toBe(
      false,
    );
    expect(hasTacticalCredentials({ styleUrl: '/synthetic/style.json' })).toBe(
      true,
    );
    expect(configuredProvider.styleUrl).toBeTruthy();
    expect(cesiumProvider).toMatchObject({
      imageryAssetId: 2,
      terrainAssetId: 1,
      buildingsAssetId: 96188,
    });
  });
  it('validates public asset IDs and explicitly disables zero or malformed values', () => {
    expect(assetId(undefined, 2)).toBe(2);
    expect(assetId('3954', 2)).toBe(3954);
    for (const value of [
      '0',
      '-1',
      'NaN',
      '1.5',
      'https://bad',
      '999999999999999999999',
    ])
      expect(assetId(value, 2)).toBeNull();
  });
  it('restricts key propagation to HTTPS MapTiler resources and preserves placeholders', () => {
    const tile = resourceUrl(
      'https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf',
      'synthetic-test-key',
    );
    expect(tile).toContain('{z}/{x}/{y}.pbf?key=synthetic-test-key');
    for (const url of [
      'http://api.maptiler.com/test',
      'https://api.maptiler.com.evil.test/test',
      'https://unrelated.test/tile',
    ])
      expect(resourceUrl(url, 'synthetic-test-key')).not.toContain(
        'synthetic-test-key',
      );
  });
  it('keeps MSL explicitly approximate and preserves source values', () => {
    const source = Object.freeze({
      reference: 'MSL' as const,
      metres: 120,
      datumId: 'EGM96',
    });
    expect(visualHeight(source)).toEqual({
      metres: 120,
      quality: 'approximate-msl',
    });
    expect(source).toEqual({ reference: 'MSL', metres: 120, datumId: 'EGM96' });
    expect(
      visualHeight({ reference: 'ELLIPSOID', metres: 151, datumId: 'WGS84' }),
    ).toEqual({ metres: 151, quality: 'ellipsoid' });
    expect(
      visualHeight({
        reference: 'ELLIPSOID',
        metres: 151,
        datumId: 'unrecognised',
      }),
    ).toBeUndefined();
  });
  it('never interprets missing AGL terrain as zero; zero sampled ground is valid', () => {
    const source = { reference: 'AGL' as const, metres: 35 };
    expect(visualHeight(source)).toBeUndefined();
    expect(visualHeight(source, NaN)).toBeUndefined();
    expect(visualHeight(source, 0)).toEqual({
      metres: 35,
      quality: 'terrain-relative',
    });
    expect(visualHeight(source, 22)).toEqual({
      metres: 57,
      quality: 'terrain-relative',
    });
  });
  it('keeps modes and cameras view-local, retains reopening preference and isolates mission cameras', () => {
    const bridge = new WorkspaceBridge();
    const other = bridge.openAnotherMap('tactical')!;
    bridge.setMapMode('tactical', 'three-d');
    bridge.setMapCamera('tactical', 'alpha', {
      center: { longitudeDeg: 103, latitudeDeg: 1 },
      groundSpanM: 1000,
      headingTrueDeg: 45,
    });
    expect(bridge.getMapMode(other)).toBe('tactical');
    expect(bridge.getMapCamera(other, 'alpha')).toBeUndefined();
    expect(bridge.getMapCamera('tactical', 'bravo')).toBeUndefined();
    bridge.close('tactical');
    bridge.open('tactical');
    expect(bridge.getMapMode('tactical')).toBe('three-d');
    expect(bridge.getViewTitle('tactical')).toBe('3D Map');
    bridge.dispose();
  });
});
