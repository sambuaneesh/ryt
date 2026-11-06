// Theme importers: turn themes from other ecosystems into a RYT theme layer.
//
//   importTheme(text) -> { format, label, name, layer: { tokens, css? }, notes, variants }
//
// Every adapter maps its format onto the same seven colour roles (plus radius / fonts when
// the format has them). Missing roles are derived from the ones present, and the result is
// checked for readable contrast, so any import produces a usable page. Pure functions: this
// runs on the server today and could run in the browser for a live preview.

import { hex, mix, contrast } from './color.js'
import { FONTS, TOKEN_SCHEMA } from './schema.js'

export const FORMATS = {
  base16: 'base16 / base24 scheme',
  alacritty: 'Alacritty theme',
  kitty: 'Kitty theme',
  ghostty: 'Ghostty theme',
  vscode: 'VS Code theme',
  cssvars: 'CSS variables (shadcn, tweakcn, daisyUI…)',
  tokens: 'Design tokens (W3C format)',
  ryt: 'RYT theme file',
  stylesheet: 'Stylesheet (classless / Bear Blog style)',
}

const ROLES = ['bg', 'surface', 'text', 'muted', 'border', 'accent', 'rating']
const ROLE_TOKEN = { bg: 'color.bg', surface: 'color.surface', text: 'color.text', muted: 'color.muted', border: 'color.border', accent: 'color.accent', rating: 'color.rating' }

// ---------- tiny parsers ----------

function parseToml(text) {
  const out = {}
  let section = ''
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    let m
    if ((m = /^\[\[?([\w.-]+)\]\]?$/.exec(s))) section = m[1]
    else if ((m = /^([\w.-]+)\s*=\s*(?:(["'])(.*?)\2|([^\s#]+))/.exec(s))) out[section ? `${section}.${m[1]}` : m[1]] = m[3] ?? m[4]
  }
  return out
}

function parseJson(text) {
  // VS Code themes are JSONC: comments and trailing commas are allowed.
  const clean = text
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '')
    .replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(clean)
}

function cssBlocks(text) {
  const blocks = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(text.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    const vars = {}
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) vars[d[1]] = d[2].trim()
    blocks.push({ selector: m[1].trim(), vars, body: m[2] })
  }
  return blocks
}

const first = (obj, keys) => {
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k]
  return undefined
}

// ---------- adapters: each returns { name?, colors: {role: css colour}, extra?, notes? } ----------

function base16(text) {
  const palette = {}
  for (const m of text.matchAll(/^\s*(base[0-9A-Fa-f]{2})\s*:\s*["']?#?([0-9a-fA-F]{6})/gm)) palette[m[1].slice(0, 4) + m[1].slice(4).toUpperCase()] = `#${m[2]}`
  const name = /^\s*(?:name|scheme)\s*:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1]
  const p = k => palette[k]
  return {
    name,
    colors: { bg: p('base00'), surface: p('base01'), border: p('base02'), muted: p('base04'), text: p('base05'), accent: p('base0D'), rating: p('base0A') },
    notes: palette.base10 ? ['base24 scheme: used its base16 slots'] : [],
  }
}

function terminal(bg, fg, palette, extra = {}) {
  return {
    colors: {
      bg,
      text: fg,
      surface: extra.surface,
      border: extra.border,
      muted: palette[8] ?? palette[7],
      accent: palette[4] ?? palette[12],
      rating: palette[3] ?? palette[11],
    },
  }
}

function alacritty(text) {
  const t = parseToml(text)
  const pick = (group, name) => t[`colors.${group}.${name}`]
  const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
  const palette = [...names.map(n => pick('normal', n)), ...names.map(n => pick('bright', n))]
  return terminal(pick('primary', 'background'), pick('primary', 'foreground'), palette, { border: pick('selection', 'background') })
}

function kitty(text) {
  const kv = {}
  for (const m of text.matchAll(/^\s*([\w]+)\s+(#?[0-9a-fA-F]{6})\b/gm)) kv[m[1]] = m[2]
  const palette = Array.from({ length: 16 }, (_, i) => kv[`color${i}`])
  return terminal(kv.background, kv.foreground, palette, { border: kv.selection_background })
}

function ghostty(text) {
  const kv = {}
  const palette = []
  for (const m of text.matchAll(/^\s*([\w-]+)\s*=\s*(.+?)\s*$/gm)) {
    if (m[1] === 'palette') {
      const p = /^(\d+)\s*=\s*(#?[0-9a-fA-F]{6})/.exec(m[2])
      if (p) palette[Number(p[1])] = p[2]
    } else kv[m[1]] = m[2]
  }
  return terminal(kv.background, kv.foreground, palette, { border: kv['selection-background'] })
}

function vscode(json) {
  const c = json.colors ?? {}
  return {
    name: json.name,
    colors: {
      bg: c['editor.background'],
      surface: first(c, ['sideBar.background', 'editorWidget.background', 'panel.background']),
      text: first(c, ['editor.foreground', 'foreground']),
      muted: first(c, ['descriptionForeground', 'editorLineNumber.activeForeground', 'editorLineNumber.foreground']),
      border: first(c, ['panel.border', 'editorGroup.border', 'sideBar.border', 'contrastBorder']),
      accent: first(c, ['textLink.foreground', 'activityBarBadge.background', 'button.background', 'focusBorder']),
      rating: first(c, ['editorWarning.foreground', 'list.warningForeground']),
    },
    notes: json.type ? [`${json.type} theme`] : [],
  }
}

const VAR_NAMES = {
  bg: ['--background', '--color-base-100', '--bg', '--background-color', '--background-body', '--pico-background-color', '--color-background', '--bg-color'],
  surface: ['--card', '--color-base-200', '--surface', '--background-alt', '--pico-card-background-color', '--color-surface', '--panel'],
  text: ['--foreground', '--color-base-content', '--text', '--text-main', '--color', '--pico-color', '--fg', '--color-text', '--text-color'],
  muted: ['--muted-foreground', '--text-muted', '--muted', '--text-light', '--pico-muted-color', '--color-text-muted', '--secondary-text'],
  border: ['--border', '--color-base-300', '--border-color', '--pico-muted-border-color', '--color-border', '--line'],
  accent: ['--primary', '--color-primary', '--accent', '--links', '--link', '--pico-primary', '--color-accent', '--link-color'],
  rating: ['--color-warning', '--warning', '--chart-4', '--highlight', '--mark'],
}

function cssvars(blocks, prefer) {
  const isDark = b => /\.dark|\[data-theme=["']?\w*dark|prefers-color-scheme:\s*dark/i.test(b.selector)
  const withVars = blocks.filter(b => Object.keys(b.vars).length)
  const light = withVars.filter(b => !isDark(b))
  const dark = withVars.filter(isDark)
  const chosen = prefer === 'dark' && dark.length ? dark : light.length ? light : dark
  const vars = Object.assign({}, ...chosen.map(b => b.vars))
  const resolve = (v, depth = 0) => {
    const ref = /^var\((--[\w-]+)\)$/.exec(v ?? '')
    return ref && depth < 5 ? resolve(vars[ref[1]], depth + 1) : v
  }
  const colors = Object.fromEntries(ROLES.map(r => [r, resolve(first(vars, VAR_NAMES[r]))]))
  const extra = {}
  const radius = resolve(first(vars, ['--radius', '--radius-box', '--border-radius', '--pico-border-radius']))
  if (radius) {
    const m = /^([\d.]+)(rem|px|em)?$/.exec(radius.trim())
    if (m) extra.radius = Math.round(Math.min(32, Number(m[1]) * (m[2] === 'px' ? 1 : 16)))
  }
  const font = resolve(first(vars, ['--font-sans', '--font-family', '--pico-font-family', '--font']))
  const family = font?.split(',')[0].replace(/["']/g, '').trim()
  if (family && FONTS[family]) extra['font.body'] = family
  return {
    colors,
    extra,
    variants: dark.length && light.length ? ['light', 'dark'] : null,
    notes: dark.length && light.length ? [`used the ${prefer === 'dark' ? 'dark' : 'light'} variant`] : [],
  }
}

function designTokens(json) {
  const flat = {}
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return
    if ('$value' in node) flat[path.join('.').toLowerCase()] = node.$value
    else for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) walk(v, [...path, k])
  }
  walk(json, [])
  const resolve = (v, depth = 0) => {
    const ref = typeof v === 'string' && /^\{(.+)\}$/.exec(v)
    return ref && depth < 5 ? resolve(flat[ref[1].toLowerCase()], depth + 1) : v
  }
  const find = names => {
    for (const n of names) {
      const key = Object.keys(flat).find(k => k === n || k.endsWith(`.${n}`))
      if (key) return resolve(flat[key])
    }
  }
  const asColor = v => (typeof v === 'object' && v?.hex ? v.hex : v)
  const colors = {
    bg: find(['background', 'bg', 'canvas', 'background.default']),
    surface: find(['surface', 'card', 'panel', 'background.subtle']),
    text: find(['text', 'foreground', 'fg', 'text.default', 'on-background']),
    muted: find(['muted', 'text.muted', 'text-secondary', 'secondary-text', 'subtle']),
    border: find(['border', 'divider', 'outline', 'line']),
    accent: find(['accent', 'primary', 'brand', 'link']),
    rating: find(['warning', 'rating', 'highlight']),
  }
  for (const k of ROLES) colors[k] = asColor(colors[k])
  const extra = {}
  const radius = find(['radius', 'border-radius', 'radius.md', 'radius.default'])
  const r = typeof radius === 'object' ? radius?.value : parseFloat(radius)
  if (Number.isFinite(r)) extra.radius = Math.round(Math.min(32, r))
  return { colors, extra }
}

// ---------- detection ----------

export function detect(text) {
  const s = text.trim()
  if (/^\s*base0[0-9A-Fa-f]\s*:/m.test(s) && /base0[dD]\s*:/.test(s)) return 'base16'
  if (s.startsWith('{')) {
    let json
    try { json = parseJson(s) } catch { return null }
    if (json?.colors?.['editor.background'] || json?.tokenColors) return 'vscode'
    if (json?.tokens && Object.keys(json.tokens).some(k => k in TOKEN_SCHEMA)) return 'ryt'
    if (JSON.stringify(json).includes('"$value"')) return 'tokens'
    return null
  }
  if (/^\s*\[colors\.primary\]/m.test(s)) return 'alacritty'
  if (/^\s*palette\s*=\s*\d+=/m.test(s)) return 'ghostty'
  if (/^\s*color\d+\s+#?[0-9a-fA-F]{6}/m.test(s) || /^\s*background\s+#[0-9a-fA-F]{6}/m.test(s)) return 'kitty'
  if (s.includes('{')) {
    const blocks = cssBlocks(s)
    const elementRules = blocks.filter(b => /(^|[\s,>+~])(html|body|h[1-6]|p|a|article|blockquote|ul|li|button|input|table|header|main|nav|code|pre)\b/i.test(b.selector) && /[a-z-]+\s*:/.test(b.body))
    if (elementRules.length >= 3) return 'stylesheet'
    if (blocks.some(b => Object.keys(b.vars).length)) return 'cssvars'
    if (blocks.length) return 'stylesheet'
  }
  return null
}

// ---------- main ----------

export function importTheme(text, { prefer = 'light', name } = {}) {
  const src = String(text ?? '')
  if (!src.trim()) throw new Error('Nothing to import: paste a theme or pick one.')
  if (src.length > 400_000) throw new Error('That file is too big to be a theme (400 KB max).')
  const format = detect(src)
  if (!format) throw new Error('Couldn’t recognise this format. Supported: ' + Object.values(FORMATS).join(', ') + '.')

  if (format === 'ryt') {
    const json = parseJson(src)
    const { tokens = {}, settings, sections, css } = json
    return { format, label: FORMATS[format], name: name ?? json.name ?? 'RYT theme', layer: { tokens, settings, sections, css }, notes: [], variants: null }
  }

  let result
  let css
  const notes = []
  if (format === 'base16') result = base16(src)
  else if (format === 'alacritty') result = alacritty(src)
  else if (format === 'kitty') result = kitty(src)
  else if (format === 'ghostty') result = ghostty(src)
  else if (format === 'vscode') result = vscode(parseJson(src))
  else if (format === 'tokens') result = designTokens(parseJson(src))
  else {
    result = cssvars(cssBlocks(src), prefer)
    if (format === 'stylesheet') {
      css = src
      notes.push('switched to plain HTML so this stylesheet styles the page on its own')
    }
  }

  // Convert to hex, derive missing roles, keep everything readable.
  const c = {}
  for (const role of ROLES) c[role] = hex(result.colors?.[role])
  const found = ROLES.filter(r => c[r])
  if (format !== 'stylesheet' && (!c.bg || !c.text)) {
    throw new Error(`Found a ${FORMATS[format]}, but not its background and text colours.`)
  }
  const tokens = {}
  if (c.bg && c.text) {
    c.surface ??= mix(c.bg, c.text, 0.05)
    c.border ??= mix(c.bg, c.text, 0.14)
    c.muted ??= mix(c.text, c.bg, 0.38)
    if (contrast(c.text, c.bg) < 4.5) {
      c.text = contrast('#111111', c.bg) > contrast('#f5f5f5', c.bg) ? '#111111' : '#f5f5f5'
      notes.push('text colour was hard to read on the background, adjusted it')
    }
    if (contrast(c.muted, c.bg) < 3) {
      c.muted = mix(c.text, c.bg, 0.35)
      notes.push('secondary text was too faint, made it readable')
    }
    for (const role of ROLES) if (c[role]) tokens[ROLE_TOKEN[role]] = c[role]
  }
  Object.assign(tokens, result.extra ?? {})
  if (format === 'stylesheet') tokens.styles = 'plain'
  notes.unshift(`${found.length} of 7 colours came from the theme${found.length < 7 && c.bg ? ', the rest were derived' : ''}`)
  if (format === 'stylesheet' && !found.length) notes.shift()

  return {
    format,
    label: FORMATS[format],
    name: name ?? result.name ?? FORMATS[format],
    layer: { tokens, ...(css ? { css } : {}) },
    notes: [...notes, ...(result.notes ?? [])],
    variants: result.variants ?? null,
  }
}
