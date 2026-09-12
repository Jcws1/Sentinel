import { spawnSync } from 'node:child_process';
// Isolated regression builds never embed the operator's local browser credentials.
const env = {
  ...process.env,
  VITE_TACTICAL_PROVIDER: 'maptiler',
  VITE_TACTICAL_STYLE_URL:
    'https://api.maptiler.com/maps/streets-v4/style.json',
  VITE_MAPTILER_KEY: '',
  VITE_CESIUM_ION_TOKEN: '',
  VITE_GOOGLE_MAPS_API_KEY: '',
  VITE_CESIUM_PHOTOREALISTIC_ASSET_ID: '0',
};
for (const args of [
  ['build', '--outDir', 'dist-test'],
  ['build', '--mode', 'verification'],
]) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/vite/bin/vite.js', ...args],
    { env, stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
