// Designs: RYT's own presets (bundled) and the gallery's measured Hugo designs (static files
// published by scripts/designs/export.mjs). A person's design setting (ryt_profiles.theme):
//
//   { preset?: 'midnight', design?: 'hugo-theme-terminal', overrides?: { tokens, settings, sections, css }, fork?: 'https://…' }
//
// themeFor() turns that into a resolved theme: preset chain -> gallery design -> overrides.

import { resolveTheme, sanitizeCss } from '../../packages/kit/index.js'
import { BASE } from './ui.js'

const presetFiles = import.meta.glob('../../apps/page/themes/*.json', { eager: true, import: 'default' })
export const PRESETS = Object.fromEntries(Object.entries(presetFiles).map(([file, p]) => [file.split('/').pop().replace('.json', ''), p]))
export const PRESET_ORDER = ['paper', 'midnight', 'terminal', 'retro-pixel'].filter(n => PRESETS[n])
export const DEFAULT_PRESET = 'paper'

const assets = () => `${location.origin}${BASE}designs/assets`
const cache = new Map()

export function catalog() {
  if (!cache.has('index')) cache.set('index', fetch(`${BASE}designs/index.json`).then(r => (r.ok ? r.json() : { designs: [] })).then(d => d.designs).catch(() => []))
  return cache.get('index')
}

// One gallery design ({ name, slug, method, layer }), or null if it can't be loaded.
export function design(slug) {
  if (!slug || !/^[\w.-]+$/.test(slug)) return Promise.resolve(null)
  if (!cache.has(slug)) {
    cache.set(slug, fetch(`${BASE}designs/${slug}.json`)
      .then(r => (r.ok ? r.text() : null))
      .then(text => (text ? JSON.parse(text.replaceAll('{{assets}}', assets())) : null))
      .catch(() => null))
  }
  return cache.get(slug)
}

function presetLayers(name, warnings) {
  const chain = []
  const seen = new Set()
  let current = name
  while (current && chain.length < 8) {
    if (seen.has(current)) break
    seen.add(current)
    const preset = PRESETS[current]
    if (!preset) {
      warnings.push(`design "${current}" not found, used the default`)
      break
    }
    chain.unshift({ ...preset, name: `design ${current}`, kind: 'preset' })
    current = preset.extends
  }
  return chain
}

// setting: the profile's theme JSON; loaded: the gallery design if one is chosen.
export function themeFor(setting = {}, loaded = null, { withOverrides = true } = {}) {
  const warnings = []
  // A gallery design is complete on its own: it sits on the neutral base, not a preset.
  const layers = presetLayers(loaded ? 'base' : PRESETS[setting.preset] ? setting.preset : DEFAULT_PRESET, warnings)
  if (loaded?.layer) {
    const { css } = sanitizeCss(loaded.layer.css ?? '', { allow: [`${assets()}/`] })
    layers.push({ ...loaded.layer, css, name: loaded.name, kind: 'preset' })
  }
  if (withOverrides && setting.overrides && typeof setting.overrides === 'object') {
    // A person's changes come from the database, which they control: only schema-checked
    // tokens/settings/sections and sanitized CSS get through. Never font faces or other raw
    // text that would land in the page's <style> unescaped.
    const { tokens, settings, sections } = setting.overrides
    const { css, warnings: cssWarnings } = sanitizeCss(typeof setting.overrides.css === 'string' ? setting.overrides.css : '')
    warnings.push(...cssWarnings.map(w => `your CSS: ${w}`))
    layers.push({ tokens, settings, sections, css, name: 'your changes', kind: 'user' })
  }
  const theme = resolveTheme(layers)
  theme.warnings.unshift(...warnings)
  return theme
}

// Resolve a profile's design, fetching the gallery design when there is one.
export async function themeOf(profile, opts) {
  const setting = profile?.theme ?? {}
  return themeFor(setting, setting.design ? await design(setting.design) : null, opts)
}
