import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { withD5Runtime } from './d5-runtime.mjs';

const copied = resolve('.cache/performance-browser-tests');
const chromeOnly = process.env.PERF_CHROME_ONLY === '1';
const evidenceName = chromeOnly
  ? 'browser-regressions-chrome'
  : 'browser-regressions';
mkdirSync(copied, { recursive: true });
for (const file of readdirSync('tests/browser')) {
  if (!file.endsWith('.ts')) continue;
  const source = readFileSync(resolve('tests/browser', file), 'utf8');
  // Preserve assertions and test logic, redirect historical evidence writes only.
  writeFileSync(
    resolve(copied, file),
    source
      .replaceAll('../docs/', `../docs/performance-stability/${evidenceName}/`)
      .replaceAll(
        `../docs/performance-stability/${evidenceName}/d4-refinement/regressions/chrome-refinement/before-geometry.json`,
        '../docs/chrome-refinement/before-geometry.json',
      ),
  );
}
writeFileSync(
  '.cache/performance-playwright.config.mjs',
  `import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:${JSON.stringify(copied)},workers:1,fullyParallel:false,timeout:30000,
reporter:[['list'],['json',{outputFile:${JSON.stringify(resolve(`../docs/performance-stability/${evidenceName}/result.json`))}}]],
use:{channel:'msedge',headless:true,viewport:{width:1440,height:900},trace:'off'},
outputDir:${JSON.stringify(resolve(`../docs/performance-stability/${evidenceName}/test-output`))}});
`,
);
await withD5Runtime(
  {
    phase: 'd6',
    tag: chromeOnly ? 'perf-regressions-chrome' : 'perf-regressions',
    frontendPort: 5181,
    backendPort: 8011,
    previewDir: 'dist-performance-production',
    viteConfig: '.cache/performance-preview.mjs',
    evidenceRoot: '../docs/performance-stability',
  },
  async () => {
    await new Promise((ok, no) => {
      const s = net.createServer();
      s.once('error', no);
      s.listen(5182, '127.0.0.1', () => s.close(ok));
    });
    const preview = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--outDir',
        'dist-performance-after',
        '--config',
        '.cache/performance-preview.mjs',
        '--host',
        '127.0.0.1',
        '--port',
        '5182',
        '--strictPort',
      ],
      {
        windowsHide: true,
        stdio: 'ignore',
        env: { ...process.env, SENTINEL_API_TARGET: 'http://127.0.0.1:8011' },
      },
    );
    try {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try {
          if ((await globalThis.fetch('http://127.0.0.1:5182')).ok) {
            ready = true;
            break;
          }
        } catch {
          /* Starting */
        }
        await sleep(200);
      }
      if (!ready) throw Error('Owned verification preview did not start');
      const tests = spawn(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          '.cache/performance-playwright.config.mjs',
          ...(chromeOnly
            ? ['chrome.spec.ts', '--grep', 'compact header reclaims']
            : [
                'retention.spec.ts',
                'map-recovery.spec.ts',
                'fleet-details.spec.ts',
                'scenarios.spec.ts',
                'scenario-authoring.spec.ts',
                'conductor.spec.ts',
                'chrome.spec.ts',
              ]),
        ],
        { windowsHide: true, stdio: 'inherit' },
      );
      const code = await new Promise((ok) => tests.once('exit', ok));
      if (code !== 0) process.exitCode = 1;
    } finally {
      preview.kill();
      await new Promise((ok) =>
        preview.exitCode !== null ? ok() : preview.once('exit', ok),
      );
    }
  },
);
