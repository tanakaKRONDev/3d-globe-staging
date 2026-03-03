import {
  Viewer,
  ImageryLayer,
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme,
  Rectangle,
  Credit,
} from 'cesium'
import type { Stop } from '../../data/types'

const VENUE_RECT_DEG = 0.35 // +/- degrees around venue center

const DEFAULT_URL_TEMPLATE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const DEFAULT_MAX_LEVEL = 18

function getConfig() {
  const url = import.meta.env.VITE_VENUE_IMAGERY_URL_TEMPLATE
  const maxLevel = import.meta.env.VITE_VENUE_IMAGERY_MAX_LEVEL
  return {
    urlTemplate: typeof url === 'string' && url.trim() ? url.trim() : DEFAULT_URL_TEMPLATE,
    maximumLevel: typeof maxLevel === 'string' ? parseInt(maxLevel, 10) : DEFAULT_MAX_LEVEL,
  }
}

/**
 * Creates a venue imagery layer limited to a rectangle around the stop.
 * Layer starts with alpha 0 (caller animates to 1 when entering venue mode).
 */
export function createVenueImageryLayer(
  viewer: Viewer,
  stop: Stop
): ImageryLayer {
  const lat = stop.lat ?? 0
  const lng = stop.lng ?? 0
  const { urlTemplate, maximumLevel } = getConfig()

  const rectangle = Rectangle.fromDegrees(
    lng - VENUE_RECT_DEG,
    lat - VENUE_RECT_DEG,
    lng + VENUE_RECT_DEG,
    lat + VENUE_RECT_DEG
  )

  const provider = new UrlTemplateImageryProvider({
    url: urlTemplate,
    tilingScheme: new WebMercatorTilingScheme(),
    maximumLevel: Number.isFinite(maximumLevel) ? maximumLevel : DEFAULT_MAX_LEVEL,
    credit: new Credit('Aerial imagery'),
  })

  const layer = new ImageryLayer(provider, {
    rectangle,
    alpha: 0,
  })

  viewer.imageryLayers.add(layer, viewer.imageryLayers.length)
  return layer
}

/**
 * Animates layer alpha from current to target over duration ms.
 */
export function animateVenueLayerAlpha(
  layer: ImageryLayer,
  targetAlpha: number,
  durationMs: number,
  viewer: Viewer
): Promise<void> {
  const startAlpha = layer.alpha
  const start = performance.now()

  return new Promise((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start
      const t = Math.min(1, elapsed / durationMs)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      layer.alpha = startAlpha + (targetAlpha - startAlpha) * eased

      if (viewer.scene.requestRenderMode) {
        viewer.scene.requestRender()
      }

      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        resolve()
      }
    }
    requestAnimationFrame(tick)
  })
}
