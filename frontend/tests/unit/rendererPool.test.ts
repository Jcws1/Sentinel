import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RendererPool,
  retentionPolicy,
} from '../../src/renderers/rendererPool';
import type { MapMode, MapRenderer } from '../../src/renderers/contracts';

const pools: RendererPool[] = [];
function create() {
  const pool = new RendererPool();
  pools.push(pool);
  return pool;
}
function renderer(options: { ready?: boolean; bytes?: number } = {}) {
  return {
    setActive: vi.fn(),
    canRetain: vi.fn(() => options.ready ?? true),
    retainedBytes: vi.fn(() => options.bytes ?? 0),
    captureCamera: vi.fn(),
    restoreCamera: vi.fn(),
    setScene: vi.fn(),
    setMode: vi.fn(),
    setPresentation: vi.fn(),
    recenter: vi.fn(),
    overview: vi.fn(),
    focusSelection: vi.fn(),
    retryProvider: vi.fn(),
    dispose: vi.fn(),
  } satisfies MapRenderer;
}
function install(
  pool: RendererPool,
  view: string,
  mode: MapMode = 'tactical',
  bytes = 0,
) {
  const lease = pool.acquire(view, mode, document)!;
  const engine = renderer({ bytes });
  expect(pool.install(lease, engine)).toBe(true);
  document.body.append(lease.host);
  return { lease, engine };
}
afterEach(() => {
  pools.splice(0).forEach((pool) => pool.dispose());
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('bounded renderer resource leases', () => {
  it('resumes the same healthy lease, detached from inactive UI without disposing it', () => {
    const pool = create();
    const { lease, engine } = install(pool, 'map');
    pool.release(lease);
    expect(engine.setActive).toHaveBeenCalledWith(false);
    expect(engine.dispose).not.toHaveBeenCalled();
    expect(lease.host.isConnected).toBe(false);
    expect(pool.inspect()).toMatchObject({ alive: 1, active: 0, hidden: 1 });
    expect(pool.acquire('map', 'tactical', document)).toBe(lease);
    expect(pool.inspect()).toMatchObject({ alive: 1, active: 1, hidden: 0 });
  });
  it('immediately disposes abandoned loads and rejects late installation', () => {
    const pool = create();
    const lease = pool.acquire('map', 'three-d', document)!;
    pool.release(lease);
    const late = renderer();
    expect(pool.install(lease, late)).toBe(false);
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(pool.inspect().alive).toBe(0);
  });
  it('retains no more than one hidden renderer per projection, evicting the older one', () => {
    const pool = create();
    const first = install(pool, 'a');
    pool.release(first.lease);
    const second = install(pool, 'b');
    pool.release(second.lease);
    expect(first.engine.dispose).toHaveBeenCalledOnce();
    const third = install(pool, 'c', 'three-d');
    pool.release(third.lease);
    expect(pool.inspect()).toMatchObject({ alive: 2, hidden: 2 });
    expect(second.engine.dispose).not.toHaveBeenCalled();
  });
  it('counts pending constructors toward a hard capacity and evicts hidden resources first', () => {
    const pool = create();
    const hidden = install(pool, 'hidden');
    pool.release(hidden.lease);
    for (let i = 0; i < 3; i++)
      pool.acquire(`pending-${i}`, 'three-d', document);
    expect(pool.acquire('fourth-visible', 'tactical', document)).toBeDefined();
    expect(hidden.engine.dispose).toHaveBeenCalledOnce();
    expect(pool.acquire('fifth-visible', 'tactical', document)).toBeUndefined();
    expect(pool.inspect()).toMatchObject({ alive: 4, active: 4, hidden: 0 });
  });
  it('expires hidden resources after 120 seconds without running their engines', () => {
    vi.useFakeTimers();
    const pool = create();
    const { lease, engine } = install(pool, 'map', 'three-d');
    pool.release(lease);
    vi.advanceTimersByTime(retentionPolicy.hiddenTtlMs - 1);
    expect(engine.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(engine.dispose).toHaveBeenCalledOnce();
    expect(engine.setActive).toHaveBeenCalledTimes(1);
    expect(pool.inspect().alive).toBe(0);
  });
  it('evicts excess accounted hidden cache bytes without claiming total GPU memory', () => {
    const pool = create();
    const { lease, engine } = install(
      pool,
      'large',
      'three-d',
      retentionPolicy.hiddenBytes + 1,
    );
    pool.release(lease);
    expect(engine.dispose).toHaveBeenCalledOnce();
    expect(pool.inspect().accountedHiddenBytes).toBe(0);
  });
  it('closes both projections immediately and disposal is idempotent', () => {
    const pool = create();
    const tactical = install(pool, 'map');
    pool.release(tactical.lease);
    const cesium = install(pool, 'map', 'three-d');
    pool.closeView('map');
    pool.closeView('map');
    pool.dispose();
    expect(tactical.engine.dispose).toHaveBeenCalledOnce();
    expect(cesium.engine.dispose).toHaveBeenCalledOnce();
    expect(pool.acquire('map', 'tactical', document)).toBeUndefined();
  });
  it('records hidden status and evicts a newly failed lease outside its engine callback', async () => {
    const pool = create();
    const { lease, engine } = install(pool, 'map');
    pool.release(lease);
    engine.canRetain.mockReturnValue(false);
    pool.status(lease, { kind: 'renderer-error', reason: 'context-lost' });
    expect(lease.status.kind).toBe('renderer-error');
    expect(engine.dispose).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });
});
