// Where "Share → RYT" from another app lands (/share?url=…&text=…). Shows what was shared,
// then who to recommend it to: people you've swapped recommendations with, or any @name.
// Picking someone opens their send page with the link already filled in.

import { api } from '../backend/index.js'
import { screen } from './chrome.js'
import { esc, avatar, toast, friendly } from '../ui.js'
import { unfurl, firstUrl } from '../unfurl.js'
import { objectCard } from '../objects.js'

export async function show(root, { session, go }) {
  const q = new URLSearchParams(location.search)
  const link = firstUrl(q.get('url')) ?? firstUrl(q.get('text')) ?? firstUrl(q.get('title'))
  // From a thing page there may be only a name, no link.
  const named = !link && q.get('title') ? q.get('title').trim() : ''
  const note = [q.get('title'), q.get('text')].filter(t => t && !firstUrl(t)).join(' ').trim()

  // Your people: whoever recommended you something, and whoever you recommended to.
  const people = new Map()
  if (session.profile) {
    const [recs, sent] = await Promise.all([api.inbox().catch(() => []), api.mySent().catch(() => [])])
    const ids = [...new Set(recs.map(r => r.sender_id).filter(id => id && id !== session.profile.id))]
    for (const p of await api.profilesByIds(ids).catch(() => [])) people.set(p.handle, p)
    for (const s of sent) if (s.to_handle && !people.has(s.to_handle)) people.set(s.to_handle, { handle: s.to_handle, name: s.to_name ?? s.to_handle })
  }

  const draw = item => {
    root.innerHTML = screen(session, null, `
  <div class="head"><div><h1 class="title">Recommend this</h1></div></div>
  ${link || named ? `<div style="max-width:360px;margin-bottom:26px">${objectCard({ kind: item?.kind, title: item?.title || named || link, from: item || named ? null : 'Looking it up…' })}</div>` : '<p class="notice">Nothing to share. Share a link from another app to recommend it.</p>'}
  ${(link || named) && session.profile ? `<p style="margin:-10px 0 4px"><button class="btn" data-want>Or add it to my list</button></p>` : ''}
  ${link || named ? `<h2 class="section">To who?</h2>
  ${people.size ? `<div class="people">${[...people.values()].map(p => `<button class="person" data-to="${esc(p.handle)}">${avatar(p)}<span>${esc(p.name)}</span><small>@${esc(p.handle)}</small></button>`).join('')}</div>` : ''}
  <form class="find-person" data-find><span>@</span><input name="handle" placeholder="name" autocomplete="off" spellcheck="false" autocapitalize="none" aria-label="Their page name"><button class="btn primary">Next</button></form>` : ''}`, { narrow: true })
  }
  draw(named ? { title: named } : null)
  if (!link && !named) return
  const item = link ? await unfurl(link) : { title: named }
  draw({ ...item, title: item.title || note || named })

  const send = handle => {
    const p = new URLSearchParams(link ? { url: link } : {})
    if (item.title || note) p.set('title', item.title || note)
    if (item.kind) p.set('kind', item.kind)
    if (item.cover) p.set('cover', item.cover)
    go(`/@${handle}/send?${p}`)
  }
  root.onclick = async e => {
    const want = e.target.closest('[data-want]')
    if (want) {
      want.disabled = true
      try {
        await api.addRec({ title: (item.title || note || named || link).slice(0, 120), category: item.kind ?? 'other', link: link ?? null, cover_url: item.cover ?? null, status: 'up_next', on_list: true })
        want.textContent = 'On your list ✓'
        toast('Added to your list')
      } catch (err) {
        want.disabled = false
        toast(friendly(err), { bad: true })
      }
      return
    }
    const b = e.target.closest('[data-to]')
    if (b) send(b.dataset.to)
  }
  root.onsubmit = e => {
    e.preventDefault()
    const handle = new FormData(e.target).get('handle').trim().replace(/^@/, '').toLowerCase()
    if (/^[a-z0-9_]{2,24}$/.test(handle)) send(handle)
    else toast('Use letters, numbers and _', { bad: true })
  }
}
