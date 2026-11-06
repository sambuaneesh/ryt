// Turns a person's public ryts into a Hugo site source that any blog theme can render.
// This is the common denominator of the ecosystem:
//
//   site config  title, description, author, main menu, taxonomies
//   posts        one page bundle per ryt (index.md + cover.png), standard front matter
//                (title, date, summary, tags, categories, images) + a `ryt:` block
//   pages        about, "Ryts I sent", and "Send me a ryt" (a form inside the theme)
//
// Deterministic: the same data and options always produce the same files. Images are
// returned as requests ({ path, kind, seed }) for the builder to materialise.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
export function deepMerge(base, extra) {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra ?? {})) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v
  return out
}

const yaml = value => JSON.stringify(value) // JSON scalars/arrays are valid YAML flow values
export const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'ryt'
const day = iso => (/^\d{4}-\d{2}-\d{2}/.exec(iso ?? '')?.[0] ?? '2026-01-01')

function frontMatter(fields) {
  const line = (k, v, pad = '') => (isObj(v)
    ? `${pad}${k}:\n${Object.entries(v).filter(([, x]) => x != null).map(([k2, x]) => line(k2, x, `${pad}  `)).join('\n')}`
    : `${pad}${k}: ${yaml(v)}`)
  return `---\n${Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => line(k, v)).join('\n')}\n---\n`
}

// Front-matter keys themes use for a post's image. `cover` is a map in some themes
// (PaperMod) and a string in others, so its shape is an option the builder can change.
function imageFields(title, coverShape) {
  if (coverShape === 'none') return {}
  return {
    images: ['cover.png'],
    image: 'cover.png',
    thumbnail: 'cover.png',
    cover: coverShape === 'map' ? { image: 'cover.png', alt: title, relative: true } : 'cover.png',
  }
}

function post(rec, owner, coverShape) {
  const who = rec.from?.name ?? 'someone anonymous'
  const tried = rec.status === 'tried'
  const verdict = tried ? (rec.rating ? `${rec.rating}/10` : 'Tried') : 'Already there'
  const summary = `${verdict} · ryt from ${who}${rec.review ? `. ${rec.review}` : ''}`
  const credit = rec.from?.profileUrl ? `[${who}](${rec.from.profileUrl})` : who
  const body = [
    `**${verdict}** · ryt from ${credit}`,
    rec.pitch && `> ${rec.pitch.replace(/\n/g, '\n> ')}\n>\n> — ${who}`,
    rec.review,
    rec.url && `[${rec.title} ↗](${rec.url})`,
  ].filter(Boolean).join('\n\n')
  return frontMatter({
    title: rec.title,
    date: day(rec.date),
    draft: false,
    description: summary.slice(0, 160),
    summary,
    author: owner.name,
    categories: [rec.category],
    tags: [...rec.tags, tried ? 'tried' : 'already-there'],
    from: [who],
    ...imageFields(rec.title, coverShape),
    ryt: { status: rec.status, rating: rec.rating, from: who, fromUrl: rec.from?.profileUrl, pitch: rec.pitch || null, url: rec.url },
  }) + `\n${body}\n`
}

// Options the builder adjusts per theme (all deterministic):
//   section      the content section the theme lists on its home page (posts, post, blog…)
//   authorShape  params.author as a string or { name }
//   taxonomies   'full' (tags, categories, from) | 'basic' (tags, categories) | 'none'
//   coverShape   'map' | 'string' | 'none'
//   extraTaxonomies  taxonomies a theme requires, e.g. { author: 'authors' }
//   params       the person's own choices for this theme's options, merged last
export function siteSource(data, { baseURL = '/', section = 'posts', authorShape = 'string', taxonomies = 'full', coverShape = 'map', extraTaxonomies = {}, params = {} } = {}) {
  const { owner } = data
  const files = {}
  // In static/ for templates that link it, and assets/ for ones that process it.
  // Also in images/ and img/, where themes look up a bare file name (resources.Get "images/…").
  const images = ['static', 'assets', 'static/images', 'assets/images', 'static/img', 'assets/img'].flatMap(dir => [
    { path: `${dir}/ryt-avatar.png`, kind: 'avatar', seed: owner.handle },
    { path: `${dir}/ryt-banner.png`, kind: 'banner', seed: `banner:${owner.handle}` },
  ])
  const seen = new Map()
  for (const rec of data.recs) {
    let name = slug(rec.title)
    seen.set(name, (seen.get(name) ?? 0) + 1)
    if (seen.get(name) > 1) name += `-${seen.get(name)}`
    files[`content/${section}/${name}/index.md`] = post(rec, owner, coverShape)
    if (coverShape !== 'none') images.push({ path: `content/${section}/${name}/cover.png`, kind: 'cover', seed: `${rec.category}:${rec.title}` })
  }

  const title = `${owner.name}'s ryts`
  const intro = `${owner.bio ? `${owner.bio}\n\n` : ''}Here's what people told me to try, and what I thought.`
  const sent = data.recommendedByMe.map(r =>
    `- **${r.title}** → ${r.to?.profileUrl ? `[${r.to.name}](${r.to.profileUrl})` : r.to?.name ?? 'someone'}: ${r.status === 'already_done' ? 'already there' : r.rating ? `${r.rating}/10` : 'tried'}`).join('\n')

  // Plain pages, not posts: the usual flags themes read to hide dates, reading time, sharing.
  const plain = { hideMeta: true, ShowReadingTime: false, ShowBreadCrumbs: false, ShowShareButtons: false, disableShare: true, comments: false, toc: false, showToc: false }
  // A home banner under the names themes commonly read, so themes whose look is a photo
  // header (Ananke, Hero themes…) show it. Only plain-string keys: shapes vary for the rest.
  const banner = '/ryt-banner.png'
  files['content/_index.md'] = frontMatter({ title, featured_image: banner, banner, header_image: banner, heroImage: banner }) + `\n${intro}\n`
  files[`content/${section}/_index.md`] = frontMatter({ title: 'Ryts' }) + '\nEverything people told me to try, and what I thought.\n'
  files['content/about.md'] = frontMatter({ title: 'About', ...plain }) + `\n${intro}\n\nWant me to try something? [Send me a ryt](/send/).\n`
  files['content/sent.md'] = frontMatter({ title: 'Ryts I sent', ...plain }) + `\n${sent || 'Nothing yet.'}\n`
  // The form itself is drawn by the RYT runtime inside this element, from plain HTML form
  // controls, so it picks up the theme's own typography and form styles.
  files['content/send.md'] = frontMatter({ title: 'Send me a ryt', description: `Recommend something to ${owner.name}`, ...plain }) +
    `\nA ryt is something you think I should try: a film, a game, a book, a place. I'll try it and post what I thought, with credit to you.\n\n<div id="ryt-send"></div>\n`

  // Loaded after the theme's own (migrated) example config: these keys win, everything else
  // keeps the theme's setup. The builder writes it out as TOML (integers stay integers).
  const config = {
    theme: 't',
    themesDir: 'themes',
    baseURL,
    title,
    languageCode: 'en',
    defaultContentLanguage: 'en',
    enableRobotsTXT: false,
    enableGitInfo: false,
    ...(taxonomies === 'none'
      ? { disableKinds: ['taxonomy', 'term'], taxonomies: {} }
      : { taxonomies: { tag: 'tags', category: 'categories', ...(taxonomies === 'full' ? { from: 'from' } : {}), ...extraTaxonomies } }),
    menus: {
      main: [
        { name: 'Ryts', url: `/${section}/`, weight: 1 },
        { name: 'Ryts I sent', url: '/sent/', weight: 2 },
        { name: 'About', url: '/about/', weight: 3 },
        { name: 'Send me a ryt', url: '/send/', weight: 4 },
      ],
    },
    markup: { goldmark: { renderer: { unsafe: true } } },
    params: deepMerge({
      description: owner.bio || title,
      subtitle: "Here's what people told me to try, and what I thought.",
      mainSections: [section],
      author: authorShape === 'map' ? { name: owner.name, email: '', avatar: 'ryt-avatar.png', image: 'ryt-avatar.png', bio: owner.bio } : owner.name,
    }, params),
    security: {
      enableInlineShortcodes: false,
      exec: { allow: ['^(dart-)?sass(-embedded)?$'] },
      funcs: { getenv: ['^HUGO_'] },
      http: { urls: ['^https://(unpkg\\.com|cdn\\.jsdelivr\\.net)/'] },
    },
  }
  return { files, images, config }
}
