// Progressive enhancement for platform pages. Everything works without it (plain form posts);
// with it, settings save as you change them and the preview refreshes in place.

// Read before anything rewrites the URL (the gallery keeps it in sync with the search).
const openCustomize = location.hash === '#customize'
const toastEl = document.querySelector('.toast')
let toastTimer
function toast(text, bad = false) {
  if (!toastEl || !text) return
  toastEl.textContent = text
  toastEl.classList.toggle('bad', bad)
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), bad ? 4200 : 1800)
}

// Flash messages arrive as ?msg=… after a redirect: show once, then clean the URL.
const url = new URL(location.href)
const flash = url.searchParams.get('msg')
if (flash) {
  toast(flash.replace(/^!/, ''), flash.startsWith('!'))
  url.searchParams.delete('msg')
  history.replaceState(null, '', url)
}

const refreshPreview = () => {
  const frame = document.querySelector('.preview iframe')
  if (frame) frame.src = frame.src
}

async function save(form) {
  const res = await fetch(form.action, {
    method: 'POST',
    headers: { 'x-requested-with': 'fetch' },
    body: new URLSearchParams(new FormData(form)),
  })
  const text = await res.text()
  if (!res.ok) return toast(text || 'Could not save', true)
  if (form.dataset.after === 'reload') return location.reload()
  toast(text || 'Saved')
  refreshPreview()
}

// <form data-autosave>: save on every change. Text fields save when you leave them.
for (const form of document.querySelectorAll('form[data-autosave]')) {
  form.addEventListener('change', () => save(form))
  form.addEventListener('submit', e => {
    if (e.submitter?.hasAttribute('formaction')) return // e.g. Delete: a real navigation
    e.preventDefault()
    save(form)
  })
}

// Sliders show their value live.
for (const range of document.querySelectorAll('input[type="range"]')) {
  const out = range.parentElement.querySelector('output')
  range.addEventListener('input', () => {
    if (out) out.textContent = `${range.value}${range.dataset.unit ? ` ${range.dataset.unit}` : ''}`
  })
}

// Reorder rows (sections) with the arrow buttons.
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-move]')
  if (!btn) return
  e.preventDefault()
  const row = btn.closest('[data-order-row]')
  const sibling = btn.dataset.move === 'up' ? row.previousElementSibling : row.nextElementSibling
  if (!sibling?.matches('[data-order-row]')) return
  btn.dataset.move === 'up' ? sibling.before(row) : sibling.after(row)
  row.parentElement.querySelectorAll('[data-order-row]').forEach((r, i) => {
    r.querySelector('input[type="hidden"][name^="ord:"]').value = i + 1
  })
  row.closest('form').dispatchEvent(new Event('change'))
  btn.focus()
})

// Dialogs and confirmations.
document.addEventListener('click', e => {
  const opener = e.target.closest('[data-open]')
  if (opener) document.getElementById(opener.dataset.open)?.showModal()
  const closer = e.target.closest('[data-close]')
  if (closer) closer.closest('dialog')?.close()
  const filler = e.target.closest('[data-fill]')
  if (filler) {
    const input = document.getElementById(filler.dataset.fill)
    input.value = filler.dataset.value
    input.focus()
  }
  const confirmBtn = e.target.closest('[data-confirm]')
  if (confirmBtn && !confirm(confirmBtn.dataset.confirm)) e.preventDefault()
})

// Close the account menu when clicking elsewhere.
document.addEventListener('click', e => {
  for (const menu of document.querySelectorAll('details.account[open]')) {
    if (!menu.contains(e.target)) menu.open = false
  }
})

// Long actions (applying a theme): show progress on the button that was pressed.
document.addEventListener('submit', e => {
  const btn = e.submitter
  if (!btn?.dataset.busy || e.defaultPrevented) return
  btn.textContent = btn.dataset.busy
  btn.disabled = true
  document.querySelectorAll('button[data-busy]').forEach(b => (b.disabled = true))
})

// ---------- Themes gallery: live search, details sheet, applying with progress ----------

const grid = document.getElementById('tgrid')
const galleryState = document.getElementById('gallery-state')
if (grid && galleryState) {
  const state = JSON.parse(galleryState.textContent)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
  const card = t => {
    const badge = t.inUse ? '<span class="tbadge use">✓ In use</span>'
      : t.works === true ? '<span class="tbadge ok">Works with RYT</span>'
      : t.works === false ? '<span class="tbadge no">Not compatible</span>'
      : t.kind ? `<span class="tbadge kind">${esc(t.kind)}</span>` : ''
    return `<li class="tcard${t.inUse ? ' in-use' : ''}${t.works === false || t.kind ? ' dim' : ''}">
      <form method="post" action="/settings/site/apply"><input type="hidden" name="slug" value="${esc(t.slug)}">
        <button class="tcard-btn" data-theme="${esc(t.slug)}" aria-label="${esc(t.name)}"><span class="tcard-img"><img src="${esc(t.thumb)}" alt="" loading="lazy" width="256" height="179"></span>${badge}</button>
      </form><span class="tcard-name">${esc(t.name)}</span></li>`
  }
  const count = document.getElementById('tcount')
  let more = document.getElementById('tmore')
  if (!more) {
    more = Object.assign(document.createElement('a'), { id: 'tmore', className: 'btn gray', textContent: 'Show more', href: '#' })
    document.querySelector('.more-row')?.append(more)
  }
  const sync = () => {
    more.hidden = state.page >= state.pages - 1
    count.textContent = state.total ? `${Math.min(state.total, (state.page + 1) * 24)} of ${state.total} themes from themes.gohugo.io` : 'No themes match'
    const qs = new URLSearchParams({ tab: 'themes', ...(state.tag && { tag: state.tag }), ...(state.q && { q: state.q }) })
    history.replaceState(null, '', `/settings?${qs}`)
  }
  let request = 0
  async function load(append = false) {
    const mine = ++request
    grid.classList.add('loading')
    const data = await (await fetch(`/settings/themes.json?${new URLSearchParams({ q: state.q, tag: state.tag, page: state.page })}`)).json()
    if (mine !== request) return
    grid.classList.remove('loading')
    Object.assign(state, { pages: data.pages, total: data.total })
    const html = data.items.map(card).join('')
    if (append) grid.insertAdjacentHTML('beforeend', html)
    else grid.innerHTML = html || '<li class="secondary">No themes match.</li>'
    sync()
  }
  const search = document.querySelector('.searchbox')
  let timer
  search.addEventListener('input', e => {
    clearTimeout(timer)
    timer = setTimeout(() => Object.assign(state, { q: e.target.value.trim(), page: 0 }) && load(), 250)
  })
  search.addEventListener('submit', e => e.preventDefault())
  document.querySelector('.chip-row').addEventListener('click', e => {
    const chip = e.target.closest('[data-tag]')
    if (!chip) return
    e.preventDefault()
    document.querySelectorAll('.chip-row .chip').forEach(c => c.classList.toggle('on', c === chip))
    Object.assign(state, { tag: chip.dataset.tag, page: 0 })
    load()
  })
  more.addEventListener('click', e => {
    e.preventDefault()
    state.page++
    load(true)
  })
  sync()

  // A card opens the theme's sheet: screenshot, description, and "Use this theme".
  const sheet = document.getElementById('theme-sheet')
  const close = `<button class="sheet-x" type="button" data-close aria-label="Close">✕</button>`
  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-theme]')
    if (!btn) return
    e.preventDefault()
    openTheme(btn.dataset.theme, btn.querySelector('img')?.src)
  })

  async function openTheme(slug, thumb) {
    sheet.innerHTML = `<div class="media">${thumb ? `<img src="${esc(thumb)}" alt="">` : ''}${close}</div>
      <div class="info"><div class="skeleton" style="height:28px;width:45%"></div><div class="skeleton" style="height:16px;width:85%"></div><div class="skeleton" style="height:42px;width:40%"></div></div>`
    sheet.showModal()
    const res = await fetch(`/settings/themes/${encodeURIComponent(slug)}.json`)
    const t = await res.json()
    if (!res.ok) {
      sheet.querySelector('.info').innerHTML = `<p>${esc(t.message ?? 'Couldn’t load this theme.')}</p>`
      return
    }
    const what = 'RYT dresses your page in its colours, fonts and shapes. Your page keeps RYT’s layout, so nothing from the demo site comes along.'
    const note = t.inUse ? '<p class="note ok">✓ Your page wears this design. Fine-tune it in Appearance.</p>'
      : t.works === true ? `<p class="note ok">✓ Works with RYT. ${what}</p>`
      : t.works === false ? `<p class="note no">RYT couldn’t read this theme’s design. ${esc(t.reason ?? '')}</p>`
      : `<p class="note">${what} The first time takes a few seconds.</p>`
    sheet.innerHTML = `<div class="media"><img src="${esc(t.screenshot ?? thumb)}" alt="Screenshot of ${esc(t.name)}">${close}</div>
      <div class="info">
        <h2>${esc(t.name)}</h2>
        ${t.description ? `<p class="secondary">${esc(t.description)}</p>` : ''}
        ${t.tags?.length ? `<div class="tags">${t.tags.slice(0, 8).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        ${note}
        <div class="actions">
          ${t.inUse ? '<button class="btn" type="button" data-close>Done</button>' : `<button class="btn" type="button" id="use-theme" ${t.works === false ? 'disabled' : ''}>Use this theme</button>
          <button class="btn gray" type="button" id="preview-theme" ${t.works === false ? 'disabled' : ''}>Preview on my page</button>`}
          ${t.demo ? `<a class="btn plain" href="${esc(t.demo)}" target="_blank" rel="noopener">View demo ↗</a>` : ''}
        </div>
      </div>`
    sheet.querySelector('#use-theme')?.addEventListener('click', () => apply(t))
    sheet.querySelector('#preview-theme')?.addEventListener('click', () => apply(t, { preview: true }))
  }

  const STEPS = [['fetch', 'Getting the theme'], ['build', 'Rendering a sample page'], ['measure', 'Measuring its design'], ['apply', 'Dressing your page']]
  async function apply(t, { preview = false } = {}) {
    sheet.classList.remove('wide')
    sheet.innerHTML = `<div class="apply">
      <div class="apply-hero"><img src="${esc(t.screenshot)}" alt=""><span class="sweep"></span></div>
      <h2>${preview ? 'Preparing a preview of' : 'Applying'} ${esc(t.name)}</h2>
      <ol class="steps">${STEPS.map(([id, label], i) => `<li data-step="${id}" class="${i === 0 ? 'active' : ''}">${label}</li>`).join('')}</ol>
      <p class="apply-detail" aria-live="polite"></p>
      <div class="progress"><span></span></div>
    </div>`
    sheet.addEventListener('cancel', e => e.preventDefault(), { once: true }) // stay open while working
    const bar = sheet.querySelector('.progress span')
    const detail = sheet.querySelector('.apply-detail')
    const show = job => {
      const last = job.steps?.at(-1)
      // Steps the sheet doesn't list (e.g. checking) keep the current one highlighted.
      const known = (job.steps ?? []).filter(s => STEPS.some(([id]) => id === s.step)).at(-1)
      const index = Math.max(0, STEPS.findIndex(([id]) => id === known?.step))
      sheet.querySelectorAll('.steps li').forEach((li, i) => li.className = i < index ? 'done' : i === index ? 'active' : '')
      const attempts = job.steps?.filter(s => s.step === 'build').length ?? 0
      bar.style.width = `${Math.min(92, 12 + index * 22 + Math.min(attempts, 8) * 2)}%`
      if (last?.text && last.text !== STEPS[index]?.[1]) detail.textContent = last.text
    }
    const res = await fetch('/settings/site/apply', { method: 'POST', headers: { 'x-requested-with': 'fetch' }, body: new URLSearchParams({ slug: t.slug, preview: preview ? '1' : '' }) })
    if (!res.ok) return failed(t, { message: await res.text() })
    const { job: id } = await res.json()
    for (;;) {
      await new Promise(r => setTimeout(r, 350))
      const job = await (await fetch(`/settings/site/jobs/${id}`)).json()
      show(job)
      if (job.status === 'done') return preview ? previewed(t) : succeeded(t, job)
      if (job.status === 'failed' || job.status === 'missing') return failed(t, job)
    }
  }

  // Your own page in the theme's design, before deciding.
  function previewed(t) {
    sheet.classList.add('wide')
    sheet.innerHTML = `<div class="sheet-head"><div><h2>${esc(t.name)} on your page</h2>
        <p class="secondary small">Your ryts and RYT’s layout, in ${esc(t.name)}’s colours, type and details. Nothing changes until you use it.</p></div>
        <div class="actions" style="display:flex;gap:8px;flex:none"><button class="btn gray" type="button" id="preview-back">Back</button><button class="btn" type="button" id="preview-use">Use this design</button></div></div>
      <iframe class="design-preview" src="/@${esc(state.handle)}?design=${encodeURIComponent(t.slug)}" title="Preview"></iframe>`
    sheet.querySelector('#preview-back').addEventListener('click', () => openTheme(t.slug, t.screenshot))
    sheet.querySelector('#preview-use').addEventListener('click', () => apply(t))
  }
  sheet.addEventListener('close', () => sheet.classList.remove('wide'))

  function succeeded(t, job) {
    sheet.querySelectorAll('.steps li').forEach(li => li.className = 'done')
    sheet.querySelector('.progress span').style.width = '100%'
    setTimeout(() => {
      sheet.innerHTML = `<div class="apply">
        <div class="result-icon ok"><svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h2>Your page now wears ${esc(t.name)}</h2>
        <p class="why">Done in ${(job.ms / 1000).toFixed(1)} s. Same RYT page, in ${esc(t.name)}’s colours, fonts and shapes.</p>
        <div class="actions">
          <a class="btn gray" href="/settings?tab=appearance">Fine-tune</a>
          <a class="btn gray" href="/@${esc(state.handle)}" target="_blank">View my page ↗</a>
          <button class="btn" type="button" data-close>Done</button>
        </div></div>`
      sheet.addEventListener('close', () => location.reload(), { once: true })
    }, 450)
  }

  function failed(t, job) {
    sheet.innerHTML = `<div class="apply">
      <div class="result-icon no">!</div>
      <h2>Couldn’t read ${esc(t.name)}’s design</h2>
      <p class="why">${esc(job.message ?? 'Something went wrong.')} Your page hasn’t changed.</p>
      ${job.detail ? `<details><summary>Technical details</summary><p>${esc(job.detail)}</p></details>` : ''}
      <div class="actions"><button class="btn" type="button" data-close>Choose another theme</button></div>
    </div>`
    sheet.addEventListener('close', () => load(), { once: true })
  }
}

// Open the customize sheet from a link (#customize), e.g. after applying a theme.
if (openCustomize) document.getElementById('customize')?.showModal()
