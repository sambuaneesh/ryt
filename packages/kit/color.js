// Colour parsing for theme imports. Other ecosystems write colours as hex, rgb(), hsl(),
// bare "222 47% 11%" (shadcn v3), oklch() (shadcn v4, daisyUI) or oklab(); our tokens are hex.

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const num = s => {
  const v = parseFloat(s)
  return s.trim().endsWith('%') ? v / 100 : v
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: r + m, g: g + m, b: b + m }
}

function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const gamma = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.sign(x) * Math.abs(x) ** (1 / 2.4) - 0.055)
  return {
    r: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

// Returns { r, g, b } in 0..1, or null if the value isn't a colour we understand.
export function parseColor(input) {
  const v = String(input ?? '').trim().toLowerCase().replace(/^['"]|['"]$/g, '')
  let m
  if ((m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v))) {
    let h = m[1]
    if (h.length <= 4) h = [...h].map(c => c + c).join('')
    return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 }
  }
  if ((m = /^(rgba?|hsla?|oklch|oklab)\(([^)]*)\)$/.exec(v))) {
    const parts = m[2].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const [p1, p2, p3] = parts
    if (m[1].startsWith('rgb')) {
      const ch = p => (p.endsWith('%') ? num(p) : parseFloat(p) / 255)
      return { r: ch(p1), g: ch(p2), b: ch(p3) }
    }
    if (m[1].startsWith('hsl')) return hslToRgb(parseFloat(p1), num(p2.endsWith('%') ? p2 : `${p2}%`), num(p3.endsWith('%') ? p3 : `${p3}%`))
    const L = p1.endsWith('%') ? num(p1) : parseFloat(p1)
    if (m[1] === 'oklab') return oklabToRgb(L, parseFloat(p2), parseFloat(p3))
    const C = parseFloat(p2)
    const H = (parseFloat(p3) || 0) * Math.PI / 180
    return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H))
  }
  // What browsers report for some computed colours: color(srgb r g b [/ a]).
  if ((m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(v))) return { r: +m[1], g: +m[2], b: +m[3] }
  // shadcn v3 stores HSL without the function: "222.2 84% 4.9%"
  if ((m = /^(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%$/.exec(v))) return hslToRgb(parseFloat(m[1]), m[2] / 100, m[3] / 100)
  if (v === 'white') return { r: 1, g: 1, b: 1 }
  if (v === 'black') return { r: 0, g: 0, b: 0 }
  return null
}

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map(c => Math.round(clamp(c) * 255).toString(16).padStart(2, '0')).join('')}`
}

export const hex = input => {
  const c = parseColor(input)
  return c && toHex(c)
}

export function mix(a, b, t) {
  const x = parseColor(a)
  const y = parseColor(b)
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}

const luminance = c => {
  const lin = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const { r, g, b } = parseColor(c)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
