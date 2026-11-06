// One thing, across everyone (/thing?q=Outer Wilds): who tried it, how they rated it, what they
// said. Each person links to the card on their own page, so you can keep wandering.

import { api } from '../backend/index.js'
import { screen } from './chrome.js'
import { esc, href, avatar, wordmark, timeAgo, toast, friendly } from '../ui.js'
import { objectCard } from '../objects.js'

export async function show(root, { session }) {
  const title = new URLSearchParams(location.search).get('q')?.trim() ?? ''
  const rows = title ? await api.thing(title).catch(() => []) : []
  const named = new Map((await api.profilesByHandles?.([...new Set(rows.map(r => r.owner_handle))]).catch(() => []) ?? []).map(p => [p.handle, p]))
  const tried = rows.filter(r => r.status === 'tried')
  const rated = tried.filter(r => r.rating)
  const avg = rated.length ? Math.round(rated.reduce((a, r) => a + r.rating, 0) / rated.length * 10) / 10 : null
  const done = r => r.status === 'tried' || r.status === 'already_done'
  const trying = rows.filter(r => !done(r) && r.trying)
  const wanting = rows.filter(r => !done(r) && !r.trying)
  const kind = rows[0]?.category ?? 'other'
  document.title = `${title || 'Something'} · Recommend You This`

  const person = r => named.get(r.owner_handle) ?? { handle: r.owner_handle, name: `@${r.owner_handle}` }
  const inner = `
  <div class="thing-head">
    <div class="thing-obj">${objectCard({ kind, title: rows[0]?.title ?? title, link: rows.find(r => r.link)?.link, score: avg ? Math.round(avg) : null })}</div>
    <div>
      <h1 class="title">${esc(rows[0]?.title ?? title)}</h1>
      <p class="lede">${rows.length ? [tried.length ? `Tried by ${tried.length} ${tried.length === 1 ? 'person' : 'people'}` : '', avg ? `average ${avg}/10` : '', trying.length ? `${trying.length} trying it now` : '', wanting.length ? `on ${wanting.length} ${wanting.length === 1 ? 'list' : 'lists'}` : ''].filter(Boolean).join(' · ') : 'Nobody has shared this yet.'}</p>
      <p style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">${session.profile ? '<button class="btn primary" data-want>Add to my list</button>' : ''}<a class="btn" href="${href(`/share?title=${encodeURIComponent(rows[0]?.title ?? title)}${rows.find(r => r.link) ? `&url=${encodeURIComponent(rows.find(r => r.link).link)}` : ''}`)}" data-link>Recommend it to someone</a></p>
    </div>
  </div>
  ${rows.length ? `<h2 class="section">Who tried it</h2><div class="voices">${rows.map(r => {
    const p = person(r)
    return `<a class="voice" href="${href(`/@${r.owner_handle}#r-${r.id}`)}" data-link>
    ${avatar(p)}<div class="voice-main"><b>${esc(p.name)}</b>
    ${r.review ? `<p>“${esc(r.review)}”</p>` : ''}
    <small>${r.status === 'already_done' ? 'Already tried' : r.status === 'tried' ? `Tried ${timeAgo(r.decided_at ?? r.created_at)}` : r.trying ? `Trying now${r.progress ? ` · ${esc(r.progress)}` : ''}` : 'On their list'}${r.sender_name ? ` · from ${esc(r.sender_name)}` : ''}</small></div>
    ${r.rating ? `<span class="voice-score">${r.rating}</span>` : ''}</a>`
  }).join('')}</div>` : ''}`

  root.innerHTML = session.profile ? screen(session, null, inner, { narrow: true })
    : `<div class="landing"><header class="front-top">${wordmark('/')}</header><main class="main narrow">${inner}</main></div>`
  root.onclick = async e => {
    const b = e.target.closest('[data-want]')
    if (!b) return
    b.disabled = true
    try {
      await api.addRec({ title: rows[0]?.title ?? title, category: kind, link: rows.find(r => r.link)?.link ?? null, status: 'up_next', on_list: true })
      b.textContent = 'On your list ✓'
      toast('Added to your list')
    } catch (err) {
      b.disabled = false
      toast(friendly(err), { bad: true })
    }
  }
}
