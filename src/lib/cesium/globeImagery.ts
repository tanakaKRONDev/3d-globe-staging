import {
  Viewer,
  ImageryLayer,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
  Credit,
} from 'cesium'

export type GlobeImageryHandles = {
  dayLayer: ImageryLayer
  nightLayer: ImageryLayer
}

/**
 * Day imagery: GIBS WMTS (epsg3857) base layer.
 * Disabled night-lights overlay for now because the current source introduces polar artifacts.
 * Buildings and venue rendering are independent and intentionally unaffected.
 */
export function installDayNightImagery(viewer: Viewer): GlobeImageryHandles {
  const layers = viewer.imageryLayers
  layers.removeAll(true)

  const dayProvider = new WebMapTileServiceImageryProvider({
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    layer: 'BlueMarble_ShadedRelief_Bathymetry',
    style: 'default',
    format: 'image/jpeg',
    tileMatrixSetID: 'GoogleMapsCompatible_Level8',
    tilingScheme: new WebMercatorTilingScheme(),
    minimumLevel: 1,
    maximumLevel: 8,
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
    credit: new Credit('NASA GIBS / VIIRS City Lights 2012'),
  })
  const nightLayer = layers.addImageryProvider(nightProvider)
  nightLayer.show = false
  nightLayer.alpha = 1.0
  nightLayer.dayAlpha = 0.0
  nightLayer.nightAlpha = 1.0
  nightLayer.brightness = 1.4
  nightLayer.gamma = 0.9
  nightLayer.saturation = 1.2

  return { dayLayer, nightLayer }
}
