import type { RuntimeDependencies } from '../app/runtime';
import type { StreamSocket } from './worldStream';

export function privateDemoConnection(
  base: string,
  token: string,
): RuntimeDependencies {
  const api = new URL(base);
  if (
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    !api.pathname.endsWith('/api')
  )
    throw new Error('Private demo requires an HTTPS API URL ending in /api.');
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token))
    throw new Error('Invalid access key format.');
  const allowedPath = api.pathname + '/';
  const check = (input: string, socket = false) => {
    const target = new URL(input);
    if (
      target.protocol !== (socket ? 'wss:' : 'https:') ||
      target.host !== api.host ||
      !target.pathname.startsWith(allowedPath) ||
      target.username ||
      target.password
    )
      throw new Error(
        'Refusing to send private credentials to another endpoint.',
      );
  };
  return {
    apiBase: api.toString(),
    fetcher: (input, init) => {
      check(input);
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(input, {
        ...init,
        headers,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      });
    },
    createSocket: (url) => {
      check(url, true);
      const browser = new WebSocket(url, ['sentinel-v1', `auth.${token}`]);
      const socket: StreamSocket = {
        onmessage: null,
        onerror: null,
        onclose: null,
        close: () => browser.close(),
      };
      browser.onmessage = (event) => socket.onmessage?.({ data: event.data });
      browser.onerror = () => socket.onerror?.();
      browser.onclose = () => socket.onclose?.();
      return socket;
    },
  };
}

export function publicDemoConnection(base: string): RuntimeDependencies {
  const api = new URL(base);
  if (
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    !api.pathname.endsWith('/api')
  )
    throw new Error('Public demo requires an HTTPS API URL ending in /api.');
  const allowedPath = api.pathname + '/';
  const check = (input: string, socket = false) => {
    const target = new URL(input);
    if (
      target.protocol !== (socket ? 'wss:' : 'https:') ||
      target.host !== api.host ||
      !target.pathname.startsWith(allowedPath) ||
      target.username ||
      target.password
    )
      throw new Error('Refusing to connect to another endpoint.');
  };
  return {
    apiBase: api.toString(),
    fetcher: (input, init) => {
      check(input);
      return fetch(input, {
        ...init,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      });
    },
    createSocket: (url) => {
      check(url, true);
      const browser = new WebSocket(url, ['sentinel-v1']);
      const socket: StreamSocket = {
        onmessage: null,
        onerror: null,
        onclose: null,
        close: () => browser.close(),
      };
      browser.onmessage = (event) => socket.onmessage?.({ data: event.data });
      browser.onerror = () => socket.onerror?.();
      browser.onclose = () => socket.onclose?.();
      return socket;
    },
  };
}

export async function requestPrivateAccess(
  base: string,
): Promise<RuntimeDependencies> {
  // Access keys live only in this page's memory, never in build variables,
  // browser storage, query strings or telemetry. Reload to discard the key.
  const container = document.getElementById('root')!;
  const form = document.createElement('form');
  form.style.cssText =
    'max-width:440px;margin:12vh auto;padding:32px;background:#121c26;color:#edf5ff;border:1px solid #436077;border-radius:12px;font:16px/1.6 system-ui';
  form.innerHTML =
    '<h1>Private Sentinel demo</h1><p>Live sandbox observations only. Enter the access key provided by the demo owner.</p><label for="demo-key">Access key</label><input id="demo-key" type="password" autocomplete="off" required style="display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:10px"><button type="submit">Connect</button><p role="status" aria-live="polite"></p><small>The key is kept only in page memory. Reload to sign out.</small>';
  container.replaceChildren(form);
  const input = form.querySelector('input')!;
  const button = form.querySelector('button')!;
  const status = form.querySelector('[role="status"]')!;
  return new Promise((resolve) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      button.disabled = true;
      status.textContent = 'Connecting…';
      try {
        const connection = privateDemoConnection(base, input.value.trim());
        const response = await connection.fetcher!(base + '/missions', {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Access rejected');
        input.value = '';
        container.replaceChildren();
        resolve(connection);
      } catch {
        input.value = '';
        status.textContent =
          'Unable to connect. Check the access key or backend availability.';
        button.disabled = false;
      }
    };
    input.focus();
  });
}
