// Bounded production output; canonical public assets stay shared.
import { build } from 'vite';
import { resolve } from 'node:path';
import process from 'node:process';

process.env.SENTINEL_SHARED_PUBLIC = '1';
const frontendRoot = process.cwd();
const outDir = resolve(process.env.PERF_BUILD ?? 'dist-performance');
if (process.env.PERF_CONFIGURED !== '1')
  Object.assign(process.env, {
    VITE_TACTICAL_PROVIDER: 'maptiler',
    VITE_MAPTILER_KEY: '',
    VITE_CESIUM_ION_TOKEN: '',
    VITE_GOOGLE_MAPS_API_KEY: '',
    VITE_CESIUM_PHOTOREALISTIC_ASSET_ID: '0',
  });
if (process.env.PERF_SOURCE) process.chdir(resolve(process.env.PERF_SOURCE));
await build({
  mode: process.env.PERF_MODE ?? 'verification',
  envDir: frontendRoot,
  build: {
    outDir,
    emptyOutDir: true,
    copyPublicDir: false,
  },
});
process.chdir(frontendRoot);
