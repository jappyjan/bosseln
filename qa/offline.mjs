/**
 * Offline proof: with the web server completely stopped, the installed PWA must
 * still start and show the game that was in progress.
 *
 * Requires a previous `node qa.mjs` run on the same browser profile (that installs the
 * service worker and leaves a running game behind) and a stopped server.
 *
 * Usage: BASE_URL=http://127.0.0.1:4173 node offline.mjs
 */
import { chromium, devices } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROFILE = join(HERE, 'profile')
const SHOTS = join(HERE, 'shots')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'

// 1. the server really has to be unreachable, otherwise the test proves nothing
let serverUp = true
try {
  const res = await fetch(BASE, { signal: AbortSignal.timeout(2500) })
  serverUp = res.ok
} catch {
  serverUp = false
}
if (serverUp) {
  console.error('server still reachable — stop it first (offline test would be meaningless)')
  process.exit(2)
}
console.log('server unreachable ✓ — starting the app from the service worker cache')

const context = await chromium.launchPersistentContext(PROFILE, {
  ...devices['iPhone 13'],
  locale: 'de-DE',
  serviceWorkers: 'allow',
})
const page = context.pages()[0] ?? (await context.newPage())

let servedBySw = false
page.on('response', (res) => {
  if (res.fromServiceWorker()) servedBySw = true
})

let navOk = false
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('nav button', { timeout: 15000 })
  navOk = true
} catch {
  navOk = false
}
await page.waitForTimeout(500)

const state = await page.evaluate(async () => {
  let cacheNames = []
  try {
    cacheNames = await caches.keys()
  } catch {
    /* ignore */
  }
  let game = null
  try {
    const raw = localStorage.getItem('bosseln:game:v1')
    game = raw ? JSON.parse(raw) : null
  } catch {
    /* ignore */
  }
  return {
    controller: Boolean(navigator.serviceWorker?.controller),
    caches: cacheNames,
    online: navigator.onLine,
    gameName: game?.name ?? null,
    eventCount: game?.events?.length ?? 0,
    text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 300),
  }
})

const ok = navOk && state.controller && servedBySw && state.eventCount > 0
console.log(
  JSON.stringify(
    {
      appBooted: navOk,
      servedFromServiceWorker: servedBySw,
      swController: state.controller,
      navigatorOnLine: state.online,
      caches: state.caches,
      game: state.gameName,
      events: state.eventCount,
      visibleText: state.text,
    },
    null,
    2,
  ),
)
await page.screenshot({ path: join(SHOTS, '14-offline-server-down.png') })
await context.close()

if (!ok) {
  console.error('FAIL: app did not start offline')
  process.exit(1)
}
console.log('PASS: app booted fully offline from cache, running game intact')
