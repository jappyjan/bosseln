/**
 * Offline proof for the deployed app: with the browser emulating a network outage
 * (airplane mode — the classic case while walking), the installed service worker
 * must serve the app from its cache and the running game must survive.
 *
 * Uses the persistent profile from qa.mjs, which already registered the service
 * worker for the live origin.
 *
 * Usage: BASE_URL=https://birthday.apps.janjaap.de node live-offline.mjs
 */
import { chromium, devices } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROFILE = join(HERE, 'profile')
const SHOTS = join(HERE, 'shots')
const BASE = process.env.BASE_URL ?? 'https://birthday.apps.janjaap.de'

const context = await chromium.launchPersistentContext(PROFILE, {
  ...devices['iPhone 13'],
  locale: 'de-DE',
  serviceWorkers: 'allow',
})
const page = context.pages()[0] ?? (await context.newPage())

// make sure the SW is in control and the game is on screen
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav button', { timeout: 20000 })
await page.waitForTimeout(1000)

// airplane mode
await context.setOffline(true)
console.log('offline emuliert ✓ — lade die App neu')

let servedBySw = false
page.on('response', (res) => {
  if (res.fromServiceWorker()) servedBySw = true
})

let booted = false
try {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('nav button', { timeout: 15000 })
  booted = true
} catch (err) {
  console.log('reload fehlgeschlagen:', err.message)
}
await page.waitForTimeout(800)

const state = await page.evaluate(() => {
  let game = null
  try {
    const raw = localStorage.getItem('bosseln:game:v1')
    game = raw ? JSON.parse(raw) : null
  } catch {
    /* ignore */
  }
  return {
    controller: Boolean(navigator.serviceWorker?.controller),
    online: navigator.onLine,
    game: game?.name ?? null,
    events: game?.events?.length ?? 0,
    text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 200),
  }
})

console.log(
  JSON.stringify({ appBooted: booted, servedFromServiceWorker: servedBySw, ...state }, null, 2),
)
await page.screenshot({ path: join(SHOTS, '20-live-offline-airplane-mode.png') })
await context.close()

const ok = booted && state.controller && state.events > 0
console.log(ok ? 'PASS: Live-App startet offline aus dem Cache, Spielstand intakt' : 'FAIL')
process.exit(ok ? 0 : 1)
