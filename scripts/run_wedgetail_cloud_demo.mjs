/**
 * Operator-side bridge for the hosted Wedgetail sandbox.
 *
 * The script submits a real /sandbox/addtarget request, then observes the
 * unmodified hosted viewer's own shaheds/interceptors arrays. It does not
 * calculate movement, collision, interception, or success.
 */
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = 'https://wedgetail-dynamics.com';
const VIEWER = `${API}/sim/?livesandbox=true`;
const SENTINEL = process.env.SENTINEL_CLOUD_API || 'https://sentinel-wedgetail-api.onrender.com/api';
const sentinelKey = process.env.SENTINEL_DEMO_TOKEN?.trim();
const wedgetailKey = process.env.WEDGETAIL_SANDBOX_API_KEY?.trim();
if (!sentinelKey || !wedgetailKey) {
  console.error('Set SENTINEL_DEMO_TOKEN and WEDGETAIL_SANDBOX_API_KEY.');
  process.exit(2);
}

const headless = process.env.HEADLESS !== 'false';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
// The operator environment may block jsDelivr's TLS chain. Fulfil the exact
// Three.js 0.128.0 assets locally without changing the hosted viewer code.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeRoot = path.join(repo, '.cache', 'wedgetail', 'node_modules', 'three');
await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/**', async (route) => {
  const marker = '/three@0.128.0/';
  const relative = new URL(route.request().url()).pathname.split(marker)[1];
  try {
    await route.fulfill({ body: await readFile(path.join(threeRoot, relative)), contentType: 'application/javascript' });
  } catch {
    await route.abort('failed');
  }
});
const runId = `wedgetail-live-${Date.now()}`;
const label = `Sentinel${String(Date.now()).slice(-8)}`;

try {
  await page.goto(VIEWER, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    () => window.simState === 'idle' && window.liveSandboxSocket?.readyState === WebSocket.OPEN,
    null,
    { timeout: 30_000 },
  );

  const target = {
    azimuth_d: 180,
    altitude_d: 15,
    distance_m: 1400,
    speed_m_s: 100,
    direction_d: 0,
    unix_timestamp: Math.floor(Date.now() / 1000),
    box_id: 'box_1',
    label,
  };
  const accepted = await fetch(`${API}/sandbox/addtarget`, {
    method: 'POST',
    headers: { 'X-API-Key': wedgetailKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(target),
  });
  const receipt = await accepted.json();
  if (!accepted.ok || receipt.status !== 'ok') {
    throw new Error(`Wedgetail rejected target (${accepted.status}): ${receipt.message || 'unknown error'}`);
  }
  console.log(`Wedgetail accepted ${label} at ${receipt.received?.unix_timestamp ?? target.unix_timestamp}.`);

  let sawTarget = false;
  let sawTerminal = false;
  let lastSequence = null;
  const deadline = Date.now() + 55_000;
  while (Date.now() < deadline) {
    const observed = await page.evaluate(() => {
      const pos = (mesh) => [mesh.position.x, mesh.position.y, mesh.position.z];
      const mapInterceptorState = (state) => {
        if (state === 'bay') return 'bay';
        if (state === 'expended') return 'expended';
        return state === 'doors_opening' || state === 'ascending' ? 'launching' : 'flying';
      };
      return {
        at: new Date().toISOString(),
        simState: window.simState,
        stats: { ...window.stats },
        objects: [
          ...window.shaheds.map((item) => ({
            id: item.id,
            label: item.remoteSubmitted?.label || item.id,
            side: 'hostile',
            state: item.state,
            position: pos(item.mesh),
          })),
          ...window.interceptors.map((item) => ({
            id: `wedgetail-${item.idx + 1}`,
            label: `Wedgetail Interceptor ${item.idx + 1}`,
            side: 'friendly',
            state: mapInterceptorState(item.state),
            position: pos(item.mesh),
            target: item.targetShahed?.id || undefined,
          })),
        ],
      };
    });
    const targetObject = observed.objects.find((item) => item.label === label);
    sawTarget ||= Boolean(targetObject);
    sawTerminal ||= Boolean(targetObject && ['intercepted', 'hit', 'lost', 'cleared'].includes(targetObject.state));

    const response = await fetch(`${SENTINEL}/wedgetail/observation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sentinelKey}`,
        Origin: 'https://sentinel-wedgetail-demo.vercel.app',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ runId, viewerUrl: VIEWER, ...observed }),
    });
    if (!response.ok) throw new Error(`Sentinel observation ingest failed (${response.status}): ${await response.text()}`);
    lastSequence = (await response.json()).sequence;

    if (sawTerminal && observed.simState === 'idle') break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!sawTarget || !sawTerminal) throw new Error('Hosted viewer did not expose a complete target outcome before timeout.');
  console.log(`Sentinel observed ${label} through terminal outcome at sequence ${lastSequence} (${runId}).`);
} finally {
  await browser.close();
}
