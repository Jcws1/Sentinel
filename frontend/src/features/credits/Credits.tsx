import type { ReactNode } from 'react';
import './credits.css';

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** Static acknowledgements only. Live, viewport-dependent credits stay with each renderer. */
export function Credits() {
  return (
    <article
      className="credits-view"
      aria-label="Settings — Credits"
      tabIndex={0}
    >
      <div className="credits-heading">
        <span>Settings</span>
        <h1>Credits</h1>
      </div>
      <p>
        Sources and licences for Sentinel’s maps. Each map identifies the
        content currently displayed; its attribution control includes any
        additional viewport-specific credits.
      </p>
      <section>
        <h2>Local Tactical map</h2>
        <dl>
          <div>
            <dt>OpenStreetMap</dt>
            <dd>
              © OpenStreetMap contributors. Streets, places, boundaries,
              buildings and coastline data via Protomaps.{' '}
              <Link href="https://www.openstreetmap.org/copyright">
                Copyright and ODbL
              </Link>
            </dd>
          </div>
          <div>
            <dt>Protomaps</dt>
            <dd>
              Regional vector basemap and adapted map styles.{' '}
              <Link href="https://github.com/protomaps/basemaps/blob/main/LICENSE_DATA.md">
                Dataset notices
              </Link>{' '}
              ·{' '}
              <Link href="https://github.com/protomaps/basemaps/blob/main/LICENSE.md">
                Code and style licences
              </Link>
            </dd>
          </div>
          <div>
            <dt>ESA WorldCover</dt>
            <dd>
              Landcover derived through the Protomaps pipeline; rendering styles
              modified for Sentinel. The prepared archive does not identify its
              WorldCover edition.{' '}
              <Link href="https://esa-worldcover.org/en/data-access">
                Source acknowledgements
              </Link>{' '}
              ·{' '}
              <Link href="https://creativecommons.org/licenses/by/4.0/">
                CC BY 4.0
              </Link>
            </dd>
          </div>
          <div>
            <dt>Mapterhorn</dt>
            <dd>
              Regional elevation tiles used for hillshade and terrain.
              Underlying elevation sources have their own notices and licences.{' '}
              <Link href="https://mapterhorn.com/attribution/">
                Source catalogue and attribution
              </Link>
            </dd>
          </div>
          <div>
            <dt>Natural Earth</dt>
            <dd>
              Public-domain geographic data used by the upstream basemap
              pipeline.{' '}
              <Link href="https://www.naturalearthdata.com/about/terms-of-use/">
                Terms of use
              </Link>
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>Hosted map services</h2>
        <dl>
          <div>
            <dt>Google Maps</dt>
            <dd>
              Photorealistic environmental base when selected and available.
              Tile credits change with the visible geography and remain on the
              map or in its Data sources panel. Sentinel’s synthetic mission
              overlays are separate.{' '}
              <Link href="https://developers.google.com/maps/documentation/tile/policies">
                Map Tiles attribution requirements
              </Link>
            </dd>
          </div>
          <div>
            <dt>Cesium ion</dt>
            <dd>
              Configured imagery, World Terrain and OSM Buildings; optional
              photorealistic access. Provider-supplied credits accompany each
              displayed layer.{' '}
              <Link href="https://cesium.com/learn/ion/content-usage-and-attribution-guide/">
                Content and attribution
              </Link>{' '}
              ·{' '}
              <Link href="https://cesium.com/legal/third-party-terms/">
                Third-party terms
              </Link>
            </dd>
          </div>
          <div>
            <dt>MapTiler Cloud</dt>
            <dd>
              Optional hosted Tactical basemap. MapTiler and underlying dataset
              attribution remain on the map; the MapTiler logo is retained
              because no paid-plan exemption has been verified.{' '}
              <Link href="https://docs.maptiler.com/guides/map-design/attribution/add-attribution/">
                Attribution requirements
              </Link>
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>Map software and assets</h2>
        <dl>
          <div>
            <dt>MapLibre GL JS</dt>
            <dd>
              <Link href="https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt">
                BSD 3-Clause licence
              </Link>
            </dd>
          </div>
          <div>
            <dt>CesiumJS</dt>
            <dd>
              <Link href="https://github.com/CesiumGS/cesium/blob/main/LICENSE.md">
                Apache 2.0 licence
              </Link>
            </dd>
          </div>
          <div>
            <dt>PMTiles</dt>
            <dd>
              <Link href="https://github.com/protomaps/PMTiles/blob/main/LICENSE">
                BSD 3-Clause licence
              </Link>
            </dd>
          </div>
          <div>
            <dt>Noto Sans glyphs</dt>
            <dd>
              <Link href="https://github.com/protomaps/basemaps-assets/blob/main/fonts/OFL.txt">
                SIL Open Font License
              </Link>
            </dd>
          </div>
          <div>
            <dt>Mapzen / Tangram icons</dt>
            <dd>
              Distributed in the local sprite pack.{' '}
              <Link href="https://github.com/tangrams/icons/blob/master/LICENSE.md">
                MIT licence and copyright notice
              </Link>
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
