// Browser runtime for a fork. Recommend You This loads your page in a sandboxed iframe: no
// cookies, no access to the site or its database, no top-level navigation. Everything it
// needs arrives over postMessage (see FORKING.md):
//
//   page  -> shell  { type: 'ryt:hello', contract }
//   shell -> page   { type: 'ryt:render', data, theme }
//   page  -> shell  { type: 'ryt:ready' } | { type: 'ryt:error', message }
//   page  -> shell  { type: 'ryt:height', height } | { type: 'ryt:navigate', url }

import { render } from './render.js'
import { CONTRACT_VERSION } from '../../packages/contract/index.js'
import { themeStyles, fontHref } from '../../packages/kit/index.js'

const send = message => parent.postMessage(message, '*')

addEventListener('error', e => send({ type: 'ryt:error', message: e.message }))
addEventListener('unhandledrejection', e => send({ type: 'ryt:error', message: String(e.reason?.message ?? e.reason) }))

function applyTheme(theme) {
  const style = document.createElement('style')
  style.textContent = themeStyles(theme)
  document.head.append(style)
  const href = fontHref(theme)
  if (href) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }))
}

addEventListener('message', e => {
  if (e.source !== parent || e.data?.type !== 'ryt:render') return
  try {
    const { data, theme } = e.data
    pageUrl = data.links?.page ?? null
    applyTheme(theme)
    document.getElementById('root').innerHTML = render({ data, theme })
    send({ type: 'ryt:ready' })
    new ResizeObserver(() => send({ type: 'ryt:height', height: document.documentElement.scrollHeight }))
      .observe(document.body)
  } catch (err) {
    send({ type: 'ryt:error', message: String(err?.message ?? err) })
  }
})

// Links: anchors on this page scroll; links that open a new tab (a ryt's own link) do so;
// everything else (other pages, "send me a ryt") is handed to RYT, which only follows its own
// addresses. The frame itself never navigates.
let pageUrl = null
addEventListener('click', e => {
  const link = e.target.closest?.('a[href]')
  if (!link || link.target === '_blank') return
  e.preventDefault()
  const url = new URL(link.getAttribute('href'), location.href)
  const target = url.hash && (url.href.startsWith(`${pageUrl}#`) || url.origin + url.pathname === location.origin + location.pathname)
    ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null
  if (target) target.scrollIntoView({ behavior: 'smooth' })
  else send({ type: 'ryt:navigate', url: url.href })
})

send({ type: 'ryt:hello', contract: CONTRACT_VERSION })
