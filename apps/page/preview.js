// Local preview for the page frontend (npm run page, then open /preview.html). It plays the part
// of Recommend You This: waits for your page to say hello, then sends it sample data and a look,
// exactly as the real site does for a fork.

import { normalizePageData } from '../../packages/contract/index.js'
import { resolveTheme, SECTIONS } from '../../packages/kit/index.js'
import { sampleData } from './sample.js'

const presets = import.meta.glob('./themes/*.json', { eager: true, import: 'default' })
const byName = Object.fromEntries(Object.entries(presets).map(([file, p]) => [file.split('/').pop().replace('.json', ''), p]))
const frame = document.getElementById('page')
const select = document.getElementById('theme')
const status = document.getElementById('status')

select.innerHTML = Object.keys(byName).filter(n => n !== 'base').map(n => `<option>${n}</option>`).join('')
select.value = new URLSearchParams(location.search).get('theme') ?? 'paper'
select.onchange = () => { location.search = `?theme=${select.value}` }

// A preset and the presets it extends, as layers.
function themeFor(name) {
  const layers = []
  for (let n = name; n && byName[n]; n = byName[n].extends) layers.unshift({ ...byName[n], name: n, kind: 'preset' })
  // Every block on, so you can see (and restyle) them all.
  layers.push({ name: 'all blocks', sections: Object.keys(SECTIONS) })
  return resolveTheme(layers)
}

addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return
  const m = e.data ?? {}
  if (m.type === 'ryt:hello') {
    frame.contentWindow.postMessage({ type: 'ryt:render', data: normalizePageData(sampleData), theme: themeFor(select.value) }, '*')
  } else if (m.type === 'ryt:action') {
    // Stand-in answers, like the real site would give.
    const counts = (window.__reactions ??= {})
    const [id, emoji, delta] = m.args ?? []
    const result = m.name === 'react' ? (counts[`${id}${emoji}`] = Math.max(0, (counts[`${id}${emoji}`] ?? 0) + Math.sign(delta)))
      : m.name === 'alsoTried' ? [{ name: 'Kai', handle: 'kai', profileUrl: 'https://example.com/@kai', rating: 9 }, { name: 'Mira', handle: 'mira', profileUrl: null, rating: 7 }]
      : null
    status.textContent = `${m.name}(${(m.args ?? []).join(', ')})`
    frame.contentWindow.postMessage({ type: 'ryt:action-result', id: m.id, result }, '*')
  } else if (m.type === 'ryt:ready') {
    status.textContent = 'ready ✓'
  } else if (m.type === 'ryt:error') {
    status.textContent = `error: ${m.message}`
  } else if (m.type === 'ryt:navigate') {
    status.textContent = `would open ${m.url}`
  }
})
