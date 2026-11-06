// Theme QA: renders a person's page in each theme's measured design and reports defects.
// Needs the platform running. Usage: node scripts/qa/themes.mjs [handle] [N|slug,slug] [outDir]
//
// Per theme it measures what makes a migrated design look broken:
//   contrast   text with contrast < 3 against what's behind it
//   fonts      the theme's fonts that didn't load (falls back to something else)
//   overflow   horizontal scrolling
//   missing    brand / menu / name / ryt titles that aren't visible
//   huge       text larger than 64px
// and saves a screenshot, plus a side-by-side sheet with the theme's own screenshot.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { listAll, detail } from '../../apps/platform/hugo/catalog.mjs'
import { extractProfile } from '../../apps/platform/hugo/extract.mjs'
import { withPage } from '../../apps/platform/hugo/browser.mjs'

const [handle = 'aneesh', which = '24', outDir = '.data/qa'] = process.argv.slice(2)
const slugs = /^\d+$/.test(which) ? (await listAll()).slice(0, Number(which)).map(t => t.slug) : which.split(',')
fs.mkdirSync(outDir, { recursive: true })

const AUDIT = `(() => {
  // Any CSS colour (rgb, oklch, color(srgb …)…) -> [r, g, b, a], by letting a canvas paint it.
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  const parse = c => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return a ? [r, g, b, a / 255] : [0, 0, 0, 0] }
  // Text drawn with transparency: blend it over what's behind before measuring.
  const blend = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)) }
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b) }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) }
  const bgOf = el => { let rgb = [255, 255, 255]; const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e); for (const e of chain) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) { const a = c[3] ?? 1; rgb = rgb.map((v, i) => v * (1 - a) + c[i] * a) } } return rgb }
  const page = document.querySelector('[data-ryt=page]')
  const texts = [...page.querySelectorAll('[data-ryt] , [data-ryt] a, h1, h2, h3, p')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 0)
  // Text over a picture/gradient can't be measured, unless a solid fill sits in between.
  const onImage = e => { for (let x = e; x; x = x.parentElement) { const st = getComputedStyle(x); if (st.backgroundImage !== 'none') return true; if ((parse(st.backgroundColor)[3] ?? 0) >= 0.9) return false } return false }
  const lowContrast = texts.filter(e => !onImage(e) && contrast(blend(parse(getComputedStyle(e).color), bgOf(e)), bgOf(e)) < 3).map(e => (e.dataset.ryt || e.tagName) + ': ' + e.textContent.trim().slice(0, 24))
  const families = [...new Set(texts.map(e => getComputedStyle(e).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')))]
  const system = /^(system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace|ui-|arial|helvetica|times|georgia|courier|segoe ui|roboto$)/i
  // A family counts as loaded when at least one of its faces loaded (unused weights and
  // unicode subsets stay unloaded by design, which document.fonts.check() would count).
  const faces = [...document.fonts]
  const facesOf = f => faces.filter(x => x.family.replace(/^["']|["']$/g, '').toLowerCase() === f.toLowerCase())
  // Families with no @font-face are installed fonts asked for by name (Verdana): not a load.
  const unloaded = families.filter(f => !system.test(f) && facesOf(f).length && !facesOf(f).some(x => x.status === 'loaded'))
  const visible = sel => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (onImage(e) || contrast(parse(getComputedStyle(e).color), bgOf(e)) >= 2) }
  const missing = ['[data-ryt=brand]', '[data-ryt=nav] a', '[data-ryt=hero] h1', '[data-ryt=rec-card] [data-ryt=title]'].filter(s => !visible(s))
  const huge = texts.filter(e => parseFloat(getComputedStyle(e).fontSize) > 64).map(e => e.textContent.trim().slice(0, 20))
  // Text crushed into a sliver (a few letters per line, running down the page), including
  // text drawn by ::before/::after decorations.
  const squeezed = []
  for (const e of page.querySelectorAll('*')) {
    for (const ps of ['::before', '::after']) {
      const st = getComputedStyle(e, ps)
      const text = (st.content.match(/^"(.*)"$/) ?? [])[1] ?? ''
      if (text.trim().length >= 3 && st.position === 'absolute' && parseFloat(st.width) < parseFloat(st.fontSize) * 2) squeezed.push(ps + ' ' + text.slice(0, 16))
    }
  }
  for (const e of texts) { const r = e.getBoundingClientRect(), fs = parseFloat(getComputedStyle(e).fontSize); if (e.textContent.trim().length > 8 && r.width < fs * 3 && r.height > fs * 5) squeezed.push(e.textContent.trim().slice(0, 16)) }
  return { lowContrast: lowContrast.slice(0, 6), lowContrastCount: lowContrast.length, unloaded, overflow: document.documentElement.scrollWidth > innerWidth + 2, missing, huge, squeezed,
    attrs: { ...page.dataset }, bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 60) }
})()`

const report = []
for (const slug of slugs) {
  const row = { slug }
  try {
    const t0 = Date.now()
    const profile = await extractProfile(slug)
    row.method = profile.method
    row.extractMs = Date.now() - t0
    const shot = path.join(outDir, `${slug}.png`)
    Object.assign(row, await withPage(async page => {
      await page.goto(`http://localhost:4000/login?as=${handle}&next=${encodeURIComponent(`/@${handle}?design=${slug}`)}`)
      await new Promise(r => setTimeout(r, 400))
      const audit = await page.eval(AUDIT)
      await page.screenshot(shot)
      return audit
    }, { width: 1280, height: 860 }))
    const info = await detail(slug).catch(() => null)
    if (info?.screenshot) {
      const demo = path.join(outDir, `${slug}.demo.png`)
      if (!fs.existsSync(demo)) fs.writeFileSync(demo, Buffer.from(await (await fetch(info.screenshot)).arrayBuffer()))
      execFileSync('magick', [demo, '-resize', '560x376^', '-gravity', 'north', '-extent', '560x376', shot, '-resize', '560x376', '+append',
        '-background', 'white', '-gravity', 'north', '-splice', '0x20', '-pointsize', '14', '-annotate', '+0+2', `${slug} (${row.method}): demo | RYT`, path.join(outDir, `${slug}.pair.png`)])
    }
  } catch (e) {
    row.error = e.message.slice(0, 160)
  }
  const flags = [row.error && 'ERROR', row.lowContrastCount && `contrast×${row.lowContrastCount}`, row.unloaded?.length && `fonts:${row.unloaded.join('/')}`, row.overflow && 'overflow', row.missing?.length && `missing:${row.missing.join(' ')}`, row.huge?.length && 'huge', row.squeezed?.length && `squeezed:${row.squeezed[0]}`].filter(Boolean)
  row.flags = flags
  report.push(row)
  console.log(`${flags.length ? 'ISSUES' : 'clean '} ${slug.padEnd(30)} ${(row.method ?? '').padEnd(10)} ${flags.join('  ') || ''}${row.error ? ' ' + row.error : ''}`)
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
const clean = report.filter(r => !r.flags.length).length
console.log(`\n${clean}/${report.length} themes with no detected defects`)
process.exit(0)
