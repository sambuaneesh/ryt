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
