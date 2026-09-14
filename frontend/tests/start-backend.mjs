import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';
import process from 'node:process';
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const data = fileURLToPath(new URL('../.cache/', import.meta.url));
mkdirSync(data, { recursive: true });
// Each regression run starts with the authored recordings, independent of earlier advances.
const database = `${data}/browser-${process.pid}.sqlite3`;
const python = fileURLToPath(
  new URL(
    process.platform === 'win32'
      ? '../../backend/.venv/Scripts/python.exe'
      : '../../backend/.venv/bin/python',
    import.meta.url,
  ),
);
const child = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8011'],
  {
    cwd: backend,
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      SENTINEL_FIXTURES: '1',
      SENTINEL_DEMO: '1',
      SENTINEL_DB_PATH: database,
    },
  },
);
child.on('exit', (code) => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(database + suffix, { force: true });
    } catch {
      /* Windows may still hold a closing handle. */
    }
  }
  process.exit(code ?? 1);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
