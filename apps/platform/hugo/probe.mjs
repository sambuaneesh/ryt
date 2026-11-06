// In-page probes. Each returns { ...measurements, skins, frame, avatar } for one page.
//
// Roles are found either by canary content (precise) or by structure (demo sites). For every
// role we capture its SKIN: the element's visual style (colours, borders, radius, shadows,
// type, decoration, padding; never layout), its ::before/::after decorations, and the :hover
// rules that apply to it. That is what gives a theme its character.

// Helpers, run inside the page.
function lib() {
  const cs = (el, pseudo) => getComputedStyle(el, pseudo)
  // Any CSS colour -> [r, g, b, a], by letting a canvas paint it (themes now write oklch(),
  // oklab(), color(srgb …): reading digits out of those gives nonsense).
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  const parse = c => {
    if (!c || /^(transparent|none)$/.test(c)) return null
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = 'rgba(0, 0, 0, 0)'
    ctx.fillStyle = String(c)
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    // getImageData gives straight (not premultiplied) colour, so no un-multiplying here.
    return a ? [r, g, b, a / 255] : [0, 0, 0, 0]
  }
  // Rewrites every colour in a value as rgb()/rgba(), so RYT can tokenize and reason about it.
  const COLOR_FN = /\b(?:oklch|oklab|lab|lch|hwb|hsla?|color)\((?:[^()]|\([^()]*\))*\)/g
  const srgb = v => String(v).replace(COLOR_FN, c => {
    const p = parse(c)
    if (!p) return c
    const [r, g, b] = p.slice(0, 3).map(Math.round)
    return p[3] >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+p[3].toFixed(3)})`
  })
  // The colour actually seen behind an element: backgrounds composited from the root down.
  const solidBg = el => {
    const chain = []
    for (let e = el; e; e = e.parentElement) chain.unshift(e)
    let rgb = [255, 255, 255]
    for (const e of chain) {
      const c = parse(cs(e).backgroundColor)
      if (c && c[3] > 0) rgb = rgb.map((v, i) => v * (1 - c[3]) + c[i] * c[3])
    }
    return `rgb(${rgb.map(Math.round).join(', ')})`
  }
  const shown = el => { const r = el.getBoundingClientRect(); const s = cs(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const norm = s => String(s ?? '').replace(/[‘’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
  const type = el => { const s = cs(el); return { font: s.fontFamily, weight: s.fontWeight, size: parseFloat(s.fontSize), transform: s.textTransform, tracking: s.letterSpacing, color: srgb(s.color) } }
  const box = el => {
    const s = cs(el)
    return { bg: solidBg(el), border: parseFloat(s.borderTopWidth) || parseFloat(s.borderBottomWidth) || 0, borderColor: srgb(s.borderTopColor), borderBottom: parseFloat(s.borderBottomWidth) || 0,
      radius: parseFloat(s.borderTopLeftRadius) || 0, shadow: s.boxShadow, padding: parseFloat(s.paddingTop) || 0, color: srgb(s.color) }
  }
  // Deepest visible elements whose whole text is t (or contains it, if partial).
  const find = (t, partial = false) => {
    const want = norm(t)
    const out = []
    const match = n => (partial ? norm(n.textContent).includes(want) : norm(n.textContent) === want)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (match(n) && ![...n.children].some(match) && shown(n)) out.push(n)
    return out
  }

  const VISUAL = ['color', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'box-shadow',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform',
    'text-decoration-line', 'text-decoration-style', 'text-decoration-color', 'text-decoration-thickness', 'text-underline-offset',
    'text-shadow', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'filter', 'backdrop-filter', 'transition',
    'background-clip', '-webkit-text-fill-color']
  const QUIET = { 'background-clip': 'border-box', 'background-image': 'none', 'box-shadow': 'none', 'text-shadow': 'none', filter: 'none', 'backdrop-filter': 'none', 'text-decoration-line': 'none', transition: 'all 0s ease 0s' }
  const decls = (s, props) => props.map(p => [p, srgb(s.getPropertyValue(p).trim())])
    .filter(([p, v]) => v && v !== QUIET[p] && !(/^border-(top|right|bottom|left)$/.test(p) && /^(0px|none|medium none)/.test(v)) && (p === '-webkit-text-fill-color' || !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(v)))
  const resolveVars = (text, el) => text.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (m, name, fallback) =>
    getComputedStyle(el).getPropertyValue(name).trim() || (fallback ?? '').trim() || 'initial')
  // :hover rules that target this element (inside matching @media / @supports / @layer too).
  const hoverRules = el => {
    const out = []
    const walk = rules => {
      for (const rule of rules ?? []) {
        if (rule.cssRules && !rule.selectorText) {
          if (rule.media && !matchMedia(rule.media.mediaText).matches) continue
          walk(rule.cssRules)
          continue
        }
        if (!rule.selectorText || !rule.selectorText.includes(':hover')) continue
        const hits = rule.selectorText.split(',').some(part => {
          if (!part.includes(':hover')) return false
          try { return el.matches(part.replace(/:hover/g, '').trim() || '*') } catch { return false }
        })
        if (!hits) continue
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i]
          out.push([prop, srgb(resolveVars(rule.style.getPropertyValue(prop), el))])
        }
      }
    }
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules) } catch {}
    }
    return out
  }
  const PSEUDO_LAYOUT = ['display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'vertical-align']
  const skin = el => {
    if (!el) return null
    const pseudo = {}
    for (const ps of ['::before', '::after']) {
      const s = cs(el, ps)
      if (!s.content || /^(none|normal)$/.test(s.content)) continue
      pseudo[ps] = [['content', s.content],
        ...PSEUDO_LAYOUT.map(p => [p, s.getPropertyValue(p)]).filter(([p, v]) => v && !/^(auto|static|0px|baseline|inline)$/.test(v) || p === 'display'),
        ...decls(s, VISUAL)]
    }
    const r = el.getBoundingClientRect()
    return { base: decls(cs(el), VISUAL), pseudo, hover: hoverRules(el), size: { w: r.width, h: r.height } }
  }
  const fonts = families => {
    const want = families.filter(Boolean).flatMap(f => f.split(',').map(x => x.trim().replace(/^["']|["']$/g, '').toLowerCase()))
    const faces = []
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      for (const rule of rules ?? []) {
        if (rule.constructor.name !== 'CSSFontFaceRule') continue
        const fam = rule.style.getPropertyValue('font-family').replace(/^["']|["']$/g, '').toLowerCase()
        if (want.includes(fam)) faces.push({ css: rule.cssText, base: sheet.href ?? location.href })
      }
    }
    return faces
  }
  return { cs, solidBg, shown, norm, type, box, find, skin, fonts, parse, srgb }
}

// Layout facts that select RYT's frame: sidebar vs top, centred profile, avatar.
function frameFacts(L, header, cards, navLink) {
  // The visually first card (feeds are sorted by date, not by our canary order).
  const firstCard = [...(cards ?? [])].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]
  const facts = { frame: 'top', heroCentered: false, avatar: false }
  // Sidebar: the menu sits beside the feed (left of it, level with it), not above it.
  const menu = navLink ?? header
  if (menu && firstCard) {
    const m = menu.getBoundingClientRect()
    const c = firstCard.getBoundingClientRect()
    // Level with the feed: not above it (a top bar) and not below it (a footer menu).
    if (m.right <= c.left + 12 && m.bottom > c.top - 60 && m.top < c.bottom) facts.frame = 'sidebar'
  }
  // Banner: a wide, tall image or gradient block at the top, above the first post.
  const firstTop = firstCard ? firstCard.getBoundingClientRect().top : innerHeight
  facts.banner = [...document.querySelectorAll('body *')].some(el => {
    const r = el.getBoundingClientRect()
    if (r.top > innerHeight * 0.5 || r.bottom > firstTop + 10 || r.width < innerWidth * 0.8 || r.height < 220) return false
    const bg = L.cs(el).backgroundImage
    return (bg && bg !== 'none') || (el.tagName === 'IMG' && r.height >= 220)
  })
  // The profile picture: the largest avatar-like image (a small logo in the header isn't it).
  const area = i => { const r = i.getBoundingClientRect(); return r.width * r.height }
  const avatar = [...document.querySelectorAll('img')].filter(i => /ryt-avatar|avatar|profile/i.test(i.src + i.className + i.alt) && L.shown(i))
    .sort((a, b) => area(b) - area(a))[0]
  if (avatar) {
    const r = avatar.getBoundingClientRect()
    facts.avatar = true
    facts.heroCentered = r.width >= 70 && Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 90
  }
  return facts
}

// Measurements + skins from the roles found on a page (shared by both finders).
function measure(L, roles, extra = {}) {
  const body = document.body
  const pageBg = L.solidBg(body)
  // What the feed sits on: themes that frame their content in a panel over a coloured body.
  const feed = roles.cards?.[0]?.parentElement
  const out = { page: { bg: pageBg, contentBg: feed ? L.solidBg(feed) : pageBg, ...L.type(body) }, width: innerWidth, ...extra }
  if (roles.cardTitle) out.heading = { ...L.type(roles.cardTitle), color: L.srgb(L.cs(roles.titleLink ?? roles.cardTitle).color) }
  else if (roles.pageTitle) out.heading = L.type(roles.pageTitle)
  if (roles.cards?.length) {
    const cards = roles.cards
    const boxed = roles.card ? { boxed: true, ...L.box(roles.card), differs: L.solidBg(roles.card) !== L.solidBg(roles.card.parentElement), width: roles.card.getBoundingClientRect().width } : { boxed: false, width: cards[0].getBoundingClientRect().width }
    out.card = boxed
    const tops = cards.map(c => Math.round(c.getBoundingClientRect().top))
    out.columns = tops.filter(t => Math.abs(t - tops[0]) < 12).length
    const container = cards[1] ? (() => { let e = cards[0]; while (e && !e.contains(cards[1])) e = e.parentElement; return e })() : cards[0].parentElement
    out.contentWidth = container?.getBoundingClientRect().width ?? null
    if (roles.cover && L.shown(roles.cover)) {
      const img = roles.cover.getBoundingClientRect()
      const title = (roles.cardTitle ?? cards[0]).getBoundingClientRect()
      out.cover = { radius: parseFloat(L.cs(roles.cover).borderTopLeftRadius) || 0, side: img.right <= title.left + 4 || img.left >= title.right - 4 }
    } else out.cover = null
    out.gap = cards[1] ? cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().bottom : null
    out.titleCount = cards.length
  }
  if (roles.meta) out.meta = L.type(roles.meta)
  if (roles.chip) out.chip = { ...L.box(roles.chip), ...L.type(roles.chip), parentBg: L.solidBg(roles.chip.parentElement) }
  if (roles.link) out.link = L.type(roles.link)
  if (roles.button) out.button = { ...L.box(roles.button), ...L.type(roles.button) }
  if (roles.navLink) out.nav = L.type(roles.navLink)
  if (roles.header) {
    const hb = L.box(roles.header)
    out.header = { ...hb, differs: hb.bg !== pageBg, text: roles.navLink ? L.srgb(L.cs(roles.navLink).color) : hb.color }
  }
  if (roles.brand) {
    const r = roles.brand.getBoundingClientRect()
    out.brand = { ...L.type(roles.brand), center: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 80 }
  }
  out.skins = {}
  for (const [role, el] of Object.entries(roles)) {
    if (el && el.nodeType === 1) out.skins[role] = L.skin(el)
  }
  out.fontFaces = L.fonts([out.page.font, out.heading?.font])
  out.googleFonts = [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].map(l => l.href)
  return out
}

// Finder 1: canary content (we generated the site, so we know what every text is).
function canaryFind(L, canary) {
  const roles = { body: document.body }
  const titles = canary.titles.map(t => L.find(t)[0]).filter(Boolean)
  const cardOf = el => {
    let best = null
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (canary.titles.filter(t => L.norm(e.textContent).includes(L.norm(t))).length > 1) break
      best = e
    }
    return best
  }
  roles.cards = titles.map(cardOf).filter(Boolean)
  if (titles[0]) {
    roles.cardTitle = titles[0].closest('h1,h2,h3,h4,h5,h6') ?? titles[0]
    roles.titleLink = titles[0].closest('a') ?? titles[0].querySelector('a')
    const isPost = roles.cards.length < 2
    if (isPost) roles.pageTitle = roles.cardTitle
    if (roles.cards[0] && !isPost) {
      for (let e = titles[0]; e && e !== roles.cards[0].parentElement; e = e.parentElement) {
        const b = L.box(e)
        if (L.solidBg(e) !== L.solidBg(e.parentElement) || b.border > 0 || (b.shadow && b.shadow !== 'none')) roles.card = e
      }
      // A cover is a real share of the card, not an author avatar or an icon.
      const cardWidth = roles.cards[0].getBoundingClientRect().width
      roles.cover = [...roles.cards[0].querySelectorAll('img')].find(i => { const r = i.getBoundingClientRect(); return r.width >= cardWidth * 0.3 && r.height >= 60 })
      roles.meta = [...roles.cards[0].querySelectorAll('*')].find(e => /2026/.test(e.textContent) && e.textContent.length < 60 && !e.children.length && L.shown(e))
      roles.summary = L.find(canary.summary, true).find(e => roles.cards[0].contains(e))
    }
  }
  roles.chip = canary.categories.flatMap(c => L.find(c)).find(el => !el.closest('nav, header'))
  roles.link = [...document.querySelectorAll('article p a, main p a, p a')].find(a => L.shown(a) && /canary-link|example\.com/.test(a.href))
  roles.quote = L.find(canary.pitch, true).map(e => e.closest('blockquote')).find(Boolean)
  roles.button = [...document.querySelectorAll('button, .btn, .button, input[type=submit]')].find(b => L.shown(b) && L.parse(L.cs(b).backgroundColor)?.[3] > 0)
  // The menu label can also appear in the feed (themes that list every page): prefer the
  // copy that sits in navigation.
  const menuHits = L.find(canary.menu)
  roles.navLink = menuHits.find(a => a.closest('nav, header, aside, [role=navigation], [class*=nav], [class*=menu], [class*=sidebar]')) ?? menuHits[0]
  roles.header = roles.navLink?.closest('header') ?? roles.navLink?.closest('nav')?.parentElement ?? null
  roles.brand = L.find(canary.brand)[0]
  roles.sectionHeading = L.find(canary.sectionTitle).map(e => e.closest('h1,h2,h3')).find(Boolean)
  roles.footer = [...document.querySelectorAll('footer')].find(L.shown)
  const facts = frameFacts(L, roles.header, roles.cards, roles.navLink)
  const result = measure(L, roles, facts)
  result.titleCount = titles.length
  return result
}

// Finder 2: structure only (a theme's own demo site, which has its own content).
function demoFind(L) {
  const roles = { body: document.body }
  let best = []
  for (const parent of document.querySelectorAll('body *')) {
    const kids = [...parent.children].filter(L.shown)
    if (kids.length < 3) continue
    const groups = new Map()
    for (const k of kids) {
      if (!k.querySelector('a') || (k.textContent || '').trim().length < 20 || k.closest('header, nav, footer')) continue
      const sig = `${k.tagName}.${[...k.classList].sort().join('.')}`
      groups.set(sig, [...(groups.get(sig) ?? []), k])
    }
    for (const g of groups.values()) if (g.length > best.length && g[0].getBoundingClientRect().width > 180) best = g
  }
  roles.cards = best.slice(0, 8)
  if (roles.cards.length >= 2) {
    const first = roles.cards[0]
    roles.cardTitle = first.querySelector('h1, h2, h3, h4, h5') ?? first.querySelector('a')
    roles.titleLink = roles.cardTitle?.querySelector('a') ?? (roles.cardTitle?.tagName === 'A' ? roles.cardTitle : null)
    for (let e = roles.cardTitle; e && e !== first.parentElement; e = e.parentElement) {
      const b = L.box(e)
      if (L.solidBg(e) !== L.solidBg(e.parentElement) || b.border > 0 || (b.shadow && b.shadow !== 'none')) roles.card = e
    }
    const cardWidth = first.getBoundingClientRect().width
    roles.cover = [...first.querySelectorAll('img')].find(i => { const r = i.getBoundingClientRect(); return r.width >= cardWidth * 0.3 && r.height >= 60 })
    roles.meta = [...first.querySelectorAll('time, .date, .meta, small, [class*=date], [class*=meta]')].find(L.shown)
    roles.summary = [...first.querySelectorAll('p')].find(p => L.shown(p) && p.textContent.trim().length > 40)
    roles.chip = [...first.querySelectorAll('a, span')].find(e => /tag|categor|label|badge|chip|pill/i.test(`${e.className} ${e.parentElement?.className}`) && L.shown(e) && (e.textContent || '').trim().length < 24)
  } else {
    roles.cards = []
    roles.pageTitle = [...document.querySelectorAll('main h1, article h1, h1')].find(L.shown)
  }
  roles.link = [...document.querySelectorAll('main p a, article p a, p a')].find(L.shown)
  roles.quote = [...document.querySelectorAll('blockquote')].find(L.shown)
  roles.button = [...document.querySelectorAll('button, .btn, .button, input[type=submit]')].find(b => L.shown(b) && L.parse(L.cs(b).backgroundColor)?.[3] > 0)
  roles.header = [...document.querySelectorAll('header, nav')].find(L.shown)
  roles.navLink = roles.header ? [...roles.header.querySelectorAll('a')].filter(L.shown)[1] ?? null : null
  roles.brand = roles.header ? [...roles.header.querySelectorAll('.logo, [class*=brand], [class*=title], h1, a')].find(L.shown) : null
  roles.footer = [...document.querySelectorAll('footer')].find(L.shown)
  return measure(L, roles, frameFacts(L, roles.header, roles.cards, roles.navLink))
}

const src = (fn, arg) => `(() => { const L = (${lib})(); ${frameFacts}; ${measure}; return (${fn})(L${arg === undefined ? '' : `, ${JSON.stringify(arg)}`}) })()`
export const canaryProbe = canary => src(canaryFind, canary)
export const demoProbe = () => src(demoFind)
