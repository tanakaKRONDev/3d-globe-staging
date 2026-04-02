import {
  Viewer,
  Entity,
  Cartesian3,
  Cartesian2,
  VerticalOrigin,
  HorizontalOrigin,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  ConstantProperty,
  PropertyBag,
  CustomDataSource,
  NearFarScalar,
  DistanceDisplayCondition,
  LabelStyle,
  Color
} from 'cesium'
import type { Stop } from '../data/types'
import { drawStopIcon, type StopIconKey } from '../icons/stopIcons'

/**
 * Draw a clean circular marker badge with a venue-type icon inside.
 * Unselected: dark circle with light ring + icon in light color.
 * Selected: accent-filled circle with icon in dark color.
 */
export function createMarkerCanvas(isSelected = false, icon: StopIconKey = 'default'): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const size = 40
  const scale = 2
  canvas.width = size * scale
  canvas.height = size * scale
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`

  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const cx = size / 2
  const cy = size / 2
  const r = 14

  if (isSelected) {
    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, r - 2, cx, cy, r + 8)
    glow.addColorStop(0, 'rgba(231, 209, 167, 0.5)')
    glow.addColorStop(1, 'rgba(231, 209, 167, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2)
    ctx.fill()

    // Filled accent circle
    ctx.fillStyle = 'rgba(231, 209, 167, 0.9)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()

    // Ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    // Icon in dark color (reads against bright accent fill)
    drawStopIcon(ctx, icon, cx, cy, 'rgba(10, 14, 20, 0.85)')
  } else {
    // Dark filled circle
    ctx.fillStyle = 'rgba(18, 24, 36, 0.85)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()

    // Light ring
    ctx.strokeStyle = 'rgba(200, 210, 225, 0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    // Icon in light color (reads against dark fill)
    drawStopIcon(ctx, icon, cx, cy, 'rgba(200, 210, 225, 0.8)')
  }

  return canvas
}


export function createVenueMarker(stop: Stop, isSelected = false): Entity {
  const position = Cartesian3.fromDegrees(stop.lng ?? 0, stop.lat ?? 0)
  const icon = (stop.icon as StopIconKey) || 'default'
  const canvas = createMarkerCanvas(isSelected, icon)

  const entity = new Entity({
    id: stop.id,
    position,
    properties: new PropertyBag({
      stopId: stop.id,
      city: stop.city,
      venue: stop.venue,
      isVenueMarker: true
    }),
    billboard: {
      image: new ConstantProperty(canvas),
      width: 40,
      height: 40,
      verticalOrigin: VerticalOrigin.CENTER,
      horizontalOrigin: HorizontalOrigin.CENTER,
      disableDepthTestDistance: 0,
      scale: 1.0,
      scaleByDistance: new NearFarScalar(1_500_000, 1.0, 15_000_000, 0.6),
    },
    label: {
      text: stop.venue.length > 28 ? stop.city : stop.venue,
      font: '500 14px Roboto, sans-serif',
      fillColor: isSelected
        ? Color.fromCssColorString('#E7D1A7')
        : Color.WHITE,
      outlineColor: Color.fromCssColorString('rgba(0, 0, 0, 0.85)'),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.TOP,
      horizontalOrigin: HorizontalOrigin.CENTER,
      pixelOffset: new Cartesian2(0, 24),
      disableDepthTestDistance: 0,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 8_000_000),
      scaleByDistance: new NearFarScalar(800_000, 1.0, 8_000_000, 0.8),
    }
  })
  return entity
}


export type MarkerHoverInfo = { stopId: string; city: string; venue: string; screenX: number; screenY: number } | null

export class VenueMarkerManager {
  private viewer: Viewer
  private markersDs: CustomDataSource
  private markers: Map<string, Entity> = new Map()
  private stopData: Map<string, Stop> = new Map()
  private clickHandler: ScreenSpaceEventHandler | null = null
  private onMarkerHover: ((info: MarkerHoverInfo) => void) | null = null
  private hoveredEntity: Entity | null = null

  constructor(viewer: Viewer) {
    this.viewer = viewer
    this.markersDs = new CustomDataSource('markers')
    this.markersDs.show = true
    viewer.dataSources.add(this.markersDs)
    this.setupClickHandler()
  }

  setVisible(visible: boolean): void {
    this.markersDs.show = visible
  }

  clearHover(): void {
    this.clearHoverInternal()
  }

  setOnMarkerHover(callback: (info: MarkerHoverInfo) => void): void {
    this.onMarkerHover = callback
  }

  private setupClickHandler(): void {
    this.clickHandler = new ScreenSpaceEventHandler(this.viewer.scene.canvas)

    this.clickHandler.setInputAction((event: any) => {
      const pickedObject = this.viewer.scene.pick(event.endPosition)

      if (defined(pickedObject) && defined(pickedObject.id)) {
        const entity = pickedObject.id as Entity

        if (entity.properties?.isVenueMarker?.getValue()) {
          if (this.hoveredEntity !== entity) {
            if (this.hoveredEntity?.billboard) {
              this.hoveredEntity.billboard.scale = new ConstantProperty(1.0)
            }
            this.hoveredEntity = entity
            if (entity.billboard) {
              entity.billboard.scale = new ConstantProperty(1.15)
            }
            this.viewer.canvas.style.cursor = 'pointer'
          }
          const props = entity.properties?.getValue?.(this.viewer.clock.currentTime) as Record<string, unknown> | undefined
          const city = String(props?.city ?? '')
          const venue = String(props?.venue ?? '')
          const stopId = String(props?.stopId ?? entity.id ?? '')
          this.onMarkerHover?.({
            stopId,
            city,
            venue,
            screenX: event.endPosition.x,
            screenY: event.endPosition.y
          })
        } else {
          this.clearHoverInternal()
        }
      } else {
        this.clearHoverInternal()
      }
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }

  private clearHoverInternal(): void {
    if (this.hoveredEntity?.billboard) {
      this.hoveredEntity.billboard.scale = new ConstantProperty(1.0)
    }
    this.hoveredEntity = null
    this.viewer.canvas.style.cursor = 'default'
    this.onMarkerHover?.(null)
  }

  setOnMarkerClick(_callback: (stopId: string) => void): void {
    // No-op: clicks handled in Globe.tsx
  }

  updateMarkers(stops: Stop[], selectedStopId: string | null): void {
    const currentStopIds = new Set(stops.map(stop => stop.id))
    for (const [stopId, entity] of this.markers) {
      if (!currentStopIds.has(stopId)) {
        this.markersDs.entities.remove(entity)
        this.markers.delete(stopId)
        this.stopData.delete(stopId)
      }
    }

    const stopsWithCoords = stops.filter((s) => s.lat != null && s.lng != null)
    for (const stop of stopsWithCoords) {
      const isSelected = stop.id === selectedStopId
      const existingMarker = this.markers.get(stop.id)

      if (existingMarker) {
        // Update billboard + label for selection state
        const stopIcon = (stop.icon as StopIconKey) || 'default'
        if (existingMarker.billboard) {
          existingMarker.billboard.image = new ConstantProperty(createMarkerCanvas(isSelected, stopIcon))
        }
        if (existingMarker.label) {
          existingMarker.label.fillColor = new ConstantProperty(
            isSelected
              ? Color.fromCssColorString('#E7D1A7')
              : Color.WHITE
          )
        }
      } else {
        const marker = createVenueMarker(stop, isSelected)
        this.markersDs.entities.add(marker)
        this.markers.set(stop.id, marker)
        this.stopData.set(stop.id, stop)
      }
    }
  }

  updateSelection(selectedStopId: string | null): void {
    for (const [stopId, entity] of this.markers) {
      const isSelected = stopId === selectedStopId
      const stop = this.stopData.get(stopId)
      const stopIcon = (stop?.icon as StopIconKey) || 'default'
      if (entity.billboard) {
        entity.billboard.image = new ConstantProperty(createMarkerCanvas(isSelected, stopIcon))
      }
      if (entity.label) {
        entity.label.fillColor = new ConstantProperty(
          isSelected
            ? Color.fromCssColorString('#E7D1A7')
            : Color.WHITE
        )
      }
    }
  }

  getMarker(stopId: string): Entity | undefined {
    return this.markers.get(stopId)
  }

  getAllMarkers(): Entity[] {
    return Array.from(this.markers.values())
  }

  getMarkerEntity(stopId: string): Entity | undefined {
    return this.markers.get(stopId)
  }

  destroy(): void {
    this.clearHoverInternal()
    if (this.clickHandler) {
      this.clickHandler.destroy()
      this.clickHandler = null
    }
    this.markersDs.entities.removeAll()
    this.markers.clear()
    this.stopData.clear()
    this.viewer.dataSources.remove(this.markersDs)
  }
}
