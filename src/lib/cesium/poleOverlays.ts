import type { ImageryLayer } from 'cesium'
import { Viewer, SingleTileImageryProvider, Rectangle } from 'cesium'

/**
 * Adds polar-cap imagery overlays to hide circular artifacts at north/south poles.
 * Uses soft gradient PNGs; imagery-only, no entities.
 * On failure, logs a warning and continues (does not crash viewer init).
 */
export function installPoleOverlays(viewer: Viewer): void {
  try {
    const layers = viewer.imageryLayers

    const northProvider = new SingleTileImageryProvider({
      url: '/pole-north.png',
      rectangle: Rectangle.fromDegrees(-180, 84.5, 180, 90),
      tileWidth: 1024,
      tileHeight: 1024,
    })
    const northLayer = layers.addImageryProvider(northProvider)
    northLayer.alpha = 1.0

    const southProvider = new SingleTileImageryProvider({
      url: '/pole-south.png',
      rectangle: Rectangle.fromDegrees(-180, -90, 180, -84.5),
      tileWidth: 1024,
      tileHeight: 1024,
    })
    const southLayer = layers.addImageryProvider(southProvider)
    southLayer.alpha = 1.0
  } catch (err) {
    console.warn('[PoleOverlays] disabled due to init error', err)
  }
}
