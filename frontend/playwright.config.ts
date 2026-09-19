import { defineConfig } from '@playwright/test';
const suffix = process.env.SENTINEL_TEST_BUILD_SUFFIX ?? '';
export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results/playwright',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [
    ['list'],
    ['json', { outputFile: './test-results/browser/results.json' }],
  ],
  use: {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Interactive authority headers must never enter captured network traces.
    trace: 'off',
  },
  webServer:
    process.env.SENTINEL_EXTERNAL_TEST_SERVERS === '1'
      ? []
      : [
          {
            command: 'node tests/support/start-backend.mjs',
            url: 'http://127.0.0.1:8011/api/missions',
            reuseExistingServer: false,
          },
          {
            command: `npx vite preview --outDir dist-test${suffix} --host 127.0.0.1 --port 5181 --strictPort`,
            url: 'http://127.0.0.1:5181',
            reuseExistingServer: false,
            env: {
              SENTINEL_API_TARGET: 'http://127.0.0.1:8011',
              SENTINEL_SHARED_PUBLIC: '1',
            },
          },
          {
            command: `npx vite preview --mode verification --outDir dist-verification${suffix} --host 127.0.0.1 --port 5182 --strictPort`,
            url: 'http://127.0.0.1:5182/tests/harness/index.html',
            reuseExistingServer: false,
            env: {
              SENTINEL_API_TARGET: 'http://127.0.0.1:8011',
              SENTINEL_SHARED_PUBLIC: '1',
            },
          },
        ],
});
