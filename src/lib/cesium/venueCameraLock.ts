import type { Viewer } from 'cesium'
import { exitVenueOrbit } from './venueOrbit'

/**
 * Removes venue orbit: resets camera to world frame, restores overview controller.
 * Call when switching viewMode to overview or before entering venue.
 */
export function removeVenueCameraLock(viewer: Viewer): void {
  exitVenueOrbit(viewer)
}
