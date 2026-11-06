// Paste a link, get the rest: a title, the kind of thing, and a picture link. Best effort,
// browser only, free services that allow it (no accounts, no AI):
//   YouTube and Spotify oEmbed, noembed.com (Vimeo, SoundCloud…), Wikipedia, and
//   microlink.io for any other page (50 lookups a day per visitor).
// Sites that block lookups often put the name in the address (Steam, Letterboxd, Goodreads,
// Google Maps, Amazon…), so that is read too. Anything that fails just leaves the fields empty.

import { safeImage } from './ui.js'

// The kind of thing, from the address.
const KIND_BY_HOST = [
  [/(^|\.)music\.youtube\.com$|spotify\.com$|music\.apple\.com$|soundcloud\.com$|bandcamp\.com$|deezer\.com$|tidal\.com$|jiosaavn\.com$|gaana\.com$|podcasts\.apple\.com$/, 'listen'],
  [/youtube\.com$|youtu\.be$|vimeo\.com$|netflix\.com$|imdb\.com$|letterboxd\.com$|primevideo\.com$|hotstar\.com$|disneyplus\.com$|hulu\.com$|max\.com$|mubi\.com$|crunchyroll\.com$|myanimelist\.net$|tv\.apple\.com$|justwatch\.com$|twitch\.tv$/, 'watch'],
  [/goodreads\.com$|openlibrary\.org$|books\.google\.|storygraph\.com$|kindle|audible\.|gutenberg\.org$/, 'read'],
  [/steampowered\.com$|steamcommunity\.com$|epicgames\.com$|itch\.io$|nintendo\.|playstation\.com$|xbox\.com$|gog\.com$|boardgamegeek\.com$/, 'play'],
  [/zomato\.com$|swiggy\.com$|yelp\.|opentable\.|tripadvisor\.[a-z.]+\/Restaurant|ubereats\.com$|doordash\.com$|allrecipes\.com$|seriouseats\.com$/, 'eat'],
  [/maps\.google\.|google\.[a-z.]+$|maps\.app\.goo\.gl$|goo\.gl$|tripadvisor\.|airbnb\.|booking\.com$|wikivoyage\.org$/, 'go'],
  [/apps\.apple\.com$|play\.google\.com$|github\.com$|chromewebstore\.google\.com$|producthunt\.com$/, 'use'],
]
export function kindOfUrl(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (/google\./.test(host) && !u.pathname.startsWith('/maps')) return null
    const hit = KIND_BY_HOST.find(([re]) => re.test(host) || re.test(host + u.pathname))
    return hit ? hit[1] : null
  } catch {
    return null
  }
}

const tidy = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
const words = slug => tidy(decodeURIComponent(slug).replace(/[-_+]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))

// Names some sites put in the address.
function titleFromPath(u) {
  const p = u.pathname
  let m
  if ((m = /\/app\/\d+\/([^/]+)/.exec(p)) && /steampowered/.test(u.hostname)) return words(m[1])
  if ((m = /\/film\/([^/]+)/.exec(p)) && /letterboxd/.test(u.hostname)) return words(m[1])
  if ((m = /\/book\/show\/\d+[-.]([^/?]+)/.exec(p))) return words(m[1])
  if ((m = /\/maps\/place\/([^/@]+)/.exec(p))) return words(m[1])
  if ((m = /^\/([^/]+)\/dp\//.exec(p))) return words(m[1])
  if ((m = /\/(?:album|song|playlist|podcast|artist)\/([^/]+)\//.exec(p)) && /apple\.com/.test(u.hostname)) return words(m[1])
  if ((m = /\/wiki\/([^/#?]+)/.exec(p))) return words(m[1])
  return ''
}

const getJSON = async (url, ms = 5000) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

// -> { title, kind, cover } (any may be empty)
export async function unfurl(link) {
  let u
  try {
    u = new URL(link)
    if (!/^https?:$/.test(u.protocol)) return {}
  } catch {
    return {}
  }
  const host = u.hostname.replace(/^www\./, '')
  const out = { title: titleFromPath(u), kind: kindOfUrl(link), cover: null }
  const take = (title, cover) => {
    if (title && !out.title) out.title = tidy(title)
    if (cover && !out.cover) out.cover = safeImage(String(cover).replace(/^http:/, 'https:'))
  }
  try {
    if (/youtube\.com$|youtu\.be$/.test(host)) {
      const d = await getJSON(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`)
      take(d.title, d.thumbnail_url)
    } else if (/spotify\.com$/.test(host)) {
      const d = await getJSON(`https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`)
      take(d.title, d.thumbnail_url)
    } else if (/wikipedia\.org$/.test(host) && /\/wiki\//.test(u.pathname)) {
      const page = u.pathname.split('/wiki/')[1]
      const d = await getJSON(`https://${u.hostname}/api/rest_v1/page/summary/${page}`)
      take(d.title, d.thumbnail?.source)
    } else if (/vimeo\.com$|soundcloud\.com$|flickr\.com$|dailymotion\.com$/.test(host)) {
      const d = await getJSON(`https://noembed.com/embed?url=${encodeURIComponent(link)}`)
      take(d.title, d.thumbnail_url)
    }
  } catch {}
  // Anything else (or still missing a title/picture): read the page's own preview data.
  if (!out.title || !out.cover) {
    try {
      const d = await getJSON(`https://api.microlink.io/?url=${encodeURIComponent(link)}`, 7000)
      if (d.status === 'success') take(d.data?.title, d.data?.image?.url ?? d.data?.logo?.url)
    } catch {}
  }
  // Site names are noise in a title: "Piranesi | Goodreads" -> "Piranesi".
  out.title = tidy(out.title.replace(/\s+[|·–—-]\s+[^|·–—-]{2,40}$/, '').replace(/^Watch\s+/i, ''))
  return out
}

// The first web address in a piece of shared text ("Check this out https://…").
export const firstUrl = text => /https?:\/\/[^\s<>"']+/.exec(String(text ?? ''))?.[0] ?? null

// Wires a form: when a link is pasted or typed, fill the title, kind and picture, but never
// overwrite something the person typed themselves. fields: { link, title, kind, cover, status },
// kindValue(kind) -> the <select> value for a kind.
export function bindAutofill({ link, title, kind, cover, status }, kindValue = k => k) {
  if (!link) return
  const touched = new Set()
  for (const el of [title, kind, cover]) el?.addEventListener('input', () => touched.add(el))
  let last = ''
  const run = async () => {
    const url = link.value.trim()
    if (!/^https?:\/\/\S+\.\S+/.test(url) || url === last) return
    last = url
    if (status) status.textContent = 'Looking it up…'
    const got = await unfurl(url)
    if (link.value.trim() !== url) return
    const filled = []
    if (got.title && title && (!title.value.trim() || !touched.has(title))) { title.value = got.title; filled.push('name') }
    if (got.kind && kind && !touched.has(kind)) {
      const v = kindValue(got.kind)
      if ([...kind.options].some(o => (o.value || o.text) === v)) { kind.value = v; filled.push('type') }
    }
    if (got.cover && cover && (!cover.value.trim() || !touched.has(cover))) { cover.value = got.cover; filled.push('picture') }
    if (status) status.textContent = filled.length ? `Filled in the ${filled.length > 1 ? `${filled.slice(0, -1).join(', ')} and ${filled.at(-1)}` : filled[0]} from the link.` : ''
  }
  let timer
  link.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 450) })
  link.addEventListener('paste', () => setTimeout(run, 0))
  if (link.value.trim()) run()
}
