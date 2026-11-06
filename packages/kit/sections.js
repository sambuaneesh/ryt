// The blocks of a page, and the renderer. A frontend passes its own section map; any block
// that is missing or throws falls back to the default below, and if that also fails it is
// dropped. One broken block never takes the page down. A block with nothing to show returns ''.

import { esc, recCard, rating, personLink, empty, shortDate, thingUrl } from './components.js'
import { SECTIONS } from './schema.js'

const tried = data => data.recs.filter(r => r.status === 'tried')
// Pinned first, then the newest verdicts.
const ordered = items => [...items].sort((a, b) => (b.pinned === true) - (a.pinned === true) || String(b.date ?? '').localeCompare(String(a.date ?? '')))
const heading = (id, data, extra = '') => `<h2>${esc(data.labels?.[id] || SECTIONS[id])}${extra !== '' ? ` <small>${extra}</small>` : ''}</h2>`
const hue = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 360
const cardCtx = data => ({ links: data.links })
const DAY = 86400e3
const ago = iso => (Date.now() - Date.parse(iso ?? '')) / DAY
const fromKey = r => r.from?.handle ?? r.from?.name ?? null

// ---------------------------------------------------------------- map (no library, no key)
// Places come from their links: Google Maps "@lat,lng" / "?q=lat,lng", OpenStreetMap
// "#map=z/lat/lng" or "mlat=…&mlon=…", or a "Where" field written as "lat, lng".
export function coordsOf(rec) {
  const texts = [rec.url ?? '', ...Object.values(rec.extra ?? {})]
  for (const t of texts) {
    const m = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(t) ?? /[?&](?:q|ll|query|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(t)
      ?? /#map=\d+\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/.exec(t) ?? /^\s*(-?\d{1,2}\.\d{2,}),\s*(-?\d{1,3}\.\d{2,})\s*$/.exec(t)
    const n = /mlat=(-?\d{1,2}\.\d+)&mlon=(-?\d{1,3}\.\d+)/.exec(t)
    const hit = m ?? n
    if (hit) {
      const [lat, lng] = [Number(hit[1]), Number(hit[2])]
      if (Math.abs(lat) <= 85 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}
const W = 768, H = 400
const project = (lat, lng, z) => {
  const s = 256 * 2 ** z
  const x = ((lng + 180) / 360) * s
  const r = (lat * Math.PI) / 180
  return { x, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s }
}
function mapHtml(places) {
  const lats = places.map(p => p.at.lat), lngs = places.map(p => p.at.lng)
  // The closest zoom that still fits every place, with a margin.
  let z = 14
  for (; z > 1; z--) {
    const a = project(Math.max(...lats), Math.min(...lngs), z), b = project(Math.min(...lats), Math.max(...lngs), z)
    if (b.x - a.x < W * 0.8 && b.y - a.y < H * 0.75) break
  }
  const centre = project((Math.max(...lats) + Math.min(...lats)) / 2, (Math.max(...lngs) + Math.min(...lngs)) / 2, z)
  const left = centre.x - W / 2, top = centre.y - H / 2, n = 2 ** z
  const tiles = []
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + W) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) {
      if (ty < 0 || ty >= n) continue
      const x = ((tx % n) + n) % n
      tiles.push(`<img src="https://tile.openstreetmap.org/${z}/${x}/${ty}.png" alt="" loading="lazy" referrerpolicy="no-referrer" style="left:${((tx * 256 - left) / W * 100).toFixed(3)}%;top:${((ty * 256 - top) / H * 100).toFixed(3)}%;width:${(256 / W * 100).toFixed(3)}%">`)
    }
  }
  const pins = places.map((p, i) => {
    const pt = project(p.at.lat, p.at.lng, z)
    return `<a data-ryt="pin-mark" href="#r-${esc(p.rec.id)}" style="left:${((pt.x - left) / W * 100).toFixed(2)}%;top:${((pt.y - top) / H * 100).toFixed(2)}%" title="${esc(p.rec.title)}${p.rec.rating ? ` · ${p.rec.rating}/10` : ''}"><span>${i + 1}</span></a>`
  }).join('')
  return `<div data-ryt="map"><div data-ryt="map-tiles">${tiles.join('')}</div>${pins}<small data-ryt="map-credit">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></small></div>
<ol data-ryt="map-key">${places.map(p => `<li><a href="#r-${esc(p.rec.id)}">${esc(p.rec.title)}</a>${p.rec.rating ? ` <b>${p.rec.rating}</b>` : ''}</li>`).join('')}</ol>`
}

// ---------------------------------------------------------------- the blocks
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
    const fresh = tried(data).filter(r => ago(r.date) <= 7).length
    const initial = esc((owner.name || owner.handle || '?').trim()[0]?.toUpperCase() ?? '?')
    return `<div data-ryt="hero">
  <span data-ryt="avatar" style="--h:${hue(owner.handle)}" aria-hidden="true">${initial}${owner.avatar ? `<img src="${esc(owner.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
  <p data-ryt="eyebrow">@${esc(owner.handle)}</p>
  <h1>${esc(owner.name)}</h1>
  ${owner.bio ? `<p data-ryt="bio">${esc(owner.bio)}</p>` : ''}
  <p data-ryt="tagline">What people told me to try, and what I think.</p>
  ${fresh ? `<p data-ryt="fresh">${fresh} new verdict${fresh === 1 ? '' : 's'} this week</p>` : ''}
  ${statsHtml}
</div>`
  },

  'note': ({ data }) => (data.owner.note ? `<p data-ryt="note">${esc(data.owner.note)}</p>` : ''),

  'now-trying': ({ data }) => {
    const items = data.recs.filter(r => r.status === 'trying')
    if (!items.length) return ''
    return `${heading('now-trying', data)}<ul data-ryt="trying">${items.map(r => `<li data-category="${esc(r.category)}">
  <span data-ryt="category">${esc(r.category)}</span><b data-ryt="title">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>` : esc(r.title)}</b>
  ${r.progress ? `<span data-ryt="progress">${esc(r.progress)}</span>` : ''}<span data-ryt="credit">from ${personLink(r.from)}</span></li>`).join('')}</ul>`
  },

  'my-list': ({ data }) => {
    const items = data.recs.filter(r => r.status === 'want')
    if (!items.length) return ''
    const kinds = [...new Set(items.map(r => r.category))]
    return `${heading('my-list', data, items.length)}
${items.length > 5 && kinds.length > 1 ? `<div data-ryt="filters" role="group" aria-label="Show">${[['all', 'All'], ...kinds.map(k => [`cat:${k}`, k])].map(([f, l], i) => `<button type="button" data-filter="${esc(f)}" aria-pressed="${i === 0}">${esc(l)}</button>`).join('')}</div>` : ''}
<div data-ryt="list" data-variant="want">${items.map(r => `<article data-ryt="rec-card" data-status="want" id="r-${esc(r.id)}" data-id="${esc(r.id)}" data-category="${esc(r.category)}" data-from="${esc(r.from?.name ?? '')}" data-date="${esc((r.date ?? '').slice(0, 10))}">
  <span data-ryt="category">${esc(r.category)}</span>
  <b data-ryt="title">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>` : esc(r.title)}</b>
  ${r.from ? `<span data-ryt="credit">from ${personLink(r.from)}</span>` : ''}
</article>`).join('')}</div>`
  },

  'hall-of-fame': ({ data, theme }) => {
    const top = tried(data)
      .filter(r => r.rating)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, theme.settings['hallOfFame.count'])
    if (!top.length) return ''
    return `${heading('hall-of-fame', data)}<div data-ryt="list" data-variant="featured">${top.map(r => recCard(r, theme, cardCtx(data))).join('')}</div>`
  },

  'wall': ({ data }) => {
    const tens = tried(data).filter(r => r.rating === 10)
    if (!tens.length) return ''
    return `${heading('wall', data, tens.length)}<div data-ryt="wall">${tens.map(r => `<a data-ryt="wall-item" href="#r-${esc(r.id)}" style="--h:${hue(r.category + r.title)}${r.cover ? `;--cover:url(&quot;${esc(r.cover)}&quot;)` : ''}"><span>${esc(r.title)}</span></a>`).join('')}</div>`
  },

  'ask': ({ data }) => {
    if (!data.asks.length || !data.links.send) return ''
    return `${heading('ask', data)}<ul data-ryt="asks">${data.asks.map(a => `<li>
  <p data-ryt="ask-text">${esc(a.text)}</p>
  ${a.date ? `<p data-ryt="credit">Asked ${shortDate(a.date)}</p>` : ''}
  <a data-ryt="button" href="${esc(`${data.links.send}?ask=${encodeURIComponent(a.id)}`)}" data-ryt-nav>Answer this</a></li>`).join('')}</ul>`
  },

  'tried': ({ data, theme }) => {
    const items = ordered(tried(data))
    if (!items.length) return `${heading('tried', data, 0)}${empty('Nothing tried yet. Recommend me something!')}`
    // Filters: a few ways to slice the list (made to work by the page script; harmless without it).
    const kinds = [...new Set(items.map(r => r.category))]
    const people = Object.entries(items.reduce((m, r) => (r.from?.name ? { ...m, [r.from.name]: (m[r.from.name] ?? 0) + 1 } : m), {})).sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, n]) => n > 1)
    const chips = [['all', 'All'], ['rating:9', '9 and up'], ...(items.some(r => r.rating === 10) ? [['rating:10', 'Only 10s']] : []),
      ...kinds.map(k => [`cat:${k}`, k]), ...people.map(([n]) => [`from:${n}`, `From ${n.split(' ')[0]}`]), ...(items.some(r => ago(r.date) <= 31) ? [['recent:31', 'Last month']] : [])]
    return `${heading('tried', data, items.length)}
${items.length > 3 ? `<div data-ryt="filters" role="group" aria-label="Show">${chips.map(([f, l], i) => `<button type="button" data-filter="${esc(f)}" aria-pressed="${i === 0}">${esc(l)}</button>`).join('')}</div>` : ''}
<div data-ryt="list">${items.map(r => recCard(r, theme, cardCtx(data))).join('')}</div>`
  },

  'lists': ({ data }) => {
    const byId = new Map(data.recs.map(r => [r.id, r]))
    const lists = data.lists.map(l => ({ ...l, recs: l.items.map(id => byId.get(id)).filter(Boolean) })).filter(l => l.recs.length)
    if (!lists.length) return ''
    return `${heading('lists', data)}<div data-ryt="lists">${lists.map(l => `<details data-ryt="list-card">
  <summary><b>${esc(l.title)}</b><span>${l.recs.length} thing${l.recs.length === 1 ? '' : 's'}</span>
  <span data-ryt="list-peek">${l.recs.slice(0, 4).map(r => `<i style="--h:${hue(r.category + r.title)}${r.cover ? `;--cover:url(&quot;${esc(r.cover)}&quot;)` : ''}"></i>`).join('')}</span></summary>
  ${l.description ? `<p>${esc(l.description)}</p>` : ''}
  <ol>${l.recs.map(r => `<li><a href="#r-${esc(r.id)}">${esc(r.title)}</a>${r.rating ? ` <b>${r.rating}</b>` : ''}</li>`).join('')}</ol>
</details>`).join('')}</div>`
  },

  'shelf': ({ data }) => {
    const items = data.recs.filter(r => r.status !== 'trying')
    if (items.length < 3) return ''
    return `${heading('shelf', data, items.length)}<div data-ryt="shelf">${items.slice(0, 60).map(r => `<a data-ryt="spine" href="#r-${esc(r.id)}" title="${esc(r.title)}${r.rating ? ` · ${r.rating}/10` : ''}" style="--h:${hue(r.category + r.title)};--tall:${70 + (r.rating ?? 6) * 3}%${r.cover ? `;--cover:url(&quot;${esc(r.cover)}&quot;)` : ''}"><span>${esc(r.title)}</span></a>`).join('')}</div>`
  },

  'map': ({ data }) => {
    const places = data.recs.map(rec => ({ rec, at: coordsOf(rec) })).filter(p => p.at).slice(0, 30)
    if (!places.length) return ''
    return `${heading('map', data, places.length)}${mapHtml(places)}`
  },

  'taste': ({ data }) => {
    const items = data.recs.filter(r => r.status === 'tried' || r.status === 'already_done')
    if (items.length < 3) return ''
    const by = {}
    for (const r of items) (by[r.category] ??= []).push(r)
    const rows = Object.entries(by).sort((a, b) => b[1].length - a[1].length)
    return `${heading('taste', data)}
<div data-ryt="taste-bar">${rows.map(([k, rs]) => `<span style="flex:${rs.length};--h:${hue(k)}" title="${esc(k)} ${Math.round(rs.length / items.length * 100)}%"></span>`).join('')}</div>
<ul data-ryt="taste">${rows.map(([k, rs]) => {
      const rated = rs.filter(r => r.rating)
      const avg = rated.length ? Math.round(rated.reduce((a, r) => a + r.rating, 0) / rated.length * 10) / 10 : null
      return `<li><i style="--h:${hue(k)}"></i><b>${esc(k)}</b> <span>${Math.round(rs.length / items.length * 100)}%</span>${avg ? ` <small>avg ${avg}</small>` : ''}</li>`
    }).join('')}</ul>`
  },

  'recommenders': ({ data }) => {
    const by = new Map()
    for (const r of tried(data)) {
      const k = fromKey(r)
      if (!k || !r.rating) continue
      const e = by.get(k) ?? { from: r.from, ratings: [] }
      e.ratings.push(r.rating)
      by.set(k, e)
    }
    const rows = [...by.values()].map(e => ({ ...e, avg: e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length }))
      .sort((a, b) => b.avg - a.avg || b.ratings.length - a.ratings.length).slice(0, 5)
    if (rows.length < 2) return ''
    return `${heading('recommenders', data)}<ol data-ryt="recommenders">${rows.map(e => `<li><span data-ryt="who">${personLink(e.from)}</span>
  <span data-ryt="meter"><span style="width:${e.avg * 10}%"></span></span><b>${Math.round(e.avg * 10) / 10}</b> <small>${e.ratings.length} tried</small></li>`).join('')}</ol>`
  },

  'circle': ({ data }) => {
    if (!data.circle.length) return ''
    return `${heading('circle', data)}<ul data-ryt="circle">${data.circle.slice(0, 12).map(c => `<li><a ${c.profileUrl ? `href="${esc(c.profileUrl)}" data-ryt-nav` : ''}>
  <span data-ryt="face" style="--h:${hue(c.handle ?? c.name)}">${esc((c.name || '?')[0].toUpperCase())}${c.avatar ? `<img src="${esc(c.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
  <b>${esc(c.name)}</b><small>${[c.gave ? `sent me ${c.gave}` : '', c.got ? `got ${c.got} from me` : ''].filter(Boolean).join(' · ')}</small></a></li>`).join('')}</ul>`
  },

  'year': ({ data }) => {
    const year = new Date().getFullYear()
    const items = tried(data).filter(r => String(r.date ?? '').startsWith(String(year)))
    if (items.length < 3) return ''
    const months = Array.from({ length: 12 }, (_, m) => items.filter(r => Number(r.date.slice(5, 7)) === m + 1).length)
    const top = Math.max(...months)
    const best = months.indexOf(top)
    const kinds = Object.entries(items.reduce((m, r) => ({ ...m, [r.category]: (m[r.category] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
    const people = Object.entries(items.reduce((m, r) => (r.from?.name ? { ...m, [r.from.name]: (m[r.from.name] ?? 0) + 1 } : m), {})).sort((a, b) => b[1] - a[1])
    const rated = items.filter(r => r.rating)
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${heading('year', data, year)}<div data-ryt="year">
  <dl>
    <div><dt>tried</dt><dd>${items.length}</dd></div>
    ${rated.length ? `<div><dt>average</dt><dd>${Math.round(rated.reduce((a, r) => a + r.rating, 0) / rated.length * 10) / 10}</dd></div>` : ''}
    <div><dt>busiest month</dt><dd>${MONTHS[best]}</dd></div>
    <div><dt>most tried</dt><dd>${esc(kinds[0][0])}</dd></div>
    ${people[0] ? `<div><dt>best friend for tips</dt><dd>${esc(people[0][0])}</dd></div>` : ''}
  </dl>
  <div data-ryt="months">${months.map((n, m) => `<span title="${MONTHS[m]}: ${n}"><i style="height:${top ? Math.max(4, n / top * 100) : 4}%"></i><small>${MONTHS[m][0]}</small></span>`).join('')}</div>
  ${rated.length ? `<p data-ryt="year-top">Top of the year: ${rated.sort((a, b) => b.rating - a.rating).slice(0, 3).map(r => `<a href="#r-${esc(r.id)}">${esc(r.title)}</a>`).join(', ')}</p>` : ''}
  ${data.links.page ? `<p data-ryt="year-share"><a data-ryt="copy-link" href="${esc(`${data.links.page}#year`)}">Copy link to my year</a></p>` : ''}
</div>`
  },

  'shame': ({ data, theme }) => {
    const low = tried(data).filter(r => r.rating && r.rating <= 3)
    if (!low.length) return ''
    return `${heading('shame', data, low.length)}<ul data-ryt="compact-list" data-variant="shame">${low.map(r => `<li><span data-ryt="title">${esc(r.title)}</span> ${rating(r.rating, theme.tokens['rating.style'])}${r.review ? ` <em>“${esc(r.review)}”</em>` : ''} <span data-ryt="credit">from ${personLink(r.from)}</span></li>`).join('')}</ul>`
  },

  'already-there': ({ data }) => {
    const items = data.recs.filter(r => r.status === 'already_done')
    if (!items.length) return ''
    return `${heading('already-there', data)}
<ul data-ryt="compact-list">${items.map(r => `<li data-ryt="rec-card" data-status="already_done" ${r.id ? `id="r-${esc(r.id)}"` : ''}><span data-ryt="title">${esc(r.title)}</span> <span data-ryt="credit">from ${personLink(r.from)}</span></li>`).join('')}</ul>`
  },

  'recommended-by-me': ({ data, theme }) => {
    const items = data.recommendedByMe
    if (!items.length) return ''
    return `${heading('recommended-by-me', data)}
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


