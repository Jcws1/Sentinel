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
const targetCount = Number.parseInt(process.env.WEDGETAIL_TARGET_COUNT || '3', 10);
if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 3) {
  console.error('WEDGETAIL_TARGET_COUNT must be an integer from 1 to 3.');
  process.exit(2);
}
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
const labelPrefix = `S${String(Date.now()).slice(-7)}`;

try {
  await page.goto(VIEWER, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    () => window.simState === 'idle' && window.liveSandboxSocket?.readyState === WebSocket.OPEN,
    null,
    { timeout: 30_000 },
  );

  const labels = [];
  for (let index = 0; index < targetCount; index += 1) {
    const label = `${labelPrefix}${index + 1}`;
    const target = {
      azimuth_d: 180,
      altitude_d: 15,
      distance_m: 1400,
      speed_m_s: 100,
      direction_d: 0,
      unix_timestamp: Math.floor(Date.now() / 1000),
      box_id: `box_${index + 1}`,
      label,
    };
    const accepted = await fetch(`${API}/sandbox/addtarget`, {
      method: 'POST',
      headers: { 'X-API-Key': wedgetailKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
    });
    const receipt = await accepted.json();
    if (!accepted.ok || receipt.status !== 'ok') {
      throw new Error(`Wedgetail rejected target ${index + 1} (${accepted.status}): ${receipt.message || 'unknown error'}`);
    }
    labels.push(label);
    console.log(`Wedgetail accepted ${label} for box_${index + 1} at ${receipt.received?.unix_timestamp ?? target.unix_timestamp}.`);
  }

  const seenTargets = new Set();
  const terminalTargets = new Set();
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
    for (const item of observed.objects) {
      if (!labels.includes(item.label)) continue;
      seenTargets.add(item.label);
      if (['intercepted', 'hit', 'lost', 'cleared'].includes(item.state)) terminalTargets.add(item.label);
    }

    const response = await fetch(`${SENTINEL}/wedgetail/observation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sentinelKey}`,
        Origin: 'https://sentinel-wedgetail-demo.vercel.app',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runId,
        missionName: `Wedgetail live API · ${targetCount} vs ${targetCount} hosted simulator`,
        viewerUrl: VIEWER,
        ...observed,
      }),
    });
    if (!response.ok) throw new Error(`Sentinel observation ingest failed (${response.status}): ${await response.text()}`);
    lastSequence = (await response.json()).sequence;

    if (terminalTargets.size === targetCount && observed.simState === 'idle') break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (seenTargets.size !== targetCount || terminalTargets.size !== targetCount)
    throw new Error(`Hosted viewer exposed ${seenTargets.size}/${targetCount} targets and ${terminalTargets.size}/${targetCount} terminal outcomes before timeout.`);
  console.log(`Sentinel observed ${targetCount}/${targetCount} targets through terminal outcomes at sequence ${lastSequence} (${runId}).`);
} finally {
  await browser.close();
}
