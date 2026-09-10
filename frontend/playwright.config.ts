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
      { outputFile: '../docs/ui-refinement/verification/browser-results.json' },
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
      command: 'npm run preview',
      url: 'http://127.0.0.1:5181',
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview:verification',
      url: 'http://127.0.0.1:5182/tests/harness/index.html',
      reuseExistingServer: false,
    },
  ],
});
