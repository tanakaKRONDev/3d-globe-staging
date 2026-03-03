import type { Viewer } from 'cesium'
import { Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, Transforms } from 'cesium'
import { VENUE_DEFAULT_RANGE_M, VENUE_PITCH_DEG, VENUE_MIN_RANGE_M, VENUE_MAX_RANGE_M } from '../../config/camera'
import { applyVenueController } from './cameraConstraints'
import { restoreOverviewController } from './cameraConstraints'
import type { Stop } from '../data/types'

export interface VenueFrameRef {
  current: { center: Cartesian3; transform: Matrix4 } | null
}

/**
 * Enter venue orbit mode: camera uses lookAtTransform(ENU at venue) with fixed offset.
 * Apply constraints before positioning so the camera is immediately at 1000m.
 * If frameRef is provided, sets frameRef.current = { center, transform } for the venue enforcer.
 */
export function enterVenueOrbit(
  viewer: Viewer,
  stop: Stop,
  frameRef?: VenueFrameRef
): void {
  const center = Cartesian3.fromDegrees(stop.lng!, stop.lat!, 0)
  const transform = Transforms.eastNorthUpToFixedFrame(center)
  if (frameRef) frameRef.current = { center, transform }

  const offset = new HeadingPitchRange(
    0,
    CesiumMath.toRadians(VENUE_PITCH_DEG),
    VENUE_DEFAULT_RANGE_M
  )

  applyVenueController(viewer)
  viewer.camera.lookAtTransform(transform, offset)
  viewer.scene.requestRender()
}

/**
 * Update venue orbit range (e.g. after user zoom). Clamps to [500, 1000] m.
 */
export function updateVenueOrbitRange(viewer: Viewer, rangeMeters: number): void {
  const r = Math.min(VENUE_MAX_RANGE_M, Math.max(VENUE_MIN_RANGE_M, rangeMeters))
  const h = viewer.camera.heading
  const p = viewer.camera.pitch
  viewer.camera.lookAtTransform(
    viewer.camera.transform,
    new HeadingPitchRange(h, p, r)
  )
  viewer.scene.requestRender()
}

/**
 * Exit venue orbit: reset camera to world frame and restore overview controller.
 */
export function exitVenueOrbit(viewer: Viewer): void {
  viewer.camera.lookAtTransform(Matrix4.IDENTITY)
  restoreOverviewController(viewer)
  viewer.scene.requestRender()
}
