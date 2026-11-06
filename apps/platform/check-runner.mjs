// Child process: loads a fork bundle's render() and runs the platform's conformance check.
// Started by builder.mjs under `node --permission` (read-only, bundle + checker only).

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runChecks } from '../../packages/contract/check.js'
import { resolveTheme } from '../../packages/kit/index.js'

const dir = process.argv[2]
const reply = result => process.stdout.write(JSON.stringify(result))

try {
  const mod = await import(pathToFileURL(path.join(dir, 'apps/page/render.js')).href)
  if (typeof mod.render !== 'function') reply({ ok: false, error: 'apps/page/render.js must export a render() function' })
  else reply(await runChecks(mod.render, resolveTheme([])))
} catch (e) {
  reply({ ok: false, error: `could not load apps/page/render.js: ${e.message}` })
}
