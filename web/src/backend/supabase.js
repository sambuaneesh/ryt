// RYT's data on Supabase (ADR 0011). The browser talks to the database directly with the
// public key; row-level security and the ryt_* functions decide what each person may do.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.SUPABASE_URL
const key = import.meta.env.SUPABASE_PUBLISHABLE_KEY
if (!url || !key) console.error('RYT: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set (see .env.example)')

const sb = createClient(url, key, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'ryt-auth' },
})

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

let currentUser = null

export const api = {
  name: 'supabase',

  // ---------- who's here
  async user() {
    const { data } = await sb.auth.getSession()
    currentUser = data.session?.user ?? null
    return currentUser
  },
  onAuth(cb) {
    sb.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user ?? null
      cb(currentUser, event)
    })
  },
  // Google only. Comes back to the page it started from.
  async signIn(returnTo = location.href) {
    must(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnTo } }))
  },
  async signOut() {
    must(await sb.auth.signOut())
  },
  // What Google told us, for prefilling the profile.
  googleProfile(user) {
    const m = user?.user_metadata ?? {}
    return { name: m.full_name ?? m.name ?? '', email: user?.email ?? '', avatar_url: m.avatar_url ?? m.picture ?? null }
  },

  // ---------- profiles
  async me() {
    if (!currentUser) await api.user()
    if (!currentUser) return null
    return must(await sb.from('ryt_profiles').select('*').eq('id', currentUser.id).maybeSingle())
  },
  async createProfile(fields) {
    return must(await sb.from('ryt_profiles').insert({ ...fields, id: currentUser.id }).select().single())
  },
  async updateProfile(patch) {
    return must(await sb.from('ryt_profiles').update(patch).eq('id', currentUser.id).select().single())
  },
  // Removes your page and everything on it (needs migration 0002). Returns false if the
  // database didn't allow it.
  async deleteProfile() {
    const rows = must(await sb.from('ryt_profiles').delete().eq('id', currentUser.id).select('id'))
    return rows.length > 0
  },
  async profile(handle) {
    return must(await sb.from('ryt_profiles').select('*').eq('handle', String(handle).toLowerCase()).maybeSingle())
  },
  // Page names for account ids (to link back to people who recommended you something).
  async profilesByIds(ids) {
    if (!ids.length) return []
    return must(await sb.from('ryt_profiles').select('id, handle, name, avatar_url').in('id', ids))
  },
  async handleTaken(handle) {
    const row = must(await sb.from('ryt_profiles').select('id').eq('handle', String(handle).toLowerCase()).maybeSingle())
    return Boolean(row && row.id !== currentUser?.id)
  },

  // ---------- public pages
  async publicRecs(ownerId) {
    return must(await sb.from('ryt_public_recs').select('*').eq('owner_id', ownerId).order('decided_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }))
  },
  // Ryts this person sent that landed publicly with their name on them.
  async sentBy(handle) {
    return must(await sb.from('ryt_public_recs').select('*').eq('sender_handle', String(handle).toLowerCase()).order('decided_at', { ascending: false, nullsFirst: false }).limit(50))
  },

  // ---------- inbox (owner only, by row-level security)
  async inbox() {
    const rows = must(await sb.from('ryt_recs').select('*, ryt_rec_notes(note)').order('created_at', { ascending: false }))
    return rows.map(({ ryt_rec_notes: notes, ...r }) => ({ ...r, note: (Array.isArray(notes) ? notes[0]?.note : notes?.note) ?? '' }))
  },
  async addRec(fields) {
    return must(await sb.from('ryt_recs').insert({ ...fields, owner_id: currentUser.id, manual: true }).select().single())
  },
  // Many at once (imports), in chunks.
  async addRecs(list) {
    let added = 0
    for (let i = 0; i < list.length; i += 200) {
      const rows = list.slice(i, i + 200).map(f => ({ ...f, owner_id: currentUser.id, manual: true }))
      added += must(await sb.from('ryt_recs').insert(rows).select('id')).length
    }
    return added
  },
  async updateRec(id, patch) {
    return must(await sb.from('ryt_recs').update(patch).eq('id', id).select().single())
  },
  async deleteRec(id) {
    must(await sb.from('ryt_recs').delete().eq('id', id))
  },
  async setNote(recId, note) {
    must(await sb.from('ryt_rec_notes').upsert({ rec_id: recId, owner_id: currentUser.id, note }))
  },

  // ---------- sending
  async send(handle, f) {
    return must(await sb.rpc('ryt_send', {
      p_handle: handle, p_title: f.title, p_category: f.category, p_link: f.link || null, p_cover_url: f.cover || null,
      p_pitch: f.pitch ?? '', p_sender_name: f.fromName ?? '', p_show_sender: f.showName !== false,
    }))
  },
  // ---------- v2: lists, requests, reactions, things (needs migration 0003)
  async profilesByHandles(handles) {
    if (!handles.length) return []
    return must(await sb.from('ryt_profiles').select('id, handle, name, avatar_url').in('handle', handles))
  },
  async listsOf(ownerId) {
    return must(await sb.from('ryt_lists').select('*').eq('owner_id', ownerId).order('position').order('created_at'))
  },
  async saveList(list) {
    const row = { title: list.title, description: list.description ?? '', items: list.items ?? [], position: list.position ?? 0 }
    if (list.id) return must(await sb.from('ryt_lists').update(row).eq('id', list.id).select().single())
    return must(await sb.from('ryt_lists').insert({ ...row, owner_id: currentUser.id }).select().single())
  },
  async deleteList(id) {
    must(await sb.from('ryt_lists').delete().eq('id', id))
  },
  async asksOf(ownerId, { all = false } = {}) {
    let q = sb.from('ryt_asks').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false })
    if (!all) q = q.eq('open', true)
    return must(await q)
  },
  async saveAsk(ask) {
    if (ask.id) return must(await sb.from('ryt_asks').update({ text: ask.text, open: ask.open }).eq('id', ask.id).select().single())
    return must(await sb.from('ryt_asks').insert({ text: ask.text, owner_id: currentUser.id }).select().single())
  },
  async deleteAsk(id) {
    must(await sb.from('ryt_asks').delete().eq('id', id))
  },
  async ask(id) {
    return must(await sb.from('ryt_asks').select('*').eq('id', id).maybeSingle())
  },
  async answer(askId, f) {
    return must(await sb.rpc('ryt_answer', {
      p_ask: askId, p_title: f.title, p_category: f.category, p_link: f.link || null, p_cover_url: f.cover || null,
      p_pitch: f.pitch ?? '', p_sender_name: f.fromName ?? '', p_show_sender: f.showName !== false,
    }))
  },
  async react(recId, emoji, delta) {
    return must(await sb.rpc('ryt_react', { p_rec: recId, p_emoji: emoji, p_delta: delta }))
  },
  // Everyone whose page shows this thing (same title, any case), newest verdicts first.
  async thing(title) {
    const t = String(title).trim().replace(/[%_\\]/g, m => `\\${m}`)
    return must(await sb.from('ryt_public_recs').select('*').ilike('title', t).order('decided_at', { ascending: false, nullsFirst: false }).limit(200))
  },
  // Well-loved things on these pages (for "Surprise me").
  async lovedOn(handles) {
    if (!handles.length) return []
    return must(await sb.from('ryt_public_recs').select('id, title, category, rating, owner_handle').in('owner_handle', handles).gte('rating', 8).limit(300))
  },
  async mySent() {
    return must(await sb.rpc('ryt_my_sent'))
  },

  // ---------- admin (migration 0005; the database refuses anyone not in ryt_admins)
  async isAdmin() {
    const { data, error } = await sb.rpc('ryt_is_admin')
    return !error && data === true
  },
  async adminUsers() {
    return must(await sb.rpc('ryt_admin_users'))
  },
}
