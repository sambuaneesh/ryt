// Platform-owned pages. These are never themed: sending, the inbox and settings must work
// (and look the same) no matter what anyone does to their public page.

import { esc, TOKEN_SCHEMA, SETTING_SCHEMA, SECTIONS } from '../../packages/kit/index.js'
import { CATEGORIES } from '../../packages/contract/index.js'

export const STATUSES = [
  ['new', 'New'],
  ['up_next', 'Up next'],
  ['tried', 'Tried'],
  ['already_done', 'Already there'],
  ['passed', 'Pass'],
]
const STATUS_TITLES = { '': 'Everything', new: 'New', up_next: 'Up next', tried: 'Tried', already_done: 'Already there', passed: 'Passed' }

// ---------- small pieces ----------

const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export function avatar(name, { size = '', anon = false } = {}) {
  const initial = anon ? '?' : (String(name ?? '?').replace(/^@/, '').trim()[0] ?? '?').toUpperCase()
  return `<span class="avatar ${size}${anon ? ' anon' : ''}" style="--hue:${hue(name)}" aria-hidden="true">${esc(initial)}</span>`
}

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' })
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function sender(rec, users) {
  const account = rec.fromUser && users.find(u => u.id === rec.fromUser)
  if (account) return { name: account.name, handle: account.handle, anon: false }
  return { name: rec.fromName || 'Anonymous', handle: null, anon: !rec.fromName }
}

const seg = (name, options, value, { full = false } = {}) =>
  `<div class="segmented${full ? ' full' : ''}" role="radiogroup">${options.map(([v, label]) =>
    `<label><input type="radio" name="${esc(name)}" value="${esc(v)}" ${v === value ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`

// A yes/no setting as a switch: the hidden "no" is sent when the box is unticked.
const yesNoSwitch = (name, value, label) =>
  `<input type="hidden" name="${esc(name)}" value="no"><input type="checkbox" class="switch" name="${esc(name)}" value="yes" ${value === 'yes' ? 'checked' : ''} aria-label="${esc(label)}">`

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- layout ----------

export function layout({ title, viewer, users, body, active, inboxCount = 0, path = '/', head = '' }) {
  const tabs = viewer
    ? [[`/@${viewer.handle}`, 'My page'], ['/inbox', 'Inbox', inboxCount], ['/sent', 'Sent'], ['/settings', 'Settings']]
    : []
  const next = encodeURIComponent(path)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · RYT</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/platform.css">
${head}
</head><body>
<header class="nav"><div class="nav-inner">
  <a class="logo" href="/"><span class="logo-mark"></span><span>RYT</span></a>
  ${tabs.length ? `<nav class="tabs">${tabs.map(([href, label, count]) =>
    `<a href="${href}" ${active === href ? 'aria-current="page"' : ''}>${label}${count ? `<span class="count">${count}</span>` : ''}</a>`).join('')}</nav>` : ''}
  <details class="account">
    <summary aria-label="Account">${viewer ? avatar(viewer.handle) : '<span class="signin">Sign in</span>'}</summary>
    <div class="menu">
      <p class="menu-label">Switch account <span class="secondary">· prototype</span></p>
      ${users.map(u => `<a href="/login?as=${esc(u.handle)}&next=${next}">${avatar(u.handle)} <span>${esc(u.name)} <span class="secondary">@${esc(u.handle)}</span></span>${viewer?.id === u.id ? '<span class="check">✓</span>' : ''}</a>`).join('')}
      ${viewer ? `<hr><a href="/login?as=&next=${next}">Sign out</a>` : ''}
    </div>
  </details>
</div></header>
<main class="main">${body}</main>
<div class="toast" role="status" aria-live="polite"></div>
<script src="/assets/platform.js" type="module"></script>
</body></html>`
}

// ---------- landing ----------

export function landing({ cards, viewer }) {
  return `<section class="hero">
  <p class="eyebrow">Prototype</p>
  <h1>Recommend<br>You This.</h1>
  <p>Share your <b>ryts</b>: the films, games, books and places you think someone should try. Friends send you theirs, and you tell everyone what you thought.</p>
  <div class="actions">
    ${viewer
      ? `<a class="btn" href="/@${esc(viewer.handle)}">Open my page</a><a class="btn gray" href="/inbox">Go to inbox</a>`
      : '<a class="btn" href="#people">See some pages</a>'}
  </div>
</section>

<div class="section" id="people">
  <h2 class="section-title">People</h2>
  <div class="people">
  ${cards.map(({ user, colors, custom, site, themeLabel }) => `<a class="person" href="/@${esc(user.handle)}">
    <div class="person-head">${avatar(user.handle, { size: 'md' })}<div><b>${esc(user.name)}</b><small>@${esc(user.handle)}</small></div></div>
    <p>${esc(user.bio)}</p>
    ${site
      ? `<div class="strip thumb" style="background-image:url('${esc(site.thumb ?? '')}')"><span>${esc(site.name)}</span></div>`
      : custom
      ? '<div class="strip custom">Custom frontend</div>'
      : `<div class="strip" title="${esc(themeLabel)}">${colors.map(c => `<span style="background:${esc(c)}"></span>`).join('')}</div>`}
  </a>`).join('')}
  </div>
</div>

<div class="how">
  <div><b>1</b><h3>Share your page</h3><p>Everyone gets a page at <code>/@you</code>. Put it in your bio or group chats.</p></div>
  <div><b>2</b><h3>Friends send you ryts</h3><p>A ryt is anything worth trying: a film, a game, a dish. It lands in your private inbox.</p></div>
  <div><b>3</b><h3>Try it, then rate it</h3><p>Your rating and a line about it go on your page, credited to whoever sent the ryt.</p></div>
  <div><b>4</b><h3>Make it yours</h3><p>Use any of hundreds of Hugo themes in one click, tweak it, or fork the code and link your fork.</p></div>
</div>

<details class="tour">
  <summary>Prototype tour: what to try</summary>
  <ol>
    <li><a href="/@aneesh">@aneesh</a> uses a built-in theme. <a href="/@mira">@mira</a> uses a theme, imported colours and some custom CSS. <a href="/@kai">@kai</a> runs <b>their own forked frontend</b>.</li>
    <li>While signed out, press <b>Send a ryt</b> on any page. Then switch to that person (top right) and open the Inbox.</li>
    <li>In <b>Settings → Themes</b>, pick any of 300+ Hugo themes from themes.gohugo.io. One click rebuilds your page with it, and its own options show up as switches.</li>
    <li>In <b>Settings → Appearance</b>, every change saves instantly and the preview updates.</li>
    <li>In <b>Settings → Developer</b>, link a demo fork: <code>zine</code> works, <code>broken</code> crashes and the page falls back, and <code>broken@bad-escape</code> is rejected before it goes live.</li>
  </ol>
</details>`
}

// ---------- inbox ----------

function inboxItem(r, users) {
  const s = sender(r, users)
  const meta = [
    r.source === 'manual' ? `told you in person: ${esc(s.name)}` : `from ${s.handle ? `<b>@${esc(s.handle)}</b>` : esc(s.name)}`,
    esc(r.category),
    r.showName ? '' : 'wants to stay anonymous publicly',
  ].filter(Boolean).join(' · ')
  return `<form class="item status-${r.status}" method="post" action="/inbox/${esc(r.id)}" data-autosave>
  <div class="item-head">
    ${avatar(s.handle ?? s.name, { anon: s.anon })}
    <div><div class="item-title">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${esc(r.title)} ↗</a>` : esc(r.title)}</div>
    <div class="item-meta">${meta}</div></div>
    <span class="item-date">${when(r.createdAt)}</span>
  </div>
  ${r.pitch ? `<p class="pitch">${esc(r.pitch)}</p>` : ''}
  ${seg('status', STATUSES, r.status, { full: true })}
  <div class="verdict">
    <div class="rating" role="radiogroup" aria-label="Your rating out of 10">${Array.from({ length: 10 }, (_, i) =>
      `<label><input type="radio" name="rating" value="${i + 1}" ${r.rating === i + 1 ? 'checked' : ''} aria-label="${i + 1}"><span>${i + 1}</span></label>`).join('')}</div>
    <textarea class="field" name="review" rows="2" maxlength="2000" placeholder="What did you think? This goes on your page.">${esc(r.review)}</textarea>
  </div>
  <div class="item-foot">
    <label class="visibility"><input type="checkbox" class="switch" name="visible" ${r.hidden ? '' : 'checked'}> Show on my page</label>
    <span class="spacer"></span>
    <details class="more"><summary>More</summary>
      <div class="more-body">
        <input class="field" name="note" value="${esc(r.note)}" placeholder="Private note, only you see this">
        <button class="btn danger" formaction="/inbox/${esc(r.id)}/delete" data-confirm="Delete “${esc(r.title)}”? This can't be undone.">Delete</button>
      </div>
    </details>
  </div>
  <noscript><button class="btn sm">Save</button></noscript>
</form>`
}

export function inboxPage({ recs, users, filter }) {
  const keyOf = r => (r.fromUser ? `u:${r.fromUser}` : `n:${r.fromName ?? ''}`)
  const people = new Map()
  for (const r of recs) {
    const p = people.get(keyOf(r)) ?? { key: keyOf(r), ...sender(r, users), total: 0, tried: 0 }
    p.total++
    if (r.status === 'tried') p.tried++
    people.set(p.key, p)
  }
  const shown = recs.filter(r => (!filter.status || r.status === filter.status) && (!filter.from || keyOf(r) === filter.from))
  const link = (key, value) => {
    const p = new URLSearchParams({ ...filter, [key]: value })
    for (const [k, v] of [...p]) if (!v) p.delete(k)
    return `/inbox${p.size ? `?${p}` : ''}`
  }
  const count = status => recs.filter(r => r.status === status).length
  const person = filter.from && people.get(filter.from)
  const title = person ? `From ${person.handle ? `@${person.handle}` : person.name}` : STATUS_TITLES[filter.status ?? '']

  return `<div class="split">
<aside class="sidebar">
  <div>
    <h4>Inbox</h4>
    <a href="${link('status', '')}" ${!filter.status ? 'aria-current="true"' : ''}>Everything<span class="n">${recs.length}</span></a>
    ${STATUSES.map(([k]) => `<a href="${link('status', k)}" ${filter.status === k ? 'aria-current="true"' : ''}>${STATUS_TITLES[k]}<span class="n">${count(k) || ''}</span></a>`).join('')}
  </div>
  <div>
    <h4>People</h4>
    ${filter.from ? `<a href="${link('from', '')}">All people</a>` : ''}
    ${[...people.values()].sort((a, b) => b.total - a.total).map(p =>
      `<a href="${link('from', p.key)}" ${filter.from === p.key ? 'aria-current="true"' : ''} title="${p.tried} of ${p.total} tried">${avatar(p.handle ?? p.name, { anon: p.anon })}${esc(p.handle ? `@${p.handle}` : p.name)}<span class="n">${p.tried}/${p.total}</span></a>`).join('')}
  </div>
</aside>

<div>
  <div class="page-head">
    <div><h1 class="large-title">${esc(title)}</h1>
    <p class="subtitle">${shown.length ? plural(shown.length, 'ryt') : 'Nothing here'}${person ? ` · ${person.tried} of ${person.total} tried` : ''}</p></div>
    <button class="btn tinted" type="button" data-open="add-dialog">＋ Add one yourself</button>
  </div>
  <div class="items">
    ${shown.map(r => inboxItem(r, users)).join('') || `<div class="empty"><b>All clear</b>Share your page and ryts will show up here.</div>`}
  </div>
</div>
</div>

<dialog id="add-dialog">
  <form method="post" action="/inbox/add" class="dialog-body">
    <div><h2 class="large-title" style="font-size:22px">Add a ryt</h2>
    <p class="secondary small">For ryts people gave you in person.</p></div>
    <div class="group">
      <div class="row"><input class="bare" name="title" required placeholder="What was it?" aria-label="What was it?"></div>
      <div class="row"><input class="bare" name="fromName" required placeholder="Who recommended it? e.g. Mom" aria-label="Who recommended it"></div>
    </div>
    <div class="chips">${CATEGORIES.map((c, i) => `<label><input type="radio" name="category" value="${c}" ${i === 0 ? 'checked' : ''}><span>${c}</span></label>`).join('')}</div>
    ${seg('status', STATUSES.slice(0, 4), 'new', { full: true })}
    <div class="dialog-actions"><button class="btn gray" type="button" data-close>Cancel</button><button class="btn">Add</button></div>
  </form>
</dialog>`
}

// ---------- sent ----------

export function sentPage({ recs, users }) {
  // Senders only learn the outcome once it's public, so passing on something stays private.
  const outcome = r => {
    if (r.hidden || !['tried', 'already_done'].includes(r.status)) return '<span class="pill">Delivered</span>'
    if (r.status === 'already_done') return '<span class="pill blue">Already there</span>'
    return `<span class="pill green">Tried${r.rating ? ` · ${r.rating}/10` : ''}</span>`
  }
  return `<div class="narrow">
<div class="page-head"><div><h1 class="large-title">Sent</h1>
<p class="subtitle">Every ryt you've sent, and what happened next.</p></div></div>
${recs.length ? `<div class="group">${recs.map(r => {
    const to = users.find(u => u.id === r.to)
    const verdict = r.review && !r.hidden && r.status === 'tried' ? `<q>${esc(r.review)}</q>` : ''
    return `<div class="row sent-row">${avatar(to.handle)}
    <div class="label"><b>${esc(r.title)}</b><small>to <a href="/@${esc(to.handle)}">@${esc(to.handle)}</a> · ${when(r.createdAt)}${r.showName ? '' : ' · sent anonymously'}</small>${verdict}</div>
    ${outcome(r)}</div>`
  }).join('')}</div>
<p class="section-footer">You'll see their rating once they make it public. If they pass on something, it stays “Delivered”.</p>`
    : '<div class="empty"><b>No ryts sent yet</b>Visit someone’s page and press “Send a ryt”.</div>'}
</div>`
}

// ---------- settings ----------

function tokenControl(key, spec, value) {
  const name = `tok:${key}`
  if (spec.type === 'font') {
    // Bundled fonts, plus the current theme font when it came from an imported design.
    const custom = spec.options.includes(value) ? '' : `<option value="${esc(value)}" selected>${esc(value.split(',')[0].replace(/["']/g, ''))} (from theme)</option>`
    return `<label class="row"><span class="label">${esc(spec.label)}</span>
      <select class="bare" name="${name}">${custom}${spec.options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`
  }
  if (spec.type === 'number') {
    return `<div class="row"><span class="label">${esc(spec.label)}</span>
      <input type="range" name="${name}" min="${spec.min}" max="${spec.max}" value="${esc(value)}" data-unit="${esc(spec.unit ?? '')}" aria-label="${esc(spec.label)}">
      <output>${esc(value)}${spec.unit ? ` ${esc(spec.unit)}` : ''}</output></div>`
  }
  if (spec.options.length <= 3) {
    return `<div class="row"><span class="label">${esc(spec.label)}</span>${seg(name, spec.options.map(o => [o, spec.labels?.[o] ?? cap(o)]), value)}</div>`
  }
  return `<label class="row"><span class="label">${esc(spec.label)}</span>
    <select class="bare" name="${name}">${spec.options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`
}

function appearanceTab({ viewer, presets, theme }) {
  const t = viewer.theme
  const groups = {}
  for (const [key, spec] of Object.entries(TOKEN_SCHEMA)) (groups[spec.group] ??= []).push([key, spec])
  const changed = Object.keys(t.overrides.tokens ?? {}).length
  // A gallery design replaces the presets (it renders on the plain base), so they're only
  // offered when the page uses RYT's own design.
  const presetPicker = t.import?.format === 'hugo' ? '' : `<form method="post" action="/settings/theme" data-autosave data-after="reload">
  <input type="hidden" name="scope" value="base">
  <div class="section">
    <h2 class="section-title">Theme</h2>
    <div class="themes">${presets.map(p => {
      const k = p.tokens
      return `<label class="theme-card"><input type="radio" name="preset" value="${esc(p.name)}" ${p.name === t.preset ? 'checked' : ''}>
      <div class="mock" style="background:${k['color.bg']};color:${k['color.text']}">
        <span class="mock-aa" style="font-family:${esc(p.fontStack)}">Aa</span>
        <span class="mock-card" style="background:${k['color.surface']};border-color:${k['color.border']};border-width:${Math.min(k['border.width'], 3)}px;border-radius:${Math.min(k.radius, 10)}px"></span>
        <span class="mock-line" style="background:${k['color.accent']}"></span>
      </div>
      <span class="theme-name">${esc(p.label)}</span><span class="theme-desc">${esc(p.description)}</span></label>`
    }).join('')}</div>
  </div>

</form>`

  return `${presetPicker}

<form method="post" action="/settings/theme" data-autosave>
  <input type="hidden" name="scope" value="tokens">
  <div class="section">
    <h2 class="section-title">Colours</h2>
    <div class="group"><div class="swatches">${groups.Colors.map(([key, spec]) =>
      `<label class="swatch"><input type="color" name="tok:${key}" value="${esc(theme.tokens[key])}">${esc(spec.label)}</label>`).join('')}</div></div>
  </div>
  ${['Typography', 'Layout', 'Shape', 'Cards'].map(g => `<div class="section">
    <h2 class="section-title">${g}</h2>
    <div class="group">${groups[g].map(([key, spec]) => tokenControl(key, spec, theme.tokens[key])).join('')}</div>
  </div>`).join('')}
  <noscript><button class="btn">Save</button></noscript>
</form>
<form method="post" action="/settings/theme/reset">
  <p class="section-footer" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    ${changed ? `You've changed ${plural(changed, 'setting')} from the theme.` : 'Everything follows the theme right now.'}
    ${changed ? '<button class="btn plain sm">Reset to theme</button>' : ''}
  </p>
</form>`
}

function layoutTab({ theme }) {
  const shown = theme.sections
  const all = [...shown, ...Object.keys(SECTIONS).filter(id => !shown.includes(id))]
  const s = theme.settings
  return `<form method="post" action="/settings/theme" data-autosave>
  <input type="hidden" name="scope" value="layout">
  <div class="section">
    <h2 class="section-title">Sections</h2>
    <div class="group">${all.map((id, i) => `<div class="row drag-row" data-order-row>
      <div class="order"><button type="button" data-move="up" aria-label="Move ${esc(SECTIONS[id])} up">▲</button><button type="button" data-move="down" aria-label="Move ${esc(SECTIONS[id])} down">▼</button></div>
      <span class="label">${esc(SECTIONS[id])}</span>
      <input type="hidden" name="ord:${id}" value="${i + 1}">
      <input type="checkbox" class="switch" name="sec:${id}" ${shown.includes(id) ? 'checked' : ''} aria-label="Show ${esc(SECTIONS[id])}">
    </div>`).join('')}</div>
    <p class="section-footer">Turn sections on or off, and use the arrows to change their order.</p>
  </div>
  <div class="section">
    <h2 class="section-title">Details</h2>
    <div class="group">
      <label class="row"><span class="label">${esc(SETTING_SCHEMA['hero.showStats'].label)}</span>${yesNoSwitch('set:hero.showStats', s['hero.showStats'], 'Show stats')}</label>
      <label class="row"><span class="label">${esc(SETTING_SCHEMA['cards.showPitch'].label)}<small>The line they wrote when sending the ryt.</small></span>${yesNoSwitch('set:cards.showPitch', s['cards.showPitch'], 'Show pitch')}</label>
      <div class="row"><span class="label">${esc(SETTING_SCHEMA['hallOfFame.count'].label)}</span>
        <input type="range" name="set:hallOfFame.count" min="1" max="10" value="${s['hallOfFame.count']}" data-unit="items" aria-label="Hall of fame size"><output>${s['hallOfFame.count']} items</output></div>
    </div>
  </div>
  <noscript><button class="btn">Save</button></noscript>
</form>`
}

function inboxTab({ viewer }) {
  const options = [
    ['anyone', 'Anyone', 'People without an account can send too. They just type their name.'],
    ['accounts', 'Signed-in people only', 'Fewer surprises. Every recommendation has a real account behind it.'],
    ['closed', 'Nobody, for now', 'Your page stays up, but the Send a ryt button is turned off.'],
  ]
  return `<form method="post" action="/settings/inbox" data-autosave>
  <div class="section">
    <h2 class="section-title">Who can send you ryts</h2>
    <div class="group">${options.map(([v, label, help]) => `<label class="row choice">
      <input type="radio" name="inbox" value="${v}" ${viewer.inbox === v ? 'checked' : ''}>
      <span class="label">${label}<small>${help}</small></span><span class="tick">✓</span></label>`).join('')}</div>
  </div>
  <noscript><button class="btn">Save</button></noscript>
</form>`
}

function developerTab({ viewer, theme, forks }) {
  const t = viewer.theme
  const fork = t.fork
  const live = fork.builds.find(b => b.id === fork.live)
  return `<form method="post" action="/settings/theme" data-autosave>
  <input type="hidden" name="scope" value="code">
  <div class="section">
    <h2 class="section-title">Custom CSS</h2>
    <div class="group"><div class="row stack"><textarea class="bare code" name="css" rows="7" spellcheck="false" placeholder='[data-ryt="rec-card"] { rotate: -1deg; }'>${esc(t.overrides.css ?? '')}</textarea></div></div>
    <p class="section-footer">Saves when you click outside the box. Style anything with a <code>data-ryt</code> attribute. Links to other websites are blocked.</p>
  </div>
</form>

<div class="section">
  <h2 class="section-title">Your own frontend</h2>
  <div class="group">
    <form method="post" action="/settings/mode" data-autosave>
      <label class="row"><span class="label">Use my own frontend<small>${live ? `Live build <code>${esc(live.sha)}</code> from ${esc(live.url.split('/').pop())}@${esc(live.ref)}` : 'Link a fork below first.'}</small></span>
        <input type="hidden" name="mode" value="builtin"><input type="checkbox" class="switch" name="mode" value="fork" ${t.mode === 'fork' ? 'checked' : ''} ${live ? '' : 'disabled'}></label>
    </form>
    <form method="post" action="/settings/fork">
      <label class="row"><span class="label key">Repository</span><input class="bare" style="text-align:right;flex:2" id="fork-url" name="url" value="${esc(fork.url)}" placeholder="https://github.com/you/ryt" required></label>
      <label class="row"><span class="label key">Branch</span><input class="bare" style="text-align:right;flex:1" name="ref" value="${esc(fork.ref || 'main')}" required></label>
      <div class="row"><span class="label secondary small">We copy only <code>apps/page</code> and <code>packages</code>, then test them before they go live.</span><button class="btn sm">Build</button></div>
    </form>
  </div>
  <p class="section-footer">Fork the main repo, change <code>apps/page/</code>, and link it here.
  ${forks.length ? `<br>Demo forks: ${forks.map(f => `<button class="btn plain sm" type="button" data-fill="fork-url" data-value="${esc(f.path)}">${esc(f.name)}</button> <span class="secondary">(${esc(f.branches.join(', '))})</span>`).join(' ')}` : ''}</p>
</div>

${fork.builds.length ? `<div class="section">
  <h2 class="section-title">Builds</h2>
  <div class="group">${fork.builds.map(b => `<div class="row"><details class="build label">
    <summary>${b.id === fork.live ? '<span class="pill green"><i class="dot"></i>Live</span>' : b.status === 'failed' ? '<span class="pill red">Failed</span>' : '<span class="pill">Passed</span>'}
      <span><code>${esc(b.sha ?? '–')}</code> ${esc(b.url.split('/').pop())}@${esc(b.ref)}</span>
      <span class="secondary small">${when(b.at)} ${esc(b.at.slice(11, 16))}</span></summary>
    ${b.error ? `<p class="small" style="color:var(--red);margin-bottom:8px">${esc(b.error)}</p>` : ''}
    <pre class="log">${esc(b.log.join('\n'))}</pre>
  </details>
  ${b.status === 'passed' && b.id !== fork.live ? `<form method="post" action="/settings/fork/live/${esc(b.id)}"><button class="btn tinted sm">Make live</button></form>` : ''}</div>`).join('')}</div>
  <p class="section-footer">A failed build never replaces the live one. “Make live” rolls back to an older build.</p>
</div>` : ''}

<div class="section">
  <h2 class="section-title">Theme file</h2>
  <form method="post" action="/settings/theme/raw" class="group">
    <div class="row stack"><textarea class="bare code" name="raw" rows="7" spellcheck="false">${esc(JSON.stringify(t.overrides, null, 2))}</textarea></div>
    <div class="row"><span class="label secondary small">Everything you've changed, on top of <b>${esc(t.preset)}</b>${t.import ? ` + ${esc(t.import.name)}` : ''}.</span><button class="btn sm">Save</button></div>
  </form>
  ${theme.warnings.length
    ? `<div class="group" style="margin-top:12px"><div class="row"><span class="label"><b>${plural(theme.warnings.length, 'value')} fell back</b><small>These were invalid or unknown. Your page uses the inherited value instead.</small></span></div><ul class="warnings">${theme.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`
    : '<p class="section-footer">Every value is valid. Try typing something broken; your page will keep working.</p>'}
</div>`
}

function ago(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : when(iso)
}

// One theme in the gallery. The same markup is produced by platform.js for live results.
// Without JS the card is a form: tapping it applies the theme directly.
export function themeCard(t) {
  const badge = t.inUse ? '<span class="tbadge use">✓ In use</span>'
    : t.works === true ? '<span class="tbadge ok">Works with RYT</span>'
    : t.works === false ? '<span class="tbadge no">Not compatible</span>'
    : t.kind ? `<span class="tbadge kind">${esc(t.kind)}</span>` : ''
  return `<li class="tcard${t.inUse ? ' in-use' : ''}${t.works === false || t.kind ? ' dim' : ''}">
  <form method="post" action="/settings/site/apply"><input type="hidden" name="slug" value="${esc(t.slug)}">
    <button class="tcard-btn" data-theme="${esc(t.slug)}" aria-label="${esc(t.name)}">
      <span class="tcard-img"><img src="${esc(t.thumb)}" alt="" loading="lazy" width="256" height="179"></span>${badge}
    </button>
  </form>
  <span class="tcard-name">${esc(t.name)}</span>
</li>`
}

function themesTab({ viewer, hugo }) {
  const design = viewer.theme.import?.format === 'hugo' ? viewer.theme.import : null
  const current = design
    ? `<div class="design-card">
        ${design.thumb ? `<img src="${esc(design.thumb)}" alt="" width="132" height="92">` : '<span class="design-ph"></span>'}
        <div class="design-info"><span class="eyebrow-sm">Your page’s design</span><b>${esc(design.name)}</b>
          <span class="secondary small">Its colours, fonts and shapes on RYT’s layout · applied ${ago(design.at)}</span></div>
        <div class="design-actions">
          <a class="btn" href="/settings?tab=appearance">Customize</a>
          <form method="post" action="/settings/design/clear"><button class="btn plain sm">Use RYT design</button></form>
        </div>
      </div>`
    : `<div class="design-card">
        <span class="design-ph ryt"></span>
        <div class="design-info"><span class="eyebrow-sm">Your page’s design</span><b>RYT design</b>
          <span class="secondary small">Pick a theme below to dress your page in its style, or fine-tune in <a href="/settings?tab=appearance">Appearance</a>.</span></div>
      </div>`

  const chip = (tag, label) => `<a class="chip${hugo.tag === tag ? ' on' : ''}" data-tag="${esc(tag)}" href="/settings?tab=themes${tag ? `&tag=${esc(tag)}` : ''}${hugo.q ? `&q=${esc(hugo.q)}` : ''}">${esc(label)}</a>`
  const shown = Math.min(hugo.total, (hugo.page + 1) * hugo.size)

  return `${current}
<section class="browse" id="browse">
  <div class="browse-bar">
    <form class="searchbox" method="get" action="/settings" role="search">
      <input type="hidden" name="tab" value="themes">${hugo.tag ? `<input type="hidden" name="tag" value="${esc(hugo.tag)}">` : ''}
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" name="q" value="${esc(hugo.q)}" placeholder="Search ${hugo.total || 'Hugo'} themes" aria-label="Search themes" autocomplete="off">
    </form>
    <div class="chip-row">${chip('', 'All')}${hugo.tags.map(tag => chip(tag, cap(tag))).join('')}</div>
  </div>
  ${hugo.error ? `<p class="notice">${esc(hugo.error)}</p>` : `<ul class="tgrid" id="tgrid">${hugo.items.map(themeCard).join('') || '<li class="secondary">No themes match.</li>'}</ul>`}
  <div class="more-row">
    <span class="secondary small" id="tcount">${hugo.total ? `${shown} of ${hugo.total} themes from themes.gohugo.io` : ''}</span>
    ${hugo.page < hugo.pages - 1 ? `<a class="btn gray" id="tmore" href="/settings?tab=themes&page=${hugo.page + 1}${hugo.tag ? `&tag=${esc(hugo.tag)}` : ''}${hugo.q ? `&q=${esc(hugo.q)}` : ''}">Show more</a>` : ''}
  </div>
</section>
<dialog id="theme-sheet" class="sheet theme-sheet" aria-label="Theme"></dialog>
<script type="application/json" id="gallery-state">${JSON.stringify({ q: hugo.q, tag: hugo.tag, page: hugo.page, pages: hugo.pages, total: hugo.total, handle: viewer.handle }).replace(/</g, '\\u003c')}</script>`
}

export const SETTINGS_TABS = [['themes', 'Themes'], ['appearance', 'Appearance'], ['layout', 'Layout'], ['inbox', 'Inbox'], ['developer', 'Developer']]

export function settingsPage(ctx) {
  const { viewer, tab, theme } = ctx
  const body = { themes: themesTab, appearance: appearanceTab, layout: layoutTab, inbox: inboxTab, developer: developerTab }[tab](ctx)
  const usingSite = viewer.theme.import?.format === 'hugo' && tab === 'appearance'
    ? `<p class="notice" style="margin-bottom:24px">Your page wears the <b>${esc(viewer.theme.import.name)}</b> design. Changes here fine-tune it. To use one of RYT’s own designs instead, choose “Use RYT design” in <a href="/settings?tab=themes">Themes</a>.</p>` : ''
  const warn = theme.warnings.length && tab !== 'developer'
    ? `<a class="pill orange" href="/settings?tab=developer">${plural(theme.warnings.length, 'value')} fell back</a>` : ''
  return `<div class="page-head"><div><h1 class="large-title">Settings</h1>
  <p class="subtitle">Changes save as you make them.</p></div>${warn}</div>
<div class="settings">
  <div>
    <nav class="segmented settings-nav">${SETTINGS_TABS.map(([id, label]) =>
      `<a href="/settings?tab=${id}" ${tab === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    ${usingSite}${body}
  </div>
  <aside class="preview">
    <div class="preview-frame">
      <div class="preview-bar"><span class="lights"><i></i><i></i><i></i></span><span class="url">/@${esc(viewer.handle)}</span><a href="/@${esc(viewer.handle)}" target="_blank">Open ↗</a></div>
      <iframe src="/@${esc(viewer.handle)}" title="Preview of your page"></iframe>
    </div>
  </aside>
</div>`
}
