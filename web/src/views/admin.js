// Admin: everyone with a page, for the site's owner only. The database decides who may see
// this (ryt_admins, migration 0005); the screen just asks and shows what comes back.

import { api } from '../backend/index.js'
import { screen } from './chrome.js'
import { esc, href, avatar, timeAgo, friendly } from '../ui.js'

const SORTS = [['joined', 'Newest'], ['active', 'Last active'], ['received', 'Most received'], ['sent', 'Most sent']]
const WEEK = 7 * 86400 * 1000

export async function show(root, { session }) {
  if (!session.isAdmin) {
    root.innerHTML = screen(session, null, '<div class="empty">This page is only for admins.</div>', { narrow: true })
    return
  }
  let users
  try {
    users = await api.adminUsers()
  } catch (e) {
    root.innerHTML = screen(session, 'admin', `<div class="empty">${friendly(e)}</div>`, { narrow: true })
    return
  }
  document.title = 'Admin · Recommend You This'
  let sort = 'joined', q = ''
  const sum = k => users.reduce((a, u) => a + (u[k] ?? 0), 0)
  const recent = k => users.filter(u => u[k] && Date.now() - new Date(u[k]).getTime() < WEEK).length

  const row = u => `<div class="admin-user">
    <a href="${href(`/@${u.handle}`)}" data-link>${avatar(u)}</a>
    <div class="who"><a href="${href(`/@${u.handle}`)}" data-link><b>${esc(u.name)}</b> <span class="faint">@${esc(u.handle)}</span></a>
      <div class="small faint">${u.email ? `${esc(u.email)} · ` : ''}joined ${timeAgo(u.created_at)}${u.last_active ? ` · active ${timeAgo(u.last_active)}` : ''}${u.last_sign_in_at ? ` · signed in ${timeAgo(u.last_sign_in_at)}` : ''}</div>
      <div class="small faint">${esc(u.design)}${u.inbox !== 'anyone' ? ` · inbox: ${u.inbox === 'closed' ? 'closed' : 'accounts only'}` : ''}</div></div>
    <dl class="nums"><div><dt>Got</dt><dd>${u.received}</dd></div><div><dt>Tried</dt><dd>${u.tried}</dd></div><div><dt>List</dt><dd>${u.on_list}</dd></div><div><dt>Sent</dt><dd>${u.sent}</dd></div></dl>
  </div>`

  const list = () => {
    const s = q.toLowerCase()
    const shown = users.filter(u => !s || [u.name, u.handle, u.email].some(v => String(v ?? '').toLowerCase().includes(s)))
    const by = { joined: u => u.created_at, active: u => u.last_active, received: u => u.received, sent: u => u.sent }[sort]
    shown.sort((a, b) => { const x = by(a) ?? '', y = by(b) ?? ''; return x < y ? 1 : x > y ? -1 : 0 })
    return shown.length ? shown.map(row).join('') : '<div class="empty">Nobody matches.</div>'
  }

  root.innerHTML = screen(session, 'admin', `
  <div class="head"><div><h1 class="title">Admin</h1><p class="lede">Everyone with a page. Only you can see this.</p></div></div>
  <dl class="admin-stats">
    <div><dt>People</dt><dd>${users.length}</dd></div>
    <div><dt>New this week</dt><dd>${recent('created_at')}</dd></div>
    <div><dt>Active this week</dt><dd>${recent('last_active')}</dd></div>
    <div><dt>Recommendations</dt><dd>${sum('received')}</dd></div>
    <div><dt>Tried</dt><dd>${sum('tried')}</dd></div>
  </dl>
  <input class="input" type="search" placeholder="Search name, @handle or email" data-q aria-label="Search people">
  <div class="chips" role="group" aria-label="Sort">${SORTS.map(([k, l]) => `<button class="chip" data-sort="${k}" aria-pressed="${k === sort}">${l}</button>`).join('')}</div>
  <div class="admin-list" data-list>${list()}</div>`, { narrow: true })

  const redraw = () => { root.querySelector('[data-list]').innerHTML = list() }
  root.oninput = e => { if (e.target.matches('[data-q]')) { q = e.target.value.trim(); redraw() } }
  root.onclick = e => {
    const b = e.target.closest('[data-sort]')
    if (!b) return
    sort = b.dataset.sort
    root.querySelectorAll('[data-sort]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    redraw()
  }
}
