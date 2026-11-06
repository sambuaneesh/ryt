// Every themeable knob, with its type and default. The settings UI is generated from this,
// and every value is validated against it: anything invalid falls back to the inherited value.

export const FONTS = {
  'system-ui': { stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  'Inter': { google: 'Inter:wght@400;600;800', fallback: 'system-ui, sans-serif' },
  'Space Grotesk': { google: 'Space+Grotesk:wght@400;600;700', fallback: 'system-ui, sans-serif' },
  'Fraunces': { google: 'Fraunces:opsz,wght@9..144,400;9..144,700', fallback: 'Georgia, serif' },
  'Lora': { google: 'Lora:wght@400;600;700', fallback: 'Georgia, serif' },
  'IBM Plex Mono': { google: 'IBM+Plex+Mono:wght@400;600', fallback: 'ui-monospace, monospace' },
  'JetBrains Mono': { google: 'JetBrains+Mono:wght@400;700', fallback: 'ui-monospace, monospace' },
  'Press Start 2P': { google: 'Press+Start+2P', fallback: 'ui-monospace, monospace' },
  'Pixelify Sans': { google: 'Pixelify+Sans:wght@400;600;700', fallback: 'system-ui, sans-serif' },
  'Caveat': { google: 'Caveat:wght@400;700', fallback: 'cursive' },
}

export const TOKEN_SCHEMA = {
  // "plain" drops RYT's own stylesheet so a classless stylesheet (Bear Blog, Water.css…) can style the semantic HTML alone.
  'styles': { type: 'enum', group: 'Base', label: 'Base styles', default: 'ryt', options: ['ryt', 'plain'], labels: { ryt: 'RYT', plain: 'Plain HTML' } },
  'color.bg': { type: 'color', group: 'Colors', label: 'Background', default: '#f6f4ef' },
  'color.surface': { type: 'color', group: 'Colors', label: 'Cards', default: '#ffffff' },
  'color.text': { type: 'color', group: 'Colors', label: 'Text', default: '#1d1d1f' },
  'color.muted': { type: 'color', group: 'Colors', label: 'Secondary', default: '#6b6b70' },
  'color.border': { type: 'color', group: 'Colors', label: 'Lines', default: '#e3e0d8' },
  'color.accent': { type: 'color', group: 'Colors', label: 'Accent', default: '#3b5bdb' },
  'color.rating': { type: 'color', group: 'Colors', label: 'Ratings', default: '#d97706' },
  'color.header': { type: 'color', group: 'Colors', label: 'Header bar', default: '#1d1d1f' },
  'color.headerText': { type: 'color', group: 'Colors', label: 'Header text', default: '#ffffff' },
  // A font is one of the bundled ones, or a font stack from a theme (its files come with it).
  'font.heading': { type: 'font', group: 'Typography', label: 'Headings', default: 'system-ui', options: Object.keys(FONTS) },
  'font.body': { type: 'font', group: 'Typography', label: 'Text', default: 'system-ui', options: Object.keys(FONTS) },
  'text.size': { type: 'number', group: 'Typography', label: 'Text size', unit: 'px', default: 16, min: 13, max: 21 },
  'heading.weight': { type: 'number', group: 'Typography', label: 'Heading weight', default: 700, min: 300, max: 900 },
  'heading.case': { type: 'enum', group: 'Typography', label: 'Heading case', default: 'none', options: ['none', 'uppercase'], labels: { none: 'As written', uppercase: 'Capitals' } },
  'heading.tracking': { type: 'enum', group: 'Typography', label: 'Heading spacing', default: 'normal', options: ['tight', 'normal', 'wide'] },
  'nav.case': { type: 'enum', group: 'Typography', label: 'Menu case', default: 'none', options: ['none', 'uppercase'], labels: { none: 'As written', uppercase: 'Capitals' } },
  'radius': { type: 'number', group: 'Shape', label: 'Corner radius', unit: 'px', default: 10, min: 0, max: 32 },
  'border.width': { type: 'number', group: 'Shape', label: 'Border weight', unit: 'px', default: 1, min: 0, max: 6 },
  'shadow': { type: 'enum', group: 'Shape', label: 'Shadow', default: 'soft', options: ['none', 'soft', 'hard'] },
  'page.width': { type: 'number', group: 'Layout', label: 'Page width', unit: 'px', default: 980, min: 560, max: 1400 },
  'frame': { type: 'enum', group: 'Layout', label: 'Page frame', default: 'top', options: ['top', 'sidebar'], labels: { top: 'Header on top', sidebar: 'Sidebar' } },
  'hero.style': { type: 'enum', group: 'Layout', label: 'Your profile', default: 'plain', options: ['plain', 'centered'], labels: { plain: 'Beside', centered: 'Centred' } },
  'hero.avatar': { type: 'enum', group: 'Layout', label: 'Show avatar', default: 'no', options: ['no', 'yes'], labels: { no: 'No', yes: 'Yes' } },
  'header.style': { type: 'enum', group: 'Layout', label: 'Header', default: 'plain', options: ['plain', 'underline', 'bar', 'banner'] },
  'header.align': { type: 'enum', group: 'Layout', label: 'Header alignment', default: 'left', options: ['left', 'center'] },
  'density': { type: 'enum', group: 'Cards', label: 'Spacing', default: 'cozy', options: ['compact', 'cozy', 'airy'] },
  'layout': { type: 'enum', group: 'Cards', label: 'Arrangement', default: 'list', options: ['list', 'grid'] },
  'card.style': { type: 'enum', group: 'Cards', label: 'Ryt style', default: 'card', options: ['card', 'plain'], labels: { card: 'Cards', plain: 'Plain list' } },
  'card.cover': { type: 'enum', group: 'Cards', label: 'Cover art', default: 'none', options: ['none', 'top', 'side'], labels: { none: 'None', top: 'On top', side: 'Beside' } },
  'chip.style': { type: 'enum', group: 'Cards', label: 'Category labels', default: 'outlined', options: ['filled', 'outlined', 'text'] },
  'rating.style': { type: 'enum', group: 'Cards', label: 'Ratings as', default: 'number', options: ['number', 'stars', 'bar'] },
}

export const SETTING_SCHEMA = {
  'hero.showStats': { type: 'enum', label: 'Show numbers under your name', default: 'yes', options: ['yes', 'no'] },
  'hallOfFame.count': { type: 'number', label: 'How many in Top rated', unit: 'items', default: 3, min: 1, max: 10 },
  'cards.showPitch': { type: 'enum', label: 'Show why they recommended it', default: 'yes', options: ['yes', 'no'] },
}

export const SECTIONS = {
  'hero': 'Header',
  'hall-of-fame': 'Top rated',
  'tried': 'Tried',
  'already-there': 'Already tried',
  'recommended-by-me': 'I recommended',
}
export const DEFAULT_SECTIONS = ['hero', 'hall-of-fame', 'tried', 'already-there', 'recommended-by-me']

export function isValid(spec, value) {
  switch (spec.type) {
    case 'color': return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
    case 'number': return typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max
    case 'enum': return spec.options.includes(value)
    case 'font': return typeof value === 'string' && (value in FONTS || /^[\w\s"',.-]{1,160}$/.test(value))
    default: return false
  }
}

// Form inputs arrive as strings; turn them into the type the schema expects.
export function coerce(spec, raw) {
  if (spec.type === 'number') return raw === '' ? NaN : Number(raw)
  return typeof raw === 'string' ? raw.trim() : raw
}
