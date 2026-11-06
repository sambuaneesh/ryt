// The public page shell (/@handle). The platform always owns the outer document:
//   - the RYT dock (send a ryt, who this is, report) inside a shadow root, so no theme CSS
//     can restyle or hide it. It floats in a corner and takes the theme's own colours and
//     font, so it belongs to the page instead of sitting on top of it.
//   - guard rules in the FIRST cascade layer with !important, which beats every later
//     layer's !important: user CSS can't hide the dock or escape #page
//   - forks and Hugo-theme sites run in a sandboxed frame on a separate origin, with the
//     built-in rendering kept in a <template> as an instant fallback

import { esc, themeStyles, fontHref, themeVars } from '../../packages/kit/index.js'
import { SUPPORTED_CONTRACTS, CATEGORIES } from '../../packages/contract/index.js'
import { FORK_READY_TIMEOUT_MS, UC_ORIGIN, siteOrigin } from './config.mjs'

const GUARD = `@layer reset, kit, theme, user;
@layer reset {
  #ryt-dock { display: block !important; position: fixed !important; right: 16px !important; bottom: 16px !important;
    top: auto !important; left: auto !important; z-index: 2147483647 !important; visibility: visible !important;
    opacity: 1 !important; transform: none !important; filter: none !important; clip-path: none !important; }
  html, body { opacity: 1 !important; filter: none !important; transform: none !important; visibility: visible !important; }
  #page { display: block !important; contain: layout paint !important; isolation: isolate !important; position: relative !important; }
}`

const DOCK_CSS = `
  :host { all: initial; }
  .dock {
    --bg: var(--dock-bg, #ffffff); --fg: var(--dock-fg, #1d1d1f); --accent: var(--dock-accent, #0071e3); --on-accent: var(--dock-on-accent, #fff);
    position: relative; display: flex; align-items: center; gap: 6px; padding: 5px; border-radius: 999px;
    font: 500 14px/1.2 var(--dock-font, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif);
    color: var(--fg); background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: saturate(180%) blur(18px); -webkit-backdrop-filter: saturate(180%) blur(18px);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 12%, transparent), 0 8px 28px rgb(0 0 0 / .16), 0 2px 6px rgb(0 0 0 / .08);
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .who { display: flex; align-items: center; gap: 7px; padding: 4px 10px 4px 4px; border-radius: 999px; }
  .who:hover, .who[aria-expanded="true"] { background: color-mix(in srgb, var(--fg) 8%, transparent); }
  .av { position: relative; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 12px; font-weight: 700;
    background: linear-gradient(160deg, hsl(var(--hue) 75% 62%), hsl(calc(var(--hue) + 30) 70% 48%)); }
  .av .state { position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 2px var(--bg); display: none; }
  .av .state.bad { display: block; background: #ff9f0a; }
  .name { max-width: 14ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cta { padding: 9px 16px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-weight: 600; white-space: nowrap; transition: filter .15s, transform .1s; }
  .cta:hover { filter: brightness(1.08); }
  .cta:active { transform: scale(.97); }
  .cta[aria-disabled="true"] { opacity: .5; pointer-events: none; }
  .menu { position: absolute; right: 0; bottom: calc(100% + 10px); width: 250px; padding: 6px; border-radius: 14px;
    background: var(--bg); color: var(--fg); box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 12%, transparent), 0 12px 36px rgb(0 0 0 / .2);
    transform-origin: bottom right; animation: pop .16s ease-out; }
  .menu[hidden] { display: none; }
  @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.98); } }
  .menu-head { padding: 10px 10px 8px; }
  .menu-head b { display: block; font-size: 15px; margin-bottom: 2px; }
  .menu-head span, .status { font-size: 12px; opacity: .65; font-weight: 400; }
  .status { padding: 0 10px 8px; margin: 0; }
  .menu a, .menu button { display: block; width: 100%; text-align: left; padding: 8px 10px; border-radius: 8px; font-size: 14px; }
  .menu a:hover, .menu button:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
  .menu hr { border: 0; border-top: 1px solid color-mix(in srgb, var(--fg) 12%, transparent); margin: 4px 6px; }
  .mark { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; }
  .mark:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
  .logo { width: 18px; height: 18px; border-radius: 6px; background: linear-gradient(135deg, #ff8a3d, #ff3d77 55%, #8b5cf6); }
  @media (max-width: 520px) { .name { display: none; } .who { padding-right: 4px; } }
  @media (prefers-reduced-motion: reduce) { .menu { animation: none; } }
`

const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

function dock({ user, isOwner, isSend, status, colors }) {
  const closed = user.inbox === 'closed'
  const vars = Object.entries(colors).map(([k, v]) => `--dock-${k}:${v}`).join(';')
  const cta = isSend
    ? `<a class="cta" id="cta" data-back href="/@${esc(user.handle)}">Back to ryts</a>`
    : `<a class="cta" id="cta" href="/@${esc(user.handle)}/send" ${closed ? 'aria-disabled="true"' : ''}>${closed ? 'Not taking ryts' : 'Send a ryt'}</a>`
  return `<div id="ryt-dock" style="${esc(vars)}"><template shadowrootmode="open"><style>${DOCK_CSS}</style>
<nav class="dock" aria-label="RYT">
  <a class="mark" href="/" title="RYT · Recommend You This" aria-label="RYT home"><span class="logo"></span></a>
  <button class="who" id="who" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="menu">
    <span class="av" style="--hue:${hue(user.handle)}">${esc(user.handle[0].toUpperCase())}<i class="state" id="state"></i></span>
    <span class="name">${esc(user.name)}</span>
  </button>
  ${cta}
  <div class="menu" id="menu" hidden role="menu">
    <div class="menu-head"><b>${esc(user.name)}</b><span>@${esc(user.handle)} on RYT · Recommend You This</span></div>
    <p class="status" id="status">${esc(status ?? '')}</p>
    <hr>
    ${isOwner ? '<a href="/settings" role="menuitem">Edit my page</a>' : ''}
    <a href="/@${esc(user.handle)}?theme=default" role="menuitem">Simple view</a>
    <a href="/" role="menuitem">What is RYT?</a>
    <button type="button" id="report" role="menuitem">Report this page</button>
  </div>
</nav></template></div>`
}

const json = value => JSON.stringify(value).replace(/</g, '\\u003c')

// Dock menu, report, and (for framed pages) the frame protocol. Runs at the very top of
// <head>, before any render-blocking stylesheet, so the listener exists before the frame
// says hello. Elements are looked up lazily for the same reason.
const runtime = ({ framed, label, okText, handle, sendContext }) => `
(() => {
  const $ = id => document.getElementById(id)
  const whenParsed = fn => document.readyState === 'loading' ? addEventListener('DOMContentLoaded', fn) : fn()
  const dockRoot = () => $('ryt-dock').shadowRoot

  whenParsed(() => {
    const root = dockRoot()
    const menu = root.getElementById('menu'), who = root.getElementById('who')
    const toggle = open => { menu.hidden = !open; who.setAttribute('aria-expanded', String(open)) }
    who.onclick = e => { e.stopPropagation(); toggle(menu.hidden) }
    addEventListener('click', () => toggle(false))
    addEventListener('keydown', e => e.key === 'Escape' && toggle(false))
    root.getElementById('report').onclick = () => alert('Thanks, a moderator will look at this page. (prototype)')
  })
  ${framed ? `
  const setStatus = (text, bad) => whenParsed(() => {
    dockRoot().getElementById('status').textContent = text
    dockRoot().getElementById('state').className = 'state' + (bad ? ' bad' : '')
  })
  // The dock takes the theme's colours: background, text, link colour and font.
  const brightness = c => { const [r, g, b] = (c.match(/[\\d.]+/g) || [0, 0, 0]).map(Number); return (r * 299 + g * 587 + b * 114) / 1000 }
  const applyStyle = s => whenParsed(() => {
    const host = $('ryt-dock')
    host.style.setProperty('--dock-bg', s.bg)
    host.style.setProperty('--dock-fg', s.fg)
    host.style.setProperty('--dock-accent', s.accent)
    host.style.setProperty('--dock-on-accent', brightness(s.accent) > 150 ? '#111' : '#fff')
    if (s.font) host.style.setProperty('--dock-font', s.font)
  })
  let state = 'waiting', errors = 0

  // Any failure swaps in the built-in rendering, which is already in the document.
  const fallback = reason => {
    if (state === 'fallback') return
    state = 'fallback'
    console.warn('[ryt] frame fell back:', reason)
    whenParsed(() => {
      $('fork')?.remove()
      $('site-fill')?.remove()
      $('page').innerHTML = $('fallback').innerHTML
    })
    setStatus(${json(label)} + ' couldn’t load, so this is the simple view.', true)
  }
  const timer = setTimeout(() => state === 'ready' || fallback('no response in ${FORK_READY_TIMEOUT_MS / 1000}s'), ${FORK_READY_TIMEOUT_MS})
  const reply = (frame, message) => frame.contentWindow.postMessage(message, '*')

  addEventListener('message', async e => {
    const frame = $('fork')
    if (!frame || e.source !== frame.contentWindow) return
    const m = e.data || {}
    if (m.type === 'ryt:hello') {
      if (!${json(SUPPORTED_CONTRACTS)}.includes(m.contract)) return fallback('unsupported contract ' + m.contract)
      if (m.kind !== 'site') whenParsed(() => reply(frame, { type: 'ryt:render', ...JSON.parse($('payload').textContent) }))
    } else if (m.type === 'ryt:ready' && state === 'waiting') {
      state = 'ready'
      clearTimeout(timer)
      setStatus(${json(okText)}, false)
    } else if (m.type === 'ryt:style') {
      applyStyle(m)
    } else if (m.type === 'ryt:error') {
      console.warn('[ryt] frame error:', m.message)
      if (state !== 'ready' || ++errors > 3) fallback(String(m.message).slice(0, 80))
    } else if (m.type === 'ryt:height') {
      frame.style.height = Math.min(Math.max(Number(m.height) || 0, 200), 100000) + 'px'
    } else if (m.type === 'ryt:navigate') {
      const url = new URL(m.url, location.href)
      if (url.origin === location.origin) location.href = url.href
      else if (/^https?:$/.test(url.protocol)) open(url.href, '_blank', 'noopener,noreferrer')
    } else if (m.type === 'ryt:want-send-context') {
      reply(frame, { type: 'ryt:send-context', ...${json(sendContext)} })
    } else if (m.type === 'ryt:send') {
      // In-theme send form: the shell is on the platform origin, so it posts with the
      // visitor's session (signed-in senders get credit).
      try {
        const res = await fetch(${json(`/api/v1/pages/${handle}/ryts`)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m.fields) })
        const body = await res.json()
        reply(frame, { type: 'ryt:send-result', ok: res.ok, message: body.message })
      } catch {
        reply(frame, { type: 'ryt:send-result', ok: false, message: 'Couldn’t send. Check your connection and try again.' })
      }
    }
  })
  // On a theme site, "Send a ryt" opens the theme's own send page inside the frame.
  whenParsed(() => {
    const cta = dockRoot().getElementById('cta')
    if ($('fork')?.dataset.kind !== 'site' || !cta || cta.hasAttribute('data-back')) return
    cta.addEventListener('click', e => {
      if (state !== 'ready') return
      e.preventDefault()
      reply($('fork'), { type: 'ryt:goto', path: '/send/' })
    })
  })` : ''}
})()`

// Dock colours for pages whose theme we know (built-in designs, forks, and the first paint
// of a theme site before it reports its own colours).
function builtinColors(theme) {
  const v = themeVars(theme)
  const accent = v['--ryt-accent']
  const [r, g, b] = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16))
  return { bg: v['--ryt-surface'], fg: v['--ryt-text'], accent, 'on-accent': (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff', font: v['--ryt-font-body'] }
}

export function publicPage({ user, viewer, isOwner, builtin, fork, site, isSend = false }) {
  const href = fontHref(builtin.theme)
  const label = fork ? `${fork.build.url.split('/').slice(-1)[0]}@${fork.build.sha}` : site ? site.name : null
  const sendContext = {
    owner: { name: user.name, handle: user.handle },
    viewer: viewer ? { name: viewer.name, handle: viewer.handle } : null,
    categories: CATEGORIES,
    closed: user.inbox === 'closed',
    accountsOnly: user.inbox === 'accounts',
  }
  const script = runtime({
    framed: Boolean(fork || site),
    label,
    okText: fork ? `This page runs its own frontend (${label}).` : site ? `Design: ${site.name}, a Hugo theme.` : '',
    handle: user.handle,
    sendContext,
  })
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${isSend ? `Send ${esc(user.name)} a ryt` : `${esc(user.name)}'s ryts`} · RYT</title>
<script>${script}</script>
<style>${GUARD}</style>
${builtin.theme.tokens.styles === 'plain' ? '' : '<link rel="stylesheet" href="/assets/page/style.css">'}
${href ? `<link rel="stylesheet" href="${esc(href)}">` : ''}
<style>${themeStyles(builtin.theme).replace(/<\/style/gi, '')}</style>
</head><body>`
  const colors = builtinColors(builtin.theme)

  if (site) {
    // A Hugo-theme site is a multi-page static site: it fills the window, scrolls inside its
    // frame, and has its own origin (a per-person subdomain in production), so theme scripts
    // can keep things like a dark-mode choice but can't reach the platform.
    return `${head}${dock({ user, isOwner, isSend, status: `Loading ${site.name}…`, colors })}
<style id="site-fill">html, body { overflow: hidden !important; } #page { height: 100vh; }</style>
<main id="page"><iframe id="fork" data-kind="site" src="${esc(`${siteOrigin(site.id)}${isSend ? '/send/' : '/'}`)}" title="${esc(user.name)}'s ryts"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"
  style="display:block;width:100%;height:100%;border:0;background:#fff"></iframe></main>
<template id="fallback">${builtin.html}</template>
<script type="application/json" id="payload">{}</script>
</body></html>`
  }

  if (!fork) {
    return `${head}${dock({ user, isOwner, isSend, status: builtin.forced ? 'Simple view.' : 'Design: RYT', colors })}
<main id="page">${builtin.html}</main>
</body></html>`
  }

  const src = `${UC_ORIGIN}/b/${fork.build.id}/apps/page/index.html`
  return `${head}${dock({ user, isOwner, isSend, status: `Loading ${label}…`, colors })}
<main id="page"><iframe id="fork" data-kind="fork" src="${esc(src)}" title="${esc(user.name)}'s page"
  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"
  style="display:block;width:100%;height:80vh;border:0"></iframe></main>
<template id="fallback">${builtin.html}</template>
<script type="application/json" id="payload">${json({ data: fork.data, theme: fork.theme })}</script>
</body></html>`
}
