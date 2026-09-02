/**
 * Tell Cesium where its static runtime lives.
 *
 * Cesium loads Workers, Assets and Widgets at runtime relative to a global
 * CESIUM_BASE_URL, resolved when its module body first evaluates. This module
 * is imported BEFORE `cesium` in photorealCesium.ts so the global is set in
 * time — ES modules evaluate in dependency order, so the import order there is
 * load-bearing, not cosmetic.
 *
 * The files are served from public/cesium, copied from the npm package by
 * `npm run cesium:assets`. They are gitignored: vendored binaries that a
 * postinstall step can reproduce.
 */
;(globalThis as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL =
  '/cesium/'
