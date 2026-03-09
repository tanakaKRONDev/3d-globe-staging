import type { Viewer, Entity } from 'cesium'
import { Cartesian3, Color, ClassificationType } from 'cesium'

const POLAR_RADIUS_M = 1_400_000

export type PolarCoversHandles = {
  north: Entity
  south: Entity
}

/**
 * Adds two ellipse overlays at the poles to hide imagery artifacts.
 * Show only in overview mode; hide in venue so they never interfere with buildings.
 * Buildings and venue rendering are independent and intentionally unaffected.
 */
export function installPolarCovers(viewer: Viewer): PolarCoversHandles {
  const north = viewer.entities.add({
    id: 'polar-cover-north',
    position: Cartesian3.fromDegrees(0, 90),
    ellipse: {
      semiMajorAxis: POLAR_RADIUS_M,
      semiMinorAxis: POLAR_RADIUS_M,
      material: new Color(0.1, 0.2, 0.45, 0.88),
      height: 0,
      outline: false,
      classificationType: ClassificationType.TERRAIN,
    },
    show: true,
    isPickable: false,
  })

  const south = viewer.entities.add({
    id: 'polar-cover-south',
    position: Cartesian3.fromDegrees(0, -90),
    ellipse: {
      semiMajorAxis: POLAR_RADIUS_M,
      semiMinorAxis: POLAR_RADIUS_M,
      material: new Color(0.75, 0.78, 0.82, 0.75),
      height: 0,
      outline: false,
      classificationType: ClassificationType.TERRAIN,
    },
    show: true,
    isPickable: false,
  })

  return { north, south }
}
