// A recommendation drawn as the object its kind suggests: a ticket stub for films, a library
// card for books, a cassette label for music, a cartridge for games, a receipt for food, a
// postcard for places, a sticker for anything else. Styles are in brand.css (.obj[data-kind]).

import { esc } from './ui.js'

export const KINDS = { watch: 'Watch', read: 'Read', listen: 'Listen', play: 'Play', eat: 'Eat', go: 'Go', use: 'Use', other: 'Other' }
export const KIND_COLOR = { watch: 'var(--pink)', read: '#dfe6ff', listen: 'var(--violet)', play: 'var(--green)', eat: '#fff', go: 'var(--yellow)', use: 'var(--teal)', other: 'var(--teal)' }
export const kindOf = c => (String(c ?? '').toLowerCase() in KINDS ? String(c).toLowerCase() : 'other')

// o: { kind, title, link?, from?, when?, score? }
export function objectCard(o) {
  const kind = kindOf(o.kind)
  const title = o.link ? `<a href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">${esc(o.title)}</a>` : esc(o.title)
  return `<div class="obj" data-kind="${kind}">
  <div class="obj-kind"><span>${KINDS[kind]}</span>${o.when ? `<span>${esc(o.when)}</span>` : ''}</div>
  <h3 class="obj-title">${title}</h3>
  ${o.from ? `<div class="obj-from">${esc(o.from)}</div>` : ''}
  ${o.score ? `<div class="obj-score" aria-label="${o.score} out of 10"><span>${o.score}<small>/10</small></span></div>` : ''}
</div>`
}
