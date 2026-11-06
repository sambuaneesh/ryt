// Recommend You This, installed as an app. Network first, always: pages and data come fresh from
// the site and Supabase. The only cache is a copy of the app shell, so opening the app with no
// signal shows the app instead of the browser's error page.

const SHELL = 'ryt-shell-v1'
const scope = new URL(self.registration.scope)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.add(new Request(scope.href, { cache: 'reload' }))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.mode !== 'navigate') return
  e.respondWith(fetch(req).catch(() => caches.match(scope.href)))
})
