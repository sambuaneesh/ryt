// Someone's page (/@handle) and their "send me a ryt" form (/@handle/send), both in their
// own design, with RYT's dock floating on top.

import { api } from '../backend/index.js'
import { sendForm } from '../../../packages/kit/index.js'
import { CATEGORIES } from '../../../packages/contract/index.js'
import { loadPage, pageActions, pageDocument, mountPage } from '../page.js'
import { enhance } from '../../../apps/page/interact.js'
import { themeOf } from '../designs.js'
import { dock } from '../dock.js'
import { esc, friendly, href, wordmark } from '../ui.js'
import { forkFrame, forkUrlOk } from '../fork.js'
import { celebrate } from '../celebrate.js'
import { bindAutofill } from '../unfurl.js'

export async function show(root, { params, session, go, refresh }) {
  const profile = await api.profile(params.handle)
  if (!profile) {
    root.innerHTML = `<div class="landing"><header>${wordmark(session.profile ? '/inbox' : '/')}</header><main class="main narrow"><div class="empty">
      <span class="serif">No one’s here yet.</span>There’s no page called @${esc(params.handle)}.
      <p><a class="btn" href="${href('/')}" data-link>Go home</a></p></div></main></div>`
    return
  }
  const [{ data }, theme] = await Promise.all([loadPage(api, profile), themeOf(profile)])
  const actions = pageActions(api)
  const own = session.profile?.id === profile.id
  document.title = params.send ? `Recommend ${profile.name} something · Recommend You This` : `${profile.name}’s recommendations · Recommend You This`

  root.innerHTML = '<iframe class="page-frame" title="" data-frame></iframe>'
  const frame = root.querySelector('[data-frame]')
  frame.title = `${profile.name}’s page`
  const navigate = path => go(path)
  let askState = null

  // A linked fork draws the page itself; RYT falls back to its own renderer if it doesn't answer.
  const fork = !params.send && forkUrlOk(profile.theme?.fork) ? profile.theme.fork : null
  if (fork) {
    const ok = await forkFrame(frame, fork, { data, theme, navigate, actions })
    if (!ok) {
      root.innerHTML = '<iframe class="page-frame" data-frame></iframe>'
      return drawPage(root.querySelector('[data-frame]'))
    }
  } else if (params.send) {
    // Arriving from "Share → RYT" or "Recommend back": the link (and what we know) is filled in.
    const q = new URLSearchParams(location.search)
    const kind = q.get('kind')
    // Answering one of their requests ("Ask me").
    const ask = q.get('ask') ? await api.ask?.(q.get('ask')).catch(() => null) : null
    askState = ask?.open && ask.owner_id === profile.id ? ask : null
    drawSend(frame, { values: { url: q.get('url') ?? '', title: q.get('title') ?? '', cover: q.get('cover') ?? '', category: kind ? kind[0].toUpperCase() + kind.slice(1) : undefined } })
  } else {
    drawPage(frame)
  }

  dock(root, { session, profile, theme, own, sending: params.send, go, refresh, surprise })

  // Surprise me: something well loved on this page or by someone in its circle.
  async function surprise() {
    const handles = [profile.handle, ...data.circle.map(c => c.handle).filter(Boolean)]
    const pool = (await api.lovedOn?.(handles).catch(() => [])) ?? []
    if (!pool.length) return null
    const elsewhere = pool.filter(r => r.owner_handle !== profile.handle)
    // Mostly somewhere new, sometimes right here.
    const from = elsewhere.length && Math.random() < 0.7 ? elsewhere : pool
    const pick = from[Math.floor(Math.random() * from.length)]
    go(`/@${pick.owner_handle}#r-${pick.id}`)
    return pick
  }

  function drawPage(target) {
    mountPage(target, pageDocument({ data, theme }), {
      navigate,
      onReady: doc => enhance(doc, { data, actions, hash: decodeURIComponent(location.hash) }),
    })
  }

  function drawSend(target, state = {}) {
    const closed = profile.inbox === 'closed'
    const accountsOnly = profile.inbox === 'accounts'
    const viewer = session.profile && !own ? { handle: session.profile.handle } : null
    const body = own
      ? `<div data-ryt="hero"><h1>This is your page for recommendations</h1><p data-ryt="tagline">Share this link so people can recommend you things. To add something yourself, use your inbox.</p></div>`
      : sendForm({ owner: data.owner, viewer, categories: CATEGORIES, closed, accountsOnly, ask: askState?.text, ...state })
    mountPage(target, pageDocument({ data, theme, body, title: `Recommend ${profile.name} something` }), {
      navigate,
      onReady: doc => {
        const form = doc.querySelector('[data-ryt="send-form"]')
        if (!form) return
        // Paste a link, the rest fills in. The form's type options are "Watch", "Read"…
        bindAutofill({ link: form.url, title: form.title, kind: form.category, cover: form.cover, status: doc.querySelector('[data-ryt="autofill"]') },
          k => k[0].toUpperCase() + k.slice(1))
        form.addEventListener('submit', async e => {
          e.preventDefault()
          const f = Object.fromEntries(new FormData(form))
          const values = { title: f.title, pitch: f.pitch, category: f.category, url: f.url, cover: f.cover, fromName: f.fromName, showName: f.showName === 'on' }
          const button = form.querySelector('button[type=submit]')
          const label = button.textContent
          button.disabled = true
          button.textContent = 'Sending…'
          try {
            const fields = { title: f.title, pitch: f.pitch, category: f.category, link: f.url, cover: f.cover, fromName: f.fromName, showName: f.showName === 'on' }
            await (askState ? api.answer(askState.id, fields) : api.send(profile.handle, fields))
            askState = null
            // A clear moment: your recommendation, stamped SENT, over their page.
            celebrate(root, {
              owner: data.owner, item: { title: f.title, category: f.category }, signedIn: Boolean(session.profile),
              onAgain: () => drawSend(target, { values: { fromName: f.fromName, showName: f.showName === 'on' } }),
              onBack: () => go(`/@${profile.handle}`),
            })
          } catch (err) {
            button.disabled = false
            button.textContent = label
            drawSend(target, { error: friendly(err), values })
          }
        })
      },
    })
    target.contentWindow.scrollTo(0, 0)
  }
}
