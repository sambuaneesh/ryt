// Settings: your page's design (RYT's own or one of 327 from the Hugo gallery), fine-tuning,
// profile, who can send you recommendations, and linking a fork. Changes save as you make them, with
// your page previewed live beside the design controls.

import { api } from '../backend/index.js'
import { screen } from './chrome.js'
import { TOKEN_SCHEMA, SETTING_SCHEMA, FONTS, SECTIONS, SECTION_HINTS, isValid } from '../../../packages/kit/index.js'
import { PRESETS, PRESET_ORDER, design, themeFor } from '../designs.js'
import { mountGallery } from '../gallery.js'
import { pageData, loadPage, pageDocument, mountPage } from '../page.js'
import { forkFrame, forkUrlOk } from '../fork.js'
import { SAMPLE_RECS } from '../sample.js'
import { esc, href, absolute, toast, friendly, sheet, debounce, safeImage, avatar, mark } from '../ui.js'

// The repository and its fork guide (set when published from GitHub).
const REPO = import.meta.env.RYT_REPO_URL ?? ''
const GUIDE = REPO ? `${REPO}/blob/main/FORKING.md` : ''
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const TABS = [['design', 'Look'], ['page', 'Page'], ['appearance', 'Customize'], ['profile', 'Profile'], ['inbox', 'Privacy'], ['fork', 'Advanced']]
// A design's font stack, as a person would name it: its first real family, or "System".
const fontName = stack => stack.split(',').map(f => f.trim().replace(/["']/g, '')).find(f => !/^(-apple-system|system-ui|blinkmacsystemfont|ui-[\w-]+|sans-serif|serif|monospace|segoe ui|roboto|helvetica( neue)?|arial)$/i.test(f)) ?? 'System font'

export async function show(root, ctx) {
  const { session, params, go, refresh } = ctx
  const me = session.profile
  const setting = () => me.theme ?? {}
  const full = await loadPage(api, me)
  const { recs, sent } = full
  const previewRecs = recs.length ? recs : SAMPLE_RECS
  let lists = (await api.listsOf?.(me.id).catch(() => [])) ?? []
  let asks = (await api.asksOf?.(me.id, { all: true }).catch(() => [])) ?? []
  let loaded = setting().design ? await design(setting().design) : null

  const saveTheme = async (theme, message) => {
    try {
      const updated = await api.updateProfile({ theme })
      Object.assign(me, updated)
      if (message) toast(message)
    } catch (e) {
      toast(friendly(e), { bad: true })
    }
  }

  // ---------- live preview of your own page
  // The page as it will look with these settings (s): your real lists, requests and circle.
  const previewHtml = (s = setting(), d = loaded) => pageDocument({
    data: pageData({ ...me, theme: s }, previewRecs, sent, { lists, asks: asks.filter(a => a.open), circle: full.data.circle }),
    theme: themeFor(s, d),
  })
  const drawPreview = (s, d) => {
    const frame = root.querySelector('[data-preview]')
    if (frame) mountPage(frame, previewHtml(s, d), { navigate: () => {} })
  }
  const previewPane = `<aside class="preview" aria-label="Preview of your page">
    <div class="chrome"><i></i><i></i><i></i><span>${esc(location.host)}${esc(href(`/@${me.handle}`))}${recs.length ? '' : ' · with sample recommendations'}</span></div>
    <iframe data-preview title="Your page"></iframe></aside>`

  const tabs = `<nav class="segmented" aria-label="Settings" style="margin-bottom:24px">${TABS.map(([k, label]) =>
    `<a href="${href(`/settings/${k}`)}" data-link ${params.tab === k ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`

  const layout = (inner, { withPreview = false } = {}) => {
    root.innerHTML = screen(session, 'settings', `<div class="head"><div><h1 class="title">Settings</h1></div></div>
  ${tabs}${withPreview ? `<div class="split"><div>${inner}</div>${previewPane}</div>` : `<div style="max-width:620px">${inner}</div>`}`)
    root.querySelector('.main').style.maxWidth = withPreview ? '1240px' : ''
    if (withPreview) drawPreview()
  }


  // ================================================================ design
  async function designTab() {
    const current = setting()
    const name = loaded ? loaded.name : PRESETS[current.preset]?.label ?? 'Paper'
    layout(`
  <div class="group"><div class="row"><div class="label"><span>Current look: <b>${esc(name)}</b></span>${current.fork ? '<small>Your own page code is used instead (see Advanced).</small>' : ''}</div>
    <a class="btn sm" href="${href('/settings/appearance')}" data-link>Customize</a></div></div>

  <h2 class="section">Basic looks</h2>
  <div class="designs" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${PRESET_ORDER.map(n => presetCard(n, !loaded && (current.preset ?? 'paper') === n)).join('')}</div>

  <h2 class="section">More looks <span class="faint">from the Hugo theme gallery</span></h2>
  <div data-gallery></div>`, { withPreview: true })

    await mountGallery(root.querySelector('[data-gallery]'), { current: loaded?.slug ?? null, onPick: entry => tryDesign(entry) })
    root.onclick = async e => {
      const preset = e.target.closest('[data-preset]')?.dataset.preset
      if (!preset) return
      loaded = null
      await saveTheme({ ...setting(), preset, design: null, overrides: {} }, `Look changed to ${PRESETS[preset].label}`)
      designTab()
    }
  }

  const presetCard = (n, current) => {
    const p = PRESETS[n]
    const t = themeFor({ preset: n }).tokens
    const font = FONTS[t['font.heading']]
    return `<button class="design" data-preset="${n}" aria-current="${current}">
    <span class="thumb"><span class="preset-thumb" style="background:${t['color.bg']};color:${t['color.text']}">
      <span class="aa" style="font-family:${esc(font?.stack ?? `'${t['font.heading']}', ${font?.fallback ?? 'serif'}`)}">Aa</span>
      <span class="bar1" style="background:${t['color.surface']};border-color:${t['color.border']};border-radius:${Math.min(t.radius, 8)}px"></span>
      <span class="bar2" style="background:${t['color.accent']}"></span></span></span>
    <span class="name">${esc(p.label)}</span></button>`
  }

  // Your page in a gallery design, before committing to it.
  async function tryDesign(entry) {
    const d = sheet(`<div class="sheet-head"><div><b>${esc(entry.name)}</b> <span class="faint small">on your page</span></div><button class="btn ghost sm" data-close>Close</button></div>
  <div style="position:relative;min-height:0"><div class="applying" data-wait style="position:absolute;inset:0;place-content:center">${mark()}<span>Loading…</span></div><iframe data-try title="Preview"></iframe></div>
  <div class="sheet-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-use disabled>Use this look</button></div>`, { wide: true })
    d.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => d.close() })
    const chosen = await design(entry.slug)
    if (!chosen) {
      d.querySelector('[data-wait]').innerHTML = '<span class="muted">This look could not load. Try another one.</span>'
      return
    }
    mountPage(d.querySelector('[data-try]'), previewHtml({ ...setting(), design: entry.slug, overrides: {} }, chosen), { navigate: () => {} })
    d.querySelector('[data-wait]').remove()
    const use = d.querySelector('[data-use]')
    use.disabled = false
    use.onclick = async () => {
      use.disabled = true
      loaded = chosen
      await saveTheme({ ...setting(), design: entry.slug, overrides: {} }, `Look changed to ${entry.name}`)
      d.close()
      designTab()
    }
  }

  // ================================================================ fine-tune
  async function appearanceTab() {
    const resolved = themeFor(setting(), loaded)
    const inherited = themeFor(setting(), loaded, { withOverrides: false })
    const overrides = () => setting().overrides ?? {}
    const groups = {}
    for (const [key, spec] of Object.entries(TOKEN_SCHEMA)) if (key !== 'styles') (groups[spec.group] ??= []).push([key, spec])
    const control = (key, spec, value, kind = 'tokens') => {
      const id = `${kind}:${key}`
      if (spec.type === 'color') return `<label><input type="color" value="${esc(value)}" data-k="${id}">${esc(spec.label)}</label>`
      const label = `<span class="label"><span>${esc(spec.label)}</span></span>`
      if (spec.type === 'number') return `<div class="row">${label}<span style="display:flex;align-items:center;gap:10px"><input type="range" min="${spec.min}" max="${spec.max}" step="1" value="${value}" data-k="${id}"><span class="small muted" style="min-width:52px;text-align:right" data-v="${id}">${value}${spec.unit && spec.unit !== 'items' ? ` ${spec.unit}` : ''}</span></span></div>`
      if (spec.type === 'font') {
        const fromTheme = !(value in FONTS)
        return `<div class="row">${label}<select data-k="${id}">${fromTheme ? `<option value="${esc(value)}" selected>${esc(fontName(value))} (from the design)</option>` : ''}${Object.keys(FONTS).map(f => `<option ${f === value ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>`
      }
      return `<div class="row">${label}<div class="segmented">${spec.options.map(o => `<button type="button" aria-pressed="${o === value}" data-k="${id}" data-o="${esc(o)}">${esc(spec.labels?.[o] ?? o)}</button>`).join('')}</div></div>`
    }
    const changed = Object.keys(overrides().tokens ?? {}).length + Object.keys(overrides().settings ?? {}).length
    layout(`
  <div class="group"><div class="row"><span class="label"><span>${changed ? `${changed} change${changed === 1 ? '' : 's'}` : 'No changes'}</span><small>Saved automatically</small></span>
    <button class="btn sm" data-reset ${changed ? '' : 'disabled'}>Reset</button></div></div>
  <h2 class="section">Colours</h2>
  <div class="group"><div class="swatches">${groups.Colors.map(([k, s]) => control(k, s, resolved.tokens[k])).join('')}</div></div>
  <h2 class="section">Text</h2><div class="group">${groups.Typography.slice(0, 3).map(([k, s]) => control(k, s, resolved.tokens[k])).join('')}</div>
  <details class="more-settings" style="margin-top:28px"><summary>More options</summary>
  ${[['Typography', 'More text', 3], ['Layout', 'Layout'], ['Shape', 'Shape'], ['Cards', 'Recommendations']].map(([g, label, from = 0]) => `<h2 class="section">${label}</h2><div class="group">${groups[g].slice(from).map(([k, s]) => control(k, s, resolved.tokens[k])).join('')}</div>`).join('')}
  <h2 class="section">Page</h2>
  <div class="group">${Object.entries(SETTING_SCHEMA).map(([k, s]) => control(k, s, resolved.settings[k], 'settings')).join('')}</div></details>`, { withPreview: true })

    // Only what differs from the design is stored, so a later design change still shows through.
    let pending = structuredClone(overrides())
    const persist = debounce(() => saveTheme({ ...setting(), overrides: pending }, 'Saved'), 500)
    const set = (id, raw) => {
      const [kind, key] = id.split(':')
      const spec = (kind === 'tokens' ? TOKEN_SCHEMA : SETTING_SCHEMA)[key]
      const value = spec.type === 'number' ? Number(raw) : raw
      if (!isValid(spec, value)) return
      const base = (kind === 'tokens' ? inherited.tokens : inherited.settings)[key]
      pending[kind] = { ...(pending[kind] ?? {}) }
      if (value === base) delete pending[kind][key]
      else pending[kind][key] = value
      const out = root.querySelector(`[data-v="${id}"]`)
      if (out) out.textContent = `${value}${spec.unit && spec.unit !== 'items' ? ` ${spec.unit}` : ''}`
      drawPreview({ ...setting(), overrides: pending }, loaded)
      persist()
    }
    root.oninput = e => { if (e.target.dataset.k && e.target.type !== 'select-one') set(e.target.dataset.k, e.target.value) }
    root.onchange = e => { if (e.target.dataset.k && e.target.tagName === 'SELECT') set(e.target.dataset.k, e.target.value) }
    root.onclick = async e => {
      const b = e.target.closest('button[data-k]')
      if (b) {
        b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
        return set(b.dataset.k, b.dataset.o)
      }
      if (e.target.closest('[data-reset]')) {
        await saveTheme({ ...setting(), overrides: {} }, 'Changes removed')
        appearanceTab()
      }
    }
  }

  // ================================================================ profile
  async function profileTab() {
    layout(`<form class="card pad" data-form novalidate>
  <div style="display:flex;gap:14px;align-items:center;margin-bottom:20px">${avatar(me, 'lg')}<div><b>${esc(me.name)}</b><div class="small faint">${esc(session.user?.email ?? '')}</div></div></div>
  <label class="field"><span>Name</span><input name="name" value="${esc(me.name)}" required maxlength="60"></label>
  <label class="field"><span>Your link</span><div class="prefixed"><b>${esc(location.host)}${esc(href('/'))}@</b><input name="handle" value="${esc(me.handle)}" required maxlength="24" autocomplete="off" spellcheck="false" autocapitalize="none"></div></label>
  <p class="hint" data-hint>If you change it, your old link stops working.</p>
  <label class="field"><span>About you</span><textarea name="bio" rows="3" maxlength="280">${esc(me.bio)}</textarea></label>
  <label class="field"><span>Picture <small>link to an image</small></span><input name="avatar_url" type="url" value="${esc(me.avatar_url)}" placeholder="https://…"></label>
  <button class="btn primary">Save</button>
</form>
${installed() ? '' : `<div class="group" style="margin-top:22px"><div class="row"><span class="label"><span>Install the app</span><small>${/iphone|ipad/i.test(navigator.userAgent) ? 'In Safari: tap Share, then “Add to Home Screen”.' : 'Opens like an app. On Android, also lets you share links to RYT from other apps.'}</small></span>${/iphone|ipad/i.test(navigator.userAgent) ? '' : '<button class="btn sm" data-install>Install</button>'}</div></div>`}
<div class="group" style="margin-top:22px"><div class="row"><span class="label"><span>Import recommendations</span><small>From a CSV or JSON file, like an export of the old recommend-me site.</small></span><label class="btn sm">Choose file<input type="file" accept=".csv,.json,text/csv,application/json" data-import hidden></label></div></div>
<div class="group" style="margin-top:22px"><div class="row"><span class="label"><span>Signed in with Google</span><small>${esc(session.user?.email ?? '')}</small></span><button class="btn sm" data-out>Sign out</button></div>
  <div class="row"><span class="label"><span>Delete my page</span><small>Deletes your page and your inbox. This cannot be undone.</small></span><button class="btn sm danger" data-delete>Delete</button></div></div>`)
    const form = root.querySelector('[data-form]')
    form.handle.addEventListener('input', () => { form.handle.value = form.handle.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const f = Object.fromEntries(new FormData(form))
      if (f.avatar_url && !safeImage(f.avatar_url.trim())) return toast('The picture must be an https:// link', { bad: true })
      try {
        Object.assign(me, await api.updateProfile({ name: f.name.trim(), handle: f.handle.trim(), bio: f.bio.trim(), avatar_url: f.avatar_url.trim() || null }))
        toast('Saved')
        profileTab()
      } catch (err) {
        toast(friendly(err), { bad: true })
      }
    })
    root.querySelector('[data-install]')?.addEventListener('click', async () => {
      const { install } = await import('../main.js')
      if (!install.prompt) return toast('Use your browser menu: “Install app” or “Add to Home screen”')
      install.prompt.prompt()
      const { outcome } = await install.prompt.userChoice
      install.prompt = null
      if (outcome === 'accepted') profileTab()
    })
    root.querySelector('[data-import]').addEventListener('change', async e => {
      const file = e.target.files[0]
      e.target.value = ''
      if (!file) return
      const { readRows, mapRow } = await import('../importer.js')
      let rows
      try {
        rows = readRows(await file.text()).map(mapRow).filter(Boolean)
      } catch {
        return toast('Could not read that file', { bad: true })
      }
      // Skip what's already in your inbox, so importing twice is safe.
      const have = new Set((await api.inbox()).map(r => r.title.trim().toLowerCase()))
      const fresh = rows.filter(r => !have.has(r.title.toLowerCase()))
      if (!fresh.length) return toast(rows.length ? 'Everything in that file is already in your inbox' : 'No recommendations found in that file', { bad: !rows.length })
      const tried = fresh.filter(r => r.status === 'tried' || r.status === 'already_done').length
      if (!confirm(`Import ${fresh.length} recommendation${fresh.length === 1 ? '' : 's'}${tried ? ` (${tried} already tried, shown on your page)` : ''}?`)) return
      try {
        const n = await api.addRecs(fresh)
        toast(`Imported ${n}`)
      } catch (err) {
        toast(friendly(err), { bad: true })
      }
    })
    root.querySelector('[data-delete]').onclick = async () => {
      const typed = prompt(`This cannot be undone. Type ${me.handle} to delete your page.`)
      if (typed?.trim().toLowerCase() !== me.handle) return typed == null ? undefined : toast('Did not match. Nothing was deleted.', { bad: true })
      try {
        if (!(await api.deleteProfile())) return toast('Deleting is not set up yet (database update 0002).', { bad: true })
        await api.signOut()
        await refresh()
        toast('Your page was deleted')
        go('/')
      } catch (err) {
        toast(friendly(err), { bad: true })
      }
    }
    root.querySelector('[data-out]').onclick = async () => {
      await api.signOut()
      await refresh()
      go('/')
    }
  }

  // ================================================================ inbox
  async function inboxTab() {
    const choices = [
      ['anyone', 'Anyone', 'Even people without an account.'],
      ['accounts', 'Only signed-in people', 'People need an account to recommend.'],
      ['closed', 'No one', 'Your page stays visible. New recommendations are turned off.'],
    ]
    layout(`<h2 class="section" style="margin-top:0">Who can recommend you things</h2>
  <div class="group">${choices.map(([v, label, small]) => `<label class="row" style="cursor:pointer"><span class="label"><span>${label}</span><small>${small}</small></span>
    <input type="radio" name="inbox" value="${v}" ${me.inbox === v ? 'checked' : ''} style="accent-color:var(--ink);width:18px;height:18px"></label>`).join('')}</div>`)
    root.onchange = async e => {
      if (e.target.name !== 'inbox') return
      try {
        Object.assign(me, await api.updateProfile({ inbox: e.target.value }))
        toast('Saved')
      } catch (err) {
        toast(friendly(err), { bad: true })
      }
    }
  }

  // ================================================================ fork
  async function forkTab() {
    const url = setting().fork ?? ''
    layout(`<div class="card pad">
  <p style="margin-top:0">Change anything about your page (layout, sections, animation) by using your own copy of its code.</p>
  <ol class="muted" style="padding-left:20px;line-height:1.8;margin:0 0 20px">
    <li>Fork ${GUIDE ? `<a href="${esc(REPO)}" target="_blank" rel="noopener">the project</a>` : 'the project'} on GitHub and edit <code>apps/page/</code>.</li>
    <li>In your fork: Settings → Pages → Source: <b>GitHub Actions</b>.</li>
    <li>When it finishes, paste your fork’s address below: <code>https://you.github.io/repo/</code></li>
  </ol>
  ${GUIDE ? `<p class="small" style="margin:-8px 0 20px"><a href="${esc(GUIDE)}" target="_blank" rel="noopener">Read the full guide</a></p>` : ''}
  <label class="field"><span>Address</span><input name="fork" type="url" placeholder="https://you.github.io/repo/" value="${esc(url)}" data-fork></label>
  <p class="hint">If it does not load, your page uses the normal look.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-test>Test</button><button class="btn primary" data-save>Save</button>${url ? '<button class="btn ghost danger" data-remove>Remove</button>' : ''}</div>
  <div data-result style="margin-top:16px"></div>
</div>`)
    const input = root.querySelector('[data-fork]')
    const result = root.querySelector('[data-result]')
    const test = async () => {
      const u = input.value.trim()
      if (!forkUrlOk(u)) {
        toast('Use an https:// address', { bad: true })
        return false
      }
      result.innerHTML = `<div class="preview"><div class="chrome"><i></i><i></i><i></i><span>${esc(u)}</span></div><iframe data-fork-frame title="Your fork"></iframe></div>`
      const ok = await forkFrame(result.querySelector('[data-fork-frame]'), u, {
        data: pageData(me, previewRecs, sent), theme: JSON.parse(JSON.stringify(themeFor(setting(), loaded))), navigate: () => {},
      })
      result.insertAdjacentHTML('afterbegin', `<p class="notice" style="margin-bottom:12px">${ok ? 'It works.' : 'It did not load. Check the address.'}</p>`)
      return ok
    }
    root.onclick = async e => {
      if (e.target.closest('[data-test]')) return test()
      if (e.target.closest('[data-save]')) {
        if (!(await test())) return
        await saveTheme({ ...setting(), fork: input.value.trim() }, 'Saved')
        return forkTab()
      }
      if (e.target.closest('[data-remove]')) {
        const { fork, ...rest } = setting()
        await saveTheme(rest, 'Removed')
        forkTab()
      }
    }
  }

  // Last, once every helper above exists.
  // ================================================================ page: blocks, note, lists, requests
  async function pageTab() {
    const s = setting()
    const page = s.page ?? {}
    const resolved = themeFor(s, loaded)
    const on = resolved.sections.filter(id => id !== 'hero')
    const off = Object.keys(SECTIONS).filter(id => id !== 'hero' && !on.includes(id))
    const tok = resolved.tokens
    const pills = (key, opts) => `<div class="segmented">${opts.map(([v, l]) => `<button type="button" aria-pressed="${tok[key] === v}" data-tok="${key}" data-v="${v}">${l}</button>`).join('')}</div>`
    const blockRow = (id, enabled) => `<div class="block-row${enabled ? '' : ' off'}" data-block="${id}">
    <span class="switch"><input type="checkbox" data-block-on ${enabled ? 'checked' : ''} aria-label="Show ${esc(SECTIONS[id])}"><span></span></span>
    <div class="block-main"><input class="block-name" data-block-name value="${esc(page.labels?.[id] ?? '')}" placeholder="${esc(SECTIONS[id])}" maxlength="60" aria-label="Name for ${esc(SECTIONS[id])}"><small>${esc(SECTION_HINTS[id] ?? '')}</small></div>
    <span class="block-move">${enabled ? '<button type="button" class="link" data-up aria-label="Move up">↑</button><button type="button" class="link" data-down aria-label="Move down">↓</button>' : ''}</span></div>`
    const tried = previewRecs.filter(r => ['tried', 'already_done'].includes(r.status))
    layout(`
  <h2 class="section" style="margin-top:0">Pinned note</h2>
  <label class="field"><textarea data-note maxlength="280" rows="2" placeholder="Taking food recommendations only this month!">${esc(page.note ?? '')}</textarea></label>

  <h2 class="section">Blocks <span class="faint">turn on, reorder, rename</span></h2>
  <div class="blocks" data-blocks>${on.map(id => blockRow(id, true)).join('')}${off.map(id => blockRow(id, false)).join('')}</div>

  <h2 class="section">Style</h2>
  <div class="group">
    <div class="row"><span class="label"><span>Arrangement</span></span>${pills('layout', [['list', 'List'], ['grid', 'Grid'], ['magazine', 'Magazine'], ['corkboard', 'Corkboard']])}</div>
    <div class="row"><span class="label"><span>Cards as objects</span><small>Tickets for films, receipts for food…</small></span>${pills('card.objects', [['no', 'No'], ['yes', 'Yes']])}</div>
    <div class="row"><span class="label"><span>Pictures</span></span>${pills('card.cover', [['none', 'None'], ['top', 'On top'], ['side', 'Beside']])}</div>
  </div>

  <h2 class="section">Lists <span class="faint">collections on your page</span></h2>
  <div class="group" data-lists>${lists.length ? lists.map(l => `<div class="row" data-list="${esc(l.id)}"><span class="label"><span>${esc(l.title)}</span><small>${l.items.length} thing${l.items.length === 1 ? '' : 's'}</small></span>
    <span style="display:flex;gap:12px"><button class="link" data-edit-list>Edit</button><button class="link" data-del-list>Delete</button></span></div>`).join('') : '<div class="row"><span class="label"><small>No lists yet.</small></span></div>'}</div>
  <p><button class="btn sm" data-new-list ${tried.length ? '' : 'disabled'}>New list</button></p>

  <h2 class="section">Ask me <span class="faint">ask for recommendations</span></h2>
  <form class="find-person" data-new-ask style="margin-bottom:12px"><input name="text" maxlength="200" placeholder="A thriller I can finish in one sitting?" aria-label="Your request"><button class="btn primary">Add</button></form>
  <div class="group">${asks.length ? asks.map(a => `<div class="row" data-ask="${esc(a.id)}"><span class="label"><span>“${esc(a.text)}”</span><small>${a.open ? 'Open, on your page' : 'Closed'}</small></span>
    <span style="display:flex;gap:12px"><button class="link" data-toggle-ask>${a.open ? 'Close' : 'Reopen'}</button><button class="link" data-del-ask>Delete</button></span></div>`).join('') : '<div class="row"><span class="label"><small>No requests yet.</small></span></div>'}</div>`, { withPreview: true })

    // Saves the page settings (note, labels, block order) and the quick style tokens.
    const pageSettings = () => {
      const rows = [...root.querySelectorAll('[data-block]')]
      const labels = Object.fromEntries(rows.map(r => [r.dataset.block, r.querySelector('[data-block-name]').value.trim()]).filter(([, v]) => v))
      const sections = ['hero', ...rows.filter(r => r.querySelector('[data-block-on]').checked).map(r => r.dataset.block)]
      const note = root.querySelector('[data-note]').value.trim()
      return { ...setting(), page: { ...(setting().page ?? {}), note, labels }, overrides: { ...(setting().overrides ?? {}), sections } }
    }
    const persist = debounce(async () => {
      const next = pageSettings()
      drawPreview(next, loaded)
      await saveTheme(next, 'Saved')
    }, 500)
    root.oninput = e => { if (e.target.matches('[data-note], [data-block-name]')) persist() }
    root.onchange = e => {
      const row = e.target.closest('[data-block]')
      if (row && e.target.matches('[data-block-on]')) {
        row.classList.toggle('off', !e.target.checked)
        // On: joins the end of the shown blocks. Off: goes below them.
        const box = root.querySelector('[data-blocks]')
        const firstOff = [...box.children].find(r => r !== row && r.classList.contains('off'))
        box.insertBefore(row, e.target.checked ? firstOff ?? null : null)
        row.querySelector('.block-move').innerHTML = e.target.checked ? '<button type="button" class="link" data-up aria-label="Move up">↑</button><button type="button" class="link" data-down aria-label="Move down">↓</button>' : ''
        persist()
      }
    }
    root.onclick = async e => {
      const t = e.target
      const row = t.closest('[data-block]')
      if (row && t.closest('[data-up]') && row.previousElementSibling) { row.parentElement.insertBefore(row, row.previousElementSibling); return persist() }
      if (row && t.closest('[data-down]') && row.nextElementSibling && !row.nextElementSibling.classList.contains('off')) { row.parentElement.insertBefore(row.nextElementSibling, row); return persist() }
      const tokBtn = t.closest('[data-tok]')
      if (tokBtn) {
        tokBtn.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === tokBtn)))
        const next = pageSettings()
        next.overrides = { ...next.overrides, tokens: { ...(next.overrides.tokens ?? {}), [tokBtn.dataset.tok]: tokBtn.dataset.v } }
        drawPreview(next, loaded)
        return saveTheme(next, 'Saved')
      }
      if (t.closest('[data-new-list]')) return listEditor(null)
      const listRow = t.closest('[data-list]')
      if (listRow && t.closest('[data-edit-list]')) return listEditor(lists.find(l => l.id === listRow.dataset.list))
      if (listRow && t.closest('[data-del-list]')) {
        if (!confirm('Delete this list? The recommendations in it stay.')) return
        try { await api.deleteList(listRow.dataset.list); lists = lists.filter(l => l.id !== listRow.dataset.list); toast('Deleted'); return pageTab() } catch (err) { return toast(friendly(err), { bad: true }) }
      }
      const askRow = t.closest('[data-ask]')
      if (askRow && t.closest('[data-toggle-ask]')) {
        const a = asks.find(x => x.id === askRow.dataset.ask)
        try { Object.assign(a, await api.saveAsk({ id: a.id, open: !a.open })); toast(a.open ? 'Reopened' : 'Closed'); return pageTab() } catch (err) { return toast(friendly(err), { bad: true }) }
      }
      if (askRow && t.closest('[data-del-ask]')) {
        try { await api.deleteAsk(askRow.dataset.ask); asks = asks.filter(x => x.id !== askRow.dataset.ask); toast('Deleted'); return pageTab() } catch (err) { return toast(friendly(err), { bad: true }) }
      }
    }
    root.onsubmit = async e => {
      if (!e.target.matches('[data-new-ask]')) return
      e.preventDefault()
      const text = e.target.text.value.trim()
      if (!text) return
      try { asks.unshift(await api.saveAsk({ text })); toast('Added to your page'); pageTab() } catch (err) { toast(friendly(err), { bad: true }) }
    }

    // A list: a name, a line, and which of your tried things are in it.
    function listEditor(list) {
      const chosen = new Set(list?.items ?? [])
      const d = sheet(`<form class="sheet-body" method="dialog" data-form>
  <h2 class="title" style="font-size:1.8rem;margin-bottom:18px">${list ? 'Edit list' : 'New list'}</h2>
  <label class="field"><span>Name</span><input name="title" required maxlength="80" value="${esc(list?.title)}" placeholder="Monsoon reading"></label>
  <label class="field"><span>A line about it <small>optional</small></span><input name="description" maxlength="280" value="${esc(list?.description)}"></label>
  <div class="field"><span>What’s in it</span><input class="input" type="search" placeholder="Search" data-q aria-label="Search your recommendations"></div>
  <div class="pick-list">${tried.map(r => `<label data-title="${esc(r.title.toLowerCase())}"><input type="checkbox" value="${esc(r.id)}" ${chosen.has(r.id) ? 'checked' : ''}><span>${esc(r.title)}</span><small>${esc(r.category)}${r.rating ? ` · ${r.rating}` : ''}</small></label>`).join('')}</div>
  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">Save</button></div>
</form>`)
      const form = d.querySelector('[data-form]')
      d.querySelector('[data-cancel]').onclick = () => d.close()
      d.querySelector('[data-q]').addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase()
        d.querySelectorAll('.pick-list label').forEach(l => { l.hidden = Boolean(q) && !l.dataset.title.includes(q) })
      })
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const items = [...d.querySelectorAll('.pick-list input:checked')].map(i => i.value)
        if (!items.length) return toast('Pick at least one thing', { bad: true })
        try {
          const saved = await api.saveList({ id: list?.id, title: form.title.value.trim(), description: form.description.value.trim(), items, position: list?.position ?? lists.length })
          lists = list ? lists.map(l => (l.id === saved.id ? saved : l)) : [...lists, saved]
          d.close()
          toast('Saved')
          pageTab()
        } catch (err) {
          toast(friendly(err), { bad: true })
        }
      })
    }
  }

  const views = { design: designTab, page: pageTab, appearance: appearanceTab, profile: profileTab, inbox: inboxTab, fork: forkTab }
  await views[params.tab]()
}
