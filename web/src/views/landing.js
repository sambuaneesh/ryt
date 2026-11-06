// The front page: the name, one line, one way in, and a few examples of what a page holds.

import { api } from '../backend/index.js'
import { google, href, toast, friendly, ransom, mark } from '../ui.js'
import { objectCard } from '../objects.js'

const EXAMPLES = [
  { kind: 'watch', title: 'Spirited Away', from: 'from Mom', score: 10 },
  { kind: 'read', title: 'Piranesi', from: 'from Kai', score: 9 },
  { kind: 'listen', title: 'In Rainbows', from: 'from Jo' },
  { kind: 'play', title: 'Outer Wilds', from: 'from Sam', score: 10 },
  { kind: 'eat', title: 'Biryani at Shah Ghouse', from: 'from Aneesh', score: 8 },
  { kind: 'go', title: 'Hampi at sunrise', from: 'from Mira' },
]

export async function show(root, { session, go }) {
  root.innerHTML = `<div class="landing">
  <header class="front-top"><a href="${href('/')}" data-link aria-label="Home">${mark()}</a>${session.user ? '' : '<button class="btn sm" data-signin>Sign in</button>'}</header>
  <main class="front">
    <section class="front-hero">
      <h1 style="margin:0">${ransom()}</h1>
      <p class="lede">Friends recommend things to you. You try them and share what you think.</p>
      <div class="cta">
        <button class="btn primary lg" data-signin>${google}<span>Continue with Google</span></button>
        <form class="find" data-find><label for="find">or open a page: @</label><input id="find" name="handle" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="name"></form>
      </div>
    </section>
    <section class="collage" aria-label="Examples">${EXAMPLES.map(objectCard).join('')}</section>
  </main>
  <footer class="front-foot">Recommend You This</footer>
</div>`

  root.querySelectorAll('[data-signin]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true
    try {
      await api.signIn(new URL(href('/inbox'), location.origin).href)
    } catch (e) {
      b.disabled = false
      toast(friendly(e), { bad: true })
    }
  }))
  root.querySelector('[data-find]').addEventListener('submit', e => {
    e.preventDefault()
    const handle = new FormData(e.target).get('handle').trim().replace(/^@/, '').toLowerCase()
    if (/^[a-z0-9_]{2,24}$/.test(handle)) go(`/@${handle}`)
    else toast('Use letters, numbers and _', { bad: true })
  })
}
