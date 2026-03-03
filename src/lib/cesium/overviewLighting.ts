import type { Viewer } from 'cesium'
import { SunLight } from 'cesium'

export type ViewMode = 'overview' | 'venue'

/**
 * Applies lighting by mode: overview uses SunLight + globe enableLighting for
 * day/night imagery masking; venue does not override (venue lighting module
 * handles camera-follow light, enableLighting false for buildings).
 */
export function applyLightingByMode(
  viewer: Viewer,
  getMode: () => ViewMode
): () => void {
  const scene = viewer.scene
  const sun = new SunLight()

  const onPreRender = () => {
    if (getMode() === 'overview') {
      scene.light = sun
      scene.globe.enableLighting = true
    } else {
      scene.globe.enableLighting = false
    }
  }

  scene.preRender.addEventListener(onPreRender)
  return () => {
    scene.preRender.removeEventListener(onPreRender)
  }
}
