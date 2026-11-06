// Generic building blocks. Every component takes normalized contract data, returns an HTML
// string, escapes all user content, and tags its markup with stable data-ryt hooks that
// themes and custom CSS can target.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ENTITIES[c])

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '')
  return m ? `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}` : ''
}

// Links to other people's pages carry data-ryt-nav: inside a sandboxed fork the frame can't
// navigate the top window itself, so the page runtime asks the platform shell to do it.
export function personLink(p) {
  if (!p) return 'someone anonymous'
  return p.profileUrl
    ? `<a href="${esc(p.profileUrl)}" data-ryt-nav>${esc(p.name)}</a>`
    : esc(p.name)
}

export function rating(value, style = 'number') {
  if (!value) return ''
  const label = `aria-label="${value} out of 10" title="${value}/10"`
  if (style === 'stars') {
    const stars = Math.round(value / 2)
    return `<span data-ryt="rating" data-style="stars" ${label}>${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span>`
  }
  if (style === 'bar') {
    return `<span data-ryt="rating" data-style="bar" ${label}><span style="width:${value * 10}%"></span><b>${value}</b></span>`
  }
  return `<span data-ryt="rating" data-style="number" ${label}><b>${value}</b>/10</span>`
}

// Cover art drawn from the title, so every recommendation gets one without uploading anything.
const hue = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 360

export function recCard(rec, theme) {
  const showPitch = theme.settings['cards.showPitch'] === 'yes' && rec.pitch
  const title = rec.url
    ? `<a href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer">${esc(rec.title)}</a>`
    : esc(rec.title)
  // The sender's or owner's linked image, over generated art (which also shows if the link breaks).
  const coverImage = rec.cover ? `;--cover:url(&quot;${esc(rec.cover)}&quot;)` : ''
  const cover = theme.tokens['card.cover'] !== 'none' ? `<div data-ryt="cover" style="--h:${hue(rec.category + rec.title)}${coverImage}" aria-hidden="true"></div>` : ''
  return `<article data-ryt="rec-card" data-status="${rec.status}" data-category="${esc(rec.category)}">
  ${cover}<div data-ryt="card-head"><span data-ryt="category">${esc(rec.category)}</span>${rating(rec.rating, theme.tokens['rating.style'])}</div>
  <h3 data-ryt="title">${title}</h3>
  ${showPitch ? `<blockquote data-ryt="pitch"><span data-ryt="label">Why:</span> ${esc(rec.pitch)}</blockquote>` : ''}
  ${rec.review ? `<p data-ryt="review"><span data-ryt="label">My review:</span> ${esc(rec.review)}</p>` : ''}
  ${rec.tags.length ? `<ul data-ryt="tags">${rec.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  <p data-ryt="credit">from ${personLink(rec.from)}${rec.date ? ` · ${shortDate(rec.date)}` : ''}</p>
</article>`
}

export function empty(text) {
  return `<p data-ryt="empty">${esc(text)}</p>`
}

// "Send me a ryt", drawn with the page's own theme (built-in designs and forks). Plain form
// controls tagged with data-ryt hooks; it posts to the platform like any form.
export function sendForm({ owner, viewer, categories, error, sent, closed, accountsOnly, values = {} }) {
  const field = (label, control, hint = '') => `<label data-ryt="field"><span>${esc(label)}${hint ? ` <small>${esc(hint)}</small>` : ''}</span>${control}</label>`
  const head = `<div data-ryt="hero"><p data-ryt="eyebrow">@${esc(owner.handle)}</p><h1>Recommend ${esc(owner.name)} something</h1>
  <p data-ryt="tagline">A film, a book, a game, a place. I will try it and share what I think.</p></div>`
  if (closed) return `${head}<p data-ryt="notice">${esc(owner.name)} is not taking recommendations now.</p>`
  if (accountsOnly && !viewer) return `${head}<p data-ryt="notice">Sign in to recommend something to ${esc(owner.name)}.</p>`
  return `${head}
${sent ? `<p data-ryt="notice" data-tone="success"><strong>Sent. Thank you!</strong></p>` : ''}
${error ? `<p data-ryt="notice" data-tone="error">${esc(error)}</p>` : ''}
<form data-ryt="send-form" method="post">
  ${field('What should I try?', `<input name="title" required maxlength="200" value="${esc(values.title)}">`)}
  ${field('Why?', `<textarea name="pitch" rows="3" maxlength="500">${esc(values.pitch)}</textarea>`, '(optional)')}
  <div data-ryt="field-row">
    ${field('Type', `<select name="category">${categories.map(c => `<option ${c === (values.category ?? 'Other') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`)}
    ${field('Link', `<input name="url" type="url" placeholder="https://" value="${esc(values.url)}">`, '(optional)')}
  </div>
  ${field('Picture', `<input name="cover" type="url" placeholder="https://" value="${esc(values.cover)}">`, '(link, optional)')}
  ${viewer ? `<p data-ryt="sending-as">Sending as <strong>@${esc(viewer.handle)}</strong></p>` : field('Your name', `<input name="fromName" required maxlength="60" value="${esc(values.fromName)}">`)}
  <label data-ryt="check"><input type="checkbox" name="showName" ${values.showName === false ? '' : 'checked'}> Show my name on this page</label>
  <button type="submit" data-ryt="button">Send recommendation</button>
</form>`
}
