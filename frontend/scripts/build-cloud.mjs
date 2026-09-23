import { spawnSync } from 'node:child_process';

// A cloud deployment must never accidentally fall back to the local,
// unauthenticated /api configuration. Only the backend URL is public config.
const base = process.env.VITE_SENTINEL_CLOUD_API?.trim();
let valid = false;
try {
  const url = new URL(base);
  valid = url.protocol === 'https:' && !url.username && !url.password &&
    !url.search && !url.hash && url.pathname.endsWith('/api');
} catch { /* Handled by the fail-closed check below. */ }
if (!valid) {
  console.error('Set VITE_SENTINEL_CLOUD_API to the deployed HTTPS backend URL ending in /api. Never set an access key as a VITE_* variable.');
  process.exit(1);
}
for (const [script, ...args] of [
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['node_modules/vite/bin/vite.js', 'build'],
]) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
