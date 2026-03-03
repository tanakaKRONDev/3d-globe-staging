/**
 * Creates minimal valid 1x1 WebP placeholder files for building textures.
 * Replace with real CC0 textures from Poly Haven/ambientCG for production.
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'assets', 'textures', 'buildings')

// Minimal valid 1x1 lossless WebP (30 bytes) - grey pixel
const MINIMAL_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x0e, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x00, 0x08, 0x11, 0x00, 0x00, 0x00
])

mkdirSync(OUT, { recursive: true })

const files = ['facade_01.webp', 'facade_02.webp', 'roof_01.webp']
for (const f of files) {
  const p = join(OUT, f)
  if (!existsSync(p)) {
    writeFileSync(p, MINIMAL_WEBP)
    console.log(`[Placeholder] Created ${f}`)
  }
}
