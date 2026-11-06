// Local preview for the page frontend (npm run page, then open /preview.html). It plays the part
// of Recommend You This: waits for your page to say hello, then sends it sample data and a look,
// exactly as the real site does for a fork.

import { normalizePageData } from '../../packages/contract/index.js'
import { resolveTheme } from '../../packages/kit/index.js'
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
  return resolveTheme(layers)
}

addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return
  const m = e.data ?? {}
  if (m.type === 'ryt:hello') {
    frame.contentWindow.postMessage({ type: 'ryt:render', data: normalizePageData(sampleData), theme: themeFor(select.value) }, '*')
  } else if (m.type === 'ryt:ready') {
    status.textContent = 'ready ✓'
  } else if (m.type === 'ryt:error') {
    status.textContent = `error: ${m.message}`
  } else if (m.type === 'ryt:navigate') {
    status.textContent = `would open ${m.url}`
  }
})
