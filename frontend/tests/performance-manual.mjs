import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { withD5Runtime } from './d5-runtime.mjs';
import { performanceScenario } from './performance-scenario.mjs';
import { request } from '@playwright/test';
import process from 'node:process';

await withD5Runtime(
  {
    phase: 'd6',
    tag: process.argv[2] ?? 'perf-manual-after',
    frontendPort: 5371,
    backendPort: 8171,
    configured: true,
    evidenceRoot: '../docs/performance-stability',
  },
  async ({ frontend, output }) => {
    const api = await request.newContext();
    try {
      const response = await api.post(frontend + '/api/scenarios', {
        data: {
          requestId: randomUUID(),
          expectedRevision: 0,
          content: performanceScenario(20),
        },
      });
      if (!response.ok()) throw Error('Scenario setup failed');
    } finally {
      await api.dispose();
    }
    globalThis.console.log('Manual isolated UI ready: ' + frontend);
    for (let i = 0; i < 2400 && !existsSync(resolve(output, 'stop')); i++)
      await sleep(500);
  },
);
