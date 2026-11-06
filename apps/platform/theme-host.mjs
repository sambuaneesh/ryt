// Assembles a user's theme layers: base -> preset chain (via "extends") -> imported theme -> overrides.
// Presets are plain JSON read from a themes directory, which is the main repo's for built-in
// themes or a fork's bundle when the user runs their own frontend.

import fs from 'node:fs'
import path from 'node:path'
import { resolveTheme, sanitizeCss } from '../../packages/kit/index.js'

function readPreset(themesDir, name) {
  if (!/^[\w-]+$/.test(name)) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(themesDir, `${name}.json`), 'utf8'))
  } catch {
    return null
  }
}

export function listPresets(themesDir) {
  return fs.readdirSync(themesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const name = f.slice(0, -5)
      const preset = readPreset(themesDir, name)
      return preset && { name, label: preset.label ?? name, description: preset.description ?? '', extends: preset.extends ?? null }
    })
    .filter(Boolean)
}

// Follows "extends" up to the root. Missing presets and cycles produce warnings, not errors.
export function presetLayers(themesDir, name, warnings) {
  const chain = []
  const seen = new Set()
  let current = name
  while (current && chain.length < 8) {
    if (seen.has(current)) {
      warnings.push(`preset "${current}" extends itself in a loop, stopped there`)
      break
    }
    seen.add(current)
    const preset = readPreset(themesDir, current)
    if (!preset) {
      warnings.push(`preset "${current}" not found, using what was inherited so far`)
      break
    }
    chain.unshift({ ...preset, name: `preset ${current}`, kind: 'preset' })
    current = preset.extends
  }
  return chain
}

// "inherited" = everything except the user's own overrides (used by the settings form to
// store only what the user actually changed).
export function themeFor(user, { themesDir, presetName = user.theme.preset, withOverrides = true } = {}) {
  // A design measured from a Hugo theme is complete on its own: it sits on the neutral base,
  // not on whichever built-in preset was picked before (its fonts would leak through).
  if (user.theme.import?.format === 'hugo' && presetName === user.theme.preset) presetName = 'base'
  const warnings = []
  const layers = presetLayers(themesDir, presetName, warnings)
  // A theme imported from a gallery or pasted in: colours (and maybe a stylesheet) on top of the preset.
  const imported = user.theme.import
  if (imported?.layer) {
    const { css, warnings: cssWarnings } = sanitizeCss(imported.layer.css ?? '')
    warnings.push(...cssWarnings.map(w => `imported theme: ${w}`))
    layers.push({ ...imported.layer, css, name: `imported ${imported.name}`, kind: 'preset' })
  }
  if (withOverrides) {
    const o = user.theme.overrides ?? {}
    const { css, warnings: cssWarnings } = sanitizeCss(o.css ?? '')
    warnings.push(...cssWarnings.map(w => `your CSS: ${w}`))
    layers.push({ ...o, css, name: 'your overrides', kind: 'user' })
  }
  const theme = resolveTheme(layers)
  theme.warnings.unshift(...warnings)
  return theme
}
