// The Hugo theme marketplace, read live from themes.gohugo.io (the official showcase).
// Nothing is downloaded up front: one listing page gives every theme's name and hosted
// thumbnail; tag membership and repo links are fetched only when someone asks for them.

const SITE = 'https://themes.gohugo.io'
const DAY = 24 * 60 * 60 * 1000
const memo = new Map()

async function cached(key, ttl, fn) {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const pending = fn()
  memo.set(key, { at: Date.now(), value: pending })
  try {
    return await pending
  } catch (e) {
    memo.delete(key)
    throw e
  }
}

async function page(path) {
  const res = await fetch(`${SITE}${path}`, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'ryt-prototype' } })
  if (!res.ok) throw new Error(`themes.gohugo.io answered ${res.status}`)
  return res.text()
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

// Theme cards on listing pages: <img src=/themes/{slug}/tn-featured_….png> … "View details for {name}"
function cards(html) {
  const out = []
  const re = /<li class=relative>[\s\S]*?srcset=\/themes\/([\w.-]+)\/(tn-featured_hu_[\w]+\.webp) type=image\/webp>[\s\S]*?<img [^>]*src=\/themes\/[\w.-]+\/(tn-featured[\w.-]*)[^>]*>[\s\S]*?View details for ([^<]+)<\/span>/g
  let m
  while ((m = re.exec(html))) {
    out.push({ slug: m[1], name: decode(m[4].trim()), thumb: `${SITE}/themes/${m[1]}/${m[2]}`, thumbPng: `${SITE}/themes/${m[1]}/${m[3]}` })
  }
  return out
}

export const listAll = () => cached('all', DAY, async () => cards(await page('/themes/')))

export const TAGS = ['blog', 'minimal', 'personal', 'dark', 'light', 'responsive', 'portfolio', 'multilingual']

export const tagMembers = tag => cached(`tag:${tag}`, DAY, async () => {
  if (!/^[a-z0-9-]+$/.test(tag)) throw new Error('bad tag')
  return new Set(cards(await page(`/tags/${tag}/`)).map(c => c.slug))
})

// Showcase tags that mean "not a blog": these themes don't list posts on their home page.
// Labelled up front in the gallery so nobody has to click to find out.
const NOT_BLOG = { docs: 'Docs theme', landing: 'Landing page', api: 'API docs', agency: 'Business site', company: 'Business site', church: 'Organisation site', ecommerce: 'Shop theme', book: 'Book theme', podcast: 'Podcast theme' }
export const themeKinds = () => cached('kinds', DAY, async () => {
  const kinds = new Map()
  const blog = await tagMembers('blog').catch(() => new Set())
  await Promise.all(Object.entries(NOT_BLOG).map(async ([tag, label]) => {
    for (const slug of await tagMembers(tag).catch(() => new Set())) if (!blog.has(slug) && !kinds.has(slug)) kinds.set(slug, label)
  }))
  return kinds
})

export async function search({ q = '', tag = '', page: n = 0, size = 24 } = {}) {
  let themes = await listAll()
  if (tag) {
    const members = await tagMembers(tag)
    themes = themes.filter(t => members.has(t.slug))
  }
  if (q) {
    const needle = q.toLowerCase()
    themes = themes.filter(t => t.name.toLowerCase().includes(needle) || t.slug.includes(needle))
  }
  return { total: themes.length, items: themes.slice(n * size, n * size + size), page: n, size }
}

// Detail page: source repository (null if none is listed), description, demo link. Fetched when a theme is applied.
export const detail = slug => cached(`detail:${slug}`, DAY, async () => {
  if (!/^[\w.-]+$/.test(slug)) throw new Error('bad theme id')
  const html = await page(`/themes/${slug}/`)
  const repo = [...html.matchAll(/href=["']?(https:\/\/(?:github\.com|gitlab\.com|codeberg\.org)\/[\w.-]+\/[\w.-]+)(?:\/tree\/([\w.-]+)\/([\w./-]+))?["'\s>]/g)]
    .map(m => ({ url: m[1].replace(/\.git$/, ''), ref: m[2] ?? null, subdir: m[3] ?? null }))
    .find(r => !/github\.com\/gohugoio\//.test(r.url))
  // No repo: it can't be built, but its demo and screenshot can still donate a style.
  const all = await listAll()
  const screenshot = /src=(\/themes\/[\w.-]+\/screenshot[\w.-]*\.(?:png|jpe?g|webp))/.exec(html)?.[1]
  return {
    slug,
    name: all.find(t => t.slug === slug)?.name ?? slug,
    screenshot: screenshot ? `${SITE}${screenshot}` : null,
    tags: (tags => (tags.length > 12 ? [] : tags))([...new Set([...html.matchAll(/\/tags\/([a-z0-9-]+)\//g)].map(m => m[1]))].filter(t => t !== 'popular')),
    description: decode(/<meta name=description content="([^"]*)"/.exec(html)?.[1] ?? ''),
    demo: /href=["']?(https?:\/\/[^"' >]+)["']?[^>]*>\s*(?:Demo|Live demo)/i.exec(html)?.[1] ?? null,
    repo,
    thumb: all.find(t => t.slug === slug)?.thumb ?? null,
  }
})
