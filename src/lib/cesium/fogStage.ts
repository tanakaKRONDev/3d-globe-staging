import type { Viewer } from 'cesium'
import { applyVenueFog } from './venueFog'

/**
 * Enable venue fog (scene fog, distance ~2000m).
 */
export function enableVenueFog(viewer: Viewer): void {
  applyVenueFog(viewer, 'venue')
}

/**
 * Disable venue fog (overview mode).
 */
export function disableVenueFog(viewer: Viewer): void {
  applyVenueFog(viewer, 'overview')
}
