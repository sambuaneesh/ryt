// Builds a person's ryts with a Hugo theme from the marketplace.
//
// 1. Migrate the theme's example site config: ask Hugo for it as JSON, keep only what the
//    example adds on top of the theme's defaults, and swap the demo person for the page
//    owner (name, bio, avatar; social links, emails, analytics, comments removed). Using it
//    first makes the page look like the theme's demo.
// 2. Generate the site (site-source.mjs) in the section the theme lists on its home page.
// 3. Build. When Hugo fails, the error says what to adjust, one rung at a time:
//      cover image shape        map -> string -> none
//      "...in type string"      params.author as { name }
//      taxonomy page fails      taxonomies full -> basic -> none
//      Hugo removed something   next older Hugo release
//      anything else            drop the example config, then older Hugo
//    The working rung is remembered per theme commit (compat.json): later builds for anyone
//    are a single Hugo run.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR, siteOrigin } from '../config.mjs'
import { siteSource } from '../site-source.mjs'
import { sanitizeCss } from '../../../packages/kit/index.js'
import { ensureTheme, ensureHugo, ensureSass, ensureModule, ensureNpm, npmDeps, goModVersions, hugoRun, HUGO_VERSIONS } from './themes.mjs'
import { cachedImage } from './images.mjs'

const ROOT = path.join(DATA_DIR, 'hugo')
const COMPAT = path.join(ROOT, 'compat.json')
const EXAMPLES = path.join(ROOT, 'examples')
const IMAGES = path.join(ROOT, 'images')
const TAXO = ['full', 'basic', 'none']
const COVERS = ['map', 'string', 'none']
export const siteOut = id => path.join(ROOT, 'out', id)

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

export const readCompat = () => (fs.existsSync(COMPAT) ? JSON.parse(fs.readFileSync(COMPAT, 'utf8')) : {})
function writeCompat(key, value) {
  const all = readCompat()
  all[key] = value
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(COMPAT, JSON.stringify(all, null, 2))
}

// ---------- example config migration ----------

// Example sites import their own theme as a module; we provide the theme via the themes dir,
// so that import (and version pins / mounts meant for the demo) go. Imports of other modules
// (libraries the theme uses) stay: the builder fetches those.
function stripModule(text, ext, theme, moduleFile = false, keepImports = true) {
  let skip = false
  if (ext === '.toml') {
    const self = (theme.repo ?? '').toLowerCase().replace(/^https?:\/\//, '')
    const blocks = []
    for (const line of text.split('\n')) {
      if (/^\s*\[/.test(line) || !blocks.length) blocks.push([])
      blocks.at(-1).push(line)
    }
    return blocks.filter(block => {
      const raw = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(block[0])?.[1]?.trim()
      const h = raw && moduleFile && !raw.startsWith('module') ? `module.${raw}` : raw
      if (moduleFile && !raw) return !/^\s*(replacements|workspace|proxy|noproxy|private|vendorclosest)\s*=/m.test(block.join('\n'))
      if (!h || !/^module(\.|$)/.test(h)) return true
      if (h !== 'module.imports' || !keepImports) return false
      const importPath = /^\s*path\s*=\s*["']([^"']+)["']/m.exec(block.join('\n'))?.[1]?.toLowerCase() ?? ''
      return importPath && !importPath.startsWith('.') && !(self && importPath.startsWith(self)) && importPath.includes('/')
    }).flat().join('\n')
  }
  if (ext === '.yaml' || ext === '.yml') {
    return text.split('\n').filter(l => {
      if (/^\S/.test(l)) skip = /^module\s*:/.test(l)
      return !skip
    }).join('\n')
  }
  if (ext === '.json') {
    const json = JSON.parse(text)
    delete json.module
    return JSON.stringify(json)
  }
  return text
}

function linkModules(dir, modules) {
  for (const [modPath, modDir] of Object.entries(modules)) {
    const link = path.join(dir, 'themes', ...modPath.split('/'))
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.rmSync(link, { force: true })
    fs.symlinkSync(modDir, link)
  }
}

async function resolvedConfig(bin, dir, theme, extraConfig, configDir, modules = {}) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'themes'), { recursive: true })
  fs.symlinkSync(theme.dir, path.join(dir, 'themes', 't'))
  linkModules(dir, modules)
  fs.writeFileSync(path.join(dir, 'base.json'), JSON.stringify({ theme: 't', themesDir: 'themes' }))
  const configs = [...(extraConfig ? [extraConfig] : []), path.join(dir, 'base.json')]
  const { stdout } = await hugoRun(bin, ['config', '--format', 'json', '--source', dir, '--config', configs.join(','), ...(configDir ? ['--configDir', configDir] : [])])
  return JSON.parse(stdout)
}

// What the example sets that the theme's defaults don't.
function difference(a, b) {
  if (!isObj(a) || !isObj(b)) return JSON.stringify(a) === JSON.stringify(b) ? undefined : a
  const out = {}
  for (const [k, v] of Object.entries(a)) {
    const d = difference(v, b[k])
    if (d !== undefined) out[k] = d
  }
  return Object.keys(out).length ? out : undefined
}

const DROP_TOP = /^(baseurl|title|theme|themesdir|module|menus?|contentdir|publishdir|resourcedir|staticdir|layoutdir|archetypedir|assetdir|datadir|i18ndir|workingdir|cachedir|caches|services|disqusshortname|googleanalytics|security|server|deployment|languagecode|defaultcontentlanguage|enablegitinfo|copyright)$/
const TRACKING = /(analytics|disqus|gtag|utterances|giscus|commento|remark42|cusdis|isso|waline|twikoo|valine|plausible|umami|matomo|fathom|baidu|clarity|adsense|verification|comments?|newsletter|mailchimp|buymeacoffee|kofi|sponsor|donate)/
const SOCIAL = /^(social\w*|links?|contacts?|accounts|profiles|networks|follow\w*|share\w*buttons?)$/
const NAME = /^(author|authorname|name|fullname|owner|realname|username|nickname|sitename|brand)$/
const BIO = /^(bio|description|subtitle|tagline|about|intro|summary|motto|slogan|headline|content|text|info|lead|sitedescription)$/
const AVATAR = /^(avatar\w*|profile_?(image|pic|picture|photo)|photo|picture|portrait|author_?image|authorimage|gravatar|imageurl|image|img|logo_?image|selfie|headshot)$/
const CONTACT = /(email|mail|phone|tel|address|location|city|country|company|employer|job|role|position|github|gitlab|bitbucket|twitter|^x$|linkedin|mastodon|facebook|instagram|youtube|telegram|discord|keybase|reddit|medium|stackoverflow|orcid|scholar|website|homepage|dribbble|behance|codepen|strava|spotify|twitch|tiktok|pinterest|patreon|threads|bluesky|signal|whatsapp|skype|wechat|weibo|zhihu|douban|bilibili)/

const FORCE_DARK = /^(dark_?mode|dark|force_?dark(_?mode)?|dark_?theme|always_?dark)$/
const SCHEME = /^(default_?theme|theme_?(mode|variant|scheme)|color_?scheme|default_?(color_?)?(scheme|mode)|mode|appearance)$/

function scrub(node, owner, avatar, trail = []) {
  if (Array.isArray(node)) {
    // Lists of links to the demo author's places on the web: keep only internal ones.
    return node
      .filter(item => !(isObj(item) && Object.values(item).some(v => typeof v === 'string' && /^https?:\/\//.test(v))))
      .map(item => scrub(item, owner, avatar, trail))
  }
  if (!isObj(node)) return node
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    const key = k.toLowerCase()
    const inPersona = trail.some(t => /(author|profile|home|hero|intro|banner|header|about|me|person|owner|info|sidebar|widget)/.test(t))
    if (TRACKING.test(key)) continue
    // A demo that forces dark mode hides the theme's default look; with the switch gone RYT
    // measures the default and the dark variant, and picks from the theme's screenshot.
    if ((v === true && FORCE_DARK.test(key)) || (v === 'dark' && SCHEME.test(key))) continue
    if (SOCIAL.test(key)) {
      out[k] = Array.isArray(v) ? [] : isObj(v) ? {} : ''
      continue
    }
    // Lists of strings under persona keys (e.g. info = ["Full Stack", "Magician"]).
    if (Array.isArray(v) && v.every(x => typeof x === 'string')) {
      out[k] = NAME.test(key) ? [owner.name] : BIO.test(key) ? [owner.bio || "Here's what people told me to try, and what I thought."] : v
      continue
    }
    if (isObj(v) || Array.isArray(v)) {
      out[k] = scrub(v, owner, avatar, [...trail, key])
      continue
    }
    if (typeof v !== 'string') {
      out[k] = v
      continue
    }
    if (NAME.test(key)) out[k] = owner.name
    else if (key === 'title' && inPersona) out[k] = owner.name
    else if (BIO.test(key) && (inPersona || trail.length <= 1)) out[k] = owner.bio || "Here's what people told me to try, and what I thought."
    else if (AVATAR.test(key) && (inPersona || /avatar|profile|author|photo|portrait|gravatar/.test(key))) out[k] = avatar
    else if (CONTACT.test(key)) out[k] = ''
    else if (/^https?:\/\//.test(v) && !/(cdn|font|style|script|css|js|icon)/.test(key)) out[k] = ''
    else out[k] = v
  }
  return out
}

// Module imports declared in TOML config text ([[module.imports]] or, in module.toml, [[imports]]).
function declaredImports(text) {
  return [...text.matchAll(/^\s*\[\[(?:module\.)?imports\]\][^[]*?^\s*path\s*=\s*["']([^"']+)["']/gms)].map(m => m[1])
}

// Returns the migrated example config (cached per theme commit), or null if there is none.
async function migratedExample(theme, owner, baseURL) {
  const exampleConfigDir = ['config'].map(d => path.join(theme.exampleDir, d)).find(d => fs.existsSync(path.join(d, '_default')))
  if (!theme.exampleConfig && !exampleConfigDir) return null
  const cache = path.join(EXAMPLES, `${theme.key.replace('@', '_')}.json`)
  let example = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : null
  if (!example) {
    const bin = await ensureHugo(HUGO_VERSIONS[0])
    const tag = crypto.randomBytes(4).toString('hex')
    const dir = path.join(ROOT, 'work', `_example-${tag}`)
    const ext = theme.exampleConfig ? path.extname(theme.exampleConfig) : '.toml'
    const copy = theme.exampleConfig ? path.join(ROOT, 'work', `_example-${tag}${ext}`) : null
    const cfgDir = exampleConfigDir ? path.join(ROOT, 'work', `_example-${tag}-config`) : null
    try {
      fs.mkdirSync(dir, { recursive: true })
      // Resolve with every module import removed (Hugo can't load config with missing modules);
      // the library imports are collected from the text and fetched by the builder instead.
      const importsFound = []
      if (copy) {
        const text = fs.readFileSync(theme.exampleConfig, 'utf8')
        if (ext === '.toml') importsFound.push(...declaredImports(text))
        fs.writeFileSync(copy, stripModule(text, ext, theme, false, true))
      }
      if (cfgDir) {
        // Same treatment for a config directory (config/_default/*.toml, module.toml…).
        fs.cpSync(exampleConfigDir, cfgDir, { recursive: true })
        for (const entry of fs.readdirSync(cfgDir, { withFileTypes: true, recursive: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.toml')) continue
          const file = path.join(entry.parentPath, entry.name)
          const isModule = entry.name === 'module.toml'
          const text = fs.readFileSync(file, 'utf8')
          importsFound.push(...declaredImports(text))
          fs.writeFileSync(file, stripModule(text, '.toml', theme, isModule, true))
        }
      }
      // Library modules the demo imports must be present for Hugo to read its config (they can
      // define output formats, params…). Fetch what's declared, then whatever Hugo says is missing.
      const self = (theme.repo ?? '').toLowerCase().replace(/^https?:\/\//, '')
      const wanted = [...new Set(importsFound)].filter(p => p.includes('/') && !p.startsWith('.') && !(self && p.toLowerCase().startsWith(self)))
      const modules = {}
      let withExample
      for (let round = 0; round < 14; round++) {
        for (const modPath of wanted.filter(p => !modules[p])) {
          try {
            modules[modPath] = await ensureModule(modPath, goModVersions(theme.exampleDir, theme.dir, ...Object.values(modules))[modPath])
          } catch {
            modules[modPath] = null
          }
        }
        try {
          withExample = await resolvedConfig(bin, dir, theme, copy, cfgDir, Object.fromEntries(Object.entries(modules).filter(([, d]) => d)))
          break
        } catch (e) {
          const missing = /module "([^"]+)" not found/.exec(`${e.stderr ?? ''}`)?.[1]
          if (!missing || wanted.includes(missing)) throw e
          wanted.push(missing)
        }
      }
      if (!withExample) throw new Error('could not resolve the example config')
      importsFound.splice(0, importsFound.length, ...wanted)
      const themeOnly = await resolvedConfig(bin, dir, theme, null)
      example = difference(withExample, themeOnly) ?? {}
      // Multilingual demos: fold the default language's params in, drop the other languages.
      const lang = withExample.defaultcontentlanguage ?? 'en'
      const langParams = withExample.languages?.[lang]?.params
      if (langParams) example.params = { ...(example.params ?? {}), ...langParams }
      delete example.languages
      delete example.module
      if (importsFound.length) example.module = { imports: importsFound.map(p => ({ path: p })) }
    } catch (e) {
      if (process.env.RYT_DEBUG) console.warn('[example]', theme.slug, (e.stderr || e.message).slice(0, 600))
      example = {}
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      if (copy) fs.rmSync(copy, { force: true })
      if (cfgDir) fs.rmSync(cfgDir, { recursive: true, force: true })
    }
    fs.mkdirSync(EXAMPLES, { recursive: true })
    fs.writeFileSync(cache, JSON.stringify(example))
  }
  if (!Object.keys(example).length) return null
  const migrated = {}
  for (const [k, v] of Object.entries(example)) if (!DROP_TOP.test(k)) migrated[k] = v
  // Library modules the demo imports (not the theme itself) are fetched by the builder.
  const self = (theme.repo ?? '').toLowerCase().replace(/^https?:\/\//, '')
  const imports = (example.module?.imports ?? []).filter(i => typeof i?.path === 'string' && i.path.includes('/') && !i.path.startsWith('.') && !(self && i.path.toLowerCase().startsWith(self)) && i.path !== 't')
  if (imports.length) migrated.module = { imports: imports.map(({ path: p, disable }) => ({ path: p, ...(disable ? { disable } : {}) })) }
  migrated.params = scrub(migrated.params ?? {}, owner, 'ryt-avatar.png', ['params'])
  if (example.copyright) migrated.copyright = `© ${new Date().getFullYear()} ${owner.name}`
  return { config: migrated, mainSections: example.params?.mainsections }
}

// The section a theme lists on its home page: the example says (mainSections), or the
// templates do (`where .Site.RegularPages "Section" "post"`), else Hugo's usual "posts".
function detectSection(theme, mainSections) {
  const declared = Array.isArray(mainSections) ? mainSections.find(s => typeof s === 'string' && /^[\w-]+$/.test(s)) : null
  if (declared) return declared
  const counts = new Map()
  const layouts = path.join(theme.dir, 'layouts')
  if (fs.existsSync(layouts)) {
    for (const entry of fs.readdirSync(layouts, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue
      const text = fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8')
      for (const m of text.matchAll(/"(?:Section|Type)"\s+"(posts?|blog|articles?|notes|writings?)"/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'posts'
}

// ---------- TOML ----------

// Configs are written as TOML: Hugo reads JSON numbers as floats, and some templates index
// with them. Root keys first, then tables, then arrays of tables (TOML's ordering rules).
const tomlKey = k => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k))
function tomlValue(v) {
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.map(tomlValue).join(', ')}]`
  if (isObj(v)) return `{ ${Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => `${tomlKey(k)} = ${tomlValue(x)}`).join(', ')} }`
  return '""'
}
export function toToml(obj, trail = [], lines = []) {
  const entries = Object.entries(obj).filter(([, v]) => v != null)
  const isTableArray = v => Array.isArray(v) && v.length > 0 && v.every(isObj)
  const isTable = v => isObj(v) && Object.keys(v).length > 0
  const plain = entries.filter(([, v]) => !isTable(v) && !isTableArray(v))
  if (trail.length && plain.length) lines.push(`\n[${trail.map(tomlKey).join('.')}]`)
  for (const [k, v] of plain) lines.push(`${tomlKey(k)} = ${tomlValue(v)}`)
  for (const [k, v] of entries.filter(([, v]) => isTable(v))) toToml(v, [...trail, k], lines)
  for (const [k, v] of entries.filter(([, v]) => isTableArray(v))) {
    for (const item of v) {
      lines.push(`\n[[${[...trail, k].map(tomlKey).join('.')}]]`)
      for (const [k2, x] of Object.entries(item).filter(([, x]) => x != null)) lines.push(`${tomlKey(k2)} = ${tomlValue(x)}`)
    }
  }
  return trail.length ? lines : `${lines.join('\n').trim()}\n`
}

// ---------- building ----------

function writeSite(dir, theme, data, rung, params, baseURL, example, section, modules) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'themes'), { recursive: true })
  fs.symlinkSync(theme.dir, path.join(dir, 'themes', 't'))
  // Hugo Module dependencies live where Hugo looks when there's no Go: themes/<module path>.
  for (const [modPath, modDir] of Object.entries(modules)) {
    const link = path.join(dir, 'themes', ...modPath.split('/'))
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(modDir, link)
  }
  const configs = []
  if (rung.cfg && example) {
    // The example site's assets/data/static are what its params point at (logos, data files).
    for (const sub of ['assets', 'data', 'i18n', 'static']) {
      const from = path.join(theme.exampleDir, sub)
      if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, sub), { recursive: true })
    }
    fs.writeFileSync(path.join(dir, 'example.toml'), toToml(example.config))
    configs.push(path.join(dir, 'example.toml'))
  }
  const extraTaxonomies = Object.fromEntries((rung.taxa ?? []).map(plural => [plural.replace(/s$/, ''), plural]))
  const { files, images, config } = siteSource(data, { baseURL, section, authorShape: rung.author, taxonomies: TAXO[rung.taxo], coverShape: COVERS[rung.cover], extraTaxonomies,
    params: { ...pictureParams(theme.dir), ...params } })
  files['ryt.toml'] = toToml(config)
  for (const [p, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true })
    fs.writeFileSync(path.join(dir, p), text)
  }
  for (const img of images) {
    fs.mkdirSync(path.dirname(path.join(dir, img.path)), { recursive: true })
    fs.copyFileSync(cachedImage(IMAGES, img.kind, img.seed), path.join(dir, img.path))
  }
  configs.push(path.join(dir, 'ryt.toml'))
  return configs
}

const SECTION_NAMES = ['posts', 'post', 'blog', 'articles']
const cmpVersion = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0 }
const readIf = f => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }

// The error tells us which single thing to change next. Returns false when out of options.
function nextRung(r, error, hasExample) {
  // r.npm: undefined = the theme has no npm dependencies; false = not installed yet.
  // Things the theme needs that we can provide: keep everything else as it is and retry.
  const missingModule = /module "([^"]+)" not found/.exec(error)?.[1]
  if (missingModule && !(r.modules ?? []).includes(missingModule) && (r.modules ?? []).length < 40) return { ...r, modules: [...(r.modules ?? []), missingModule] }
  if (/Can't find stylesheet|node_modules|Could not resolve/.test(error) && r.npm === false) return { ...r, npm: true }
  if (/Dart Sass|TOCSS-DART/.test(error) && !r.sass) return { ...r, sass: true }
  // Removed APIs: go straight to the newest Hugo from before the removal. The error usually
  // names the version; .Site.Author/Authors/Social (removed after 0.124) often fail without one.
  const removedIn = /will be removed in Hugo v?(\d+\.\d+)/.exec(error)?.[1] ?? /deprecated in Hugo v?(\d+\.\d+)[^.]*and subsequently removed/.exec(error)?.[1]
    ?? (/can't evaluate field (Author|Authors|Social) in type (page\.Site|\*hugolib\.SiteInfo)|\.Site\.(Author|Authors|Social)\b/.test(error) ? '0.124' : null)
  if (removedIn) {
    const older = HUGO_VERSIONS.findIndex(v => cmpVersion(v, removedIn) < 0)
    if (older > r.ver) return { ...r, ver: older }
  }
  // A theme that paginates every page of a section it assumes is a list: name it differently.
  if (/pagination not supported for this page/.test(error) && (r.sec ?? 0) < SECTION_NAMES.length - 1) return { ...r, sec: (r.sec ?? 0) + 1 }
  const taxonomy = /no taxonomy configuration found for "\/([\w-]+)\//.exec(error)?.[1]
  if (taxonomy && !(r.taxa ?? []).includes(taxonomy)) return { ...r, taxa: [...(r.taxa ?? []), taxonomy] }
  if (/cover/i.test(error) && r.cover < COVERS.length - 1) return { ...r, cover: r.cover + 1 }
  if (/[Aa]uthor[^>]*>: (range can't iterate over|can't evaluate field \w+ in type string)|in type string/.test(error) && r.author === 'string') return { ...r, author: 'map' }
  if (/(\.Params\.(images?|thumbnail|featured\w*)|\bimage\b|resize|\.Fill|\.Fit|\.Crop|imaging)/i.test(error) && r.cover < COVERS.length - 1) return { ...r, cover: COVERS.length - 1 }
  if (/render of "\/(from|categories|tags|authors|series)|taxonomy|\.terms\.html|term\.html|list\.rss/.test(error) && r.taxo < TAXO.length - 1) return { ...r, taxo: r.taxo + 1 }
  if (/removed|deprecated|can't evaluate field (Hugo|Author|Social)|no such template "_internal|not defined|unknown output format|unknown function/.test(error) && r.ver < HUGO_VERSIONS.length - 1) return { ...r, ver: r.ver + 1 }
  if (r.cfg && hasExample) return { ...r, cfg: false }
  if (r.ver < HUGO_VERSIONS.length - 1) return { ...r, ver: r.ver + 1 }
  return false
}

// A Hugo failure as { full, cause }: `full` (paths and colour codes removed) drives the
// next-rung decision; `cause` is the innermost reason, which is what a person can read.
function describeError(e) {
  const text = `${e.stderr ?? ''}\n${e.stdout ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '')
  const line = text.split('\n').find(l => /ERROR|Error:/.test(l)) ?? (e.killed ? 'the build took too long' : e.message?.split('\n')[0] ?? 'build failed')
  const full = line.replace(/^.*?(ERROR|Error:)\s*/, '').replace(/"?\/\S*?\/(?:work\/[^/]+|themes\/[^/]+\/[0-9a-f]{12})\//g, '"')
  const cause = full.split(/execute of template failed: |error calling \w+: |failed to render pages: /).pop().trim()
  return { full, cause: cause.slice(0, 220) }
}

const plainTitles = data => data.recs.filter(r => /^[\w ]+$/.test(r.title)).map(r => r.title)

function verify(out, data, section) {
  const titles = plainTitles(data)
  if (!titles.length) return true
  const html = ['index.html', `${section}/index.html`].map(f => path.join(out, f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('')
  return titles.filter(t => html.includes(t)).length >= Math.min(2, titles.length)
}

// What a theme lets you configure = the params its templates read:
//   {{ if .Site.Params.X }} / {{ if (not …) }} / {{ if and … }}   -> on/off switch
//   eq .Site.Params.X "dark"                                     -> a choice (collect values)
//   flag-like names (ShowToc, hideMeta, disableX…)               -> on/off switch
//   anything else                                                -> a value
// .Site.Params.X, site.Params.X, and .Param "X" (page value falling back to the site's).
const PARAM = /(?:(?:\$\.Site|\.Site|\bsite)\.Params\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)|\.Param\s+"([A-Za-z_][\w.]*)")/g
const FLAG_NAME = /^(show|hide|disable|enable|use|is|has|display|toc)/i
const CONDITION = /\{\{-?\s*(?:else\s+)?(?:if|and|or)\s+(?:(?:not|and|or)\s+|\(\s*)*$/
const PERSONAL = /(^|\.)(authors?|email|avatar\w*|social\w*|github|gitlab|twitter|x|linkedin|mastodon|facebook|instagram|youtube|bio|info|description|subtitle|title|copyright|\w*analytics\w*|disqus\w*|comments?|utterances|giscus|images?|logo\w*|favicon\w*|icons?|\w*url|links?|keywords|mainsections|homeinfoparams|profilemode|since|location|company|website|keybase|license|menus?|languages?|i18n|cover|banner|assets|css|js|customcss|customjs|plausible\w*|umami\w*|matomo\w*|google\w*|baidu\w*|cdn\w*)($|\.)/

// The owner's picture, under whatever top-level param the theme reads it from (authorimage,
// avatar, profilePicture…): themes whose look centres on a profile only show it then.
const PICTURE = /^(avatar\w*|author_?(image|img|avatar|photo|picture)|profile_?(image|img|pic|picture|photo)|(user_?)?photo|portrait|headshot|picture)$/i
const pictureCache = new Map()
function pictureParams(themeDir) {
  if (!pictureCache.has(themeDir)) {
    const keys = new Set()
    const layouts = path.join(themeDir, 'layouts')
    for (const entry of fs.existsSync(layouts) ? fs.readdirSync(layouts, { withFileTypes: true, recursive: true }) : []) {
      if (!entry.isFile() || !/\.html$/.test(entry.name)) continue
      for (const m of fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8').matchAll(PARAM)) {
        const key = m[1] ?? m[2]
        if (!key.includes('.') && PICTURE.test(key)) keys.add(key)
      }
    }
    pictureCache.set(themeDir, Object.fromEntries([...keys].map(k => [k, 'ryt-avatar.png'])))
  }
  return pictureCache.get(themeDir)
}

function templateOptions(themeDir) {
  const uses = new Map()
  const layouts = path.join(themeDir, 'layouts')
  if (!fs.existsSync(layouts)) return []
  for (const entry of fs.readdirSync(layouts, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !/\.(html|xml|json)$/.test(entry.name)) continue
    const text = fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8')
    for (const m of text.matchAll(PARAM)) {
      const key = m[1] ?? m[2]
      const u = uses.get(key.toLowerCase()) ?? { key, count: 0, condition: 0, values: new Set() }
      u.count++
      if (CONDITION.test(text.slice(Math.max(0, m.index - 40), m.index))) u.condition++
      const around = text.slice(Math.max(0, m.index - 12), m.index + m[0].length + 40)
      const eq = /eq\s+\S+\s+"([^"{}]{1,30})"|eq\s+"([^"{}]{1,30})"\s+\S+/.exec(around)
      if (eq) u.values.add(eq[1] ?? eq[2])
      uses.set(key.toLowerCase(), u)
    }
  }
  return [...uses.values()]
    .filter(u => !PERSONAL.test(u.key.toLowerCase()))
    .map(u => u.values.size >= 2
      ? { key: u.key, type: 'enum', values: [...u.values].sort(), example: '', count: u.count }
      : u.condition === u.count || FLAG_NAME.test(u.key.split('.').pop())
        ? { key: u.key, type: 'bool', example: false, count: u.count }
        : { key: u.key, type: 'text', example: '', count: u.count })
}

function exampleOptions(params, prefix = '', depth = 0, out = []) {
  for (const [k, v] of Object.entries(params ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (PERSONAL.test(key.toLowerCase()) || out.length >= 40) continue
    if (isObj(v)) {
      if (depth < 2) exampleOptions(v, key, depth + 1, out)
    } else if (typeof v === 'boolean') out.push({ key, type: 'bool', example: v })
    else if (typeof v === 'number') out.push({ key, type: 'number', example: v })
    else if (typeof v === 'string' && v.length <= 60 && !v.includes('\n')) out.push({ key, type: /^#[0-9a-f]{3,8}$/i.test(v) ? 'color' : 'text', example: v })
  }
  return out
}

const rank = o => ({ enum: 0, bool: 1, color: 2, number: 3, text: 4 })[o.type] ?? 5

// Example values win (real defaults and types); the template scan adds everything else.
function mergeOptions(fromTemplates, fromExample) {
  const byKey = new Map(fromTemplates.map(o => [o.key.toLowerCase(), o]))
  for (const o of fromExample) {
    const scanned = byKey.get(o.key.toLowerCase())
    byKey.set(o.key.toLowerCase(), scanned?.type === 'enum' ? { ...scanned, example: o.example } : { ...scanned, ...o, key: scanned?.key ?? o.key })
  }
  return [...byKey.values()]
    .sort((a, b) => rank(a) - rank(b) || (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 30)
    .map(({ count, ...o }) => o)
}

// Every page gets the RYT runtime (load signal, link routing, the in-theme send form) and
// the person's custom CSS.
function inject(out, css) {
  const tag = `<script src="/__ryt/site.js" defer></script>${css ? `<style id="ryt-custom">${css.replace(/<\/style/gi, '')}</style>` : ''}`
  for (const entry of fs.readdirSync(out, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue
    const file = path.join(entry.parentPath, entry.name)
    const html = fs.readFileSync(file, 'utf8')
    const i = html.search(/<\/head>/i)
    fs.writeFileSync(file, i >= 0 ? html.slice(0, i) + tag + html.slice(i) : tag + html)
  }
}

// Builds and returns { id, key, ms, rung }, or throws with a readable reason.
// onProgress(step, text) reports what's happening, for the "applying" sheet.
// requirePosts: false when the build is only a sample to measure the theme's style; then any
// theme that renders qualifies (docs and landing themes too). Recorded separately.
export async function buildSite(user, data, { onProgress = () => {}, requirePosts = true } = {}) {
  const site = user.theme.site
  onProgress('fetch', 'Getting the theme')
  const theme = await ensureTheme(site.slug)
  const compatKey = requirePosts ? theme.key : `${theme.key}#style`
  const known = readCompat()[compatKey]
  if (known && !known.ok) throw new Error(known.error)

  const id = `${user.handle}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
  const out = siteOut(id)
  const dir = path.join(ROOT, 'work', user.handle)
  const baseURL = `${siteOrigin(id)}/`
  const { css } = sanitizeCss(site.css ?? '')
  const t0 = Date.now()

  onProgress('migrate', 'Bringing over the theme’s own settings')
  const example = await migratedExample(theme, data.owner, baseURL)
  const detected = detectSection(theme, example?.mainSections)
  // Other names the posts' section can take, for themes that treat one name specially.
  const sections = [detected, ...SECTION_NAMES.filter(n => n !== detected)]
  // Start with every library module the demo declares, instead of discovering them one by one.
  const declared = (example?.config.module?.imports ?? []).map(i => i.path)
  // Themes that mount node_modules (in their own config) need their npm packages from the start.
  const hasNpm = npmDeps(theme.dir).length > 0
  const mountsNpm = hasNpm && ['hugo.toml', 'hugo.yaml', 'config.toml', 'config.yaml', 'theme.toml'].some(f => /node_modules/.test(readIf(path.join(theme.dir, f))))
  let rung = known?.rung ?? { cfg: Boolean(example), author: 'string', taxo: 0, cover: 0, ver: 0, sass: false, modules: declared, taxa: [], npm: hasNpm ? mountsNpm : undefined }
  const attempts = []

  for (let attempt = 0; attempt < 24; attempt++) {
    onProgress('build', attempt === 0 ? 'Building your pages' : `Adjusting for this theme (step ${attempt + 1})`)
    const bin = await ensureHugo(HUGO_VERSIONS[rung.ver])
    if (rung.sass) {
      onProgress('build', 'Getting the stylesheet compiler this theme uses')
      await ensureSass()
    }
    if (rung.npm) {
      onProgress('build', 'Getting the packages this theme uses')
      await ensureNpm(theme.dir).catch(() => {})
    }
    const modules = {}
    for (const modPath of rung.modules ?? []) {
      onProgress('build', `Getting ${modPath.split('/').slice(-2).join('/')}, a part this theme uses`)
      const versions = goModVersions(theme.dir, ...Object.values(modules))
      try {
        modules[modPath] = await ensureModule(modPath, versions[modPath])
      } catch {
        // Unfetchable: leave it out, Hugo will report it and the ladder moves on.
      }
    }
    // A remembered build already stores the section that worked.
    const section = known?.section ?? sections[rung.sec ?? 0]
    const configs = writeSite(dir, theme, data, rung, site.params ?? {}, baseURL, example, section, modules)
    try {
      await hugoRun(bin, ['--source', dir, '--destination', out, '--cleanDestinationDir', '--logLevel', 'error', '--noBuildLock',
        '--cacheDir', path.join(ROOT, 'cache'), '--config', configs.join(',')])
      onProgress('check', 'Checking your ryts are on the page')
      // No home page at all means Hugo found no templates: nothing to show or measure.
      const emptyHome = !fs.existsSync(path.join(out, 'index.html'))
      if (emptyHome || (requirePosts && !verify(out, data, section))) {
        attempts.push({ rung, error: emptyHome ? 'the theme produced no pages' : 'home page doesn’t list posts' })
        const next = rung.cfg ? { ...rung, cfg: false } : false
        if (!next) break
        rung = next
        continue
      }
      if (!known) {
        // First success for this theme commit: remember the rung, section and options.
        const fromExample = example ? exampleOptions(example.config.params) : []
        writeCompat(compatKey, { ok: true, rung, section, options: mergeOptions(templateOptions(theme.dir), fromExample), checkedAt: new Date().toISOString() })
      }
      inject(out, css)
      onProgress('done', 'Done')
      return { id, key: theme.key, ms: Date.now() - t0, rung, section, out, theme, at: new Date().toISOString() }
    } catch (e) {
      const { full, cause } = describeError(e)
      attempts.push({ rung, error: cause })
      // A known-good rung that fails now is the person's own options, not the theme.
      if (known) throw new Error(`Your theme options broke the build: ${cause}`)
      const next = nextRung(rung, full, Boolean(example))
      if (!next) break
      rung = next
    }
  }
  fs.rmSync(out, { recursive: true, force: true })
  // The first error (newest Hugo, theme's own setup) is the most telling one.
  // If it ever built, the honest reason is that it doesn't list posts (a docs/landing theme).
  // Otherwise the first error (newest Hugo, theme's own setup) is the most telling one.
  const reason = attempts.some(a => a.error === 'home page doesn’t list posts')
    ? 'its home page doesn’t list posts (it’s probably a docs, portfolio or landing-page theme)'
    : attempts[0]?.error ?? 'build failed'
  const error = `Not compatible: ${reason}`
  writeCompat(compatKey, { ok: false, error, attempts: attempts.slice(0, 6), checkedAt: new Date().toISOString() })
  throw new Error(error)
}

const readMeta = () => (fs.existsSync(path.join(ROOT, 'themes.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.json'), 'utf8')) : {})

export function themeOptions(slug) {
  const meta = readMeta()[slug]
  return meta ? readCompat()[meta.key]?.options ?? [] : []
}

// Compatibility per catalog slug, for gallery badges.
export function compatBySlug() {
  const compat = readCompat()
  // Whether a theme's design could be measured (style extraction), else the older full-build result.
  return Object.fromEntries(Object.entries(readMeta()).map(([slug, m]) => [slug, compat[`${m.key}#style`]]).filter(([, c]) => c))
}

// Keep the live build and the one before it for each person; drop the rest.
export function pruneBuilds(handle, keep) {
  const dir = path.join(ROOT, 'out')
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(`${handle}-`) && !keep.includes(name)) fs.rmSync(path.join(dir, name), { recursive: true, force: true })
  }
}
