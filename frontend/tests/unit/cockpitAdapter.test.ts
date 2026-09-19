import { expect, it, vi } from 'vitest';
import { CesiumAdapter } from '../../src/renderers/cesium/CesiumAdapter';
import type { CockpitCameraFrame } from '../../src/renderers/cesium/cockpitCamera';

it('applies a queued hidden pose on resume and skips only already-applied camera work', () => {
  const setView = vi.fn();
  const adapter = Object.assign(Object.create(CesiumAdapter.prototype), {
    role: 'cockpit',
    active: true,
    disposed: false,
    resourceFailed: false,
    callbacks: { cockpitGeometry: vi.fn() },
    applyLighting: vi.fn(),
    viewer: {
      camera: { setView },
      clock: {},
      scene: { requestRender: vi.fn() },
    },
  }) as CesiumAdapter;
  const first: CockpitCameraFrame = {
    bindingKey: 'first',
    missionId: 'mission',
    frameId: 'frame-1',
    sequence: 1,
    effectiveAt: '2026-09-18T00:00:00Z',
    position: {
      longitudeDeg: 103.85,
      latitudeDeg: 1.29,
      altitude: { metres: 150, reference: 'ELLIPSOID', datumId: 'WGS84' },
    },
    headingTrueDeg: 90,
    yaw: 0,
    pitch: 0,
  };
  adapter.setCockpitPose(first);
  expect(setView).toHaveBeenCalledTimes(1);
  // Model the host's actual resume order: queue latest pose, then activate/apply.
  Object.assign(adapter, { active: false });
  const next = {
    ...first,
    bindingKey: 'second',
    frameId: 'frame-2',
    position: { ...first.position, longitudeDeg: 103.86 },
    headingTrueDeg: 180,
  };
  adapter.setCockpitPose(next);
  expect(setView).toHaveBeenCalledTimes(1);
  Object.assign(adapter, { active: true });
  adapter.setCockpitPose(next);
  expect(setView).toHaveBeenCalledTimes(2);
  expect(setView.mock.calls[1][0].destination).not.toEqual(
    setView.mock.calls[0][0].destination,
  );
  adapter.setCockpitPose(next);
  expect(setView).toHaveBeenCalledTimes(2);
});
