// Your inbox: everything people recommended to you (and things you added). Private to you.
// Each one shows what it is, who sent it and why, and the next step. The rest (rating,
// review, private note, show on page, edit, delete) opens under "More".

import { api } from '../backend/index.js'
import { screen } from './chrome.js'
import { esc, href, absolute, toast, friendly, sheet, debounce, safeImage, timeAgo, CATEGORIES, STATUS } from '../ui.js'
import { objectCard } from '../objects.js'
import { bindAutofill } from '../unfurl.js'

const TABS = [['new', 'New'], ['up_next', 'To try'], ['done', 'Tried'], ['passed', 'Skipped'], ['all', 'All']]
const inTab = (r, tab) => tab === 'all' || (tab === 'done' ? r.status === 'tried' || r.status === 'already_done' : r.status === tab)
const PUBLIC = s => s === 'tried' || s === 'already_done'
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : 'Other')
let tab = null

export async function show(root, ctx) {
  const { session } = ctx
  const recs = await api.inbox()
  const open = new Set()
  // People who recommended you things with their account: so you can recommend something back.
  const senders = new Map((await api.profilesByIds([...new Set(recs.map(r => r.sender_id).filter(id => id && id !== session.profile.id))]).catch(() => [])).map(p => [p.id, p]))
  tab ??= recs.some(r => r.status === 'new') ? 'new' : recs.some(r => r.status === 'up_next') ? 'up_next' : 'all'
  const link = absolute(`/@${session.profile.handle}`)

  const draw = () => {
    session.newCount = recs.filter(r => r.status === 'new').length
    const count = k => recs.filter(r => inTab(r, k)).length
    const shown = recs.filter(r => inTab(r, tab))
    root.innerHTML = screen(session, 'inbox', `
  <div class="head">
    <div><h1 class="title">Inbox</h1>${session.newCount ? `<p class="lede">${session.newCount} new</p>` : ''}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-share>Copy my link</button><button class="btn primary" data-add>Add</button></div>
  </div>
  <div class="toolbar"><div class="segmented" role="group" aria-label="Show">${TABS.map(([k, label]) =>
    `<button aria-pressed="${tab === k}" data-tab="${k}">${label}${count(k) ? `<span class="n">${count(k)}</span>` : ''}</button>`).join('')}</div></div>
  <div class="recs">${shown.length ? shown.map(card).join('') : emptyState(tab, recs.length, link)}</div>`)
  }

  const card = r => {
    const from = r.sender_name ? `from ${r.sender_name}${r.manual ? ' (added by you)' : ''}` : r.manual ? 'added by you' : 'from someone'
    return `<article class="rec" data-id="${esc(r.id)}">
  ${objectCard({ kind: r.category, title: r.title, link: r.link, from, when: timeAgo(r.created_at), score: r.status === 'tried' ? r.rating : null })}
  <div class="rec-side">
    <span class="rec-state${r.status === 'new' ? ' new' : ''}">${esc(STATUS[r.status])}${r.sender_name && !r.show_sender ? ' · name hidden on your page' : ''}</span>
    ${r.pitch ? `<p class="rec-pitch">“${esc(r.pitch)}”</p>` : ''}
    ${r.status === 'tried' && r.review && !open.has(r.id) ? `<p class="rec-review"><b>My review</b>${esc(r.review)}</p>` : ''}
    <div class="rec-actions">${actions(r)}<span class="spacer"></span><button class="link" data-more>${open.has(r.id) ? 'Less' : 'More'}</button></div>
    ${open.has(r.id) ? more(r) : ''}
  </div>
</article>`
  }

  const actions = r => {
    const b = (status, label, cls = '') => `<button class="btn sm ${cls}" data-status="${status}">${label}</button>`
    if (r.status === 'new') return b('up_next', 'To try') + b('tried', 'I tried it', 'primary') + b('already_done', 'Already tried') + b('passed', 'Skip', 'ghost')
    if (r.status === 'up_next') return b('tried', 'I tried it', 'primary') + b('already_done', 'Already tried') + b('passed', 'Skip', 'ghost')
    if (r.status === 'passed') return b('up_next', 'Move to To try')
    if (r.status === 'tried' && !r.rating && !open.has(r.id)) return '<button class="btn sm primary" data-more>Rate it</button>'
    // Tried it: one tap to return the favour.
    const sender = senders.get(r.sender_id)
    if (PUBLIC(r.status) && sender) return `<a class="btn sm" href="${href(`/@${sender.handle}/send`)}" data-link>Recommend ${esc(sender.name.split(' ')[0])} something back</a>`
    return ''
  }

  // The details, opened on demand.
  const more = r => `<div class="rec-more">
  ${r.status === 'tried' ? `<div><div class="field" style="margin:0 0 8px"><span>Rating</span></div><div class="dots" role="group" aria-label="Rating out of 10">${Array.from({ length: 10 }, (_, i) =>
    `<button aria-pressed="${r.rating === i + 1}" data-rate="${i + 1}" aria-label="${i + 1} out of 10">${i + 1}</button>`).join('')}</div></div>
  <label class="field" style="margin:0"><span>My review <small>shows on your page</small></span><textarea rows="2" maxlength="1000" data-review placeholder="What did you think?">${esc(r.review)}</textarea></label>` : ''}
  <label class="field" style="margin:0"><span>Private note <small>only you see this</small></span><textarea rows="2" maxlength="2000" data-note>${esc(r.note)}</textarea></label>
  ${PUBLIC(r.status) ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span>Show on my page</span>
    <label class="switch"><input type="checkbox" data-visible ${r.hidden ? '' : 'checked'} aria-label="Show on my page"><span></span></label></div>` : ''}
  <div style="display:flex;gap:16px;flex-wrap:wrap">${PUBLIC(r.status) || r.status === 'passed' ? '<button class="link" data-status="up_next">Move to To try</button>' : ''}<button class="link" data-edit>Edit</button><button class="link" data-delete>Delete</button></div>
</div>`

  const find = el => recs.find(r => r.id === el.closest('[data-id]')?.dataset.id)
  const save = async (r, patch, message) => {
    const before = { ...r }
    Object.assign(r, patch)
    draw()
    try {
      await api.updateRec(r.id, patch)
      if (message) toast(message)
    } catch (e) {
      Object.assign(r, before)
      draw()
      toast(friendly(e), { bad: true })
    }
  }
  const saveText = debounce(async (r, field, value) => {
    try {
      if (field === 'note') await api.setNote(r.id, value)
      else await api.updateRec(r.id, { [field]: value })
      r[field] = value
      toast('Saved')
    } catch (e) {
      toast(friendly(e), { bad: true })
    }
  }, 700)

  root.onclick = async e => {
    const t = e.target
    if (t.closest('[data-tab]')) {
      tab = t.closest('[data-tab]').dataset.tab
      return draw()
    }
    if (t.closest('[data-add]')) return editor(null)
    if (t.closest('[data-share]')) {
      await navigator.clipboard?.writeText(link).catch(() => {})
      return toast('Link copied')
    }
    const r = find(t)
    if (!r) return
    if (t.closest('[data-more]')) {
      open.has(r.id) ? open.delete(r.id) : open.add(r.id)
      return draw()
    }
    if (t.closest('[data-status]')) {
      const status = t.closest('[data-status]').dataset.status
      const patch = { status, decided_at: PUBLIC(status) ? r.decided_at ?? new Date().toISOString() : null }
      // "I tried it" opens the rating right away.
      if (status === 'tried') {
        open.add(r.id)
        if (tab !== 'all') tab = 'done'
      }
      return save(r, patch, { up_next: 'Moved to To try', tried: 'Rate it below', already_done: 'Marked as already tried', passed: 'Skipped' }[status])
    }
    if (t.closest('[data-rate]')) return save(r, { rating: Number(t.closest('[data-rate]').dataset.rate) }, 'Saved')
    if (t.closest('[data-edit]')) return editor(r)
    if (t.closest('[data-delete]')) {
      if (!confirm(`Delete “${r.title}”?`)) return
      try {
        await api.deleteRec(r.id)
        recs.splice(recs.indexOf(r), 1)
        draw()
        toast('Deleted')
      } catch (err) {
        toast(friendly(err), { bad: true })
      }
    }
  }
  root.oninput = e => {
    const r = find(e.target)
    if (!r) return
    if (e.target.matches('[data-review]')) saveText(r, 'review', e.target.value)
    if (e.target.matches('[data-note]')) saveText(r, 'note', e.target.value)
  }
  root.onchange = e => {
    const r = find(e.target)
    if (r && e.target.matches('[data-visible]')) save(r, { hidden: !e.target.checked }, e.target.checked ? 'Shown on your page' : 'Hidden from your page')
  }

  // Add something yourself, or change the details. Pictures are links, not uploads.
  function editor(r) {
    const d = sheet(`<form class="sheet-body" method="dialog" data-form>
  <h2 class="title" style="font-size:1.8rem;margin-bottom:20px">${r ? 'Edit' : 'Add something to try'}</h2>
  <label class="field"><span>Link <small>optional, fills in the rest</small></span><input name="link" type="url" inputmode="url" value="${esc(r?.link)}" placeholder="Paste a link (YouTube, Spotify, Maps…)"></label>
  <p class="hint" data-autofill aria-live="polite"></p>
  <label class="field"><span>Name</span><input name="title" required maxlength="120" value="${esc(r?.title)}"></label>
  <label class="field"><span>Type</span><select name="category">${CATEGORIES.map(c => `<option value="${c.toLowerCase()}" ${c.toLowerCase() === (r?.category ?? 'other') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label class="field"><span>Picture <small>link to an image, optional</small></span><input name="cover_url" type="url" value="${esc(r?.cover_url)}" placeholder="https://"></label>
  <label class="field"><span>Tags <small>separate with commas</small></span><input name="tags" value="${esc((r?.tags ?? []).join(', '))}"></label>
  ${r ? '' : '<label class="field"><span>Who recommended it? <small>optional</small></span><input name="sender_name" maxlength="60"></label>'}
  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px"><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">${r ? 'Save' : 'Add'}</button></div>
</form>`)
    const form = d.querySelector('[data-form]')
    d.querySelector('[data-cancel]').onclick = () => d.close()
    if (!r) bindAutofill({ link: form.link, title: form.title, kind: form.category, cover: form.cover_url, status: d.querySelector('[data-autofill]') })
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const f = Object.fromEntries(new FormData(form))
      const cover = f.cover_url.trim()
      if (cover && !safeImage(cover)) return toast('The picture must be an https:// link', { bad: true })
      const tags = [...new Set(f.tags.split(',').map(x => x.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 8)
      const fields = { title: f.title.trim(), category: f.category, link: f.link.trim() || null, cover_url: cover || null, tags }
      try {
        if (r) {
          await api.updateRec(r.id, fields)
          Object.assign(r, fields)
        } else {
          const added = await api.addRec({ ...fields, sender_name: (f.sender_name ?? '').trim(), status: 'up_next' })
          recs.unshift({ ...added, note: '' })
          tab = 'up_next'
        }
        d.close()
        draw()
        toast(r ? 'Saved' : 'Added to To try')
      } catch (err) {
        toast(friendly(err), { bad: true })
      }
    })
  }

  draw()
}

function emptyState(tab, total, link) {
  if (!total) return `<div class="empty"><span class="serif">No recommendations yet</span>Share your link so people can send you some.
    <p style="margin-top:14px"><code>${esc(link.replace(/^https?:\/\//, ''))}</code></p><p><button class="btn" data-share>Copy my link</button></p></div>`
  return `<div class="empty">${{ new: 'Nothing new.', up_next: 'Nothing to try yet.', done: 'Nothing tried yet.', passed: 'Nothing skipped.' }[tab] ?? 'Nothing here.'}</div>`
}
