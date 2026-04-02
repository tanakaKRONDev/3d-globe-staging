/**
 * Predefined stop marker icon set.
 * Each icon is drawn as a simple canvas path inside a marker circle.
 * Store only the key on each stop — never raw image data.
 */

export const STOP_ICON_KEYS = [
  'default',
  'arena',
  'stadium',
  'club',
  'festival',
  'theater',
  'residency',
  'special',
  'international',
  'vip',
] as const

export type StopIconKey = (typeof STOP_ICON_KEYS)[number]

export const STOP_ICON_LABELS: Record<StopIconKey, string> = {
  default: 'Default',
  arena: 'Arena',
  stadium: 'Stadium',
  club: 'Club',
  festival: 'Festival',
  theater: 'Theater',
  residency: 'Residency',
  special: 'Special',
  international: 'International',
  vip: 'VIP',
}

/**
 * Draw the icon glyph centered at (cx, cy) inside a marker.
 * `color` is the stroke/fill color (dark for selected, light for unselected).
 * All paths fit within a ~10px radius of center.
 */
export function drawStopIcon(
  ctx: CanvasRenderingContext2D,
  icon: StopIconKey,
  cx: number,
  cy: number,
  color: string
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (icon) {
    case 'arena': {
      // Dome / arch
      ctx.beginPath()
      ctx.arc(cx, cy + 2, 6, Math.PI, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy + 2)
      ctx.lineTo(cx + 6, cy + 2)
      ctx.stroke()
      break
    }
    case 'stadium': {
      // Open bowl / U shape
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy - 3)
      ctx.lineTo(cx - 6, cy + 1)
      ctx.quadraticCurveTo(cx, cy + 6, cx + 6, cy + 1)
      ctx.lineTo(cx + 6, cy - 3)
      ctx.stroke()
      break
    }
    case 'club': {
      // Music note (quarter note)
      ctx.beginPath()
      ctx.ellipse(cx - 2, cy + 3, 3, 2.2, -0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx + 0.5, cy + 2.5)
      ctx.lineTo(cx + 0.5, cy - 5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + 0.5, cy - 5)
      ctx.lineTo(cx + 4, cy - 3)
      ctx.stroke()
      break
    }
    case 'festival': {
      // 5-point star
      const spikes = 5
      const outerR = 6
      const innerR = 2.8
      ctx.beginPath()
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR
        const angle = (i * Math.PI) / spikes - Math.PI / 2
        const px = cx + Math.cos(angle) * r
        const py = cy + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'theater': {
      // Twin arcs (curtain/masks feel)
      ctx.beginPath()
      ctx.arc(cx - 3, cy, 4, Math.PI * 0.2, Math.PI * 0.8)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx + 3, cy, 4, Math.PI * 0.2, Math.PI * 0.8)
      ctx.stroke()
      break
    }
    case 'residency': {
      // House/home
      ctx.beginPath()
      ctx.moveTo(cx, cy - 5)
      ctx.lineTo(cx + 6, cy + 1)
      ctx.lineTo(cx + 4, cy + 1)
      ctx.lineTo(cx + 4, cy + 5)
      ctx.lineTo(cx - 4, cy + 5)
      ctx.lineTo(cx - 4, cy + 1)
      ctx.lineTo(cx - 6, cy + 1)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'special': {
      // Diamond (rotated square)
      ctx.beginPath()
      ctx.moveTo(cx, cy - 6)
      ctx.lineTo(cx + 5, cy)
      ctx.lineTo(cx, cy + 6)
      ctx.lineTo(cx - 5, cy)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'international': {
      // Globe with cross-lines
      ctx.beginPath()
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 5.5, cy)
      ctx.lineTo(cx + 5.5, cy)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(cx, cy, 2.8, 5.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'vip': {
      // Crown (3 points)
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy + 3)
      ctx.lineTo(cx - 5, cy - 2)
      ctx.lineTo(cx - 2, cy + 1)
      ctx.lineTo(cx, cy - 5)
      ctx.lineTo(cx + 2, cy + 1)
      ctx.lineTo(cx + 5, cy - 2)
      ctx.lineTo(cx + 6, cy + 3)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'default':
    default: {
      // Simple bullseye dot (existing behavior)
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }

  ctx.restore()
}
