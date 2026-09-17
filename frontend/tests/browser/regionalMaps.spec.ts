import { loadFixture } from './actions';
import { test, expect, type Page } from '@playwright/test';
import type {
  CameraIntent,
  MapPresentation,
} from '../../src/renderers/contracts';
import type { CesiumProvider } from '../../src/renderers/cesium/config';
import { closeTab, tabAction } from './actions';

interface ViewProbe {
  clockTime: string;
  ready: boolean;
  camera: CameraIntent;
  pitch: number;
  frameId: string;
  region?: { bounds: number[] };
  terrainFailed: boolean;
  geography?: {
    buildings: number;
    footprintVisible: boolean;
    extrusionsVisible: boolean;
    hillshadeVisible: boolean;
  };
  terrain?: { exaggeration: number } | null;
  spatial: { photorealistic: string; environment: string };
  environment: {
    globeShown: boolean;
    osmBuildings: boolean;
    realTerrain: boolean;
    photorealisticLoaded: boolean;
    photoVisibleTiles: number;
  };
}
interface MapProbes extends Window {
  __sentinelMapTest: {
    setProvider(id: string, styleUrl: string): void;
    inspect(id: string): ViewProbe;
    useRegional(id: string): void;
    setCamera(id: string, camera: CameraIntent): void;
    stats(): { active: number };
  };
  __sentinelCesiumTest: {
    inspect(id: string): ViewProbe;
    setCamera(id: string, camera: CameraIntent): void;
    setProvider(id: string, provider: CesiumProvider): void;
    setPresentation(id: string, options: MapPresentation): void;
  };
}
const origin = 'http://127.0.0.1:5182';
const pane = (page: Page, id = 'tactical') =>
  page.locator(`.tactical-view[data-view-id="${id}"]`);
const inspect = (page: Page, threeD = false, id = 'tactical') =>
  page.evaluate(
    ({ threeD, id }) =>
      (threeD
        ? (window as unknown as MapProbes).__sentinelCesiumTest
        : (window as unknown as MapProbes).__sentinelMapTest
      )?.inspect(id),
    { threeD, id },
  );
async function load(page: Page) {
  await page.goto(origin);
  await loadFixture(page, 'Tactical');
  await expect.poll(async () => (await inspect(page))?.ready).toBe(true);
}
async function regional(page: Page, id = 'tactical') {
  await page.evaluate(
    (id) => (window as unknown as MapProbes).__sentinelMapTest.useRegional(id),
    id,
  );
  await expect(pane(page, id)).toContainText('LOCAL VECTOR');
  await expect
    .poll(async () => (await inspect(page, false, id))?.ready)
    .toBe(true);
}
async function layer(page: Page, name: string, id = 'tactical') {
  await pane(page, id).getByRole('button', { name: 'Map layers' }).click();
  await page.getByRole('menuitemcheckbox', { name, exact: true }).click();
}

test('local source credits follow visible terrain and remain accessible when compact; hosted credits stay expanded', async ({
  page,
}) => {
  await load(page);
  await regional(page);
  const attribution = pane(page).locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toContainText('OpenStreetMap');
  await expect(attribution).toContainText('ESA WorldCover');
  await expect(attribution).toContainText('Mapterhorn');
  await expect(attribution).not.toContainText('Protomaps');
  await layer(page, 'Hillshade');
  await expect(attribution).not.toContainText('Mapterhorn');
  await layer(page, 'Hillshade');
  await expect(attribution).toContainText('Mapterhorn');
  await page.setViewportSize({ width: 760, height: 650 });
  await pane(page).getByRole('button', { name: 'Pan', exact: true }).click();
  const canvas = pane(page).locator('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 50,
    box!.y + box!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(attribution).not.toHaveClass(/maplibregl-compact-show/);
  const toggle = attribution.locator('summary');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(
    attribution.getByRole('link', { name: '© OpenStreetMap', exact: true }),
  ).toBeVisible();
  const attributedBounds = await attribution.boundingBox();
  expect(attributedBounds!.x + attributedBounds!.width).toBeLessThanOrEqual(
    760,
  );
  await page.route('**/synthetic-credit-style.json', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          test: {
            type: 'geojson',
            attribution:
              '<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · SYNTHETIC STYLE',
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [99, -1],
                        [106, -1],
                        [106, 7],
                        [99, 7],
                        [99, -1],
                      ],
                    ],
                  },
                },
              ],
            },
          },
        },
        layers: [
          {
            id: 'land',
            type: 'fill',
            source: 'test',
            paint: { 'fill-color': '#141a20' },
          },
        ],
      },
    }),
  );
  await page.evaluate(
    (origin) =>
      (window as unknown as MapProbes).__sentinelMapTest.setProvider(
        'tactical',
        `${origin}/synthetic-credit-style.json`,
      ),
    origin,
  );
  await expect(attribution).toContainText('SYNTHETIC STYLE');
  await expect(attribution).not.toContainText('ESA WorldCover');
  await expect(attribution).not.toContainText('Mapterhorn');
  await expect(attribution).not.toHaveClass(/maplibregl-compact/);
  await expect(pane(page).locator('.maptiler-credit img')).toHaveAttribute(
    'alt',
    'MapTiler',
  );
});

test('Pan permits keyboard selection and the 3D Layers disclosure is keyboard-scrollable at 960 by 600', async ({
  page,
}) => {
  await load(page);
  await pane(page).locator('canvas').focus();
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    /fixture-tactical-/,
  );
  await pane(page).getByRole('button', { name: 'Pan', exact: true }).click();
  await page
    .locator('.selection-details')
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click();
  await pane(page).locator('canvas').focus();
  await page.keyboard.press('Enter');
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    /fixture-tactical-/,
  );
  await pane(page).getByRole('button', { name: 'Select', exact: true }).click();
  await pane(page).locator('canvas').focus();
  await page.keyboard.press('Enter');
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    /fixture-tactical-/,
  );
  await page.setViewportSize({ width: 960, height: 600 });
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect.poll(async () => (await inspect(page, true))?.ready).toBe(true);
  await pane(page).getByRole('button', { name: 'Map layers' }).click();
  const menu = page.locator('.map-layer-menu');
  const box = await menu.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  // Radix may position on a half CSS pixel after collision adjustment.
  expect(box!.y + box!.height).toBeLessThanOrEqual(593);
  await page.keyboard.press('End');
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Noon daylight' }),
  ).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => menu.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(
    pane(page).getByRole('button', { name: 'Map layers' }),
  ).toBeFocused();
});

for (const resource of ['fonts', 'sprites']) {
  test(`missing local ${resource} fall back visibly and recover through retry`, async ({
    page,
  }) => {
    await load(page);
    const selectedBefore = (await inspect(page)).camera;
    let failed = true;
    await page.route(`**/edge-map/assets/${resource}/**`, (route) =>
      failed ? route.fulfill({ status: 404 }) : route.continue(),
    );
    await page.evaluate(() =>
      (window as unknown as MapProbes).__sentinelMapTest.useRegional(
        'tactical',
      ),
    );
    await expect(pane(page)).toContainText('Basemap unavailable');
    failed = false;
    await pane(page).getByRole('button', { name: 'Retry basemap' }).click();
    await expect(pane(page)).toContainText('LOCAL VECTOR');
    expect((await inspect(page)).camera.center.longitudeDeg).toBeCloseTo(
      selectedBefore.center.longitudeDeg,
      4,
    );
  });
}

test('regional archives serve ranges, glyphs and sprites; buildings, pitch and terrain are independent and survive mode changes', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', () => streams++);
  await load(page);
  await regional(page);
  const range = await page.request.get(
    `${origin}/edge-map/data/seasia-base.pmtiles`,
    { headers: { Range: 'bytes=0-126' } },
  );
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(127);
  expect(range.headers()['content-range']).toBe('bytes 0-126/382033293');
  for (const path of [
    'assets/fonts/Noto%20Sans%20Regular/0-255.pbf',
    'assets/sprites/dark@2x.png',
  ]) {
    const response = await page.request.get(`${origin}/edge-map/${path}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).not.toContain('text/html');
  }
  await page.evaluate(() =>
    (window as unknown as MapProbes).__sentinelMapTest.setCamera('tactical', {
      center: { longitudeDeg: 103.852, latitudeDeg: 1.285 },
      groundSpanM: 2400,
      headingTrueDeg: -24,
      pitchFromNadirDeg: 55,
    }),
  );
  await expect
    .poll(async () => (await inspect(page)).geography?.buildings ?? 0)
    .toBeGreaterThan(0);
  await layer(page, '3D buildings');
  expect((await inspect(page)).geography).toMatchObject({
    footprintVisible: false,
    extrusionsVisible: true,
    hillshadeVisible: true,
  });
  await layer(page, 'Hillshade');
  expect((await inspect(page)).geography).toMatchObject({
    extrusionsVisible: true,
    hillshadeVisible: false,
  });
  await layer(page, 'Terrain relief');
  expect((await inspect(page)).terrain?.exaggeration).toBe(1);
  await layer(page, '3D buildings');
  expect((await inspect(page)).geography).toMatchObject({
    footprintVisible: true,
    extrusionsVisible: false,
  });
  const before = (await inspect(page)).camera;
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect.poll(async () => (await inspect(page, true))?.ready).toBe(true);
  expect((await inspect(page, true)).camera.center.longitudeDeg).toBeCloseTo(
    before.center.longitudeDeg,
    3,
  );
  await pane(page)
    .getByRole('button', { name: 'Tactical', exact: true })
    .click();
  await regional(page);
  expect((await inspect(page)).pitch).toBeCloseTo(55, 1);
  await pane(page).getByRole('button', { name: 'Map layers' }).click();
  await page.getByRole('menuitem', { name: 'Top-down', exact: true }).click();
  expect((await inspect(page)).pitch).toBe(0);
  await pane(page).getByRole('button', { name: 'Recenter' }).click();
  await pane(page).locator('canvas').focus();
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  const selection = await pane(page).getAttribute('data-selection');
  expect(selection).toBeTruthy();
  await tabAction(page, 'Tactical Map', 'New Tactical pane');
  await regional(page, 'tactical:2');
  expect(await pane(page, 'tactical:2').getAttribute('data-selection')).toBe(
    selection,
  );
  expect((await inspect(page, false, 'tactical:2')).frameId).toBe(
    (await inspect(page)).frameId,
  );
  await closeTab(page, 'Tactical Map 2');
  expect(
    await page.evaluate(
      () => (window as unknown as MapProbes).__sentinelMapTest.stats().active,
    ),
  ).toBe(1);
  expect(streams).toBe(1);
});

test('synthetic Google denial and an empty successful response never masquerade as geographic coverage; lighting preserves time', async ({
  page,
}) => {
  test.setTimeout(65000);
  await load(page);
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect.poll(async () => (await inspect(page, true))?.ready).toBe(true);
  await pane(page).getByRole('button', { name: 'Map layers' }).click();
  await expect(
    page.getByRole('menuitemradio', { name: /Google photorealistic/ }),
  ).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  let denied = true;
  await page.route('https://tile.googleapis.com/**', (route) =>
    denied
      ? route.fulfill({
          status: 403,
          json: { error: 'Synthetic provider denial' },
        })
      : route.fulfill({
          json: {
            asset: { version: '1.1' },
            geometricError: 0,
            root: {
              boundingVolume: { region: [1.8, 0.02, 1.83, 0.03, 0, 100] },
              geometricError: 0,
              children: [],
            },
          },
        }),
  );
  await page.evaluate(() => {
    const probe = (window as unknown as MapProbes).__sentinelCesiumTest;
    probe.setProvider('tactical', {
      googleKey: 'synthetic-browser-test',
      imageryAssetId: null,
      terrainAssetId: null,
      buildingsAssetId: null,
    });
    probe.setPresentation('tactical', {
      buildings: false,
      hillshade: true,
      terrain: false,
      environment: 'photorealistic',
      daylight: true,
    });
  });
  await expect
    .poll(async () => (await inspect(page, true)).spatial.photorealistic)
    .toBe('error');
  await expect(pane(page)).toContainText('Google unavailable');
  const before = await inspect(page, true);
  denied = false;
  await pane(page)
    .getByRole('button', { name: 'Retry services', exact: true })
    .click();
  await expect
    .poll(
      async () => (await inspect(page, true)).environment.photorealisticLoaded,
    )
    .toBe(true);
  expect((await inspect(page, true)).spatial.photorealistic).toBe('loading');
  expect((await inspect(page, true)).environment.globeShown).toBe(true);
  await expect
    .poll(async () => (await inspect(page, true)).spatial.photorealistic, {
      timeout: 50000,
    })
    .toBe('error');
  await expect(pane(page)).toContainText('Google unavailable');
  expect((await inspect(page, true)).camera.center.longitudeDeg).toBeCloseTo(
    before.camera.center.longitudeDeg,
    4,
  );
  await layer(page, 'Noon daylight');
  expect((await inspect(page, true)).clockTime).toBe(before.clockTime);
});

test('missing local archive and DEM recover visibly without changing selection or camera; both renderers enforce the mission region', async ({
  page,
}) => {
  await load(page);
  await pane(page).locator('canvas').focus();
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  const selection = await pane(page).getAttribute('data-selection');
  const before = (await inspect(page)).camera;
  let absent = true;
  await page.route('**/edge-map/data/seasia-base.pmtiles', (route) =>
    absent ? route.fulfill({ status: 404 }) : route.continue(),
  );
  await page.evaluate(() =>
    (window as unknown as MapProbes).__sentinelMapTest.useRegional('tactical'),
  );
  await expect(pane(page)).toContainText('Basemap unavailable');
  expect((await inspect(page)).camera.center.longitudeDeg).toBeCloseTo(
    before.center.longitudeDeg,
    4,
  );
  absent = false;
  await pane(page).getByRole('button', { name: 'Retry basemap' }).click();
  await expect(pane(page)).toContainText('LOCAL VECTOR');
  expect(await pane(page).getAttribute('data-selection')).toBe(selection);
  // New location forces an uncached DEM request; vectors must survive its failure.
  await page.route('**/edge-map/data/seasia-terrain.pmtiles', (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.evaluate(() =>
    (window as unknown as MapProbes).__sentinelMapTest.setCamera('tactical', {
      center: { longitudeDeg: 101.5, latitudeDeg: 4 },
      groundSpanM: 20000,
      headingTrueDeg: 0,
    }),
  );
  await expect(pane(page)).toContainText('TERRAIN UNAVAILABLE');
  expect((await inspect(page)).terrainFailed).toBe(true);
  await page.unroute('**/edge-map/data/seasia-terrain.pmtiles');
  await pane(page).getByRole('button', { name: 'Retry terrain' }).click();
  await expect(pane(page)).not.toContainText('TERRAIN UNAVAILABLE');
  await page.evaluate(() =>
    (window as unknown as MapProbes).__sentinelMapTest.setCamera('tactical', {
      center: { longitudeDeg: 130, latitudeDeg: 30 },
      groundSpanM: 3000000,
      headingTrueDeg: 0,
    }),
  );
  const tactical = (await inspect(page)).camera;
  expect(tactical.center.longitudeDeg).toBeLessThanOrEqual(105.5);
  expect(tactical.center.latitudeDeg).toBeLessThanOrEqual(7);
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect.poll(async () => (await inspect(page, true))?.ready).toBe(true);
  await page.evaluate(() =>
    (window as unknown as MapProbes).__sentinelCesiumTest.setCamera(
      'tactical',
      {
        center: { longitudeDeg: 80, latitudeDeg: -20 },
        groundSpanM: 2000000,
        headingTrueDeg: 0,
      },
    ),
  );
  const spatial = (await inspect(page, true)).camera;
  expect(spatial.center.longitudeDeg).toBeCloseTo(99, 3);
  expect(spatial.center.latitudeDeg).toBeCloseTo(-1.5, 3);
  expect(spatial.groundSpanM).toBeCloseTo(1100000, -1);
  expect(await pane(page).getAttribute('data-selection')).toBe(selection);
});
