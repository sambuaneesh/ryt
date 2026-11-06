// Generated artwork for themes that expect images (cover photos, avatars). Many theme demos
// are image-heavy; without images they look empty. These are deterministic: the same title
// always gets the same colours. Real PNGs, so Hugo's image processing can resize them.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = buf => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  let i = 0
  for (let y = 0; y < height; y++) {
    raw[i++] = 0 // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x / (width - 1), y / (height - 1))
      raw[i++] = r
      raw[i++] = g
      raw[i++] = b
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hash = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261)

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// A soft two-colour diagonal gradient with a gentle glow, like a poster background.
export function coverImage(seed, width = 800, height = 450) {
  const h = hash(seed)
  const hue = h % 360
  const from = hsl(hue, 0.65, 0.62)
  const to = hsl((hue + 40 + (h >> 9) % 60) % 360, 0.7, 0.42)
  const gx = 0.25 + ((h >> 3) % 50) / 100
  const gy = 0.2 + ((h >> 5) % 40) / 100
  return png(width, height, (x, y) => {
    const base = mixRgb(from, to, Math.min(1, (x * 0.6 + y * 0.4)))
    const d = Math.hypot((x - gx) * 1.6, y - gy)
    const glow = Math.max(0, 1 - d / 0.55) ** 2 * 0.4
    return mixRgb(base, [255, 255, 255], glow)
  })
}

export function avatarImage(seed, size = 320) {
  const hue = hash(seed) % 360
  const from = hsl(hue, 0.75, 0.62)
  const to = hsl((hue + 30) % 360, 0.7, 0.48)
  return png(size, size, (x, y) => mixRgb(from, to, Math.min(1, x * 0.3 + y * 0.7)))
}

// Images are cached by content, so rebuilds stay fast (generation is ~50 ms per image).
export function cachedImage(dir, kind, seed) {
  const file = path.join(dir, `${kind}-${hash(seed).toString(36)}.png`)
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, kind === 'avatar' ? avatarImage(seed) : kind === 'banner' ? coverImage(seed, 1600, 600) : coverImage(seed))
  }
  return file
}
