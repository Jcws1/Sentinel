import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import {
  loadHostedStyle,
  localStyle,
  muteBasemap,
} from '../../src/renderers/providers';

function providerStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Provider test style',
    glyphs: '../fonts/{fontstack}/{range}.pbf',
    sprite: '../sprite/sentinel',
    sources: {
      geography: {
        type: 'vector',
        url: '../tiles/tiles.json',
        attribution: 'Map provider attribution · geographic contributors',
      },
      alternate: {
        type: 'raster',
        tiles: ['../../raster/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: 'Raster source attribution',
      },
    },
    layers: [
      {
        id: 'land',
        type: 'fill',
        source: 'geography',
        'source-layer': 'land',
        paint: { 'fill-color': '#ff0000' },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'geography',
        'source-layer': 'water',
        paint: { 'fill-color': '#0088ff' },
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'geography',
        'source-layer': 'transportation',
        paint: { 'line-color': '#f9c200', 'line-width': 1 },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'geography',
        'source-layer': 'place',
        layout: { 'text-field': ['get', 'name'], 'icon-image': 'place-icon' },
        paint: { 'text-color': '#ff00ff' },
      },
      {
        id: 'places-of-interest',
        type: 'symbol',
        source: 'geography',
        'source-layer': 'poi',
      },
      { id: 'imagery', type: 'raster', source: 'alternate' },
    ],
  };
}

function mockStyle(style: unknown = providerStyle()) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(style)));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe('Tactical provider boundary', () => {
  it('creates a self-contained fallback without external requests or fictional geography', () => {
    const a = localStyle();
    const b = localStyle();
    expect(a.version).toBe(8);
    expect(a.sources).toEqual({});
    expect(a.layers.map((layer) => layer.type)).toEqual(['background']);
    expect(a.glyphs).toBeUndefined();
    expect(a.sprite).toBeUndefined();
    a.layers.splice(0);
    expect(b.layers).toHaveLength(1);
  });

  it('mutes presentation while preserving provider sources, attribution and label content', () => {
    const input = providerStyle();
    const before = structuredClone(input);
    const output = muteBasemap(input);
    expect(input).toEqual(before);
    expect(output.sources).toEqual(input.sources);
    expect(output.sources).not.toBe(input.sources);
    expect(output.glyphs).toBe(input.glyphs);
    expect(output.sprite).toBe(input.sprite);
    expect(
      output.layers.some((layer) => layer.id === 'places-of-interest'),
    ).toBe(false);
    expect(output.layers.find((layer) => layer.id === 'land')).toMatchObject({
      paint: { 'fill-color': '#171c20' },
    });
    expect(output.layers.find((layer) => layer.id === 'water')).toMatchObject({
      paint: { 'fill-color': '#0b131a' },
    });
    expect(
      output.layers.find((layer) => layer.id === 'place-label'),
    ).toMatchObject({
      layout: { 'text-field': ['get', 'name'] },
      paint: { 'icon-opacity': 0 },
    });
    expect(output.layers.find((layer) => layer.id === 'imagery')).toMatchObject(
      {
        paint: { 'raster-saturation': -1 },
      },
    );
  });

  it('cannot retain saturated provider patterns or decorative unsupported layers', () => {
    const input = providerStyle();
    input.sky = { 'sky-color': '#00aaff', 'fog-color': '#ff00ff' };
    input.light = { color: '#ffff00' };
    input.terrain = { source: 'height-data' };
    input.projection = { type: 'globe' };
    input.layers.push(
      {
        id: 'pattern-land',
        type: 'fill',
        source: 'geography',
        'source-layer': 'land',
        paint: {
          'fill-pattern': 'bright-pattern',
          'fill-outline-color': '#ff00ff',
        },
      },
      {
        id: 'pattern-road',
        type: 'line',
        source: 'geography',
        'source-layer': 'transportation',
        paint: { 'line-pattern': 'bright-pattern' },
      },
      {
        id: 'colored-circle',
        type: 'circle',
        source: 'geography',
        'source-layer': 'arbitrary',
        paint: { 'circle-color': '#ff00ff' },
      },
      {
        id: 'density',
        type: 'heatmap',
        source: 'geography',
        'source-layer': 'arbitrary',
      },
      {
        id: 'extrusion',
        type: 'fill-extrusion',
        source: 'geography',
        'source-layer': 'arbitrary',
        paint: { 'fill-extrusion-color': '#ff00ff' },
      },
    );
    const output = muteBasemap(input);
    expect(output.terrain).toBeUndefined();
    expect(output.sky).toBeUndefined();
    expect(output.light).toBeUndefined();
    expect(output.projection).toEqual({ type: 'mercator' });
    expect(
      output.layers.some((layer) =>
        ['circle', 'heatmap', 'fill-extrusion'].includes(layer.type),
      ),
    ).toBe(false);
    expect(
      output.layers.find((layer) => layer.id === 'pattern-land')?.paint,
    ).not.toHaveProperty('fill-pattern');
    expect(
      output.layers.find((layer) => layer.id === 'pattern-land')?.paint,
    ).toMatchObject({ 'fill-outline-color': '#171c20' });
    expect(
      output.layers.find((layer) => layer.id === 'pattern-road')?.paint,
    ).not.toHaveProperty('line-pattern');
  });

  it('sends a configured key only to the explicit MapTiler host without cookies', async () => {
    const fetcher = mockStyle();
    const signal = new AbortController().signal;
    await loadHostedStyle(
      {
        styleUrl: 'https://api.maptiler.com/maps/operator/style.json',
        key: 'test-key',
      },
      signal,
    );
    const request = new URL(String(fetcher.mock.calls[0][0]));
    expect(request.hostname).toBe('api.maptiler.com');
    expect(request.searchParams.get('key')).toBe('test-key');
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      signal,
      credentials: 'omit',
    });
  });

  it('does not forward a MapTiler key to another provider or a lookalike host', async () => {
    for (const host of [
      'tiles.example.test',
      'api.maptiler.com.example.test',
    ]) {
      const fetcher = mockStyle();
      await loadHostedStyle(
        { styleUrl: `https://${host}/styles/style.json`, key: 'test-key' },
        new AbortController().signal,
      );
      expect(
        new URL(String(fetcher.mock.calls[0][0])).searchParams.has('key'),
      ).toBe(false);
    }
  });

  it('resolves style-relative resource URLs without breaking tile or glyph placeholders', async () => {
    mockStyle();
    const output = await loadHostedStyle(
      { styleUrl: 'https://tiles.example.test/styles/dark/style.json' },
      new AbortController().signal,
    );
    expect(output.glyphs).toBe(
      'https://tiles.example.test/styles/fonts/{fontstack}/{range}.pbf',
    );
    expect(output.sprite).toBe(
      'https://tiles.example.test/styles/sprite/sentinel',
    );
    expect(output.sources.geography).toMatchObject({
      url: 'https://tiles.example.test/styles/tiles/tiles.json',
      attribution: 'Map provider attribution · geographic contributors',
    });
    expect(output.sources.alternate).toMatchObject({
      tiles: ['https://tiles.example.test/raster/{z}/{x}/{y}.png'],
      attribution: 'Raster source attribution',
    });
  });

  it('resolves multiple sprite sources and permits a same-origin configured style', async () => {
    const style = providerStyle();
    style.sprite = [{ id: 'primary', url: './sprite' }];
    const fetcher = mockStyle(style);
    const output = await loadHostedStyle(
      { styleUrl: '/styles/local/style.json' },
      new AbortController().signal,
    );
    expect(String(fetcher.mock.calls[0][0])).toBe(
      new URL('/styles/local/style.json', location.href).href,
    );
    expect(output.sprite).toEqual([
      {
        id: 'primary',
        url: new URL('/styles/local/sprite', location.href).href,
      },
    ]);
  });

  it('rejects absent configuration and insecure cross-origin style URLs before fetching', async () => {
    const fetcher = mockStyle();
    await expect(
      loadHostedStyle({}, new AbortController().signal),
    ).rejects.toThrow('Provider not configured');
    for (const styleUrl of [
      'http://tiles.example.test/style.json',
      'javascript:alert(1)',
      'file:///style.json',
    ]) {
      await expect(
        loadHostedStyle({ styleUrl }, new AbortController().signal),
      ).rejects.toThrow('Unsupported provider URL');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces HTTP, invalid-style and abort failures instead of reporting a blank success', async () => {
    const provider = { styleUrl: 'https://tiles.example.test/style.json' };
    const fetcher = mockStyle();
    fetcher.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(
      loadHostedStyle(provider, new AbortController().signal),
    ).rejects.toThrow('Basemap request failed');
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: 7, sources: {}, layers: [] })),
    );
    await expect(
      loadHostedStyle(provider, new AbortController().signal),
    ).rejects.toThrow('Invalid basemap style');
    fetcher.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
    await expect(
      loadHostedStyle(provider, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
