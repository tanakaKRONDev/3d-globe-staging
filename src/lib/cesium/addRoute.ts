import {
  Viewer,
  Entity,
  Cartesian3,
  Cartographic,
  EllipsoidGeodesic,
  Ellipsoid,
  Color,
  PolylineGlowMaterialProperty,
  ColorMaterialProperty,
  ArcType,
  ConstantProperty
} from 'cesium'
import type { Stop } from '../data/types'
import { SHOW_ROUTE_ARCS } from '../../config/features'

/**
 * Build arc positions between two exact endpoints.
 * Uses the EXACT start/end Cartesian3 (no recomputation) for perfect marker alignment.
 */
function buildArcPositions(start: Cartesian3, end: Cartesian3): Cartesian3[] {
  const startCarto = Cartographic.fromCartesian(start, Ellipsoid.WGS84)
  const endCarto = Cartographic.fromCartesian(end, Ellipsoid.WGS84)
  const geodesic = new EllipsoidGeodesic(startCarto, endCarto, Ellipsoid.WGS84)

  const surfaceDistance = geodesic.surfaceDistance
  const segments = Math.max(32, Math.min(128, Math.floor(surfaceDistance / 50000)))
  const peak = Math.max(20000, Math.min(220000, surfaceDistance * 0.1))

  const out: Cartesian3[] = []
  out.push(start)
  for (let i = 1; i < segments; i++) {
    const f = i / segments
    const c = geodesic.interpolateUsingFraction(f)
    const h = peak * Math.sin(Math.PI * f)
    c.height = h
    out.push(Cartesian3.fromRadians(c.longitude, c.latitude, c.height))
  }
  out.push(end)
  return out
}

/**
 * Premium route visualization utilities for connecting tour stops
 */

/**
 * Creates elegant route polylines connecting tour stops in order
 */
export class RouteManager {
  private viewer: Viewer
  private routeEntities: Entity[] = []
  private lastRouteStopIds = ''

  constructor(viewer: Viewer) {
    this.viewer = viewer
  }

  /**
   * Builds the route polyline from stops sorted by stop.order (all points with coords).
   * Only rebuilds when stop order/ids change (avoids re-adding on every render).
   */
  addTourRoute(stops: Stop[]): void {
    if (stops.length < 2) {
      if (this.routeEntities.length > 0) {
        this.clearRoutes()
        this.lastRouteStopIds = ''
      }
      return
    }
    const sortedStops = [...stops]
      .filter((s) => s.lat != null && s.lng != null)
      .sort((a, b) => a.order - b.order)
    const sortedIds = sortedStops.map((s) => s.id).join(',')
    if (sortedIds === this.lastRouteStopIds) return
    this.lastRouteStopIds = sortedIds

    this.clearRoutes()
    const markerPositions = new Map<string, Cartesian3>()
    for (const stop of sortedStops) {
      markerPositions.set(stop.id, Cartesian3.fromDegrees(stop.lng!, stop.lat!, 0))
    }

    console.log(`[Route] Creating route for ${sortedStops.length} stops`)

    for (let i = 0; i < sortedStops.length - 1; i++) {
      const fromStop = sortedStops[i]
      const toStop = sortedStops[i + 1]
      const start = markerPositions.get(fromStop.id)
      const end = markerPositions.get(toStop.id)

      if (start && end) {
        const routeSegment = this.createRouteSegment(start, end, fromStop.id, toStop.id, i)
        this.viewer.entities.add(routeSegment)
        this.routeEntities.push(routeSegment)
      }
    }

    console.log(`[Route] Added ${this.routeEntities.length} route segments`)
  }

  /**
   * Creates a single route segment between two exact positions (same Cartesian3 as markers)
   */
  private createRouteSegment(start: Cartesian3, end: Cartesian3, fromStopId: string, toStopId: string, segmentIndex: number): Entity {
    const positions = buildArcPositions(start, end)

    // Create visible polyline with deeper golden glow
    const routeEntity = new Entity({
      id: `route-segment-${segmentIndex}`,
      polyline: {
        positions: positions,
        width: 6, // Thicker for better visibility
        arcType: ArcType.NONE, // Use our custom arc points
        clampToGround: false,
        material: new PolylineGlowMaterialProperty({
          glowPower: new ConstantProperty(0.3), // More visible glow
          taperPower: new ConstantProperty(1.0), // No taper for consistent visibility
          color: new ConstantProperty(Color.fromCssColorString('#D4AF37').withAlpha(0.95)) // Deeper golden color
        }),
        show: SHOW_ROUTE_ARCS,
        zIndex: 1000,
        distanceDisplayCondition: undefined,
        // Far-side occlusion: segment behind globe draws fully transparent
        depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
      },
      // Store route metadata
      properties: {
        isRouteSegment: true,
        fromStopId,
        toStopId,
        segmentIndex
      }
    })

    return routeEntity
  }

  /**
   * Toggle route visibility. AND with SHOW_ROUTE_ARCS so arcs can be hidden via feature flag.
   */
  setRouteVisible(visible: boolean): void {
    const show = SHOW_ROUTE_ARCS && visible
    this.routeEntities.forEach((entity) => {
      entity.show = new ConstantProperty(show)
      if (entity.polyline) {
        entity.polyline.show = new ConstantProperty(show)
      }
    })
  }

  /**
   * Routes are always visible - no dynamic visibility updates needed
   */
  updateRouteVisibility(): void {
    // No-op - routes are always visible to prevent any blinking
    // All visibility is handled at creation time
  }

  /**
   * Highlights a specific route segment (for future interactivity)
   */
  highlightSegment(segmentIndex: number, highlight: boolean = true): void {
    const entity = this.routeEntities[segmentIndex]
    if (entity && entity.polyline) {
      const material = entity.polyline.material as PolylineGlowMaterialProperty
      if (material) {
        if (highlight) {
          material.glowPower = new ConstantProperty(0.25) // Stronger glow when highlighted
          material.color = new ConstantProperty(Color.fromCssColorString('#E7D1A7').withAlpha(1.0)) // Full opacity
        } else {
          material.glowPower = new ConstantProperty(0.15) // Normal glow
          material.color = new ConstantProperty(Color.fromCssColorString('#E7D1A7').withAlpha(0.8)) // Normal transparency
        }
      }
    }
  }

  /**
   * Gets all route entities
   */
  getRouteEntities(): Entity[] {
    return [...this.routeEntities]
  }

  /**
   * Removes all route entities
   */
  clearRoutes(): void {
    this.routeEntities.forEach(entity => {
      this.viewer.entities.remove(entity)
    })
    this.routeEntities = []
    console.log('[Route] Cleared all route segments')
  }

  /**
   * Creates a complete tour route with all segments
   */
  static createTourRoute(viewer: Viewer, stops: Stop[]): RouteManager {
    const routeManager = new RouteManager(viewer)
    routeManager.addTourRoute(stops)
    return routeManager
  }

  /**
   * Animates route appearance (for future enhancement)
   */
  animateRouteAppearance(duration: number = 2000): void {
    // Future implementation: animate route segments appearing one by one
    // This could be used when the tour route is first displayed
    console.log(`[Route] Route animation would take ${duration}ms`)
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearRoutes()
  }
}

/**
 * Utility function to create a simple elevated route between stops
 */
export function addSimpleRoute(viewer: Viewer, stops: Stop[]): Entity[] {
  if (stops.length < 2) return []

  const sortedStops = [...stops].sort((a, b) => a.order - b.order)
  const routeEntities: Entity[] = []

  for (let i = 0; i < sortedStops.length - 1; i++) {
    const fromStop = sortedStops[i]
    const toStop = sortedStops[i + 1]
    
    if (fromStop.lat != null && fromStop.lng != null && 
        toStop.lat != null && toStop.lng != null) {
      
      // Create elevated positions
      const positions = [
        Cartesian3.fromDegrees(fromStop.lng, fromStop.lat, 100000), // 100km elevation
        Cartesian3.fromDegrees(toStop.lng, toStop.lat, 100000)
      ]

      const routeEntity = viewer.entities.add({
        id: `simple-route-${i}`,
        polyline: {
          positions: positions,
          width: 4,
          arcType: ArcType.GEODESIC,
          clampToGround: false,
          show: true, // Use primitive boolean for stability
          material: new PolylineGlowMaterialProperty({
            glowPower: new ConstantProperty(0.25),
            color: new ConstantProperty(Color.fromCssColorString('#D4AF37').withAlpha(0.9))
          }),
          zIndex: 1000,
          depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
        }
      })

      routeEntities.push(routeEntity)
    }
  }

  return routeEntities
}

/**
 * Creates a premium route with enhanced visual effects
 */
export function addPremiumRoute(viewer: Viewer, stops: Stop[]): RouteManager {
  return RouteManager.createTourRoute(viewer, stops)
}