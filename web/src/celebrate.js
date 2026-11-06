// "Sent!": shown over someone's page after you recommend them something. Your recommendation
// pops in as its object, a SENT stamp lands on it, paper bits burst out, then two clear next
// steps. Styles: .sent-overlay in brand.css (motion is skipped with reduced motion).

import { esc, href } from './ui.js'
import { objectCard } from './objects.js'

const COLORS = ['var(--pink)', 'var(--yellow)', 'var(--blue)', 'var(--green)', 'var(--violet)', 'var(--orange)']

export function celebrate(root, { owner, item, signedIn, onAgain, onBack }) {
  const bits = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + Math.random() * .4
    const dist = 160 + Math.random() * 140
    return `<i style="--x:${Math.round(Math.cos(angle) * dist)}px;--y:${Math.round(Math.sin(angle) * dist)}px;--r:${Math.round(Math.random() * 540 - 270)}deg;--c:${COLORS[i % COLORS.length]};--d:${(Math.random() * .15).toFixed(2)}s"></i>`
  }).join('')
  const el = document.createElement('div')
  el.className = 'sent-overlay'
  el.setAttribute('role', 'status')
  el.innerHTML = `<div class="sent-box">
  <div class="sent-bits" aria-hidden="true">${bits}</div>
  <div class="sent-card">${objectCard({ kind: item.category, title: item.title, from: `to ${owner.name}` })}<span class="sent-stamp">Sent!</span></div>
  <p class="sent-line">${esc(owner.name)} will see it in their inbox.</p>
  <div class="sent-actions"><button class="btn" data-again>Recommend another</button><button class="btn primary" data-back>Back to ${esc(owner.name)}’s page</button></div>
  ${signedIn ? `<a class="link" href="${href('/sent')}" data-link>See it in Sent</a>` : ''}
</div>`
  root.append(el)
  const close = () => el.remove()
  el.querySelector('[data-again]').onclick = () => { close(); onAgain() }
  el.querySelector('[data-back]').onclick = () => { close(); onBack() }
  el.querySelector('[data-link]')?.addEventListener('click', close)
  el.querySelector('[data-back]').focus({ preventScroll: true })
  addEventListener('keydown', function esc(e) {
    if (e.key !== 'Escape') return
    removeEventListener('keydown', esc)
    if (el.isConnected) { close(); onBack() }
  })
}
