// The app's data layer: Supabase normally, the in-browser stand-in with `--mode mock`.
// Both expose the same methods (see supabase.js).

const backend = import.meta.env.MODE === 'mock' ? await import('./mock.js') : await import('./supabase.js')

export const api = backend.api
