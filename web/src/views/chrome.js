// The bar on Recommend You This's own screens (the name, three places, you), and a floating
// button to your own page, like the dock you see on pages.

import { wordmark, href, avatar, esc } from '../ui.js'

export function bar(session, active) {
  const p = session.profile
  const link = (to, label, key, extra = '') => `<a href="${href(to)}" data-link ${active === key ? 'aria-current="page"' : ''}>${label}${extra}</a>`
  return `<header class="bar"><div class="bar-in">
  ${wordmark(p ? '/inbox' : '/')}
  <nav aria-label="Main">
    ${link('/inbox', 'Inbox', 'inbox', session.newCount ? `<span class="count" aria-label="${session.newCount} new">${session.newCount}</span>` : '')}
    ${link('/sent', 'Sent', 'sent')}
    ${link('/settings', 'Settings', 'settings')}
  </nav>
  ${p ? `<a href="${href('/settings/profile')}" data-link aria-label="Your profile (${esc(p.name)})">${avatar(p)}</a>` : ''}
</div></header>`
}

const toPage = p => (p ? `<a class="to-page" href="${href(`/@${p.handle}`)}" data-link aria-label="Go to my page">${avatar(p)}<span class="long">Go to my page</span><span class="short">Page</span></a>` : '')

export const screen = (session, active, inner, { narrow = false } = {}) => `${bar(session, active)}<main class="main${narrow ? ' narrow' : ''}">${inner}</main>${toPage(session.profile)}`
