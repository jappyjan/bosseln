/**
 * Boot smoke test against a deployed instance (default: the live URL).
 *
 * Checks that the shipped bundle actually starts in a real browser on the real
 * origin: setup screen renders, service worker registers, workbox precache is
 * filled. Short on purpose — the full behavioural suite is qa.mjs.
 *
 * Usage: BASE_URL=https://birthday.apps.janjaap.de node smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'https://birthday.apps.janjaap.de'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' })
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForSelector('text=Neues Spiel', { timeout: 20000 })
const text = await page.evaluate(() => document.body.innerText)
console.log('PASS  Setup-Screen rendert auf', BASE, '→', text.split('\n')[0])

// reload once so the freshly installed service worker can take control
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

const state = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations()
  const names = await caches.keys()
  let cached = 0
  for (const n of names) {
    const c = await caches.open(n)
    cached += (await c.keys()).length
  }
  return {
    controller: Boolean(navigator.serviceWorker.controller),
    registrations: regs.length,
    scope: regs[0]?.scope ?? null,
    caches: names,
    cachedRequests: cached,
  }
})
console.log('PASS  Service Worker:', JSON.stringify(state))
const ok = state.controller && state.cachedRequests > 0 && errors.length === 0
console.log(ok ? 'PASS  Bundle startet fehlerfrei' : `FAIL  Fehler: ${errors.slice(0, 3).join(' | ')}`)
await browser.close()
process.exit(ok ? 0 : 1)
