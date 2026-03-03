import {
  Viewer,
  Cartesian3,
  BoundingSphere,
  Math as CesiumMath
} from 'cesium'
import type { Stop } from '../data/types'

/**
 * Premium camera motion utilities for cinematic flyTo animations
 */

/**
 * Custom easing function for smooth, cinematic camera motion
 */
export const cinematicEasing = (time: number) => {
  // Cubic ease-in-out for smooth, premium feel
  if (time < 0.5) {
    return 4 * time * time * time
  }
  return 1 - Math.pow(-2 * time + 2, 3) / 2
}

/**
 * Calculates optimal camera parameters for viewing a stop
 */
export function calculateStopCameraPosition(stop: Stop): {
  destination: Cartesian3
  orientation: {
    heading: number
    pitch: number
    roll: number
  }
} {
  const { lat, lng } = stop
  
  // Convert to radians
  const latitude = CesiumMath.toRadians(lat ?? 0)
  const longitude = CesiumMath.toRadians(lng ?? 0)
  
  // Calculate destination position at optimal viewing distance
  const altitude = 2500000 // 2500km for dramatic city-level view
  const destination = Cartesian3.fromRadians(longitude, latitude, altitude)
  
  // Premium camera angles for cinematic effect
  const orientation = {
    heading: 0, // North-facing for consistency
    pitch: CesiumMath.toRadians(-45), // 45-degree tilt for dramatic angle
    roll: 0
  }
  
  return { destination, orientation }
}

/**
 * Calculates a bounding sphere that encompasses all stops
 */
export function calculateBoundingSphere(stops: Stop[]): BoundingSphere {
  if (stops.length === 0) {
    // Default to North America center
    return new BoundingSphere(Cartesian3.fromDegrees(-95, 45, 0), 5000000)
  }
  
  if (stops.length === 1) {
    const stop = stops[0]
    return new BoundingSphere(
      Cartesian3.fromDegrees(stop.lng ?? 0, stop.lat ?? 0, 0), 
      2000000 // 2000km radius for single stop
    )
  }
  
  // Convert all stop positions to Cartesian3
  const positions = stops
    .filter(stop => stop.lat != null && stop.lng != null)
    .map(stop => Cartesian3.fromDegrees(stop.lng!, stop.lat!, 0))
  
  if (positions.length === 0) {
    // Fallback if no valid positions
    return new BoundingSphere(Cartesian3.fromDegrees(-95, 45, 0), 5000000)
  }
  
  // Create bounding sphere from positions
  const boundingSphere = BoundingSphere.fromPoints(positions)
  
  // Expand the radius slightly for better framing (add 20% padding)
  boundingSphere.radius = boundingSphere.radius * 1.2
  
  // Ensure minimum radius for dramatic effect
  boundingSphere.radius = Math.max(boundingSphere.radius, 1500000) // At least 1500km
  
  return boundingSphere
}

/**
 * Calculates overview camera position to show all stops
 */
export function calculateOverviewPosition(stops: Stop[]): {
  destination: Cartesian3
  orientation: {
    heading: number
    pitch: number
    roll: number
  }
} {
  if (stops.length === 0) {
    // Default to North America view
    return {
      destination: Cartesian3.fromDegrees(-95, 45, 8000000),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-30),
        roll: 0
      }
    }
  }
  
  if (stops.length === 1) {
    // Single stop - use stop camera but higher altitude
    const stopCamera = calculateStopCameraPosition(stops[0])
    return {
      destination: Cartesian3.fromRadians(
        stopCamera.destination.x,
        stopCamera.destination.y,
        5000000 // Higher for overview
      ),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-25),
        roll: 0
      }
    }
  }
  
  // Multiple stops - calculate bounding box
  const lats = stops.map(s => s.lat ?? 0).filter(lat => lat !== 0)
  const lngs = stops.map(s => s.lng ?? 0).filter(lng => lng !== 0)
  
  if (lats.length === 0 || lngs.length === 0) {
    // Fallback to North America
    return {
      destination: Cartesian3.fromDegrees(-95, 45, 8000000),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-30),
        roll: 0
      }
    }
  }
  
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  
  // Calculate center point
  const centerLat = (minLat + maxLat) / 2
  const centerLng = (minLng + maxLng) / 2
  
  // Calculate distance between points to determine altitude
  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng
  const maxSpan = Math.max(latSpan, lngSpan)
  
  // Altitude based on span (with minimum for dramatic effect)
  const altitude = Math.max(4000000, maxSpan * 200000) // Scale factor for good framing
  
  return {
    destination: Cartesian3.fromDegrees(centerLng, centerLat, altitude),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-25), // Slight tilt for overview
      roll: 0
    }
  }
}

/**
 * Premium camera manager for smooth, cinematic transitions
 */
export class PremiumCameraManager {
  private viewer: Viewer
  private isFlying = false

  constructor(viewer: Viewer) {
    this.viewer = viewer
  }

  /**
   * Flies to a specific stop with premium cinematic motion
   */
  flyToStop(stop: Stop, duration = 2.0): Promise<void> {
    if (this.isFlying) {
      console.log('[Camera] Already flying, canceling current flight')
      this.viewer.camera.cancelFlight()
    }

    this.isFlying = true
    console.log(`[Camera] Flying to ${stop.city} - ${stop.venue}`)

    const { destination, orientation } = calculateStopCameraPosition(stop)

    return new Promise((resolve) => {
      this.viewer.camera.flyTo({
        destination,
        orientation,
        duration,
        easingFunction: cinematicEasing,
        complete: () => {
          this.isFlying = false
          console.log(`[Camera] Arrived at ${stop.city}`)
          resolve()
        },
        cancel: () => {
          this.isFlying = false
          console.log('[Camera] Flight cancelled')
          resolve()
        }
      })
    })
  }

  /**
   * Flies to overview position showing all stops
   */
  flyToOverview(stops: Stop[], duration = 2.5): Promise<void> {
    if (this.isFlying) {
      console.log('[Camera] Already flying, canceling current flight')
      this.viewer.camera.cancelFlight()
    }

    this.isFlying = true
    console.log('[Camera] Flying to overview position')

    const { destination, orientation } = calculateOverviewPosition(stops)

    return new Promise((resolve) => {
      this.viewer.camera.flyTo({
        destination,
        orientation,
        duration,
        easingFunction: cinematicEasing,
        complete: () => {
          this.isFlying = false
          console.log('[Camera] Arrived at overview')
          resolve()
        },
        cancel: () => {
          this.isFlying = false
          console.log('[Camera] Overview flight cancelled')
          resolve()
        }
      })
    })
  }

  /**
   * Google Earth-style overview using bounding sphere (premium method)
   */
  flyToBoundingSphereOverview(stops: Stop[], duration = 2.8): Promise<void> {
    if (this.isFlying) {
      console.log('[Camera] Already flying, canceling current flight')
      this.viewer.camera.cancelFlight()
    }

    this.isFlying = true
    console.log('[Camera] Flying to bounding sphere overview (Google Earth style)')

    const boundingSphere = calculateBoundingSphere(stops)

    return new Promise((resolve) => {
      this.viewer.camera.flyToBoundingSphere(boundingSphere, {
        duration,
        complete: () => {
          // After reaching bounding sphere, apply a subtle tilt for premium feel
          console.log('[Camera] Applying reset tilt')
          this.viewer.camera.flyTo({
            destination: this.viewer.camera.position,
            orientation: {
              heading: this.viewer.camera.heading,
              pitch: CesiumMath.toRadians(-25), // Moderate tilt like Google Earth
              roll: 0
            },
            duration: 0.8, // Quick tilt adjustment
            easingFunction: cinematicEasing,
            complete: () => {
              this.isFlying = false
              console.log('[Camera] Overview complete with tilt applied')
              resolve()
            },
            cancel: () => {
              this.isFlying = false
              resolve()
            }
          })
        },
        cancel: () => {
          this.isFlying = false
          console.log('[Camera] Bounding sphere overview cancelled')
          resolve()
        }
      })
    })
  }

  /**
   * Sets initial camera position without animation
   */
  setInitialPosition(stops: Stop[]): void {
    console.log('[Camera] Setting initial position')
    const { destination, orientation } = calculateOverviewPosition(stops)
    
    this.viewer.camera.setView({
      destination,
      orientation
    })
  }

  /**
   * Smoothly transitions between two stops (for future route visualization)
   */
  flyBetweenStops(fromStop: Stop, toStop: Stop, duration = 3.0): Promise<void> {
    if (this.isFlying) {
      this.viewer.camera.cancelFlight()
    }

    this.isFlying = true
    console.log(`[Camera] Flying from ${fromStop.city} to ${toStop.city}`)

    // Calculate midpoint for dramatic arc
    const fromLat = fromStop.lat ?? 0
    const fromLng = fromStop.lng ?? 0
    const toLat = toStop.lat ?? 0
    const toLng = toStop.lng ?? 0

    const midLat = (fromLat + toLat) / 2
    const midLng = (fromLng + toLng) / 2
    
    // Higher altitude for the arc
    const arcAltitude = 6000000 // 6000km for dramatic arc
    const midDestination = Cartesian3.fromDegrees(midLng, midLat, arcAltitude)
    
    const { destination: finalDestination, orientation: finalOrientation } = calculateStopCameraPosition(toStop)

    return new Promise((resolve) => {
      // First, fly to high arc position
      this.viewer.camera.flyTo({
        destination: midDestination,
        orientation: {
          heading: 0,
          pitch: CesiumMath.toRadians(-20),
          roll: 0
        },
        duration: duration * 0.6,
        easingFunction: cinematicEasing,
        complete: () => {
          // Then descend to final position
          this.viewer.camera.flyTo({
            destination: finalDestination,
            orientation: finalOrientation,
            duration: duration * 0.4,
            easingFunction: cinematicEasing,
            complete: () => {
              this.isFlying = false
              console.log(`[Camera] Arrived at ${toStop.city}`)
              resolve()
            },
            cancel: () => {
              this.isFlying = false
              resolve()
            }
          })
        },
        cancel: () => {
          this.isFlying = false
          resolve()
        }
      })
    })
  }

  /**
   * Checks if camera is currently in motion
   */
  get isInMotion(): boolean {
    return this.isFlying
  }

  /**
   * Cancels any current camera motion
   */
  cancelFlight(): void {
    if (this.isFlying) {
      this.viewer.camera.cancelFlight()
      this.isFlying = false
    }
  }
}