// First visit after signing in with Google. Two steps:
//   1. your name and link (creates the page)
//   2. how your page looks (optional; skipping keeps the default)

import { api } from '../backend/index.js'
import { wordmark, esc, toast, friendly, debounce, href } from '../ui.js'
import { DEFAULT_PRESET, design, themeFor } from '../designs.js'
import { pageData, pageDocument, mountPage } from '../page.js'
import { SAMPLE_RECS } from '../sample.js'
import { mountGallery } from '../gallery.js'

// A few looks with real character, shown live; the full gallery is below them.
const LOOKS = [
  { id: 'paper', preset: 'paper', name: 'Paper' },
  { id: 'midnight', preset: 'midnight', name: 'Midnight' },
  { id: 'hugo-theme-terminal', design: 'hugo-theme-terminal', name: 'Terminal' },
  { id: 'ananke', design: 'ananke', name: 'Ananke' },
  { id: 'hugo-papermod', design: 'hugo-papermod', name: 'PaperMod' },
  { id: 'hugo-theme-gruvbox', design: 'hugo-theme-gruvbox', name: 'Gruvbox' },
  { id: 'retro-pixel', preset: 'retro-pixel', name: 'Retro pixel' },
  { id: 'hugo-theme-stack', design: 'hugo-theme-stack', name: 'Stack' },
  { id: 'hugo-theme-reimu', design: 'hugo-theme-reimu', name: 'Reimu' },
  { id: 'hugo-coder', design: 'hugo-coder', name: 'Coder' },
  { id: 'blowfish', design: 'blowfish', name: 'Blowfish' },
  { id: 'risotto', design: 'risotto', name: 'Risotto' },
]

const suggestHandle = (name, email) => (String(name || email.split('@')[0] || '')
  .toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 24) || 'me')

export async function show(root, { session, go, refresh }) {
  const g = api.googleProfile(session.user)
  const state = { profile: session.profile, look: 'paper' }

  const frame = (step, inner, right) => {
    root.innerHTML = `<div class="onb">
  <header class="onb-top">${wordmark('/')}<span class="onb-count">Step ${step} of 2</span>${right}</header>
  <main class="onb-body">${inner}</main>
</div>`
    window.scrollTo(0, 0)
  }
  const finish = async message => {
    await refresh()
    toast(message)
    go('/inbox')
  }

  // ---------------------------------------------------------------- 1. name and link
  function step1() {
    const handle = state.profile?.handle ?? suggestHandle((g.name || '').split(' ')[0], g.email)
    frame(1, `<div class="onb-narrow">
  <h1 class="title">Create your page</h1>
  <form data-form novalidate>
    <label class="field"><span>Your name</span><input name="name" value="${esc(state.profile?.name ?? g.name)}" required maxlength="60" autocomplete="name"></label>
    <label class="field"><span>Your link</span>
      <div class="prefixed"><b>${esc(location.host)}${esc(href('/'))}@</b><input name="handle" value="${esc(handle)}" required maxlength="24" autocomplete="off" spellcheck="false" autocapitalize="none"></div></label>
    <p class="hint" data-hint>Letters, numbers and _</p>
    <button class="btn primary lg onb-go">Continue</button>
  </form></div>`, '<button class="btn ghost sm" data-out>Sign out</button>')
    root.querySelector('[data-out]').onclick = async () => { await api.signOut(); await refresh(); go('/') }
    const form = root.querySelector('[data-form]')
    const hint = root.querySelector('[data-hint]')
    const check = debounce(async () => {
      const v = form.handle.value
      if (!/^[a-z0-9_]{2,24}$/.test(v)) return Object.assign(hint, { textContent: '2 to 24 letters, numbers or _', className: 'hint bad' })
      const taken = await api.handleTaken(v).catch(() => false)
      Object.assign(hint, taken ? { textContent: 'This link is taken', className: 'hint bad' } : { textContent: 'This link is free', className: 'hint good' })
    }, 250)
    form.handle.addEventListener('input', () => { form.handle.value = form.handle.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); check() })
    check()
    form.name.focus()
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const name = form.name.value.trim() || g.name || form.handle.value
      const button = form.querySelector('button')
      button.disabled = true
      try {
        state.profile = state.profile
          ? await api.updateProfile({ name, handle: form.handle.value.trim() })
          : await api.createProfile({ handle: form.handle.value.trim(), name, bio: '', avatar_url: /^https:\/\//.test(g.avatar_url ?? '') ? g.avatar_url : null, theme: { preset: DEFAULT_PRESET } })
        session.profile = state.profile
        step2()
      } catch (err) {
        button.disabled = false
        toast(friendly(err), { bad: true })
      }
    })
  }

  // ---------------------------------------------------------------- 2. look
  async function step2() {
    frame(2, `<div class="onb-wide">
  <h1 class="title">Choose a look</h1>
  <p class="lede" style="margin:-12px 0 26px">This is your page. You can change it later.</p>
  <div class="looks" role="radiogroup" aria-label="Looks">${LOOKS.map(l => `<button type="button" class="look" role="radio" aria-checked="${state.look === l.id}" data-look="${l.id}">
    <span class="look-frame"><iframe tabindex="-1" aria-hidden="true" data-mini="${l.id}"></iframe></span><span class="look-name">${esc(l.name)}</span></button>`).join('')}</div>
  <h2 class="section">More looks</h2>
  <div data-gallery></div>
  <div class="onb-sticky"><button type="button" class="btn" data-skip>Skip</button><button class="btn primary onb-go" data-go>Use <span data-chosen></span></button></div>
</div>`, '<button class="btn ghost sm" data-back>Back</button>')
    root.querySelector('[data-back]').onclick = step1
    root.querySelector('[data-skip]').onclick = () => finish('Your page is ready')

    const data = pageData(state.profile, SAMPLE_RECS, [])
    let gallery = null
    const lookOf = id => LOOKS.find(l => l.id === id) ?? { id, design: id, name: gallery?.all.find(d => d.slug === id)?.name ?? id }
    const select = id => {
      state.look = id
      root.querySelectorAll('[data-look]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.look === id)))
      gallery?.select(LOOKS.some(l => l.id === id) ? null : id)
      root.querySelector('[data-chosen]').textContent = lookOf(id).name
    }
    root.querySelector('.looks').addEventListener('click', e => { const b = e.target.closest('[data-look]'); if (b) select(b.dataset.look) })
    gallery = await mountGallery(root.querySelector('[data-gallery]'), {
      current: null,
      pageSize: 120,
      compact: true,
      // A gallery pick shows your page in that look, live, in place of its screenshot.
      onPick: async (entry, card) => {
        select(entry.slug)
        const thumb = card.querySelector('.thumb')
        if (thumb.querySelector('iframe')) return
        thumb.classList.add('look-frame')
        thumb.style.setProperty('--s', String(thumb.clientWidth / 1100))
        thumb.innerHTML = '<iframe tabindex="-1" aria-hidden="true"></iframe>'
        const loaded = await design(entry.slug)
        if (loaded) mountPage(thumb.querySelector('iframe'), pageDocument({ data, theme: themeFor({}, loaded) }))
      },
    })
    select(state.look)

    const fit = () => root.querySelectorAll('.look-frame').forEach(f => { f.style.setProperty('--s', String(f.clientWidth / 1100)) })
    new ResizeObserver(fit).observe(root.querySelector('.looks'))
    fit()
    await Promise.all(LOOKS.map(async l => {
      const loaded = l.design ? await design(l.design) : null
      const iframe = root.querySelector(`[data-mini="${l.id}"]`)
      if (iframe) mountPage(iframe, pageDocument({ data, theme: themeFor(l.design ? {} : { preset: l.preset }, loaded) }))
    }))

    root.querySelector('[data-go]').addEventListener('click', async e => {
      const l = lookOf(state.look)
      e.target.disabled = true
      try {
        state.profile = await api.updateProfile({ theme: l.design ? { design: l.design, overrides: {} } : { preset: l.preset, overrides: {} } })
        session.profile = state.profile
        finish('Your page is ready')
      } catch (err) {
        e.target.disabled = false
        toast(friendly(err), { bad: true })
      }
    })
  }

  step1()
}
