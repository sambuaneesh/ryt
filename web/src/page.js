// People's pages: their data in the page contract, drawn by the page renderer (the same one a
// fork changes) in their design, inside a frame so a design's CSS can never touch RYT's own UI.

import { normalizePageData } from '../../packages/contract/index.js'
import { themeStyles, fontHref, esc } from '../../packages/kit/index.js'
import { render } from '../../apps/page/render.js'
import pageCss from '../../apps/page/style.css?raw'
import { absolute, BASE } from './ui.js'

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : 'Other')
const person = (name, handle) => (name || handle ? { name: name || `@${handle}`, handle: handle ?? null, profileUrl: handle ? absolute(`/@${handle}`) : null } : null)

// Database rows -> the page contract.
export function pageData(profile, recs = [], sent = []) {
  return normalizePageData({
    owner: { handle: profile.handle, name: profile.name, bio: profile.bio, profileUrl: absolute(`/@${profile.handle}`), avatar: profile.avatar_url },
    links: { send: absolute(`/@${profile.handle}/send`), page: absolute(`/@${profile.handle}`), home: absolute('/') },
    recs: recs.map(r => ({
      id: r.id, title: r.title, url: r.link, cover: r.cover_url, category: cap(r.category), tags: r.tags ?? [], pitch: r.pitch, review: r.review,
      status: r.status, rating: r.rating, date: r.decided_at ?? r.created_at, from: person(r.sender_name, r.sender_handle),
    })),
    recommendedByMe: sent.map(r => ({ id: r.id, title: r.title, to: person(null, r.owner_handle), status: r.status, rating: r.rating })),
  })
}

// The full HTML document for a page (or the send form, as body) in a theme.
export function pageDocument({ data, theme, body, title }) {
  const fonts = fontHref(theme)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ?? `${data.owner.name}’s recommendations`)}</title>
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
