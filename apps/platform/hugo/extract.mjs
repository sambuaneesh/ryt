// Theme -> design profile. A theme donates its style, never its structure (ADR 0010).
//
// 1. Build the theme with CANARY content: a fixed sample person and ryts whose titles,
//    categories and menu labels we know exactly.
// 2. Open the home, list and post pages in headless Chromium and find roles BY THAT TEXT:
//    the element holding a canary title is a post title, its container (holding no other
//    canary) is a card, text equal to a canary category is a label, the canary menu labels
//    are the navigation, the canary site title is the brand. Read their computed styles.
// 3. Map the measurements onto RYT's tokens. Fonts the theme ships are copied in.
// The profile is cached per theme commit and shared by everyone.

import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, siteOrigin } from '../config.mjs'
import { normalizePageData } from '../../../packages/contract/index.js'
import { hex, mix, contrast, resolveTheme, TOKEN_SCHEMA } from '../../../packages/kit/index.js'
import { slug as slugify } from '../site-source.mjs'
import { buildSite, siteOut } from './build.mjs'
import { detail } from './catalog.mjs'
import { withPage } from './browser.mjs'
import { canaryProbe, demoProbe } from './probe.mjs'
import { skinsCss } from './skins.mjs'

const ROOT = path.join(DATA_DIR, 'hugo')
const PROFILES = path.join(ROOT, 'profiles')
export const FONT_DIR = path.join(ROOT, 'fonts')
// Bump when extraction changes: cached profiles from older logic are measured again.
export const PROFILE_VERSION = 16

// ---------- canary content ----------

const CANARY_TITLES = ['Aurora Lighthouse Novel', 'Copper Meadow Game', 'Velvet Harbor Film', 'Quartz Lantern Album', 'Saffron Orbit Podcast', 'Indigo Willow Cafe']
const CANARY_CATEGORIES = ['Read', 'Play', 'Watch', 'Listen', 'Listen', 'Eat']

export const canaryData = () => normalizePageData({
  owner: { handle: 'canary', name: 'Canary Person', bio: 'Tries everything once and writes it down.', profileUrl: 'http://canary.invalid/@canary' },
  links: { send: 'http://canary.invalid/@canary/send' },
  recs: CANARY_TITLES.map((title, i) => ({
    id: `c${i}`,
    title,
    url: 'https://example.com/canary-link',
    category: CANARY_CATEGORIES[i],
    tags: ['canarytag'],
    pitch: 'You will like the way it feels.',
    review: 'Quietly brilliant, and the ending stays with you for days. Highly recommended for slow evenings.',
    status: 'tried',
    rating: 9 - (i % 3),
    date: `2026-0${(i % 9) + 1}-1${i}`,
    from: { name: 'Canary Friend', handle: 'friend', profileUrl: 'http://canary.invalid/@friend' },
  })),
  recommendedByMe: [{ title: 'Marble Comet Series', to: { name: 'Canary Friend', handle: 'friend', profileUrl: 'http://canary.invalid/@friend' }, status: 'tried', rating: 8 }],
})

// ---------- measurement -> tokens ----------

const firstFamily = stack => stack?.split(',')[0]?.trim().replace(/^["']|["']$/g, '')
// A theme's font stack, always ending in a generic family so a font that doesn't load
// degrades to the right kind of font instead of the browser's serif default.
const GENERIC = /(^|,)\s*(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded)\s*$/i
const cleanStack = stack => {
  let s = String(stack ?? '').replace(/\s+/g, ' ').trim()
  if (!s || !/^[\w\s"',.-]{1,160}$/.test(s)) return null
  if (!GENERIC.test(s)) s += /mono|code|courier|consol/i.test(s) ? ', monospace' : /serif|georgia|times|garamond|lora|merriweather|playfair|baskerville/i.test(s) && !/sans/i.test(s) ? ', serif' : ', sans-serif'
  return s
}
const px = v => Math.round(Number.parseFloat(v) || 0)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Contrast floors: every colour must be readable where RYT uses it, else it's nudged
// toward the text colour (keeps the hue, gains legibility). Applies to every tier.
function readableColors(t) {
  const floor = (key, against, min) => {
    if (!t[key] || !t[against]) return
    for (let i = 1; i <= 10 && contrast(t[key], t[against]) < min; i++) t[key] = mix(t[key], t['color.text'], i / 10)
  }
  floor('color.muted', 'color.surface', 3.2)
  floor('color.muted', 'color.bg', 3.2)
  // RYT's defaults stand in for colours the theme didn't give, so they're checked too.
  t['color.accent'] ??= TOKEN_SCHEMA['color.accent'].default
  floor('color.accent', 'color.bg', 3)
  floor('color.accent', 'color.surface', 3)
  t['color.rating'] ??= TOKEN_SCHEMA['color.rating'].default
  floor('color.rating', 'color.surface', 3.5)
  floor('color.rating', 'color.bg', 3.5)
  return t
}

function tokensFrom(m) {
  const t = {}
  const page = m.home?.page ?? m.list?.page
  // The home feed is the theme's showcase; section pages are often compact archives.
  const cards = [m.home, m.list].find(x => x?.card && x.titleCount >= 2) ?? m.home ?? m.list
  const post = m.post
  const text = hex(page?.color) ?? '#111111'
  // A coloured body the theme's text can't sit on is a frame around a content panel: the
  // panel is the page RYT draws (Castanet's light column on a blue/orange body).
  const bodyBg = hex(page?.bg) ?? '#ffffff'
  const panel = hex(page?.contentBg)
  const bg = panel && contrast(text, bodyBg) < 3 && contrast(text, panel) >= 4.5 ? panel : bodyBg
  t['color.bg'] = bg
  t['color.text'] = contrast(text, bg) >= 4.5 ? text : (contrast('#111111', bg) > contrast('#f5f5f5', bg) ? '#111111' : '#f5f5f5')
  const card = cards?.card
  t['card.style'] = card?.boxed ? 'card' : 'plain'
  t['color.surface'] = card?.boxed && card.differs ? hex(card.bg) : bg
  t['color.border'] = card?.boxed && card.border > 0 ? hex(card.borderColor) : mix(t['color.text'], bg, 0.86)
  const meta = hex(cards?.meta?.color)
  t['color.muted'] = meta && meta !== t['color.text'] && contrast(meta, bg) >= 3 ? meta : mix(t['color.text'], bg, 0.4)
  // Accent: the theme's link colour in running text, else its buttons, labels or headings.
  const candidates = [post?.link?.color, cards?.chip && cards.chip.bg !== cards.chip.parentBg ? cards.chip.bg : cards?.chip?.color, post?.button?.bg, cards?.heading?.color, m.home?.nav?.color]
    .map(hex).filter(c => c && c !== t['color.text'] && c !== bg && contrast(c, bg) >= 2.5)
  if (candidates[0]) t['color.accent'] = candidates[0]
  if (candidates[0]) t['color.rating'] = candidates[0]

  if (cleanStack(page?.font)) t['font.body'] = cleanStack(page.font)
  const heading = cards?.heading ?? post?.heading
  if (cleanStack(heading?.font)) t['font.heading'] = cleanStack(heading.font)
  if (page?.size) t['text.size'] = clamp(px(page.size), 13, 21)
  if (heading?.weight) t['heading.weight'] = clamp(Math.round(Number(heading.weight) / 100) * 100, 300, 900)
  t['heading.case'] = heading?.transform === 'uppercase' ? 'uppercase' : 'none'
  const tracking = heading ? (Number.parseFloat(heading.tracking) || 0) / (heading.size || 16) : 0
  t['heading.tracking'] = tracking > 0.03 ? 'wide' : tracking < -0.01 ? 'tight' : 'normal'
  t['nav.case'] = m.home?.nav?.transform === 'uppercase' ? 'uppercase' : 'none'

  if (card?.boxed) {
    t.radius = clamp(px(card.radius), 0, 32)
    t['border.width'] = clamp(px(card.border), 0, 6)
    const shadow = card.shadow && card.shadow !== 'none' ? card.shadow : null
    t.shadow = !shadow ? 'none' : /(\d+(\.\d+)?px\s+){2}0px/.test(shadow) && !/rgba?\([^)]*,\s*0(\.0+)?\)/.test(shadow) ? 'hard' : 'soft'
    t.density = card.padding < 12 ? 'compact' : card.padding < 26 ? 'cozy' : 'airy'
  } else {
    t.radius = clamp(px(cards?.cover?.radius ?? 4), 0, 32)
    t['border.width'] = 1
    t.shadow = 'none'
    t.density = (cards?.gap ?? 24) < 18 ? 'compact' : (cards?.gap ?? 24) < 40 ? 'cozy' : 'airy'
  }
  t.layout = (cards?.columns ?? 1) >= 2 ? 'grid' : 'list'
  t['card.cover'] = !cards?.cover ? 'none' : cards.cover.side ? 'side' : 'top'
  const chip = cards?.chip
  t['chip.style'] = !chip ? 'text' : chip.bg !== chip.parentBg ? 'filled' : chip.border > 0 ? 'outlined' : 'text'
  if (cards?.contentWidth) t['page.width'] = clamp(Math.round(cards.contentWidth / 10) * 10 + 32, 560, 1280)

  const header = m.home?.header
  if (m.home?.banner) {
    t['header.style'] = 'banner'
  } else if (header?.differs) {
    t['header.style'] = 'bar'
    t['color.header'] = hex(header.bg)
    t['color.headerText'] = hex(header.text) && contrast(hex(header.text), hex(header.bg)) >= 3 ? hex(header.text) : (contrast('#ffffff', hex(header.bg)) > 4 ? '#ffffff' : '#111111')
  } else {
    t['header.style'] = header?.borderBottom > 0 ? 'underline' : 'plain'
  }
  t['header.align'] = m.home?.brand?.center ? 'center' : 'left'
  // Layout archetype: sidebar themes keep a sidebar; profile-led themes centre the profile.
  t.frame = m.home?.frame === 'sidebar' ? 'sidebar' : 'top'
  t['hero.style'] = m.home?.heroCentered ? 'centered' : 'plain'
  t['hero.avatar'] = m.home?.avatar ? 'yes' : 'no'
  if (t.frame === 'sidebar' && cards?.contentWidth) t['page.width'] = clamp(Math.round((cards.contentWidth + 320) / 10) * 10, 900, 1400)
  readableColors(t)
  // Keep only what RYT's schema accepts (anything else falls back to the inherited value).
  const { tokens, warnings } = resolveTheme([{ name: 'measured', tokens: Object.fromEntries(Object.entries(t).filter(([, v]) => v != null)) }])
  return { tokens: Object.fromEntries(Object.keys(t).filter(k => k in tokens && t[k] != null).map(k => [k, tokens[k]])), warnings }
}

// Theme fonts: copy the files the @font-face rules point at (from the built site) into RYT's
// font store, and rewrite the rules to load from there. Google Fonts links become @imports.
function copyFonts(key, measured, buildDir, origin) {
  const dest = path.join(FONT_DIR, key.replace(/[^\w.-]/g, '_'))
  const faces = []
  for (const face of measured.home?.fontFaces ?? []) {
    const css = face.css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (whole, ref) => {
      try {
        const url = new URL(ref, face.base)
        if (url.origin !== origin) return /^https:\/\/fonts\.gstatic\.com\//.test(url.href) ? `url("${url.href}")` : 'url("")'
        const file = path.join(buildDir, decodeURIComponent(url.pathname))
        if (!file.startsWith(buildDir) || !fs.existsSync(file)) return 'url("")'
        fs.mkdirSync(dest, { recursive: true })
        const name = path.basename(file)
        fs.copyFileSync(file, path.join(dest, name))
        return `url("/assets/fonts/${path.basename(dest)}/${encodeURIComponent(name)}")`
      } catch {
        return 'url("")'
      }
    })
    if (/url\("\/assets\/fonts\/|url\("https:\/\/fonts\.gstatic/.test(css)) faces.push(css)
  }
  return { fontFaces: faces.join('\n') }
}

// Google Fonts stylesheets the theme links, as @imports, kept only if they actually load.
// Themes often write css2 weights with commas (wght@400,700), which Google rejects with a
// 400 and the theme silently falls back; the separator css2 wants is ';'.
async function fontImports(hrefs) {
  const out = []
  for (const href of new Set(hrefs ?? [])) {
    if (!/^https:\/\/fonts\.googleapis\.com\/css2?\?/.test(href)) continue
    const fixed = href.replace(/(family=[^&:]+:(?:wght|ital|opsz|wdth)@)([\d.,]+)(?=&|$)/g, (m, axis, values) => axis + values.split(',').join(';'))
    for (const url of new Set([href, fixed])) {
      const ok = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.ok, () => false)
      if (ok) {
        out.push(`@import url("${url}");`)
        break
      }
    }
  }
  return out.join('\n')
}

// Each role's skin from the page where it shows best: feed roles from home (or the list),
// the section heading from the list, title/quote/links/buttons from the post.
function mergeSkins(m) {
  const order = { sectionHeading: ['list', 'home'], pageTitle: ['post'], quote: ['post', 'home'], link: ['post', 'home', 'list'], button: ['post', 'home', 'list'] }
  const skins = {}
  const roles = new Set(['home', 'list', 'post'].flatMap(p => Object.keys(m[p]?.skins ?? {})))
  for (const role of roles) {
    const feed = m.home?.titleCount >= 2 ? ['home', 'list', 'post'] : ['list', 'home', 'post']
    for (const pageName of order[role] ?? feed) {
      const skin = m[pageName]?.skins?.[role]
      if (skin) { skins[role] = skin; break }
    }
  }
  return skins
}

// Dark variant: the theme measured again with prefers-color-scheme: dark. Kept only when the
// theme really changes (its background flips).
const lum = h => { const n = parseInt(String(h ?? '#ffffff').slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 255000 }

// Whether the theme's gallery screenshot shows a dark page (its most common colour is dark).
async function advertisesDark(slug) {
  try {
    const info = await detail(slug)
    if (!info.screenshot) return false
    const colors = await withPage(async page => {
      await page.goto(info.screenshot)
      return page.eval(PALETTE_PROBE)
    })
    const [r, g, b] = colors[0][0]
    return (r * 299 + g * 587 + b * 114) / 255000 < 0.35
  } catch {
    return false
  }
}

function darkTokens(light, darkMeasure) {
  if (!darkMeasure?.page) return null
  const lightBg = hex(light['color.bg'])
  const { tokens } = tokensFrom({ home: darkMeasure })
  if (!tokens['color.bg'] || Math.abs(lum(tokens['color.bg']) - lum(lightBg)) < 0.35) return null
  return Object.fromEntries(Object.entries(tokens).filter(([k]) => k.startsWith('color.')))
}

const cachePath = key => path.join(PROFILES, `${key.replace(/[^\w.@-]/g, '_')}.json`)

export function cachedProfile(key) {
  const file = cachePath(key)
  if (!fs.existsSync(file)) return null
  const profile = JSON.parse(fs.readFileSync(file, 'utf8'))
  return profile.version === PROFILE_VERSION ? profile : null
}

// Tier 1: build the theme with canary content and measure it precisely.
async function fromCanaryBuild(slug, onProgress) {
  const data = canaryData()
  const user = { handle: `style-${slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40)}`, theme: { site: { slug, params: {}, css: '' } } }
  const build = await buildSite(user, data, { onProgress, requirePosts: false })
  const cached = cachedProfile(build.key)
  if (cached) {
    fs.rmSync(build.out, { recursive: true, force: true })
    return cached
  }
  onProgress('measure', 'Measuring its colours, type and shapes')
  const origin = siteOrigin(build.id)
  const canary = { titles: CANARY_TITLES, categories: [...new Set(CANARY_CATEGORIES)], menu: 'Ryts I sent', brand: `${data.owner.name}'s ryts`,
    sectionTitle: 'Ryts', summary: 'Quietly brilliant', pitch: 'You will like the way it feels' }
  const PAGES = [['home', '/'], ['list', `/${build.section}/`], ['post', `/${build.section}/${slugify(CANARY_TITLES[0])}/`]]
  const measurePages = (scheme, pages) => withPage(async page => {
    const out = {}
    await page.scheme(scheme)
    for (const [name, url] of pages) {
      try {
        await page.goto(`${origin}${url}`)
        out[name] = await page.eval(canaryProbe(canary))
      } catch (e) {
        out[name] = { error: e.message }
      }
    }
    return out
  })
  let measured = await measurePages('light', PAGES)
  measured.dark = (await measurePages('dark', PAGES.slice(0, 1)).catch(() => ({}))).home
  // A theme whose stylesheet didn't build renders in the browser's default font: that's not
  // its style, so don't pretend it is.
  const unstyled = /^"?times new roman"?$/i.test(firstFamily(measured.home?.page?.font ?? '') ?? '')
  if (unstyled || [measured.home, measured.list].every(x => !x || x.error)) {
    fs.rmSync(build.out, { recursive: true, force: true })
    throw new Error('Not compatible: the theme’s stylesheet didn’t build, so its design can’t be measured')
  }
  let { tokens } = tokensFrom(measured)
  let dark = darkTokens(tokens, measured.dark)
  // Light or dark by default: whichever the theme advertises in its gallery screenshot. A
  // dark default is measured in full (skins too), so no light-mode colour is left behind.
  if (dark && lum(tokens['color.bg']) > 0.5 && await advertisesDark(slug)) {
    const darkPages = await measurePages('dark', PAGES.slice(1)).catch(() => ({}))
    measured = { home: measured.dark, ...darkPages, light: measured }
    tokens = tokensFrom(measured).tokens
    dark = null
  }
  const fonts = { ...copyFonts(build.key, measured, siteOut(build.id), origin), css: await fontImports(measured.home?.googleFonts) }
  const assets = path.join(FONT_DIR, build.key.replace(/[^\w.-]/g, '_'))
  // Background images and the like, copied from the built site into RYT's asset store.
  const copyUrl = ref => {
    if (/^data:image\//.test(ref) && ref.length < 20000) return ref
    try {
      const url = new URL(ref, origin)
      if (url.origin !== origin) return null
      const file = path.join(siteOut(build.id), decodeURIComponent(url.pathname))
      if (!file.startsWith(siteOut(build.id)) || !fs.existsSync(file) || fs.statSync(file).size > 600_000) return null
      fs.mkdirSync(assets, { recursive: true })
      fs.copyFileSync(file, path.join(assets, path.basename(file)))
      return `/assets/fonts/${path.basename(assets)}/${encodeURIComponent(path.basename(file))}`
    } catch {
      return null
    }
  }
  const character = skinsCss(mergeSkins(measured), tokens, { copyUrl })
  const profile = {
    version: PROFILE_VERSION,
    key: build.key,
    slug,
    method: 'canary',
    layer: { tokens, fontFaces: fonts.fontFaces, css: [fonts.css, character].filter(Boolean).join('\n'), dark },
    measured,
    measuredAt: new Date().toISOString(),
  }
  fs.mkdirSync(PROFILES, { recursive: true })
  fs.writeFileSync(cachePath(build.key), JSON.stringify(profile, null, 2))
  fs.rmSync(build.out, { recursive: true, force: true })
  return profile
}

// ---------- tier 2: the theme's live demo (no build needed) ----------

// Demo fonts live on someone else's server: download them once into RYT's font store.
const URL_REF = /url\(\s*["']?([^"')]+)["']?\s*\)/g
async function downloadFonts(key, faces) {
  const dest = path.join(FONT_DIR, key.replace(/[^\w.-]/g, '_'))
  const out = []
  let budget = 8
  // The budget goes to faces that draw Latin text first; script subsets (cyrillic,
  // vietnamese…) come after, so they can't use it up.
  const coversLatin = css => {
    const range = /unicode-range:\s*([^;}]+)/i.exec(css)?.[1]
    if (!range) return true
    return range.split(',').some(r => {
      const [lo, hi = lo] = r.trim().replace(/^U\+/i, '').split('-').map(x => parseInt(x.replace(/\?/g, '0'), 16))
      return lo <= 0x41 && 0x41 <= hi
    })
  }
  const ordered = [...faces.filter(f => coversLatin(f.css)), ...faces.filter(f => !coversLatin(f.css))]
  for (const face of ordered) {
    const replacements = new Map()
    for (const [, ref] of face.css.matchAll(URL_REF)) {
      let replacement = 'url("")'
      try {
        const url = new URL(ref, face.base)
        if (/^https:\/\/fonts\.gstatic\.com\//.test(url.href)) replacement = `url("${url.href}")`
        else if (budget-- > 0 && /\.(woff2?|ttf|otf)$/i.test(url.pathname)) {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
          const buf = Buffer.from(await res.arrayBuffer())
          if (res.ok && buf.length < 2 * 1024 * 1024) {
            fs.mkdirSync(dest, { recursive: true })
            const name = path.basename(url.pathname)
            fs.writeFileSync(path.join(dest, name), buf)
            replacement = `url("/assets/fonts/${path.basename(dest)}/${encodeURIComponent(name)}")`
          }
        }
      } catch {}
      replacements.set(ref, replacement)
    }
    const css = face.css.replace(URL_REF, (whole, ref) => replacements.get(ref) ?? 'url("")')
    if (/url\("\/assets\/fonts\/|url\("https:\/\/fonts\.gstatic/.test(css)) out.push(css)
  }
  return out.join('\n')
}

async function fromDemo(slug, info) {
  const measured = await withPage(async page => {
    await page.goto(info.demo)
    const home = await page.eval(demoProbe())
    let dark = null
    try {
      await page.scheme('dark')
      await page.goto(info.demo)
      dark = await page.eval(demoProbe())
    } catch {}
    return { home, dark }
  }, { width: 1280, height: 900 })
  if (!measured.home?.page) throw new Error('demo site did not load')
  const { tokens } = tokensFrom(measured)
  const key = `${slug}@demo`
  const fontFaces = await downloadFonts(key, measured.home.fontFaces ?? [])
  const imports = await fontImports(measured.home.googleFonts)
  // Demo images live on someone else's site; only inline (data:) ones come along.
  const character = skinsCss(measured.home.skins, tokens, { copyUrl: ref => (/^data:image\//.test(ref) && ref.length < 20000 ? ref : null) })
  return { version: PROFILE_VERSION, key, slug, method: 'demo', layer: { tokens, fontFaces, css: [imports, character].filter(Boolean).join('\n'), dark: darkTokens(tokens, measured.dark) }, measured, measuredAt: new Date().toISOString() }
}

// ---------- tier 3: colours from the showcase screenshot ----------

const PALETTE_PROBE = `(() => new Promise(resolve => {
  const img = document.querySelector('img')
  const go = () => {
    const c = document.createElement('canvas')
    const w = c.width = Math.min(400, img.naturalWidth), h = c.height = Math.round(w * img.naturalHeight / img.naturalWidth)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    const counts = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const key = [data[i], data[i + 1], data[i + 2]].map(v => v >> 3 << 3).join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    resolve([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => [k.split(',').map(Number), n]))
  }
  img.complete ? go() : img.onload = go
}))()`

async function fromScreenshot(slug, info) {
  if (!info.screenshot) throw new Error('no screenshot to read colours from')
  const colors = await withPage(async page => {
    await page.goto(info.screenshot)
    return page.eval(PALETTE_PROBE)
  })
  const toHex = ([r, g, b]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
  const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0 }
  const bg = toHex(colors[0][0])
  const text = colors.map(c => toHex(c[0])).find(c => contrast(c, bg) >= 4.5) ?? (contrast('#111111', bg) > contrast('#f5f5f5', bg) ? '#111111' : '#f5f5f5')
  const accent = colors.filter(c => sat(c[0]) > 0.35).map(c => toHex(c[0])).find(c => contrast(c, bg) >= 2.5)
  const tokens = readableColors({ 'color.bg': bg, 'color.surface': bg, 'color.text': text, 'color.muted': mix(text, bg, 0.4), 'color.border': mix(text, bg, 0.85), ...(accent ? { 'color.accent': accent, 'color.rating': accent } : {}), 'card.style': 'plain' })
  return { version: PROFILE_VERSION, key: `${slug}@screenshot`, slug, method: 'screenshot', layer: { tokens, fontFaces: '', css: '' }, measuredAt: new Date().toISOString() }
}

// ---------- entry point ----------

// Measure a catalog theme, as precisely as it allows: canary build -> live demo -> screenshot.
// Returns { key, method, layer: { tokens, fontFaces, css } }. Every tier's result is cached.
export async function extractProfile(slug, { onProgress = () => {} } = {}) {
  let firstError
  try {
    return await fromCanaryBuild(slug, onProgress)
  } catch (e) {
    firstError = e
  }
  for (const [tier, label, run] of [['demo', 'Measuring its demo site instead', fromDemo], ['screenshot', 'Reading colours from its screenshot', fromScreenshot]]) {
    const cached = cachedProfile(`${slug}@${tier}`)
    if (cached) return cached
    try {
      onProgress('measure', label)
      const info = await detail(slug)
      if (tier === 'demo' && !info.demo) continue
      const profile = await run(slug, info)
      fs.mkdirSync(PROFILES, { recursive: true })
      fs.writeFileSync(cachePath(profile.key), JSON.stringify(profile, null, 2))
      return profile
    } catch {}
  }
  throw firstError
}

// The best cached profile for a catalog slug, without measuring (for previews).
export function profileForSlug(slug) {
  const metaFile = path.join(ROOT, 'themes.json')
  const key = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8'))[slug]?.key : null
  return (key && cachedProfile(key)) || cachedProfile(`${slug}@demo`) || cachedProfile(`${slug}@screenshot`)
}
