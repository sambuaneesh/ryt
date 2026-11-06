// Demo data: three people recommending things to each other.

export function emptyTheme(preset = 'base') {
  return {
    preset,
    import: null,
    overrides: {},
    mode: 'builtin',
    fork: { url: '', ref: 'main', live: null, builds: [] },
  }
}

export function seed() {
  const users = [
    { id: 'u1', handle: 'aneesh', name: 'Aneesh', bio: 'Builder of small things. Will try anything once.', inbox: 'anyone', theme: emptyTheme('retro-pixel') },
    { id: 'u2', handle: 'kai', name: 'Kai', bio: 'Games, books, and arguing about both.', inbox: 'anyone', theme: emptyTheme('paper') },
    {
      id: 'u3',
      handle: 'mira',
      name: 'Mira',
      bio: 'Night owl. Anime, sci-fi, and very strong coffee.',
      inbox: 'accounts',
      theme: {
        ...emptyTheme('midnight'),
        // As if picked from the base16 gallery (seeded offline).
        import: {
          name: 'Catppuccin Mocha',
          format: 'base16',
          source: { kind: 'base16', id: 'catppuccin-mocha' },
          notes: ['7 of 7 colours came from the theme'],
          layer: { tokens: { 'color.bg': '#1e1e2e', 'color.surface': '#181825', 'color.border': '#313244', 'color.muted': '#585b70', 'color.text': '#cdd6f4', 'color.accent': '#89b4fa', 'color.rating': '#f9e2af' } },
        },
        overrides: {
          css: '[data-ryt="rec-card"]:hover { transform: translateY(-2px); transition: transform .15s; }\n[data-ryt="hero"] h1 { letter-spacing: -0.03em; }',
        },
      },
    },
  ]

  let n = 0
  const rec = (to, from, fields) => ({
    id: `r${++n}`,
    to,
    fromUser: from.user ?? null,
    fromName: from.name ?? null,
    showName: from.show ?? true,
    source: from.manual ? 'manual' : 'sent',
    title: '',
    url: '',
    category: 'Other',
    tags: [],
    pitch: '',
    status: 'new',
    rating: null,
    review: '',
    note: '',
    hidden: false,
    createdAt: '2026-10-01T10:00:00Z',
    triedAt: null,
    ...fields,
  })

  const recs = [
    // to aneesh
    rec('u1', { user: 'u2' }, { title: 'Hades', category: 'Play', tags: ['roguelike', 'mythology'], pitch: 'The combat is butter and dying is part of the story.', status: 'tried', rating: 9, review: 'Lost a whole weekend. The writing carries it.', createdAt: '2026-08-02T10:00:00Z', triedAt: '2026-08-20' }),
    rec('u1', { user: 'u2' }, { title: 'Outer Wilds', url: 'https://www.mobiusdigitalgames.com/outer-wilds.html', category: 'Play', tags: ['exploration', 'mystery'], pitch: "Go in blind. Don't google anything.", status: 'tried', rating: 10, review: 'Best ending of any game I have played.', createdAt: '2026-06-11T10:00:00Z', triedAt: '2026-07-03' }),
    rec('u1', { user: 'u3' }, { title: 'Frieren: Beyond Journey’s End', category: 'Watch', tags: ['anime', 'fantasy'], pitch: 'Slow, sad, beautiful.', status: 'already_done', createdAt: '2026-09-01T10:00:00Z' }),
    rec('u1', { name: 'Sam' }, { title: 'Biryani at Shah Ghouse', category: 'Eat', tags: ['hyderabad'], pitch: 'Go at 11pm, trust me.', status: 'tried', rating: 8, review: 'Worth the queue. Not worth the 1am regret.', createdAt: '2026-09-14T10:00:00Z', triedAt: '2026-09-20' }),
    rec('u1', { name: 'a friend from work', show: false }, { title: 'Severance', category: 'Watch', pitch: 'Office horror, you will love it.', status: 'tried', rating: 9, review: 'Season 1 finale is perfect television.', createdAt: '2026-05-03T10:00:00Z', triedAt: '2026-05-20' }),
    rec('u1', { name: 'Mom', manual: true }, { title: 'Malgudi Days', category: 'Watch', status: 'tried', rating: 10, review: 'Rewatched it as an adult. Still magic.', triedAt: '2026-04-10' }),
    rec('u1', { user: 'u2' }, { title: 'Obsidian', url: 'https://obsidian.md', category: 'Use', tags: ['notes'], pitch: 'Your brain, but linked.', status: 'up_next', createdAt: '2026-10-20T10:00:00Z' }),
    rec('u1', { name: 'Priya' }, { title: 'Blue Tokai cold brew', category: 'Eat', pitch: 'The cans, not the bottles.', status: 'new', createdAt: '2026-11-04T10:00:00Z' }),
    rec('u1', { name: 'anon' }, { title: 'Crypto day trading course', category: 'Other', status: 'passed', note: 'no.', createdAt: '2026-10-28T10:00:00Z' }),

    // to kai
    rec('u2', { user: 'u1' }, { title: 'Spirited Away', category: 'Watch', tags: ['ghibli'], pitch: 'If you somehow have not seen it.', status: 'tried', rating: 10, review: 'Okay. I get it now.', createdAt: '2026-07-01T10:00:00Z', triedAt: '2026-07-04' }),
    rec('u2', { user: 'u1' }, { title: 'Celeste', category: 'Play', tags: ['platformer'], pitch: 'Hard, kind, about anxiety.', status: 'tried', rating: 8, review: 'Chapter 7 nearly broke me. In a good way.', createdAt: '2026-08-11T10:00:00Z', triedAt: '2026-09-01' }),
    rec('u2', { user: 'u3' }, { title: 'Project Hail Mary', category: 'Read', tags: ['sci-fi'], pitch: 'Science! Friendship! Rocky!', status: 'tried', rating: 9, review: 'Rocky is the best character of the decade.', createdAt: '2026-06-21T10:00:00Z', triedAt: '2026-07-15' }),
    rec('u2', { name: 'Lo-fi enjoyer' }, { title: 'Lofi Girl radio', category: 'Listen', status: 'already_done', createdAt: '2026-09-09T10:00:00Z' }),
    rec('u2', { user: 'u1' }, { title: 'Arc browser', category: 'Use', status: 'passed', createdAt: '2026-10-02T10:00:00Z' }),
    rec('u2', { user: 'u3' }, { title: 'Dune: Part Two', category: 'Watch', status: 'new', pitch: 'IMAX if you can.', createdAt: '2026-11-01T10:00:00Z' }),

    // to mira
    rec('u3', { user: 'u2' }, { title: 'Disco Elysium', category: 'Play', tags: ['rpg', 'writing'], pitch: 'You will talk to your necktie.', status: 'tried', rating: 9, review: 'I did talk to my necktie.', createdAt: '2026-05-05T10:00:00Z', triedAt: '2026-06-01' }),
    rec('u3', { user: 'u1' }, { title: 'Mushishi', category: 'Watch', tags: ['anime', 'calm'], pitch: 'The calmest show ever made.', status: 'tried', rating: 10, review: 'Perfect 2am watching.', createdAt: '2026-04-05T10:00:00Z', triedAt: '2026-04-30' }),
    rec('u3', { user: 'u2' }, { title: 'Tiramisu at Roastery', category: 'Eat', status: 'new', createdAt: '2026-11-02T10:00:00Z' }),
  ]

  return { users, recs }
}
