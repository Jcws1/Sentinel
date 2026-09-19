# Provider configuration

The checked-in [environment template](../frontend/.env.example) defines the current frontend options. Set local values in ignored `frontend/.env.local`; preserve existing values and restart/rebuild after changes. This page documents configuration consumed by the existing code, not current provider pricing or licence eligibility.

| Variable | Existing application behavior |
|---|---|
| `VITE_TACTICAL_PROVIDER` | `local` regional pack or `maptiler` hosted Tactical style |
| `VITE_TACTICAL_STYLE_URL` | Optional MapTiler style URL; template uses `streets-v4` |
| `VITE_MAPTILER_KEY` | Existing browser map key for the hosted route |
| `VITE_CESIUM_ION_TOKEN` | Existing ion asset-read token |
| `VITE_CESIUM_IMAGERY_ASSET_ID` | Standard imagery asset; template default 2 |
| `VITE_CESIUM_TERRAIN_ASSET_ID` | Standard terrain asset; template default 1 |
| `VITE_CESIUM_BUILDINGS_ASSET_ID` | Standard buildings asset; template default 96188 |
| `VITE_GOOGLE_MAPS_API_KEY` | Existing Google Map Tiles API browser key |
| `VITE_CESIUM_PHOTOREALISTIC_ASSET_ID` | Optional ion photorealistic route; default 0 disables it |

A zero ion layer ID disables that layer. Direct Google configuration takes precedence over the optional ion photorealistic route. Choose Google photorealistic content in the relevant map/Video environment controls. Its exclusive base replaces the standard globe/imagery/buildings presentation; failure has an explicit fallback/retry path.

Use only existing authorized provider arrangements and restrict browser credentials to the intended APIs/assets and origins. Do not commit local configuration or provider-bearing build output. The app preserves on-screen attribution and does not change billing, create accounts or enable assets.

Missing credentials use labelled local fallbacks. The optional [regional pack](MAP_REFINEMENT_SETUP.md) needs no provider request once prepared. Default browser regression builds clear provider credentials; configured foreground tests must be explicitly selected and bounded.

Historical account instructions and verified observations remain in the [local archive](ARCHIVE.md). They should not be read as a current pricing/terms guarantee.
