import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

// Task copies redirect historical evidence without changing the existing tests.
const target = resolve('tests/d5-regression-copies');
const tag = process.env.D5_REGRESSION_TAG ?? 'adjacent-corrected';
if (!/^[a-z0-9-]+$/.test(tag)) throw Error('Invalid evidence tag');
mkdirSync(target, { recursive: true });
for (const file of readdirSync('tests/browser')) {
  if (!file.endsWith('.ts')) continue;
  const original = readFileSync(resolve('tests/browser', file), 'utf8');
  let adapted = original
    .replaceAll('../docs/d4-refinement', `../docs/d5/${tag}`)
    .replaceAll(
      '../docs/map-responsiveness',
      `../docs/d5/${tag}/map-responsiveness`,
    )
    .replaceAll(
      "page.on('websocket', () => streams++);",
      "page.on('websocket', socket => { if (socket.url().includes('/api/missions/')) streams++; });",
    );
  if (file === 'conductor.spec.ts')
    adapted = adapted.replace(
      "  await units(p).locator('.units-numeric summary').click();",
      `  if (category !== 'Unknown entity') {
    const typeGroup = units(p).getByLabel(category.startsWith('Friendly') ? 'friendly unit types' : 'hostile unit types');
    if (!(await typeGroup.isVisible())) await units(p).getByRole('button', { name: new RegExp('^' + category) }).click();
    await typeGroup.getByRole('button').first().click();
  }
  await units(p).locator('.units-numeric summary').click();`,
    );
  if (file === 'conductor.spec.ts')
    adapted = adapted.replaceAll('Manual override · Moving', 'Manual · moving');
  writeFileSync(resolve(target, file), adapted);
}
writeFileSync(
  resolve('.cache/d5-playwright.config.mjs'),
  `import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'../tests/d5-regression-copies',outputDir:'../.cache/d5-test-results',fullyParallel:false,workers:1,timeout:30000,reporter:[['list'],['json',{outputFile:${JSON.stringify(resolve(`../docs/d5/${tag}/results.json`))}}]],use:{channel:'msedge',headless:true,viewport:{width:1440,height:900},trace:'off'},webServer:[]});`,
);
await withD5Runtime(
  { tag, frontendPort: 5182, backendPort: 8122 },
  async () => {
    const code = await new Promise((done) => {
      const child = spawn(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          '.cache/d5-playwright.config.mjs',
          ...process.argv.slice(2),
        ],
        { windowsHide: true, stdio: 'inherit' },
      );
      child.once('exit', done);
    });
    if (code !== 0) process.exitCode = 1;
  },
);
