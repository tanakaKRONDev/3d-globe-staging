import {
  Viewer,
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme,
  Credit
} from 'cesium'
import type { ImageryLayer } from 'cesium'

const NIGHT_LIGHTS_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default//GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg'

/**
 * Adds a night-only city lights imagery layer to the Cesium viewer.
 * The layer is visible only on the night side of the globe.
 *
 * @param viewer - The Cesium Viewer instance
 * @param baseLayer - The base imagery layer (e.g. GIBS) to dim on the night side
 * @returns The created ImageryLayer so it can be updated later if needed
 */
export function addNightLightsLayer(
  viewer: Viewer,
  baseLayer: ImageryLayer
): ImageryLayer {
  const provider = new UrlTemplateImageryProvider({
    url: NIGHT_LIGHTS_URL,
    tilingScheme: new WebMercatorTilingScheme(),
    maximumLevel: 8,
    credit: new Credit('NASA GIBS / VIIRS City Lights 2012'),
  })

  // Add above the base layer (insert at index 1 so it sits above base, under any OSM layer)
  const lightsLayer = viewer.imageryLayers.addImageryProvider(provider, 1)

  // Night-only: visible only on night side
  lightsLayer.dayAlpha = 0.0
  lightsLayer.nightAlpha = 1.0

  // Tune visuals so lights read as "on" (keep mild, avoid neon)
  lightsLayer.brightness = 1.4
  lightsLayer.gamma = 0.9
  lightsLayer.saturation = 1.2

  // Dim base imagery on night side so the lights pop
  baseLayer.dayAlpha = 1.0
  baseLayer.nightAlpha = 0.25

  return lightsLayer
}
