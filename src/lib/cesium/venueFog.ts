import type { Viewer } from 'cesium'

/** Venue fog: cinematic atmospheric haze, distance falloff at ~2000m. Uses scene lighting. */
const VENUE_FOG_DENSITY = 0.0005 // Fog noticeable at ~2000m (exponential: 1 - exp(-density * dist))
const VENUE_FOG_MINIMUM_BRIGHTNESS = 0.045
const VENUE_FOG_VISUAL_DENSITY_SCALAR = 0.6 // Stronger visual effect
const VENUE_FOG_MAX_HEIGHT = 10000 // Fog applies when camera below 10km (venue range)

/**
 * Toggles fog based on view mode. Venue = enabled (atmospheric depth); overview = disabled.
 */
export function applyVenueFog(viewer: Viewer, viewMode: 'overview' | 'venue'): void {
  const fog = viewer.scene.fog

  if (viewMode === 'venue') {
    fog.enabled = true
    fog.density = VENUE_FOG_DENSITY
    fog.minimumBrightness = VENUE_FOG_MINIMUM_BRIGHTNESS
    fog.visualDensityScalar = VENUE_FOG_VISUAL_DENSITY_SCALAR
    fog.maxHeight = VENUE_FOG_MAX_HEIGHT
  } else {
    fog.enabled = false
  }
}
