// Captured skins -> CSS on RYT's own elements. This is where a theme's character transfers:
// its card box, title and link styles (with hover), label shapes, heading decorations
// (::before/::after), quote style, header and footer treatment, page background.
//
// Per role, only visual properties transfer (never layout). Colours and fonts that match the
// theme's tokens become var(--ryt-...), so Customize and dark mode keep working on top.

import { hex, mix, contrast } from '../../../packages/kit/index.js'

const ALL = null
const PAD = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
const BOX = ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'box-shadow']

// role -> where it goes in RYT, and what may come along
export const ROLES = {
  card: { sel: 'article[data-ryt="rec-card"]', only: [...BOX, 'transition', 'backdrop-filter'] },
  cardTitle: { sel: '[data-ryt="rec-card"] [data-ryt="title"]', drop: [...PAD, 'background-color', 'background-image'], maxFont: 34 },
  titleLink: { sel: '[data-ryt="rec-card"] [data-ryt="title"] a', drop: [...PAD, 'font-size', 'line-height'] },
  chip: { sel: '[data-ryt="category"], [data-ryt="tags"] li', drop: ['font-size'] },
  meta: { sel: '[data-ryt="credit"], [data-ryt="eyebrow"]', drop: [...PAD, ...BOX] },
  summary: { sel: '[data-ryt="review"]', drop: [...PAD, ...BOX], maxFont: 20 },
  quote: { sel: '[data-ryt="pitch"]', maxFont: 20 },
  brand: { sel: '[data-ryt="brand"]', drop: PAD, maxFont: 40 },
  navLink: { sel: '[data-ryt="nav"] a', maxFont: 20 },
  header: { sel: '[data-ryt="header"]', only: ['background-image', 'background-size', 'background-position', 'background-repeat', 'border-top', 'border-bottom', 'box-shadow'] },
  sectionHeading: { sel: '[data-ryt="section"] > h2', drop: ['font-size', ...PAD, 'background-color', 'background-image'] },
  pageTitle: { sel: '[data-ryt="hero"] h1', drop: [...PAD, ...BOX], maxFont: 56 },
  link: { sel: '[data-ryt="credit"] a, [data-ryt="review"] a, [data-ryt="bio"] a', drop: [...PAD, 'font-size', 'font-family', 'line-height'] },
  button: { sel: '[data-ryt="button"]', drop: ['font-size'] },
  footer: { sel: '[data-ryt="footer"]', only: ['color', 'background-color', 'background-image', 'border-top', 'text-transform', 'letter-spacing', 'font-style'] },
  body: { sel: 'body', only: ['background-image', 'background-size', 'background-position', 'background-repeat'] },
  cover: { sel: '[data-ryt="cover"]', only: ['border-radius', 'box-shadow', 'filter', 'border-top', 'border-right', 'border-bottom', 'border-left'] },
}

const HOVER_OK = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-(color|width|style))?|box-shadow|text-decoration(-(line|color|style|thickness))?|text-underline-offset|transform|opacity|filter|letter-spacing|text-shadow|outline(-color)?)$/
const UNSAFE = /[{}<>;\\]|expression\(|javascript:|@import/i
const VAR = { 'color.bg': '--ryt-bg', 'color.surface': '--ryt-surface', 'color.text': '--ryt-text', 'color.muted': '--ryt-muted', 'color.border': '--ryt-border', 'color.accent': '--ryt-accent', 'color.header': '--ryt-header-bg', 'color.headerText': '--ryt-header-text' }
const alphaOf = c => { const a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(c)?.[1]; return a === undefined ? 1 : Number(a) }
const normFont = f => String(f ?? '').toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim()

function transform(prop, value, tokens, copyUrl) {
  if (!value || UNSAFE.test(value)) return null
  let v = value
  // Theme colours become variables (so a later colour change, or dark mode, applies here too).
  // A translucent theme colour stays translucent: color-mix() over the variable.
  v = v.replace(/rgba?\([^)]*\)/g, c => {
    const a = alphaOf(c)
    if (a === 0) return c
    const h = hex(c)
    const key = Object.keys(VAR).find(k => tokens[k] && tokens[k].toLowerCase() === h)
    if (!key) return c
    return a < 1 ? `color-mix(in srgb, var(${VAR[key]}) ${Math.round(a * 100)}%, transparent)` : `var(${VAR[key]})`
  })
  if (prop === 'font-family') {
    if (normFont(v) === normFont(tokens['font.heading'])) return 'var(--ryt-font-heading)'
    if (normFont(v) === normFont(tokens['font.body'])) return 'var(--ryt-font-body)'
    if (!/^[\w\s"',.-]{1,200}$/.test(v)) return null
  }
  if (/url\(/.test(v)) {
    // The canary's own sample pictures (banner, avatar, covers) aren't the theme's design.
    if (/ryt-(banner|avatar)|\/cover(_\w+)?\.(png|webp|jpe?g)/.test(v)) return null
    let ok = true
    v = v.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (m, ref) => {
      const copied = copyUrl?.(ref)
      if (!copied) ok = false
      return `url("${copied}")`
    })
    if (!ok) return null
  }
  return v
}

const allowed = (role, prop) => {
  const cfg = ROLES[role]
  if (cfg.only) return cfg.only.includes(prop)
  return !(cfg.drop ?? []).includes(prop)
}

function capFont(role, prop, value) {
  const max = ROLES[role].maxFont
  if (prop !== 'font-size' || !max) return value
  const px = parseFloat(value)
  return Number.isFinite(px) && px > max ? `${max}px` : value
}

// Text colour that would be unreadable on RYT's background (e.g. white menu text that sat on
// the theme's photo banner) doesn't transfer.
const TEXT_ROLES = new Set(['brand', 'navLink', 'meta', 'summary', 'cardTitle', 'titleLink', 'sectionHeading', 'pageTitle', 'link', 'footer', 'chip', 'quote'])
const IN_HEADER = new Set(['brand', 'navLink'])
const IN_CARD = new Set(['cardTitle', 'titleLink', 'summary', 'meta', 'chip', 'quote', 'link'])
const resolveVar = (value, tokens) => value.replace(/var\((--ryt-[\w-]+)\)/g, (m, v) => tokens[Object.keys(VAR).find(k => VAR[k] === v)] ?? m)
// The colour a reader sees: translucent colours (raw rgba or our color-mix) blended over bg.
function seen(value, bg, tokens) {
  const v = resolveVar(value, tokens)
  const mixed = /color-mix\(in srgb,\s*(\S+)\s+([\d.]+)%,\s*transparent\)/.exec(v)
  if (mixed) return hex(mixed[1]) && mix(bg, hex(mixed[1]), mixed[2] / 100)
  const c = hex(v)
  return c && mix(bg, c, alphaOf(v))
}
// Where a role's text sits in RYT: the card surface and the page for text inside ryts, the
// header bar for brand and nav, else the page. A translucent own background (a 12% tint) is
// blended over each of those; an opaque one replaces them.
function groundsOf(role, ownBg, tokens) {
  const base = (IN_CARD.has(role) ? [tokens['color.surface'], tokens['color.bg']] : IN_HEADER.has(role) && tokens['color.header'] ? [tokens['color.header']] : [tokens['color.bg']]).filter(Boolean)
  if (!ownBg) return base
  const blended = base.map(bg => seen(ownBg, bg, tokens)).filter(Boolean)
  return blended.length ? [...new Set(blended)] : base
}

// What the text will actually sit on in RYT: its own background if the theme gives it one,
// else the card surface (for text inside ryts) or the page.
function readable(role, color, ownBg, tokens) {
  if (!TEXT_ROLES.has(role)) return true
  // Ryt text appears both on cards and in plain rows on the page, so it must read on both.
  const grounds = groundsOf(role, ownBg, tokens)
  return grounds.filter(Boolean).every(bg => { const c = seen(color, bg, tokens); return !c || contrast(c, bg) >= 3 })
}

// A colour that's too faint keeps its hue but moves toward the text colour until it reads
// (Reimu's red titles stay red); one that can't be rescued doesn't transfer.
function legible(role, color, ownBg, tokens) {
  if (readable(role, color, ownBg, tokens)) return color
  const c = hex(resolveVar(color, tokens))
  const text = tokens['color.text']
  if (!c || !text || /color-mix|rgba/.test(color)) return null
  for (let i = 1; i <= 6; i++) {
    const nudged = mix(c, text, i / 10)
    if (readable(role, nudged, ownBg, tokens)) return nudged
  }
  return null
}

const CONTAINERS = new Set(['card', 'footer', 'quote'])
const GROUP = { card: 'ryt', cardTitle: 'ryt', titleLink: 'ryt' }
const skinPad = (skin, edge) => (skin.base ?? []).find(([p]) => p === `padding-${edge}`)?.[1]

// Pseudo content RYT can carry: empty, or a short string (a quote mark, a '>' prompt, a
// bullet). Angle brackets are escaped. null when it can't come along.
function pseudoContent(raw) {
  const v = String(raw).trim()
  if (/^(none|normal|)$/.test(v)) return null
  const m = /^"([^"\\{};]*)"$/.exec(v)
  if (!m || m[1].length > 2 || /[\uE000-\uF8FF]/.test(m[1])) return null
  return `"${m[1].replace(/</g, '\\3c ').replace(/>/g, '\\3e ')}"`
}

// A px line-height measured at the theme's font size, as a ratio: RYT sets its own sizes.
function ratio(lineHeight, fontSize) {
  const lh = parseFloat(lineHeight), fs = parseFloat(fontSize)
  return /px$/.test(lineHeight ?? '') && lh > 0 && fs > 0 ? String(+(lh / fs).toFixed(3)) : lineHeight
}

// Offsets of an absolutely placed decoration, kept only toward the nearest edge of its host:
// the theme's distances to the far edges describe the theme's layout, not the decoration.
function anchor(list, size) {
  const px = side => { const v = list.find(([p]) => p === side)?.[1]; return v && /px$/.test(v) ? parseFloat(v) : 0 }
  const clamp = v => `${Math.max(v, -12)}px`
  const out = {}
  const [top, bottom, left, right] = ['top', 'bottom', 'left', 'right'].map(px)
  if (Math.abs(bottom) < Math.abs(top)) out.bottom = clamp(bottom)
  else out.top = clamp(top)
  if (Math.abs(right) < Math.abs(left)) out.right = clamp(right)
  else out.left = clamp(left)
  return out
}

// skins: { role: { base: [[prop, value]], pseudo: { '::before': [[p, v]] }, hover: [[p, v]] } }
export function skinsCss(skins, tokens, { copyUrl } = {}) {
  const rules = []
  const seenPseudo = new Set()
  // Text roles first, so a container repeating a text role's decoration is recognised.
  // Text roles first (the title before its link and its card), so repeats are recognised.
  const rank = r => (r === 'cardTitle' ? 0 : CONTAINERS.has(r) ? 2 : 1)
  const order = Object.entries(skins ?? {}).sort(([a], [b]) => rank(a) - rank(b))
  for (const [role, skin] of order) {
    const cfg = ROLES[role]
    if (!cfg || !skin) continue
    const base = []
    const ownBg = (skin.base ?? []).find(([p]) => p === 'background-color')?.[1]
    const ownBgKept = ownBg && allowed(role, 'background-color') ? transform('background-color', ownBg, tokens, copyUrl) : null
    for (const [prop, value] of skin.base ?? []) {
      if (!allowed(role, prop)) continue
      const fontSize = (skin.base ?? []).find(([p]) => p === 'font-size')?.[1]
      const v = transform(prop, prop === 'line-height' ? ratio(value, fontSize) : capFont(role, prop, value), tokens, copyUrl)
      const kept = prop === 'color' ? legible(role, v, ownBgKept, tokens) : v
      if (!kept) continue
      base.push(`${prop}: ${kept}`)
    }
    // A role that brings its own background (a dark footer bar) brings readable text with it:
    // if the theme's text colour didn't transfer, use whichever palette colour reads best on it.
    const grounds = ownBgKept ? groundsOf(role, ownBgKept, tokens) : []
    const worst = (c) => Math.min(...grounds.map(g => contrast(c, g)))
    if (grounds.length && TEXT_ROLES.has(role) && allowed(role, 'color') && !base.some(d => d.startsWith('color:'))) {
      const best = ['color.text', 'color.bg', 'color.surface'].filter(k => tokens[k]).sort((a, b) => worst(tokens[b]) - worst(tokens[a]))[0]
      base.push(`color: ${best && worst(tokens[best]) >= 4.5 ? `var(${VAR[best]})` : worst('#ffffff') > worst('#111111') ? '#ffffff' : '#111111'}`)
    }
    let positioned = false
    for (const [ps, list] of Object.entries(skin.pseudo ?? {})) {
      if (role === 'body' || role === 'header') continue
      const get = p => list.find(([q]) => q === p)?.[1]
      // Decorations made of text that isn't ours (words, icons from the theme's icon font)
      // stay out, and so does any decoration whose content can't come along.
      const content = pseudoContent(get('content') ?? '')
      if (content === null) continue
      // One decoration per ryt part: a title link or card repeating the title's (the theme
      // styled one element, our probe saw it through several roles) is one too many.
      const sig = `${GROUP[role] ?? role}|${ps}|${JSON.stringify(list.filter(([p]) => !/^(font|line-height|letter|text-)/.test(p)))}`
      if (seenPseudo.has(sig)) continue
      seenPseudo.add(sig)
      const absolute = /^absolute$/.test(get('position') ?? '')
      const offsets = absolute ? anchor(list, skin.size) : {}
      const decls = [`content: ${content}`]
      for (const [prop, rawValue] of list) {
        if (prop === 'content' || ['top', 'right', 'bottom', 'left'].includes(prop)) continue
        // Decorations sized for the theme's wider layout (e.g. a rule under a heading) span
        // RYT's element instead of running past it.
        let value = rawValue
        const px = parseFloat(value)
        if (prop === 'width' && /px$/.test(value) && skin.size?.w && px >= skin.size.w * 0.9) value = '100%'
        if (prop === 'line-height') value = ratio(value, get('font-size'))
        const v = transform(prop, value, tokens, copyUrl)
        if (!v || (prop === 'position' && v === 'fixed')) continue
        decls.push(`${prop}: ${v}`)
      }
      for (const [side, v] of Object.entries(offsets)) decls.push(`${side}: ${v}`)
      if (absolute) positioned = true
      // A rule drawn along an edge needs room there (the theme's padding made it; RYT drops
      // padding on titles), or it runs through the text.
      for (const edge of ['bottom', 'top']) {
        if (!(edge in offsets) || base.some(d => d.startsWith(`padding-${edge}:`))) continue
        const room = Math.max(parseFloat(skinPad(skin, edge)) || 0, (parseFloat(get('height')) || 0) + Math.max(parseFloat(offsets[edge]), 0) + 4)
        if (room <= 24) base.push(`padding-${edge}: ${Math.round(room)}px`)
      }
      rules.push(`${cfg.sel.split(',').map(s => `${s.trim()}${ps}`).join(', ')} { ${decls.join('; ')} }`)
    }
    // Borders the theme doesn't draw are off (its captured styles list only the sides it has),
    // so RYT's own borders don't mix with the theme's into a three-sided box.
    const sides = ['border-top', 'border-right', 'border-bottom', 'border-left']
    if (sides.some(sd => allowed(role, sd)) && base.some(d => sides.some(sd => d.startsWith(`${sd}:`)))) {
      for (const sd of sides) if (allowed(role, sd) && !base.some(d => d.startsWith(`${sd}:`))) base.push(`${sd}: none`)
    }
    // Gradient text (background clipped to the glyphs): keep the clip, or the gradient would
    // fill the whole box; text-fill only travels with it, and solid fills are the theme's text colour.
    const clipped = base.some(d => /^background-clip: text/.test(d))
    for (let i = base.length - 1; i >= 0; i--) {
      if (/^-webkit-text-fill-color/.test(base[i]) && !clipped) base.splice(i, 1)
      else if (/^background-clip/.test(base[i]) && !clipped) base.splice(i, 1)
    }
    if (clipped) base.push('-webkit-background-clip: text', '-webkit-text-fill-color: transparent')
    // Background placement only matters when there is a background image.
    if (!base.some(d => d.startsWith('background-image'))) {
      for (let i = base.length - 1; i >= 0; i--) if (/^background-(size|position|repeat)/.test(base[i])) base.splice(i, 1)
    }
    if (positioned) base.push('position: relative')
    if (base.length) rules.unshift(`${cfg.sel} { ${base.join('; ')} }`)
    const hover = (skin.hover ?? []).filter(([prop]) => HOVER_OK.test(prop)).map(([prop, value]) => [prop, transform(prop, value, tokens, copyUrl)])
      .filter(([prop, v]) => v && (prop !== 'color' || readable(role, v, ownBgKept, tokens)))
    if (hover.length) rules.push(`${cfg.sel.split(',').map(s => `${s.trim()}:hover`).join(', ')} { ${hover.map(([p, v]) => `${p}: ${v}`).join('; ')} }`)
  }
  return rules.join('\n')
}
