// Custom CSS runs on the platform's own origin (built-in themes), so it may only pull external
// resources from an allowlist: no tracking pixels, no remote stylesheets.

const ALLOWED = ['data:image/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/', '/assets/fonts/']
// allow: extra URL prefixes the host serves itself (e.g. the web app's design assets).
export function sanitizeCss(input, { allow = [] } = {}) {
  const allowed = href => [...ALLOWED, ...allow].some(prefix => href.startsWith(prefix))
  const warnings = []
  const block = (what, replacement = '') => {
    warnings.push(what)
    return replacement
  }
  let css = String(input ?? '')
  if (css.length > 20000) css = block('custom CSS truncated to 20 KB', css.slice(0, 20000))
  css = css.replace(/<\/?\s*style/gi, () => block('removed a <style> tag'))
  css = css.replace(/@import\s+(?:url\(\s*)?(["']?)([^"')\s]*)\1\s*\)?[^;]*;?/gi, (m, _q, href) =>
    allowed(href) ? m : block(`blocked @import ${href.slice(0, 60)}`))
  css = css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, href) =>
    allowed(href) ? m : block(`blocked url(${href.slice(0, 60)})`, 'none'))
  css = css.replace(/expression\s*\(|-moz-binding|behavior\s*:/gi, m => block(`removed ${m}`))
  return { css, warnings }
}
