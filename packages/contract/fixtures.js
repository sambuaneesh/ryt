// Edge-case datasets every page frontend must survive. Used by the conformance check.

export const XSS = '<img src=x onerror=alert(1)>'

const owner = { handle: 'fixture', name: 'Fixture Person', bio: 'I try things.' }
const pal = { name: 'Pal', handle: 'pal', profileUrl: 'http://example.test/@pal' }

const rec = (i, extra = {}) => ({
  id: `r${i}`,
  title: `Thing ${i}`,
  category: 'Play',
  status: 'tried',
  rating: (i % 10) + 1,
  review: 'Pretty good.',
  from: pal,
  date: '2026-01-01',
  ...extra,
})

export function fixtures() {
  return [
    { name: 'empty', data: { owner } },
    { name: 'one', data: { owner, recs: [rec(1)] } },
    {
      name: 'many',
      budgetMs: 1500,
      data: {
        owner,
        recs: Array.from({ length: 2000 }, (_, i) => rec(i, { status: i % 3 ? 'tried' : 'already_done' })),
        recommendedByMe: Array.from({ length: 300 }, (_, i) => ({ title: `Sent ${i}`, to: pal, rating: 7 })),
      },
    },
    {
      name: 'messy',
      data: {
        owner: { handle: 'x' },
        recs: [
          {},
          null,
          42,
          { title: 'Ünïcødé 🎮 '.repeat(20) },
          { title: 'مرحبا بالعالم', rating: 99, from: null },
          { title: 'Huge review', rating: null, review: 'x'.repeat(5000) },
          { title: 'Weird category', category: 'Nope', tags: [1, null, 'ok'] },
        ],
        recommendedByMe: [{}, null],
      },
    },
    {
      // v2: every new block has something to draw (trying, pins, own fields, places, lists, requests, circle).
      name: 'v2',
      data: {
        owner: { ...owner, note: 'Food recommendations only this month.' },
        labels: { tried: 'Stuff I tried' },
        links: { send: 'https://example.test/@fixture/send', page: 'https://example.test/@fixture', thing: 'https://example.test/thing' },
        recs: [
          rec(1, { rating: 10, pinned: true, extra: { 'Where I watched': 'the cinema' }, reactions: { '🔥': 4 }, date: `${new Date().getFullYear()}-02-01` }),
          rec(2, { rating: 2, category: 'Eat', url: 'https://maps.google.com/maps/place/x/@17.39,78.42,17z', date: `${new Date().getFullYear()}-03-01` }),
          rec(3, { rating: 9, category: 'Go', extra: { Where: '15.335, 76.46' }, date: `${new Date().getFullYear()}-04-01` }),
          rec(4, { status: 'trying', rating: null, progress: 'page 120' }),
          rec(5, { status: 'want', rating: null, category: 'Watch', from: null }),
        ],
        lists: [{ id: 'l1', title: 'Favourites', items: ['r1', 'r3'] }],
        asks: [{ id: 'a1', text: 'A good thriller?', date: '2026-01-01' }],
        circle: [{ name: 'Pal', handle: 'pal', profileUrl: 'http://example.test/@pal', gave: 3 }],
      },
    },
    {
      name: 'v2-hostile',
      mustNotContain: [XSS, '"><script'],
      data: {
        owner: { handle: 'h', name: XSS, note: XSS },
        labels: { tried: XSS, lists: '"><script>alert(1)</script>' },
        links: { send: 'https://example.test/s', page: 'https://example.test/p', thing: 'https://example.test/t' },
        recs: [rec(1, { title: XSS, extra: { [XSS]: XSS }, progress: XSS, status: 'trying' }), rec(2, { title: XSS, rating: 10, extra: { Where: XSS }, cover: 'https://x.test/"><script>', url: 'javascript:alert(1)' })],
        lists: [{ id: XSS, title: XSS, description: XSS, items: ['r2'] }],
        asks: [{ id: '"><script>', text: XSS }],
        circle: [{ name: XSS, handle: '"><script>', profileUrl: 'javascript:alert(1)', avatar: 'https://x.test/"onerror="alert(1)' }],
      },
    },
    {
      name: 'hostile',
      mustNotContain: [XSS],
      data: {
        owner: { handle: 'h', name: XSS, bio: XSS },
        recs: [rec(1, { title: XSS, review: XSS, pitch: XSS, tags: [XSS], from: { name: XSS } })],
        recommendedByMe: [{ title: XSS, to: { name: XSS } }],
      },
    },
  ]
}
