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
    c.height = peak * Math.sin(Math.PI * f)
    out.push(Cartesian3.fromRadians(c.longitude, c.latitude, c.height))
  }
  out.push(end)
  return out
}

/**
 * Build a laterally offset arc path.
 * For each point on the arc, compute a perpendicular offset in the local
 * tangent plane (cross product of surface normal and arc direction).
 * This produces a visually parallel path that is separated on-screen
 * regardless of camera angle, unlike a pure height offset.
 */
function buildLateralOffsetArc(positions: Cartesian3[], offsetMeters: number): Cartesian3[] {
  const out: Cartesian3[] = []
  const len = positions.length
  const scratch = new Cartesian3()

  for (let i = 0; i < len; i++) {
    const pos = positions[i]
    // Surface normal at this point (normalized position on ellipsoid = outward direction)
    const normal = Cartesian3.normalize(pos, new Cartesian3())

    // Arc tangent direction: forward difference, backward at end
    let tangent: Cartesian3
    if (i < len - 1) {
      tangent = Cartesian3.subtract(positions[i + 1], pos, new Cartesian3())
    } else {
      tangent = Cartesian3.subtract(pos, positions[i - 1], new Cartesian3())
    }
    Cartesian3.normalize(tangent, tangent)

    // Lateral = cross(tangent, normal) — perpendicular to both arc direction and radial
    const lateral = Cartesian3.cross(tangent, normal, scratch)
    Cartesian3.normalize(lateral, lateral)

    // Offset point
    const offsetPos = Cartesian3.add(
      pos,
      Cartesian3.multiplyByScalar(lateral, offsetMeters, new Cartesian3()),
      new Cartesian3()
    )
    out.push(offsetPos)
  }
  return out
}

/** Tracer world-space speed: meters of arc per second */
const TRACER_SPEED_MPS = 800_000
/** Number of points the tracer head covers (bright core) */
const TRACER_HEAD_PTS = 6
/** Number of trail layers behind the head (fading tail) */
const TRACER_TRAIL_LAYERS = 3
/** Points per trail layer */
const TRACER_TRAIL_PTS = 5
/** Lateral offset in meters (perpendicular to arc in tangent plane) */
const TRACER_LATERAL_OFFSET = 18_000

interface ArcData {
  basePositions: Cartesian3[]
  tracerPositions: Cartesian3[]
  arcLengthM: number
}

/**
 * Route visualization with animated tracers.
 *
 * Base arcs use ColorMaterialProperty (no shader compilation delay).
 * Tracers use PolylineGlowMaterialProperty for the bright halo effect
 * on a laterally offset path so they float beside, not on top of, the base.
 */
export class RouteManager {
  private viewer: Viewer
  private routeEntities: Entity[] = []
  private tracerEntities: Entity[] = []
  private arcs: ArcData[] = []
  private lastRouteStopIds = ''
  private startTime = 0

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.startTime = Date.now() / 1000
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

    // Pre-compute all arc geometry
    const pendingArcs: Array<{ start: Cartesian3; end: Cartesian3; idx: number }> = []
    for (let i = 0; i < sortedStops.length - 1; i++) {
      const start = markerPositions.get(sortedStops[i].id)
      const end = markerPositions.get(sortedStops[i + 1].id)
      if (start && end) pendingArcs.push({ start, end, idx: i })
    }

    // Build geometry + base arcs (ColorMaterialProperty = instant shader, no compile delay)
    for (const { start, end, idx } of pendingArcs) {
      const basePositions = buildArcPositions(start, end)
      const tracerPositions = buildLateralOffsetArc(basePositions, TRACER_LATERAL_OFFSET)

      let arcLengthM = 0
      for (let j = 1; j < basePositions.length; j++) {
        arcLengthM += Cartesian3.distance(basePositions[j - 1], basePositions[j])
      }

      this.arcs.push({ basePositions, tracerPositions, arcLengthM })

      // Base arc: two layers for glow-like appearance using only ColorMaterialProperty
      // Outer (wide, dim) — simulates soft glow halo
      const outerEntity = new Entity({
        id: `route-outer-${idx}`,
        polyline: {
          positions: basePositions,
          width: 4.0,
          arcType: ArcType.NONE,
          clampToGround: false,
          material: new ColorMaterialProperty(Color.fromCssColorString('#B0C8E0').withAlpha(0.12)),
          show: true,
          zIndex: 999,
          depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
        },
      })
      this.viewer.entities.add(outerEntity)
      this.routeEntities.push(outerEntity)

      // Inner (narrow, brighter) — the visible arc line
      const innerEntity = new Entity({
        id: `route-inner-${idx}`,
        polyline: {
          positions: basePositions,
          width: 1.6,
          arcType: ArcType.NONE,
          clampToGround: false,
          material: new ColorMaterialProperty(Color.fromCssColorString('#C8DDEF').withAlpha(0.5)),
          show: true,
          zIndex: 1000,
          depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
        },
      })
      this.viewer.entities.add(innerEntity)
      this.routeEntities.push(innerEntity)
    }

    // Force first render of base arcs before adding tracers
    this.viewer.scene.requestRender()

    // Add tracers on next frame so base arcs are already drawn
    requestAnimationFrame(() => {
      if (this.arcs.length === 0) return  // cleared before this ran

      const arcCount = this.arcs.length
      for (let a = 0; a < arcCount; a++) {
        const arcIdx = a

        // Bright head
        const headEntity = new Entity({
          id: `tracer-head-${a}`,
          polyline: {
            positions: new CallbackProperty((_t: JulianDate, r?: Cartesian3[]) => {
              return this.sliceTracer(arcIdx, 0, TRACER_HEAD_PTS, r)
            }, false) as unknown as Cartesian3[],
            width: 3.0,
            arcType: ArcType.NONE,
            clampToGround: false,
            material: new PolylineGlowMaterialProperty({
              glowPower: new ConstantProperty(0.35),
              taperPower: new ConstantProperty(1.0),
              color: new ConstantProperty(Color.fromCssColorString('#7EB4F0').withAlpha(0.85))
            }),
            show: true,
            zIndex: 1002,
            depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
          },
        })
        this.viewer.entities.add(headEntity)
        this.tracerEntities.push(headEntity)

        // Fading trail layers
        for (let layer = 0; layer < TRACER_TRAIL_LAYERS; layer++) {
          const layerIdx = layer
          const alpha = 0.50 - layer * 0.15
          const width = 2.4 - layer * 0.4
          const trailEntity = new Entity({
            id: `tracer-trail-${a}-${layer}`,
            polyline: {
              positions: new CallbackProperty((_t: JulianDate, r?: Cartesian3[]) => {
                return this.sliceTracer(arcIdx, TRACER_HEAD_PTS + layerIdx * TRACER_TRAIL_PTS, TRACER_TRAIL_PTS, r)
              }, false) as unknown as Cartesian3[],
              width,
              arcType: ArcType.NONE,
              clampToGround: false,
              material: new PolylineGlowMaterialProperty({
                glowPower: new ConstantProperty(0.22 - layer * 0.05),
                taperPower: new ConstantProperty(1.0),
                color: new ConstantProperty(Color.fromCssColorString('#7EB4F0').withAlpha(alpha))
              }),
              show: true,
              zIndex: 1001,
              depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
            },
          })
          this.viewer.entities.add(trailEntity)
          this.tracerEntities.push(trailEntity)
        }
      }

      this.viewer.scene.requestRender()
    })
  }

  private getTracerHeadIndex(arcIndex: number): number {
    const arc = this.arcs[arcIndex]
    if (!arc) return 0
    const elapsed = Date.now() / 1000 - this.startTime
    const phase = (arcIndex * 0.31) % 1
    const distanceTraveled = elapsed * TRACER_SPEED_MPS
    const frac = ((distanceTraveled / arc.arcLengthM + phase) % 1)
    return Math.floor(frac * (arc.tracerPositions.length - 1))
  }

  private sliceTracer(arcIndex: number, behindHead: number, count: number, result?: Cartesian3[]): Cartesian3[] {
    const arc = this.arcs[arcIndex]
    const out = result ?? []
    out.length = 0
    if (!arc || arc.tracerPositions.length < 2) return out

    const headIdx = this.getTracerHeadIndex(arcIndex)
    const positions = arc.tracerPositions
    const maxIdx = positions.length - 1

    const sliceEnd = headIdx - behindHead
    const sliceStart = sliceEnd - count

    const from = Math.max(0, sliceStart)
    const to = Math.max(0, Math.min(sliceEnd, maxIdx))

    if (from >= to) {
      out.push(positions[Math.min(from, maxIdx)])
      out.push(positions[Math.min(from + 1, maxIdx)])
      return out
    }

    for (let i = from; i <= to; i++) {
      out.push(positions[i])
    }
    return out
  }

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

  updateRouteVisibility(): void {}

  highlightSegment(segmentIndex: number, highlight: boolean = true): void {
    // Each base arc has 2 route entities (outer + inner), so multiply index by 2
    const innerEntity = this.routeEntities[segmentIndex * 2 + 1]
    if (innerEntity?.polyline) {
      innerEntity.polyline.material = new ColorMaterialProperty(
        highlight
          ? Color.fromCssColorString('#D0E0F0').withAlpha(0.7)
          : Color.fromCssColorString('#C8DDEF').withAlpha(0.5)
      )
    }
  }

  getRouteEntities(): Entity[] {
    return [...this.routeEntities, ...this.tracerEntities]
  }

  clearRoutes(): void {
    this.routeEntities.forEach(e => this.viewer.entities.remove(e))
    this.tracerEntities.forEach(e => this.viewer.entities.remove(e))
    this.routeEntities = []
    this.tracerEntities = []
    this.arcs = []
  }

  static createTourRoute(viewer: Viewer, stops: Stop[]): RouteManager {
    const rm = new RouteManager(viewer)
    rm.addTourRoute(stops)
    return rm
  }

  destroy(): void {
    this.clearRoutes()
  }
}
