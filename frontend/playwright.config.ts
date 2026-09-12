import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: '../docs/map-services/evidence/browser-results.json' },
    ],
  ],
  use: {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/start-backend.mjs',
      url: 'http://127.0.0.1:8011/api/missions',
      reuseExistingServer: false,
    },
    {
      command:
        'npx vite preview --outDir dist-test --host 127.0.0.1 --port 5181 --strictPort',
      url: 'http://127.0.0.1:5181',
      reuseExistingServer: false,
      env: { SENTINEL_API_TARGET: 'http://127.0.0.1:8011' },
    },
    {
      command: 'npm run preview:verification',
      url: 'http://127.0.0.1:5182/tests/harness/index.html',
      reuseExistingServer: false,
      env: { SENTINEL_API_TARGET: 'http://127.0.0.1:8011' },
    },
  ],
});
