import { Color } from 'cesium'
import {
  BUILDING_WALL_GREY,
  BUILDING_ROOF_GREY,
  BUILDING_ALPHA,
} from '../../../config/visual'

/**
 * Grey color with brightness factor (clamped). Returns Cesium.Color only.
 */
export function makeGreyColor(hex: string, f: number, alpha: number): Color {
  const base = Color.fromCssColorString(hex)
  const r = Math.min(1, Math.max(0, base.red * f))
  const g = Math.min(1, Math.max(0, base.green * f))
  const b = Math.min(1, Math.max(0, base.blue * f))
  return new Color(r, g, b, alpha)
}

/**
 * Apply grey to polygon. material must be Cesium.Color or MaterialProperty only.
 */
export function applyGreyToPolygon(
  polygon: { material: unknown },
  factor: number,
  isRoof: boolean
): void {
  const hex = isRoof ? BUILDING_ROOF_GREY : BUILDING_WALL_GREY
  const c = makeGreyColor(hex, factor, BUILDING_ALPHA)
  ;(polygon as { material: Color }).material = c
}
