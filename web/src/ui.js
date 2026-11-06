// Small UI helpers shared by the views: escaping, the mark, avatars, toasts, sheets.

import { esc } from '../../packages/kit/index.js'

export { esc }

export const BASE = import.meta.env.BASE_URL
// An app path ("/inbox") as a link on this host (handles the GitHub Pages sub-path).
export const href = p => `${BASE}${String(p).replace(/^\//, '')}`
export const absolute = p => new URL(href(p), location.origin).href

// The mark: two circles (you and a friend) and what you share.
export const mark = (cls = 'mark') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 18.25A17 17 0 0 1 32 45.75A17 17 0 0 1 32 18.25z"/><circle cx="22" cy="32" r="17"/><circle cx="42" cy="32" r="17"/></svg>`
// The name as a cut-out ransom note: three words, three typefaces.
export const ransom = () => '<span class="ransom" aria-label="Recommend You This"><span class="r1" aria-hidden="true">Recommend</span><span class="r2" aria-hidden="true">you</span><span class="r3" aria-hidden="true">This</span></span>'
// On small screens the bar shows the short name, cut out the same way: R Y T.
const ransomShort = '<span class="ransom short" aria-hidden="true"><span class="r1">R</span><span class="r2">y</span><span class="r3">T</span></span>'
export const wordmark = (to = '/') => `<a class="wordmark" href="${href(to)}" data-link aria-label="Recommend You This">${ransom().replace('class="ransom"', 'class="ransom full"')}${ransomShort}</a>`

export const hue = s => [...String(s ?? '')].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 360

export const safeImage = url => (/^https:\/\/[^\s"'()<>\\]{1,2000}$/.test(url ?? '') ? url : null)

export function avatar(person, cls = '') {
  const name = person?.name || person?.handle || '?'
  const img = safeImage(person?.avatar_url ?? person?.avatar)
  return `<span class="avatar ${cls}" style="--h:${hue(person?.handle ?? name)}" aria-hidden="true">${esc(name.trim()[0]?.toUpperCase() ?? '?')}${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`
}

export const google = `<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`

let toastTimer
export function toast(message, { bad = false } = {}) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    el.setAttribute('role', 'status')
    document.body.append(el)
  }
  el.textContent = message
  el.classList.toggle('bad', bad)
  requestAnimationFrame(() => el.classList.add('show'))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), bad ? 4200 : 2200)
}

// A modal sheet. Returns the <dialog>; it removes itself when closed.
export function sheet(inner, { wide = false } = {}) {
  const d = document.createElement('dialog')
  d.className = `sheet${wide ? ' wide' : ''}`
  d.innerHTML = inner
  document.body.append(d)
  d.addEventListener('close', () => d.remove())
  d.addEventListener('click', e => { if (e.target === d) d.close() })
  d.tabIndex = -1
  d.showModal()
  // Focus the sheet itself, not its first button (which would show a focus ring at once).
  d.focus()
  return d
}

export function debounce(fn, ms = 400) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

// Database errors come back technical; people get a plain sentence.
export function friendly(error) {
  const m = String(error?.message ?? error ?? '')
  if (/duplicate key|ryt_profiles_handle_key|already exists/i.test(m)) return 'That name is taken. Try another.'
  if (/check constraint.*handle/i.test(m)) return 'Use 2–24 letters, numbers or underscores.'
  if (/JWT|not authenticated|permission denied|row-level security/i.test(m)) return 'Please sign in again.'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Can’t reach Recommend You This right now. Check your connection.'
  // The database words some messages with the short name; people read plain English.
  return (m.replace(/^.*?:\s*(?=[A-Z@])/, '') || 'Something went wrong.').replace(/\ba ryt\b/g, 'a recommendation').replace(/\bryts\b/g, 'recommendations')
}

export const CATEGORIES = ['Watch', 'Read', 'Listen', 'Play', 'Eat', 'Use', 'Go', 'Other']
export const STATUS = { new: 'New', up_next: 'To try', tried: 'Tried', already_done: 'Already tried', passed: 'Skipped' }

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: s > 86400 * 300 ? 'numeric' : undefined })
}
