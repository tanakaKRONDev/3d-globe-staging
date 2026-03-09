import {
  Viewer,
  Entity,
  Cartesian3,
  PolygonHierarchy,
  ConstantProperty,
  Ellipsoid,
  Color,
} from 'cesium'
import type { Stop } from '../data/types'
import {
  BUILDING_WALL_GREY,
  BUILDING_ROOF_GREY,
  BUILDING_ALPHA,
} from '../../config/visual'
import { ensureTexturesReady, stableHash } from './buildingTextures'
import { makeGreyColor } from './materials/buildingGrey'

const MAX_BUILDINGS_PER_STOP = 500
const DEBUG_BUILDINGS = true
const LOCATION_MISMATCH_THRESHOLD_M = 1000

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculates building height from OSM properties with proper clamping
 */
function calculateBuildingHeight(properties: Record<string, unknown> | undefined): number {
  if (!properties) return 12 + (Math.random() * 48)

  if (properties.height) {
    const heightStr = String(properties.height).toLowerCase()
    const heightMatch = heightStr.match(/(\d+(?:\.\d+)?)/)
    if (heightMatch) {
      const height = parseFloat(heightMatch[1])
      return Math.max(8, Math.min(220, height))
    }
  }

  if (properties['building:levels']) {
    const levels = parseInt(String(properties['building:levels']), 10)
    if (!isNaN(levels) && levels > 0) {
      const height = levels * 3.2
      return Math.max(8, Math.min(160, height))
    }
  }

  return 12 + Math.random() * 48
}

type GeoJSONFeature = {
  type: 'Feature'
  geometry?: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
  properties?: Record<string, unknown>
}

type GeoJSONFC = {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
  properties?: Record<string, unknown>
}

/**
 * Converts GeoJSON ring [[lon,lat],...] to Cartesian3[] at ground level
 */
function ringToCartesian(ring: number[][], ellipsoid: Ellipsoid = Ellipsoid.WGS84): Cartesian3[] {
  const positions: Cartesian3[] = []
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]
    const h = ring[i].length > 2 ? ring[i][2] : 0
    positions.push(Cartesian3.fromDegrees(lon, lat, h))
  }
  return positions
}

/**
 * Extracts polygon rings from a GeoJSON feature (Polygon or MultiPolygon).
 * Returns array of exterior rings only (skips holes).
 */
function getPolygonRings(feature: GeoJSONFeature): number[][][] {
  const geom = feature.geometry
  if (!geom) return []
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
    const coords = geom.coordinates as number[][][]
    return coords[0] && coords[0].length >= 3 ? [coords[0]] : []
  }
  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    const polygons = geom.coordinates as number[][][][]
    const rings: number[][][] = []
    for (const poly of polygons) {
      if (poly?.[0] && poly[0].length >= 3) rings.push(poly[0])
    }
    return rings
  }
  return []
}

/** Cached entity arrays per stop (for re-selecting without re-fetch) */
type EntityCache = Map<string, Entity[]>

/**
 * Building manager for loading and displaying 3D buildings with photo textures.
 * Loads from /data/buildings/{stopId}.geojson (local only, no Overpass). Caches loaded data.
 */
export class BuildingManager {
  private viewer: Viewer
  /** Entities currently shown for the active stop */
  private entitiesByStop: Map<string, Entity[]> = new Map()
  /** Cached entities per stop for re-selection without re-download */
  private entityCache: EntityCache = new Map()
  private loadingPromises: Map<string, Promise<void>> = new Map()

  constructor(viewer: Viewer) {
    this.viewer = viewer
  }

  /** True when buildings were suppressed for this stop (source coords mismatch). */
  private suppressedForStop: Set<string> = new Set()

  /**
   * Loads and displays buildings for a stop. Uses walls + roofs with photo textures.
   * Only intended for venue mode. Caches data so re-selecting does not re-download.
   * Skips rendering if GeoJSON sourceLat/sourceLng differs from stop lat/lng by >1km.
   * @param isStillRelevant - Optional predicate; if false when load completes, entities are not added
   * @returns { suppressed } - true if buildings were not rendered due to location mismatch
   */
  async loadBuildingsForStop(
    stop: Stop,
    isStillRelevant?: () => boolean
  ): Promise<{ suppressed?: boolean }> {
    const stopId = stop.id

    // Remove previously displayed buildings (keep in cache)
    for (const [prevStopId, entities] of this.entitiesByStop.entries()) {
      if (prevStopId !== stopId) {
        entities.forEach((e) => this.viewer.entities.remove(e))
        this.entitiesByStop.delete(prevStopId)
      }
    }

    // Cache hit: add cached entities to viewer (or use cached empty = no buildings)
    const cached = this.entityCache.get(stopId)
    if (cached !== undefined) {
      const suppressed = this.suppressedForStop.has(stopId)
      if (suppressed) return { suppressed: true }
      cached.forEach((e) => this.viewer.entities.add(e))
      this.entitiesByStop.set(stopId, cached)
      if (DEBUG_BUILDINGS && cached.length > 0) {
        console.log(`[Buildings] Restored from cache (${cached.length / 2} buildings) for ${stop.city}`)
      }
      return {}
    }

    if (this.loadingPromises.has(stopId)) {
      const p = this.loadingPromises.get(stopId)
      return p ? p.then(() => ({ suppressed: this.suppressedForStop.has(stopId) })) : Promise.resolve({})
    }

    const loadingPromise = this.loadBuildingsInternal(stop, isStillRelevant)
    this.loadingPromises.set(stopId, loadingPromise)

    try {
      const result = await loadingPromise
      return result
    } finally {
      this.loadingPromises.delete(stopId)
    }
  }

  private async loadBuildingsInternal(
    stop: Stop,
    isStillRelevant?: () => boolean
  ): Promise<{ suppressed?: boolean }> {
    const stopId = stop.id
    const buildingUrl = `/data/buildings/${stopId}.geojson`
    const ellipsoid = this.viewer.scene.globe.ellipsoid

    try {
      await ensureTexturesReady()
      const response = await fetch(buildingUrl)
      if (!response.ok) {
        if (DEBUG_BUILDINGS) {
          console.warn(`[Buildings] ${stop.city}: HTTP ${response.status}, skipping buildings`)
        }
        return {}
      }

      const data: GeoJSONFC = await response.json()

      // Skip on error placeholder (0 features or properties.error); cache empty to avoid re-fetch
      if (data.properties?.error || !Array.isArray(data.features) || data.features.length === 0) {
        if (DEBUG_BUILDINGS) {
          console.log(`[Buildings] ${stop.city}: no valid features, skipping`)
        }
        this.entityCache.set(stopId, [])
        return {}
      }

      // Avoid wrong-location buildings: if GeoJSON source coords differ from stop by >1km, suppress
      const props = data.properties ?? {}
      const srcLat = (props.sourceLat ?? props.centerLat) as number | undefined
      const srcLng = (props.sourceLng ?? props.centerLng) as number | undefined
      if (
        srcLat != null &&
        srcLng != null &&
        stop.lat != null &&
        stop.lng != null &&
        typeof srcLat === 'number' &&
        typeof srcLng === 'number'
      ) {
        const distM = haversineMeters(stop.lat, stop.lng, srcLat, srcLng)
        if (distM > LOCATION_MISMATCH_THRESHOLD_M) {
          if (DEBUG_BUILDINGS) {
            console.log(
              `[Buildings] ${stop.city}: source coords mismatch (${distM.toFixed(0)}m > ${LOCATION_MISMATCH_THRESHOLD_M}m), suppressing buildings`
            )
          }
          this.suppressedForStop.add(stopId)
          this.entityCache.set(stopId, [])
          return { suppressed: true }
        }
      }
      this.suppressedForStop.delete(stopId)

      const features = data.features
      const entities: Entity[] = []
      let wallCount = 0
      let roofCount = 0
      let featureIndex = 0

      for (let i = 0; i < features.length && featureIndex < MAX_BUILDINGS_PER_STOP; i++) {
        const feature = features[i]
        const rings = getPolygonRings(feature)
        if (rings.length === 0) continue

        for (const ring of rings) {
          if (featureIndex >= MAX_BUILDINGS_PER_STOP) break
          if (ring.length < 3) continue

          const height = calculateBuildingHeight(feature.properties)

          const positions = ringToCartesian(ring, ellipsoid)
          const minHeights = positions.map(() => 0)
          const maxHeights = positions.map(() => height)

          let wallMaterial: Color
          let roofMaterial: Color
          try {
            const seed = `${stopId}-${featureIndex}`
            const h = stableHash(seed) >>> 0
            const f = 0.92 + ((h % 1000) / 1000) * 0.12
            wallMaterial = makeGreyColor(BUILDING_WALL_GREY, f, BUILDING_ALPHA)
            if (!(wallMaterial instanceof Color)) {
              console.warn('[Buildings] wall not Cesium.Color', wallMaterial)
            }
            roofMaterial = makeGreyColor(
              BUILDING_ROOF_GREY,
              f * 1.03,
              BUILDING_ALPHA
            )
            if (!(roofMaterial instanceof Color)) {
              console.warn('[Buildings] roof not Cesium.Color', roofMaterial)
            }
          } catch (err) {
            console.warn('[Buildings] material apply failed', err)
            wallMaterial = Color.WHITE.withAlpha(0.7)
            roofMaterial = Color.WHITE.withAlpha(0.7)
          }

          const wallEntity = this.viewer.entities.add({
            name: `building-wall-${stopId}-${featureIndex}`,
            wall: {
              positions: new ConstantProperty(positions),
              minimumHeights: new ConstantProperty(minHeights),
              maximumHeights: new ConstantProperty(maxHeights),
              material: wallMaterial,
              outline: false,
            },
          })
          entities.push(wallEntity)
          wallCount++

          const roofEntity = this.viewer.entities.add({
            name: `building-roof-${stopId}-${featureIndex}`,
            polygon: {
              hierarchy: new ConstantProperty(new PolygonHierarchy(positions)),
              height: new ConstantProperty(height),
              extrudedHeight: new ConstantProperty(height + 0.5),
              material: roofMaterial,
              outline: false,
            },
          })
          entities.push(roofEntity)
          roofCount++
          featureIndex++
        }
      }

      if (isStillRelevant && !isStillRelevant()) {
        entities.forEach((e) => this.viewer.entities.remove(e))
        return {}
      }

      this.entitiesByStop.set(stopId, entities)
      this.entityCache.set(stopId, entities)

      if (DEBUG_BUILDINGS) {
        const total = wallCount + roofCount
        console.log(`[Buildings] Loaded: ${wallCount} walls, ${roofCount} roofs (total entities: ${total}) for ${stop.city}`)
        const firstWall = entities.find((e) => e.wall)
        const firstRoof = entities.find((e) => e.polygon)
        if (firstWall?.wall?.material) {
          console.log('[Buildings] building material (wall)', firstWall.wall.material)
        }
        if (firstRoof?.polygon?.material) {
          console.log('[Buildings] building material (roof)', firstRoof.polygon.material)
        }
      }
      return {}
    } catch (error) {
      if (DEBUG_BUILDINGS) {
        console.warn(`[Buildings] ${stop.city}:`, error)
      }
      return {}
    }
  }

  async removeBuildingsForStop(stopId: string): Promise<void> {
    const entities = this.entitiesByStop.get(stopId)
    if (entities) {
      entities.forEach(e => this.viewer.entities.remove(e))
      this.entitiesByStop.delete(stopId)
      this.suppressedForStop.delete(stopId)
      console.log(`[Buildings] Removed buildings for stop ${stopId}`)
    }
  }

  isBuildingsSuppressedForStop(stopId: string): boolean {
    return this.suppressedForStop.has(stopId)
  }

  setBuildingsVisibility(_stopId: string, _visible: boolean): void {
    // Visibility per-stop could be added via entity.show
  }

  async clearAllBuildings(): Promise<void> {
    const promises = Array.from(this.entitiesByStop.keys()).map(stopId =>
      this.removeBuildingsForStop(stopId)
    )
    await Promise.all(promises)
    console.log('[Buildings] Cleared all buildings')
  }

  getLoadedStops(): string[] {
    return Array.from(this.entitiesByStop.keys())
  }

  areBuildingsLoaded(stopId: string): boolean {
    return this.entitiesByStop.has(stopId)
  }
}
