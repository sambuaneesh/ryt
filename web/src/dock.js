// The RYT dock on people's pages: a small floating pill in the page's own colours (shadow DOM,
// so the page's design can't reach in). The way to recommend something, sign in, or get back.

import { api } from './backend/index.js'
import { esc, href, absolute, avatar, mark, toast, friendly } from './ui.js'

const css = (t, d) => `
:host { all: initial; position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); z-index: 50; font: 600 13px/1.2 "Libre Franklin", system-ui, sans-serif; }
* { box-sizing: border-box; }
.dock { --bg: ${t.surface}; --fg: ${t.text}; --muted: ${t.muted}; --line: ${t.border}; --accent: ${t.accent}; --on-accent: ${t.onAccent};
  display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 999px; background: color-mix(in srgb, var(--bg) 92%, transparent);
  color: var(--fg); border: 1px solid color-mix(in srgb, var(--line) 80%, transparent); box-shadow: 0 10px 30px -10px rgb(0 0 0 / .35), 0 1px 2px rgb(0 0 0 / .08);
  backdrop-filter: blur(12px) saturate(1.3); -webkit-backdrop-filter: blur(12px) saturate(1.3); }
${d ? `@media (prefers-color-scheme: dark) { .dock { --bg: ${d.surface}; --fg: ${d.text}; --muted: ${d.muted}; --line: ${d.border}; --accent: ${d.accent}; --on-accent: ${d.onAccent}; } }` : ''}
a, button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; }
.home { width: 34px; height: 34px; justify-content: center; }
.home svg { width: 22px; height: 22px; }
.home circle { fill: none; stroke: var(--fg); stroke-width: 3.4; }
.home path { fill: var(--fg); }
.me { padding: 4px 10px 4px 4px; }
.me:hover, .home:hover, .ghost:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
.ghost { padding: 9px 13px; color: var(--fg); }
.primary { padding: 10px 17px; background: var(--accent); color: var(--on-accent); font-weight: 600; }
.primary:hover { filter: brightness(1.06); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.avatar { --size: 26px; width: var(--size); height: var(--size); border-radius: 50%; display: inline-grid; place-items: center; overflow: hidden; position: relative; color: #fff; font-size: 12px; font-weight: 600;
  background: linear-gradient(150deg, hsl(var(--h, 20) 70% 66%), hsl(calc(var(--h, 20) + 40) 60% 46%)); }
.avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.menu { position: absolute; right: 0; bottom: calc(100% + 8px); min-width: 210px; padding: 6px; border-radius: 16px; background: var(--bg); color: var(--fg); border: 1px solid var(--line);
  box-shadow: 0 20px 40px -12px rgb(0 0 0 / .35); display: none; }
.menu.open { display: grid; }
.menu a, .menu button { padding: 10px 12px; border-radius: 10px; }
.menu a:hover, .menu button:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
.menu hr { border: 0; border-top: 1px solid var(--line); margin: 4px 6px; }
.menu .n { margin-left: auto; color: var(--muted); }
@media (max-width: 420px) { .me .name { display: none; } }
.s { display: none; }
@media (max-width: 420px) { .l { display: none; } .s { display: inline; } }`

// Readable text on the accent: whichever of white/near-black contrasts more.
const onAccent = color => {
  const n = parseInt(String(color).slice(1, 7), 16)
  const lum = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 255000
  return lum > 0.6 ? '#111' : '#fff'
}
const palette = tokens => ({ surface: tokens['color.surface'], text: tokens['color.text'], muted: tokens['color.muted'], border: tokens['color.border'], accent: tokens['color.accent'], onAccent: onAccent(tokens['color.accent']) })

export function dock(root, { session, profile, theme, own, sending, go, refresh }) {
  const host = document.createElement('div')
  root.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const dark = Object.keys(theme.dark ?? {}).length ? palette({ ...theme.tokens, ...theme.dark }) : null
  const me = session.profile
  const primary = sending
    ? `<a class="primary" href="${href(`/@${profile.handle}`)}" data-go><span class="l">Back to the page</span><span class="s">Back</span></a>`
    : own
      ? `<a class="primary" href="${href('/settings/design')}" data-go>Change look</a>`
      : `<a class="primary" href="${href(`/@${profile.handle}/send`)}" data-go><span class="l">Recommend something</span><span class="s">Recommend</span></a>`
  shadow.innerHTML = `<style>${css(palette(theme.tokens), dark)}</style>
<div class="dock" role="toolbar" aria-label="RYT">
  <a class="home" href="${href(me ? '/inbox' : '/')}" data-go aria-label="Recommend You This">${mark('')}</a>
  ${me
    ? `<button class="me" aria-haspopup="menu" aria-expanded="false" data-me>${avatar(me)}<span class="name">${esc(me.name.split(' ')[0])}</span></button>`
    : `<button class="ghost" data-signin>Sign in</button>`}
  ${primary}
  ${me ? `<div class="menu" role="menu" data-menu>
    <a href="${href(`/@${me.handle}`)}" data-go role="menuitem">My page</a>
    <a href="${href('/inbox')}" data-go role="menuitem">Inbox${session.newCount ? `<span class="n">${session.newCount} new</span>` : ''}</a>
    <a href="${href('/sent')}" data-go role="menuitem">Sent</a>
    <a href="${href('/settings')}" data-go role="menuitem">Settings</a>
    <button data-copy role="menuitem">Copy link</button>
    <hr><button data-out role="menuitem">Sign out</button>
  </div>` : ''}
</div>`

  shadow.addEventListener('click', async e => {
    const a = e.target.closest('[data-go]')
    if (a) {
      e.preventDefault()
      return go(a.getAttribute('href').slice(import.meta.env.BASE_URL.length - 1))
    }
    if (e.target.closest('[data-me]')) {
      const menu = shadow.querySelector('[data-menu]')
      const open = menu.classList.toggle('open')
      e.target.closest('[data-me]').setAttribute('aria-expanded', String(open))
      return
    }
    if (e.target.closest('[data-copy]')) {
      await navigator.clipboard?.writeText(absolute(`/@${profile.handle}`)).catch(() => {})
      shadow.querySelector('[data-menu]').classList.remove('open')
      return toast('Link copied')
    }
    if (e.target.closest('[data-out]')) {
      await api.signOut()
      await refresh()
      return go(`/@${profile.handle}`)
    }
    if (e.target.closest('[data-signin]')) {
      try {
        await api.signIn(location.href)
      } catch (err) {
        toast(friendly(err), { bad: true })
      }
    }
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') shadow.querySelector('[data-menu]')?.classList.remove('open') })
}
