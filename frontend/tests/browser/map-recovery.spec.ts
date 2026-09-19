import { loadFixture } from './actions';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  CameraIntent,
  MapPresentation,
  SpatialStatus,
} from '../../src/renderers/contracts';
import type { CesiumProvider } from '../../src/renderers/cesium/config';
import type { RequestRecovery } from '../../src/renderers/cesium/requestRecovery';
import { syntheticTile } from './syntheticTile';

const origin = 'http://127.0.0.1:5182';
const pane = (page: Page) =>
  page.locator('.tactical-view[data-view-id="tactical"]');

interface ViewProbe {
  ready: boolean;
  globeLoaded: boolean;
  active: boolean;
  frameId?: string;
  missionId: string;
  effectiveAt: string;
  clockTime: string;
  camera: CameraIntent;
  spatial: SpatialStatus;
  diagnostics: {
    environmentLoads: number;
    standardLayerGenerations?: Record<
      'imagery' | 'terrain' | 'buildings',
      number
    >;
    requestRecovery?: ReturnType<RequestRecovery['snapshot']>;
    failures: { stage: string; code: string }[];
  };
  environment: {
    photorealisticPresent: boolean;
    photorealisticLoaded: boolean;
    photorealisticBytes: number;
    globeShown: boolean;
    photoVisibleTiles: number;
    osmBuildings: boolean;
    imageryLayers: number;
  };
}
interface Probes {
  __sentinelCesiumTest: {
    inspect(id: string): ViewProbe;
    stats(): { created: number; disposed: number; active: number };
    setProvider(id: string, value: CesiumProvider): void;
    setPresentation(id: string, value: MapPresentation): void;
    failTile(id: string): void;
    failRenderer(id: string, reason: 'render-exception' | 'context-lost'): void;
  };
}
const inspect = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Probes).__sentinelCesiumTest?.inspect('tactical'),
  );
const stats = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Probes).__sentinelCesiumTest.stats(),
  );

async function load(page: Page) {
  await page.goto(origin);
  await loadFixture(page, 'Tactical');
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect.poll(async () => (await inspect(page))?.ready).toBe(true);
  await pane(page).locator('canvas').focus();
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    /fixture-tactical-/,
  );
  await expect.poll(async () => (await inspect(page))?.ready).toBe(true);
}

function assertContext(before: ViewProbe, after: ViewProbe) {
  expect(after.frameId).toBe(before.frameId);
  expect(after.missionId).toBe(before.missionId);
  expect(after.effectiveAt).toBe(before.effectiveAt);
  expect(after.clockTime).toBe(before.clockTime);
  expect(
    Math.abs(
      after.camera.center.longitudeDeg - before.camera.center.longitudeDeg,
    ) * 111320,
  ).toBeLessThan(before.camera.groundSpanM * 0.05);
  expect(
    Math.abs(
      after.camera.center.latitudeDeg - before.camera.center.latitudeDeg,
    ) * 111320,
  ).toBeLessThan(before.camera.groundSpanM * 0.05);
  expect(
    Math.abs(after.camera.groundSpanM / before.camera.groundSpanM - 1),
  ).toBeLessThan(0.05);
}

/** Deliberately simple untextured geometry, constructed only by this provider test.
 * Neither these vertices nor fake imagery become backend/world state. The root
 * uses a WGS84 ENU transform and Z-up glTF, making the test independent of real
 * Google content, account access or cached imagery.
 */
function syntheticScene() {
  const longitude = (103.85 * Math.PI) / 180;
  const latitude = (1.35 * Math.PI) / 180;
  const sinLon = Math.sin(longitude),
    cosLon = Math.cos(longitude);
  const sinLat = Math.sin(latitude),
    cosLat = Math.cos(latitude);
  const eccentricitySquared = 0.0066943799901413165;
  const normal = 6378137 / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
  const transform = [
    -sinLon,
    cosLon,
    0,
    0,
    -sinLat * cosLon,
    -sinLat * sinLon,
    cosLat,
    0,
    cosLat * cosLon,
    cosLat * sinLon,
    sinLat,
    0,
    normal * cosLat * cosLon,
    normal * cosLat * sinLon,
    normal * (1 - eccentricitySquared) * sinLat,
    1,
  ];
  const positions = new Float32Array([
    -3000, -3000, 20, 3000, -3000, 20, 3000, 3000, 20, -3000, 3000, 20,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const buffer = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(indices.buffer),
  ]);
  return {
    root: {
      asset: { version: '1.1', gltfUpAxis: 'Z' },
      // The tileset-level error describes the error when this mesh is absent.
      // Zero here lets Cesium cull the entire tileset without fetching its leaf.
      geometricError: 10000,
      root: {
        transform,
        boundingVolume: { box: [0, 0, 20, 3001, 0, 0, 0, 3001, 0, 0, 0, 1] },
        geometricError: 0,
        refine: 'ADD',
        content: { uri: `${origin}/synthetic-recovery/scene.gltf` },
      },
    },
    gltf: {
      asset: {
        version: '2.0',
        copyright: 'SYNTHETIC PROVIDER TEST — NO GEOGRAPHIC DATA',
      },
      extensionsUsed: ['KHR_materials_unlit'],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      buffers: [
        {
          byteLength: buffer.length,
          uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
        },
      ],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: 0,
          byteLength: positions.byteLength,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: positions.byteLength,
          byteLength: indices.byteLength,
          target: 34963,
        },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 4,
          type: 'VEC3',
          min: [-3000, -3000, 20],
          max: [3000, 3000, 20],
        },
        {
          bufferView: 1,
          componentType: 5123,
          count: 6,
          type: 'SCALAR',
          min: [0],
          max: [3],
        },
      ],
      materials: [
        {
          doubleSided: true,
          extensions: { KHR_materials_unlit: {} },
          pbrMetallicRoughness: { baseColorFactor: [0.12, 0.15, 0.18, 1] },
        },
      ],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 }, indices: 1, material: 0 },
          ],
        },
      ],
    },
  };
}

async function syntheticProviders(page: Page) {
  const content = syntheticScene();
  await page.route('**/synthetic-recovery/scene.gltf*', (route) =>
    route.fulfill({
      contentType: 'model/gltf+json',
      json: content.gltf,
    }),
  );
  await page.route('**/synthetic-recovery/imagery/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: syntheticTile(),
    }),
  );
  await page.route('https://api.cesium.com/v1/assets/*/endpoint*', (route) =>
    route.fulfill({
      json: {
        type: 'IMAGERY',
        externalType: 'URL_TEMPLATE',
        options: {
          url: `${origin}/synthetic-recovery/imagery/{z}/{x}/{y}.png`,
          maximumLevel: 0,
          credit: 'SYNTHETIC FALLBACK TEST',
        },
        attributions: [{ html: 'SYNTHETIC FALLBACK TEST', collapsible: false }],
      },
    }),
  );
  return content;
}

async function useGoogle(page: Page) {
  await page.evaluate(() => {
    const probe = (window as unknown as Probes).__sentinelCesiumTest;
    probe.setPresentation('tactical', {
      buildings: false,
      hillshade: true,
      terrain: false,
      environment: 'photorealistic',
      daylight: true,
    });
    probe.setProvider('tactical', {
      googleKey: 'synthetic-test-key',
      token: 'synthetic-ion-key',
      imageryAssetId: 21202,
      terrainAssetId: null,
      buildingsAssetId: null,
    });
  });
}

async function photoReady(page: Page) {
  await expect
    .poll(async () => (await inspect(page)).spatial.photorealistic)
    .toBe('ready');
  await expect
    .poll(async () => (await inspect(page)).environment.photoVisibleTiles)
    .toBeGreaterThan(0);
  expect((await inspect(page)).environment.photorealisticBytes).toBeGreaterThan(
    0,
  );
  expect((await inspect(page)).environment.globeShown).toBe(false);
}

test('Google credits fit inline, expand in narrow maps, and follow displayed fallback without changing context', async ({
  page,
}) => {
  const synthetic = await syntheticProviders(page);
  const creditA = 'SYNTHETIC ALPHA — first supplied copyright and source';
  const creditB = 'SYNTHETIC BRAVO — second supplied copyright and source';
  synthetic.gltf.asset.copyright = `${creditA};${creditB}`;
  await page.route('https://tile.googleapis.com/**', (route) =>
    route.fulfill({ json: synthetic.root }),
  );
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/stream')) streams++;
  });
  await load(page);
  await useGoogle(page);
  await photoReady(page);
  const initial = await inspect(page);
  const created = (await stats(page)).created;
  const screen = pane(page).locator('.cesium-credit-textContainer');
  await expect(screen).toContainText(creditA);
  await expect(screen).toContainText(creditB);
  await expect(pane(page).locator('.google-maps-credit')).toBeVisible();
  await page.setViewportSize({ width: 760, height: 650 });
  const sources = pane(page).getByRole('button', {
    name: 'Data sources',
    exact: true,
  });
  await expect(sources).toBeVisible();
  await expect(screen).not.toContainText(creditA);
  await expect(pane(page).locator('.google-maps-credit')).toBeVisible();
  await sources.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'Data sources',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(creditA);
  await expect(dialog).toContainText(creditB);
  await expect(
    dialog.getByRole('button', { name: 'Close data attribution' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  const bounds = await dialog.boundingBox(),
    map = await pane(page).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(map!.x);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(map!.x + map!.width);
  const googleIdentity = await pane(page)
    .locator('.google-maps-credit')
    .boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(googleIdentity!.y);
  await page.keyboard.press('Escape');
  await expect(sources).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(screen).toContainText(creditA);
  await expect(screen).toContainText(creditB);
  expect((await stats(page)).created).toBe(created);
  expect((await inspect(page)).frameId).toBe(initial.frameId);
  expect((await inspect(page)).effectiveAt).toBe(initial.effectiveAt);
  // A new provider's credits replace, rather than append to, the old viewport.
  synthetic.gltf.asset.copyright = 'SYNTHETIC UPDATED COPYRIGHT';
  await useGoogle(page);
  await photoReady(page);
  await expect(screen).toContainText('SYNTHETIC UPDATED COPYRIGHT');
  await expect(screen).not.toContainText(creditA);
  await pane(page).getByRole('button', { name: 'Map layers' }).click();
  await page.getByRole('menuitemradio', { name: /Standard ·/ }).click();
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('ready');
  await expect(screen).toContainText('SYNTHETIC FALLBACK TEST');
  await expect(screen).not.toContainText('SYNTHETIC UPDATED COPYRIGHT');
  await expect(pane(page).locator('.google-maps-credit')).toHaveCount(0);
  expect(streams).toBe(1);
});

test('transient direct Google root 503 retries through the real SDK and preserves shared context', async ({
  page,
}) => {
  const synthetic = await syntheticProviders(page);
  let rootRequests = 0;
  await page.route('https://tile.googleapis.com/**', (route) => {
    rootRequests++;
    return rootRequests === 1
      ? route.fulfill({
          status: 503,
          json: { error: { code: 503, status: 'UNAVAILABLE' } },
        })
      : route.fulfill({ json: synthetic.root });
  });
  await load(page);
  const before = await inspect(page),
    initial = await stats(page);
  const selected = await pane(page).getAttribute('data-selection');
  await useGoogle(page);
  await photoReady(page);
  expect(rootRequests).toBe(2);
  expect((await stats(page)).created).toBe(initial.created);
  expect((await inspect(page)).diagnostics.requestRecovery).toMatchObject({
    scheduledRetries: 1,
    completedRetries: 1,
    pending: 0,
  });
  assertContext(before, await inspect(page));
  await expect(pane(page)).toHaveAttribute('data-selection', selected!);
  await expect(
    pane(page).getByRole('button', { name: 'Reload application' }),
  ).toHaveCount(0);
});

test('persistent direct Google root 503 stops after two retries and uses standard fallback', async ({
  page,
}) => {
  await syntheticProviders(page);
  let rootRequests = 0;
  await page.route('https://tile.googleapis.com/**', (route) => {
    rootRequests++;
    return route.fulfill({
      status: 503,
      json: { error: { code: 503, status: 'UNAVAILABLE' } },
    });
  });
  await load(page);
  const before = await inspect(page);
  await useGoogle(page);
  await expect
    .poll(async () => (await inspect(page)).spatial.photorealistic)
    .toBe('error');
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('ready');
  expect(rootRequests).toBe(3);
  expect((await inspect(page)).spatial.environment).toBe('standard');
  expect((await inspect(page)).environment.photorealisticPresent).toBe(false);
  expect((await inspect(page)).environment.globeShown).toBe(true);
  assertContext(before, await inspect(page));
  await expect(
    pane(page).getByRole('button', { name: 'Retry services' }),
  ).toBeVisible();
  await expect(
    pane(page).getByRole('button', { name: 'Reload application' }),
  ).toHaveCount(0);
});

test('Google access denial does not retry automatically and explicit retry recovers only the selected base', async ({
  page,
}) => {
  const synthetic = await syntheticProviders(page);
  let denied = true,
    rootRequests = 0;
  await page.route('https://tile.googleapis.com/**', (route) => {
    rootRequests++;
    return denied
      ? route.fulfill({
          status: 403,
          json: { error: { code: 403, status: 'PERMISSION_DENIED' } },
        })
      : route.fulfill({ json: synthetic.root });
  });
  await load(page);
  const before = await inspect(page),
    initial = await stats(page);
  await useGoogle(page);
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('ready');
  expect(rootRequests).toBe(1);
  expect((await inspect(page)).spatial).toMatchObject({
    photorealistic: 'error',
    environment: 'standard',
    imagery: 'ready',
    terrain: 'disabled',
    buildings: 'disabled',
  });
  denied = false;
  await pane(page)
    .getByRole('button', { name: 'Retry services', exact: true })
    .click();
  await photoReady(page);
  expect(rootRequests).toBe(2);
  expect((await stats(page)).created).toBe(initial.created);
  assertContext(before, await inspect(page));
});

test('an isolated child tile failure preserves loaded Google content, viewer and mission context', async ({
  page,
}, testInfo) => {
  const synthetic = await syntheticProviders(page);
  let roots = 0,
    streams = 0;
  page.on('websocket', () => streams++);
  await page.route('https://tile.googleapis.com/**', (route) => {
    roots++;
    return route.fulfill({ json: synthetic.root });
  });
  await load(page);
  await useGoogle(page);
  await photoReady(page);
  const before = await inspect(page),
    initial = await stats(page);
  const selected = await pane(page).getAttribute('data-selection');
  await page.evaluate(() =>
    (window as unknown as Probes).__sentinelCesiumTest.failTile('tactical'),
  );
  await expect
    .poll(async () => (await inspect(page)).spatial.degraded)
    .toBe(true);
  const after = await inspect(page);
  expect(after.environment.photorealisticPresent).toBe(true);
  expect(after.environment.photorealisticBytes).toBeGreaterThan(0);
  expect(after.spatial.environment).toBe('photorealistic');
  expect(after.diagnostics.environmentLoads).toBe(
    before.diagnostics.environmentLoads,
  );
  expect((await stats(page)).created).toBe(initial.created);
  expect(roots).toBe(1);
  expect(streams).toBe(1);
  assertContext(before, after);
  await expect(pane(page)).toHaveAttribute('data-selection', selected!);
  await expect(
    pane(page).getByRole('button', { name: 'Reload application' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('synthetic-isolated-tile-failure.png'),
  });
});

for (const reason of ['render-exception', 'context-lost'] as const) {
  test(`${reason} supports pane recovery without reloading or losing shared context`, async ({
    page,
  }, testInfo) => {
    let streams = 0;
    page.on('websocket', () => streams++);
    await load(page);
    await pane(page).locator('canvas').focus();
    await page.keyboard.press('ArrowRight');
    const before = await inspect(page),
      initial = await stats(page);
    const selected = await pane(page).getAttribute('data-selection');
    await page.evaluate(
      (reason) =>
        (window as unknown as Probes).__sentinelCesiumTest.failRenderer(
          'tactical',
          reason,
        ),
      reason,
    );
    await expect(
      pane(page).getByRole('button', { name: 'Retry renderer', exact: true }),
    ).toBeVisible();
    expect(
      (await inspect(page)).diagnostics.failures.some(
        (failure) => failure.code === reason,
      ),
    ).toBe(true);
    await expect(
      pane(page).getByRole('button', { name: 'Reload application' }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`synthetic-${reason}.png`),
    });
    await pane(page)
      .getByRole('button', { name: 'Retry renderer', exact: true })
      .click();
    await expect.poll(async () => (await inspect(page))?.ready).toBe(true);
    const after = await stats(page);
    expect(after.created).toBe(initial.created + 1);
    expect(after.disposed).toBe(initial.disposed + 1);
    expect(after.active).toBe(1);
    assertContext(before, await inspect(page));
    await expect(pane(page)).toHaveAttribute('data-selection', selected!);
    expect(streams).toBe(1);
  });
}

test('standard retry recovers failed terrain without reauthenticating or reloading healthy imagery', async ({
  page,
}) => {
  let imageryEndpoints = 0,
    imageryTiles = 0,
    terrainEndpoints = 0;
  let terrainDenied = true;
  await page.route(
    'https://api.cesium.com/v1/assets/*/endpoint*',
    async (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[3];
      if (id === '20002') {
        imageryEndpoints++;
        await route.fulfill({
          json: {
            type: 'IMAGERY',
            externalType: 'URL_TEMPLATE',
            options: {
              url: `${origin}/synthetic-standard/imagery/{z}/{x}/{y}.png`,
              maximumLevel: 0,
              credit: 'SYNTHETIC STANDARD RETRY TEST',
            },
            attributions: [],
          },
        });
        return;
      }
      terrainEndpoints++;
      await route.fulfill(
        terrainDenied
          ? { status: 503, json: { message: 'Synthetic terrain outage' } }
          : {
              json: {
                type: 'TERRAIN',
                url: `${origin}/synthetic-standard/terrain/`,
                accessToken: 'synthetic-asset-token',
                attributions: [],
              },
            },
      );
    },
  );
  await page.route('**/synthetic-standard/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('layer.json')) {
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
    } else if (path.endsWith('.terrain')) {
      await route.fulfill({
        contentType: 'application/octet-stream',
        body: Buffer.alloc(65 * 65 * 2 + 2),
      });
    } else {
      imageryTiles++;
      await route.fulfill({ contentType: 'image/png', body: syntheticTile() });
    }
  });
  await load(page);
  await page.evaluate(() => {
    const probe = (window as unknown as Probes).__sentinelCesiumTest;
    probe.setPresentation('tactical', {
      buildings: false,
      hillshade: true,
      terrain: false,
      environment: 'standard',
      daylight: true,
    });
    probe.setProvider('tactical', {
      token: 'synthetic-standard-token',
      imageryAssetId: 20002,
      terrainAssetId: 20001,
      buildingsAssetId: null,
    });
  });
  await expect
    .poll(async () => (await inspect(page)).spatial.imagery)
    .toBe('ready');
  await expect
    .poll(async () => (await inspect(page)).spatial.terrain)
    .toBe('error');
  await expect.poll(() => imageryTiles).toBeGreaterThan(0);
  await expect.poll(async () => (await inspect(page)).globeLoaded).toBe(true);
  // Selection now opens a reserved Details pane. Wait until initial imagery
  // loading and the resulting viewport resize have settled before measuring retry.
  let previousTiles = -1,
    stableLoadedChecks = 0;
  await expect
    .poll(
      async () => {
        const loaded = (await inspect(page)).globeLoaded;
        stableLoadedChecks =
          loaded && imageryTiles === previousTiles ? stableLoadedChecks + 1 : 0;
        previousTiles = imageryTiles;
        return stableLoadedChecks;
      },
      { intervals: [200, 300, 500] },
    )
    .toBeGreaterThanOrEqual(3);
  const before = await inspect(page);
  const initial = await stats(page);
  const selected = await pane(page).getAttribute('data-selection');
  const initialImageryTiles = imageryTiles;
  expect(imageryEndpoints).toBe(1);
  expect(terrainEndpoints).toBe(1);
  terrainDenied = false;
  await pane(page)
    .getByRole('button', { name: 'Retry services', exact: true })
    .click();
  await expect
    .poll(async () => (await inspect(page)).spatial.terrain)
    .toBe('ready');
  expect(imageryEndpoints).toBe(1);
  expect(terrainEndpoints).toBe(2);
  // Provider readiness precedes Cesium's committed presentation acknowledgement.
  await expect.poll(async () => (await inspect(page)).ready).toBe(true);
  const after = await inspect(page);
  // Cesium invalidates globe tiles when terrain changes, including cached tile
  // textures. Assert Sentinel's service retention directly, not SDK tile demand.
  expect(before.diagnostics.standardLayerGenerations).toBeDefined();
  expect(after.diagnostics.standardLayerGenerations?.imagery).toBe(
    before.diagnostics.standardLayerGenerations!.imagery,
  );
  expect(after.diagnostics.standardLayerGenerations?.buildings).toBe(
    before.diagnostics.standardLayerGenerations!.buildings,
  );
  expect(after.diagnostics.standardLayerGenerations?.terrain).toBeGreaterThan(
    before.diagnostics.standardLayerGenerations!.terrain,
  );
  expect(after.environment.imageryLayers).toBe(
    before.environment.imageryLayers,
  );
  expect(after.spatial.imagery).toBe('ready');
  expect(after.diagnostics.environmentLoads).toBe(
    before.diagnostics.environmentLoads,
  );
  expect((await stats(page)).created).toBe(initial.created);
  assertContext(before, after);
  await expect(pane(page)).toHaveAttribute('data-selection', selected!);
  const evidence = resolve('test-results/browser/map-recovery');
  await mkdir(evidence, { recursive: true });
  await writeFile(
    resolve(evidence, 'provider-retry-resources.json'),
    JSON.stringify(
      {
        provider:
          'Explicit synthetic standard imagery and terrain; no real provider claim',
        beforeGenerations: before.diagnostics.standardLayerGenerations,
        afterGenerations: after.diagnostics.standardLayerGenerations,
        imageryLayers: [
          before.environment.imageryLayers,
          after.environment.imageryLayers,
        ],
        imageryEndpoints,
        terrainEndpoints,
        initialImageryTiles,
        imageryTiles,
      },
      null,
      2,
    ),
  );
});
