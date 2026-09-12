import type { StyleSpecification } from 'maplibre-gl';

export const terrainSource = 'regional-dem';
export const elevationSource = 'regional-elevation';
export const hillshadeLayer = 'regional-hillshade';
export const extrusionLayer = 'regional-extrusions';
export const buildingFootprints = 'regional-footprints';

/** Adapted from v2's Protomaps cartographic hierarchy; no v2 runtime or store. */
export function regionalStyle(
  input: StyleSpecification,
  base: URL,
): StyleSpecification {
  const style = structuredClone(input);
  delete style.center;
  delete style.zoom;
  delete style.bearing;
  delete style.pitch;
  delete style.terrain;
  delete style.sky;
  delete style.light;
  style.projection = { type: 'mercator' };
  const local = (path: string) =>
    new URL(path, base).href.replaceAll('%7B', '{').replaceAll('%7D', '}');
  style.sources = {
    regional: {
      type: 'vector',
      url: `pmtiles://${local('./data/seasia-base.pmtiles')}`,
      attribution:
        '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://esa-worldcover.org/en/data-access">ESA WorldCover</a>',
    },
    [terrainSource]: {
      type: 'raster-dem',
      url: `pmtiles://${local('./data/seasia-terrain.pmtiles')}`,
      encoding: 'terrarium',
      tileSize: 512,
      minzoom: 0,
      maxzoom: 12,
      attribution:
        '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
    },
  };
  // Separate GPU DEM resources avoid MapLibre's hillshade/terrain texture conflict.
  // Both readers still share the same PMTiles archive directory cache.
  style.sources[elevationSource] = { ...style.sources[terrainSource] };
  style.glyphs = local('./assets/fonts/{fontstack}/{range}.pbf');
  style.sprite = local('./assets/sprites/dark');
  style.layers = style.layers
    .filter(
      (layer) =>
        !/poi|building/i.test(
          `${layer.id} ${'source-layer' in layer ? layer['source-layer'] : ''}`,
        ) && ['fill', 'line', 'symbol', 'background'].includes(layer.type),
    )
    .map((layer) => {
      if (layer.type === 'background')
        return { ...layer, paint: { 'background-color': '#0b1118' } };
      if (layer.type === 'fill') {
        const name = `${layer.id} ${layer['source-layer']}`;
        const color = /water/i.test(name)
          ? '#0b151f'
          : /park|wood|forest|nature|green/i.test(name)
            ? '#182322'
            : /landuse/i.test(name)
              ? '#1b2127'
              : '#151c23';
        return { ...layer, paint: { 'fill-color': color, 'fill-opacity': 1 } };
      }
      if (layer.type === 'line') {
        const paint = { ...layer.paint };
        delete paint['line-pattern'];
        delete paint['line-gradient'];
        return {
          ...layer,
          paint: {
            ...paint,
            'line-color': /boundar/i.test(layer.id)
              ? '#69727a'
              : /casing|tunnel/i.test(layer.id)
                ? '#151a20'
                : '#414b54',
            'line-opacity': /boundar/i.test(layer.id) ? 0.5 : 0.58,
          },
        };
      }
      if (layer.type === 'symbol') {
        const isPlace = /place|locality/i.test(
          `${layer.id} ${layer['source-layer']}`,
        );
        return {
          ...layer,
          minzoom: layer.id === 'places_subplace' ? 14 : layer.minzoom,
          paint: {
            ...layer.paint,
            'text-color': isPlace ? '#929da7' : '#788591',
            'text-opacity': 1,
            'text-halo-color': '#121921',
            'text-halo-width': 1.2,
            'text-halo-blur': 0,
            'icon-opacity': 0,
          },
        };
      }
      return layer;
    });
  const firstLine = style.layers.findIndex((layer) =>
    ['line', 'symbol'].includes(layer.type),
  );
  style.layers.splice(
    Math.max(1, firstLine),
    0,
    {
      id: hillshadeLayer,
      type: 'hillshade',
      source: terrainSource,
      paint: {
        'hillshade-shadow-color': '#080d13',
        'hillshade-highlight-color': '#77838b',
        'hillshade-accent-color': '#10161b',
        'hillshade-exaggeration': 0.3,
      },
    },
    {
      id: buildingFootprints,
      type: 'fill',
      source: 'regional',
      'source-layer': 'buildings',
      minzoom: 13,
      paint: {
        'fill-color': '#303a43',
        'fill-opacity': 0.65,
        'fill-outline-color': '#414c56',
      },
    },
    {
      id: extrusionLayer,
      type: 'fill-extrusion',
      source: 'regional',
      'source-layer': 'buildings',
      minzoom: 13,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': '#343f49',
        'fill-extrusion-opacity': 1,
        // Preserve a supplied zero. Missing heights alone use a 6 m visual assumption.
        'fill-extrusion-height': ['max', 0, ['number', ['get', 'height'], 6]],
        'fill-extrusion-base': [
          'min',
          ['max', 0, ['number', ['get', 'height'], 6]],
          ['max', 0, ['number', ['get', 'min_height'], 0]],
        ],
        'fill-extrusion-vertical-gradient': false,
      },
    },
  );
  style.light = {
    anchor: 'viewport',
    color: '#ffffff',
    intensity: 0.35,
    position: [1.5, 210, 35],
  };
  return style;
}
