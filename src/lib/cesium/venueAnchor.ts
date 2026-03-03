import type { Viewer, Entity } from 'cesium'
import { Cartesian3, ConstantPositionProperty } from 'cesium'

const ANCHOR_ID = 'venue-anchor'

let venueAnchorEntity: Entity | null = null

/**
 * Get or create the single venue anchor entity (optional; venue mode uses lookAtTransform, not trackedEntity).
 * Not visible (no billboard). Caller should set position to current stop; optional stopId in properties for debugging.
 */
export function getOrCreateVenueAnchor(viewer: Viewer, stopId?: string): Entity {
  if (!venueAnchorEntity) {
    venueAnchorEntity = viewer.entities.add({
      id: ANCHOR_ID,
      show: false,
    })
  }
  // Optional: store stopId for debugging (PropertyBag if available)
  if (stopId != null && venueAnchorEntity.properties) {
    try {
      ;(venueAnchorEntity.properties as Record<string, unknown>).stopId = stopId
    } catch {
      /* ignore */
    }
  }
  return venueAnchorEntity
}

/**
 * Set anchor position to lon/lat (height 0).
 */
export function setVenueAnchorPosition(anchor: Entity, lng: number, lat: number): void {
  anchor.position = new ConstantPositionProperty(Cartesian3.fromDegrees(lng, lat, 0))
}
