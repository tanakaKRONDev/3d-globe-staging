import {
  Viewer,
  ImageryLayer,
  Rectangle,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
  Credit,
} from 'cesium'

const POLAR_CUTOFF_DEG = 82

export type GlobeImageryHandles = {
  dayLayer: ImageryLayer
  nightLayer: ImageryLayer
}

/**
 * Day imagery: same working GIBS WMTS (epsg3857) as before to avoid 404.
 * Night imagery: VIIRS city lights with dayAlpha/nightAlpha for night-side only.
 * Night masking requires globe.enableLighting = true (set in overview mode).
 */
export function installDayNightImagery(viewer: Viewer): GlobeImageryHandles {
  const layers = viewer.imageryLayers
  layers.removeAll(true)

  // Hide polar imagery artifacts near extreme latitudes
  const polarRect = Rectangle.fromDegrees(-180, -POLAR_CUTOFF_DEG, 180, POLAR_CUTOFF_DEG)

  const dayProvider = new WebMapTileServiceImageryProvider({
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    layer: 'BlueMarble_ShadedRelief_Bathymetry',
    style: 'default',
    format: 'image/jpeg',
    tileMatrixSetID: 'GoogleMapsCompatible_Level8',
    tilingScheme: new WebMercatorTilingScheme(),
    minimumLevel: 1,
    maximumLevel: 8,
    rectangle: polarRect,
    credit: new Credit('NASA GIBS'),
  })
  const dayLayer = layers.addImageryProvider(dayProvider)
  dayLayer.alpha = 1.0
  dayLayer.dayAlpha = 1.0
  dayLayer.nightAlpha = 0.25

  const nightProvider = new UrlTemplateImageryProvider({
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default//GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    tilingScheme: new WebMercatorTilingScheme(),
    maximumLevel: 8,
    rectangle: polarRect,
    credit: new Credit('NASA GIBS / VIIRS City Lights 2012'),
  })
  const nightLayer = layers.addImageryProvider(nightProvider)
  nightLayer.alpha = 1.0
  nightLayer.dayAlpha = 0.0
  nightLayer.nightAlpha = 1.0
  nightLayer.brightness = 1.4
  nightLayer.gamma = 0.9
  nightLayer.saturation = 1.2

  return { dayLayer, nightLayer }
}
