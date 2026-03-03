import type { Viewer } from 'cesium'
import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
} from 'cesium'

/**
 * Returns the Earth's maximum radius (semi-major axis) from the globe ellipsoid.
 */
export function getEarthRadius(viewer: Viewer): number {
  return viewer.scene.globe.ellipsoid.maximumRadius
}

export interface CameraPose {
  destination: Cartesian3
  direction: Cartesian3
  up: Cartesian3
}

/**
 * Computes a camera pose that looks at Earth center from a point above the given lat/lng.
 * The camera is placed along the surface normal at distanceFromCenterMeters from center.
 */
export function computeEarthCenteredPoseAboveLatLng(
  lonDeg: number,
  latDeg: number,
  distanceFromCenterMeters: number,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): CameraPose {
  const carto = Cartographic.fromDegrees(lonDeg, latDeg, 0)
  const surface = ellipsoid.cartographicToCartesian(carto)
  const n = Cartesian3.normalize(surface, new Cartesian3())
  const destination = Cartesian3.multiplyByScalar(n, distanceFromCenterMeters, new Cartesian3())
  const direction = Cartesian3.normalize(Cartesian3.negate(destination, new Cartesian3()), new Cartesian3())

  const east = Cartesian3.cross(Cartesian3.UNIT_Z, n, new Cartesian3())
  const eastMag = Cartesian3.magnitude(east)
  let north: Cartesian3
  if (eastMag < 1e-10) {
    north = Cartesian3.clone(Cartesian3.UNIT_X, new Cartesian3())
  } else {
    Cartesian3.normalize(east, east)
    north = Cartesian3.normalize(Cartesian3.cross(n, east, new Cartesian3()), new Cartesian3())
  }
  const up = north

  return { destination, direction, up }
}

/**
 * Applies a camera pose to the viewer.
 */
export function applyPose(viewer: Viewer, pose: CameraPose): void {
  viewer.camera.setView({
    destination: pose.destination,
    orientation: {
      direction: pose.direction,
      up: pose.up,
    },
  })
}
