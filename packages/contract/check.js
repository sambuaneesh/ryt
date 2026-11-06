// Conformance check: renders a frontend against every fixture and reports problems.
// This is a QUALITY gate (does the page survive weird data?). The security boundary is
// the sandboxed iframe the platform serves forks in, not this check.

import { normalizePageData } from './index.js'
import { fixtures } from './fixtures.js'

const plain = /^[\w ]+$/

export async function runChecks(render, theme) {
  const results = []
  for (const f of fixtures()) {
    const problems = []
    const data = normalizePageData(f.data)
    let ms = 0
    try {
      const t0 = performance.now()
      const html = await render({ data, theme })
      ms = Math.round(performance.now() - t0)
      if (typeof html !== 'string') {
        problems.push('render() must return an HTML string')
      } else {
        if (!html.includes('data-ryt="page"')) problems.push('missing root hook data-ryt="page"')
        if (html.length > 3_000_000) problems.push('output larger than 3 MB')
        for (const bad of f.mustNotContain ?? []) {
          if (html.includes(bad)) problems.push('user content is not HTML-escaped (XSS)')
        }
        const missing = data.recs.slice(0, 50).find(r => plain.test(r.title) && !html.includes(r.title))
        if (missing) problems.push(`public rec "${missing.title}" is not shown (first 50 must appear)`)
      }
      if (ms > (f.budgetMs ?? 300)) problems.push(`too slow: ${ms}ms`)
    } catch (e) {
      problems.push(`render() threw: ${e?.message ?? e}`)
    }
    results.push({ fixture: f.name, ok: problems.length === 0, ms, problems })
  }
  return { ok: results.every(r => r.ok), results }
}
