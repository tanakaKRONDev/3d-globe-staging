import {
  Viewer,
  Cartesian3,
  Color,
  ClassificationType,
  HeightReference,
} from 'cesium'

/** Radius of each polar cap in meters. Covers ~85–90° lat to hide VIIRS artifacts. */
const POLE_RADIUS_M = 450000

/** Dark polar-ocean tone to blend with globe. */
const NORTH_COLOR = '#0b2f57'
const SOUTH_COLOR = '#0b2f57'

/**
 * Adds polar-cap overlay entities to hide circular artifacts at north/south poles.
 * Visual-only; does not affect buildings, markers, routes, or interactions.
 */
export function installPoleMasks(viewer: Viewer): void {
  const northEntity = viewer.entities.add({
    id: 'pole-mask-north',
    position: Cartesian3.fromDegrees(0, 90),
    ellipse: {
      semiMajorAxis: POLE_RADIUS_M,
      semiMinorAxis: POLE_RADIUS_M,
      height: 0,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      material: Color.fromCssColorString(NORTH_COLOR).withAlpha(1.0),
      outline: false,
    },
    classificationType: ClassificationType.TERRAIN,
  })

  viewer.entities.add({
    id: 'pole-mask-south',
    position: Cartesian3.fromDegrees(0, -90),
    ellipse: {
      semiMajorAxis: POLE_RADIUS_M,
      semiMinorAxis: POLE_RADIUS_M,
      height: 0,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      material: Color.fromCssColorString(SOUTH_COLOR).withAlpha(1.0),
      outline: false,
    },
    classificationType: ClassificationType.TERRAIN,
  })
}
