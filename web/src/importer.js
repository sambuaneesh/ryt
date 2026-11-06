// Bring recommendations in from a file: the old recommend-me site's `recommendations` table
// (exported from Supabase as CSV or JSON), or a RYT export. Each row becomes one item in your
// inbox, with who sent it, your rating and comment, and the original date.
//
// Old site columns: title, raw_input, category (Entertainment | Gaming | Tech or Digital Tools |
// Food | Other), tags, submitted_by, contact, created_at, status (pending | completed |
// already_done), admin_rating, admin_comment. `contact` is never imported.

// ---------------------------------------------------------------- reading the file
function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  const [head = [], ...body] = rows
  const keys = head.map(h => h.trim().toLowerCase())
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])))
}

export function readRows(text) {
  const t = String(text ?? '').replace(/^﻿/, '').trim()
  if (!t) return []
  if (t[0] === '[' || t[0] === '{') {
    const d = JSON.parse(t)
    return Array.isArray(d) ? d : d.recommendations ?? d.rows ?? d.data ?? []
  }
  return parseCsv(t)
}

// ---------------------------------------------------------------- mapping
const has = (s, re) => re.test(String(s ?? '').toLowerCase())
function kindOf(r, tags) {
  const text = `${r.title ?? ''} ${r.raw_input ?? ''} ${tags.join(' ')}`.toLowerCase()
  const cat = String(r.category ?? '').toLowerCase()
  if (['watch', 'read', 'listen', 'play', 'eat', 'go', 'use', 'other'].includes(cat)) return cat
  if (/gaming|game/.test(cat)) return 'play'
  if (/food/.test(cat)) return 'eat'
  if (/tech|tool/.test(cat)) return 'use'
  if (has(text, /\b(book|novel|read|author|manga|comic|kindle)\b/)) return 'read'
  if (has(text, /\b(song|album|music|band|artist|podcast|listen|spotify|playlist)\b/)) return 'listen'
  if (has(text, /\b(restaurant|cafe|café|biryani|food|dish|eat|recipe)\b/)) return 'eat'
  if (has(text, /\b(place|travel|trip|visit|beach|city|trek|hike)\b/)) return 'go'
  if (has(text, /\b(game|steam|playstation|xbox|nintendo)\b/)) return 'play'
  if (/entertain/.test(cat) || has(text, /\b(movie|film|show|series|anime|watch|netflix|episode|season|youtube|documentary)\b/)) return 'watch'
  return 'other'
}
const tagsOf = v => {
  if (Array.isArray(v)) return v
  const s = String(v ?? '').trim()
  if (!s) return []
  if (s.startsWith('[')) { try { return JSON.parse(s) } catch {} }
  return s.replace(/^\{|\}$/g, '').split(',').map(t => t.replace(/^"|"$/g, ''))
}
const date = v => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)
const clip = (s, n) => String(s ?? '').trim().slice(0, n)

// One old row -> fields for ryt_recs, or null if there's nothing to import.
export function mapRow(r) {
  if (!r || typeof r !== 'object') return null
  const raw = clip(r.raw_input ?? r.pitch, 2000)
  const title = clip(r.title, 120) || clip(raw.split(/\n|\. /)[0], 120)
  if (!title) return null
  const tags = tagsOf(r.tags).map(t => clip(t, 24).toLowerCase()).filter(Boolean).slice(0, 8)
  const status = { completed: 'tried', tried: 'tried', already_done: 'already_done', pending: 'new', new: 'new', up_next: 'up_next', passed: 'passed' }[String(r.status ?? '').trim()] ?? 'new'
  const rating = Number.parseInt(r.admin_rating ?? r.rating, 10)
  const created = date(r.created_at) ?? new Date().toISOString()
  const decided = status === 'tried' || status === 'already_done'
  return {
    title,
    category: kindOf(r, tags),
    pitch: raw && raw !== title ? clip(raw, 500) : '',
    tags,
    sender_name: clip(r.submitted_by ?? r.sender_name, 60),
    show_sender: true,
    status,
    rating: status === 'tried' && rating >= 1 && rating <= 10 ? rating : null,
    review: clip(r.admin_comment ?? r.review, 1000),
    link: /^https?:\/\//.test(r.link ?? '') ? clip(r.link, 2000) : (/^https?:\/\/\S+$/.test(raw) ? raw : null),
    created_at: created,
    decided_at: decided ? created : null,
  }
}
