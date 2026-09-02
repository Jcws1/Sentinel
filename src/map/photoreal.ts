/* ===========================================================================
   GOD'S EYE — Google Photorealistic 3D Tiles

   QUARANTINED ON PURPOSE. Only ever reached through a dynamic import (see
   MapCanvas), so @deck.gl/geo-layers and @loaders.gl/3d-tiles are code-split
   into a chunk the edge build never downloads. Nothing on the offline path
   may import this file statically.

   What this is: textured photogrammetry mesh — real building façades from
   aerial capture, the same data Google Earth draws. Not a heightfield, and
   not extruded footprints. It supersedes both the vector basemap and MapLibre
   terrain; you get this or those, never both.

   LICENCE: tiles stream per view and may not be cached (Google Maps Platform
   ToS). Attribution returned by the tileset must be displayed.

   BRIEFING MODE ONLY. Two reasons it can never be the operational default:
   it cannot work disconnected, and streaming reveals the operator's area of
   interest to a third party in real time.
=========================================================================== */

/** Google's own endpoint. Billed against OUR key. */
const GOOGLE_TILESET = 'https://tile.googleapis.com/v1/3dtiles/root.json'

/**
 * Cesium ion's catalogue entry for the same tileset.
 *
 * Verified against the live ion API: asset 2275207, type 3DTILES, name
 * "Google Photorealistic 3D Tiles". Its `/endpoint` response hands back a
 * `tile.googleapis.com` URL carrying *Cesium's* Google key — so ion is a
 * broker, not a different or better dataset. The pixels are identical.
 *
 * The practical difference is whose quota burns: the direct route spends our
 * Google billing, the ion route spends our ion allowance. That is the only
 * reason to prefer one at runtime.
 */
const ION_ASSET_ID = 2275207

export type PhotorealRoute = 'google-direct' | 'cesium-ion'

export interface RouteResolution {
  route: PhotorealRoute | null
  /** Human-readable reason when no route resolved. */
  problem: string | null
}

/**
 * Pick a working route, preferring the direct key.
 *
 * Preflighted rather than discovered mid-render: a bad key fails per-tile deep
 * inside the loader, which surfaces as an empty black globe rather than
 * anything an operator can act on.
 */
export async function resolvePhotorealRoute(
  googleKey: string,
  ionToken: string,
): Promise<RouteResolution> {
  const problems: string[] = []

  if (googleKey) {
    try {
      const response = await fetch(`${GOOGLE_TILESET}?key=${googleKey}`)
      if (response.ok) return { route: 'google-direct', problem: null }
      problems.push(
        response.status === 403
          ? 'Google key rejected (403) — check the Map Tiles API is enabled, billing is active, and any HTTP-referrer restriction allows this origin.'
          : `Google returned ${response.status}.`,
      )
    } catch {
      problems.push('Could not reach tile.googleapis.com.')
    }
  }

  if (ionToken) {
    try {
      const response = await fetch(
        `https://api.cesium.com/v1/assets/${ION_ASSET_ID}/endpoint`,
        { headers: { Authorization: `Bearer ${ionToken}` } },
      )
      if (response.ok) return { route: 'cesium-ion', problem: null }
      problems.push(`Cesium ion returned ${response.status}.`)
    } catch {
      problems.push('Could not reach api.cesium.com.')
    }
  }

  if (!googleKey && !ionToken) {
    return {
      route: null,
      problem:
        'Needs VITE_GOOGLE_MAPS_API_KEY or VITE_CESIUM_ION_TOKEN in .env, then a dev-server restart.',
    }
  }

  return { route: null, problem: problems.join(' ') }
}

/* ---------------------------------------------------------------------------
   The deck.gl Tile3DLayer renderer that used to live here has been removed.

   It worked, but measured ~9 fps while orbiting against Cesium's ~78 on the
   same data and machine — Tile3DLayer emits one deck.gl sub-layer per
   resident tile and walks all ~690 on every camera change. Three tuning
   configurations were tried and none moved it; see photorealCesium.ts for the
   full numbers. Route resolution above is renderer-agnostic and is still used.
--------------------------------------------------------------------------- */
