// Stand-in ryts for previewing a design before your own page has any verdicts on it.

const day = d => new Date(Date.now() - d * 86400e3).toISOString()

export const SAMPLE_RECS = [
  { id: 's1', title: 'Outer Wilds', category: 'play', pitch: 'Don’t google anything. Just go.', review: 'Best ending of any game I’ve played.', status: 'tried', rating: 10, tags: ['mystery'], sender_name: 'Kai', sender_handle: null, decided_at: day(3) },
  { id: 's2', title: 'Piranesi', category: 'read', pitch: 'A house of endless halls and tides.', review: 'Read it in one sitting.', status: 'tried', rating: 9, tags: ['fantasy'], sender_name: 'Mira', sender_handle: null, decided_at: day(9) },
  { id: 's3', title: 'Biryani at Shah Ghouse', category: 'eat', pitch: 'Go at 11pm, trust me.', review: 'Worth the queue.', status: 'tried', rating: 8, tags: [], sender_name: 'Aneesh', sender_handle: null, decided_at: day(14) },
  { id: 's4', title: 'Malgudi Days', category: 'watch', pitch: '', review: 'Still magic as an adult.', status: 'tried', rating: 9, tags: [], sender_name: 'Mom', sender_handle: null, decided_at: day(30) },
  { id: 's5', title: 'Frieren', category: 'watch', status: 'already_done', sender_name: 'Sam', sender_handle: null, decided_at: day(5) },
]
