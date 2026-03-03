import type { Viewer } from 'cesium'
import { DirectionalLight, Cartesian3 } from 'cesium'

export type ViewMode = 'overview' | 'venue'

/**
 * Installs venue lighting: in venue mode uses a stable camera-follow directional light
 * so buildings never go black due to time-of-day. In overview mode restores the
 * previous scene light (e.g. SunLight).
 */
export function installVenueLighting(
  viewer: Viewer,
  getViewMode: () => ViewMode
): () => void {
  const scene = viewer.scene

  const light = new DirectionalLight({
    direction: new Cartesian3(1, 0, 0),
    intensity: 2.0,
  })

  const prevLight = scene.light
  const directionResult = new Cartesian3()

  const onPreRender = () => {
    if (getViewMode() === 'venue') {
      light.direction = Cartesian3.normalize(
        viewer.camera.directionWC,
        directionResult
      )
      scene.light = light
    } else {
      scene.light = prevLight
    }
  }

  scene.preRender.addEventListener(onPreRender)

  return () => {
    scene.preRender.removeEventListener(onPreRender)
    scene.light = prevLight
  }
}
