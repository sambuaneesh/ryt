// Prototype storage: one JSON file, loaded into memory, written after every mutation.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR } from './config.mjs'
import { seed } from './seed.mjs'

const FILE = path.join(DATA_DIR, 'db.json')

export const newId = () => crypto.randomBytes(4).toString('hex')

export function loadDb() {
  if (!fs.existsSync(FILE)) {
    const db = seed()
    saveDb(db)
    return db
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8'))
}

export function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
}

export const userByHandle = (db, handle) => db.users.find(u => u.handle === handle)
export const userById = (db, id) => db.users.find(u => u.id === id)
