import {
  ImageMaterialProperty,
  ColorMaterialProperty,
  Cartesian2,
  Color,
  ConstantProperty,
} from 'cesium'
import type { MaterialProperty } from 'cesium'

import facade1Url from '@/assets/textures/buildings/facade_01.webp?url'
import facade2Url from '@/assets/textures/buildings/facade_02.webp?url'
import roof1Url from '@/assets/textures/buildings/roof_01.webp?url'

console.log('Building texture URLs:', { facade1Url, facade2Url, roof1Url })
if (import.meta.env.DEV && [facade1Url, facade2Url, roof1Url].some((u) => u.startsWith('data:'))) {
  console.warn('Textures are still inlined; check assetsInlineLimit and file sizes')
}

let useFallbackProcedural = false
let preloadPromise: Promise<void> | null = null

/**
 * Preload an image with decode-safe logic. Uses img.decode() when available.
 */
function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    if (typeof img.decode === 'function') {
      img.onload = () => {
        img.decode().then(() => resolve(img)).catch(() => resolve(img))
      }
    } else {
      img.onload = () => resolve(img)
    }
    img.src = url
  })
}

/**
 * Preload all 3 building textures. On any failure, sets useFallbackProcedural=true and logs the failing url.
 */
function preloadTextures(): Promise<void> {
  if (preloadPromise) return preloadPromise
  const urls = [facade1Url, facade2Url, roof1Url] as const
  preloadPromise = Promise.allSettled(urls.map((u) => preloadImage(u))).then((results) => {
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? urls[i] : null))
      .filter((u): u is string => u != null)
    if (failed.length > 0) {
      failed.forEach((u) => console.warn('[Buildings] Texture preload failed:', u))
      useFallbackProcedural = true
    }
  })
  return preloadPromise
}

/**
 * Call before creating building materials. Resolves when textures are ready or fallback is active.
 * Does not block camera flight (building load is fire-and-forget).
 */
export function ensureTexturesReady(): Promise<void> {
  return preloadTextures()
}

function getFallbackFacadeColor(hash: number): Color {
  const t = (hash % 21) / 20
  const mult = 0.85 + t * 0.25
  return Color.fromBytes(
    Math.round(90 * mult),
    Math.round(90 * mult),
    Math.round(95 * mult),
    255
  )
}

function getFallbackRoofColor(hash: number): Color {
  const t = ((hash >> 8) % 21) / 20
  const mult = 0.92 + t * 0.18
  return Color.fromBytes(
    Math.round(100 * mult),
    Math.round(100 * mult),
    Math.round(105 * mult),
    255
  )
}

/**
 * Stable uint32 hash from string (FNV-1a style)
 */
export function stableHash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Choose facade texture path based on hash (facade_01 or facade_02)
 */
function chooseFacadeTexturePath(hash: number): string {
  return (hash % 2) === 0 ? facade1Url : facade2Url
}

/**
 * Tint color for facade: subtle brightness 0.85..1.05
 */
function getFacadeTint(hash: number): Color {
  const t = (hash % 21) / 20 // 0..1
  const brightness = 0.85 + t * 0.2
  const b = Math.round(255 * brightness)
  return Color.fromBytes(b, b, Math.round(b * 0.98), 255)
}

/**
 * Tint color for roof: subtle brightness
 */
function getRoofTint(hash: number): Color {
  const t = ((hash >> 8) % 21) / 20
  const brightness = 0.88 + t * 0.14
  const b = Math.round(255 * brightness)
  return Color.fromBytes(b, b, Math.round(b * 0.96), 255)
}

/**
 * Get facade material. Reuses cached ImageMaterialProperty; per-building variation via color only.
 * Note: Shared material + per-entity color would require CallbackProperty with entity context (not available).
 * We create new materials with shared URLs; Cesium caches textures.
 */
export function getFacadeMaterial(hash: number): MaterialProperty {
  if (useFallbackProcedural) {
    return new ColorMaterialProperty(new ConstantProperty(getFallbackFacadeColor(hash)))
  }
  const image = (hash % 2) === 0 ? facade1Url : facade2Url
  return new ImageMaterialProperty({
    image,
    repeat: new Cartesian2(4, 1),
    color: new ConstantProperty(getFacadeTint(hash)),
  })
}

/**
 * Get roof material. Same pattern; roof slightly lighter when fallback.
 */
export function getRoofMaterial(hash: number): MaterialProperty {
  if (useFallbackProcedural) {
    return new ColorMaterialProperty(new ConstantProperty(getFallbackRoofColor(hash)))
  }
  return new ImageMaterialProperty({
    image: roof1Url,
    repeat: new Cartesian2(2, 2),
    color: new ConstantProperty(getRoofTint(hash)),
  })
}
