// Spike (2026-11-06): measures how many real Hugo themes render a person's ryts with zero
// per-theme code. Needs the platform running (reads /api/v1/pages/aneesh) and Hugo binaries in
// .data/tools (see docs/adr/0008). Usage: node scripts/spikes/hugo-compat.mjs
// Measures how many real Hugo themes can render a person's ryts with zero per-theme code.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
const { siteSource } = await import(`${REPO}/apps/platform/site-source.mjs`)
const ROOT = `${REPO}/.data/ssg`
const LADDER = [['0.169.0', `${REPO}/.data/tools/hugo`], ...['0.155.3', '0.145.0', '0.134.3', '0.123.8'].map(v => [v, `${REPO}/.data/tools/hugo-${v}/hugo`])]
const SECURITY = `\n[security]\n  enableInlineShortcodes = false\n[security.exec]\n  allow = ['^(dart-)?sass(-embedded)?$']\n[security.http]\n  urls = ['^https://(unpkg\\.com|cdn\\.jsdelivr\\.net)/']\n[security.funcs]\n  getenv = ['^HUGO_']\n`

const ours = ['github.com/adityatelange/hugo-PaperMod', 'github.com/theNewDynamic/gohugo-theme-ananke', 'github.com/panr/hugo-theme-terminal', 'github.com/luizdepra/hugo-coder', 'github.com/janraasch/hugo-bearblog', 'github.com/CaiJimmy/hugo-theme-stack', 'github.com/Vimux/Mainroad', 'github.com/halogenica/beautifulhugo']
const list = (await (await fetch('https://raw.githubusercontent.com/gohugoio/hugoThemesSiteBuilder/main/themes.txt')).text()).split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
const sample = list.filter((_, i) => i % 16 === 7)
const targets = [...new Set([...ours, ...sample])]
const data = await (await fetch('http://localhost:4000/api/v1/pages/aneesh')).json()
const titles = data.recs.filter(r => /^[\w ]+$/.test(r.title)).map(r => r.title)

// Removes [module] tables so a theme that imports itself as a module uses the themes dir instead.
function stripModule(text, ext) {
  if (ext === '.toml') {
    let skip = false
    return text.split('\n').filter(l => {
      const h = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(l)
      if (h) skip = /^module(\.|$)/.test(h[1].trim())
      return !skip
    }).join('\n')
  }
  if (ext === '.yaml' || ext === '.yml') {
    let skip = false
    return text.split('\n').filter(l => {
      if (/^\S/.test(l)) skip = /^module\s*:/.test(l)
      return !skip
    }).join('\n')
  }
  return text
}

async function buildTheme(mod) {
  const segs = mod.split('/')
  const repoUrl = `https://${segs.slice(0, 3).join('/')}`
  const sub = segs.slice(3).filter(s => !/^v\d+$/.test(s)).join('/')
  const name = segs.slice(1, 3).join('__').toLowerCase()
  const checkout = path.join(ROOT, 'themes-src', name)
  const site = path.join(ROOT, 'sites', name)
  const out = path.join(ROOT, 'out', name)
  const result = { mod, name, ok: false }
  try {
    if (!fs.existsSync(checkout)) await run('git', ['clone', '-q', '--depth', '1', repoUrl, checkout], { timeout: 90000 })
    const theme = sub ? path.join(checkout, sub) : checkout
    const ex = path.join(theme, 'exampleSite')
    const cfg = ['hugo.toml', 'config.toml', 'hugo.yaml', 'config.yaml', 'hugo.yml', 'config.yml'].map(f => path.join(ex, f)).find(f => fs.existsSync(f))
    const attempts = []
    const TAXO = {
      full: '',
      basic: s => s.replace('  from = "from"\n', ''),
      none: s => 'disableKinds = ["taxonomy", "term"]\n' + s.replace(/\[taxonomies\][^[]*/, ''),
    }
    for (const useCfg of cfg ? [true, false] : [false]) {
     for (const [taxo, tx] of Object.entries(TAXO)) {
      for (const [version, hugo] of LADDER) {
       for (const authorShape of ['string', 'map']) {
        if (authorShape === 'map' && !attempts.at(-1)?.includes('in type string')) continue
        fs.rmSync(site, { recursive: true, force: true })
        for (const dir of ['assets', 'data', 'i18n', 'static']) if (fs.existsSync(path.join(ex, dir))) fs.cpSync(path.join(ex, dir), path.join(site, dir), { recursive: true })
        const files = siteSource(data, { flavor: 'hugo', baseURL: `http://127.0.0.1:4002/${name}/`, authorShape })
        for (const [p, text] of Object.entries(files)) {
          fs.mkdirSync(path.dirname(path.join(site, p)), { recursive: true })
          fs.writeFileSync(path.join(site, p), text)
        }
        fs.mkdirSync(path.join(site, 'themes'), { recursive: true })
        fs.symlinkSync(theme, path.join(site, 'themes', 't'))
        fs.writeFileSync(path.join(site, 'ryt.toml'), 'theme = "t"\nthemesDir = "themes"\nenableGitInfo = false\n' + (tx ? tx(files['ryt.toml']) : files['ryt.toml']) + SECURITY)
        const configs = [path.join(site, 'ryt.toml')]
        if (useCfg) {
          const copy = path.join(site, `example${path.extname(cfg)}`)
          fs.writeFileSync(copy, stripModule(fs.readFileSync(cfg, 'utf8'), path.extname(cfg)))
          configs.unshift(copy)
        }
        try {
          await run(hugo, ['--source', site, '--destination', out, '--cleanDestinationDir', '--logLevel', 'error', '--config', configs.join(',')], { timeout: 60000, env: { PATH: process.env.PATH, HOME: process.env.HOME } })
          const html = ['index.html', 'posts/index.html'].map(f => path.join(out, f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('')
          const shown = titles.filter(t => html.includes(t)).length
          if (shown >= Math.min(3, titles.length)) return Object.assign(result, { ok: true, version, exampleConfig: useCfg, shown, taxo, authorShape })
          attempts.push(`${version}${useCfg ? '+cfg' : ''}: built, but only ${shown} ryts on home/posts`)
        } catch (e) {
          attempts.push(`${version}${useCfg ? '+cfg' : ''}/${taxo}: ${(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l))?.replace(/\/home\S+\/sites\/[^/]+\//g, '').split(/execute of template failed: |error calling partial: /).at(-1).slice(0, 200) ?? 'failed'}`)
        }
       }
      }
     }
    }
    result.why = attempts.at(-1)
    result.first = attempts[0]
  } catch (e) {
    result.why = `clone failed: ${e.message.slice(0, 100)}`
  }
  return result
}

const results = []
const queue = [...targets]
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const r = await buildTheme(queue.shift())
    results.push(r)
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.mod.padEnd(56)} ${r.ok ? `hugo ${r.version}${r.exampleConfig ? ' + example config' : ''}, taxonomies: ${r.taxo}, author: ${r.authorShape}` : r.why}`)
  }
}))
const ok = results.filter(r => r.ok)
console.log(`\n${ok.length}/${results.length} themes render the ryts (${Math.round(ok.length / results.length * 100)}%)`)
const byVersion = Object.groupBy(ok, r => r.version)
console.log('by taxonomy rung:', Object.entries(Object.groupBy(ok, r => r.taxo)).map(([v, l]) => `${v}: ${l.length}`).join(', '))
console.log('by hugo version:', Object.entries(byVersion).map(([v, l]) => `${v}: ${l.length}`).join(', '))
fs.writeFileSync(path.join(ROOT, 'harness-results.json'), JSON.stringify(results, null, 2))
