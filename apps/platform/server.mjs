// RYT (Recommend You This) prototype platform. Zero dependencies: node:http + template strings.
//   :4000  platform (pages, inbox, settings, public page shell, JSON API)
//   :4001  user content (fork bundles, served to sandboxed iframes only)

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { CATEGORIES } from '../../packages/contract/index.js'
import { TOKEN_SCHEMA, SETTING_SCHEMA, SECTIONS, FONTS, isValid, coerce, resolveTheme, fontHref, importTheme, sanitizeCss, sendForm } from '../../packages/kit/index.js'
import { searchVsCodeThemes, vsCodeThemes, base16Index, base16Scheme } from './catalogs.mjs'
import * as hugoCatalog from './hugo/catalog.mjs'
import { buildSite, siteOut, compatBySlug, themeOptions, pruneBuilds } from './hugo/build.mjs'
import { extractProfile, profileForSlug, FONT_DIR, PROFILE_VERSION } from './hugo/extract.mjs'
import { render as renderDefault } from '../page/render.js'
import { PORT, UC_PORT, PLATFORM_ORIGIN, UC_ORIGIN, REPO_ROOT, THEMES_DIR, FORKS_DIR, siteIdFromHost } from './config.mjs'
import { loadDb, saveDb, newId, userByHandle } from './db.mjs'
import { pageData } from './public-data.mjs'
import { themeFor, listPresets, presetLayers } from './theme-host.mjs'
import { buildFork, bundleDir } from './builder.mjs'
import { publicPage } from './shell.mjs'
import * as views from './views.mjs'

const db = loadDb()
// Ctrl-C / kill: exit cleanly so child processes (Chromium) are stopped too.
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(0))
hugoCatalog.themeKinds().catch(() => {}) // warm the theme gallery labels in the background

// ---------- tiny router ----------

const routes = []
const route = (method, pattern, handler) => {
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`)
  routes.push({ method, re, handler })
}

const send = (res, status, body, type = 'text/html; charset=utf-8', headers = {}) => {
  res.writeHead(status, { 'content-type': type, ...headers })
  res.end(body)
}
const redirect = (res, location) => send(res, 303, '', 'text/plain', { location })
const withFlash = (location, msg) => `${location}${location.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`

async function readBody(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 200_000) throw new Error('body too large')
  }
  return body
}

async function readForm(req) {
  return Object.fromEntries(new URLSearchParams(await readBody(req)))
}

const isFetch = ctx => ctx.req.headers['x-requested-with'] === 'fetch'

// Mutations answer fetch() (autosave) with plain text for a toast, and form posts with a
// redirect carrying the same message. A leading "!" marks an error.
function done(ctx, location, msg) {
  if (isFetch(ctx)) return send(ctx.res, msg.startsWith('!') ? 400 : 200, msg.replace(/^!/, ''), 'text/plain; charset=utf-8')
  redirect(ctx.res, withFlash(location, msg))
}

function page(ctx, title, body, { active, head } = {}) {
  const here = new URL(ctx.url)
  here.searchParams.delete('msg')
  const inboxCount = ctx.viewer ? db.recs.filter(r => r.to === ctx.viewer.id && r.status === 'new').length : 0
  send(ctx.res, 200, views.layout({ title, viewer: ctx.viewer, users: db.users, body, active, head, inboxCount, path: here.pathname + here.search }))
}

const requireViewer = ctx => {
  if (ctx.viewer) return true
  done(ctx, '/', '!Sign in first, using the button at the top right.')
  return false
}

const STATUS_IDS = views.STATUSES.map(([id]) => id)

// ---------- Hugo-theme sites ----------

// One build at a time per person; bursts of changes collapse into one rebuild.
const siteQueues = new Map()
const siteTimers = new Map()

function rebuildSite(user, { onProgress } = {}) {
  const run = async () => {
    const site = user.theme.site
    if (!site?.slug) return null
    try {
      const build = await buildSite(user, pageData(db, user), { onProgress })
      const previous = site.live
      Object.assign(site, { live: build.id, lastBuild: { ms: build.ms, at: build.at, key: build.key }, lastError: null })
      pruneBuilds(user.handle, [build.id, previous].filter(Boolean))
      return build
    } catch (e) {
      site.lastError = e.message
      throw e
    } finally {
      saveDb(db)
    }
  }
  const job = (siteQueues.get(user.id) ?? Promise.resolve()).then(run)
  siteQueues.set(user.id, job.catch(() => {}))
  return job
}

// Called after anything that changes what's public on these people's pages.
function touched(...ids) {
  for (const id of new Set(ids.filter(Boolean))) {
    const user = db.users.find(u => u.id === id)
    if (user?.theme.mode !== 'site' || !user.theme.site?.slug) continue
    clearTimeout(siteTimers.get(id))
    siteTimers.set(id, setTimeout(() => rebuildSite(user).catch(e => console.warn(`[site] ${user.handle}: ${e.message}`)), 400))
  }
}

// Pages that used a theme's full website (the retired site mode) are moved to RYT's structure
// with that theme's measured design.
setTimeout(async () => {
  for (const user of db.users) {
    // Also re-measure designs taken with an older version of the extractor.
    const stale = user.theme.import?.format === 'hugo' && user.theme.import.version !== PROFILE_VERSION ? user.theme.import.source.slug : null
    const slug = stale ?? (user.theme.mode === 'site' ? user.theme.site?.slug : null)
    if (!slug) continue
    user.theme.mode = 'builtin'
    const result = await applyTheme(user, slug)
    if (!result.ok) console.warn(`[design] ${user.handle}: ${result.detail}`)
  }
  saveDb(db)
}, 100)

// ---------- pages ----------

route('GET', '/', ctx => {
  const cards = db.users.map(user => {
    const theme = themeFor(user, { themesDir: THEMES_DIR })
    const t = theme.tokens
    return {
      user,
      custom: user.theme.mode === 'fork',
      site: user.theme.mode === 'site' && user.theme.site?.live ? user.theme.site : null,
      themeLabel: user.theme.preset,
      colors: [t['color.bg'], t['color.surface'], t['color.text'], t['color.accent'], t['color.rating']],
    }
  })
  page(ctx, 'Recommend You This', views.landing({ cards, viewer: ctx.viewer }))
})

// Fake auth for the prototype: "act as" any seeded user.
route('GET', '/login', ctx => {
  const handle = ctx.url.searchParams.get('as') ?? ''
  const next = ctx.url.searchParams.get('next') ?? ''
  const back = next.startsWith('/') && !next.startsWith('//') ? next
    : ctx.req.headers.referer ? new URL(ctx.req.headers.referer).pathname : '/'
  send(ctx.res, 303, '', 'text/plain', { location: back, 'set-cookie': `as=${encodeURIComponent(handle)}; Path=/; HttpOnly; SameSite=Lax` })
})

// Everything a public page needs, in whichever mode the owner chose. `body` replaces the
// built-in page content (the send page uses it); forks/sites fall back to it if they fail.
function pageParts(owner, ctx, { forced = false, body } = {}) {
  const data = pageData(db, owner)
  // ?design=<theme>: the owner previews their page in a measured design before applying it.
  const previewSlug = ctx.viewer?.id === owner.id ? ctx.url.searchParams.get('design') : null
  const preview = previewSlug && /^[\w.-]+$/.test(previewSlug) ? profileForSlug(previewSlug) : null
  const shown = preview ? { ...owner, theme: { ...owner.theme, import: { name: previewSlug, format: 'hugo', layer: preview.layer }, overrides: { ...owner.theme.overrides, tokens: undefined } } } : owner
  const theme = themeFor(shown, { themesDir: THEMES_DIR })
  const builtin = { theme, forced, html: body ?? renderDefault({ data, theme }) }
  let fork = null
  const live = owner.theme.fork.builds.find(b => b.id === owner.theme.fork.live)
  if (owner.theme.mode === 'fork' && !forced && !body && live && fs.existsSync(bundleDir(live.id))) {
    // Theme JSON is data, so the platform can resolve it from the fork's own themes folder.
    const forkThemes = path.join(bundleDir(live.id), 'apps/page/themes')
    const themesDir = fs.existsSync(forkThemes) ? forkThemes : THEMES_DIR
    const presetName = fs.existsSync(path.join(themesDir, `${owner.theme.preset}.json`)) ? owner.theme.preset : live.defaultPreset
    const { warnings, ...forkTheme } = themeFor(owner, { themesDir, presetName })
    fork = { build: live, data, theme: forkTheme }
  }
  const s = owner.theme.site
  const site = owner.theme.mode === 'site' && !forced && s?.live && fs.existsSync(siteOut(s.live)) ? { id: s.live, name: s.name } : null
  return { builtin, fork, site }
}

route('GET', '/@:handle', ctx => {
  const owner = userByHandle(db, ctx.params.handle)
  if (!owner) return send(ctx.res, 404, 'No such page')
  const parts = pageParts(owner, ctx, { forced: ctx.url.searchParams.get('theme') === 'default' })
  send(ctx.res, 200, publicPage({ user: owner, viewer: ctx.viewer, isOwner: ctx.viewer?.id === owner.id, ...parts }))
})

route('GET', '/api/v1/pages/:handle', ctx => {
  const owner = userByHandle(db, ctx.params.handle)
  if (!owner) return send(ctx.res, 404, '{"error":"not found"}', 'application/json')
  send(ctx.res, 200, JSON.stringify(pageData(db, owner), null, 2), 'application/json', { 'access-control-allow-origin': '*' })
})

// One place that validates and stores a new ryt, for the send form and the in-theme API.
function createRyt(owner, viewer, f) {
  if (owner.inbox === 'closed') return { error: `${owner.name} isn’t taking ryts right now.` }
  if (owner.inbox === 'accounts' && !viewer) return { error: 'Sign in on RYT to send this person a ryt.' }
  if (viewer?.id === owner.id) return { error: 'That’s your own page. Use “Add one yourself” in your inbox instead.' }
  const title = String(f.title ?? '').trim().slice(0, 200)
  const fromName = viewer ? null : String(f.fromName ?? '').trim().slice(0, 60)
  if (!title) return { error: 'Tell them what to try.' }
  if (!viewer && !fromName) return { error: 'Add your name so they know who to thank.' }
  const rec = {
    id: newId(),
    to: owner.id,
    fromUser: viewer?.id ?? null,
    fromName,
    showName: f.showName === true || f.showName === 'on',
    source: 'sent',
    title,
    url: /^https?:\/\//.test(f.url ?? '') ? String(f.url).slice(0, 500) : '',
    category: CATEGORIES.includes(f.category) ? f.category : 'Other',
    tags: String(f.tags ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 8),
    pitch: String(f.pitch ?? '').slice(0, 500),
    status: 'new',
    rating: null,
    review: '',
    note: '',
    hidden: false,
    createdAt: new Date().toISOString(),
    triedAt: null,
  }
  db.recs.push(rec)
  saveDb(db)
  return { rec }
}

// The send page lives in the page's own design: inside the Hugo theme for theme sites, or
// drawn with the person's tokens for built-in designs and forks.
function sendPage(ctx, owner, { error, sent, values } = {}) {
  const body = sendForm({
    owner, viewer: ctx.viewer, categories: CATEGORIES, error, sent, values,
    closed: owner.inbox === 'closed', accountsOnly: owner.inbox === 'accounts',
  })
  const parts = pageParts(owner, ctx, { body: `<div data-ryt="page" data-layout="list">${body}</div>` })
  send(ctx.res, error ? 400 : 200, publicPage({ user: owner, viewer: ctx.viewer, isOwner: ctx.viewer?.id === owner.id, isSend: true, ...parts, fork: null }))
}

route('GET', '/@:handle/send', ctx => {
  const owner = userByHandle(db, ctx.params.handle)
  if (!owner) return send(ctx.res, 404, 'No such page')
  sendPage(ctx, owner, { sent: ctx.url.searchParams.get('sent') === '1' })
})

route('POST', '/@:handle/send', async ctx => {
  const owner = userByHandle(db, ctx.params.handle)
  if (!owner) return send(ctx.res, 404, 'No such page')
  const f = await readForm(ctx.req)
  const result = createRyt(owner, ctx.viewer, f)
  if (result.error) return sendPage(ctx, owner, { error: result.error, values: { ...f, showName: f.showName === 'on' } })
  redirect(ctx.res, `/@${owner.handle}/send?sent=1`)
})

// JSON for the in-theme send form (posted by the page shell on the visitor's behalf).
route('POST', '/api/v1/pages/:handle/ryts', async ctx => {
  const owner = userByHandle(db, ctx.params.handle)
  if (!owner) return send(ctx.res, 404, '{"message":"No such page"}', 'application/json')
  let f
  try {
    f = JSON.parse(await readBody(ctx.req))
  } catch {
    return send(ctx.res, 400, '{"message":"Bad request"}', 'application/json')
  }
  const result = createRyt(owner, ctx.viewer, f ?? {})
  if (result.error) return send(ctx.res, 400, JSON.stringify({ message: result.error }), 'application/json')
  send(ctx.res, 201, JSON.stringify({ message: 'Sent', id: result.rec.id }), 'application/json')
})

route('GET', '/inbox', ctx => {
  if (!requireViewer(ctx)) return
  const recs = db.recs.filter(r => r.to === ctx.viewer.id).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const status = ctx.url.searchParams.get('status') ?? ''
  const filter = { status: STATUS_IDS.includes(status) ? status : '', from: ctx.url.searchParams.get('from') ?? '' }
  page(ctx, 'Inbox', views.inboxPage({ recs, users: db.users, filter }), { active: '/inbox' })
})

route('POST', '/inbox/add', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  db.recs.push({
    id: newId(), to: ctx.viewer.id, fromUser: null, fromName: (f.fromName ?? '').trim().slice(0, 60) || 'someone',
    showName: true, source: 'manual', title: (f.title ?? '').trim().slice(0, 200) || 'Untitled', url: '',
    category: CATEGORIES.includes(f.category) ? f.category : 'Other', tags: [], pitch: '',
    status: STATUS_IDS.includes(f.status) ? f.status : 'new',
    rating: null, review: '', note: '', hidden: false, createdAt: new Date().toISOString(), triedAt: null,
  })
  saveDb(db)
  touched(ctx.viewer.id)
  done(ctx, '/inbox', 'Added')
})

const ownRec = ctx => db.recs.find(r => r.id === ctx.params.id && r.to === ctx.viewer?.id)

route('POST', '/inbox/:id', async ctx => {
  if (!requireViewer(ctx)) return
  const rec = ownRec(ctx)
  if (!rec) return send(ctx.res, 404, 'Not found')
  const f = await readForm(ctx.req)
  const rating = Number(f.rating)
  if (STATUS_IDS.includes(f.status)) {
    if (f.status === 'tried' && rec.status !== 'tried') rec.triedAt = new Date().toISOString().slice(0, 10)
    rec.status = f.status
  }
  rec.rating = Number.isInteger(rating) && rating >= 1 && rating <= 10 ? rating : null
  rec.review = (f.review ?? '').slice(0, 2000)
  rec.note = (f.note ?? '').slice(0, 500)
  rec.hidden = f.visible !== 'on'
  saveDb(db)
  touched(rec.to, rec.fromUser)
  const back = new URL(ctx.req.headers.referer ?? '/inbox', PLATFORM_ORIGIN)
  back.searchParams.delete('msg')
  const isPublic = ['tried', 'already_done'].includes(rec.status) && !rec.hidden
  done(ctx, back.pathname + back.search, isPublic ? 'Saved · on your page' : 'Saved')
})

route('POST', '/inbox/:id/delete', ctx => {
  if (!requireViewer(ctx)) return
  const rec = ownRec(ctx)
  if (!rec) return send(ctx.res, 404, 'Not found')
  db.recs = db.recs.filter(r => r !== rec)
  saveDb(db)
  touched(rec.to, rec.fromUser)
  done(ctx, '/inbox', `Deleted “${rec.title}”`)
})

route('GET', '/sent', ctx => {
  if (!requireViewer(ctx)) return
  const recs = db.recs.filter(r => r.fromUser === ctx.viewer.id).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  page(ctx, 'Sent', views.sentPage({ recs, users: db.users }), { active: '/sent' })
})

// ---------- settings ----------

function demoForks() {
  if (!fs.existsSync(FORKS_DIR)) return []
  return fs.readdirSync(FORKS_DIR)
    .map(name => path.join(FORKS_DIR, name))
    .filter(dir => fs.existsSync(path.join(dir, '.git')))
    .map(dir => {
      let branches = []
      try {
        branches = execFileSync('git', ['-C', dir, 'branch', '--format=%(refname:short)']).toString().trim().split('\n')
      } catch {}
      return { name: path.basename(dir), path: dir, branches }
    })
}

// Each preset resolved on its own, for the picker thumbnails.
function presetCards(current) {
  return listPresets(THEMES_DIR)
    .filter(p => p.name !== 'base' || current === 'base')
    .map(p => {
      const theme = resolveTheme(presetLayers(THEMES_DIR, p.name, []))
      const heading = theme.tokens['font.heading']
      return { ...p, tokens: theme.tokens, href: fontHref(theme), fontStack: FONTS[heading].stack ?? `"${heading}", ${FONTS[heading].fallback}` }
    })
}

// The gallery reads from live catalogs; if one is unreachable the tab says so instead of failing.
async function galleryData(url) {
  const src = ['vscode', 'base16', 'paste'].includes(url.searchParams.get('src')) ? url.searchParams.get('src') : 'vscode'
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const pageNo = Math.max(0, Number(url.searchParams.get('page')) || 0)
  const data = { src, q, page: pageNo, items: [], total: 0, error: null }
  try {
    if (src === 'vscode') Object.assign(data, await searchVsCodeThemes({ query: q, page: pageNo }))
    if (src === 'base16') {
      const all = (await base16Index()).filter(s => !q || `${s.name} ${s.id}`.toLowerCase().includes(q.toLowerCase()))
      Object.assign(data, { total: all.length, items: all.slice(pageNo * 60, pageNo * 60 + 60), perPage: 60 })
    }
  } catch (e) {
    data.error = `Couldn’t reach the catalog right now (${e.message}). You can still paste a theme.`
  }
  return data
}

// Gallery data: one page of themes with what we know about each (works / not compatible /
// not a blog theme / in use). Used for the first render and by live search ("Show more").
async function hugoGallery(viewer, url) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60)
  const tag = hugoCatalog.TAGS.includes(url.searchParams.get('tag')) ? url.searchParams.get('tag') : ''
  const pageNo = Math.max(0, Number(url.searchParams.get('page')) || 0)
  const site = viewer.theme.site
  const data = { q, tag, page: pageNo, size: 24, tags: hugoCatalog.TAGS, items: [], total: 0, error: null }
  try {
    const [result, kinds] = await Promise.all([hugoCatalog.search({ q, tag, page: pageNo, size: 24 }), hugoCatalog.themeKinds().catch(() => new Map())])
    const compat = compatBySlug()
    data.total = result.total
    data.items = result.items.map(t => ({
      ...t,
      kind: kinds.get(t.slug) ?? null,
      works: compat[t.slug] ? compat[t.slug].ok : null,
      reason: compat[t.slug]?.ok === false ? friendlyReason(compat[t.slug].error) : null,
      inUse: viewer.theme.import?.source?.slug === t.slug,
    }))
  } catch (e) {
    data.error = `Couldn’t reach the Hugo theme showcase right now (${e.message}).`
  }
  data.pages = Math.ceil(data.total / data.size)
  return data
}

// Build errors are for developers; this is what a person sees.
function friendlyReason(error = '') {
  const e = error.replace(/^Not compatible:\s*/, '')
  if (/doesn’t list posts/.test(e)) return 'It’s made for documentation or landing pages, not a list of posts.'
  if (/POSTCSS|postcss|npm|node_modules|tailwind/i.test(e)) return 'It needs extra build tools (Node.js) that RYT doesn’t run.'
  if (/module .* not found|failed to load modules/.test(e)) return 'It depends on add-ons RYT couldn’t download.'
  if (/TOCSS|scss|sass/i.test(e)) return 'Its stylesheets didn’t compile.'
  if (/Your theme options/.test(e)) return e
  return 'It expects a site set up differently from a list of ryts.'
}

// Font files copied from themes (see extract.mjs), served to pages that use those designs.
route('GET', '/assets/fonts/:dir/:file', ctx => {
  const file = path.join(FONT_DIR, ctx.params.dir, ctx.params.file)
  if (!file.startsWith(FONT_DIR + path.sep) || !fs.existsSync(file)) return send(ctx.res, 404, 'Not found', 'text/plain')
  send(ctx.res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', { 'cache-control': 'public, max-age=31536000, immutable' })
})

route('GET', '/settings/themes.json', async ctx => {
  if (!requireViewer(ctx)) return
  send(ctx.res, 200, JSON.stringify(await hugoGallery(ctx.viewer, ctx.url)), 'application/json', { 'cache-control': 'no-store' })
})

route('GET', '/settings/themes/:slug', async ctx => {
  if (!requireViewer(ctx)) return
  const slug = ctx.params.slug.replace(/\.json$/, '')
  try {
    const [info, kinds] = await Promise.all([hugoCatalog.detail(slug), hugoCatalog.themeKinds().catch(() => new Map())])
    const compat = compatBySlug()[slug]
    const site = ctx.viewer.theme.site
    send(ctx.res, 200, JSON.stringify({
      slug, name: info.name, description: info.description, screenshot: info.screenshot ?? info.thumb, demo: info.demo, tags: info.tags,
      repo: info.repo?.url ?? null, kind: kinds.get(slug) ?? null, works: compat ? compat.ok : null, reason: compat?.ok === false ? friendlyReason(compat.error) : null,
      inUse: ctx.viewer.theme.import?.source?.slug === slug,
    }), 'application/json')
  } catch (e) {
    send(ctx.res, 404, JSON.stringify({ message: e.message }), 'application/json')
  }
})

route('GET', '/settings', async ctx => {
  if (!requireViewer(ctx)) return
  const tab = views.SETTINGS_TABS.some(([id]) => id === ctx.url.searchParams.get('tab')) ? ctx.url.searchParams.get('tab') : 'themes'
  const presets = presetCards(ctx.viewer.theme.preset)
  const head = [...new Set(presets.map(p => p.href).filter(Boolean))].map(href => `<link rel="stylesheet" href="${href}">`).join('\n')
  const gallery = tab === 'gallery' ? await galleryData(ctx.url) : null
  const hugo = tab === 'themes' ? await hugoGallery(ctx.viewer, ctx.url) : null

  const body = views.settingsPage({ viewer: ctx.viewer, tab, presets, gallery, hugo, theme: themeFor(ctx.viewer, { themesDir: THEMES_DIR }), forks: demoForks() })
  page(ctx, 'Settings', body, { active: '/settings', head })
})

// Import a theme from a catalog (one click) or pasted text. Imported colours replace any
// colour tweaks made earlier, otherwise those would hide the new theme.
route('POST', '/settings/import', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  const back = `/settings?tab=gallery&src=${encodeURIComponent(f.src || f.source || 'vscode')}${f.q ? `&q=${encodeURIComponent(f.q)}` : ''}`
  try {
    let text
    let name
    let variants = null
    let source
    if (f.source === 'vscode') {
      const ext = await vsCodeThemes(f.ns ?? '', f.name ?? '')
      const pick = ext.themes.find(t => t.label === f.variant) ?? ext.themes[0]
      if (!pick) throw new Error(`${ext.title} has no colour theme file we can read. Some themes are generated inside VS Code.`)
      text = pick.text
      name = pick.label
      variants = ext.themes.map(t => t.label)
      source = { kind: 'vscode', ns: f.ns, name: f.name, title: ext.title, variant: pick.label }
    } else if (f.source === 'base16') {
      text = await base16Scheme(f.id ?? '')
      source = { kind: 'base16', id: f.id }
    } else {
      text = f.text ?? ''
      source = { kind: 'paste' }
    }
    const result = importTheme(text, { prefer: f.prefer === 'dark' ? 'dark' : 'light', name })
    if (result.layer.css) {
      const { css, warnings } = sanitizeCss(result.layer.css)
      result.layer.css = css
      result.notes.push(...warnings)
    }
    const t = ctx.viewer.theme
    t.import = { name: result.name, format: result.format, label: result.label, source, notes: result.notes, variants: variants ?? null, layer: result.layer, at: new Date().toISOString() }
    const tweaked = Object.keys(t.overrides.tokens ?? {}).filter(k => k.startsWith('color.'))
    for (const k of tweaked) delete t.overrides.tokens[k]
    saveDb(db)
    done(ctx, back, `Now using ${result.name}${tweaked.length ? ' (your earlier colour tweaks were cleared)' : ''}`)
  } catch (e) {
    done(ctx, back, `!${e.message}`)
  }
})

route('POST', '/settings/import/remove', ctx => {
  if (!requireViewer(ctx)) return
  ctx.viewer.theme.import = null
  saveDb(db)
  done(ctx, '/settings?tab=gallery', 'Back to your theme’s own colours')
})

// The resolved theme as a RYT theme file: share it, or paste it into someone else's gallery.
route('GET', '/settings/theme.json', ctx => {
  if (!requireViewer(ctx)) return
  const { tokens, settings, sections, css } = themeFor(ctx.viewer, { themesDir: THEMES_DIR })
  const file = { name: `${ctx.viewer.name}'s theme`, tokens, settings, sections, css: css.map(c => c.code).join('\n') }
  send(ctx.res, 200, JSON.stringify(file, null, 2), 'application/json', { 'content-disposition': `attachment; filename="${ctx.viewer.handle}.ryt-theme.json"` })
})

// One click: fetch the theme (first time only), build, and switch the page to it. If the
// build fails, nothing about the current page changes. With JS it runs as a job the page
// polls for progress; without JS the form post waits for it.
const jobs = new Map()

// Applying a theme = measuring its design once (shared by everyone) and adding it as a token
// layer. The page keeps RYT's own structure (ADR 0010). The person's earlier look tweaks are
// cleared so the theme actually shows; sections, settings and custom CSS stay.
async function applyTheme(user, slug, onProgress = () => {}) {
  const all = await hugoCatalog.listAll().catch(() => [])
  const card = all.find(c => c.slug === slug)
  const name = card?.name ?? slug
  try {
    const t0 = Date.now()
    const profile = await extractProfile(slug, { onProgress })
    onProgress('apply', 'Dressing your page')
    const t = user.theme
    t.import = { name, format: 'hugo', label: 'Hugo theme', version: profile.version, source: { kind: 'hugo', slug, key: profile.key }, thumb: card?.thumb ?? null, notes: [], layer: profile.layer, at: new Date().toISOString() }
    if (t.overrides?.tokens) delete t.overrides.tokens
    t.mode = 'builtin'
    t.site = null
    saveDb(db)
    return { ok: true, name, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, name, message: friendlyReason(e.message), detail: e.message.replace(/^Not compatible:\s*/, '') }
  }
}

route('POST', '/settings/design/clear', ctx => {
  if (!requireViewer(ctx)) return
  ctx.viewer.theme.import = null
  saveDb(db)
  done(ctx, '/settings?tab=themes', 'Back to the RYT design')
})

route('POST', '/settings/site/apply', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  const back = `/settings?tab=themes${f.q ? `&q=${encodeURIComponent(f.q)}` : ''}${f.tag ? `&tag=${encodeURIComponent(f.tag)}` : ''}`
  if (!/^[\w.-]+$/.test(f.slug ?? '')) return done(ctx, back, '!Unknown theme.')
  if (isFetch(ctx)) {
    const id = newId()
    const job = { id, owner: ctx.viewer.id, slug: f.slug, status: 'running', steps: [], startedAt: Date.now(), preview: f.preview === '1' }
    jobs.set(id, job)
    const progress = (step, text) => job.steps.push({ step, text, at: Date.now() - job.startedAt })
    // Preview: measure only (shared cache), the page isn't changed until "Use this design".
    const work = job.preview
      ? extractProfile(f.slug, { onProgress: progress }).then(p => ({ ok: true, name: f.slug, ms: Date.now() - job.startedAt, method: p.method }), e => ({ ok: false, message: friendlyReason(e.message), detail: e.message }))
      : applyTheme(ctx.viewer, f.slug, progress)
    work.then(result => Object.assign(job, result, { status: result.ok ? 'done' : 'failed' }))
    setTimeout(() => jobs.delete(id), 10 * 60 * 1000)
    return send(ctx.res, 202, JSON.stringify({ job: id }), 'application/json')
  }
  const result = await applyTheme(ctx.viewer, f.slug)
  done(ctx, back, result.ok ? `Your page now uses ${result.name}` : `!${result.name}: ${result.message}`)
})

route('GET', '/settings/site/jobs/:id', ctx => {
  if (!requireViewer(ctx)) return
  const job = jobs.get(ctx.params.id)
  if (!job || job.owner !== ctx.viewer.id) return send(ctx.res, 404, '{"status":"missing"}', 'application/json')
  const { owner, ...visible } = job
  send(ctx.res, 200, JSON.stringify(visible), 'application/json', { 'cache-control': 'no-store' })
})

// Theme options form (generated from the theme's own params). Saves and rebuilds.
route('POST', '/settings/inbox', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  if (['anyone', 'accounts', 'closed'].includes(f.inbox)) ctx.viewer.inbox = f.inbox
  saveDb(db)
  done(ctx, '/settings?tab=inbox', 'Saved')
})

route('POST', '/settings/mode', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  if (f.mode === 'builtin' || (f.mode === 'fork' && ctx.viewer.theme.fork.live)) ctx.viewer.theme.mode = f.mode
  saveDb(db)
  done(ctx, '/settings?tab=developer', ctx.viewer.theme.mode === 'fork' ? 'Using your own frontend' : 'Using the built-in page')
})

// Forms show resolved values; we store only values that differ from what the preset and
// imported theme already give, so the user's theme stays a small diff that keeps inheriting.
// Each form saves one scope and leaves the rest of the overrides alone.
route('POST', '/settings/theme', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  const t = ctx.viewer.theme
  const o = { ...t.overrides }
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
  const diff = (schema, prefix, base, previous = {}) => {
    const out = { ...previous }
    for (const [key, spec] of Object.entries(schema)) {
      if (!(`${prefix}${key}` in f)) continue
      const value = coerce(spec, f[`${prefix}${key}`])
      if (!isValid(spec, value) || same(value, base[key])) delete out[key]
      else out[key] = value
    }
    return out
  }
  const inherited = () => themeFor(ctx.viewer, { themesDir: THEMES_DIR, withOverrides: false })

  if (f.scope === 'base') {
    if (listPresets(THEMES_DIR).some(p => p.name === f.preset)) t.preset = f.preset
  } else if (f.scope === 'tokens') {
    o.tokens = diff(TOKEN_SCHEMA, 'tok:', inherited().tokens, o.tokens)
  } else if (f.scope === 'layout') {
    const base = inherited()
    const sections = Object.keys(SECTIONS)
      .filter(id => f[`sec:${id}`] === 'on')
      .sort((a, b) => Number(f[`ord:${a}`]) - Number(f[`ord:${b}`]))
    if (sections.join() === base.sections.join()) delete o.sections
    else o.sections = sections
    o.settings = diff(SETTING_SCHEMA, 'set:', base.settings, o.settings)
  } else if (f.scope === 'code') {
    o.css = f.css ?? ''
  }
  for (const key of ['tokens', 'settings']) if (o[key] && !Object.keys(o[key]).length) delete o[key]
  if (typeof o.css === 'string' && !o.css.trim()) delete o.css
  t.overrides = o
  saveDb(db)
  const tab = { tokens: 'appearance', base: 'appearance', layout: 'layout', code: 'developer' }[f.scope] ?? 'appearance'
  if (f.scope === 'layout' && Array.isArray(o.sections) && !o.sections.length) {
    return done(ctx, `/settings?tab=${tab}`, '!Keep at least one section on. Your page shows the defaults until you do.')
  }
  done(ctx, `/settings?tab=${tab}`, 'Saved')
})

route('POST', '/settings/theme/raw', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  let parsed
  try {
    parsed = JSON.parse(f.raw || '{}')
  } catch (e) {
    return done(ctx, '/settings?tab=developer', `!That isn't valid JSON (${e.message}). Nothing changed.`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return done(ctx, '/settings?tab=developer', '!The theme file must be a JSON object. Nothing changed.')
  }
  ctx.viewer.theme.overrides = parsed
  saveDb(db)
  done(ctx, '/settings?tab=developer', 'Saved')
})

route('POST', '/settings/theme/reset', ctx => {
  if (!requireViewer(ctx)) return
  delete ctx.viewer.theme.overrides.tokens
  saveDb(db)
  done(ctx, '/settings?tab=appearance', 'Back to the theme’s defaults')
})

route('POST', '/settings/fork', async ctx => {
  if (!requireViewer(ctx)) return
  const f = await readForm(ctx.req)
  const url = (f.url ?? '').trim()
  const ref = (f.ref ?? '').trim() || 'main'
  if (!url || !/^[\w./:@~+-]+$/.test(url) || !/^[\w./-]+$/.test(ref)) {
    return done(ctx, '/settings?tab=developer', '!That repository or branch doesn’t look right.')
  }
  const fork = ctx.viewer.theme.fork
  fork.url = url
  fork.ref = ref
  const build = await buildFork(ctx.viewer, { url, ref })
  if (build.status === 'passed' && ctx.viewer.theme.mode !== 'fork') ctx.viewer.theme.mode = 'fork'
  saveDb(db)
  done(ctx, '/settings?tab=developer', build.status === 'passed'
    ? `Build ${build.sha} passed and is live`
    : `!Build failed: ${build.error}.${fork.live ? ' Your previous build is still live.' : ''}`)
})

route('POST', '/settings/fork/live/:id', ctx => {
  if (!requireViewer(ctx)) return
  const fork = ctx.viewer.theme.fork
  const build = fork.builds.find(b => b.id === ctx.params.id && b.status === 'passed')
  if (build && fs.existsSync(bundleDir(build.id))) fork.live = build.id
  saveDb(db)
  done(ctx, '/settings?tab=developer', build ? `Build ${build.sha} is live again` : '!Unknown build.')
})

// ---------- static ----------

const TYPES = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.map': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
}
const STATIC = {
  '/assets/platform.js': path.join(REPO_ROOT, 'apps/platform/assets/platform.js'),
  '/assets/platform.css': path.join(REPO_ROOT, 'apps/platform/assets/platform.css'),
  '/assets/page/style.css': path.join(REPO_ROOT, 'apps/page/style.css'),
}

// ---------- servers ----------

http.createServer(async (req, res) => {
  const url = new URL(req.url, PLATFORM_ORIGIN)
  try {
    if (req.method === 'GET' && STATIC[url.pathname]) {
      return send(res, 200, fs.readFileSync(STATIC[url.pathname]), TYPES[path.extname(url.pathname)])
    }
    const pathname = decodeURIComponent(url.pathname)
    for (const r of routes) {
      const m = r.method === req.method && r.re.exec(pathname)
      if (!m) continue
      const cookie = Object.fromEntries((req.headers.cookie ?? '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)))
      const viewer = cookie.as ? userByHandle(db, cookie.as) : null
      return await r.handler({ req, res, url, params: m.groups ?? {}, viewer })
    }
    send(res, 404, 'Not found', 'text/plain')
  } catch (e) {
    console.error(e)
    if (!res.headersSent) send(res, 500, `Something broke: ${e.message}`, 'text/plain')
  }
}).listen(PORT, () => console.log(`platform      ${PLATFORM_ORIGIN}`))

// User content: fork bundles only, locked down. Scripts may only come from this origin, no
// network access at all, and only the platform may frame it.
const UC_CSP = [
  "default-src 'none'",
  `script-src ${UC_ORIGIN}`,
  `style-src ${UC_ORIGIN} 'unsafe-inline' https://fonts.googleapis.com`,
  'font-src https://fonts.gstatic.com',
  `img-src ${UC_ORIGIN} data:`,
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  `frame-ancestors ${PLATFORM_ORIGIN}`,
].join('; ')

// Hugo-theme sites: static, vetted themes rather than arbitrary code. They may use inline
// scripts, CDN styles/fonts/images and fetch their own files (search indexes), nothing else.
const SITE_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' https: data:",
  "img-src 'self' https: data:",
  "media-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "form-action 'none'",
  "base-uri 'self'",
  `frame-ancestors ${PLATFORM_ORIGIN}`,
].join('; ')

function serveFile(res, root, rel, csp) {
  let file = path.resolve(root, rel || '.')
  if (file !== root && !file.startsWith(root + path.sep)) return send(res, 404, 'Not found', 'text/plain')
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const notFound = path.join(root, '404.html')
    return fs.existsSync(notFound) ? send(res, 404, fs.readFileSync(notFound), TYPES['.html'], { 'content-security-policy': csp }) : send(res, 404, 'Not found', 'text/plain')
  }
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', {
    'content-security-policy': csp,
    // Sandboxed fork frames have an opaque origin, so their module scripts are CORS requests.
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  })
}

http.createServer((req, res) => {
  const url = new URL(req.url, UC_ORIGIN)
  const pathname = decodeURIComponent(url.pathname)
  // Theme sites: one host per build (<build>.localhost), served from its root.
  const siteId = siteIdFromHost(req.headers.host)
  if (siteId) {
    if (pathname === '/__ryt/site.js') {
      return send(res, 200, fs.readFileSync(path.join(REPO_ROOT, 'apps/platform/assets/site-runtime.js')), TYPES['.js'], { 'cache-control': 'no-store' })
    }
    return serveFile(res, siteOut(siteId), pathname.slice(1), SITE_CSP)
  }
  const m = /^\/b\/([\w-]+)\/(.+)$/.exec(pathname)
  if (m) return serveFile(res, bundleDir(m[1]), m[2], UC_CSP)
  send(res, 404, 'Not found', 'text/plain')
}).listen(UC_PORT, () => console.log(`user content  ${UC_ORIGIN}`))
