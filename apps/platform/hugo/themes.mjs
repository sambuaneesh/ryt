// Theme sources and Hugo binaries, fetched lazily and shared by everyone.
//
//   ensureTheme(slug)   one tarball download per theme commit (GitHub/GitLab/Codeberg archive
//                       endpoints), demo content and screenshots skipped, cached on disk
//   ensureHugo(version) official Hugo release, downloaded the first time a theme needs it
//   ensureSass()        official Dart Sass release, for themes whose SCSS needs it
//   ensureModule(path)  a Hugo Module dependency (e.g. a Bootstrap SCSS module), fetched from
//                       its repo at the version the theme's go.mod pins. Hugo finds modules
//                       placed under themes/<module path>, so no Go toolchain is needed.

import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Readable } from 'node:stream'
import { DATA_DIR } from '../config.mjs'
import { detail } from './catalog.mjs'

const run = promisify(execFile)
const ROOT = path.join(DATA_DIR, 'hugo')
const TOOLS = path.join(DATA_DIR, 'tools')
const REFRESH = 7 * 24 * 60 * 60 * 1000
const MAX_ARCHIVE = 60 * 1024 * 1024

// Newest first. Themes declare a minimum Hugo version but never a maximum, so a theme that
// uses something Hugo removed builds with an older release instead.
export const HUGO_VERSIONS = ['0.169.0', '0.155.3', '0.145.0', '0.134.3', '0.123.8']

const locks = new Map()
const once = (key, fn) => {
  if (!locks.has(key)) locks.set(key, fn().finally(() => locks.delete(key)))
  return locks.get(key)
}

async function download(url, dest, members = ['hugo']) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'user-agent': 'ryt-prototype' } })
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
  if (Number(res.headers.get('content-length')) > MAX_ARCHIVE) throw new Error('download is too large')
  fs.mkdirSync(dest, { recursive: true })
  const args = ['-xz', '-C', dest, ...members]
  await new Promise((resolve, reject) => {
    const tar = spawn('tar', args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let size = 0
    let err = ''
    tar.stderr.on('data', d => (err += d))
    tar.on('error', reject)
    tar.on('close', code => (code === 0 ? resolve() : reject(new Error(`could not unpack archive: ${err.slice(0, 200)}`))))
    Readable.fromWeb(res.body)
      .on('error', e => {
        tar.kill()
        reject(new Error(`download interrupted: ${e.message}`))
      })
      .on('data', chunk => {
        size += chunk.length
        if (size > MAX_ARCHIVE) tar.kill()
      })
      .pipe(tar.stdin)
  })
}

export function ensureHugo(version) {
  const bin = path.join(TOOLS, `hugo-${version}`, 'hugo')
  if (fs.existsSync(bin)) return Promise.resolve(bin)
  return once(`hugo:${version}`, async () => {
    await download(`https://github.com/gohugoio/hugo/releases/download/v${version}/hugo_extended_${version}_linux-amd64.tar.gz`, path.dirname(bin))
    return bin
  })
}

// The exact commit, so caches and compatibility results are keyed by what was actually built.
async function latestCommit({ url, ref }) {
  const { stdout } = await run('git', ['ls-remote', url, ref ? `refs/heads/${ref}` : 'HEAD'], { timeout: 20000 })
  const sha = /^([0-9a-f]{40})/.exec(stdout)?.[1]
  if (!sha) throw new Error('could not find the theme’s latest version')
  return sha
}

// Only what a build needs: no demo content, screenshots, videos or CI files. A blobless
// partial clone + sparse checkout downloads just those files, however big the repo is.
const SPARSE = ['/*', '!/exampleSite/content/', '!/images/', '!/.github/', '!*.mp4', '!*.mov', '!*.psd', '!*.gif', '!/exampleSite/static/images/demo*']
async function fetchSource({ url, ref, tag }, dest) {
  const git = (...args) => run('git', args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024 })
  const branch = tag ?? ref
  await git('clone', '--quiet', '--depth', '1', '--filter=blob:none', '--no-checkout', ...(branch ? ['--branch', branch] : []), url, dest)
  await git('-C', dest, 'sparse-checkout', 'set', '--no-cone', ...SPARSE)
  await git('-C', dest, 'checkout', '--quiet')
  fs.rmSync(path.join(dest, '.git'), { recursive: true, force: true })
}

const SASS_DIR = path.join(TOOLS, 'dart-sass')
export function ensureSass() {
  if (fs.existsSync(path.join(SASS_DIR, 'sass'))) return Promise.resolve(SASS_DIR)
  return once('sass', async () => {
    const res = await fetch('https://api.github.com/repos/sass/dart-sass/releases/latest', { headers: { 'user-agent': 'ryt-prototype' } })
    const version = (await res.json()).tag_name
    await download(`https://github.com/sass/dart-sass/releases/download/${version}/dart-sass-${version}-linux-x64.tar.gz`, TOOLS, [])
    return SASS_DIR
  })
}

// Versions pinned by go.mod files: `require path version` (single line or block).
export function goModVersions(...dirs) {
  const versions = {}
  for (const dir of dirs) {
    const file = path.join(dir, 'go.mod')
    if (!fs.existsSync(file)) continue
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/^\s*(?:require\s+)?([\w.-]+\.[a-z]{2,}\/[\w./-]+)\s+(v[\w.+-]+)/gm)) versions[m[1]] = m[2]
  }
  return versions
}

export function ensureModule(modPath, version) {
  if (!/^[\w.-]+\.[a-z]{2,}\/[\w.-]+\/[\w.-]+(\/[\w.-]+)*$/.test(modPath)) return Promise.reject(new Error(`unsupported module ${modPath}`))
  const clean = (version ?? '').replace(/\+incompatible$/, '')
  const [host, owner, repo, ...rest] = modPath.split('/')
  // One checkout per repository + version, shared by every module that lives inside it.
  const dir = path.join(ROOT, 'modules', `${host}__${owner}__${repo}@${clean || 'HEAD'}`)
  const finish = () => {
    // Major-version suffixes (/v5) usually mean the repo root; real subdirectories win if present.
    const sub = rest.join('/')
    const withoutMajor = rest.filter((p, i) => !(i === rest.length - 1 && /^v\d+$/.test(p))).join('/')
    for (const candidate of [sub, withoutMajor]) if (candidate && fs.existsSync(path.join(dir, candidate))) return path.join(dir, candidate)
    return dir
  }
  if (fs.existsSync(dir)) return Promise.resolve(finish())
  return once(`module:${dir}`, async () => {
    const url = `https://${host}/${owner}/${repo}`
    const tmp = path.join(ROOT, 'tmp', `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    const pseudo = /-(\d{14})-([0-9a-f]{12})$/.exec(clean)
    try {
      if (pseudo) {
        // A commit, not a tag: clone shallowly and fetch that commit.
        await run('git', ['init', '-q', tmp])
        await run('git', ['-C', tmp, 'remote', 'add', 'origin', url])
        const { stdout } = await run('git', ['ls-remote', url], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
        const full = stdout.split('\n').map(l => l.split('\t')[0]).find(sha => sha.startsWith(pseudo[2]))
        await run('git', ['-C', tmp, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', full ?? 'HEAD'], { timeout: 180000 })
        await run('git', ['-C', tmp, 'sparse-checkout', 'set', '--no-cone', ...SPARSE])
        await run('git', ['-C', tmp, 'checkout', '-q', 'FETCH_HEAD'])
        fs.rmSync(path.join(tmp, '.git'), { recursive: true, force: true })
      } else {
        await fetchSource({ url, tag: clean || null }, tmp)
      }
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true })
      // Fall back to the default branch if the pinned version can't be fetched.
      if (!clean) throw e
      await fetchSource({ url }, tmp)
    }
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    fs.renameSync(tmp, dir)
    return finish()
  })
}

const META = path.join(ROOT, 'themes.json')
const readMeta = () => (fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {})
const writeMeta = meta => {
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(META, JSON.stringify(meta, null, 2))
}

// Where the theme itself lives in its repo. Usually the root, but some repos are monorepos
// that keep the theme in a folder (docsy: theme/, others: themes/<name>/) next to a site.
const SKIP = new Set(['exampleSite', 'node_modules', 'docs', 'site', 'tests', 'test', '.git'])
export function themeRoot(dir) {
  if (fs.existsSync(path.join(dir, 'layouts'))) return dir
  const found = []
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || SKIP.has(e.name)) continue
      const sub = path.join(d, e.name)
      if (fs.existsSync(path.join(sub, 'layouts'))) found.push(sub)
      else if (depth < 2) walk(sub, depth + 1)
    }
  }
  walk(dir, 1)
  // A folder that says it's a theme wins over one that merely has layouts.
  return found.find(d => fs.existsSync(path.join(d, 'theme.toml'))) ?? found[0] ?? dir
}

function examplePaths(themeDir) {
  const exampleDir = path.join(themeDir, 'exampleSite')
  const exampleConfig = ['hugo.toml', 'config.toml', 'hugo.yaml', 'config.yaml', 'hugo.yml', 'config.yml', 'hugo.json', 'config.json']
    .map(f => path.join(exampleDir, f)).find(f => fs.existsSync(f)) ?? null
  return { exampleDir, exampleConfig }
}

// Entries recorded before themeRoot existed may point at a monorepo's root.
function withRoot(entry) {
  const dir = themeRoot(entry.dir)
  return dir === entry.dir ? entry : { ...entry, dir, ...examplePaths(dir) }
}

// Returns { slug, key, name, dir, exampleConfig, exampleDir }. key changes when the theme does.
export function ensureTheme(slug) {
  const known = readMeta()[slug]
  if (known && Date.now() - known.fetchedAt < REFRESH && fs.existsSync(known.dir)) return Promise.resolve(withRoot(known))
  return once(`theme:${slug}`, async () => {
    const info = await detail(slug)
    if (!info.repo) throw new Error('This theme has no public source repository listed.')
    const sha = await latestCommit(info.repo)
    const key = `${slug}@${sha.slice(0, 12)}`
    const dir = path.join(ROOT, 'themes', slug, sha.slice(0, 12))
    if (known?.key === key && fs.existsSync(known.dir)) {
      const meta = readMeta()
      meta[slug] = withRoot({ ...known, fetchedAt: Date.now() })
      writeMeta(meta)
      return meta[slug]
    }
    const tmp = path.join(ROOT, 'tmp', `${slug}-${Date.now()}`)
    await fetchSource(info.repo, tmp)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    fs.renameSync(tmp, dir)
    const themeDir = themeRoot(info.repo.subdir ? path.join(dir, info.repo.subdir) : dir)
    const entry = { slug, key, name: info.name, thumb: info.thumb, description: info.description, demo: info.demo, repo: info.repo.url, ...examplePaths(themeDir), dir: themeDir, fetchedAt: Date.now() }
    const meta = readMeta()
    meta[slug] = entry
    writeMeta(meta)
    return entry
  })
}

// npm packages a theme mounts or imports (Bootstrap, Font Awesome…). Only its runtime
// dependencies, with install scripts off, once per theme commit.
export const npmDeps = dir => {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies ?? {})
  } catch {
    return []
  }
}
export function ensureNpm(dir) {
  const done = path.join(dir, 'node_modules', '.ryt-installed')
  if (fs.existsSync(done) || !npmDeps(dir).length) return Promise.resolve()
  return once(`npm:${dir}`, async () => {
    // Installed in a folder of its own: inside the repo, npm may treat the theme as a
    // workspace member and install into the repo root instead.
    const { dependencies } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const tmp = path.join(ROOT, 'tmp', `npm-${Date.now()}`)
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'ryt-theme-deps', private: true, dependencies }))
    try {
      await run('npm', ['install', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'],
        { cwd: tmp, timeout: 180000, maxBuffer: 8 * 1024 * 1024 })
      fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true })
      fs.renameSync(path.join(tmp, 'node_modules'), path.join(dir, 'node_modules'))
      fs.writeFileSync(done, '')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
}

// Dart Sass (when installed) is on PATH so Hugo's css.Sass / toCSS can find `sass`.
export const hugoRun = (bin, args, opts = {}) =>
  run(bin, args, { timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { PATH: `${SASS_DIR}:${process.env.PATH}`, HOME: process.env.HOME }, ...opts })
