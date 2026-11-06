// Turns a linked git repo (a fork of this repo) into a live page bundle.
//
//   clone -> read manifest -> copy ONLY apps/page + packages -> size check -> conformance check
//
// A failed build never touches the live bundle: the previous good build keeps serving.
// In production this would run in the fork's own GitHub Actions and upload a signed artifact;
// the prototype runs it locally so the whole loop is visible.

import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SUPPORTED_CONTRACTS } from '../../packages/contract/index.js'
import { DATA_DIR, REPO_ROOT, MAX_BUNDLE_BYTES } from './config.mjs'
import { newId } from './db.mjs'

const run = promisify(execFile)
const RUNNER = path.join(REPO_ROOT, 'apps/platform/check-runner.mjs')
export const bundleDir = id => path.join(DATA_DIR, 'bundles', id)

// Local paths are cloned through file:// so --depth works; anything else goes to git as-is.
function cloneUrl(url) {
  if (/^(https?|git|ssh|file):\/\//.test(url) || /^[\w.-]+@[\w.-]+:/.test(url)) return url
  return `file://${path.resolve(url)}`
}

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += fs.statSync(path.join(entry.parentPath, entry.name)).size
  }
  return total
}

// Runs the platform's OWN copy of the checker (a fork can't edit it) in a child process with
// Node's permission model: read-only access to the bundle and the checker, nothing else.
async function conformance(dir) {
  const args = ['--permission', `--allow-fs-read=${dir}`, `--allow-fs-read=${path.join(REPO_ROOT, 'packages')}`, `--allow-fs-read=${RUNNER}`, RUNNER, dir]
  try {
    const { stdout } = await run(process.execPath, args, { timeout: 15000, maxBuffer: 1024 * 1024 })
    return JSON.parse(stdout)
  } catch (e) {
    return { ok: false, error: e.killed ? 'check timed out (15s)' : `check crashed: ${e.stderr || e.message}`.slice(0, 500) }
  }
}

export async function buildFork(user, { url, ref }) {
  const id = `b${Date.now().toString(36)}${newId().slice(0, 3)}`
  const work = path.join(DATA_DIR, 'work', id)
  const out = bundleDir(id)
  const build = { id, url, ref, at: new Date().toISOString(), status: 'building', sha: null, log: [], checks: null }
  const log = line => build.log.push(line)

  try {
    log(`$ git clone --depth 1 --branch ${ref} ${url}`)
    await run('git', ['clone', '--quiet', '--depth', '1', '--branch', ref, cloneUrl(url), work], { timeout: 60000 })
    build.sha = (await run('git', ['-C', work, 'rev-parse', '--short', 'HEAD'])).stdout.trim()
    log(`checked out ${build.sha}`)

    const page = path.join(work, 'apps/page')
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(page, 'manifest.json'), 'utf8'))
    } catch {
      throw new Error('apps/page/manifest.json is missing or not valid JSON')
    }
    if (!SUPPORTED_CONTRACTS.includes(manifest.contract)) {
      throw new Error(`manifest asks for contract ${manifest.contract}; this platform supports ${SUPPORTED_CONTRACTS.join(', ')}`)
    }
    for (const file of ['index.html', 'client.js', 'render.js']) {
      if (!fs.existsSync(path.join(page, file))) throw new Error(`apps/page/${file} is missing`)
    }
    log(`manifest ok: "${manifest.name ?? 'unnamed'}", contract ${manifest.contract}`)

    // Only the frontend leaves the fork. Backend changes in a fork are ignored by design.
    const noLinks = src => !fs.lstatSync(src).isSymbolicLink()
    fs.cpSync(page, path.join(out, 'apps/page'), { recursive: true, filter: noLinks })
    fs.cpSync(path.join(work, 'packages'), path.join(out, 'packages'), { recursive: true, filter: noLinks })
    const size = dirSize(out)
    log(`bundle: apps/page + packages, ${(size / 1024).toFixed(1)} KB`)
    if (size > MAX_BUNDLE_BYTES) throw new Error(`bundle is ${(size / 1048576).toFixed(1)} MB, limit is ${MAX_BUNDLE_BYTES / 1048576} MB`)

    log('running conformance check against edge-case fixtures…')
    build.checks = await conformance(out)
    if (build.checks.error) throw new Error(build.checks.error)
    for (const r of build.checks.results) log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.fixture.padEnd(8)} ${String(r.ms).padStart(4)}ms  ${r.problems.join('; ')}`)
    if (!build.checks.ok) throw new Error('conformance check failed')

    build.status = 'passed'
    build.defaultPreset = manifest.defaultPreset ?? 'base'
    log('build passed ✓')
  } catch (e) {
    build.status = 'failed'
    build.error = e.message
    log(`build failed: ${e.message}`)
    fs.rmSync(out, { recursive: true, force: true })
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }

  const fork = user.theme.fork
  fork.builds.unshift(build)
  fork.builds = fork.builds.slice(0, 10)
  if (build.status === 'passed') fork.live = build.id
  else if (fork.live) log(`previous build ${fork.live} stays live`)
  return build
}
