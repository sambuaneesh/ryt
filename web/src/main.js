// RYT web app: boot, session and routes. Every view is a function (root, ctx) that draws
// itself into #app; links marked data-link go through go() instead of reloading.

import './brand.css'
import { api } from './backend/index.js'
import { BASE, href, toast, friendly, mark } from './ui.js'

const views = {
  landing: () => import('./views/landing.js'),
  welcome: () => import('./views/welcome.js'),
  inbox: () => import('./views/inbox.js'),
  sent: () => import('./views/sent.js'),
  settings: () => import('./views/settings.js'),
  page: () => import('./views/page.js'),
  missing: () => import('./views/missing.js'),
  share: () => import('./views/share.js'),
  thing: () => import('./views/thing.js'),
  admin: () => import('./views/admin.js'),
}

const root = document.getElementById('app')
export const session = { user: null, profile: null, newCount: 0, isAdmin: false }

// path (without the site's base) -> [view, params, needs]
function match(path) {
  const p = decodeURIComponent(path).replace(/\/+$/, '') || '/'
  let m
  if (p === '/') return ['landing', {}]
  if (p === '/welcome') return ['welcome', {}, 'user']
  if (p === '/share') return ['share', {}]
  if (p === '/thing') return ['thing', {}]
  if (p === '/inbox') return ['inbox', {}, 'profile']
  if (p === '/sent') return ['sent', {}, 'profile']
  if (p === '/admin') return ['admin', {}, 'profile']
  if ((m = /^\/settings(?:\/(profile|design|page|appearance|inbox|fork))?$/.exec(p))) return ['settings', { tab: m[1] ?? 'design' }, 'profile']
  if ((m = /^\/@([a-z0-9_]{2,24})(\/send)?$/i.exec(p))) return ['page', { handle: m[1].toLowerCase(), send: Boolean(m[2]) }]
  return ['missing', {}]
}

const appPath = () => location.pathname.startsWith(BASE) ? `/${location.pathname.slice(BASE.length)}` : location.pathname

let renderId = 0
export async function show() {
  const id = ++renderId
  const [name, params, needs] = match(appPath())
  // Signed in with Google but no RYT page yet: pick a name first.
  if (session.user && !session.profile && name !== 'page' && name !== 'welcome') return go('/welcome', { replace: true })
  if (needs && !session.user) return go('/', { replace: true })
  if (needs === 'profile' && !session.profile) return go('/welcome', { replace: true })
  if (name === 'landing' && session.profile) return go('/inbox', { replace: true })
  if (name === 'welcome' && session.profile) return go('/inbox', { replace: true })
  document.body.dataset.view = name
  try {
    const mod = await views[name]()
    if (id !== renderId) return
    // Each view sets its own delegated handlers on #app; none survive a route change.
    root.onclick = root.oninput = root.onchange = root.onsubmit = null
    document.title = 'Recommend You This'
    await mod.show(root, { params, session, go, refresh })
    if (id === renderId && !location.hash) window.scrollTo(0, 0)
  } catch (e) {
    console.error(e)
    if (id === renderId) root.innerHTML = `<div class="main narrow"><div class="empty"><span class="serif">That didn’t work.</span>${friendly(e)}<p><a class="btn" href="${href('/')}" data-link>Go home</a></p></div></div>`
  }
}

export function go(path, { replace = false } = {}) {
  const url = href(path)
  if (replace) history.replaceState(null, '', url)
  else if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url)
  return show()
}

// Reload who's signed in (after sign-in, onboarding, or a profile change).
export async function refresh() {
  session.user = await api.user()
  session.profile = session.user ? await api.me().catch(() => null) : null
  session.isAdmin = session.profile ? await api.isAdmin?.().catch(() => false) ?? false : false
  await countNew()
}

export async function countNew() {
  session.newCount = session.profile ? (await api.inbox().catch(() => [])).filter(r => r.status === 'new').length : 0
}

addEventListener('popstate', show)
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]')
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return
  e.preventDefault()
  go(a.getAttribute('href').slice(BASE.length - 1))
})

// GitHub Pages sends unknown paths to 404.html (this app); a ?p= left by an older redirect
// is folded back into the path.
const query = new URLSearchParams(location.search)
const redirected = query.get('p')
if (redirected) history.replaceState(null, '', href(redirected))
// A sign-in that Google or Supabase turned down comes back with an error in the address.
const authError = query.get('error_description') ?? new URLSearchParams(location.hash.slice(1)).get('error_description')
if (authError) {
  history.replaceState(null, '', location.pathname)
  toast(`Couldn’t sign you in: ${authError}`, { bad: true })
}

root.innerHTML = `<div class="loading">${mark()}</div>`
try {
  await refresh()
} catch (e) {
  toast(friendly(e), { bad: true })
}
api.onAuth(async (user, event) => {
  if (event === 'TOKEN_REFRESHED' || (user?.id ?? null) === (session.user?.id ?? null)) return
  await refresh()
  show()
})
show()

// Installable app: register the service worker (the browser then offers "Install"), and keep
// the browser's install prompt for the "Install app" button in Settings.
export const install = { prompt: null }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); install.prompt = e })
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.register(href('/sw.js'), { scope: BASE }).catch(() => {})
}
