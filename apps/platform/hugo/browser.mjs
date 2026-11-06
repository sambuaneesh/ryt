// A tiny headless-Chromium client over the DevTools protocol (no dependencies). Used to
// measure how a theme looks. One browser is started on demand, shared, and closed when idle.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from '../config.mjs'

const IDLE_MS = 60_000
// One profile per server process, so a previous run's browser can't lock us out.
const PROFILE_DIR = path.join(DATA_DIR, `chromium-${process.pid}`)
let browser = null
let idle = null

async function launch() {
  const proc = spawn(process.env.CHROMIUM_BIN ?? 'chromium', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${PROFILE_DIR}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  // Never leave a browser behind (a stray one holds the profile and blocks the next launch).
  process.once('exit', () => proc.kill())
  const wsUrl = await new Promise((resolve, reject) => {
    let log = ''
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 20000)
    proc.stderr.on('data', d => {
      log += d
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(log)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    })
    proc.on('exit', () => reject(new Error('Chromium exited')))
  })
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let seq = 0
  const pending = new Map()
  const listeners = new Set()
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else if (msg.method) {
      for (const fn of listeners) fn(msg)
    }
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++seq, { resolve, reject })
    ws.send(JSON.stringify({ id: seq, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  const close = () => {
    try { ws.close() } catch {}
    proc.kill()
    browser = null
    setTimeout(() => fs.rmSync(PROFILE_DIR, { recursive: true, force: true }), 500)
  }
  proc.on('exit', () => { browser = null })
  return { send, listeners, close }
}

// Runs fn(page) in a fresh tab. page.goto(url) waits for load + web fonts; page.eval(expr).
export async function withPage(fn, { width = 1280, height = 900 } = {}) {
  clearTimeout(idle)
  browser ??= await launch()
  const b = browser
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => b.send(method, params, sessionId)
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  const page = {
    async goto(url) {
      const loaded = new Promise(resolve => {
        const on = msg => {
          if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') {
            b.listeners.delete(on)
            resolve()
          }
        }
        b.listeners.add(on)
        setTimeout(() => { b.listeners.delete(on); resolve() }, 15000)
      })
      await send('Page.navigate', { url })
      await loaded
      await page.eval('document.fonts ? document.fonts.ready.then(() => true) : true')
      await new Promise(r => setTimeout(r, 250))
    },
    // Emulate the visitor's colour-scheme preference (for themes with a dark mode).
    async scheme(value) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] })
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(file, Buffer.from(data, 'base64'))
    },
    async eval(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
      return result.value
    },
  }
  try {
    return await fn(page)
  } finally {
    await b.send('Target.closeTarget', { targetId }).catch(() => {})
    idle = setTimeout(() => browser?.close(), IDLE_MS)
  }
}
