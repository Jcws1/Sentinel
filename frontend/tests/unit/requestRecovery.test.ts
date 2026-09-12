import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestErrorEvent, Resource } from 'cesium';
import {
  RequestRecovery,
  type RequestDiagnostic,
} from '../../src/renderers/cesium/requestRecovery';

const resource = (path = 'content.glb') =>
  ({
    url: `https://tile.example/v1/3dtiles/${path}?key=DO-NOT-RETAIN`,
  }) as Resource;
const error = (statusCode?: number) =>
  ({
    statusCode,
    response: 'PRIVATE RESPONSE',
    message: 'DO-NOT-RETAIN',
  }) as unknown as RequestErrorEvent;

describe('bounded renderer request recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('preserves the callback through actual SDK child-resource cloning with one shared budget', async () => {
    const { Resource: CesiumResource } = await import('cesium');
    const recovery = new RequestRecovery();
    const root = new CesiumResource({
      url: 'https://synthetic.invalid/root.json',
      retryAttempts: 2,
      retryCallback: recovery.retry,
    });
    const children = ['first.glb', 'second.glb'].map((url) =>
      root.getDerivedResource({ url }).clone(),
    );
    for (const child of children) {
      expect(child.retryCallback).toBe(recovery.retry);
      expect(child.retryAttempts).toBe(2);
    }
    const callbacks = children.map((child) =>
      (child.retryCallback as Resource.RetryCallback)(child, error(503)),
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(await Promise.all(callbacks)).toEqual([true, true]);
    expect(recovery.snapshot()).toMatchObject({
      scheduledRetries: 2,
      completedRetries: 2,
      budgetRemaining: 6,
    });
  });

  it('backs off per child resource and never retries more than twice', async () => {
    const recovery = new RequestRecovery();
    const child = resource();
    const first = recovery.retry(child, error(503));
    await vi.advanceTimersByTimeAsync(249);
    expect(recovery.snapshot().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe(true);
    const second = recovery.retry(child, error(503));
    await vi.advanceTimersByTimeAsync(999);
    expect(recovery.snapshot().completedRetries).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toBe(true);
    expect(await recovery.retry(child, error(503))).toBe(false);
    expect(recovery.snapshot()).toMatchObject({
      failures: 3,
      scheduledRetries: 2,
      completedRetries: 2,
      pending: 0,
      budgetRemaining: 6,
    });
  });

  it('bounds a concurrent burst across different tiles to eight per minute', async () => {
    const recovery = new RequestRecovery();
    const retries = Array.from({ length: 12 }, () =>
      recovery.retry(resource(), error(429)),
    );
    expect(recovery.snapshot()).toMatchObject({
      scheduledRetries: 8,
      budgetRemaining: 0,
      pending: 8,
    });
    await vi.advanceTimersByTimeAsync(250);
    expect((await Promise.all(retries)).filter(Boolean)).toHaveLength(8);
    await vi.advanceTimersByTimeAsync(59_749);
    expect(await recovery.retry(resource(), error(503))).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const nextWindow = recovery.retry(resource(), error(503));
    await vi.advanceTimersByTimeAsync(250);
    expect(await nextWindow).toBe(true);
    expect(recovery.snapshot().scheduledRetries).toBe(9);
  });

  it.each([
    [401, 'auth', false],
    [403, 'auth', false],
    [400, 'other', false],
    [404, 'other', false],
    [429, 'rate-limit', true],
    [408, 'network', true],
    [0, 'network', true],
    [undefined, 'network', true],
    [500, 'service', true],
    [599, 'service', true],
    [600, 'other', false],
    [NaN, 'other', false],
  ])(
    'classifies %s without interpreting raw errors',
    async (status, category, allowed) => {
      const diagnostics: RequestDiagnostic[] = [];
      const recovery = new RequestRecovery({
        onDiagnostic: (value) => diagnostics.push(value),
      });
      const result = recovery.retry(resource('root.json'), error(status));
      await vi.runAllTimersAsync();
      expect(await result).toBe(allowed);
      expect(diagnostics[0]).toMatchObject({ stage: 'root', category });
      const serialized = JSON.stringify({
        diagnostics,
        snapshot: recovery.snapshot(),
      });
      expect(serialized).not.toContain('DO-NOT-RETAIN');
      expect(serialized).not.toContain('tile.example');
      expect(serialized).not.toContain('PRIVATE RESPONSE');
      expect(serialized).not.toContain('root.json');
    },
  );

  it('cancels pending retries on pause or disposal without resetting its budget', async () => {
    const recovery = new RequestRecovery();
    const beforeHide = recovery.retry(resource(), error(503));
    recovery.setActive(false);
    expect(await beforeHide).toBe(false);
    expect(await recovery.retry(resource(), error(503))).toBe(false);
    expect(recovery.snapshot()).toMatchObject({
      pending: 0,
      budgetRemaining: 7,
    });
    recovery.setActive(true);
    const beforeDispose = recovery.retry(resource(), error(503));
    recovery.dispose();
    expect(await beforeDispose).toBe(false);
    recovery.setActive(true);
    expect(await recovery.retry(resource(), error(503))).toBe(false);
    await vi.runAllTimersAsync();
    expect(recovery.snapshot()).toMatchObject({
      active: false,
      disposed: true,
      pending: 0,
      scheduledRetries: 2,
      completedRetries: 0,
      budgetRemaining: 6,
    });
  });

  it('rechecks an environment generation guard when a delayed retry wakes', async () => {
    let current = true;
    const recovery = new RequestRecovery({ mayRetry: () => current });
    const pending = recovery.retry(resource(), error(500));
    current = false;
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(recovery.snapshot().recent.at(-1)?.action).toBe('cancelled');
  });

  it('handles synchronous owner disposal from a diagnostic callback', async () => {
    const recovery = new RequestRecovery({
      onDiagnostic: () => recovery.dispose(),
    });
    expect(await recovery.retry(resource(), error(503))).toBe(false);
    expect(recovery.snapshot().pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors a bounded Retry-After and declines longer automatic waits', async () => {
    const recovery = new RequestRecovery();
    const limited = { ...error(429), responseHeaders: { 'Retry-After': '3' } };
    const pending = recovery.retry(resource(), limited);
    await vi.advanceTimersByTimeAsync(2999);
    expect(recovery.snapshot().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(true);
    expect(
      await recovery.retry(resource(), {
        ...error(429),
        responseHeaders: { 'Retry-After': '120' },
      }),
    ).toBe(false);
    expect(recovery.snapshot().pending).toBe(0);
    expect(recovery.snapshot().scheduledRetries).toBe(1);
  });

  it('retains a bounded immutable diagnostic snapshot and no old resources', async () => {
    const recovery = new RequestRecovery();
    await recovery.retry(resource(), error(403));
    const captured = recovery.snapshot();
    for (let count = 0; count < 40; count++)
      await recovery.retry(resource(), error(400));
    expect(captured.recent).toHaveLength(1);
    expect(captured.recent[0].category).toBe('auth');
    expect(Object.isFrozen(captured.recent[0])).toBe(true);
    expect(recovery.snapshot().recent).toHaveLength(16);
    expect(recovery.snapshot().budgetRemaining).toBe(8);
    expect(await recovery.retry(undefined, error(500))).toBe(false);
  });
});
