// One-click theme catalogs: big existing ecosystems, browsed and imported from the server.
//
//   Open VSX     ~2,000 VS Code theme extensions (the open VS Code marketplace, no API key)
//   base16       ~360 schemes from tinted-theming/schemes, indexed once with their colours
//
// Everything fetched is cached under .data/cache, and every download has a size limit.

import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.mjs'
import { unzip } from './unzip.mjs'

const CACHE = path.join(DATA_DIR, 'cache')
const OPEN_VSX = 'https://open-vsx.org/api'
const TINTED_BRANCH = 'spec-0.11'
const MAX_DOWNLOAD = 20 * 1024 * 1024

async function get(url, { as = 'text', max = MAX_DOWNLOAD } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'ryt-prototype' } })
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
  if (Number(res.headers.get('content-length')) > max) throw new Error('download too large')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > max) throw new Error('download too large')
  return as === 'json' ? JSON.parse(buf.toString('utf8')) : as === 'buffer' ? buf : buf.toString('utf8')
}

const memo = new Map()
async function cached(key, ttlMs, fn) {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value
  const value = await fn()
  memo.set(key, { at: Date.now(), value })
  return value
}

// ---------- Open VSX (VS Code themes) ----------

const isIconTheme = e => /icon/i.test(`${e.name} ${e.displayName ?? ''}`)

export async function searchVsCodeThemes({ query = '', page = 0, size = 24 } = {}) {
  const params = new URLSearchParams({ category: 'Themes', size: String(size), offset: String(page * size), sortBy: 'downloadCount', sortOrder: 'desc' })
  if (query) params.set('query', query)
  return cached(`ovsx:${params}`, 10 * 60_000, async () => {
    const json = await get(`${OPEN_VSX}/-/search?${params}`, { as: 'json' })
    return {
      total: json.totalSize,
      items: json.extensions.filter(e => !isIconTheme(e)).map(e => ({
        id: `${e.namespace}.${e.name}`,
        namespace: e.namespace,
        name: e.name,
        version: e.version,
        title: e.displayName || e.name,
        description: e.description ?? '',
        downloads: e.downloadCount ?? 0,
        icon: e.files?.icon ?? null,
      })),
    }
  })
}

const safe = s => /^[\w.-]+$/.test(s)

// Downloads the .vsix once and returns every colour theme it contributes as JSON text.
export async function vsCodeThemes(namespace, name) {
  if (!safe(namespace) || !safe(name)) throw new Error('bad extension id')
  const meta = await get(`${OPEN_VSX}/${namespace}/${name}`, { as: 'json' })
  const file = path.join(CACHE, 'openvsx', `${namespace}.${name}-${meta.version}.vsix`)
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, await get(meta.files.download, { as: 'buffer' }))
  }
  const zip = unzip(fs.readFileSync(file))
  const read = p => zip.get(path.posix.join('extension', p))?.().toString('utf8')
  const pkg = JSON.parse(read('package.json') ?? '{}')
  const themes = []
  for (const t of pkg.contributes?.themes ?? []) {
    let text = read(path.posix.normalize(t.path))
    if (!text) continue
    // VS Code themes may "include" a base theme file: merge its colours underneath.
    const included = /"include"\s*:\s*"([^"]+)"/.exec(text)?.[1]
    if (included) {
      const base = read(path.posix.join(path.posix.dirname(path.posix.normalize(t.path)), included))
      const colors = base && /"colors"\s*:\s*(\{[^}]*\})/.exec(base)?.[1]
      if (colors) text = text.replace(/"colors"\s*:\s*\{/, m => `${m}${colors.slice(1, -1).trim()},`)
    }
    themes.push({ label: t.label ?? path.basename(t.path, '.json'), dark: t.uiTheme !== 'vs', text })
  }
  return { title: meta.displayName || name, version: meta.version, themes }
}

// ---------- base16 (tinted-theming) ----------

const INDEX = path.join(CACHE, 'base16-index.json')
let indexing = null

// Lists every scheme with its colours (for swatches). Built once, then read from disk.
export async function base16Index() {
  if (fs.existsSync(INDEX)) return JSON.parse(fs.readFileSync(INDEX, 'utf8'))
  indexing ??= (async () => {
    const listing = await get(`https://api.github.com/repos/tinted-theming/schemes/contents/base16?ref=${TINTED_BRANCH}`, { as: 'json' })
    const files = listing.filter(f => f.name.endsWith('.yaml'))
    const out = []
    for (let i = 0; i < files.length; i += 24) {
      const batch = await Promise.all(files.slice(i, i + 24).map(async f => {
        try {
          const text = await get(f.download_url, { max: 64 * 1024 })
          const color = k => new RegExp(`${k}\\s*:\\s*["']?#?([0-9a-fA-F]{6})`).exec(text)?.[1]
          return {
            id: f.name.replace(/\.yaml$/, ''),
            name: /^name\s*:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1] ?? f.name,
            variant: /^variant\s*:\s*["']?(\w+)/m.exec(text)?.[1] ?? 'dark',
            colors: ['base00', 'base01', 'base05', 'base0D', 'base0A', 'base08', 'base0B'].map(k => `#${color(k) ?? '000000'}`),
          }
        } catch {
          return null
        }
      }))
      out.push(...batch.filter(Boolean))
    }
    fs.mkdirSync(CACHE, { recursive: true })
    fs.writeFileSync(INDEX, JSON.stringify(out))
    return out
  })()
  try {
    return await indexing
  } finally {
    indexing = null
  }
}

export async function base16Scheme(id) {
  if (!safe(id)) throw new Error('bad scheme id')
  return get(`https://raw.githubusercontent.com/tinted-theming/schemes/${TINTED_BRANCH}/base16/${id}.yaml`, { max: 64 * 1024 })
}
