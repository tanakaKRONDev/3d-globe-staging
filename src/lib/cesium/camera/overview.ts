import type { Viewer } from 'cesium'
import {
  getEarthRadius,
  computeEarthCenteredPoseAboveLatLng,
  applyPose,
} from './poses'

/** Distance from Earth center as multiple of radius. Same for initial load and fly-out. */
export const OVERVIEW_DISTANCE_MULTIPLIER = 5.0

export interface AnchorLonLat {
  lon: number
  lat: number
}

/** Initial view: above equator (side view, not northern or southern pole). */
const DEFAULT_ANCHOR: AnchorLonLat = { lon: 0, lat: 0 }

/**
 * Sets the overview camera so the entire Earth disk is centered in the viewport.
 * Camera looks at Earth center from a point above the anchor lat/lng.
 */
export function setOverviewCameraCentered(
  viewer: Viewer,
  anchorLonLat?: AnchorLonLat
): void {
  const radius = getEarthRadius(viewer)
  const distanceFromCenter = radius * OVERVIEW_DISTANCE_MULTIPLIER
  const anchor = anchorLonLat ?? DEFAULT_ANCHOR
  const ellipsoid = viewer.scene.globe.ellipsoid
  const pose = computeEarthCenteredPoseAboveLatLng(
    anchor.lon,
    anchor.lat,
    distanceFromCenter,
    ellipsoid
  )
  applyPose(viewer, pose)
}
