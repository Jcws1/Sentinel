import { expect } from '@playwright/test';
import type { CameraIntent } from '../../src/renderers/contracts';

/** Exact camera ownership, except sub-nanometre Cesium pitch readback noise. */
export function unchangedCamera(actual: CameraIntent, expected: CameraIntent) {
  if (expected.projection !== 'three-d') {
    expect(actual).toEqual(expected);
    return;
  }
  const { pitchFromNadirDeg: actualPitch, ...actualRest } = actual;
  const { pitchFromNadirDeg: expectedPitch, ...expectedRest } = expected;
  expect(actualRest).toEqual(expectedRest);
  if (expectedPitch === undefined) expect(actualPitch).toBeUndefined();
  else {
    expect(Number.isFinite(actualPitch)).toBe(true);
    // Cesium 1.145 Camera.pitch temporarily changes ENU/world transforms even
    // on a read. Position/span/heading/projection remain bit-exact; allow only
    // 64 machine-epsilon units in this derived angular readback (~5e-13 degrees
    // at 35 degrees, <0.1 nanometre over the tested 6 km camera footprint).
    expect(Math.abs(actualPitch! - expectedPitch)).toBeLessThanOrEqual(
      64 * Number.EPSILON * Math.max(1, Math.abs(expectedPitch)),
    );
  }
}
