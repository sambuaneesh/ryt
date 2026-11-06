// Run the conformance check on this checkout's apps/page, the same check the platform runs
// before a fork goes live. Usage: npm run check
import fs from 'node:fs'
import { render } from '../apps/page/render.js'
import { runChecks } from '../packages/contract/check.js'
import { resolveTheme } from '../packages/kit/index.js'

// The stylesheet must parse: one stray brace silently drops every rule after it.
const css = fs.readFileSync(new URL('../apps/page/style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
let depth = 0
for (const [i, ch] of [...css].entries()) {
  depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
  if (depth < 0) {
    console.log(`FAIL  style.css has an unmatched "}" near line ${css.slice(0, i).split('\n').length}`)
    process.exit(1)
  }
}
if (depth) {
  console.log('FAIL  style.css has an unclosed "{"')
  process.exit(1)
}

const { ok, results } = await runChecks(render, resolveTheme([]))
for (const r of results) {
  console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.fixture.padEnd(8)} ${String(r.ms).padStart(4)}ms  ${r.problems.join('; ')}`)
}
console.log(ok ? '\nall checks passed: this frontend can go live' : '\nchecks failed: the platform would keep your previous build live')
process.exit(ok ? 0 : 1)
