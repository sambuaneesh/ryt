// The RYT web app: a static site (ADR 0012). `npm run web` for local work, `npm run build:web`
// for GitHub Pages. BASE_PATH is the site's path on its host ("/ryt/" on
// <user>.github.io/ryt, "/" on a custom domain). `--mode mock` runs on an in-browser
// stand-in for Supabase, with demo people, for working on the app without signing in.

import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'

const root = path.dirname(new URL(import.meta.url).pathname)

export default defineConfig({
  root,
  base: process.env.BASE_PATH ?? '/',
  // SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY come from ryt/.env locally and from repository
  // variables in CI. Both are public by design: the database's row-level security is the guard.
  envDir: path.resolve(root, '..'),
  // RYT_REPO_URL: this repository (for the "fork it" guide link); set by the publish workflow.
  envPrefix: ['SUPABASE_', 'RYT_'],
  server: { port: 4000, strictPort: true, fs: { allow: [path.resolve(root, '..')] } },
  preview: { port: 4000, strictPort: true },
  build: { outDir: path.resolve(root, '../dist'), emptyOutDir: true, assetsInlineLimit: 0, target: 'es2022' },
  plugins: [{
    // GitHub Pages serves 404.html for any path it doesn't have: that's the app, which then
    // renders the route (/@mira, /inbox…) itself.
    name: 'spa-fallback',
    closeBundle() {
      const out = path.resolve(root, '../dist')
      if (fs.existsSync(path.join(out, 'index.html'))) fs.copyFileSync(path.join(out, 'index.html'), path.join(out, '404.html'))
    },
  }],
})
