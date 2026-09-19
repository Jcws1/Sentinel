import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Cartesian3,
  Cartographic,
  Event as CesiumEvent,
  type Cesium3DTileset,
} from 'cesium';
import { CesiumAdapter } from '../../src/renderers/cesium/CesiumAdapter';

interface SurfaceHarness {
  role: 'map' | 'cockpit';
  cockpitGeometryAt: number;
  scheduleClearance(): void;
  queueGeometryClearance(): void;
  watchGeometryClearance(
    tileset: Cesium3DTileset,
    removers: (() => void)[],
  ): void;
  move(point: { x: number; y: number }, armed?: boolean): void;
  active: boolean;
  disposed: boolean;
  photoVisibleTiles: number;
  photorealistic?: { tilesLoaded: boolean };
  spatial: { displayedBase: string; photorealistic: string };
  surfaceAt: ReturnType<typeof vi.fn>;
}

// Exercise the actual admission/clearance methods without substituting a WebGL
// provider. Live mesh picking is independently exercised in the browser journey.
function harness() {
  const camera = {
    positionWC: Cartesian3.fromDegrees(103.85, 1.29, 35),
    directionWC: new Cartesian3(1, 0, 0),
    upWC: new Cartesian3(0, 0, 1),
    setView: vi.fn((options: { destination: Cartesian3 }) => {
      camera.positionWC = options.destination;
    }),
  };
  const sampleHeight = vi.fn<() => number | undefined>(() => undefined);
  const requestRender = vi.fn();
  const callbacks = {
    cockpitGeometry: vi.fn(),
    announce: vi.fn(),
    directMove: vi.fn(),
    destination: vi.fn(),
  };
  const adapter = Object.assign(Object.create(CesiumAdapter.prototype), {
    role: 'map',
    cockpitGeometryAt: 0,
    active: true,
    disposed: false,
    engineReady: true,
    resourceFailed: false,
    framed: true,
    surfacePicking: false,
    clearanceGeometryRevision: 0,
    sampledGeometryRevision: -1,
    clearancePosition: new Cartesian3(),
    markers: new Map(),
    billboards: {},
    camera: () => ({ groundSpanM: 100 }),
    saveCamera: vi.fn(),
    viewer: {
      camera,
      entities: { values: [] },
      scene: {
        sampleHeightSupported: true,
        sampleHeight,
        requestRender,
        globe: { show: false },
      },
    },
    spatial: { displayedBase: 'photorealistic', photorealistic: 'ready' },
    photorealistic: { tilesLoaded: true },
    photoVisibleTiles: 1,
    surfaceAt: vi.fn(() => Cartesian3.fromDegrees(103.852, 1.291, 31.5)),
    callbacks,
  }) as SurfaceHarness;
  return { adapter, camera, sampleHeight, requestRender, callbacks };
}

describe('Cesium loaded-surface safety', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it('discloses cockpit intersection without relocating its supplied eye, with bounded depth checks', () => {
    const { adapter, camera, sampleHeight, callbacks } = harness();
    adapter.role = 'cockpit';
    sampleHeight.mockReturnValue(100);
    vi.advanceTimersByTime(1001);
    adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(callbacks.cockpitGeometry).toHaveBeenCalledWith(true);
    expect(camera.setView).not.toHaveBeenCalled();
    expect(Cartographic.fromCartesian(camera.positionWC).height).toBeCloseTo(
      35,
    );
    for (let i = 0; i < 100; i++) adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(sampleHeight).toHaveBeenCalledOnce();
  });

  it('rechecks a stationary restored eye when geometry arrives, with bounded samples', () => {
    const { adapter, camera, sampleHeight, requestRender } = harness();
    adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(sampleHeight).toHaveBeenCalledTimes(1);
    expect(camera.setView).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(sampleHeight).toHaveBeenCalledTimes(1);

    // A cold view initially had no mesh. Building geometry arrives around the
    // same eye, without a pointer move or new operational frame.
    sampleHeight.mockReturnValue(60);
    for (let i = 0; i < 20; i++) adapter.queueGeometryClearance();
    vi.advanceTimersByTime(249);
    expect(requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(requestRender).toHaveBeenCalledOnce();
    adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(sampleHeight).toHaveBeenCalledTimes(2);
    expect(camera.setView).toHaveBeenCalledOnce();
    expect(Cartographic.fromCartesian(camera.positionWC).height).toBeCloseTo(
      68,
    );
    expect(camera.setView.mock.calls[0][0]).toMatchObject({
      orientation: { direction: camera.directionWC, up: camera.upWC },
    });
    for (let i = 0; i < 20; i++) adapter.scheduleClearance();
    vi.advanceTimersByTime(1000);
    expect(sampleHeight).toHaveBeenCalledTimes(2);
  });

  it('keeps a safe camera unchanged and defers hidden-view geometry checks until active', () => {
    const { adapter, camera, sampleHeight } = harness();
    sampleHeight.mockReturnValue(20);
    adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    adapter.active = false;
    adapter.queueGeometryClearance();
    vi.advanceTimersByTime(250);
    adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(sampleHeight).toHaveBeenCalledTimes(1);
    adapter.active = true;
    adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(sampleHeight).toHaveBeenCalledTimes(2);
    expect(camera.setView).not.toHaveBeenCalled();
    expect(Cartographic.fromCartesian(camera.positionWC).height).toBeCloseTo(
      35,
    );
    adapter.disposed = true;
    adapter.queueGeometryClearance();
    vi.advanceTimersByTime(300);
    adapter.scheduleClearance();
    vi.advanceTimersByTime(17);
    expect(sampleHeight).toHaveBeenCalledTimes(2);
  });

  it('uses public load/settled events and detaches both with provider ownership', () => {
    const { adapter, requestRender } = harness();
    const events = {
      tileLoad: new CesiumEvent(),
      allTilesLoaded: new CesiumEvent(),
    };
    const removers: (() => void)[] = [];
    adapter.watchGeometryClearance(
      events as unknown as Cesium3DTileset,
      removers,
    );
    events.tileLoad.raiseEvent();
    events.allTilesLoaded.raiseEvent();
    vi.advanceTimersByTime(250);
    expect(requestRender).toHaveBeenCalledOnce();
    removers.forEach((remove) => remove());
    events.tileLoad.raiseEvent();
    events.allTilesLoaded.raiseEvent();
    vi.advanceTimersByTime(500);
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it('blocks coarse initial and refining photo surfaces, then admits a settled roof horizontally', () => {
    const { adapter, callbacks } = harness();
    adapter.spatial.photorealistic = 'loading';
    adapter.move({ x: 50, y: 50 });
    expect(adapter.surfaceAt).not.toHaveBeenCalled();
    expect(callbacks.directMove).not.toHaveBeenCalled();
    expect(callbacks.announce).toHaveBeenLastCalledWith(
      expect.stringContaining('still loading'),
    );

    adapter.spatial.photorealistic = 'ready';
    adapter.photorealistic!.tilesLoaded = false;
    adapter.move({ x: 50, y: 50 }, true);
    expect(callbacks.destination).not.toHaveBeenCalled();
    adapter.photorealistic!.tilesLoaded = true;
    adapter.move({ x: 50, y: 50 });
    expect(callbacks.directMove).toHaveBeenCalledExactlyOnceWith(
      expect.closeTo(103.852, 8),
      expect.closeTo(1.291, 8),
    );
    expect(callbacks.directMove.mock.calls[0]).toHaveLength(2);
  });

  it.each([false, true])(
    'keeps the picked surface when unrelated tiles refine during depth rendering (armed=%s)',
    (armed) => {
      const { adapter, callbacks } = harness();
      adapter.surfaceAt.mockImplementationOnce(() => {
        adapter.photorealistic!.tilesLoaded = false;
        return Cartesian3.fromDegrees(103.852, 1.291, 31.5);
      });
      adapter.move({ x: 50, y: 50 }, armed);
      const callback = armed ? callbacks.destination : callbacks.directMove;
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        expect.closeTo(103.852, 8),
        expect.closeTo(1.291, 8),
      );
      expect(callback.mock.calls[0]).toHaveLength(2);
      expect(callbacks.announce).not.toHaveBeenCalled();
      // The next gesture still requires a ready view. It is never queued for
      // automatic dispatch after loading finishes.
      adapter.move({ x: 60, y: 60 }, armed);
      expect(callback).toHaveBeenCalledOnce();
      adapter.photorealistic!.tilesLoaded = true;
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledOnce();
    },
  );

  it('rejects sky or missing depth and keeps a displayed standard fallback usable', () => {
    const { adapter, callbacks } = harness();
    adapter.surfaceAt.mockReturnValueOnce(undefined);
    adapter.move({ x: 50, y: 50 });
    expect(callbacks.directMove).not.toHaveBeenCalled();
    expect(callbacks.announce).toHaveBeenLastCalledWith(
      expect.stringContaining('No map surface'),
    );
    adapter.spatial = { displayedBase: 'standard', photorealistic: 'error' };
    adapter.photorealistic = undefined;
    adapter.move({ x: 50, y: 50 });
    expect(callbacks.directMove).toHaveBeenCalledOnce();
  });
});
