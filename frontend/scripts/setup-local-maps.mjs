import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Copy only compatible environmental data. The source is never written to.
const source = resolve(process.argv[2] ?? '../../Sentinel2/public/edge-map');
const destination = fileURLToPath(
  new URL('../public/edge-map/', import.meta.url),
);
const archives = {
  'seasia-base.pmtiles':
    '50b9c7291568e418f05350c2d5cfec3f0d9fdb54998ef084bb7c9626e80e4ed4',
  'seasia-terrain.pmtiles':
    '97da1abd2dfc5f4b151934af9d8157715d098028236d5ca0bdb3a5a43c968a1e',
};
async function hash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
await mkdir(join(destination, 'data'), { recursive: true });
for (const [name, expected] of Object.entries(archives)) {
  const input = join(source, 'data', name);
  if ((await hash(input)) !== expected)
    throw Error(
      `Unreviewed archive: ${name}. Inspect metadata/coverage before changing its recorded hash.`,
    );
  await copyFile(input, join(destination, 'data', name));
}
for (const name of [
  'Noto Sans Regular',
  'Noto Sans Medium',
  'Noto Sans Italic',
])
  await cp(
    join(source, 'assets/fonts', name),
    join(destination, 'assets/fonts', name),
    { recursive: true },
  );
await mkdir(join(destination, 'assets/sprites'), { recursive: true });
for (const name of ['dark.png', 'dark.json', 'dark@2x.png', 'dark@2x.json'])
  await copyFile(
    join(source, 'assets/sprites', name),
    join(destination, 'assets/sprites', name),
  );
// v2's pack omitted these upstream notices. Ship them with the reused assets.
await cp(
  fileURLToPath(new URL('../map-data/licenses/', import.meta.url)),
  join(destination, 'assets/licenses'),
  { recursive: true },
);
// Adapt the reviewed style's cartographic hierarchy, never its source/camera/terrain configuration.
const style = JSON.parse(await readFile(join(source, 'style.json'), 'utf8'));
delete style.center;
delete style.zoom;
delete style.bearing;
delete style.pitch;
delete style.terrain;
delete style.sky;
delete style.light;
style.sources = {
  regional: {
    type: 'vector',
    url: 'pmtiles://./data/seasia-base.pmtiles',
    attribution:
      '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a> · <a href="https://esa-worldcover.org/en/data-access">ESA WorldCover</a>',
  },
};
style.glyphs = './assets/fonts/{fontstack}/{range}.pbf';
style.sprite = './assets/sprites/dark';
style.layers = style.layers.filter(
  (layer) =>
    !['raster', 'hillshade', 'fill-extrusion'].includes(layer.type) &&
    !/poi/i.test(layer.id),
);
for (const layer of style.layers) if (layer.source) layer.source = 'regional';
await writeFile(
  join(destination, 'style.json'),
  JSON.stringify(style, null, 2) + '\n',
);
await writeFile(
  join(destination, 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      region: [99, -1.5, 105.5, 7],
      vector: {
        file: 'data/seasia-base.pmtiles',
        minzoom: 0,
        maxzoom: 15,
        osmSnapshot: '2026-09-01T04:00:00Z',
        sha256: archives['seasia-base.pmtiles'],
      },
      terrain: {
        file: 'data/seasia-terrain.pmtiles',
        minzoom: 0,
        maxzoom: 12,
        encoding: 'terrarium',
        tileSize: 512,
        sha256: archives['seasia-terrain.pmtiles'],
        attribution: 'https://mapterhorn.com/attribution',
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Prepared reviewed regional archives, three Noto font stacks, sprites and adapted style. No source files changed.',
);
