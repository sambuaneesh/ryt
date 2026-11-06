// Forkable frontends (ADR 0002) on a static host: a fork is its own GitHub Pages site (the
// apps/page bundle, changed however its owner likes). RYT loads it in a sandboxed frame and
// hands it the page data over postMessage; the fork can't reach RYT, the database or cookies.
//
//   fork -> RYT  { type: 'ryt:hello', contract }
//   RYT  -> fork { type: 'ryt:render', data, theme }
//   fork -> RYT  { type: 'ryt:ready' } | { type: 'ryt:error', message } | { type: 'ryt:navigate', url }

import { SUPPORTED_CONTRACTS } from '../../packages/contract/index.js'
import { BASE } from './ui.js'

// A fork's address: https, or a local server while developing.
export const forkUrlOk = url => /^https:\/\/[^\s"'<>]+$/.test(url ?? '') || (import.meta.env.DEV && /^http:\/\/localhost:\d+\//.test(url ?? ''))

// Resolves true once the fork has drawn the page, false if it fails or stays silent.
export function forkFrame(frame, url, { data, theme, navigate, timeout = 6000 }) {
  return new Promise(resolve => {
    let done = false
    const finish = ok => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (!ok) removeEventListener('message', onMessage)
      resolve(ok)
    }
    const onMessage = e => {
      if (e.source !== frame.contentWindow || typeof e.data?.type !== 'string') return
      const m = e.data
      if (m.type === 'ryt:hello') {
        if (!SUPPORTED_CONTRACTS.includes(m.contract)) return finish(false)
        frame.contentWindow.postMessage({ type: 'ryt:render', data, theme: JSON.parse(JSON.stringify(theme)) }, '*')
      } else if (m.type === 'ryt:ready') finish(true)
      else if (m.type === 'ryt:error') finish(false)
      else if (m.type === 'ryt:navigate') {
        try {
          const target = new URL(m.url, location.href)
          if (target.origin === location.origin && target.pathname.startsWith(BASE)) navigate(target.pathname.slice(BASE.length - 1))
        } catch {}
      }
    }
    const timer = setTimeout(() => finish(false), timeout)
    addEventListener('message', onMessage)
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox')
    frame.setAttribute('referrerpolicy', 'no-referrer')
    frame.src = url
  })
}
