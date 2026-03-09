/**
 * Generates 1024x1024 soft radial gradient PNG overlays for north/south poles.
 * Output: public/pole-north.png, public/pole-south.png
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(__dirname, '..', 'public')

const W = 1024
const H = 1024
const CX = W / 2
const CY = H / 2
const MAX_R = Math.sqrt(CX * CX + CY * CY)

function createGradientPng(north) {
  // North: arctic blue/ice #1a4068; South: antarctic white/blue #173a63
  const r = north ? 0x1a : 0x17
  const g = north ? 0x40 : 0x3a
  const b = north ? 0x68 : 0x63

  const raw = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX
      const dy = y - CY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const t = Math.pow(Math.min(1, dist / MAX_R), 0.7) // soft falloff
      const alpha = Math.round(Math.max(0, 1 - t) * 255)
      const idx = (y * W + x) * 4
      raw[idx] = r
      raw[idx + 1] = g
      raw[idx + 2] = b
      raw[idx + 3] = alpha
    }
  }

  return raw
}

function rawToPng(raw) {
  // Minimal PNG encoder: signature + IHDR + IDAT + IEND
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(W, 0)
  ihdrData.writeUInt32BE(H, 4)
  ihdrData[8] = 8
  ihdrData[9] = 6 // RGBA
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = makeChunk('IHDR', ihdrData)

  // Raw pixel data: filter byte 0 + RGBA per row
  const unfiltered = Buffer.alloc(W * H * 4 + H)
  for (let y = 0; y < H; y++) {
    unfiltered[y * (W * 4 + 1)] = 0
    raw.copy(unfiltered, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
  }
  const compressed = deflateSync(unfiltered, { level: 6 })
  const idat = makeChunk('IDAT', compressed)

  const iend = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const chunk = Buffer.concat([Buffer.from(type), data])
  const crc = crc32(chunk)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc >>> 0, 0)
  return Buffer.concat([len, chunk, crcBuf])
}

function crc32(buf) {
  let crc = 0xffffffff
  const table = (function () {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      t[i] = c >>> 0
    }
    return t
  })()
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function main() {
  mkdirSync(PUBLIC, { recursive: true })

  const northRaw = createGradientPng(true)
  const southRaw = createGradientPng(false)

  const northPng = rawToPng(northRaw)
  const southPng = rawToPng(southRaw)

  const northPath = join(PUBLIC, 'pole-north.png')
  const southPath = join(PUBLIC, 'pole-south.png')

  writeFileSync(northPath, northPng)
  writeFileSync(southPath, southPng)

  console.log('[generate-pole-overlays] Created pole-north.png, pole-south.png')
}

try {
  main()
} catch (err) {
  console.error('[generate-pole-overlays]', err)
  process.exit(1)
}
