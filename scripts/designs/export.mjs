// Publishes the measured gallery designs as static files for the web app (ADR 0012):
//
//   web/public/designs/index.json        the catalog: slug, name, thumbnail link, tags, swatches
//   web/public/designs/<slug>.json       one design: { name, slug, method, layer }
//   web/public/designs/assets/<dir>/…    fonts and images those designs use
//
// Asset URLs are written as "{{assets}}/<dir>/<file>"; the app swaps in its own base URL, so
// the same files work on localhost, GitHub Pages or a custom domain.
//
//   node scripts/designs/export.mjs            export what's measured locally (.data/hugo)
//   node scripts/designs/export.mjs --measure  also measure themes that have no design yet
//                                              (Hugo + Chromium; what the weekly Action runs)
//
// Designs already published stay as they are unless a fresher local measurement exists, so
// a clean machine (CI) only measures themes that are new to the gallery.

import fs from 'node:fs'
import path from 'node:path'
import { listAll, tagMembers, TAGS } from '../../apps/platform/hugo/catalog.mjs'
import { profileForSlug, extractProfile, FONT_DIR } from '../../apps/platform/hugo/extract.mjs'

const OUT = path.resolve('web/public/designs')
const measure = process.argv.includes('--measure')

const all = await listAll()
const tagsOf = new Map()
for (const tag of TAGS) {
  try {
    for (const slug of await tagMembers(tag)) tagsOf.set(slug, [...(tagsOf.get(slug) ?? []), tag])
  } catch {}
}

fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true })
const published = slug => {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, `${slug}.json`), 'utf8'))
  } catch {
    return null
  }
}
const index = []
const assetDirs = new Set()
let missing = 0

for (const theme of all) {
  let profile = profileForSlug(theme.slug)
  const existing = profile ? null : published(theme.slug)
  if (!profile && !existing && measure) {
    try {
      profile = await extractProfile(theme.slug)
    } catch (e) {
      console.error(`skip ${theme.slug}: ${e.message}`)
    }
  }
  if (!profile?.layer && !existing) {
    missing++
    continue
  }
  const layer = existing ? existing.layer : JSON.parse(JSON.stringify(profile.layer).replace(/\/assets\/fonts\/([\w.@-]+)\//g, (m, dir) => {
    assetDirs.add(dir)
    return `{{assets}}/${dir}/`
  }))
  const t = layer.tokens ?? {}
  for (const [, dir] of JSON.stringify(layer).matchAll(/\{\{assets\}\}\/([\w.@-]+)\//g)) assetDirs.add(dir)
  if (!existing) fs.writeFileSync(path.join(OUT, `${theme.slug}.json`), JSON.stringify({ name: theme.name, slug: theme.slug, method: profile.method, layer }))
  index.push({
    slug: theme.slug,
    name: theme.name,
    thumb: theme.thumb,
    tags: tagsOf.get(theme.slug) ?? [],
    swatch: [t['color.bg'], t['color.surface'], t['color.text'], t['color.accent']].filter(Boolean),
    dark: Boolean(layer.dark),
  })
}

for (const dir of assetDirs) {
  const from = path.join(FONT_DIR, dir)
  if (fs.existsSync(from)) fs.cpSync(from, path.join(OUT, 'assets', dir), { recursive: true })
}
// Asset folders no design refers to any more.
for (const dir of fs.readdirSync(path.join(OUT, 'assets'))) {
  if (!assetDirs.has(dir)) fs.rmSync(path.join(OUT, 'assets', dir), { recursive: true, force: true })
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), designs: index }))
console.log(`exported ${index.length} designs (${missing} not measured), ${assetDirs.size} asset folders`)
