// Default sections and the section renderer. A frontend passes its own section map; any
// section that is missing or throws falls back to the default below, and if that also fails
// the section is dropped. One broken section never takes the page down.

import { esc, recCard, rating, personLink, empty } from './components.js'
import { SECTIONS } from './schema.js'

const tried = data => data.recs.filter(r => r.status === 'tried')
const heading = (id, extra = '') => `<h2>${esc(SECTIONS[id])}${extra ? ` <small>${extra}</small>` : ''}</h2>`

export const defaultSections = {
  'hero': ({ data, theme }) => {
    const { owner, stats } = data
    const statsHtml = theme.settings['hero.showStats'] === 'yes'
      ? `<dl data-ryt="stats">
    <div><dt>tried</dt><dd>${stats.tried}</dd></div>
    <div><dt>already tried</dt><dd>${stats.alreadyDone}</dd></div>
    <div><dt>average</dt><dd>${stats.avgRating ?? '–'}</dd></div>
  </dl>`
      : ''
    const initial = esc((owner.name || owner.handle || '?').trim()[0]?.toUpperCase() ?? '?')
    const hue = [...owner.handle].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 360
    return `<div data-ryt="hero">
  <span data-ryt="avatar" style="--h:${hue}" aria-hidden="true">${initial}${owner.avatar ? `<img src="${esc(owner.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
  <p data-ryt="eyebrow">@${esc(owner.handle)}</p>
  <h1>${esc(owner.name)}</h1>
  ${owner.bio ? `<p data-ryt="bio">${esc(owner.bio)}</p>` : ''}
  <p data-ryt="tagline">What people told me to try, and what I think.</p>
  ${statsHtml}
</div>`
  },

  'hall-of-fame': ({ data, theme }) => {
    const top = tried(data)
      .filter(r => r.rating)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, theme.settings['hallOfFame.count'])
    if (!top.length) return ''
    return `${heading('hall-of-fame')}<div data-ryt="list" data-variant="featured">${top.map(r => recCard(r, theme)).join('')}</div>`
  },

  'tried': ({ data, theme }) => {
    const items = tried(data)
    return `${heading('tried', items.length)}${items.length
      ? `<div data-ryt="list">${items.map(r => recCard(r, theme)).join('')}</div>`
      : empty('Nothing tried yet. Recommend me something!')}`
  },

  'already-there': ({ data }) => {
    const items = data.recs.filter(r => r.status === 'already_done')
    if (!items.length) return ''
    return `${heading('already-there')}
<ul data-ryt="compact-list">${items.map(r => `<li data-ryt="rec-card" data-status="already_done"><span data-ryt="title">${esc(r.title)}</span> <span data-ryt="credit">from ${personLink(r.from)}</span></li>`).join('')}</ul>`
  },

  'recommended-by-me': ({ data, theme }) => {
    const items = data.recommendedByMe
    if (!items.length) return ''
    return `${heading('recommended-by-me')}
<ul data-ryt="compact-list">${items.map(r => `<li data-ryt="sent-rec"><span data-ryt="title">${esc(r.title)}</span> <span data-ryt="credit">→ ${personLink(r.to)}</span> ${r.status === 'already_done' ? '<em>already tried</em>' : rating(r.rating, theme.tokens['rating.style'])}</li>`).join('')}</ul>`
  },
}

export function renderSections({ ids, sections = {}, ctx, onFallback }) {
  return ids.map(id => {
    const candidates = [['custom', sections[id]], ['default', defaultSections[id]]]
    for (const [kind, impl] of candidates) {
      if (typeof impl !== 'function') continue
      try {
        const inner = impl(ctx)
        if (typeof inner !== 'string') throw new Error('section must return a string')
        return inner ? `<section data-ryt="section" data-section="${esc(id)}" id="${esc(id)}">${inner}</section>` : ''
      } catch (e) {
        onFallback?.(id, kind, e)
      }
    }
    return ''
  }).join('\n')
}
