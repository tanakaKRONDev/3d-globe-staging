import type { ImageryLayer } from 'cesium'
import { Viewer, SingleTileImageryProvider, Rectangle } from 'cesium'

/**
 * Adds polar-cap imagery overlays to hide circular artifacts at north/south poles.
 * Uses soft gradient PNGs; imagery-only, no entities.
 */
export function installPoleOverlays(viewer: Viewer): { northLayer: ImageryLayer; southLayer: ImageryLayer } {
  const layers = viewer.imageryLayers

  const northProvider = new SingleTileImageryProvider({
    url: '/pole-north.png',
    rectangle: Rectangle.fromDegrees(-180, 84.5, 180, 90),
  })
  const northLayer = layers.addImageryProvider(northProvider)
  northLayer.alpha = 1.0

  const southProvider = new SingleTileImageryProvider({
    url: '/pole-south.png',
    rectangle: Rectangle.fromDegrees(-180, -90, 180, -84.5),
  })
  const southLayer = layers.addImageryProvider(southProvider)
  southLayer.alpha = 1.0

  return { northLayer, southLayer }
}
