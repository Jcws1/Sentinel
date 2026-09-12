import { describe, expect, it } from 'vitest';
import {
  groundSpan,
  mercatorLatitude,
  sceneBounds,
  zoomForCamera,
} from '../../src/renderers/camera';
import type { SceneProjection } from '../../src/renderers/contracts';

function emptyScene(): SceneProjection {
  return {
    stale: false,
    objects: [],
    zones: [],
    selection: { status: 'none' },
    unlocatedCount: 0,
  };
}

describe('view-local geographic camera intent', () => {
  it('round-trips operational ground span across latitudes and pane widths', () => {
    for (const latitude of [-75, -24, 0, 1.35, 70]) {
      for (const width of [260, 900, 1920]) {
        for (const zoom of [2, 9, 15]) {
          const camera = {
            center: { longitudeDeg: 103.85, latitudeDeg: latitude },
            groundSpanM: groundSpan(zoom, latitude, width),
            headingTrueDeg: 35,
          };
          expect(zoomForCamera(camera, width)).toBeCloseTo(zoom, 10);
          // Resize keeps geographic span rather than copying an engine zoom number.
          const resizedZoom = zoomForCamera(camera, width * 2);
          expect(groundSpan(resizedZoom, latitude, width * 2)).toBeCloseTo(
            camera.groundSpanM,
            6,
          );
        }
      }
    }
  });

  it('handles zero-size lifecycle measurements and the finite Mercator latitude boundary', () => {
    expect(mercatorLatitude(90)).toBeCloseTo(85.051129, 6);
    expect(mercatorLatitude(-90)).toBeCloseTo(-85.051129, 6);
    expect(mercatorLatitude(-24)).toBe(-24);
    expect(groundSpan(10, 90, 0)).toBeGreaterThan(0);
    expect(
      Number.isFinite(
        zoomForCamera(
          {
            center: { longitudeDeg: 0, latitudeDeg: 90 },
            groundSpanM: 1000,
            headingTrueDeg: 0,
          },
          0,
        ),
      ),
    ).toBe(true);
  });

  it('does not invent an empty-scene extent and uses the declared reference point when supplied', () => {
    const scene = emptyScene();
    expect(sceneBounds(scene)).toBeUndefined();
    const reference = {
      longitudeDeg: 103.85,
      latitudeDeg: 1.35,
      altitude: { metres: 42, reference: 'MSL' as const },
    };
    expect(sceneBounds({ ...scene, referencePoint: reference })).toEqual([
      [103.85, 1.35],
      [103.85, 1.35],
    ]);
  });

  it('frames visible entities and supplied zone extent without mutating scene or including unrelated reference points', () => {
    const scene: SceneProjection = {
      ...emptyScene(),
      objects: [
        {
          ref: { kind: 'entity', id: 'e' },
          trackId: 't',
          label: 'Synthetic point',
          affiliation: 'unknown',
          selected: false,
          stale: false,
          position: {
            longitudeDeg: 5,
            latitudeDeg: -20,
            altitude: { metres: 100, reference: 'MSL' },
          },
        },
      ],
      zones: [
        {
          ref: { kind: 'zone', id: 'z' },
          label: 'Synthetic zone',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1, 2],
                [3, 2],
                [3, 4],
                [1, 4],
                [1, 2],
              ],
            ],
          },
        },
      ],
      referencePoint: {
        longitudeDeg: 120,
        latitudeDeg: 60,
        altitude: { metres: 0, reference: 'MSL' },
      },
    };
    const before = JSON.stringify(scene);
    expect(sceneBounds(scene)).toEqual([
      [1, -20],
      [5, 4],
    ]);
    expect(JSON.stringify(scene)).toBe(before);
  });
});
