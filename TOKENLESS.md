# Tokenless Policy

This project runs **without Cesium Ion tokens or any paid tile/imagery services**.

## Allowed sources
- **NASA GIBS** (BlueMarble, VIIRS City Lights) via WMTS/UrlTemplate
- **OpenStreetMap** raster tiles (`tile.openstreetmap.org`)
- **Local static assets** in `public/` and `data/`
- **Code-generated assets** (pole overlays, building textures via scripts)

## Banned services (no tokens, no API keys)
- Cesium Ion (`ion.cesium.com`, `api.cesium.com`, `assets.cesium.com`)
- Google Maps / Tiles (`maps.googleapis.com`)
- Mapbox (`api.mapbox.com`)
- MapTiler (`api.maptiler.com`)
- Bing Maps (`tiles.virtualearth.net`)

## Dev guardrails
In development mode (`vite dev`), runtime guardrails in
`src/lib/cesium/tokenlessGuardrails.ts` will warn in the console if:
- `Cesium.Ion.defaultAccessToken` is read as non-empty or written to
- Any `fetch()` request targets a banned domain

These guardrails are tree-shaken out of production builds.

## Before adding paid services
Get explicit approval, then remove the guardrails and update this file.
