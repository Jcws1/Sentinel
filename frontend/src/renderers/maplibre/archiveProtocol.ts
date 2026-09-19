import { PMTiles, Protocol } from 'pmtiles';
import { addProtocol, removeProtocol } from 'maplibre-gl';

let users = 0;
let protocol: Protocol | undefined;
export async function regionalCoverageBounds(): Promise<
  [number, number, number, number]
> {
  const url = new URL(
    `${import.meta.env.BASE_URL}edge-map/data/seasia-base.pmtiles`,
    location.href,
  ).href;
  const archive = protocol?.get(url) ?? new PMTiles(url);
  protocol?.add(archive);
  const header = await archive.getHeader();
  return [header.minLon, header.minLat, header.maxLon, header.maxLat];
}
/** PMTiles caches rejected metadata promises. Explicit retry replaces only the
 * two environmental archive readers, using the library's public registration API.
 * Other panes retain their renderer resources and complete operational scenes.
 */
export function refreshRegionalArchives() {
  for (const name of ['seasia-base.pmtiles', 'seasia-terrain.pmtiles']) {
    const url = new URL(
      `${import.meta.env.BASE_URL}edge-map/data/${name}`,
      location.href,
    ).href;
    protocol?.add(new PMTiles(url));
  }
}
/** Shared archive directory cache only. No renderer, mission or transport ownership. */
export function acquireArchives() {
  if (users++ === 0) {
    protocol = new Protocol({ metadata: true });
    addProtocol('pmtiles', protocol.tile);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--users === 0) {
      removeProtocol('pmtiles');
      protocol = undefined;
    }
  };
}
