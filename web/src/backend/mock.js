// A stand-in for Supabase that lives in this browser (localStorage), for working on the app
// without signing in: `npm run web:mock`. It follows the same rules as the SQL in
// supabase/migrations (who can read what, inbox settings, what public pages show).
// "Sign in" picks a demo person; ?as=<handle> switches to one directly.

const KEY = 'ryt-mock-db'
const WHO = 'ryt-mock-user'
const now = () => new Date().toISOString()
const daysAgo = d => new Date(Date.now() - d * 86400e3).toISOString()
const uuid = () => crypto.randomUUID()

function seed() {
  const people = [
    { id: 'u-mira', handle: 'mira', name: 'Mira', bio: 'Night owl. Anime, sci-fi, and very strong coffee.', theme: { design: 'hugo-theme-terminal' } },
    { id: 'u-kai', handle: 'kai', name: 'Kai', bio: 'Will walk 40 minutes for good biryani.', theme: { preset: 'paper' } },
    { id: 'u-aneesh', handle: 'aneesh', name: 'Aneesh', bio: 'Builder of small things. Will try anything once.', theme: { preset: 'midnight' } },
  ].map(p => ({ avatar_url: null, inbox: 'anyone', created_at: daysAgo(90), ...p }))
  const rec = (owner, title, category, from, extra = {}) => ({
    id: uuid(), owner_id: owner, title, category, link: null, cover_url: null, pitch: '', tags: [], sender_id: from?.id ?? null,
    sender_name: from?.name ?? '', show_sender: true, status: 'new', rating: null, review: '', hidden: false, manual: false,
    created_at: daysAgo(extra.age ?? 3), decided_at: null, ...extra,
  })
  const [mira, kai, aneesh] = people
  const recs = [
    rec(mira.id, 'Mushishi', 'watch', aneesh, { pitch: 'The calmest show ever made.', status: 'tried', rating: 10, review: 'Perfect 2am watching.', tags: ['anime', 'calm'], decided_at: daysAgo(20), age: 40 }),
    rec(mira.id, 'Disco Elysium', 'play', kai, { pitch: 'You will talk to your necktie.', status: 'tried', rating: 9, review: 'I did talk to my necktie.', tags: ['rpg', 'writing'], decided_at: daysAgo(10), age: 30 }),
    rec(mira.id, 'Frieren', 'watch', aneesh, { status: 'already_done', decided_at: daysAgo(8), age: 12 }),
    rec(mira.id, 'Piranesi', 'read', { id: null, name: 'A friend from book club' }, { pitch: 'A house of endless halls and tides. Go in blind.', age: 1 }),
    rec(mira.id, 'Outer Wilds', 'play', kai, { pitch: 'Don’t google anything.', status: 'up_next', age: 5 }),
    rec(kai.id, 'Biryani at Shah Ghouse', 'eat', aneesh, { pitch: 'Go at 11pm, trust me.', status: 'tried', rating: 8, review: 'Worth the queue. Not worth the 1am regret.', decided_at: daysAgo(4), age: 9 }),
    rec(kai.id, 'Project Hail Mary', 'read', mira, { status: 'tried', rating: 9, review: 'Rocky!', decided_at: daysAgo(6), age: 15 }),
    rec(aneesh.id, 'Hades', 'play', kai, { pitch: 'The combat is butter and dying is part of the story.', status: 'tried', rating: 10, review: 'Changed my mind: perfect.', tags: ['roguelike'], decided_at: daysAgo(12), age: 25 }),
    rec(aneesh.id, 'Outer Wilds', 'play', kai, { pitch: 'Go in blind.', status: 'tried', rating: 10, review: 'Best ending of any game I have played.', decided_at: daysAgo(3), age: 18 }),
    rec(aneesh.id, 'Malgudi Days', 'watch', { id: null, name: 'Mom' }, { status: 'tried', rating: 10, review: 'Rewatched it as an adult. Still magic.', decided_at: daysAgo(30), age: 50 }),
  ]
  return { users: people.map(p => ({ id: p.id, email: `${p.handle}@example.com`, name: p.name })), profiles: people, recs, notes: [] }
}

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? seed()
  } catch {
    return seed()
  }
}
let db = load()
const save = () => localStorage.setItem(KEY, JSON.stringify(db))
save()

// ?as=<handle> signs in as a demo person (handy for screenshots and tests).
const as = new URLSearchParams(location.search).get('as')
if (as === 'nobody') localStorage.removeItem(WHO)
else if (as === 'new') localStorage.setItem(WHO, 'u-new')
else if (as) {
  const p = db.profiles.find(x => x.handle === as)
  if (p) localStorage.setItem(WHO, p.id)
}

const listeners = new Set()
const uid = () => localStorage.getItem(WHO)
const user = () => {
  const id = uid()
  if (!id) return null
  if (id === 'u-new') return { id, email: 'you@example.com', user_metadata: { full_name: 'Sam Rivera', avatar_url: null } }
  const u = db.users.find(x => x.id === id)
  return u ? { id: u.id, email: u.email, user_metadata: { full_name: u.name } } : null
}
const fail = (message, code) => { throw Object.assign(new Error(message), { code }) }
const later = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 60))
const profileOf = id => db.profiles.find(p => p.id === id)
const isPublic = r => ['tried', 'already_done'].includes(r.status) && !r.hidden
const publicRow = r => {
  const owner = profileOf(r.owner_id)
  const sender = r.sender_id && profileOf(r.sender_id)
  return {
    id: r.id, owner_id: r.owner_id, owner_handle: owner?.handle, title: r.title, category: r.category, link: r.link, cover_url: r.cover_url,
    pitch: r.pitch, tags: r.tags, status: r.status, rating: r.rating, review: r.review, created_at: r.created_at, decided_at: r.decided_at,
    sender_name: r.show_sender ? r.sender_name || null : null, sender_handle: r.show_sender && sender ? sender.handle : null,
  }
}
const byDecided = (a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '') || b.created_at.localeCompare(a.created_at)

export const api = {
  name: 'mock',
  async user() { return user() },
  onAuth(cb) { listeners.add(cb) },
  async signIn(returnTo = location.href) {
    // Signing in on the mock = a brand-new person who still has to pick a name.
    localStorage.setItem(WHO, 'u-new')
    location.href = returnTo
  },
  async signOut() {
    localStorage.removeItem(WHO)
    for (const cb of listeners) cb(null, 'SIGNED_OUT')
  },
  googleProfile(u) { return { name: u?.user_metadata?.full_name ?? '', email: u?.email ?? '', avatar_url: u?.user_metadata?.avatar_url ?? null } },

  async me() { return later(profileOf(uid()) ?? null) },
  async createProfile(f) {
    const u = user()
    if (!u) fail('not authenticated')
    if (!/^[a-z0-9_]{2,24}$/.test(f.handle)) fail('violates check constraint "ryt_profiles_handle_check"')
    if (db.profiles.some(p => p.handle === f.handle)) fail('duplicate key value violates unique constraint "ryt_profiles_handle_key"')
    const p = { avatar_url: null, bio: '', inbox: 'anyone', theme: {}, created_at: now(), ...f, id: u.id }
    db.profiles.push(p)
    if (!db.users.some(x => x.id === u.id)) db.users.push({ id: u.id, email: u.email, name: f.name })
    save()
    return later(p)
  },
  async updateProfile(patch) {
    const p = profileOf(uid())
    if (!p) fail('not authenticated')
    if (patch.handle && patch.handle !== p.handle && db.profiles.some(x => x.handle === patch.handle)) fail('duplicate key value violates unique constraint "ryt_profiles_handle_key"')
    Object.assign(p, patch)
    save()
    return later(p)
  },
  async deleteProfile() {
    const me = uid()
    db.profiles = db.profiles.filter(p => p.id !== me)
    db.recs = db.recs.filter(r => r.owner_id !== me).map(r => (r.sender_id === me ? { ...r, sender_id: null } : r))
    db.notes = db.notes.filter(n => n.owner_id !== me)
    save()
    return true
  },
  async profile(handle) { return later(db.profiles.find(p => p.handle === String(handle).toLowerCase()) ?? null) },
  async profilesByIds(ids) { return later(db.profiles.filter(p => ids.includes(p.id)).map(({ id, handle, name, avatar_url }) => ({ id, handle, name, avatar_url }))) },
  async handleTaken(handle) { return later(db.profiles.some(p => p.handle === String(handle).toLowerCase() && p.id !== uid())) },

  async publicRecs(ownerId) { return later(db.recs.filter(r => r.owner_id === ownerId && isPublic(r)).sort(byDecided).map(publicRow)) },
  async sentBy(handle) {
    const p = db.profiles.find(x => x.handle === handle)
    return later(p ? db.recs.filter(r => r.sender_id === p.id && r.show_sender && isPublic(r)).sort(byDecided).map(publicRow) : [])
  },

  async inbox() {
    const me = uid()
    return later(db.recs.filter(r => r.owner_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(r => ({ ...r, note: db.notes.find(n => n.rec_id === r.id)?.note ?? '' })))
  },
  async addRec(f) {
    const me = profileOf(uid())
    if (!me) fail('new row violates row-level security policy')
    const r = { id: uuid(), owner_id: me.id, title: '', category: 'other', link: null, cover_url: null, pitch: '', tags: [], sender_id: null, sender_name: '',
      show_sender: true, status: 'new', rating: null, review: '', hidden: false, manual: true, created_at: now(), decided_at: null, ...f }
    db.recs.push(r)
    save()
    return later(r)
  },
  async addRecs(list) {
    for (const f of list) await api.addRec(f)
    return list.length
  },
  async updateRec(id, patch) {
    const r = db.recs.find(x => x.id === id && x.owner_id === uid())
    if (!r) fail('not found')
    Object.assign(r, patch)
    save()
    return later(r)
  },
  async deleteRec(id) {
    db.recs = db.recs.filter(x => !(x.id === id && x.owner_id === uid()))
    save()
  },
  async setNote(recId, note) {
    const n = db.notes.find(x => x.rec_id === recId)
    if (n) n.note = note
    else db.notes.push({ rec_id: recId, owner_id: uid(), note })
    save()
  },

  async send(handle, f) {
    const owner = db.profiles.find(p => p.handle === String(handle).toLowerCase())
    if (!owner) fail(`No page called @${handle}`, 'P0002')
    const me = profileOf(uid())
    if (owner.inbox === 'closed') fail(`@${owner.handle} isn't taking ryts right now`, 'P0001')
    if (owner.inbox === 'accounts' && !me) fail(`Sign in to send @${owner.handle} a ryt`, 'P0001')
    if (me?.id === owner.id) fail('Add it to your own list from your inbox instead', 'P0001')
    const r = { id: uuid(), owner_id: owner.id, title: f.title.trim(), category: (f.category || 'other').toLowerCase(), link: f.link || null, cover_url: f.cover || null,
      pitch: f.pitch ?? '', tags: [], sender_id: me?.id ?? null, sender_name: me ? me.name : (f.fromName ?? '').trim(), show_sender: f.showName !== false,
      status: 'new', rating: null, review: '', hidden: false, manual: false, created_at: now(), decided_at: null }
    db.recs.push(r)
    save()
    return later(r.id)
  },
  async mySent() {
    const me = uid()
    return later(db.recs.filter(r => r.sender_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(r => {
      const o = profileOf(r.owner_id)
      const landed = isPublic(r)
      return { id: r.id, to_handle: o?.handle, to_name: o?.name, title: r.title, category: r.category, created_at: r.created_at, landed, status: landed ? r.status : null, rating: landed ? r.rating : null }
    }))
  },
}

// For tests: start over with the demo people.
export function resetMock() {
  db = seed()
  save()
}
