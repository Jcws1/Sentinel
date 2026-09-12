import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CesiumAdapter } from '../../src/renderers/cesium/CesiumAdapter';

type Layer = 'imagery' | 'terrain' | 'buildings';
interface LayerHarness {
  loadLayer<T>(
    layer: Layer,
    task: (isCurrent: () => boolean) => Promise<T>,
    install: (value: T, onFailure: () => void) => void,
    discard?: (value: T) => void,
  ): Promise<void>;
  retryProvider(): void;
  loadStandardLayer(layer: Layer): void;
  generation: number;
  layerGenerations: Record<Layer, number>;
  spatial: Record<Layer, string>;
}

// Exercise real asynchronous layer ownership without constructing a WebGL viewer.
function harness() {
  return Object.assign(Object.create(CesiumAdapter.prototype), {
    disposed: false,
    engineReady: true,
    resourceFailed: false,
    generation: 1,
    layerGenerations: { imagery: 0, terrain: 0, buildings: 0 },
    layerRemovers: { imagery: [], terrain: [], buildings: [] },
    timers: new Map(),
    pendingLayerFailures: new Set(),
    failureTasks: new Set(),
    terrainHeights: new Map(),
    sampling: new Set(),
    presentation: { environment: 'standard' },
    spatial: {
      imagery: 'disabled',
      terrain: 'disabled',
      buildings: 'disabled',
    },
    viewer: {
      imageryLayers: { remove: vi.fn() },
      scene: { requestRender: vi.fn(), primitives: { remove: vi.fn() } },
    },
    draw: vi.fn(),
    publish: vi.fn(),
  }) as LayerHarness;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('independent Cesium standard layer recovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('discards an old timeout completion while a newer retry is pending', async () => {
    const adapter = harness();
    const old = deferred<string>();
    const current = deferred<string>();
    const oldInstall = vi.fn(),
      oldDiscard = vi.fn(),
      newInstall = vi.fn();
    const first = adapter.loadLayer(
      'imagery',
      () => old.promise,
      oldInstall,
      oldDiscard,
    );
    await vi.advanceTimersByTimeAsync(12001);
    expect(adapter.spatial.imagery).toBe('error');
    const second = adapter.loadLayer(
      'imagery',
      () => current.promise,
      newInstall,
    );
    old.resolve('expired resource');
    await first;
    expect(oldInstall).not.toHaveBeenCalled();
    expect(oldDiscard).toHaveBeenCalledWith('expired resource');
    expect(adapter.spatial.imagery).toBe('loading');
    current.resolve('current resource');
    await second;
    expect(newInstall).toHaveBeenCalledOnce();
    expect(newInstall.mock.calls[0][0]).toBe('current resource');
    expect(adapter.spatial.imagery).toBe('ready');
  });

  it('ignores a queued old failure after retry begins', async () => {
    const adapter = harness();
    let failOld!: () => void;
    await adapter.loadLayer(
      'imagery',
      async () => 'old',
      (_, fail) => {
        failOld = fail;
      },
    );
    failOld();
    await adapter.loadLayer('imagery', async () => 'new', vi.fn());
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.spatial.imagery).toBe('ready');
  });

  it('keeps healthy layer failure callbacks valid when another layer retries', async () => {
    const adapter = harness();
    let failImagery!: () => void;
    await adapter.loadLayer(
      'imagery',
      async () => 'imagery',
      (_, fail) => {
        failImagery = fail;
      },
    );
    const imageryGeneration = adapter.layerGenerations.imagery;
    await adapter.loadLayer('terrain', async () => 'terrain', vi.fn());
    expect(adapter.layerGenerations.imagery).toBe(imageryGeneration);
    failImagery();
    // Destruction must wait until Cesium's event stack has returned.
    expect(adapter.spatial.imagery).toBe('ready');
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.spatial.imagery).toBe('error');
    expect(adapter.spatial.terrain).toBe('ready');
  });

  it('retries only failed standard services without invalidating the environment', () => {
    const adapter = harness();
    adapter.spatial = {
      imagery: 'ready',
      terrain: 'error',
      buildings: 'ready',
    };
    adapter.loadStandardLayer = vi.fn();
    const generation = adapter.generation;
    adapter.retryProvider();
    expect(adapter.loadStandardLayer).toHaveBeenCalledExactlyOnceWith(
      'terrain',
    );
    expect(adapter.generation).toBe(generation);
    expect(adapter.spatial.imagery).toBe('ready');
    expect(adapter.spatial.buildings).toBe('ready');
  });
});
