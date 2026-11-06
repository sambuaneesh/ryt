// Sample data for previewing the page frontend locally (npm run page). It has the same shape
// Recommend You This sends to a fork; see FORKING.md, "The data your page gets".

const day = d => new Date(Date.now() - d * 86400e3).toISOString().slice(0, 10)
const friend = (name, handle) => ({ name, handle, profileUrl: handle ? `https://example.com/@${handle}` : null })

export const sampleData = {
  owner: { handle: 'sam', name: 'Sam Rivera', bio: 'Always up for books and good food.', profileUrl: 'https://example.com/@sam', avatar: null },
  links: { send: 'https://example.com/@sam/send', page: 'https://example.com/@sam', home: 'https://example.com/' },
  recs: [
    { id: '1', title: 'Outer Wilds', category: 'Play', status: 'tried', rating: 10, pitch: 'Don’t google anything.', review: 'Best ending of any game I have played.', tags: ['mystery'], from: friend('Kai', 'kai'), date: day(3) },
    { id: '2', title: 'Piranesi', category: 'Read', status: 'tried', rating: 9, pitch: 'A house of endless halls and tides.', review: 'Read it in one sitting.', tags: ['fantasy'], from: friend('Mira', 'mira'), date: day(9) },
    { id: '3', title: 'Spirited Away', category: 'Watch', status: 'tried', rating: 10, review: 'Still magic.', tags: [], from: friend('Mom', null), date: day(20) },
    { id: '4', title: 'Biryani at Shah Ghouse', category: 'Eat', status: 'tried', rating: 8, pitch: 'Go at 11pm, trust me.', review: 'Worth the queue.', tags: [], from: friend('Aneesh', 'aneesh'), date: day(30) },
    { id: '5', title: 'Frieren', category: 'Watch', status: 'already_done', from: friend('Jo', null), date: day(5) },
  ],
  recommendedByMe: [
    { id: 's1', title: 'Hades', to: friend('Kai', 'kai'), status: 'tried', rating: 9 },
  ],
}
