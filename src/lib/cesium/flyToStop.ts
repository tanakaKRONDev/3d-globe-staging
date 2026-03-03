import type { Viewer } from 'cesium'
import {
  BoundingSphere,
  Cartesian3,
  EasingFunction,
  HeadingPitchRange,
  Math as CesiumMath,
} from 'cesium'
import { VENUE_DEFAULT_RANGE_M, VENUE_PITCH_DEG } from '../../config/camera'
import { applyCameraConstraints, recordProgrammaticFly } from './cameraConstraints'
import { enterVenueOrbit } from './venueOrbit'
import type { Stop } from '../data/types'

const FLY_DURATION_S = 2.0
const TARGET_SPHERE_RADIUS = 200

/**
 * Fly to a stop then enter venue orbit (lookAtTransform) at 1000 m.
 * No trackedEntity; on complete calls enterVenueOrbit for stable orbit.
 */
export function flyToStop(viewer: Viewer, stop: Stop): Promise<void> {
  const center = Cartesian3.fromDegrees(stop.lng!, stop.lat!, 0)
  const sphere = new BoundingSphere(center, TARGET_SPHERE_RADIUS)
  const offset = new HeadingPitchRange(
    0,
    CesiumMath.toRadians(VENUE_PITCH_DEG),
    VENUE_DEFAULT_RANGE_M
  )

  applyCameraConstraints(viewer, 'venue')

  const scene = viewer.scene
  const prevRequestRenderMode = scene.requestRenderMode
  scene.requestRenderMode = false

  return new Promise((resolve) => {
    viewer.camera.flyToBoundingSphere(sphere, {
      offset,
      duration: FLY_DURATION_S,
      easingFunction: EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        scene.requestRenderMode = prevRequestRenderMode
        scene.requestRender()
        enterVenueOrbit(viewer, stop)
        recordProgrammaticFly()
        resolve()
      },
      cancel: () => {
        scene.requestRenderMode = prevRequestRenderMode
        scene.requestRender()
        resolve()
      },
    })
  })
}
