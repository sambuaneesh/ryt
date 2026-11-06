import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DATA_DIR = path.join(REPO_ROOT, '.data')
export const FORKS_DIR = path.resolve(process.env.RYT_FORKS_DIR ?? path.join(REPO_ROOT, '../forks'))
export const THEMES_DIR = path.join(REPO_ROOT, 'apps/page/themes')

export const PORT = Number(process.env.PORT ?? 4000)
export const UC_PORT = Number(process.env.UC_PORT ?? 4001)

// Two different hosts on purpose: the platform and user content must be different sites, so
// fork code can never read platform cookies. In production the user-content domain would be
// on the Public Suffix List (like github.io), making every user's subdomain its own site.
export const PLATFORM_ORIGIN = process.env.PLATFORM_ORIGIN ?? `http://localhost:${PORT}`
export const UC_ORIGIN = process.env.UC_ORIGIN ?? `http://127.0.0.1:${UC_PORT}`

// Each Hugo-theme build is served from the root of its own host, like a per-person subdomain
// in production. Themes assume they live at "/" (absolute /css/… paths), so a sub-path
// breaks many of them. Browsers resolve *.localhost to this machine.
export const siteOrigin = id => (process.env.SITE_ORIGIN_TEMPLATE ?? `http://{id}.localhost:${UC_PORT}`).replace('{id}', id)
export const siteIdFromHost = host => /^([a-z0-9-]+)\.localhost(?::\d+)?$/.exec(host ?? '')?.[1] ?? null

export const FORK_READY_TIMEOUT_MS = 4000
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024
