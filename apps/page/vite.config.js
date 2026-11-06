// The page frontend on its own: what a fork publishes (GitHub Pages) and links in Settings.
// Relative base, so it works at any path.
//   npm run page        preview locally with sample data (http://localhost:4100/preview.html)
//   npm run build:page  -> dist/page/

import path from 'node:path'
import { defineConfig } from 'vite'

const root = path.dirname(new URL(import.meta.url).pathname)

export default defineConfig({
  root,
  base: './',
  // RYT loads the page in a sandboxed frame (an opaque origin), so its scripts are fetched
  // cross-origin: allow any origin, as GitHub Pages does.
  server: { cors: { origin: '*' }, port: 4100, fs: { allow: [path.resolve(root, '../..')] } },
  preview: { cors: { origin: '*' } },
  build: { outDir: path.resolve(root, '../../dist/page'), emptyOutDir: true, target: 'es2022' },
})
