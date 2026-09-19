import { loadFixture } from './actions';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CameraIntent } from '../../src/renderers/contracts';
import type { CesiumProvider } from '../../src/renderers/cesium/config';
import type { SnapshotMessage } from '../../src/contracts/generated';
import { syntheticTile } from './syntheticTile';
import { advanceFixture, closeTab, tabAction, unloadMission } from './actions';

const origin = 'http://127.0.0.1:5182';
const dir = resolve('test-results/browser/mapServices');
const pane = (page: Page, id = 'tactical') =>
  page.locator(`.tactical-view[data-view-id="${id}"]`);
type Snapshot = {
  ready: boolean;
  retainable: boolean;
  rendererRunning?: boolean;
  globeLoaded?: boolean;
  geometryReady?: boolean;
  clockTime?: string;
  camera: CameraIntent;
  entityIds: string[];
  zoneIds: string[];
  frameId: string;
  effectiveAt: string;
  missionId: string;
  spatial: Record<string, string | number>;
  points: { id: string; x: number; y: number; height?: number }[];
};
interface Probes {
  __sentinelCesiumTest: {
    inspect(id: string): Snapshot;
    stats(): { active: number; created: number; disposed: number };
    setProvider(id: string, value: CesiumProvider): void;
  };
  __sentinelMapTest: {
    inspect(id: string): Snapshot;
    stats(): { active: number; created: number; disposed: number };
  };
}
async function inspect(
  page: Page,
  mode: 'three-d' | 'tactical' = 'three-d',
  id = 'tactical',
) {
  return page.evaluate(
    ({ mode, id }) => {
      const probes = window as unknown as Probes;
      return (
        mode === 'three-d'
          ? probes.__sentinelCesiumTest
          : probes.__sentinelMapTest
      )?.inspect(id);
    },
    { mode, id },
  );
}
async function ready(
  page: Page,
  mode: 'three-d' | 'tactical' = 'three-d',
  id = 'tactical',
) {
  await expect
    .poll(async () => (await inspect(page, mode, id))?.ready)
    .toBe(true);
}
async function load(page: Page, name = 'Tactical') {
  await loadFixture(page, name);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
}
async function mode(
  page: Page,
  projection: 'three-d' | 'tactical',
  id = 'tactical',
) {
  await pane(page, id)
    .getByRole('button', {
      name: projection === 'three-d' ? '3D' : 'Tactical',
      exact: true,
    })
    .click();
  await ready(page, projection, id);
}
async function pick(
  page: Page,
  suffix: string,
  projection: 'three-d' | 'tactical' = 'three-d',
  id = 'tactical',
) {
  const point = (await inspect(page, projection, id)).points.find((p) =>
    p.id.endsWith(suffix),
  )!;
  expect(point).toBeTruthy();
  await pane(page, id)
    .locator('canvas')
    .click({ position: { x: point.x, y: point.y } });
  await expect(pane(page, id)).toHaveAttribute('data-selection', point.id);
}
function sameCamera(a: CameraIntent, b: CameraIntent) {
  expect(
    Math.abs(a.center.longitudeDeg - b.center.longitudeDeg) * 111320,
  ).toBeLessThan(b.groundSpanM * 0.05);
  expect(
    Math.abs(a.center.latitudeDeg - b.center.latitudeDeg) * 111320,
  ).toBeLessThan(b.groundSpanM * 0.05);
  expect(Math.abs(a.groundSpanM / b.groundSpanM - 1)).toBeLessThan(0.05);
  expect(
    Math.abs(((a.headingTrueDeg - b.headingTrueDeg + 540) % 360) - 180),
  ).toBeLessThan(1);
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  await mkdir(dir, { recursive: true });
  errors.set(page, []);
  page.on('pageerror', (error) => errors.get(page)!.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('production assets and no-credential fallback load without implicit provider subscriptions', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (
      /api\.cesium\.com|api\.maptiler\.com|virtualearth|googleapis/.test(
        request.url(),
      )
    )
      external.push(new URL(request.url()).hostname);
  });
  await page.goto(origin);
  await load(page);
  await ready(page, 'tactical');
  await mode(page, 'three-d');
  await expect(pane(page)).toContainText('LOCAL GLOBE');
  await expect(pane(page)).toContainText('HEIGHT APPROXIMATE');
  const canvas = await pane(page).locator('canvas').boundingBox();
  const surface = await pane(page).locator('.map-surface').boundingBox();
  expect(canvas?.width).toBe(surface?.width);
  expect(canvas?.height).toBe(surface?.height);
  for (const asset of [
    'Workers/createPolygonGeometry.js',
    'ThirdParty/draco_decoder.wasm',
    'Assets/approximateTerrainHeights.json',
    'Widgets/Images/NavigationHelp/Mouse.svg',
  ]) {
    const response = await page.request.get(`${origin}/cesium/${asset}`);
    expect(response.ok(), asset).toBe(true);
    expect(response.headers()['content-type']).not.toContain('text/html');
  }
  expect(external).toEqual([]);
  await page.screenshot({ path: resolve(dir, '3d-fallback-desktop.png') });
});

test('same-pane switching and simultaneous maps retain shared frame, selection, filters and independent cameras', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', () => streams++);
  await page.goto(origin);
  await load(page);
  await ready(page, 'tactical');
  await pick(page, 'hostile-01', 'tactical');
  await pane(page).locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  // MapLibre's acknowledgement pan settles before exchanging the camera bookmark.
  await expect
    .poll(
      async () => (await inspect(page, 'tactical')).camera.center.longitudeDeg,
    )
    .not.toBe(103.85);
  const before = await inspect(page, 'tactical');
  await mode(page, 'three-d');
  sameCamera((await inspect(page)).camera, before.camera);
  expect((await inspect(page)).frameId).toBe(before.frameId);
  expect((await inspect(page)).effectiveAt).toBe(before.effectiveAt);
  expect((await inspect(page)).clockTime).toBe(before.effectiveAt);
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  await pick(page, 'neutral-01');
  await mode(page, 'tactical');
  sameCamera((await inspect(page, 'tactical')).camera, before.camera);
  await tabAction(page, 'Tactical Map', 'New Tactical pane');
  await ready(page, 'tactical', 'tactical:2');
  await mode(page, 'three-d', 'tactical:2');
  await pane(page, 'tactical:2')
    .getByRole('button', { name: 'Recenter', exact: true })
    .click();
  await pick(page, 'hostile-01', 'three-d', 'tactical:2');
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  const untouched = (await inspect(page, 'tactical')).camera;
  await pane(page, 'tactical:2').locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  sameCamera((await inspect(page, 'tactical')).camera, untouched);
  await pane(page)
    .getByRole('button', { name: 'Map layers', exact: true })
    .click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Zones', exact: true })
    .click();
  await expect
    .poll(
      async () => (await inspect(page, 'three-d', 'tactical:2')).zoneIds.length,
    )
    .toBe(0);
  await expect
    .poll(async () => (await inspect(page, 'tactical')).zoneIds.length)
    .toBe(0);
  const committed = await advanceFixture(page, 'fixture-tactical');
  await expect
    .poll(async () => (await inspect(page, 'tactical')).frameId)
    .toBe(committed.frameId);
  await expect
    .poll(async () => (await inspect(page, 'three-d', 'tactical:2')).frameId)
    .toBe(committed.frameId);
  expect((await inspect(page, 'three-d', 'tactical:2')).entityIds).toEqual(
    (await inspect(page, 'tactical')).entityIds,
  );
  expect(streams).toBe(1);
  await page.screenshot({ path: resolve(dir, 'shared-split-desktop.png') });
  await page.setViewportSize({ width: 860, height: 650 });
  for (const view of [pane(page), pane(page, 'tactical:2')]) {
    await expect(
      view.getByRole('button', { name: 'Map layers', exact: true }),
    ).toBeVisible();
    const surface = await view.locator('.map-surface').boundingBox(),
      canvas = await view.locator('canvas').boundingBox();
    expect(Math.abs(surface!.width - canvas!.width)).toBeLessThan(2);
  }
  await pane(page, 'tactical:2')
    .getByRole('button', { name: 'Map layers', exact: true })
    .click();
  await expect(page.getByText('3D services', { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(dir, 'services-narrow-split.png') });
  await page.keyboard.press('Escape');
  expect(streams).toBe(1);
});

test('3D mission switching, missing selected entities and stale recovery respect backend authority', async ({
  page,
}) => {
  let socket: WebSocketRoute | undefined,
    blocked = false;
  await page.routeWebSocket('**/api/missions/*/stream', (route) => {
    if (blocked) route.close({ code: 1011 });
    else {
      socket = route;
      route.connectToServer();
    }
  });
  await page.goto(origin);
  await load(page);
  await mode(page, 'three-d');
  let frame = await (
    await page.request.get(`${origin}/api/missions/fixture-tactical/world`)
  ).json();
  while (frame.sequence % 3 !== 0)
    frame = await advanceFixture(page, 'fixture-tactical');
  await expect
    .poll(async () => (await inspect(page)).frameId)
    .toBe(frame.frameId);
  await pick(page, 'unknown-01');
  await advanceFixture(page, 'fixture-tactical');
  const final = await advanceFixture(page, 'fixture-tactical');
  await expect
    .poll(async () => (await inspect(page)).frameId)
    .toBe(final.frameId);
  await expect(page.locator('.selection-details')).toContainText('unavailable');
  expect((await inspect(page)).entityIds).not.toContain(
    'fixture-tactical-unknown-01',
  );
  blocked = true;
  socket!.close({ code: 1011 });
  await expect(page.locator('.connection-state')).toHaveText('STALE');
  await expect(pane(page)).toContainText('Last complete frame retained');
  // Stale symbols upload asynchronously; wait for the rendered frame as above.
  await expect
    .poll(async () => (await inspect(page)).frameId)
    .toBe(final.frameId);
  await page.screenshot({
    path: resolve(dir, '3d-stale-unavailable-selection.png'),
  });
  blocked = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await load(page, 'Bravo');
  await expect
    .poll(async () => (await inspect(page)).missionId)
    .toBe('fixture-bravo');
  expect(
    (await inspect(page)).entityIds.every((id) =>
      id.startsWith('fixture-bravo'),
    ),
  ).toBe(true);
  await unloadMission(page);
  await expect.poll(async () => (await inspect(page)).entityIds.length).toBe(0);
});

test('invalid ion credentials recover through explicit retry with synthetic imagery, terrain and building responses', async ({
  page,
}) => {
  let fail = true,
    requests = 0;
  const synthetic = {
    token: 'synthetic-provider-test-only',
    imageryAssetId: 20002,
    terrainAssetId: 20001,
    buildingsAssetId: 20003,
  };
  await page.route(
    'https://api.cesium.com/v1/assets/*/endpoint*',
    async (route) => {
      requests++;
      if (fail) {
        await route.fulfill({
          status: 401,
          json: { message: 'Synthetic invalid credential' },
        });
        return;
      }
      const id = new URL(route.request().url()).pathname.split('/')[3];
      const endpoint =
        id === '20002'
          ? {
              type: 'IMAGERY',
              externalType: 'URL_TEMPLATE',
              options: {
                url: `${origin}/synthetic-provider/{z}/{x}/{y}.png`,
                maximumLevel: 0,
                credit: 'SYNTHETIC PROVIDER TEST',
              },
              attributions: [],
            }
          : {
              type: id === '20001' ? 'TERRAIN' : '3DTILES',
              url: `${origin}/synthetic-provider/${id === '20001' ? 'terrain/' : 'tileset.json'}`,
              accessToken: 'synthetic-asset-token',
              attributions: [
                { html: 'SYNTHETIC PROVIDER TEST', collapsible: false },
              ],
            };
      await route.fulfill({ json: endpoint });
    },
  );
  const pixel = syntheticTile();
  await page.route('**/synthetic-provider/**', async (route) => {
    const url = route.request().url();
    if (url.includes('layer.json'))
      await route.fulfill({
        json: {
          tilejson: '2.1.0',
          format: 'heightmap-1.0',
          version: '1.0.0',
          scheme: 'tms',
          tiles: ['{z}/{x}/{y}.terrain?v={version}'],
          projection: 'EPSG:4326',
          maxzoom: 0,
        },
      });
    else if (url.includes('.terrain'))
      await route.fulfill({
        contentType: 'application/octet-stream',
        body: Buffer.alloc(65 * 65 * 2 + 2),
      });
    else if (url.includes('tileset.json'))
      await route.fulfill({
        json: {
          asset: { version: '1.1' },
          geometricError: 0,
          root: {
            boundingVolume: { region: [1.8, 0.02, 1.82, 0.03, 0, 100] },
            geometricError: 0,
            refine: 'ADD',
            children: [],
          },
        },
      });
    else await route.fulfill({ contentType: 'image/png', body: pixel });
  });
  await page.goto(origin);
  await load(page);
  await mode(page, 'three-d');
  await pick(page, 'hostile-01');
  const before = await inspect(page);
  await page.evaluate(
    (provider) =>
      (window as unknown as Probes).__sentinelCesiumTest.setProvider(
        'tactical',
        provider,
      ),
    synthetic,
  );
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('error');
  await expect
    .poll(async () => (await inspect(page)).spatial.terrain)
    .toBe('error');
  await expect
    .poll(async () => (await inspect(page)).spatial.buildings)
    .toBe('error');
  await expect(pane(page)).toContainText('3D services degraded');
  await page.screenshot({ path: resolve(dir, 'ion-invalid-fallback.png') });
  fail = false;
  await pane(page)
    .getByRole('button', { name: 'Retry services', exact: true })
    .click();
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('ready');
  await expect
    .poll(async () => (await inspect(page)).spatial.terrain)
    .toBe('ready');
  await expect
    .poll(async () => (await inspect(page)).spatial.buildings)
    .toBe('ready');
  // Initialization is not rendering: wait for provider attribution from displayed tiles.
  await pane(page).locator('.cesium-credit-expand-link').click();
  await expect(pane(page).locator('.cesium-credit-lightbox')).toContainText(
    'SYNTHETIC PROVIDER TEST',
  );
  await pane(page).locator('.cesium-credit-lightbox-close').click();
  await expect(pane(page)).not.toContainText('Map renderer unavailable');
  expect(requests).toBeGreaterThanOrEqual(6);
  sameCamera((await inspect(page)).camera, before.camera);
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  await page.screenshot({
    path: resolve(dir, 'synthetic-provider-recovery.png'),
  });
  await writeFile(
    resolve(dir, 'synthetic-provider-result.json'),
    JSON.stringify(
      {
        requests,
        after: await inspect(page),
        note: 'Synthetic endpoint and tile responses; no hosted imagery or Singapore coverage verified.',
      },
      null,
      2,
    ),
  );
});

test('settled mode churn retains resources and close/reopen disposes without duplicating transport', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', () => streams++);
  await page.goto(origin);
  await load(page);
  await ready(page, 'tactical');
  await expect
    .poll(async () => (await inspect(page, 'tactical')).retainable)
    .toBe(true);
  const initialCreated = await page.evaluate(
    () => (window as unknown as Probes).__sentinelMapTest.stats().created,
  );
  for (let i = 0; i < 4; i++) {
    await mode(page, 'three-d');
    await expect.poll(async () => (await inspect(page)).retainable).toBe(true);
    await mode(page, 'tactical');
    await expect
      .poll(async () => (await inspect(page, 'tactical')).retainable)
      .toBe(true);
  }
  await mode(page, 'three-d');
  expect(
    await page.evaluate(
      () => (window as unknown as Probes).__sentinelMapTest.stats().created,
    ),
  ).toBe(initialCreated);
  expect(
    await page.evaluate(
      () => (window as unknown as Probes).__sentinelCesiumTest.stats().created,
    ),
  ).toBe(1);
  await pane(page).locator('canvas').focus();
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    /fixture-tactical-/,
  );
  await page.keyboard.press('ArrowRight');
  const camera = (await inspect(page)).camera;
  await closeTab(page, '3D Map');
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await ready(page);
  sameCamera((await inspect(page)).camera, camera);
  const counts = await page.evaluate(() => ({
    threeD: (window as unknown as Probes).__sentinelCesiumTest.stats(),
    tactical: (window as unknown as Probes).__sentinelMapTest.stats(),
  }));
  expect(counts.threeD.created - counts.threeD.disposed).toBe(1);
  expect(counts.tactical.active).toBe(0);
  expect(streams).toBe(1);
  await closeTab(page, '3D Map');
  expect(
    await page.evaluate(
      () => (window as unknown as Probes).__sentinelCesiumTest.stats().active,
    ),
  ).toBe(0);
  await writeFile(
    resolve(dir, 'renderer-lifecycle.json'),
    JSON.stringify({ counts, streams }, null, 2),
  );
});

test('an explicitly synthetic AGL stream never gains an invented 3D height or loses shared selection', async ({
  page,
}) => {
  await page.routeWebSocket('**/api/missions/*/stream', (route) => {
    const upstream = route.connectToServer();
    upstream.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'snapshot') {
        const snapshot = message as SnapshotMessage;
        for (const track of Object.values(snapshot.frame.tracks))
          track.latest.position.altitude = { reference: 'AGL', metres: 35 };
        route.send(JSON.stringify(snapshot));
      } else route.send(raw);
    });
  });
  await page.goto(origin);
  await load(page);
  await ready(page, 'tactical');
  const positioned = (await inspect(page, 'tactical')).entityIds.length;
  await pick(page, 'hostile-01', 'tactical');
  await mode(page, 'three-d');
  expect((await inspect(page)).entityIds).toEqual([]);
  expect((await inspect(page)).spatial.unavailableHeights).toBe(positioned);
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  await expect(pane(page)).toContainText('without resolved height');
  await page.screenshot({ path: resolve(dir, 'synthetic-agl-unresolved.png') });
  await mode(page, 'tactical');
  expect((await inspect(page, 'tactical')).entityIds.length).toBe(positioned);
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
});

test('delayed provider results cannot install after a pane switches renderer', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(
    'https://api.cesium.com/v1/assets/*/endpoint*',
    async (route) => {
      requests++;
      await held;
      await route.fulfill({
        status: 503,
        json: { message: 'Synthetic delayed outage' },
      });
    },
  );
  await page.goto(origin);
  await load(page);
  await mode(page, 'three-d');
  await page.evaluate(() =>
    (window as unknown as Probes).__sentinelCesiumTest.setProvider('tactical', {
      token: 'synthetic-delayed-test',
      imageryAssetId: 20102,
      terrainAssetId: 20101,
      buildingsAssetId: 20103,
    }),
  );
  await expect.poll(() => requests).toBe(3);
  await expect(pane(page)).toContainText('Loading 3D services');
  await mode(page, 'tactical');
  release();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as Probes).__sentinelCesiumTest.stats().active,
      ),
    )
    .toBe(0);
  await ready(page, 'tactical');
  await expect(pane(page)).not.toContainText('3D services');
  await mode(page, 'three-d');
  await expect(pane(page)).toContainText('LOCAL GLOBE');
  expect((await inspect(page)).spatial.imagery).toBe('local');
});

test('a synthetic imagery tile outage after metadata loads stays recoverable without losing map context', async ({
  page,
}) => {
  let fail = true,
    tiles = 0;
  await page.route(
    'https://api.cesium.com/v1/assets/20202/endpoint*',
    async (route) =>
      route.fulfill({
        json: {
          type: 'IMAGERY',
          externalType: 'URL_TEMPLATE',
          options: {
            url: `${origin}/synthetic-outage/{z}/{x}/{y}.png`,
            maximumLevel: 0,
            credit: 'SYNTHETIC TILE TEST',
          },
          attributions: [],
        },
      }),
  );
  await page.route('**/synthetic-outage/**', async (route) => {
    tiles++;
    if (fail)
      await route.fulfill({ status: 503, body: 'Synthetic tile outage' });
    else
      await route.fulfill({ contentType: 'image/png', body: syntheticTile() });
  });
  await page.goto(origin);
  await load(page);
  await mode(page, 'three-d');
  await pick(page, 'hostile-01');
  const before = await inspect(page);
  await page.evaluate(() =>
    (window as unknown as Probes).__sentinelCesiumTest.setProvider('tactical', {
      token: 'synthetic-tile-test',
      imageryAssetId: 20202,
      terrainAssetId: null,
      buildingsAssetId: null,
    }),
  );
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('error');
  expect(tiles).toBeGreaterThan(0);
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  sameCamera((await inspect(page)).camera, before.camera);
  fail = false;
  const previousTiles = tiles;
  await pane(page)
    .getByRole('button', { name: 'Retry services', exact: true })
    .click();
  await expect.poll(() => tiles).toBeGreaterThan(previousTiles);
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('ready');
  await page.screenshot({ path: resolve(dir, 'synthetic-tile-recovery.png') });
});

test('blocked Cesium workers produce an explicit incomplete-render failure and reload recovery', async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.route('**/cesium/Workers/*.js', (route) => route.abort());
  await page.goto(origin);
  await load(page);
  await ready(page, 'tactical');
  await pick(page, 'hostile-01', 'tactical');
  const before = await inspect(page, 'tactical');
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect(
    pane(page).getByText('Map resources unavailable', { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  expect((await inspect(page)).ready).toBe(false);
  await expect(pane(page)).not.toContainText('zone footprint');
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  await page.screenshot({
    path: resolve(dir, '3d-worker-failure-explicit.png'),
  });
  await mode(page, 'tactical');
  sameCamera((await inspect(page, 'tactical')).camera, before.camera);
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  await page.unroute('**/cesium/Workers/*.js');
  // The engine's shared worker handshake may be poisoned: explicit reload repairs it.
  await page.reload();
  await load(page);
  await mode(page, 'three-d');
  expect((await inspect(page)).geometryReady).toBe(true);
  expect((await inspect(page)).rendererRunning).toBe(true);
  await expect(pane(page)).not.toContainText('Map resources unavailable');
  await page.screenshot({ path: resolve(dir, '3d-worker-recovered.png') });
});

test('remote selection moves the visible Cesium ring without camera input', async ({
  page,
}) => {
  await page.goto(origin);
  await load(page);
  await mode(page, 'three-d');
  await pick(page, 'hostile-01');
  await tabAction(page, '3D Map', 'New Tactical pane');
  await ready(page, 'tactical', 'tactical:2');
  const camera = (await inspect(page)).camera;

  // Inspect actual framebuffer pixels, not the shared selection/probe alone.
  async function ringPixels(suffix: string) {
    const point = (await inspect(page)).points.find((p) =>
      p.id.endsWith(suffix),
    )!;
    const box = (await pane(page).locator('canvas').boundingBox())!;
    const png = await page.screenshot({
      clip: {
        x: Math.round(box.x + point.x - 14),
        y: Math.round(box.y + point.y - 14),
        width: 28,
        height: 28,
      },
    });
    return page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 28;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, 28, 28);
      const pixels = ctx.getImageData(0, 0, 28, 28).data;
      let count = 0;
      for (let y = 0; y < 28; y++)
        for (let x = 0; x < 28; x++) {
          const radius = Math.hypot(x - 13.5, y - 13.5);
          const i = (y * 28 + x) * 4;
          const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
          if (
            radius >= 10 &&
            radius <= 13.5 &&
            Math.min(...rgb) > 160 &&
            Math.max(...rgb) - Math.min(...rgb) < 30
          )
            count++;
        }
      return count;
    }, png.toString('base64'));
  }
  await expect.poll(() => ringPixels('hostile-01')).toBeGreaterThan(30);
  await pick(page, 'neutral-01', 'tactical', 'tactical:2');
  await expect.poll(() => ringPixels('neutral-01')).toBeGreaterThan(30);
  await expect.poll(() => ringPixels('hostile-01')).toBeLessThan(5);
  sameCamera((await inspect(page)).camera, camera);
  // Switch back to an already-cached glyph, which also needs a real redraw.
  await pick(page, 'hostile-01', 'tactical', 'tactical:2');
  await expect.poll(() => ringPixels('hostile-01')).toBeGreaterThan(30);
  await expect.poll(() => ringPixels('neutral-01')).toBeLessThan(5);
  await page.screenshot({
    path: resolve(dir, 'shared-selection-rendered.png'),
  });
  await page
    .locator('.selection-details')
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click();
  await expect.poll(() => ringPixels('hostile-01')).toBeLessThan(5);
  await expect.poll(() => ringPixels('neutral-01')).toBeLessThan(5);
  sameCamera((await inspect(page)).camera, camera);
});

test('actual WebGL loss leaves a dark failure surface and retry preserves context', async ({
  page,
}) => {
  await page.goto(origin);
  await load(page);
  await mode(page, 'three-d');
  await pick(page, 'hostile-01');
  const before = await inspect(page);
  await pane(page)
    .locator('canvas')
    .evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
      gl.getExtension('WEBGL_lose_context')!.loseContext();
    });
  await expect(pane(page)).toContainText('Graphics context lost');
  await expect(pane(page).locator('.map-canvas')).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    'fixture-tactical-hostile-01',
  );
  expect((await inspect(page)).ready).toBe(false);
  await page.screenshot({ path: resolve(dir, '3d-context-loss-dark.png') });
  await pane(page)
    .getByRole('button', { name: 'Retry renderer', exact: true })
    .click();
  await ready(page);
  sameCamera((await inspect(page)).camera, before.camera);
  await expect(pane(page).locator('.map-canvas')).toHaveCSS(
    'visibility',
    'visible',
  );
});
