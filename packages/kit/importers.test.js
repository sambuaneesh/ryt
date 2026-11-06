import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importTheme, detect } from './importers.js'
import { hex, contrast } from './color.js'
import { resolveTheme } from './theme.js'

const NORD = `system: "base16"
name: "Nord"
variant: "dark"
palette:
  base00: "#2E3440"
  base01: "#3B4252"
  base02: "#434C5E"
  base03: "#4C566A"
  base04: "#D8DEE9"
  base05: "#E5E9F0"
  base0A: "#EBCB8B"
  base0D: "#81A1C1"`

// Every import must resolve into a theme with no fallback warnings.
const clean = result => assert.deepEqual(resolveTheme([{ name: 'import', kind: 'preset', ...result.layer }]).warnings, [])

test('colour parsing covers the syntaxes themes use', () => {
  assert.equal(hex('#abc'), '#aabbcc')
  assert.equal(hex('rgb(255, 0, 0)'), '#ff0000')
  assert.equal(hex('hsl(0 100% 50%)'), '#ff0000')
  assert.equal(hex('0 0% 100%'), '#ffffff')
  assert.equal(hex('oklch(1 0 0)'), '#ffffff')
  assert.equal(hex('oklch(0.628 0.2577 29.23)'), '#ff0000')
  assert.equal(hex('#11223380'), '#112233')
  assert.equal(hex('banana'), null)
})

test('base16 / tinted-theming YAML', () => {
  const r = importTheme(NORD)
  assert.equal(r.format, 'base16')
  assert.equal(r.name, 'Nord')
  assert.equal(r.layer.tokens['color.bg'], '#2e3440')
  assert.equal(r.layer.tokens['color.accent'], '#81a1c1')
  clean(r)
})

test('VS Code theme JSON with comments and trailing commas', () => {
  const r = importTheme(`{
    // Dracula-ish
    "name": "Vampire",
    "type": "dark",
    "colors": {
      "editor.background": "#282a36",
      "editor.foreground": "#f8f8f2",
      "focusBorder": "#bd93f9",
      "editorWarning.foreground": "#ffb86c",
    },
    "tokenColors": [],
  }`)
  assert.equal(r.format, 'vscode')
  assert.equal(r.name, 'Vampire')
  assert.equal(r.layer.tokens['color.accent'], '#bd93f9')
  assert.ok(r.layer.tokens['color.surface'], 'derives missing roles')
  clean(r)
})

test('shadcn v4 (oklch) picks light or dark variant, plus radius', () => {
  const css = `:root { --radius: 0.625rem; --background: oklch(1 0 0); --foreground: oklch(0.145 0 0); --primary: oklch(0.205 0 0); --border: oklch(0.922 0 0); }
.dark { --background: oklch(0.145 0 0); --foreground: oklch(0.985 0 0); --primary: oklch(0.922 0 0); }`
  const light = importTheme(css)
  assert.equal(light.format, 'cssvars')
  assert.equal(light.layer.tokens['color.bg'], '#ffffff')
  assert.equal(light.layer.tokens.radius, 10)
  assert.deepEqual(light.variants, ['light', 'dark'])
  const dark = importTheme(css, { prefer: 'dark' })
  assert.equal(dark.layer.tokens['color.bg'], '#0a0a0a')
  clean(light)
  clean(dark)
})

test('shadcn v3 bare HSL and daisyUI variables', () => {
  const v3 = importTheme(':root { --background: 0 0% 100%; --foreground: 222.2 84% 4.9%; --primary: 221.2 83.2% 53.3%; }')
  assert.equal(v3.layer.tokens['color.bg'], '#ffffff')
  const daisy = importTheme('[data-theme="cupcake"] { --color-base-100: oklch(97.788% 0.004 56.375); --color-base-content: oklch(27.807% 0.029 256.847); --color-primary: oklch(85% 0.138 181.071); --color-warning: oklch(86% 0.173 91.936); }')
  assert.equal(daisy.format, 'cssvars')
  assert.ok(daisy.layer.tokens['color.rating'])
  clean(v3)
  clean(daisy)
})

test('terminal themes: Alacritty, Kitty, Ghostty', () => {
  const alacritty = importTheme(`[colors.primary]\nbackground = "#1e1e2e"\nforeground = "#cdd6f4"\n[colors.normal]\nyellow = "#f9e2af"\nblue = "#89b4fa"`)
  assert.equal(alacritty.format, 'alacritty')
  assert.equal(alacritty.layer.tokens['color.accent'], '#89b4fa')
  const kitty = importTheme('background #1e1e2e\nforeground #cdd6f4\ncolor3 #f9e2af\ncolor4 #89b4fa\ncolor8 #585b70')
  assert.equal(kitty.format, 'kitty')
  const ghostty = importTheme('background = 1e1e2e\nforeground = cdd6f4\npalette = 3=#f9e2af\npalette = 4=#89b4fa')
  assert.equal(ghostty.format, 'ghostty')
  assert.equal(ghostty.layer.tokens['color.rating'], '#f9e2af')
  for (const r of [alacritty, kitty, ghostty]) clean(r)
})

test('W3C design tokens with aliases', () => {
  const r = importTheme(JSON.stringify({
    color: {
      neutral: { 0: { $value: '#ffffff' }, 900: { $value: '#111827' } },
      background: { $value: '{color.neutral.0}' },
      text: { $value: '{color.neutral.900}' },
      primary: { $value: '#7c3aed' },
    },
    radius: { $value: 12 },
  }))
  assert.equal(r.format, 'tokens')
  assert.equal(r.layer.tokens['color.bg'], '#ffffff')
  assert.equal(r.layer.tokens['color.accent'], '#7c3aed')
  assert.equal(r.layer.tokens.radius, 12)
  clean(r)
})

test('RYT theme files round-trip', () => {
  const r = importTheme(JSON.stringify({ name: 'Mine', tokens: { 'color.bg': '#000000', radius: 4 }, sections: ['tried'] }))
  assert.equal(r.format, 'ryt')
  assert.deepEqual(r.layer.sections, ['tried'])
})

test('classless stylesheets switch the page to plain HTML', () => {
  const r = importTheme(`:root { --background-body: #202b38; --text-main: #dbdbdb; --links: #41adff; }
body { background: var(--background-body); color: var(--text-main); }
h1, h2 { color: #fff; }
a { color: var(--links); }
blockquote { border-left: 4px solid; }`)
  assert.equal(r.format, 'stylesheet')
  assert.equal(r.layer.tokens.styles, 'plain')
  assert.ok(r.layer.css.includes('blockquote'))
  clean(r)
})

test('unreadable colours are fixed, unknown input is refused', () => {
  const r = importTheme('background #ffffff\nforeground #f0f0f0\ncolor4 #3366ff')
  assert.ok(contrast(r.layer.tokens['color.text'], r.layer.tokens['color.bg']) >= 4.5)
  assert.ok(r.notes.some(n => n.includes('hard to read')))
  assert.throws(() => importTheme('just some words'), /recognise/)
  assert.throws(() => importTheme(''), /Nothing to import/)
  assert.equal(detect('{"hello": 1}'), null)
})
