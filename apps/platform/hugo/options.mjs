// How a theme's options are shown to people. The builder finds every param a theme reads;
// most are technical (SEO schema, icon sizes, CDN switches) and named for developers. Here
// they're filtered, phrased positively and grouped, Apple-style:
//   "disableScrollToTop" (off)  ->  "Scroll to top button" (on)

const NOISE = /(^|\.)(env|schema|label|icon\w*|svg|\w*json\w*|cookies?|mermaid|katex|math\w*|imageprocessing|\w*rss\w*|opengraph|og\w*|seo|robots|sitemap|ga|gtm|build|debug|dev|lang\w*|i18n|search\w*|algolia|lunr|fuse\w*|cdn\w*|integrity|sri|manifest|pwa|favicon\w*|assets?|hugo\w*|version|prefix|suffix|path|dir|file|\w*url|links?|widgets?|share\w*|comments?|utterances|giscus|disqus|twitter\w*|github\w*|mainsections|paginate|pagination|permalink\w*|canonical\w*|noindex|nofollow|preload\w*|prefetch\w*|lazy\w*|minify\w*|cache\w*|env\w*|plugins?|scripts?|styles?heet|custom(css|js)|head|footer\w*html|analytics\w*|ads?|adsense|sponsor\w*)($|\.)/i
const LOOK = /(dark|light|theme|colou?r|mode|style|font|width|wide|compact|sidebar|layout|accent|palette|scheme|typography|size)/i

const words = key => key.split('.').map(part => part
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/[_-]+/g, ' ')).join(' ')
  .toLowerCase().replace(/\btoc\b/g, 'table of contents').replace(/\bnav\b/g, 'navigation').replace(/\bimg\b/g, 'image')
  .replace(/\bnums?\b/g, 'numbers').replace(/bread crumbs/g, 'breadcrumbs').replace(/(\d+)(st|nd|rd|th)\b/g, ' first ').replace(/\s+/g, ' ').trim()
const sentence = s => s.charAt(0).toUpperCase() + s.slice(1)

export function present(opt) {
  const last = opt.key.split('.').pop()
  const negative = /^(disable|hide|no)(?=[A-Z_]|$)/.test(last) || /^(disable|hide)/i.test(last)
  let label
  let invert = false
  if (opt.type === 'bool' && negative) {
    invert = true
    label = words(last.replace(/^(disable|hide|no)/i, '')) || words(last)
  } else if (opt.type === 'bool' && /^(show|enable|display|use)/i.test(last)) {
    label = words(last.replace(/^(show|enable|display|use)/i, ''))
  } else {
    label = words(opt.key)
  }
  const group = opt.type === 'enum' || opt.type === 'color' || (opt.type === 'bool' && LOOK.test(opt.key)) ? 'look'
    : opt.type === 'bool' ? 'show'
    : 'advanced'
  return { ...opt, label: sentence(label || opt.key), invert, group }
}

// Anything about languages, Hugo internals, or too cryptic to name is left out.
const CRYPTIC = /(lang|hugo|i18n)/i
export function presentOptions(options) {
  return options
    .filter(o => !NOISE.test(o.key) && !CRYPTIC.test(o.key))
    .map(present)
    .filter(o => o.label.replace(/[^a-z]/gi, '').length >= 4)
}
