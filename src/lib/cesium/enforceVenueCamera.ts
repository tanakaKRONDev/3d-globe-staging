import type { Viewer } from 'cesium'
import { Cartesian3, HeadingPitchRange, Math as CesiumMath } from 'cesium'
import {
  VENUE_MIN_RANGE_M,
  VENUE_MAX_RANGE_M,
  VENUE_MIN_PITCH_DEG,
  VENUE_MAX_PITCH_DEG,
} from '../../config/camera'

export interface VenueFrame {
  center: Cartesian3
  transform: import('cesium').Matrix4
}

export type GetMode = () => 'overview' | 'venue'
export type GetVenueFrameRef = () => { current: VenueFrame | null }

/**
 * Attach a preRender handler (venue mode only) that clamps pitch and range.
 * - Pitch clamp: always looking down (VENUE_MIN_PITCH_DEG to VENUE_MAX_PITCH_DEG) so camera stays above surface.
 * - Range clamp: 500–1000 m. With pitch always downward, min height above surface is satisfied without any height-based correction (no jump).
 */
export function attachVenueEnforcer(
  viewer: Viewer,
  getMode: GetMode,
  getVenueFrameRef: GetVenueFrameRef
): () => void {
  const scene = viewer.scene
  const epsilon = 1e-4
  const minPitchRad = CesiumMath.toRadians(VENUE_MIN_PITCH_DEG)
  const maxPitchRad = CesiumMath.toRadians(VENUE_MAX_PITCH_DEG)

  const handler = () => {
    if (getMode() !== 'venue') return

    const frame = getVenueFrameRef().current
    if (!frame?.transform) return

    const camera = viewer.camera
    let h = camera.heading
    let p = camera.pitch

    const center = frame.center
    const dist = Cartesian3.distance(camera.positionWC, center)

    if (p < minPitchRad) p = minPitchRad
    if (p > maxPitchRad) p = maxPitchRad

    let rClamped = dist
    if (rClamped < VENUE_MIN_RANGE_M) rClamped = VENUE_MIN_RANGE_M
    if (rClamped > VENUE_MAX_RANGE_M) rClamped = VENUE_MAX_RANGE_M

    const dp = Math.abs(camera.pitch - p)
    const pitchClamped = dp > epsilon
    const rangeClamped = Math.abs(rClamped - dist) > 0.5

    if (!pitchClamped && !rangeClamped) return

    camera.lookAtTransform(
      frame.transform,
      new HeadingPitchRange(h, p, rClamped)
    )
    scene.requestRender()
  }

  scene.preRender.addEventListener(handler)
  return () => scene.preRender.removeEventListener(handler)
}
