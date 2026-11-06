import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, themeStyles } from './theme.js'
import { sanitizeCss } from './css.js'

const GOOGLE = '@import url("https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap");'

test('imports with ";" inside the URL are hoisted whole (regression: broke every theme variable)', () => {
  const out = themeStyles(resolveTheme([{ name: 'imported', kind: 'preset', css: `${GOOGLE}\n.x { color: red }` }]))
  assert.ok(out.startsWith(GOOGLE))
  assert.ok(!/@layer theme[\s\S]*display=swap/.test(out))
  assert.equal(sanitizeCss(GOOGLE).css, GOOGLE)
})

test('theme font stacks are tokens; unsafe ones fall back', () => {
  const t = resolveTheme([{ name: 'm', tokens: { 'font.body': 'Lato, "Segoe UI", sans-serif', 'font.heading': 'x;}body{display:none' } }])
  assert.equal(t.tokens['font.body'], 'Lato, "Segoe UI", sans-serif')
  assert.equal(t.tokens['font.heading'], 'system-ui')
})

test('theme text can never close the <style> element it is put in', () => {
  const theme = resolveTheme([{ name: 'evil', fontFaces: '@font-face{}</style><script>alert(1)</script>', css: 'a{}</ style><img src=x onerror=alert(1)>' }])
  const out = themeStyles(theme)
  assert.ok(!/<\/\s*style/i.test(out), out)
})
