// Theme resolution. A theme is a stack of layers (base -> preset -> palette -> user overrides);
// later layers override earlier ones, one key at a time. Invalid or unknown values are skipped
// with a warning, so the inherited value stays: a bad override can never break the page.

import { TOKEN_SCHEMA, SETTING_SCHEMA, SECTIONS, DEFAULT_SECTIONS, FONTS, isValid } from './schema.js'

const defaults = schema => Object.fromEntries(Object.entries(schema).map(([k, s]) => [k, s.default]))
const show = v => JSON.stringify(v)?.slice(0, 40)

function mergeValues(schema, target, values, from, warnings, what) {
  if (values == null) return
  if (typeof values !== 'object' || Array.isArray(values)) {
    warnings.push(`${from}: "${what}" must be an object, ignored`)
    return
  }
  for (const [key, value] of Object.entries(values)) {
    const spec = schema[key]
    if (!spec) warnings.push(`${from}: unknown ${what} "${key}" ignored`)
    else if (!isValid(spec, value)) warnings.push(`${from}: invalid ${key} = ${show(value)}, kept ${show(target[key])}`)
    else target[key] = value
  }
}

// layers: [{ name, kind: 'preset' | 'user', tokens?, settings?, sections?, css? }]
export function resolveTheme(layers = []) {
  const theme = {
    tokens: defaults(TOKEN_SCHEMA),
    settings: defaults(SETTING_SCHEMA),
    sections: [...DEFAULT_SECTIONS],
    css: [],
    fontFaces: [],
    dark: {},
    warnings: [],
  }
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue
    const from = layer.name ?? 'theme'
    mergeValues(TOKEN_SCHEMA, theme.tokens, layer.tokens, from, theme.warnings, 'token')
    mergeValues(SETTING_SCHEMA, theme.settings, layer.settings, from, theme.warnings, 'setting')
    if (layer.sections != null) {
      const ids = Array.isArray(layer.sections) ? layer.sections : []
      const known = [...new Set(ids.filter(id => id in SECTIONS))]
      for (const id of ids) if (!(id in SECTIONS)) theme.warnings.push(`${from}: unknown section ${show(id)} ignored`)
      if (known.length) theme.sections = known
      else theme.warnings.push(`${from}: no valid sections listed, kept ${theme.sections.join(', ')}`)
    }
    if (typeof layer.fontFaces === 'string' && layer.fontFaces.trim()) theme.fontFaces.push(layer.fontFaces)
    // A dark-mode variant of the colours (from themes that have one). Later layers with their
    // own colours but no dark variant switch it off, so a light override isn't left half-dark.
    if (layer.dark && typeof layer.dark === 'object') {
      theme.dark = {}
      for (const [k, v] of Object.entries(layer.dark)) if (TOKEN_SCHEMA[k]?.type === 'color' && isValid(TOKEN_SCHEMA[k], v)) theme.dark[k] = v
    } else if (layer.tokens && Object.keys(layer.tokens).some(k => k.startsWith('color.'))) {
      theme.dark = {}
    }
    const css = Array.isArray(layer.css) ? layer.css.join('\n') : layer.css
    if (typeof css === 'string' && css.trim()) {
      theme.css.push({ from, layer: layer.kind === 'user' ? 'user' : 'theme', code: css })
    }
  }
  return theme
}

// Bundled fonts by name, or a theme's own font stack as-is.
const fontStack = name => (FONTS[name] ? FONTS[name].stack ?? `"${name}", ${FONTS[name].fallback}` : name)

const SHADOWS = {
  none: 'none',
  soft: '0 1px 2px rgb(0 0 0 / .06), 0 6px 20px rgb(0 0 0 / .06)',
  hard: '4px 4px 0 var(--ryt-text)',
}
const GAPS = { compact: '10px', cozy: '18px', airy: '30px' }

export function themeVars(theme) {
  const t = theme.tokens
  return {
    '--ryt-bg': t['color.bg'],
    '--ryt-surface': t['color.surface'],
    '--ryt-text': t['color.text'],
    '--ryt-muted': t['color.muted'],
    '--ryt-border': t['color.border'],
    '--ryt-accent': t['color.accent'],
    '--ryt-rating': t['color.rating'],
    '--ryt-font-heading': fontStack(t['font.heading']),
    '--ryt-font-body': fontStack(t['font.body']),
    '--ryt-radius': `${t.radius}px`,
    '--ryt-border-w': `${t['border.width']}px`,
    '--ryt-shadow': SHADOWS[t.shadow],
    '--ryt-gap': GAPS[t.density],
    '--ryt-text-size': `${t['text.size']}px`,
    '--ryt-heading-weight': String(t['heading.weight']),
    '--ryt-heading-case': t['heading.case'],
    '--ryt-heading-tracking': { tight: '-0.02em', normal: '0', wide: '0.06em' }[t['heading.tracking']],
    '--ryt-nav-case': t['nav.case'],
    '--ryt-page-width': `${t['page.width']}px`,
    '--ryt-header-bg': t['color.header'],
    '--ryt-header-text': t['color.headerText'],
  }
}

export function fontHref(theme) {
  const families = [...new Set([theme.tokens['font.heading'], theme.tokens['font.body']])]
    .map(name => FONTS[name]?.google)
    .filter(Boolean)
  return families.length ? `https://fonts.googleapis.com/css2?${families.map(f => `family=${f}`).join('&')}&display=swap` : null
}

// All theme CSS as one stylesheet. Token vars + preset CSS go in @layer theme, the user's own
// CSS in @layer user. @import lines are hoisted because they must come first in a stylesheet.
const IMPORT = /@import\s+(?:url\(\s*(["'])[^"']*\1\s*\)|url\([^)"']*\)|(["'])[^"']*\2)[^;]*;/g

export function themeStyles(theme) {
  const imports = []
  const body = layer => theme.css
    .filter(c => c.layer === layer)
    // @import must come first in a stylesheet. Quoted URLs may contain ";" (Google Fonts:
    // wght@300;400), so match the quoted part as a whole.
    .map(c => `/* ${c.from.replace(/\*\//g, '')} */\n` + c.code.replace(IMPORT, m => (imports.push(m), '')))
    .join('\n')
  const vars = Object.entries(themeVars(theme)).map(([k, v]) => `  ${k}: ${v};`).join('\n')
  const darkTheme = Object.keys(theme.dark ?? {}).length ? { ...theme, tokens: { ...theme.tokens, ...theme.dark } } : null
  const darkVars = darkTheme ? Object.entries(themeVars(darkTheme)).filter(([k]) => /^--ryt-(bg|surface|text|muted|border|accent|rating|header)/.test(k)).map(([k, v]) => `    ${k}: ${v};`).join('\n') : ''
  const theming = body('theme')
  const user = body('user')
  // Font faces from an imported theme come first: they can't live inside a cascade layer.
  // The result goes inside a <style> element: no layer's text may close it ("</style>").
  return `${imports.join('\n')}\n${(theme.fontFaces ?? []).join('\n')}\n@layer theme {\n:root {\n${vars}\n}\n${darkVars ? `@media (prefers-color-scheme: dark) {\n  :root {\n${darkVars}\n  }\n}\n` : ''}${theming}\n}\n@layer user {\n${user}\n}`.replace(/<\/(?=\s*style)/gi, '<\\/')
}
