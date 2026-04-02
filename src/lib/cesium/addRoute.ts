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
 * Build offset arc positions: same path but elevated slightly higher.
 * This makes the tracer sit alongside/above the base arc rather than on top.
 */
function buildOffsetArcPositions(basePositions: Cartesian3[], elevationOffset: number): Cartesian3[] {
  return basePositions.map(pos => {
    const carto = Cartographic.fromCartesian(pos, Ellipsoid.WGS84)
    carto.height += elevationOffset
    return Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height)
  })
}

/** Tracer world-space speed: meters of arc per second */
const TRACER_SPEED_MPS = 800_000
/** Number of points the tracer head covers (bright core) */
const TRACER_HEAD_PTS = 5
/** Number of trail layers behind the head (fading tail) */
const TRACER_TRAIL_LAYERS = 3
/** Points per trail layer */
const TRACER_TRAIL_PTS = 4
/** Height offset so tracer floats above base arc (meters) */
const TRACER_HEIGHT_OFFSET = 3500

interface ArcData {
  basePositions: Cartesian3[]
  tracerPositions: Cartesian3[]  // offset path for tracer
  arcLengthM: number             // total arc length in meters
}

/**
 * Route visualization with animated tracers.
 * Base arcs: static cool white/blue polylines.
 * Tracers: animated bright blue subsections on an offset path, with fading tail layers.
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

    // Pre-compute all arc geometry first (fast)
    const pendingArcs: Array<{ start: Cartesian3; end: Cartesian3; idx: number }> = []
    for (let i = 0; i < sortedStops.length - 1; i++) {
      const start = markerPositions.get(sortedStops[i].id)
      const end = markerPositions.get(sortedStops[i + 1].id)
      if (start && end) pendingArcs.push({ start, end, idx: i })
    }

    // Build geometry
    for (const { start, end, idx } of pendingArcs) {
      const basePositions = buildArcPositions(start, end)
      const tracerPositions = buildOffsetArcPositions(basePositions, TRACER_HEIGHT_OFFSET)

      // Compute arc length in meters
      let arcLengthM = 0
      for (let j = 1; j < basePositions.length; j++) {
        arcLengthM += Cartesian3.distance(basePositions[j - 1], basePositions[j])
      }

      this.arcs.push({ basePositions, tracerPositions, arcLengthM })

      // Base arc entity
      const baseEntity = new Entity({
        id: `route-${idx}`,
        polyline: {
          positions: basePositions,
          width: 2.2,
          arcType: ArcType.NONE,
          clampToGround: false,
          material: new PolylineGlowMaterialProperty({
            glowPower: new ConstantProperty(0.18),
            taperPower: new ConstantProperty(1.0),
            color: new ConstantProperty(Color.fromCssColorString('#C0D4EC').withAlpha(0.35))
          }),
          show: true,
          zIndex: 1000,
          depthFailMaterial: new ColorMaterialProperty(Color.fromAlpha(Color.WHITE, 0.0))
        },
      })
      this.viewer.entities.add(baseEntity)
      this.routeEntities.push(baseEntity)
    }

    // Add tracer entities after all base arcs (ensures base renders first)
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

      // Fading trail layers (progressively dimmer, each behind the previous)
      for (let layer = 0; layer < TRACER_TRAIL_LAYERS; layer++) {
        const layerIdx = layer
        const alpha = 0.55 - layer * 0.16  // 0.55, 0.39, 0.23
        const width = 2.4 - layer * 0.4    // 2.4, 2.0, 1.6
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
              glowPower: new ConstantProperty(0.25 - layer * 0.06),
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
  }

  /**
   * Get the current tracer head index for a given arc.
   * All tracers move at the same world-space velocity (TRACER_SPEED_MPS).
   * Phase offset staggers them so they don't all sync.
   */
  private getTracerHeadIndex(arcIndex: number): number {
    const arc = this.arcs[arcIndex]
    if (!arc) return 0
    const elapsed = Date.now() / 1000 - this.startTime
    const phase = (arcIndex * 0.31) % 1  // stagger
    const distanceTraveled = elapsed * TRACER_SPEED_MPS
    const arcLen = arc.arcLengthM
    // How far along this arc (0..1), wrapping
    const frac = ((distanceTraveled / arcLen + phase) % 1)
    return Math.floor(frac * (arc.tracerPositions.length - 1))
  }

  /**
   * Slice a subsection of the tracer path starting `behindHead` points behind
   * the current head position, spanning `count` points.
   */
  private sliceTracer(arcIndex: number, behindHead: number, count: number, result?: Cartesian3[]): Cartesian3[] {
    const arc = this.arcs[arcIndex]
    const out = result ?? []
    out.length = 0
    if (!arc || arc.tracerPositions.length < 2) return out

    const headIdx = this.getTracerHeadIndex(arcIndex)
    const positions = arc.tracerPositions
    const maxIdx = positions.length - 1

    // The slice runs from (head - behindHead - count) to (head - behindHead)
    const sliceEnd = headIdx - behindHead
    const sliceStart = sliceEnd - count

    const from = Math.max(0, sliceStart)
    const to = Math.max(0, Math.min(sliceEnd, maxIdx))

    if (from >= to) {
      // Minimum 2 points to be a valid polyline
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
    const entity = this.routeEntities[segmentIndex]
    if (entity?.polyline) {
      const material = entity.polyline.material as PolylineGlowMaterialProperty
      if (material) {
        material.glowPower = new ConstantProperty(highlight ? 0.28 : 0.18)
        material.color = new ConstantProperty(
          highlight
            ? Color.fromCssColorString('#D0E0F0').withAlpha(0.55)
            : Color.fromCssColorString('#C0D4EC').withAlpha(0.35)
        )
      }
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
