// Browser runtime for a fork. Recommend You This loads your page in a sandboxed iframe: no
// cookies, no access to the site or its database, no top-level navigation. Everything it
// needs arrives over postMessage (see FORKING.md):
//
//   page  -> shell  { type: 'ryt:hello', contract }
//   shell -> page   { type: 'ryt:render', data, theme }
//   page  -> shell  { type: 'ryt:ready' } | { type: 'ryt:error', message }
//   page  -> shell  { type: 'ryt:height', height } | { type: 'ryt:navigate', url }
//   page  -> shell  { type: 'ryt:action', id, name, args }   (react, alsoTried)
//   shell -> page   { type: 'ryt:action-result', id, result }

import { render } from './render.js'
import { enhance } from './interact.js'
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

// Things the page asks Recommend You This to do for it (it has no network of its own).
const pending = new Map()
let seq = 0
const action = name => (...args) => new Promise(resolve => {
  const id = ++seq
  pending.set(id, resolve)
  send({ type: 'ryt:action', id, name, args })
  setTimeout(() => { if (pending.delete(id)) resolve(null) }, 8000)
})

addEventListener('message', e => {
  if (e.source !== parent) return
  if (e.data?.type === 'ryt:action-result') {
    pending.get(e.data.id)?.(e.data.result)
    pending.delete(e.data.id)
    return
  }
  if (e.data?.type !== 'ryt:render') return
  try {
    const { data, theme } = e.data
    pageUrl = data.links?.page ?? null
    applyTheme(theme)
    document.getElementById('root').innerHTML = render({ data, theme })
    enhance(document, { data, actions: { react: action('react'), alsoTried: action('alsoTried') } })
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
  if (!link || link.target === '_blank' || e.defaultPrevented) return
  e.preventDefault()
  const url = new URL(link.getAttribute('href'), location.href)
  const target = url.hash && (url.href.startsWith(`${pageUrl}#`) || url.origin + url.pathname === location.origin + location.pathname)
    ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null
  if (target) target.scrollIntoView({ behavior: 'smooth' })
  else send({ type: 'ryt:navigate', url: url.href })
})

send({ type: 'ryt:hello', contract: CONTRACT_VERSION })
