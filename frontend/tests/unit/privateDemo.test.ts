import { afterEach, expect, it, vi } from 'vitest';
import { privateDemoConnection } from '../../src/services/privateDemo';

const base = 'https://backend.example.test/api';
const key = 'test_only_' + 'x'.repeat(32);
afterEach(() => vi.unstubAllGlobals());

it('requires a secure API endpoint and valid key', () => {
  for (const url of [
    'http://backend.example.test/api',
    'https://u:p@backend.example.test/api',
    base + '?secret=1',
    base + '#hash',
  ])
    expect(() => privateDemoConnection(url, key)).toThrow();
  expect(() => privateDemoConnection(base, 'short')).toThrow();
});

it('sends authorization only to the configured API with redirects disabled', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const connection = privateDemoConnection(base, key);
  await connection.fetcher!(base + '/missions');
  const [url, init] = fetcher.mock.calls[0];
  expect(url).not.toContain(key);
  expect(init.headers.get('Authorization')).toBe('Bearer ' + key);
  expect(init.redirect).toBe('error');
  expect(init.credentials).toBe('omit');
  expect(() => connection.fetcher!('https://evil.test/api/missions')).toThrow();
  expect(() =>
    connection.fetcher!('https://backend.example.test/not-api'),
  ).toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('passes WebSocket credentials as a subprotocol, never a URL parameter', () => {
  const calls: unknown[][] = [];
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor(...args: unknown[]) {
        calls.push(args);
      }
      close() {}
    },
  );
  const connection = privateDemoConnection(base, key);
  connection.createSocket!(
    'wss://backend.example.test/api/missions/demo/stream',
  );
  expect(calls).toEqual([
    [
      'wss://backend.example.test/api/missions/demo/stream',
      ['sentinel-v1', 'auth.' + key],
    ],
  ]);
  expect(() =>
    connection.createSocket!('wss://evil.test/api/stream'),
  ).toThrow();
});
