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
  ConstantProperty,
  CallbackProperty,
  JulianDate
} from 'cesium'
import type { Stop } from '../data/types'

/**
 * Build arc positions between two exact endpoints.
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

/** Duration in seconds for one full tracer traversal of an arc */
const TRACER_LOOP_SEC = 6
/** Fraction of the arc that the bright tracer covers */
const TRACER_LENGTH = 0.12

/**
 * Route visualization with animated tracers.
 */
export class RouteManager {
  private viewer: Viewer
  private routeEntities: Entity[] = []
  private tracerEntities: Entity[] = []
  private arcPositionsCache: Cartesian3[][] = []
  private lastRouteStopIds = ''
  private tracerStartTime = 0

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.tracerStartTime = Date.now() / 1000
  }

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

    for (let i = 0; i < sortedStops.length - 1; i++) {
      const fromStop = sortedStops[i]
      const toStop = sortedStops[i + 1]
      const start = markerPositions.get(fromStop.id)
      const end = markerPositions.get(toStop.id)

      if (start && end) {
        const positions = buildArcPositions(start, end)
        this.arcPositionsCache.push(positions)

        // Base arc: cool white/blue with soft glow
        const baseEntity = new Entity({
          id: `route-${i}`,
          polyline: {
            positions,
            width: 2.5,
            arcType: ArcType.NONE,
            clampToGround: false,
            material: new PolylineGlowMaterialProperty({
              glowPower: new ConstantProperty(0.2),
              taperPower: new ConstantProperty(1.0),
              color: new ConstantProperty(Color.fromCssColorString('#B8CCE8').withAlpha(0.45))
            }),
            show: true,
            zIndex: 1000,
            depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
          },
        })
        this.viewer.entities.add(baseEntity)
        this.routeEntities.push(baseEntity)

        // Tracer: bright short subsection that slides along the arc
        const segIdx = i
        const tracerEntity = new Entity({
          id: `tracer-${i}`,
          polyline: {
            positions: new CallbackProperty((_time: JulianDate, result?: Cartesian3[]) => {
              return this.getTracerPositions(segIdx, result)
            }, false) as unknown as Cartesian3[],
            width: 3.5,
            arcType: ArcType.NONE,
            clampToGround: false,
            material: new PolylineGlowMaterialProperty({
              glowPower: new ConstantProperty(0.4),
              taperPower: new ConstantProperty(1.0),
              color: new ConstantProperty(Color.fromCssColorString('#E8F0FF').withAlpha(0.9))
            }),
            show: true,
            zIndex: 1001,
            depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
          },
        })
        this.viewer.entities.add(tracerEntity)
        this.tracerEntities.push(tracerEntity)
      }
    }
  }

  /**
   * Compute the tracer subsection positions for a given segment at the current time.
   * Each segment gets a staggered phase offset so tracers don't all move in sync.
   */
  private getTracerPositions(segmentIndex: number, result?: Cartesian3[]): Cartesian3[] {
    const positions = this.arcPositionsCache[segmentIndex]
    if (!positions || positions.length < 2) return result ?? []

    const elapsed = Date.now() / 1000 - this.tracerStartTime
    // Stagger each segment by a fraction of the loop so they cascade
    const phase = (segmentIndex * 0.37) % 1
    const t = ((elapsed / TRACER_LOOP_SEC + phase) % 1)

    const count = positions.length
    const startFrac = t
    const endFrac = t + TRACER_LENGTH

    const startIdx = Math.floor(startFrac * (count - 1))
    const endIdx = Math.min(Math.ceil(endFrac * (count - 1)), count - 1)

    // Wrap around: if tracer extends past end, just clamp to tail
    const from = Math.max(0, Math.min(startIdx, count - 1))
    const to = Math.max(from, Math.min(endIdx, count - 1))

    if (from >= to) {
      // At the very end — show last 2 points to avoid zero-length polyline
      const out = result ?? []
      out.length = 0
      out.push(positions[count - 2])
      out.push(positions[count - 1])
      return out
    }

    const out = result ?? []
    out.length = 0
    for (let i = from; i <= to; i++) {
      out.push(positions[i])
    }
    return out
  }

  /**
   * Toggle route visibility (overview = visible, venue = hidden).
   */
  setRouteVisible(visible: boolean): void {
    this.routeEntities.forEach((entity) => {
      entity.show = new ConstantProperty(visible)
      if (entity.polyline) entity.polyline.show = new ConstantProperty(visible)
    })
    this.tracerEntities.forEach((entity) => {
      entity.show = new ConstantProperty(visible)
      if (entity.polyline) entity.polyline.show = new ConstantProperty(visible)
    })
  }

  updateRouteVisibility(): void {
    // No-op — visibility controlled by setRouteVisible
  }

  highlightSegment(segmentIndex: number, highlight: boolean = true): void {
    const entity = this.routeEntities[segmentIndex]
    if (entity && entity.polyline) {
      const material = entity.polyline.material as PolylineGlowMaterialProperty
      if (material) {
        if (highlight) {
          material.glowPower = new ConstantProperty(0.3)
          material.color = new ConstantProperty(Color.fromCssColorString('#D0E0F0').withAlpha(0.7))
        } else {
          material.glowPower = new ConstantProperty(0.2)
          material.color = new ConstantProperty(Color.fromCssColorString('#B8CCE8').withAlpha(0.45))
        }
      }
    }
  }

  getRouteEntities(): Entity[] {
    return [...this.routeEntities, ...this.tracerEntities]
  }

  clearRoutes(): void {
    this.routeEntities.forEach(entity => this.viewer.entities.remove(entity))
    this.tracerEntities.forEach(entity => this.viewer.entities.remove(entity))
    this.routeEntities = []
    this.tracerEntities = []
    this.arcPositionsCache = []
  }

  static createTourRoute(viewer: Viewer, stops: Stop[]): RouteManager {
    const routeManager = new RouteManager(viewer)
    routeManager.addTourRoute(stops)
    return routeManager
  }

  destroy(): void {
    this.clearRoutes()
  }
}
