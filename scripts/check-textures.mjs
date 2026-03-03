import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REQUIRED = [
  'src/assets/textures/buildings/facade_01.webp',
  'src/assets/textures/buildings/facade_02.webp',
  'src/assets/textures/buildings/roof_01.webp',
]

const missing = REQUIRED.filter((p) => !existsSync(join(ROOT, p)))
if (missing.length > 0) {
  console.error('[check-textures] Missing required textures:')
  missing.forEach((p) => console.error(`  - ${p}`))
  console.error('[check-textures] Add CC0 textures from Poly Haven or ambientCG. See src/assets/textures/buildings/README.md')
  process.exit(1)
}
