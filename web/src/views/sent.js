// What you recommended to others while signed in. Their rating shows once it's on their page.

import { api } from '../backend/index.js'
import { screen } from './chrome.js'
import { esc, href, timeAgo } from '../ui.js'
import { KINDS, KIND_COLOR, kindOf } from '../objects.js'

export async function show(root, { session }) {
  const sent = await api.mySent()
  root.innerHTML = screen(session, 'sent', `
  <div class="head"><div><h1 class="title">Sent</h1>
  <p class="lede">${sent.length ? 'What you recommended. You see their rating when they share it.' : 'Nothing yet. Open a friend’s page and tap “Recommend something”.'}</p></div></div>
  ${sent.length ? `<div class="sent-list">${sent.map(s => `<div class="sent-item">
    <span class="kind" style="--k:${KIND_COLOR[kindOf(s.category)]}">${KINDS[kindOf(s.category)]}</span><div class="what"><b>${esc(s.title)}</b><div class="small faint">to <a href="${href(`/@${s.to_handle}`)}" data-link>${esc(s.to_name ?? `@${s.to_handle}`)}</a> · ${timeAgo(s.created_at)}</div></div>
    <div class="landed">${s.landed ? (s.status === 'already_done' ? 'Already tried' : s.rating ? `<span class="score">${s.rating}/10</span>` : 'Tried') : 'Waiting'}</div>
  </div>`).join('')}</div>` : ''}`, { narrow: true })
}
