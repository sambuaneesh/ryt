// People's pages: their data in the page contract, drawn by the page renderer (the same one a
// fork changes) in their design, inside a frame so a design's CSS can never touch RYT's own UI.

import { normalizePageData } from '../../packages/contract/index.js'
import { themeStyles, fontHref, esc } from '../../packages/kit/index.js'
import { render } from '../../apps/page/render.js'
import pageCss from '../../apps/page/style.css?raw'
import { absolute, BASE } from './ui.js'

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : 'Other')
const person = (name, handle) => (name || handle ? { name: name || `@${handle}`, handle: handle ?? null, profileUrl: handle ? absolute(`/@${handle}`) : null } : null)

// Database rows -> the page contract. extras: { lists, asks, circle } (v2, all optional).
export function pageData(profile, recs = [], sent = [], extras = {}) {
  const page = profile.theme?.page ?? {}
  return normalizePageData({
    owner: { handle: profile.handle, name: profile.name, bio: profile.bio, profileUrl: absolute(`/@${profile.handle}`), avatar: profile.avatar_url, note: page.note },
    links: { send: absolute(`/@${profile.handle}/send`), page: absolute(`/@${profile.handle}`), home: absolute('/'), thing: absolute('/thing') },
    labels: page.labels,
    recs: recs.map(r => ({
      id: r.id, title: r.title, url: r.link, cover: r.cover_url, category: cap(r.category), tags: r.tags ?? [], pitch: r.pitch, review: r.review,
      status: r.status === 'tried' || r.status === 'already_done' ? r.status : r.trying ? 'trying' : r.on_list ? 'want' : r.status, rating: r.rating, date: r.decided_at ?? r.created_at,
      from: person(r.sender_name, r.sender_handle), progress: r.progress, pinned: r.pinned, extra: r.extra, reactions: r.reactions,
    })),
    recommendedByMe: sent.map(r => ({ id: r.id, title: r.title, to: person(null, r.owner_handle), status: r.status, rating: r.rating })),
    lists: (extras.lists ?? []).map(l => ({ id: l.id, title: l.title, description: l.description, items: l.items })),
    asks: (extras.asks ?? []).map(a => ({ id: a.id, text: a.text, date: a.created_at })),
    circle: extras.circle ?? [],
  })
}

// Everything a page shows, from the database. The v2 parts (lists, requests, circle) are
// best effort: before migration 0003 they are simply empty.
export async function loadPage(api, profile) {
  const soft = p => Promise.resolve(p).catch(() => [])
  const [recs, sent, lists, asks] = await Promise.all([api.publicRecs(profile.id), soft(api.sentBy(profile.handle)), soft(api.listsOf?.(profile.id)), soft(api.asksOf?.(profile.id))])
  // The circle: people who recommend to them (how many, how they rated them) and people they recommend to.
  const people = new Map()
  const at = h => people.get(h) ?? people.set(h, { handle: h, gave: 0, got: 0, ratings: [] }).get(h)
  for (const r of recs) if (r.sender_handle && r.sender_handle !== profile.handle) {
    const p = at(r.sender_handle)
    p.gave++
    if (r.rating) p.ratings.push(r.rating)
  }
  for (const s of sent) if (s.owner_handle && s.owner_handle !== profile.handle) at(s.owner_handle).got++
  const named = new Map((await soft(api.profilesByHandles?.([...people.keys()]))).map(p => [p.handle, p]))
  const circle = [...people.values()].filter(p => named.has(p.handle))
    .sort((a, b) => b.gave + b.got - (a.gave + a.got))
    .map(p => ({ name: named.get(p.handle).name, handle: p.handle, profileUrl: absolute(`/@${p.handle}`), avatar: named.get(p.handle).avatar_url,
      gave: p.gave, got: p.got, avg: p.ratings.length ? p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length : null }))
  return { recs, sent, data: pageData(profile, recs, sent, { lists, asks, circle }) }
}

// What the page script asks for: reactions, and who else tried something.
export function pageActions(api) {
  return {
    react: (id, emoji, delta) => api.react?.(id, emoji, delta),
    async alsoTried(title) {
      const rows = await api.thing?.(title) ?? []
      const named = new Map((await api.profilesByHandles?.([...new Set(rows.map(r => r.owner_handle))]) ?? []).map(p => [p.handle, p]))
      return rows.filter(r => r.status === 'tried' || r.status === 'already_done').map(r => ({ name: named.get(r.owner_handle)?.name ?? `@${r.owner_handle}`, handle: r.owner_handle,
        profileUrl: `${absolute(`/@${r.owner_handle}`)}#r-${r.id}`, rating: r.rating }))
    },
  }
}

// The full HTML document for a page (or the send form, as body) in a theme.
export function pageDocument({ data, theme, body, title }) {
  const fonts = fontHref(theme)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ?? `Recommended to ${data.owner.name}`)}</title>
${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">` : ''}
<style>${theme.tokens.styles === 'plain' ? '' : pageCss}</style>
<style>${themeStyles(theme)}</style>
<style>html { scroll-padding-bottom: 96px; } body { padding-bottom: 96px; }</style>
</head><body>${render({ data, theme, body })}</body></html>`
}

// Draws a document into a same-origin frame and routes its links: in-page anchors scroll,
// RYT links go through the app router, everything else opens in a new tab.
export function mountPage(frame, html, { navigate, onReady } = {}) {
  const doc = frame.contentDocument
  doc.open()
  doc.write(html)
  doc.close()
  doc.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]')
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return
    const url = new URL(a.getAttribute('href'), location.href)
    const app = url.origin === location.origin && url.pathname.startsWith(BASE)
    if (app && url.hash && url.pathname === location.pathname) {
      e.preventDefault()
      doc.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' })
    } else if (app) {
      e.preventDefault()
      navigate?.(url.pathname.slice(BASE.length - 1) + url.search + url.hash)
    } else {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    }
  })
  onReady?.(doc)
  return doc
}
