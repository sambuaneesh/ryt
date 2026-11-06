// Builds the public, contract-shaped data for a dashboard. This is the ONLY data that ever
// leaves the platform for a page frontend: private notes, passed/new items and hidden
// items never appear here.

import { normalizePageData, PUBLIC_STATUSES } from '../../packages/contract/index.js'
import { userById } from './db.mjs'
import { PLATFORM_ORIGIN } from './config.mjs'

export const profileUrl = handle => `${PLATFORM_ORIGIN}/@${handle}`

const isPublic = r => PUBLIC_STATUSES.includes(r.status) && !r.hidden

// The sender as shown publicly, or null for anonymous.
export function publicSender(db, rec) {
  if (!rec.showName) return null
  const account = rec.fromUser && userById(db, rec.fromUser)
  if (account) return { name: account.name, handle: account.handle, profileUrl: profileUrl(account.handle) }
  return rec.fromName ? { name: rec.fromName } : null
}

export function pageData(db, user) {
  const recs = db.recs
    .filter(r => r.to === user.id && isPublic(r))
    .sort((a, b) => (b.triedAt ?? b.createdAt ?? '').localeCompare(a.triedAt ?? a.createdAt ?? ''))
    .map(r => ({
      id: r.id,
      title: r.title,
      url: r.url,
      category: r.category,
      tags: r.tags,
      pitch: r.pitch,
      review: r.review,
      status: r.status,
      rating: r.rating,
      date: r.triedAt ?? r.createdAt,
      from: publicSender(db, r),
    }))

  // Only recs where the sender chose to be credited publicly, and the recipient made public.
  const recommendedByMe = db.recs
    .filter(r => r.fromUser === user.id && r.showName && isPublic(r))
    .map(r => {
      const to = userById(db, r.to)
      return { id: r.id, title: r.title, status: r.status, rating: r.rating, to: { name: to.name, handle: to.handle, profileUrl: profileUrl(to.handle) } }
    })

  return normalizePageData({
    owner: { handle: user.handle, name: user.name, bio: user.bio, profileUrl: profileUrl(user.handle) },
    links: { send: `${profileUrl(user.handle)}/send` },
    recs,
    recommendedByMe,
  })
}
