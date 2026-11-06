// Sample data for previewing the page frontend locally (npm run page). It has the same shape
// Recommend You This sends to a fork; see FORKING.md, "The data your page gets".

const day = d => new Date(Date.now() - d * 86400e3).toISOString().slice(0, 10)
const friend = (name, handle) => ({ name, handle, profileUrl: handle ? `https://example.com/@${handle}` : null })

export const sampleData = {
  owner: { handle: 'sam', name: 'Sam Rivera', bio: 'Always up for books and good food.', profileUrl: 'https://example.com/@sam', avatar: null, note: 'Taking book recommendations this month!' },
  links: { send: 'https://example.com/@sam/send', page: 'https://example.com/@sam', home: 'https://example.com/', thing: 'https://example.com/thing' },
  labels: { shame: 'Sorry, friends' },
  recs: [
    { id: '1', title: 'Outer Wilds', category: 'Play', status: 'tried', rating: 10, pitch: 'Don’t google anything.', review: 'Best ending of any game I have played.', tags: ['mystery'], from: friend('Kai', 'kai'), date: day(3), pinned: true, reactions: { '🔥': 7, '🙌': 2 } },
    { id: '0', title: 'Severance', category: 'Watch', status: 'trying', progress: 'episode 4 of 9', from: friend('Mira', 'mira') },
    { id: '6', title: 'Hampi at sunrise', category: 'Go', status: 'tried', rating: 9, url: 'https://www.google.com/maps/@15.3350,76.4600,14z', review: 'Climb Matanga hill before 6.', extra: { When: 'March' }, from: friend('Kai', 'kai'), date: day(40) },
    { id: '7', title: 'Cold showers', category: 'Other', status: 'tried', rating: 2, review: 'No.', from: friend('Jo', null), date: day(60) },
    { id: '2', title: 'Piranesi', category: 'Read', status: 'tried', rating: 9, pitch: 'A house of endless halls and tides.', review: 'Read it in one sitting.', tags: ['fantasy'], from: friend('Mira', 'mira'), date: day(9) },
    { id: '3', title: 'Spirited Away', category: 'Watch', status: 'tried', rating: 10, review: 'Still magic.', tags: [], from: friend('Mom', null), date: day(20) },
    { id: '4', title: 'Biryani at Shah Ghouse', category: 'Eat', status: 'tried', rating: 8, pitch: 'Go at 11pm, trust me.', review: 'Worth the queue.', tags: [], from: friend('Aneesh', 'aneesh'), date: day(30) },
    { id: '5', title: 'Frieren', category: 'Watch', status: 'already_done', from: friend('Jo', null), date: day(5) },
  ],
  lists: [{ id: 'l1', title: 'Weekend plans', description: 'Things to do on a slow Saturday.', items: ['1', '6', '4'] }],
  asks: [{ id: 'a1', text: 'A thriller I can finish in one sitting?', date: day(2) }],
  circle: [{ name: 'Kai', handle: 'kai', profileUrl: 'https://example.com/@kai', gave: 3, got: 1 }, { name: 'Mira', handle: 'mira', profileUrl: 'https://example.com/@mira', gave: 2 }],
  recommendedByMe: [
    { id: 's1', title: 'Hades', to: friend('Kai', 'kai'), status: 'tried', rating: 9 },
  ],
}
