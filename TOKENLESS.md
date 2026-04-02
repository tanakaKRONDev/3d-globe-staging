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

## Artist subdomains

### What works now
- **Query param override:** `?artist=demo` on any environment (localhost, workers.dev, custom domain)
  - Frontend forwards `?artist=` to `/api/artist` and `/api/stops`
  - Worker resolves artist branding and scopes stops accordingly
- **Custom domain subdomains:** `demo.yourdomain.com` (requires setup below)

### What does NOT work
- **Nested workers.dev subdomains:** `demo.3d-globe-staging.dream-dev-325.workers.dev`
  causes `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` because Cloudflare's wildcard SSL cert
  for `*.workers.dev` does not cover nested subdomains (e.g. `*.*.workers.dev`).
  This is a Cloudflare platform limitation, not a code bug.

### Requirements for real artist subdomains
1. Register a custom domain (e.g. `yourdomain.com`)
2. Add it to Cloudflare DNS
3. Create a wildcard DNS record: `*.yourdomain.com` → CNAME to your worker
4. In Cloudflare dashboard, add `*.yourdomain.com` as a Custom Domain on your Worker
5. Cloudflare will auto-provision a wildcard SSL cert for `*.yourdomain.com`
6. Then `demo.yourdomain.com` will resolve correctly and the worker's
   `parseHostContext()` will extract `demo` as the artist slug

### Testing without subdomains
Use the query param: `https://your-site.com/?artist=demo`

## Before adding paid services
Get explicit approval, then remove the guardrails and update this file.
