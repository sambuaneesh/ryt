// The Hugo design gallery (327 themes): search, tag filters, paging. Shared by Settings and
// onboarding; the caller decides what picking a design does.
//
//   mountGallery(el, { current, onPick(entry, card), pageSize?, compact? })  ->  { select(slug) }

import { catalog } from './designs.js'
import { esc, debounce } from './ui.js'

const PAGE_SIZE = 48
const TAGS = ['dark', 'light', 'minimal', 'blog', 'personal', 'portfolio']
// Search and filters survive leaving the screen and coming back.
const remembered = { query: '', tag: null }

export const galleryCard = (d, current) => `<button type="button" class="design" data-design="${esc(d.slug)}" aria-current="${current}">
  <span class="thumb">${d.thumb ? `<img src="${esc(d.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>
  <span class="name"><span>${esc(d.name)}</span><span class="swatch">${d.swatch.slice(0, 4).map(c => `<i style="background:${esc(c)}"></i>`).join('')}</span></span></button>`

export async function mountGallery(el, { current = null, onPick, pageSize = PAGE_SIZE, compact = false }) {
  const all = await catalog()
  let limit = pageSize
  let selected = current
  el.innerHTML = `<input class="input" type="search" placeholder="Search ${all.length} designs" value="${esc(remembered.query)}" data-search aria-label="Search designs">
  <div class="chips">${TAGS.map(t => `<button type="button" class="chip" aria-pressed="${remembered.tag === t}" data-tag="${t}">${t}</button>`).join('')}</div>
  <div class="designs${compact ? ' compact' : ''}" data-grid></div>
  <p style="text-align:center;margin-top:20px"><button type="button" class="btn" data-more hidden>Show more</button></p>`
  const grid = el.querySelector('[data-grid]')
  const matches = () => {
    const q = remembered.query.trim().toLowerCase()
    return all.filter(d => (!q || d.name.toLowerCase().includes(q) || d.slug.includes(q)) && (!remembered.tag || d.tags.includes(remembered.tag)))
  }
  const draw = () => {
    const found = matches()
    grid.innerHTML = found.length ? found.slice(0, limit).map(d => galleryCard(d, d.slug === selected)).join('') : '<p class="muted">No designs match.</p>'
    el.querySelector('[data-more]').hidden = found.length <= limit
  }
  draw()
  el.querySelector('[data-search]').addEventListener('input', debounce(e => { remembered.query = e.target.value; limit = pageSize; draw() }, 150))
  el.addEventListener('click', e => {
    const tag = e.target.closest('[data-tag]')
    if (tag) {
      remembered.tag = remembered.tag === tag.dataset.tag ? null : tag.dataset.tag
      el.querySelectorAll('[data-tag]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tag === remembered.tag)))
      limit = pageSize
      return draw()
    }
    if (e.target.closest('[data-more]')) {
      limit += pageSize
      return draw()
    }
    const card = e.target.closest('[data-design]')
    if (card) onPick?.(all.find(d => d.slug === card.dataset.design), card)
  })
  return {
    all,
    select(slug) {
      selected = slug
      el.querySelectorAll('[data-design]').forEach(b => b.setAttribute('aria-current', String(b.dataset.design === slug)))
    },
  }
}
