// Direct child ownership avoids orphaned Windows shell wrappers during test teardown.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { setTimeout, clearTimeout } from 'node:timers';
const suffix = process.env.SENTINEL_TEST_BUILD_SUFFIX ?? '';
const output = resolve('test-results/browser');
mkdirSync(output, { recursive: true });
mkdirSync('.cache', { recursive: true });
const children = [],
  logs = [];
let ownedDatabase;
async function free(port) {
  return new Promise((ok, reject) => {
    const s = net.createServer();
    s.once('error', () =>
      reject(
        Error(
          `Test port ${port} is occupied; no existing service was touched.`,
        ),
      ),
    );
    s.listen(port, '127.0.0.1', () => s.close(ok));
  });
}
function start(command, args, options = {}) {
  const fd = openSync(
    resolve(output, `server-${process.pid}-${children.length}.log`),
    'a',
  );
  logs.push(fd);
  const c = spawn(command, args, {
    windowsHide: true,
    stdio: ['ignore', fd, fd],
    ...options,
  });
  children.push(c);
  return c;
}
try {
  for (const port of [8011, 5181, 5182]) await free(port);
  const db = resolve(`.cache/verification-browser-${process.pid}.sqlite3`);
  ownedDatabase = db;
  start(
    resolve(
      '../backend/.venv',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    ),
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8011'],
    {
      cwd: resolve('../backend'),
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        SENTINEL_DEMO: '1',
        SENTINEL_FIXTURES: '1',
        SENTINEL_DB_PATH: db,
      },
    },
  );
  for (const [port, dir, mode] of [
    [5181, `dist-test${suffix}`, 'production'],
    [5182, `dist-verification${suffix}`, 'verification'],
  ])
    start(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--mode',
        mode,
        '--outDir',
        dir,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      {
        env: {
          ...process.env,
          SENTINEL_API_TARGET: 'http://127.0.0.1:8011',
          SENTINEL_SHARED_PUBLIC: '1',
        },
      },
    );
  let entry;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await globalThis.fetch(
        'http://127.0.0.1:5182/api/interactive/entry',
      );
      if (response.ok) {
        entry = await response.json();
        break;
      }
    } catch {
      // The owned backend and proxy may still be starting.
    }
    await sleep(250);
  }
  if (!entry?.enabled)
    throw Error(
      'Isolated frontend proxy did not reach a demo-enabled backend.',
    );
  writeFileSync(
    resolve(output, `preflight-${process.pid}.json`),
    JSON.stringify(
      {
        frontend: 'http://127.0.0.1:5182',
        apiTarget: 'http://127.0.0.1:8011',
        database: db,
        entry,
        processIds: children.map((c) => c.pid),
      },
      null,
      2,
    ),
  );
  const test = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    {
      windowsHide: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        SENTINEL_EXTERNAL_TEST_SERVERS: '1',
        SENTINEL_TEST_BUILD_SUFFIX: suffix,
      },
    },
  );
  process.exitCode = await new Promise((r) =>
    test.on('exit', (code) => r(code ?? 1)),
  );
} finally {
  for (const c of children) c.kill();
  const stopped = await Promise.all(
    children.map(
      (c) =>
        new Promise((resolve) => {
          if (c.exitCode !== null || c.signalCode !== null) {
            resolve(true);
            return;
          }
          const timeout = setTimeout(() => resolve(false), 5000);
          c.once('exit', () => {
            clearTimeout(timeout);
            resolve(true);
          });
        }),
    ),
  );
  let portsFree = true;
  for (const port of [8011, 5181, 5182]) {
    try {
      await free(port);
    } catch {
      portsFree = false;
    }
  }
  if (!portsFree || stopped.some((ok) => !ok)) process.exitCode = 1;
  // End unfinished test demos only after the actual listener has also exited.
  if (ownedDatabase && stopped[0] && portsFree) {
    const cleanup = spawnSync(
      resolve(
        '../backend/.venv',
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
      ),
      [resolve('../scripts/end_test_demo.py'), ownedDatabase, '--delete'],
      { windowsHide: true, encoding: 'utf8', timeout: 15000 },
    );
    writeFileSync(
      resolve(output, `cleanup-${process.pid}.json`),
      cleanup.stdout || cleanup.stderr || 'Cleanup produced no result',
    );
    if (cleanup.status !== 0) process.exitCode = 1;
  }
  for (const fd of logs) closeSync(fd);
}
