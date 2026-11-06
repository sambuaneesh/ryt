// The contract: the only shape of data a page frontend (the default one or a fork) ever sees.
// normalizePageData() guarantees every field exists with a sane type, so frontends never
// have to defend against null/undefined. Bump CONTRACT_VERSION on breaking changes and keep
// adapters for the previous versions in SUPPORTED_CONTRACTS.

export const CONTRACT_VERSION = 1
export const SUPPORTED_CONTRACTS = [1]

// want: on the owner's own list of things to try ("My list").
export const PUBLIC_STATUSES = ['tried', 'already_done', 'trying', 'want']
export const REACTIONS = ['🔥', '👀', '🙌', '😂']
export const CATEGORIES = ['Watch', 'Read', 'Listen', 'Play', 'Eat', 'Use', 'Go', 'Other']

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback)
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const list = v => (Array.isArray(v) ? v : [])
const rating = v => (Number.isInteger(v) && v >= 1 && v <= 10 ? v : null)
const httpUrl = v => (/^https?:\/\//.test(str(v)) ? v : null)
// Images are links (RYT stores no files): https only, and only characters that are safe to
// drop into a CSS url("…") or an <img src>.
const imageUrl = v => (/^https:\/\/[^\s"'()<>\\]{1,2000}$/.test(str(v)) ? v : null)

// A person shown on a page. null means "anonymous".
function person(p) {
  if (!p || typeof p !== 'object') return null
  return {
    name: str(p.name).trim() || 'Someone',
    handle: str(p.handle) || null,
    profileUrl: httpUrl(p.profileUrl),
  }
}

export function normalizeRec(raw) {
  const r = obj(raw)
  return {
    id: str(r.id),
    title: str(r.title).trim().slice(0, 200) || 'Untitled',
    url: httpUrl(r.url),
    cover: imageUrl(r.cover),
    category: CATEGORIES.includes(r.category) ? r.category : 'Other',
    tags: list(r.tags).filter(t => typeof t === 'string' && t.trim()).slice(0, 8),
    pitch: str(r.pitch),
    review: str(r.review),
    status: PUBLIC_STATUSES.includes(r.status) ? r.status : 'tried',
    rating: rating(r.rating),
    date: str(r.date) || null,
    from: person(r.from),
    // v2 (all optional): what the owner is trying now, pinned, their own fields, reactions.
    progress: str(r.progress).slice(0, 60),
    pinned: r.pinned === true,
    extra: Object.fromEntries(Object.entries(obj(r.extra)).filter(([k, v]) => typeof v === 'string' && k.trim() && v.trim()).slice(0, 8).map(([k, v]) => [k.slice(0, 40), v.slice(0, 200)])),
    reactions: Object.fromEntries(REACTIONS.map(e => [e, Number.isInteger(obj(r.reactions)[e]) && obj(r.reactions)[e] > 0 ? obj(r.reactions)[e] : 0])),
  }
}

const personOrNull = p => (p && typeof p === 'object' ? { ...person(p), avatar: /^https:\/\//.test(str(p.avatar)) ? p.avatar : null } : null)

export function normalizePageData(raw) {
  const d = obj(raw)
  const owner = obj(d.owner)
  const recs = list(d.recs).map(normalizeRec)
  const tried = recs.filter(r => r.status === 'tried')
  const rated = tried.filter(r => r.rating)
  return {
    contract: CONTRACT_VERSION,
    owner: {
      handle: str(owner.handle) || 'someone',
      name: str(owner.name).trim() || str(owner.handle) || 'Someone',
      bio: str(owner.bio),
      profileUrl: httpUrl(owner.profileUrl),
      avatar: imageUrl(owner.avatar),
      note: str(owner.note).slice(0, 280),
    },
    // v2: custom names for sections ({ tried: 'Stuff Mom made me watch' }).
    labels: Object.fromEntries(Object.entries(obj(d.labels)).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 60)])),
    // v2: the owner's lists of recommendations (items are rec ids).
    lists: list(d.lists).map(obj).map(l => ({ id: str(l.id), title: str(l.title).trim() || 'Untitled', description: str(l.description), items: list(l.items).filter(x => typeof x === 'string') })).filter(l => l.items.length),
    // v2: open requests ("I need a good thriller").
    asks: list(d.asks).map(obj).map(a => ({ id: str(a.id), text: str(a.text).trim(), date: str(a.date) || null, answers: Number.isInteger(a.answers) ? a.answers : 0 })).filter(a => a.text),
    // v2: people around the owner: who recommends to them, who they recommend to.
    circle: list(d.circle).map(c => {
      const p = personOrNull(c)
      return p && { ...p, gave: Number.isInteger(c.gave) ? c.gave : 0, avg: typeof c.avg === 'number' ? c.avg : null, got: Number.isInteger(c.got) ? c.got : 0 }
    }).filter(Boolean),
    // send: the "send me a ryt" page; page: this page (for links from the send page back);
    // home: RYT itself.
    // thing: a page listing everyone who tried something (add ?q=<title>).
    links: { send: httpUrl(obj(d.links).send), page: httpUrl(obj(d.links).page), home: httpUrl(obj(d.links).home), thing: httpUrl(obj(d.links).thing) },
    recs,
    recommendedByMe: list(d.recommendedByMe).map(x => {
      const s = obj(x)
      return {
        id: str(s.id),
        title: str(s.title).trim() || 'Untitled',
        to: person(s.to),
        status: PUBLIC_STATUSES.includes(s.status) ? s.status : 'tried',
        rating: rating(s.rating),
      }
    }),
    stats: {
      tried: tried.length,
      alreadyDone: recs.filter(r => r.status === 'already_done').length,
      trying: recs.filter(r => r.status === 'trying').length,
      want: recs.filter(r => r.status === 'want').length,
      avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating, 0) / rated.length) * 10) / 10 : null,
    },
  }
}
