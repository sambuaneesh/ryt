// The public dashboard. This file is the heart of a fork: change it however you like.
// render() is a pure function: contract data + resolved theme in, HTML string out. The same
// function runs on the platform server (built-in themes) and in the browser (forks).
//
// The structure is fixed: header -> sections -> footer. Themes (including ones imported from
// Hugo) only change tokens, which select colours, type, shape and a few component variants.

import { renderSections, esc } from '../../packages/kit/index.js'

// Override any section here, e.g. sections.tried = ({ data, theme }) => '<h2>…</h2>'.
// A section that is missing or throws falls back to the kit's default version.
export const sections = {}

function header(data) {
  const { owner, links } = data
  const nav = [
    [links.page ? `${links.page}#tried` : '#tried', 'Tried'],
    ...(data.recommendedByMe.length ? [[links.page ? `${links.page}#recommended-by-me` : '#recommended-by-me', 'I recommended']] : []),
    ...(links.send ? [[links.send, 'Recommend me something']] : []),
  ]
  const hue = [...owner.handle].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 360
  return `<header data-ryt="header" style="--h:${hue}">
  <a data-ryt="brand" href="${esc(owner.profileUrl ?? '#')}">Recommended to:</a>
  <nav data-ryt="nav">${nav.map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join('')}</nav>
</header>`
}

// body: HTML that replaces the sections (the "send me a ryt" form), in the same frame.
export function render({ data, theme, onFallback, body }) {
  const t = theme.tokens
  const attrs = {
    layout: t.layout, density: t.density, shadow: t.shadow,
    header: t['header.style'], 'header-align': t['header.align'], card: t['card.style'], cover: t['card.cover'], chip: t['chip.style'],
    frame: t.frame, hero: t['hero.style'], avatar: t['hero.avatar'], objects: t['card.objects'],
  }
  const open = `<div data-ryt="page" ${Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>`
  const footer = `<footer data-ryt="footer">Recommended to ${esc(data.owner.name)} · on <a href="${esc(data.links.home ?? '/')}">Recommend You This</a></footer>`
  const ctx = { data, theme }
  const content = ids => (body != null ? (ids.includes('hero') ? '' : `<section data-ryt="section" data-section="send">${body}</section>`) : renderSections({ ids, sections, ctx, onFallback }))
  // Sidebar frame: brand, menu and profile share one column beside the ryts.
  if (t.frame === 'sidebar') {
    const side = body != null ? '' : content(theme.sections.filter(id => id === 'hero'))
    const main = content(theme.sections.filter(id => id !== 'hero'))
    return `${open}\n<aside data-ryt="sidebar">${header(data)}${side}</aside>\n<div data-ryt="main">${main}</div>\n${footer}\n</div>`
  }
  return `${open}\n${header(data)}\n${content(body != null ? [] : theme.sections)}\n${footer}\n</div>`
}
