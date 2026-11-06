// Your inbox: everything people recommended to you (and things you added). Private to you.
// Each one shows what it is, who sent it and why, and the next step. The rest (rating,
// review, private note, show on page, edit, delete) opens under "More".

import { api } from '../backend/index.js'
import { screen } from './chrome.js'
import { esc, href, absolute, toast, friendly, sheet, debounce, safeImage, timeAgo, CATEGORIES, STATUS } from '../ui.js'
import { objectCard } from '../objects.js'
import { bindAutofill } from '../unfurl.js'

const TABS = [['new', 'New'], ['up_next', 'My list'], ['done', 'Tried'], ['passed', 'Skipped'], ['all', 'All']]
const inTab = (r, tab) => tab === 'all' || (tab === 'done' ? r.status === 'tried' || r.status === 'already_done' : r.status === tab)
const PUBLIC = s => s === 'tried' || s === 'already_done'
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : 'Other')
let tab = null

export async function show(root, ctx) {
  const { session } = ctx
  const recs = await api.inbox()
  const open = new Set()
  // People who recommended you things with their account: so you can recommend something back.
  // Your requests ("Ask me"), to show which recommendations answer them.
  const asks = new Map(((await api.asksOf?.(session.profile.id, { all: true }).catch(() => [])) ?? []).map(a => [a.id, a]))
  // Field names you've used before, offered again.
  const fieldNames = () => [...new Set(recs.flatMap(r => Object.keys(r.extra ?? {})))]
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
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-share>Copy my link</button><button class="btn primary" data-add>Add to my list</button></div>
  </div>
  <div class="toolbar"><div class="segmented" role="group" aria-label="Show">${TABS.map(([k, label]) =>
    `<button aria-pressed="${tab === k}" data-tab="${k}">${label}${count(k) ? `<span class="n">${count(k)}</span>` : ''}</button>`).join('')}</div></div>
  <div class="recs">${shown.length ? shown.map(card).join('') : emptyState(tab, recs.length, link)}</div>
  <datalist id="field-names">${[...new Set([...fieldNames(), 'Where I watched', 'Where', 'With', 'Format', 'Price', 'Best part'])].map(n => `<option value="${esc(n)}">`).join('')}</datalist>`)
  }

  const card = r => {
    const from = r.sender_name ? `from ${r.sender_name}${r.manual ? ' (added by you)' : ''}` : r.manual ? 'added by you' : 'from someone'
    return `<article class="rec" data-id="${esc(r.id)}">
  ${objectCard({ kind: r.category, title: r.title, link: r.link, from, when: timeAgo(r.created_at), score: r.status === 'tried' ? r.rating : null })}
  <div class="rec-side">
    <span class="rec-state${r.status === 'new' ? ' new' : ''}">${r.trying && !PUBLIC(r.status) ? `Trying now${r.progress ? ` · ${esc(r.progress)}` : ''}` : esc(STATUS[r.status])}${r.pinned && PUBLIC(r.status) ? ' · pinned' : ''}${r.sender_name && !r.show_sender ? ' · name hidden on your page' : ''}</span>
    ${r.ask_id && asks.get(r.ask_id) ? `<span class="rec-ask">Answers your request: “${esc(asks.get(r.ask_id).text)}”</span>` : ''}
    ${r.pitch ? `<p class="rec-pitch">“${esc(r.pitch)}”</p>` : ''}
    ${r.status === 'tried' && r.review && !open.has(r.id) ? `<p class="rec-review"><b>My review</b>${esc(r.review)}</p>` : ''}
    ${r.status === 'up_next' ? `<label class="toggle-row list-toggle"><span>${r.on_list && !r.hidden ? 'Shown on my page' : 'Hidden from my page'}</span><span class="switch"><input type="checkbox" data-on-list ${r.on_list && !r.hidden ? 'checked' : ''} aria-label="Show in My list on my page"><span></span></span></label>` : ''}
    <div class="rec-actions">${actions(r)}<span class="spacer"></span><button class="link" data-more>${open.has(r.id) ? 'Less' : 'More'}</button></div>
    ${open.has(r.id) ? more(r) : ''}
  </div>
</article>`
  }

  const actions = r => {
    const b = (status, label, cls = '') => `<button class="btn sm ${cls}" data-status="${status}">${label}</button>`
    const trying = `<button class="btn sm${r.trying ? ' primary' : ''}" data-trying>${r.trying ? 'Trying now ✓' : 'Trying now'}</button>`
    if (r.status === 'new') return b('up_next', 'Add to my list') + trying + b('tried', 'I tried it', 'primary') + b('already_done', 'Already tried') + b('passed', 'Skip', 'ghost')
    if (r.status === 'up_next') return trying + b('tried', 'I tried it', 'primary') + b('already_done', 'Already tried') + b('passed', 'Skip', 'ghost')
    if (r.status === 'passed') return b('up_next', 'Move to my list')
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
  ${r.trying && !PUBLIC(r.status) ? `<label class="field" style="margin:0"><span>How far along? <small>shows on your page</small></span><input data-progress maxlength="60" value="${esc(r.progress)}" placeholder="episode 4 of 10, page 120…"></label>` : ''}
  <label class="field" style="margin:0"><span>Private note <small>only you see this</small></span><textarea rows="2" maxlength="2000" data-note>${esc(r.note)}</textarea></label>
  ${PUBLIC(r.status) ? `<div class="field" style="margin:0"><span>Your own fields <small>shown on your page, like “Where I watched: PVR”</small></span>
    <div class="fields" data-fields>${Object.entries(r.extra ?? {}).map(([k, v]) => fieldRow(k, v)).join('')}</div>
    <button type="button" class="link" data-add-field style="justify-self:start">+ Add a field</button></div>
  <div class="toggles">
    <label class="toggle-row"><span>Show on my page</span><span class="switch"><input type="checkbox" data-visible ${r.hidden ? '' : 'checked'} aria-label="Show on my page"><span></span></span></label>
    <label class="toggle-row"><span>Pin to the top</span><span class="switch"><input type="checkbox" data-pin ${r.pinned ? 'checked' : ''} aria-label="Pin to the top of my page"><span></span></span></label>
  </div>` : ''}
  <div style="display:flex;gap:16px;flex-wrap:wrap">${PUBLIC(r.status) || r.status === 'passed' ? '<button class="link" data-status="up_next">Move to my list</button>' : ''}<button class="link" data-edit>Edit</button><button class="link" data-delete>Delete</button></div>
</div>`

  const fieldRow = (k = '', v = '') => `<div class="field-row"><input data-fk list="field-names" maxlength="40" value="${esc(k)}" placeholder="Name" aria-label="Field name"><input data-fv maxlength="200" value="${esc(v)}" placeholder="Value" aria-label="Field value"><button type="button" class="link" data-del-field aria-label="Remove field">✕</button></div>`
  const find = el => recs.find(r => r.id === el.closest('[data-id]')?.dataset.id)
  // Your own fields, read back from a card's editor.
  // The card keeps what you typed at once (a redraw won't lose it); saving waits for a pause.
  const persistFields = debounce(async r => {
    try {
      await api.updateRec(r.id, { extra: r.extra })
      toast('Saved')
    } catch (e) {
      toast(friendly(e), { bad: true })
    }
  }, 700)
  const saveFields = (r, box) => {
    r.extra = Object.fromEntries([...box.querySelectorAll('.field-row')].map(row => [row.querySelector('[data-fk]').value.trim(), row.querySelector('[data-fv]').value.trim()]).filter(([k, v]) => k && v))
    persistFields(r)
  }
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
    if (t.closest('[data-trying]')) {
      const on = !r.trying
      if (on) open.add(r.id)
      return save(r, { trying: on, ...(r.status === 'new' ? { status: 'up_next' } : {}) }, on ? 'Shown on your page as “Now trying”' : 'Not trying any more')
    }
    if (t.closest('[data-add-field]')) {
      const box = t.closest('[data-id]').querySelector('[data-fields]')
      box.insertAdjacentHTML('beforeend', fieldRow())
      box.lastElementChild.querySelector('[data-fk]').focus()
      return
    }
    if (t.closest('[data-del-field]')) {
      const box = t.closest('[data-fields]')
      t.closest('.field-row').remove()
      return saveFields(r, box)
    }
    if (t.closest('[data-more]')) {
      open.has(r.id) ? open.delete(r.id) : open.add(r.id)
      return draw()
    }
    if (t.closest('[data-status]')) {
      const status = t.closest('[data-status]').dataset.status
      const patch = { status, decided_at: PUBLIC(status) ? r.decided_at ?? new Date().toISOString() : null, ...(status !== 'up_next' && r.trying ? { trying: false } : {}), ...(status === 'up_next' && r.status !== 'up_next' ? { on_list: true } : {}) }
      // "I tried it" opens the rating right away.
      if (status === 'tried') {
        open.add(r.id)
        if (tab !== 'all') tab = 'done'
      }
      return save(r, patch, { up_next: 'Added to your list', tried: 'Rate it below', already_done: 'Marked as already tried', passed: 'Skipped' }[status])
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
    if (e.target.matches('[data-progress]')) saveText(r, 'progress', e.target.value.trim())
    if (e.target.matches('[data-fk], [data-fv]')) saveFields(r, e.target.closest('[data-fields]'))
  }
  root.onchange = e => {
    const r = find(e.target)
    if (r && e.target.matches('[data-visible]')) save(r, { hidden: !e.target.checked }, e.target.checked ? 'Shown on your page' : 'Hidden from your page')
    if (r && e.target.matches('[data-on-list]')) save(r, { on_list: e.target.checked, ...(e.target.checked ? { hidden: false } : {}) }, e.target.checked ? 'Shown in My list on your page' : 'Hidden from your page')
    if (r && e.target.matches('[data-pin]')) save(r, { pinned: e.target.checked }, e.target.checked ? 'Pinned to the top of your page' : 'Unpinned')
  }

  // Add something yourself, or change the details. Pictures are links, not uploads.
  function editor(r) {
    const d = sheet(`<form class="sheet-body" method="dialog" data-form>
  <h2 class="title" style="font-size:1.8rem;margin-bottom:20px">${r ? 'Edit' : 'Add to my list'}</h2>
  <label class="field"><span>Link <small>optional, fills in the rest</small></span><input name="link" type="url" inputmode="url" value="${esc(r?.link)}" placeholder="Paste a link (YouTube, Spotify, Maps…)"></label>
  <p class="hint" data-autofill aria-live="polite"></p>
  <label class="field"><span>Name</span><input name="title" required maxlength="120" value="${esc(r?.title)}"></label>
  <label class="field"><span>Type</span><select name="category">${CATEGORIES.map(c => `<option value="${c.toLowerCase()}" ${c.toLowerCase() === (r?.category ?? 'other') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label class="field"><span>Picture <small>link to an image, optional</small></span><input name="cover_url" type="url" value="${esc(r?.cover_url)}" placeholder="https://"></label>
  <label class="field"><span>Tags <small>separate with commas</small></span><input name="tags" value="${esc((r?.tags ?? []).join(', '))}"></label>
  ${r ? '' : `<label class="field"><span>Who recommended it? <small>optional</small></span><input name="sender_name" maxlength="60"></label>
  <label class="toggle-row" style="margin:4px 0 8px"><span>Show it on my page <small class="faint">(in My list)</small></span><span class="switch"><input type="checkbox" name="on_list" checked><span></span></span></label>`}
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
          const added = await api.addRec({ ...fields, sender_name: (f.sender_name ?? '').trim(), status: 'up_next', on_list: f.on_list === 'on' })
          recs.unshift({ ...added, note: '' })
          tab = 'up_next'
        }
        d.close()
        draw()
        toast(r ? 'Saved' : f.on_list === 'on' ? 'Added to your list (shown on your page)' : 'Added to your list (only you see it)')
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
  return `<div class="empty">${{ new: 'Nothing new.', up_next: 'Your list is empty. Add something!', done: 'Nothing tried yet.', passed: 'Nothing skipped.' }[tab] ?? 'Nothing here.'}</div>`
}
