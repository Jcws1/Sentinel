// Task-owned isolated services. No raw provider diagnostics or credentials are logged.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

export async function withIsolatedRuntime(options, run) {
  const {
    tag,
    frontendPort = 5315,
    backendPort = 8115,
    configured = false,
    previewDir,
    evidenceRoot,
    backendDirectory,
    backendModule = 'app.main:app',
  } = options;
  if (!/^[a-z0-9-]+$/.test(tag)) throw Error('Invalid task tag');
  const output = resolve(evidenceRoot ?? 'test-results/performance', tag);
  const database = resolve(`.cache/verification-${tag}-${process.pid}.sqlite3`);
  mkdirSync(output, { recursive: true });
  mkdirSync('.cache', { recursive: true });
  const children = [],
    logs = [],
    report = {
      frontend: `http://127.0.0.1:${frontendPort}`,
      apiTarget: `http://127.0.0.1:${backendPort}`,
      database,
      configured,
    };
  const free = (port) =>
    new Promise((ok, reject) => {
      const s = net.createServer();
      s.once('error', () =>
        reject(Error(`Port ${port} occupied; existing service preserved`)),
      );
      s.listen(port, '127.0.0.1', () => s.close(ok));
    });
  const start = (command, args, opts = {}) => {
    const fd = openSync(resolve(output, `service-${children.length}.log`), 'w');
    logs.push(fd);
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', fd, fd],
      ...opts,
    });
    children.push(child);
    return child;
  };
  const startBackend = () =>
    start(
      resolve(
        '../backend/.venv',
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
      ),
      [
        '-m',
        'uvicorn',
        backendModule,
        '--host',
        '127.0.0.1',
        '--port',
        String(backendPort),
      ],
      {
        cwd: resolve(backendDirectory ?? '../backend'),
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          SENTINEL_DEMO: '1',
          SENTINEL_FIXTURES: '1',
          SENTINEL_DB_PATH: database,
        },
      },
    );
  try {
    await free(frontendPort);
    await free(backendPort);
    let backend = startBackend();
    const env = {
      ...process.env,
      SENTINEL_API_TARGET: report.apiTarget,
      SENTINEL_SHARED_PUBLIC: '1',
    };
    if (!configured)
      Object.assign(env, {
        VITE_TACTICAL_PROVIDER: 'maptiler',
        VITE_MAPTILER_KEY: '',
        VITE_CESIUM_ION_TOKEN: '',
        VITE_GOOGLE_MAPS_API_KEY: '',
        VITE_CESIUM_PHOTOREALISTIC_ASSET_ID: '0',
      });
    start(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        ...(previewDir
          ? ['preview', '--outDir', previewDir]
          : ['--mode', 'verification']),
        '--host',
        '127.0.0.1',
        '--port',
        String(frontendPort),
        '--strictPort',
      ],
      { env },
    );
    for (let i = 0; i < 120; i++) {
      try {
        const response = await globalThis.fetch(
          `${report.frontend}/api/interactive/entry`,
        );
        if (response.ok) {
          const entry = await response.json();
          if (entry.enabled) {
            report.entry = entry;
            break;
          }
        }
      } catch {
        /* Owned services starting. */
      }
      await sleep(250);
    }
    if (!report.entry?.enabled || report.entry.activeMissionId)
      throw Error('Isolated API entry preflight failed');
    report.pids = children.map((c) => c.pid);
    writeFileSync(
      resolve(output, 'preflight.json'),
      JSON.stringify(report, null, 2),
    );
    const restartBackend = async () => {
      backend.kill();
      for (
        let i = 0;
        i < 100 && backend.exitCode === null && backend.signalCode === null;
        i++
      )
        await sleep(100);
      if (backend.exitCode === null && backend.signalCode === null)
        throw Error('Owned backend did not stop; second writer refused');
      await free(backendPort);
      backend = startBackend();
      report.pids = children.map((c) => c.pid);
    };
    return await run({ ...report, output, restartBackend });
  } finally {
    children.forEach((c) => c.kill());
    for (
      let i = 0;
      i < 100 &&
      children.some((c) => c.exitCode === null && c.signalCode === null);
      i++
    )
      await sleep(100);
    report.servicesStopped = children.every(
      (c) => c.exitCode !== null || c.signalCode !== null,
    );
    // A Windows launcher can exit before its actual listener. Never open a
    // second database writer merely because the launcher's exit was observed.
    for (const port of [frontendPort, backendPort]) {
      try {
        await free(port);
      } catch {
        report.servicesStopped = false;
      }
    }
    if (report.servicesStopped && children.length) {
      const cleanup = spawnSync(
        resolve(
          '../backend/.venv',
          process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
        ),
        [resolve('../scripts/end_test_demo.py'), database, '--delete'],
        { windowsHide: true, encoding: 'utf8', timeout: 20000 },
      );
      report.cleanupOk = cleanup.status === 0;
      try {
        report.cleanup = JSON.parse(cleanup.stdout);
      } catch {
        report.cleanup = { result: 'Cleanup failed; inspect task database' };
      }
    }
    logs.forEach(closeSync);
    writeFileSync(
      resolve(output, 'cleanup.json'),
      JSON.stringify(report, null, 2),
    );
    if (!report.servicesStopped || (children.length && !report.cleanupOk))
      process.exitCode = 1;
  }
}
