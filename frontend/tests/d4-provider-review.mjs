// Real configured provider rehearsal; never log URLs, headers, keys or raw errors.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import net from 'node:net';
import process from 'node:process';
import { URL } from 'node:url';
const output = resolve('../docs/d4/provider-final');
mkdirSync(output, { recursive: true });
const database = resolve(`.cache/d4-browser-provider-${process.pid}.sqlite3`);
const children = [],
  logs = [],
  report = {
    frontend: 'http://127.0.0.1:5296',
    apiTarget: 'http://127.0.0.1:8096',
    requests: {},
    stages: [],
  };
let browser,
  page,
  step = 'preflight';
async function free(port) {
  await new Promise((ok, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => s.close(ok));
  });
}
function start(command, args, options) {
  const fd = openSync(
    resolve(output, `service-${process.pid}-${children.length}.log`),
    'a',
  );
  logs.push(fd);
  const child = spawn(command, args, {
    windowsHide: true,
    stdio: ['ignore', fd, fd],
    ...options,
  });
  children.push(child);
}
async function capture(name) {
  step = name;
  report.stages.push({
    name,
    mapText: await page.locator('.tactical-view').first().innerText(),
  });
  await page.screenshot({ path: resolve(output, `${name}.png`) });
}
try {
  await free(8096);
  await free(5296);
  const providerBuild = resolve(`.cache/d4-provider-build-${process.pid}`);
  const built = spawnSync(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--mode',
      'verification',
      '--outDir',
      providerBuild,
    ],
    { windowsHide: true, stdio: 'ignore', env: process.env },
  );
  if (built.status !== 0) throw Error('Provider build unavailable');
  start(
    resolve('../backend/.venv/Scripts/python.exe'),
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8096'],
    {
      cwd: resolve('../backend'),
      env: { ...process.env, SENTINEL_DEMO: '1', SENTINEL_DB_PATH: database },
    },
  );
  start(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      providerBuild,
      '--mode',
      'verification',
      '--host',
      '127.0.0.1',
      '--port',
      '5296',
      '--strictPort',
    ],
    {
      env: { ...process.env, SENTINEL_API_TARGET: report.apiTarget },
    },
  );
  for (let i = 0; i < 120; i++) {
    try {
      const r = await globalThis.fetch(
        `${report.frontend}/api/interactive/entry`,
      );
      if (r.ok && (await r.json()).enabled) {
        report.entryEnabled = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await sleep(250);
  }
  if (!report.entryEnabled) throw Error('Entry unavailable');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(25000);
  page.on('response', (r) => {
    const host = new URL(r.url()).hostname;
    if (host === '127.0.0.1') return;
    const key = `${host} HTTP ${r.status()}`;
    report.requests[key] = (report.requests[key] ?? 0) + 1;
  });
  page.on('requestfailed', (r) => {
    const host = new URL(r.url()).hostname;
    if (host === '127.0.0.1') return;
    const code = r.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED';
    const key = `${host} ${code}`;
    report.requests[key] = (report.requests[key] ?? 0) + 1;
  });
  step = 'new-demo';
  await page.goto(report.frontend);
  await page
    .getByRole('button', { name: 'New demo', exact: true })
    .first()
    .click();
  await page.locator('[data-run-state="running"]').first().waitFor();
  await sleep(8000);
  await page
    .getByRole('button', { name: 'Pause', exact: true })
    .first()
    .click();
  await page.locator('[data-run-state="paused"]').first().waitFor();
  await capture('01-tactical-provider');
  const map = page.locator('.tactical-view').first();
  await map.getByRole('button', { name: '3D', exact: true }).click();
  await sleep(18000);
  await capture('02-standard-3d');
  await map.getByRole('button', { name: 'Map layers', exact: true }).click();
  const google = page.getByRole('menuitemradio', {
    name: /Google photorealistic/,
  });
  report.googleConfigured = await google.isEnabled();
  if (report.googleConfigured) {
    await google.click();
    await sleep(25000);
    await capture('03-google-3d');
  } else await page.keyboard.press('Escape');
  step = 'end';
  await page
    .getByRole('button', { name: 'Simulation', exact: true })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'End demo', exact: true }).click();
  await page.locator('[data-run-state="ended"]').first().waitFor();
  report.ended = true;
} catch (e) {
  report.failure = { step, type: e.name };
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const c of children) c.kill();
  for (
    let i = 0;
    i < 50 &&
    children.some((c) => c.exitCode === null && c.signalCode === null);
    i++
  )
    await sleep(100);
  report.servicesStopped = children.every(
    (c) => c.exitCode !== null || c.signalCode !== null,
  );
  if (report.servicesStopped) {
    const cleanup = spawnSync(
      resolve('../backend/.venv/Scripts/python.exe'),
      [resolve('../docs/d4/cleanup_runtime.py'), database],
      { windowsHide: true, encoding: 'utf8', timeout: 15000 },
    );
    report.cleanupOk = cleanup.status === 0;
  }
  for (const fd of logs) closeSync(fd);
  writeFileSync(
    resolve(output, 'result.json'),
    JSON.stringify(report, null, 2),
  );
  globalThis.console.log(
    JSON.stringify({
      stages: report.stages.map((s) => s.name),
      ended: report.ended,
      servicesStopped: report.servicesStopped,
      cleanupOk: report.cleanupOk,
      failure: report.failure,
    }),
  );
}
