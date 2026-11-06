// Fresh demo state: reseed the database, (re)create the demo forks, and link the zine fork
// to @kai so one page already runs a forked frontend. Usage: npm run setup
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { DATA_DIR, FORKS_DIR, REPO_ROOT } from '../apps/platform/config.mjs'

fs.rmSync(DATA_DIR, { recursive: true, force: true })
execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts/demo-forks.mjs')], { stdio: 'inherit' })

const { loadDb, saveDb, userByHandle } = await import('../apps/platform/db.mjs')
const { buildFork } = await import('../apps/platform/builder.mjs')

const db = loadDb()
const kai = userByHandle(db, 'kai')
const url = path.join(FORKS_DIR, 'zine')
kai.theme.fork.url = url
const build = await buildFork(kai, { url, ref: 'main' })
console.log(build.log.join('\n'))
if (build.status === 'passed') kai.theme.mode = 'fork'
saveDb(db)
console.log(`\nready. run: npm start  →  http://localhost:4000`)
