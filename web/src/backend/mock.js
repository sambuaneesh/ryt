// A stand-in for Supabase that lives in this browser (localStorage), for working on the app
// without signing in: `npm run web:mock`. It follows the same rules as the SQL in
// supabase/migrations (who can read what, inbox settings, what public pages show).
//
// It comes with a small world of demo people who recommend things to each other: places with
// map links, lists, requests, reactions, things being tried right now, pinned items, own fields.
//   ?as=<handle>   be that person (aneesh, mira, kai, priya, leo, jo, nina, omar, rhea, dev)
//   ?as=new        a brand-new account (onboarding)      ?as=nobody   signed out
//   ?reset         start the demo world over

const KEY = 'ryt-mock-db-v3'
const WHO = 'ryt-mock-user'
const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()

// ---------------------------------------------------------------- the demo world
// A small seeded random, so everyone sees the same world.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PEOPLE = [
  ['aneesh', 'Aneesh', 'Builder of small things. Will try anything once.'],
  ['mira', 'Mira', 'Night owl. Anime, sci-fi, and very strong coffee.'],
  ['kai', 'Kai', 'Will walk 40 minutes for good biryani.'],
  ['priya', 'Priya Raman', 'Reads on trains. Rates everything out of 10, including weather.'],
  ['leo', 'Leo', 'Synths, cycling, and fixing things that were not broken.'],
  ['jo', 'Jo', 'Board games and long walks. Mostly board games.'],
  ['nina', 'Nina', 'Chef at home, critic everywhere else.'],
  ['omar', 'Omar', 'Indie games and terrible puns.'],
  ['rhea', 'Rhea', 'Travels for food. Eats to travel.'],
  ['dev', 'Dev', 'Podcasts at 1.5x, books at 1x.'],
]

// [category, title, link, why]
const THINGS = [
  ['watch', 'Spirited Away', 'https://www.youtube.com/watch?v=ByXuk9QqQkk', 'The bathhouse. That is all I will say.'],
  ['watch', 'Mushishi', null, 'The calmest show ever made.'],
  ['watch', 'Frieren', null, 'A slow fantasy about what remains after the adventure.'],
  ['watch', 'Everything Everywhere All at Once', 'https://www.youtube.com/watch?v=wxN1T1uxQ2g', 'Bring tissues. And googly eyes.'],
  ['watch', 'Malgudi Days', null, 'You loved it when you were nine.'],
  ['watch', 'Severance', null, 'The office will never feel the same.'],
  ['watch', 'Past Lives', null, 'Quiet, devastating, perfect.'],
  ['watch', 'The Bear', null, 'Yes, chef.'],
  ['watch', 'Perfect Days', null, 'A toilet cleaner in Tokyo. Trust me.'],
  ['read', 'Piranesi', null, 'A house of endless halls and tides. Go in blind.'],
  ['read', 'Project Hail Mary', null, 'Rocky. That is the review.'],
  ['read', 'The Remains of the Day', null, 'A butler slowly realising things.'],
  ['read', 'Tomorrow, and Tomorrow, and Tomorrow', null, 'About friendship, and making games.'],
  ['read', 'Klara and the Sun', null, 'A robot narrator who will break your heart.'],
  ['read', 'The Midnight Library', null, 'Good for a bad week.'],
  ['read', 'Sapiens', null, 'Changes how you see everything for a month.'],
  ['listen', 'In Rainbows', 'https://open.spotify.com/album/7eyQXxuf2nGj9d2367Gi5f', 'Listen front to back, headphones on.'],
  ['listen', 'Blonde', null, 'Late night drive album.'],
  ['listen', 'A.R. Rahman Unplugged', null, 'Goosebumps by track three.'],
  ['listen', 'Song Exploder', null, 'Musicians take apart one song each episode.'],
  ['listen', 'Hardcore History', null, 'Six hours on one war and you will want more.'],
  ['play', 'Outer Wilds', null, 'Don’t google anything.'],
  ['play', 'Hades', null, 'The combat is butter and dying is part of the story.'],
  ['play', 'Disco Elysium', null, 'You will talk to your necktie.'],
  ['play', 'Celeste', null, 'Hard, kind, and about climbing a mountain.'],
  ['play', 'Wingspan', null, 'The prettiest board game. Birds!'],
  ['play', 'Stardew Valley', null, 'Farming, but it is actually therapy.'],
  ['eat', 'Biryani at Shah Ghouse', 'https://www.google.com/maps/place/Shah+Ghouse/@17.3925,78.4196,17z', 'Go at 11pm, trust me.'],
  ['eat', 'Filter coffee at Rameshwaram Cafe', 'https://www.google.com/maps/place/Rameshwaram+Cafe/@12.9784,77.6408,17z', 'The ghee podi idli too.'],
  ['eat', 'Bebinca at a Panjim bakery', 'https://www.google.com/maps/@15.4989,73.8278,16z', 'Layers on layers.'],
  ['eat', 'Pav bhaji at Sardar', 'https://www.google.com/maps/place/Sardar/@18.9711,72.8197,17z', 'Extra butter is not optional.'],
  ['eat', 'Shakshuka, at home', null, 'Two eggs, one pan, ten minutes.'],
  ['go', 'Hampi at sunrise', 'https://www.google.com/maps/@15.3350,76.4600,14z', 'Climb Matanga hill before 6.'],
  ['go', 'Nandi Hills', 'https://www.google.com/maps/@13.3702,77.6835,14z', 'Leave at 4am. Worth it.'],
  ['go', 'Golconda Fort at dusk', 'https://www.google.com/maps/@17.3833,78.4011,16z', 'Clap at the gate and listen.'],
  ['go', 'Gokarna beaches', 'https://www.google.com/maps/@14.5479,74.3188,14z', 'Walk from Om beach to Half Moon.'],
  ['go', 'Lodhi Garden', 'https://www.google.com/maps/@28.5931,77.2197,16z', 'Morning walk, then chai outside.'],
  ['use', 'Obsidian', 'https://obsidian.md', 'Notes that link to each other.'],
  ['use', 'Raycast', null, 'Never touch the mouse again.'],
  ['use', 'Anki', null, 'Remember anything with ten minutes a day.'],
  ['other', 'Cold showers', null, 'Hate it for a week, love it after.'],
  ['other', 'Learning to juggle', null, 'Three balls, one week, endless joy.'],
]

const REVIEWS = {
  10: ['Best thing I tried this year.', 'Perfect. No notes.', 'Changed my mind about the whole genre.', 'I have told everyone since.'],
  9: ['So good. One small thing kept it from 10.', 'Wonderful. Already planning a second go.', 'Lived up to the hype.'],
  8: ['Really good. Glad I tried it.', 'Worth it, just not for everyone.', 'Better than I expected.'],
  7: ['Good, not life-changing.', 'Enjoyed it, would not rush back.'],
  6: ['Fine. Some great parts.', 'It was okay.'],
  5: ['Not for me, but I see why.'],
  3: ['Sorry. I really tried.', 'Fell asleep twice.'],
  2: ['No. Just no.'],
}
const FIELDS = { watch: ['Where I watched', ['Netflix', 'the cinema', 'a friend’s couch', 'a flight']], read: ['Format', ['paperback', 'Kindle', 'audiobook']], eat: ['With', ['family', 'Kai', 'myself', 'the whole team']], go: ['When', ['March', 'last winter', 'the monsoon']] }

const BLANK_REC = { cover_url: null, pitch: '', tags: [], sender_id: null, sender_name: '', show_sender: true, rating: null, review: '', trying: false, progress: '', pinned: false, extra: {}, ask_id: null, decided_at: null }

function seed() {
  const r = rng(20261106)
  const pick = a => a[Math.floor(r() * a.length)]
  const year = new Date().getFullYear()
  const today = Date.now()
  const day = 86400e3
  // A date this year, before today.
  const dateThisYear = () => {
    const start = Date.UTC(year, 0, 3)
    return new Date(start + r() * Math.max(day, today - start - day)).toISOString()
  }
  const profiles = PEOPLE.map(([handle, name, bio], i) => ({
    id: `u-${handle}`, handle, name, bio, avatar_url: null, inbox: 'anyone', created_at: new Date(Date.UTC(year, 0, 1 + i)).toISOString(),
    theme: {
      aneesh: { preset: 'paper', overrides: { tokens: { 'card.objects': 'yes', 'card.cover': 'top', layout: 'grid' }, sections: ['hero', 'note', 'now-trying', 'my-list', 'hall-of-fame', 'ask', 'tried', 'lists', 'map', 'year', 'taste', 'recommenders', 'circle', 'wall', 'shame', 'already-there', 'recommended-by-me'] }, page: { note: 'Taking food recommendations only this month. Hyderabad and Bangalore, please!', labels: { shame: 'Hall of shame (sorry, friends)' } } },
      mira: { design: 'hugo-theme-terminal' },
      kai: { preset: 'paper', overrides: { tokens: { layout: 'corkboard', 'card.cover': 'top' }, sections: ['hero', 'now-trying', 'my-list', 'tried', 'map', 'shelf', 'circle', 'recommended-by-me'] } },
      priya: { preset: 'midnight', overrides: { tokens: { layout: 'magazine' }, sections: ['hero', 'note', 'now-trying', 'my-list', 'hall-of-fame', 'tried', 'shelf', 'year', 'lists', 'recommenders', 'circle'] }, page: { note: 'Currently: a book a week. Send your favourite!' } },
      leo: { design: 'hugo-papermod' },
      jo: { preset: 'retro-pixel' },
      nina: { design: 'ananke', overrides: { tokens: { 'card.objects': 'yes' } } },
      omar: { preset: 'terminal', overrides: { sections: ['hero', 'tried', 'shame', 'circle'] } },
      rhea: { design: 'hugo-theme-gruvbox', overrides: { sections: ['hero', 'map', 'tried', 'lists', 'taste', 'circle'] } },
      dev: { preset: 'midnight' },
    }[handle] ?? { preset: 'paper' },
  }))
  const byHandle = Object.fromEntries(profiles.map(p => [p.handle, p]))
  const recs = []
  const notes = []
  const add = (owner, thing, from, status, extra = {}) => {
    const [category, title, link, pitch] = thing
    const rating = status === 'tried' ? (extra.rating ?? pick([10, 10, 9, 9, 9, 8, 8, 8, 7, 6, 5, 3, 2])) : null
    const created = extra.created ?? dateThisYear()
    const decided = status === 'tried' || status === 'already_done' ? new Date(Math.min(today - day / 2, Date.parse(created) + r() * 20 * day)).toISOString() : null
    const field = FIELDS[category]
    const rec = {
      id: uuid(), owner_id: owner.id, title, category, link, cover_url: null, pitch: r() < 0.85 ? pitch : '', tags: [],
      sender_id: from?.id ?? null, sender_name: from?.name ?? extra.fromName ?? '', show_sender: extra.showSender ?? r() > 0.08,
      status, rating, review: rating ? pick(REVIEWS[rating] ?? REVIEWS[7]) : '', hidden: false, manual: !from && !extra.fromName,
      created_at: created, decided_at: decided, trying: false, progress: '', pinned: false,
      extra: status === 'tried' && field && r() < 0.5 ? { [field[0]]: pick(field[1]) } : {}, ask_id: null,
      ...(extra.set ?? {}),
    }
    recs.push(rec)
    return rec
  }
  // Everyone recommends things to everyone else, mostly within a few friends.
  for (const owner of profiles) {
    const friends = profiles.filter(p => p !== owner)
    const count = owner.handle === 'aneesh' ? 34 : 14 + Math.floor(r() * 10)
    const things = [...THINGS].sort(() => r() - 0.5).slice(0, count)
    things.forEach((thing, i) => {
      const from = r() < 0.12 ? null : pick(friends.slice(0, 6))
      const status = i < 2 ? 'new' : i < 4 ? 'up_next' : r() < 0.12 ? 'already_done' : r() < 0.06 ? 'passed' : 'tried'
      add(owner, thing, from, status, from ? {} : { fromName: pick(['Mom', 'A friend from work', 'My sister', 'Book club', '']) })
    })
    // Something they're trying right now.
    const now1 = add(owner, pick(THINGS.filter(t => ['watch', 'read', 'play', 'listen'].includes(t[0]))), pick(friends), 'up_next', { set: { trying: true } })
    now1.progress = { watch: 'episode 4 of 10', read: 'page 120 of 340', play: '12 hours in', listen: 'side B' }[now1.category] ?? ''
  }
  // A few things on Aneesh's page, made just so: pins, covers, a 10, a cover-story review.
  const aneesh = byHandle.aneesh
  for (const rec of recs.filter(x => x.owner_id === aneesh.id && x.status === 'tried').slice(0, 2)) rec.pinned = true
  const hp = recs.find(x => x.owner_id === aneesh.id && x.status === 'tried' && x.rating === 10)
  if (hp) hp.review = 'I played it for a weekend and thought about it for a month. If you only take one recommendation from my page, take this one.'
  for (const rec of recs) {
    if (rec.title === 'In Rainbows') rec.cover_url = 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02de3c04b5fc750b68899b20a9'
    if (rec.title === 'Spirited Away') rec.cover_url = 'https://i.ytimg.com/vi/ByXuk9QqQkk/hqdefault.jpg'
    if (rec.title === 'Everything Everywhere All at Once') rec.cover_url = 'https://i.ytimg.com/vi/wxN1T1uxQ2g/hqdefault.jpg'
  }
  notes.push({ rec_id: recs.find(x => x.owner_id === aneesh.id).id, owner_id: aneesh.id, note: 'Watched it with Sam on the 12th.' })

  // Lists.
  const mine = id => recs.filter(x => x.owner_id === id && (x.status === 'tried' || x.status === 'already_done') && !x.hidden)
  const listsFor = (p, defs) => defs.map(([title, description, test], i) => ({
    id: uuid(), owner_id: p.id, title, description, items: mine(p.id).filter(test).slice(0, 8).map(x => x.id), position: i, created_at: now(),
  })).filter(l => l.items.length)
  const lists = [
    ...listsFor(aneesh, [['Comfort watches', 'For when the week was long.', x => x.category === 'watch'], ['Weekend in Hyderabad & Bangalore', 'Where to eat and wander.', x => ['eat', 'go'].includes(x.category)], ['Only 10s', '', x => x.rating === 10]]),
    ...listsFor(byHandle.priya, [['Monsoon reading', 'Long books for rainy days.', x => x.category === 'read'], ['Games for two', '', x => x.category === 'play']]),
    ...listsFor(byHandle.rhea, [['Food trail', 'In order. Bring an appetite.', x => x.category === 'eat'], ['Sunrise spots', '', x => x.category === 'go']]),
  ]

  // Requests ("Ask me"), some with answers in the inbox.
  const asks = [
    { id: uuid(), owner_id: aneesh.id, text: 'A thriller I can finish in one sitting?', open: true, created_at: dateThisYear() },
    { id: uuid(), owner_id: aneesh.id, text: 'Best filter coffee in Bangalore?', open: true, created_at: dateThisYear() },
    { id: uuid(), owner_id: byHandle.priya.id, text: 'A book that made you cry (in a good way)', open: true, created_at: dateThisYear() },
    { id: uuid(), owner_id: byHandle.kai.id, text: 'Where should I eat in Goa?', open: true, created_at: dateThisYear() },
  ]
  add(aneesh, ['read', 'Gone Girl', null, 'You will not put it down. Answering your ask!'], byHandle.mira, 'new', { set: { ask_id: asks[0].id } })
  add(aneesh, ['read', 'The Silent Patient', null, 'One sitting, guaranteed.'], byHandle.dev, 'new', { set: { ask_id: asks[0].id } })

  // "My list": things people added themselves to try (most shown, one kept private).
  const WANT = {
    aneesh: [['watch', 'Dune: Part Two', null], ['read', 'The Three-Body Problem', null], ['go', 'Coorg in the monsoon', 'https://www.google.com/maps/@12.3375,75.8069,11z'], ['play', 'Hollow Knight: Silksong', null], ['eat', 'Mutton biryani at Paradise', null], ['listen', 'The Rest Is History', null], ['watch', 'Shōgun', null, true]],
    priya: [['read', 'Middlemarch', null], ['read', 'The Overstory', null], ['watch', 'Fallen Leaves', null]],
    kai: [['eat', 'Ramen at a tiny place in Tokyo', null], ['go', 'Spiti Valley', 'https://www.google.com/maps/@32.2461,78.0349,9z']],
  }
  for (const [handle, items] of Object.entries(WANT)) {
    for (const [category, title, link, secret] of items) {
      recs.push({ ...BLANK_REC, id: uuid(), owner_id: byHandle[handle].id, title, category, link, status: 'up_next', manual: true, on_list: true, hidden: Boolean(secret), created_at: dateThisYear() })
    }
  }

  // Reactions on public verdicts.
  const reactions = []
  for (const rec of recs.filter(x => x.status === 'tried')) {
    for (const e of ['🔥', '👀', '🙌', '😂']) {
      const n = r() < 0.45 ? Math.floor(r() * (rec.rating >= 9 ? 14 : 5)) : 0
      if (n) reactions.push({ rec_id: rec.id, emoji: e, n })
    }
  }
  return { users: profiles.map(p => ({ id: p.id, email: `${p.handle}@example.com`, name: p.name })), profiles, recs, notes, lists, asks, reactions }
}

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? seed()
  } catch {
    return seed()
  }
}
const params = new URLSearchParams(location.search)
let db = params.has('reset') ? seed() : load()
const save = () => localStorage.setItem(KEY, JSON.stringify(db))
save()

// ?as=<handle> signs in as a demo person (handy for screenshots and tests).
const as = params.get('as')
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
const later = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 40))
const profileOf = id => db.profiles.find(p => p.id === id)
const isPublic = r => (['tried', 'already_done'].includes(r.status) || r.trying || (r.on_list && ['new', 'up_next'].includes(r.status))) && !r.hidden
const publicRow = r => {
  const owner = profileOf(r.owner_id)
  const sender = r.sender_id && profileOf(r.sender_id)
  return {
    id: r.id, owner_id: r.owner_id, owner_handle: owner?.handle, title: r.title, category: r.category, link: r.link, cover_url: r.cover_url,
    pitch: r.pitch, tags: r.tags, status: r.status, rating: r.rating, review: r.review, created_at: r.created_at, decided_at: r.decided_at,
    sender_name: r.show_sender ? r.sender_name || null : null, sender_handle: r.show_sender && sender ? sender.handle : null,
    trying: Boolean(r.trying), progress: r.trying ? r.progress ?? '' : '', pinned: Boolean(r.pinned), extra: r.extra ?? {},
    reactions: Object.fromEntries((db.reactions ?? []).filter(x => x.rec_id === r.id && x.n > 0).map(x => [x.emoji, x.n])), ask_id: r.ask_id ?? null,
    on_list: Boolean(r.on_list),
  }
}
const byDecided = (a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '') || b.created_at.localeCompare(a.created_at)
const blank = { cover_url: null, pitch: '', tags: [], sender_id: null, sender_name: '', show_sender: true, status: 'new', rating: null, review: '', hidden: false,
  trying: false, progress: '', pinned: false, extra: {}, ask_id: null, decided_at: null, link: null, on_list: false }

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
  async profilesByHandles(handles) { return later(db.profiles.filter(p => handles.includes(p.handle)).map(({ id, handle, name, avatar_url }) => ({ id, handle, name, avatar_url }))) },
  async handleTaken(handle) { return later(db.profiles.some(p => p.handle === String(handle).toLowerCase() && p.id !== uid())) },

  async publicRecs(ownerId) { return later(db.recs.filter(r => r.owner_id === ownerId && isPublic(r)).sort(byDecided).map(publicRow)) },
  async sentBy(handle) {
    const p = db.profiles.find(x => x.handle === handle)
    return later(p ? db.recs.filter(r => r.sender_id === p.id && r.show_sender && isPublic(r) && r.status !== 'new').sort(byDecided).map(publicRow) : [])
  },

  async inbox() {
    const me = uid()
    return later(db.recs.filter(r => r.owner_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(r => ({ ...r, note: db.notes.find(n => n.rec_id === r.id)?.note ?? '' })))
  },
  async addRec(f) {
    const me = profileOf(uid())
    if (!me) fail('new row violates row-level security policy')
    const r = { ...blank, id: uuid(), owner_id: me.id, title: '', category: 'other', manual: true, created_at: now(), ...f }
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

  async send(handle, f, askId = null) {
    const owner = db.profiles.find(p => p.handle === String(handle).toLowerCase())
    if (!owner) fail(`No page called @${handle}`, 'P0002')
    const me = profileOf(uid())
    if (owner.inbox === 'closed') fail(`@${owner.handle} isn't taking ryts right now`, 'P0001')
    if (owner.inbox === 'accounts' && !me) fail(`Sign in to send @${owner.handle} a ryt`, 'P0001')
    if (me?.id === owner.id) fail('Add it to your own list from your inbox instead', 'P0001')
    const r = { ...blank, id: uuid(), owner_id: owner.id, title: f.title.trim(), category: (f.category || 'other').toLowerCase(), link: f.link || null, cover_url: f.cover || null,
      pitch: f.pitch ?? '', sender_id: me?.id ?? null, sender_name: me ? me.name : (f.fromName ?? '').trim(), show_sender: f.showName !== false,
      manual: false, created_at: now(), ask_id: askId }
    db.recs.push(r)
    save()
    return later(r.id)
  },
  async mySent() {
    const me = uid()
    return later(db.recs.filter(r => r.sender_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(r => {
      const o = profileOf(r.owner_id)
      const landed = ['tried', 'already_done'].includes(r.status) && !r.hidden
      return { id: r.id, to_handle: o?.handle, to_name: o?.name, title: r.title, category: r.category, created_at: r.created_at, landed, status: landed ? r.status : null, rating: landed ? r.rating : null }
    }))
  },

  // ---------- v2
  async listsOf(ownerId) { return later((db.lists ?? []).filter(l => l.owner_id === ownerId).sort((a, b) => a.position - b.position)) },
  async saveList(list) {
    const me = uid()
    if (!me) fail('not authenticated')
    db.lists ??= []
    let l = list.id && db.lists.find(x => x.id === list.id && x.owner_id === me)
    if (l) Object.assign(l, { title: list.title, description: list.description ?? '', items: list.items ?? [], position: list.position ?? l.position })
    else db.lists.push(l = { id: uuid(), owner_id: me, title: list.title, description: list.description ?? '', items: list.items ?? [], position: list.position ?? 0, created_at: now() })
    save()
    return later(l)
  },
  async deleteList(id) { db.lists = (db.lists ?? []).filter(l => !(l.id === id && l.owner_id === uid())); save() },
  async asksOf(ownerId, { all = false } = {}) {
    return later((db.asks ?? []).filter(a => a.owner_id === ownerId && (all || a.open)).sort((a, b) => b.created_at.localeCompare(a.created_at)))
  },
  async saveAsk(ask) {
    const me = uid()
    if (!me) fail('not authenticated')
    db.asks ??= []
    let a = ask.id && db.asks.find(x => x.id === ask.id && x.owner_id === me)
    if (a) Object.assign(a, { text: ask.text ?? a.text, open: ask.open ?? a.open })
    else db.asks.push(a = { id: uuid(), owner_id: me, text: ask.text, open: true, created_at: now() })
    save()
    return later(a)
  },
  async deleteAsk(id) { db.asks = (db.asks ?? []).filter(a => !(a.id === id && a.owner_id === uid())); save() },
  async ask(id) { return later((db.asks ?? []).find(a => a.id === id) ?? null) },
  async answer(askId, f) {
    const ask = (db.asks ?? []).find(a => a.id === askId && a.open)
    if (!ask) fail('This request is closed', 'P0001')
    return api.send(profileOf(ask.owner_id).handle, f, askId)
  },
  async react(recId, emoji, delta) {
    const rec = db.recs.find(r => r.id === recId)
    if (!rec || !isPublic(rec) || !['🔥', '👀', '🙌', '😂'].includes(emoji)) fail('Not found')
    db.reactions ??= []
    let x = db.reactions.find(e => e.rec_id === recId && e.emoji === emoji)
    if (!x) db.reactions.push(x = { rec_id: recId, emoji, n: 0 })
    x.n = Math.max(0, x.n + Math.sign(delta))
    save()
    return later(x.n)
  },
  async thing(title) {
    const t = String(title).trim().toLowerCase()
    return later(db.recs.filter(r => isPublic(r) && r.title.toLowerCase() === t).sort(byDecided).map(publicRow))
  },
  async lovedOn(handles) {
    const ids = new Set(db.profiles.filter(p => handles.includes(p.handle)).map(p => p.id))
    return later(db.recs.filter(r => ids.has(r.owner_id) && isPublic(r) && r.rating >= 8).map(publicRow))
  },
}

// For tests: start over with the demo world.
export function resetMock() {
  db = seed()
  save()
}
