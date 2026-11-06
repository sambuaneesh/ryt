// Makes a drawn page interactive. Used by Recommend You This for its own pages and by
// client.js in forks, so a fork gets it for free (or replaces it).
//
//   enhance(doc, { data, actions, hash })
//     actions.react(recId, emoji, delta)  -> new count, or null   (reactions)
//     actions.alsoTried(title)            -> [{ name, profileUrl, rating }]  (who else tried it)
//
// Everything here is optional sugar: the page reads fine without it.

const storage = doc => {
  try {
    const s = doc.defaultView.localStorage
    s.getItem('x')
    return s
  } catch {
    return null
  }
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function enhance(doc, { data, actions = {}, hash = '' } = {}) {
  const store = storage(doc)
  const handle = data?.owner?.handle ?? 'page'

  // ---- filters on the "Tried" list
  doc.addEventListener('click', e => {
    const chip = e.target.closest?.('[data-ryt="filters"] [data-filter]')
    if (!chip) return
    const bar = chip.parentElement
    bar.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === chip)))
    const [kind, value] = chip.dataset.filter.split(/:(.*)/)
    const list = bar.parentElement.querySelector('[data-ryt="list"]')
    const now = Date.now()
    for (const card of list?.querySelectorAll('[data-ryt="rec-card"]') ?? []) {
      const r = Number(card.dataset.rating) || 0
      const show = kind === 'all'
        || (kind === 'rating' && r >= Number(value))
        || (kind === 'cat' && card.dataset.category === value)
        || (kind === 'from' && card.dataset.from === value)
        || (kind === 'recent' && now - Date.parse(card.dataset.date || 0) <= Number(value) * 86400e3)
      card.toggleAttribute('data-hidden-by-filter', !show)
    }
  })

  // ---- reactions (one of each per browser, remembered here)
  const reacted = (id, emoji) => store?.getItem(`ryt-react:${id}:${emoji}`) === '1'
  for (const b of doc.querySelectorAll('[data-ryt="reactions"] [data-emoji]')) {
    const id = b.closest('[data-id]')?.dataset.id
    if (id && reacted(id, b.dataset.emoji)) b.setAttribute('aria-pressed', 'true')
  }
  doc.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-ryt="reactions"] [data-emoji]')
    if (!b || !actions.react) return
    const id = b.closest('[data-id]')?.dataset.id
    if (!id) return
    const emoji = b.dataset.emoji
    const on = !reacted(id, emoji)
    const count = b.querySelector('span')
    const before = Number(count.textContent) || 0
    count.textContent = Math.max(0, before + (on ? 1 : -1)) || ''
    b.setAttribute('aria-pressed', String(on))
    b.classList.remove('pop')
    void b.offsetWidth
    if (on) b.classList.add('pop')
    try { on ? store?.setItem(`ryt-react:${id}:${emoji}`, '1') : store?.removeItem(`ryt-react:${id}:${emoji}`) } catch {}
    const n = await Promise.resolve(actions.react(id, emoji, on ? 1 : -1)).catch(() => null)
    if (typeof n === 'number') count.textContent = n || ''
  })

  // ---- "who else tried it", filled in when a card unfolds
  doc.addEventListener('toggle', async e => {
    const more = e.target
    if (!more.matches?.('[data-ryt="more"]') || !more.open || more.dataset.loaded || !actions.alsoTried) return
    more.dataset.loaded = '1'
    const title = more.closest('[data-ryt="rec-card"]')?.querySelector('[data-ryt="title"]')?.textContent.trim()
    if (!title) return
    const others = (await Promise.resolve(actions.alsoTried(title)).catch(() => [])).filter(o => o.handle !== handle)
    if (!others.length) return
    more.insertAdjacentHTML('beforeend', `<p data-ryt="also-list">Also tried by ${others.slice(0, 6).map(o => `${o.profileUrl ? `<a href="${esc(o.profileUrl)}" data-ryt-nav>${esc(o.name)}</a>` : esc(o.name)}${o.rating ? ` (${o.rating})` : ''}`).join(', ')}${others.length > 6 ? ` and ${others.length - 6} more` : ''}</p>`)
  }, true)

  // ---- new since your last visit
  if (store) {
    const key = `ryt-seen:${handle}`
    const last = Number(store.getItem(key)) || 0
    if (last) {
      for (const card of doc.querySelectorAll('article[data-ryt="rec-card"][data-date]')) {
        if (Date.parse(card.dataset.date) > last) card.setAttribute('data-new', '')
      }
    }
    try { store.setItem(key, String(Date.now())) } catch {}
  }

  // ---- "Copy link" (e.g. to your Year in review)
  doc.addEventListener('click', async e => {
    const a = e.target.closest?.('a[data-ryt="copy-link"]')
    if (!a) return
    e.preventDefault()
    try {
      await doc.defaultView.navigator.clipboard.writeText(a.href)
      const before = a.textContent
      a.textContent = 'Copied'
      setTimeout(() => { a.textContent = before }, 1600)
    } catch {
      doc.defaultView.prompt?.('Copy this link', a.href)
    }
  }, true)

  // ---- jump to a card (#r-<id>): from the map, lists, wall, shelf, or a shared link
  const jump = id => {
    const card = doc.getElementById(id)
    if (!card) return false
    card.closest('[data-hidden-by-filter]')?.removeAttribute('data-hidden-by-filter')
    card.querySelector('[data-ryt="more"]')?.setAttribute('open', '')
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.classList.remove('flash')
    void card.offsetWidth
    card.classList.add('flash')
    return true
  }
  doc.addEventListener('click', e => {
    const a = e.target.closest?.('a[href^="#r-"]')
    if (a && jump(a.getAttribute('href').slice(1))) e.preventDefault()
  })
  if (/^#r-/.test(hash)) setTimeout(() => jump(hash.slice(1)), 300)
}
