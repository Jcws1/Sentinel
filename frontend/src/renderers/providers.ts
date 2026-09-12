import type { StyleSpecification } from 'maplibre-gl';
import { regionalStyle } from './maplibre/regionalStyle';

export interface TacticalProvider {
  styleUrl?: string;
  key?: string;
  kind?: 'regional' | 'hosted';
}
export const defaultTacticalStyle =
  'https://api.maptiler.com/maps/streets-v4/style.json';
export const configuredProvider: TacticalProvider = {
  kind:
    import.meta.env.VITE_TACTICAL_PROVIDER === 'maptiler'
      ? 'hosted'
      : 'regional',
  styleUrl:
    import.meta.env.VITE_TACTICAL_STYLE_URL?.trim() || defaultTacticalStyle,
  key: import.meta.env.VITE_MAPTILER_KEY?.trim(),
};
export function isMapTiler(provider: TacticalProvider): boolean {
  try {
    return new URL(provider.styleUrl ?? '').hostname === 'api.maptiler.com';
  } catch {
    return false;
  }
}
export const hasTacticalCredentials = (provider: TacticalProvider) =>
  provider.kind === 'regional' ||
  Boolean(provider.styleUrl && (!isMapTiler(provider) || provider.key));
/** Restrict credential propagation to the approved HTTPS API host, including nested TileJSON resources. */
export function resourceUrl(value: string, key?: string): string {
  // The PMTiles protocol contains a nested absolute URL. URL normalization of
  // the outer scheme would corrupt "pmtiles://http://..." into "http//...".
  if (value.startsWith('pmtiles://')) return value;
  const url = new URL(value, location.href);
  if (key && url.protocol === 'https:' && url.hostname === 'api.maptiler.com')
    url.searchParams.set('key', key);
  return url.href.replaceAll('%7B', '{').replaceAll('%7D', '}');
}
export function localStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0b1015' },
      },
    ],
  };
}
/** Only presentation is changed. Provider source URLs and attribution stay intact. */
export function muteBasemap(input: StyleSpecification): StyleSpecification {
  const style = structuredClone(input);
  // Tactical is a flat projection. Hosted decoration must not enable 3D terrain,
  // sky/fog, lighting or a different camera projection as a side effect.
  delete style.terrain;
  delete style.sky;
  delete style.light;
  style.projection = { type: 'mercator' };
  style.layers = style.layers
    .filter((layer) => {
      const name = `${layer.id} ${'source-layer' in layer ? layer['source-layer'] : ''}`;
      return (
        ['background', 'fill', 'line', 'symbol', 'raster'].includes(
          layer.type,
        ) &&
        !/poi|transit|housenumber|building|aeroway|hillshade|3d/i.test(name)
      );
    })
    .map((layer) => {
      if (layer.type === 'background')
        return { ...layer, paint: { 'background-color': '#10151a' } };
      if (layer.type === 'fill') {
        const paint = { ...layer.paint };
        delete paint['fill-pattern'];
        const color = /water/i.test(
          `${layer.id} ${layer['source-layer'] ?? ''}`,
        )
          ? '#0b131a'
          : '#171c20';
        return {
          ...layer,
          paint: {
            ...paint,
            'fill-color': color,
            'fill-outline-color': color,
            'fill-opacity': 1,
          },
        };
      }
      if (layer.type === 'line') {
        const paint = { ...layer.paint };
        delete paint['line-pattern'];
        delete paint['line-gradient'];
        return {
          ...layer,
          paint: {
            ...paint,
            'line-color': /boundar/i.test(
              `${layer.id} ${layer['source-layer'] ?? ''}`,
            )
              ? '#4a4d51'
              : '#30363c',
            'line-opacity': 0.65,
          },
        };
      }
      if (layer.type === 'symbol')
        return {
          ...layer,
          minzoom: Math.max(layer.minzoom ?? 0, 8),
          paint: {
            ...layer.paint,
            'text-color': '#737b83',
            'text-halo-color': '#10151a',
            'text-halo-width': 1,
            'text-halo-blur': 0,
            'icon-opacity': 0,
          },
        };
      if (layer.type === 'raster')
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'raster-saturation': -1,
            'raster-brightness-min': 0,
            'raster-brightness-max': 0.25,
          },
        };
      return layer;
    });
  return style;
}
export async function loadHostedStyle(
  provider: TacticalProvider,
  signal: AbortSignal,
): Promise<StyleSpecification> {
  if (provider.kind === 'regional') {
    const base = new URL(
      `${import.meta.env.BASE_URL}edge-map/style.json`,
      location.href,
    );
    const response = await fetch(base, { signal });
    if (!response.ok) throw new Error('Regional style unavailable');
    const style = (await response.json()) as StyleSpecification;
    if (style.version !== 8 || !Array.isArray(style.layers))
      throw new Error('Invalid regional style');
    // MapLibre may silently omit labels when a font range is missing. Check the
    // required Latin ranges explicitly; never advertise a missing font pack as ready.
    await Promise.all(
      ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'].map(
        async (name) => {
          const font = await fetch(
            new URL(
              `./assets/fonts/${encodeURIComponent(name)}/0-255.pbf`,
              base,
            ),
            { signal },
          );
          if (
            !font.ok ||
            font.headers.get('content-type')?.includes('text/html') ||
            (await font.arrayBuffer()).byteLength < 8
          )
            throw new Error('Regional fonts unavailable');
        },
      ),
    );
    return regionalStyle(style, base);
  }
  if (!provider.styleUrl) throw new Error('Provider not configured');
  const url = new URL(provider.styleUrl, location.href);
  if (url.protocol !== 'https:' && url.origin !== location.origin)
    throw new Error('Unsupported provider URL');
  const response = await fetch(resourceUrl(url.href, provider.key), {
    signal,
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('Basemap request failed');
  const style: StyleSpecification = await response.json();
  if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources)
    throw new Error('Invalid basemap style');
  // Resolve relative resources against their style, not Sentinel's origin.
  const absolute = (value: string) =>
    resourceUrl(new URL(value, url).href, provider.key);
  if (typeof style.sprite === 'string') style.sprite = absolute(style.sprite);
  else if (Array.isArray(style.sprite))
    style.sprite = style.sprite.map((s) => ({ ...s, url: absolute(s.url) }));
  if (style.glyphs)
    style.glyphs = absolute(style.glyphs)
      .replaceAll('%7B', '{')
      .replaceAll('%7D', '}');
  for (const source of Object.values(style.sources)) {
    if ('url' in source && typeof source.url === 'string')
      source.url = absolute(source.url);
    if ('tiles' in source && source.tiles)
      source.tiles = source.tiles.map((tile) =>
        absolute(tile).replaceAll('%7B', '{').replaceAll('%7D', '}'),
      );
  }
  return muteBasemap(style);
}
