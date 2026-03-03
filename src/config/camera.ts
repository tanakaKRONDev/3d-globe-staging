/** Default range when flying into venue (meters). */
export const VENUE_DEFAULT_RANGE_M = 1000
/** Minimum zoom in venue mode (meters). */
export const VENUE_MIN_RANGE_M = 500
/** Maximum zoom in venue mode (meters). */
export const VENUE_MAX_RANGE_M = 1000
/** Camera altitude above ellipsoid must never be below this (meters). */
export const VENUE_MIN_SURFACE_M = 10
/** Legacy alias. */
export const MIN_SURFACE_DISTANCE_M = 10

/** Default pitch when viewing venue (degrees, looking down). */
export const VENUE_PITCH_DEG = -38
/** Default heading when viewing venue (degrees). */
export const VENUE_HEADING_DEG = 0

/** Prevent under-earth: venue pitch always looking down. Most downward (degrees). */
export const VENUE_MIN_PITCH_DEG = -85
/** Least downward (never 0 or positive). */
export const VENUE_MAX_PITCH_DEG = -10
