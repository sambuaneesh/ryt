// Injected into every page of a Hugo-theme site. The site is plain static HTML; this script:
//   - tells the RYT shell the page loaded, and what the theme looks like (colours, font), so
//     the RYT dock can match it
//   - routes links: this site's pages stay in the frame, everything else goes via the shell
//   - draws the "Send me a ryt" form inside the theme (on the /send/ page), from plain form
//     controls so the theme's own styles apply; submissions go through the shell
(() => {
  if (parent === window) return
  const post = message => parent.postMessage(message, '*')
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
  post({ type: 'ryt:hello', contract: 1, kind: 'site' })

  // ---- what the theme looks like ----
  const visible = c => c && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(c)
  function themeStyle() {
    const body = getComputedStyle(document.body)
    const bg = [document.body, document.documentElement]
      .filter(Boolean).map(el => getComputedStyle(el).backgroundColor).find(visible) ?? 'rgb(255, 255, 255)'
    const link = [...document.querySelectorAll('main a[href], article a[href], nav a[href], a[href]')]
      .map(a => getComputedStyle(a).color).find(c => c && c !== body.color)
    return { bg, fg: body.color, accent: link ?? body.color, font: body.fontFamily }
  }

  // ---- the send form ----
  function sendForm(slot, ctx) {
    const field = (label, control, hint = '') => `<p class="ryt-field"><label>${label}${hint ? ` <small>${hint}</small>` : ''}<br>${control}</label></p>`
    const options = ctx.categories.map(c => `<option${c === 'Other' ? ' selected' : ''}>${esc(c)}</option>`).join('')
    if (ctx.closed) {
      slot.innerHTML = `<p><em>${esc(ctx.owner.name)} isn’t taking ryts right now.</em></p>`
      return
    }
    if (ctx.accountsOnly && !ctx.viewer) {
      slot.innerHTML = `<p><em>${esc(ctx.owner.name)} only takes ryts from people who are signed in on RYT.</em></p>`
      return
    }
    slot.innerHTML = `<style>
      .ryt-send-form { max-width: 34rem; margin: 1.5em 0; }
      .ryt-send-form .ryt-field { margin: 0 0 1em; }
      .ryt-send-form input:not([type=checkbox]), .ryt-send-form textarea, .ryt-send-form select {
        box-sizing: border-box; width: 100%; margin-top: .35em; padding: .55em .7em; font: inherit; color: inherit;
        background: color-mix(in srgb, currentColor 4%, transparent);
        border: 1px solid color-mix(in srgb, currentColor 28%, transparent); border-radius: .5em; }
      .ryt-send-form textarea { resize: vertical; min-height: 5em; }
      .ryt-send-form small { opacity: .65; }
      .ryt-send-form button { font: inherit; font-weight: 600; cursor: pointer; padding: .6em 1.3em; border: 0; border-radius: 999px;
        background: var(--ryt-accent); color: var(--ryt-on-accent); }
      .ryt-send-form button[disabled] { opacity: .55; cursor: default; }
      .ryt-send-form [role=status] { margin-left: .8em; }
    </style>
    <form class="ryt-send-form" novalidate>
      ${field('What should I try?', '<input name="title" maxlength="200" required>')}
      ${field('Why will I love it?', '<textarea name="pitch" rows="3" maxlength="500"></textarea>', '(optional)')}
      ${field('Kind of thing', `<select name="category">${options}</select>`)}
      ${field('Link', '<input name="url" type="url" placeholder="https://">', '(optional)')}
      ${ctx.viewer ? `<p class="ryt-field">Sending as <strong>@${esc(ctx.viewer.handle)}</strong></p>` : field('Your name', '<input name="fromName" maxlength="60" required>', '(so I know who to thank)')}
      <p class="ryt-field"><label><input type="checkbox" name="showName" checked> Show my name on this page</label></p>
      <p><button type="button">Send ryt</button><span role="status"></span></p>
    </form>`
    const style = themeStyle()
    const rgb = /\d+/g
    const [r, g, b] = (style.accent.match(rgb) ?? [0, 0, 0]).map(Number)
    slot.style.setProperty('--ryt-accent', style.accent)
    slot.style.setProperty('--ryt-on-accent', (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff')

    const form = slot.querySelector('form')
    const button = form.querySelector('button')
    const status = form.querySelector('[role=status]')
    const submit = () => {
      const fields = Object.fromEntries(new FormData(form))
      fields.showName = form.showName.checked
      if (!fields.title?.trim()) return form.title.focus()
      if (!ctx.viewer && !fields.fromName?.trim()) return form.fromName.focus()
      button.disabled = true
      status.textContent = 'Sending…'
      post({ type: 'ryt:send', fields })
    }
    button.addEventListener('click', submit)
    form.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault()
        submit()
      }
    })
    addEventListener('message', e => {
      if (e.source !== parent || e.data?.type !== 'ryt:send-result') return
      button.disabled = false
      if (e.data.ok) {
        form.reset()
        status.textContent = ''
        slot.insertAdjacentHTML('afterbegin', `<p class="ryt-sent"><strong>Sent. Thank you!</strong> ${esc(ctx.owner.name)} will see it in their inbox.</p>`)
        slot.querySelector('.ryt-sent').scrollIntoView({ block: 'center', behavior: 'smooth' })
      } else {
        status.textContent = String(e.data.message ?? 'Could not send')
      }
    })
  }

  addEventListener('message', e => {
    if (e.source !== parent) return
    const m = e.data ?? {}
    if (m.type === 'ryt:goto') location.href = m.path
    if (m.type === 'ryt:send-context') {
      const slot = document.getElementById('ryt-send')
      if (slot) sendForm(slot, m)
    }
  })

  const ready = () => {
    post({ type: 'ryt:ready', title: document.title, path: location.pathname })
    post({ type: 'ryt:style', ...themeStyle() })
    if (document.getElementById('ryt-send')) post({ type: 'ryt:want-send-context' })
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', ready)
  else ready()

  // Links: pages of this site stay here; RYT pages and external sites go through the shell.
  addEventListener('click', e => {
    const link = e.target.closest?.('a[href]')
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
    const url = new URL(link.href, location.href)
    if (url.origin === location.origin) return
    e.preventDefault()
    post({ type: 'ryt:navigate', url: url.href })
  }, true)
})()
