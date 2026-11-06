// Link previews for a static site. GitHub Pages can't build a preview when a link is shared, so
// after each build (and every hour, see .github/workflows/pages.yml) this writes, for every page:
//
//   dist/@<handle>/index.html        the app, with the person's name, line and picture as
//   dist/@<handle>/send/index.html   Open Graph / Twitter tags (what WhatsApp, X, Slack… show)
//   dist/og/<handle>.png             a 1200×630 card: their name, top picks, "Recommend me something"
//   dist/og/default.png              the same for the front page
//
// It reads only public data, with the public key. Run after `npm run build`:
//   SITE_URL=https://you.github.io/ryt/ node scripts/previews.mjs           (needs .env)
//   node scripts/previews.mjs --sample                                       (demo people, no database)

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Resvg } from '@resvg/resvg-js'

const DIST = path.resolve('dist')
const sample = process.argv.includes('--sample')
const env = Object.fromEntries((fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split('\n').map(l => /^(\w+)=(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2]]))
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY
const BASE = process.env.BASE_PATH || '/'
const SITE = (process.env.SITE_URL || `http://localhost:4000${BASE}`).replace(/\/?$/, '/')

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Build first: npm run build:web')
  process.exit(1)
}

// ------------------------------------------------------------------ data
const rest = async (table, query) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function loadPeople() {
  if (sample) {
    return [
      { handle: 'mira', name: 'Mira', bio: 'Night owl. Anime, sci-fi, and very strong coffee.', avatar_url: null,
        recs: [{ title: 'Mushishi', category: 'watch', rating: 10 }, { title: 'Disco Elysium', category: 'play', rating: 9 }, { title: 'Piranesi', category: 'read', rating: 9 }], tried: 3 },
      { handle: 'kai', name: 'Kai Okafor-Lindqvist', bio: 'Will walk 40 minutes for good biryani.', avatar_url: null,
        recs: [{ title: 'Biryani at Shah Ghouse, Tolichowki', category: 'eat', rating: 8 }, { title: 'In Rainbows', category: 'listen', rating: 10 }], tried: 2 },
      { handle: 'newbie', name: 'Sam', bio: '', avatar_url: null, recs: [], tried: 0 },
    ]
  }
  if (!SUPABASE_URL || !KEY) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are needed (or use --sample)')
  const people = []
  for (let from = 0; ; from += 1000) {
    const page = await rest('ryt_profiles', `select=id,handle,name,bio,avatar_url&order=created_at&offset=${from}&limit=1000`)
    people.push(...page)
    if (page.length < 1000) break
  }
  for (const p of people) {
    const recs = await rest('ryt_public_recs', `select=title,category,rating,status&owner_id=eq.${p.id}&limit=500`)
    p.tried = recs.filter(r => r.status === 'tried').length
    p.recs = recs.filter(r => r.status === 'tried' && r.rating).sort((a, b) => b.rating - a.rating).slice(0, 3)
  }
  return people
}

// ------------------------------------------------------------------ fonts
// The same faces as the site, fetched once from Google Fonts (TTF) into a cache.
const FONT_DIR = path.join(os.tmpdir(), 'ryt-og-fonts')
const FAMILIES = ['Archivo Black', 'Space Grotesk:wght@500;700', 'Space Mono:wght@700', 'Instrument Serif:ital@1', 'Bebas Neue', 'Silkscreen', 'Shrikhand']
async function fonts() {
  fs.mkdirSync(FONT_DIR, { recursive: true })
  const files = []
  for (const fam of FAMILIES) {
    try {
      // A plain user agent makes Google Fonts answer with TTF files (what resvg reads).
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam.replace(/ /g, '+')}`, { headers: { 'user-agent': 'Wget/1.21' } })).text()
      for (const [, url] of css.matchAll(/url\((https:[^)]+\.ttf)\)/g)) {
        const file = path.join(FONT_DIR, url.split('/').slice(-2).join('-'))
        if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()))
        files.push(file)
      }
    } catch (e) {
      console.warn(`font ${fam}: ${e.message} (falls back to system fonts)`)
    }
  }
  return files
}

// ------------------------------------------------------------------ the card
const KIND = {
  watch: { bg: '#ff4f9a', fg: '#131211', font: 'Bebas Neue', size: 40, upper: true, label: 'WATCH' },
  read: { bg: '#fbf8ee', fg: '#131211', font: 'Instrument Serif', size: 36, italic: true, label: 'READ', line: '#3157ff' },
  listen: { bg: '#8b5cf6', fg: '#ffffff', font: 'Space Mono', size: 26, upper: true, label: 'LISTEN' },
  play: { bg: '#1aa864', fg: '#131211', font: 'Silkscreen', size: 24, upper: true, label: 'PLAY' },
  eat: { bg: '#ffffff', fg: '#131211', font: 'Space Mono', size: 26, upper: true, label: 'EAT' },
  go: { bg: '#ffd23f', fg: '#131211', font: 'Shrikhand', size: 30, label: 'GO' },
  use: { bg: '#00a3a3', fg: '#ffffff', font: 'Archivo Black', size: 28, upper: true, label: 'USE' },
  other: { bg: '#00a3a3', fg: '#ffffff', font: 'Archivo Black', size: 28, upper: true, label: 'OTHER' },
}
const x = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
// Rough text fitting (resvg doesn't wrap): average glyph width as a share of the font size.
const fit = (text, size, width, ratio = 0.56) => {
  const max = Math.floor(width / (size * ratio))
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text
}

async function avatarData(url) {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/image\/(png|jpe?g)/.test(type)) return null
    return `data:${type.split(';')[0]};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

function ransom(px, py, s = 1) {
  return `<g transform="translate(${px} ${py}) scale(${s})">
  <g transform="rotate(-2)"><rect x="0" y="0" width="236" height="48" fill="#131211"/><text x="10" y="37" font-family="Archivo Black" font-size="31" fill="#f3efe4">Recommend</text></g>
  <g transform="translate(244 4) rotate(3)"><rect x="0" y="0" width="70" height="50" fill="#ff4f9a"/><text x="10" y="38" font-family="Instrument Serif" font-style="italic" font-size="42" fill="#131211">you</text></g>
  <g transform="translate(324 2) rotate(-1.5)"><rect x="0" y="0" width="78" height="50" fill="#ffd23f" stroke="#131211" stroke-width="3"/><text x="10" y="42" font-family="Bebas Neue" font-size="46" fill="#131211">THIS</text></g>
</g>`
}

function chip(rec, i) {
  const k = KIND[rec.category] ?? KIND.other
  const w = 330, h = 118, tilt = [-3, 2, -1.5][i] ?? 0
  const title = fit(k.upper ? rec.title.toUpperCase() : rec.title, k.size, w - 110, k.font === 'Space Mono' ? 0.62 : k.font === 'Bebas Neue' ? 0.42 : 0.56)
  return `<g transform="translate(${60 + i * 360} 440) rotate(${tilt} ${w / 2} ${h / 2})">
  <rect width="${w}" height="${h}" rx="8" fill="${k.bg}" stroke="#131211" stroke-width="3"/>
  ${k.line ? `<line x1="26" y1="0" x2="26" y2="${h}" stroke="#e2554f" stroke-width="2"/>` : ''}
  <text x="${k.line ? 40 : 22}" y="34" font-family="Space Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${k.line ?? k.fg}" opacity=".85">${k.label}</text>
  <text x="${k.line ? 40 : 22}" y="${34 + k.size + 16}" font-family="${k.font}" ${k.italic ? 'font-style="italic"' : ''} font-size="${k.size}" fill="${k.fg}">${x(title)}</text>
  <g transform="translate(${w - 46} ${h - 46}) rotate(10)"><circle r="34" fill="#ffd23f" stroke="#131211" stroke-width="3"/>
    <text y="10" text-anchor="middle" font-family="Archivo Black" font-size="28" fill="#131211">${rec.rating}</text></g>
</g>`
}

async function card(p) {
  const avatar = await avatarData(p.avatar_url)
  const name = fit(p.name.toUpperCase(), 84, 800, 0.78)
  const initial = x((p.name || '?').trim()[0]?.toUpperCase() ?? '?')
  const line = p.recs.length ? `@${p.handle} · tried ${p.tried} thing${p.tried === 1 ? '' : 's'}` : `@${p.handle}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f3efe4"/>
  ${ransom(60, 48, 0.9)}
  <text x="60" y="230" font-family="Archivo Black" font-size="84" fill="#131211">${x(name)}</text>
  <text x="62" y="282" font-family="Space Mono" font-weight="700" font-size="26" fill="#3f3b35">${x(line)}</text>
  ${p.recs.length ? '' : `<text x="62" y="330" font-family="Space Grotesk" font-weight="500" font-size="30" fill="#3f3b35">${x(fit(p.bio || 'What should I try next?', 30, 820))}</text>`}
  <g transform="translate(1010 196)">
    <circle r="112" fill="#3157ff" stroke="#131211" stroke-width="5"/>
    ${avatar ? `<clipPath id="a"><circle r="108"/></clipPath><image href="${avatar}" x="-108" y="-108" width="216" height="216" clip-path="url(#a)" preserveAspectRatio="xMidYMid slice"/>`
      : `<text y="38" text-anchor="middle" font-family="Archivo Black" font-size="110" fill="#f3efe4">${initial}</text>`}
  </g>
  ${p.recs.length ? p.recs.map(chip).join('') : `<g transform="translate(60 440)"><rect width="600" height="110" rx="55" fill="#131211"/>
    <text x="300" y="68" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="36" fill="#f3efe4">Recommend me something →</text></g>`}
</svg>`
}

function frontCard() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f3efe4"/>
  ${ransom(165, 170, 2.2)}
  <text x="600" y="420" text-anchor="middle" font-family="Space Grotesk" font-weight="500" font-size="38" fill="#131211">Friends recommend things to you.</text>
  <text x="600" y="470" text-anchor="middle" font-family="Space Grotesk" font-weight="500" font-size="38" fill="#131211">You try them and share what you think.</text>
</svg>`
}

// ------------------------------------------------------------------ pages
const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
const attr = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
function withMeta(html, { title, description, url, image }) {
  const tags = `<title>${attr(title)}</title>
  <meta name="description" content="${attr(description)}">
  <link rel="canonical" href="${attr(url)}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="Recommend You This">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:url" content="${attr(url)}">
  <meta property="og:image" content="${attr(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">`
  return html.replace(/<title>[\s\S]*?<\/title>\s*/, '').replace(/<meta name="description"[^>]*>\s*/, '').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  ${tags}`)
}
const png = (svg, fontFiles) => new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Space Grotesk' } }).render().asPng()

const fontFiles = await fonts()
const people = await loadPeople()
fs.mkdirSync(path.join(DIST, 'og'), { recursive: true })

// Front page (and the fallback every unknown address gets).
fs.writeFileSync(path.join(DIST, 'og', 'default.png'), png(frontCard(), fontFiles))
const front = { title: 'Recommend You This', description: 'Friends recommend things to you. You try them and share what you think.', url: SITE, image: `${SITE}og/default.png` }
for (const f of ['index.html', '404.html']) fs.writeFileSync(path.join(DIST, f), withMeta(template, front))

for (const p of people) {
  if (!/^[a-z0-9_]{2,24}$/.test(p.handle)) continue
  fs.writeFileSync(path.join(DIST, 'og', `${p.handle}.png`), png(await card(p), fontFiles))
  const top = p.recs[0]
  const page = {
    title: `${p.name} on Recommend You This`,
    description: top ? `Tried ${p.tried}. Top pick: ${top.title} (${top.rating}/10). Recommend ${p.name.split(' ')[0]} something.` : `Recommend ${p.name.split(' ')[0]} something to try.`,
    url: `${SITE}@${p.handle}`,
    image: `${SITE}og/${p.handle}.png?v=${Date.now().toString(36)}`,
  }
  const send = { ...page, title: `Recommend ${p.name} something`, description: `A film, a book, a game, a place. ${p.name.split(' ')[0]} will try it and share what they think.`, url: `${SITE}@${p.handle}/send` }
  fs.mkdirSync(path.join(DIST, `@${p.handle}`, 'send'), { recursive: true })
  fs.writeFileSync(path.join(DIST, `@${p.handle}`, 'index.html'), withMeta(template, page))
  fs.writeFileSync(path.join(DIST, `@${p.handle}`, 'send', 'index.html'), withMeta(template, send))
}
console.log(`previews: ${people.length} page${people.length === 1 ? '' : 's'}, site ${SITE}`)
