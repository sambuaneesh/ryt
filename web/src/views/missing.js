import { wordmark, href } from '../ui.js'

export async function show(root, { session }) {
  root.innerHTML = `<div class="landing"><header>${wordmark(session.profile ? '/inbox' : '/')}</header>
  <main class="main narrow"><div class="empty"><span class="serif">Nothing here.</span>That page doesn’t exist, or it moved.
  <p><a class="btn" href="${href('/')}" data-link>Go home</a></p></div></main></div>`
}
