/**
 * Why does sharing work locally but not on the live domain?
 * Prints the sync panel, the prefs and a raw WebSocket test straight from the page.
 *
 * Usage: BASE_URL=https://birthday.apps.janjaap.de node sync-debug.mjs
 */
import { chromium, devices } from 'playwright'

const BASE = process.env.BASE_URL ?? 'https://birthday.apps.janjaap.de'
const game = {
  id: 'debug-host',
  name: 'Debug-Runde',
  route: 'Deichweg',
  createdAt: new Date().toISOString(),
  birthdayTeamId: 't1',
  teams: [
    { id: 't1', name: 'Team Rot', emoji: '🍺', color: '#e11d48', players: [{ id: 'p1', name: 'Jan' }] },
    { id: 't2', name: 'Team Blau', emoji: '🚀', color: '#2563eb', players: [{ id: 'p2', name: 'Ben' }] },
  ],
  penaltyRules: [{ id: 'ditch', labelKey: 'penalty.ditch', points: 1, drink: false, icon: '🌊', builtIn: true }],
  settings: {
    scoringMode: 'tiebreak',
    drinkingEnabled: false,
    drinkingCards: false,
    categories: { harmless: false, modifier: false, drinking: false },
    autoRotate: true,
    haptics: false,
  },
  events: [{ id: 'debug-start', at: new Date().toISOString(), type: 'game', note: 'Debug-Runde' }],
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE' })
const page = await ctx.newPage()
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.evaluate((g) => {
  localStorage.setItem('bosseln:game:v1', JSON.stringify(g))
  localStorage.setItem('bosseln:prefs:v1', JSON.stringify({ lang: 'de', theme: 'light', textScale: 'normal', syncEnabled: false }))
}, game)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Deichweg', { timeout: 15000 })

// 1) raw reachability of the brokers from this page
const sockets = await page.evaluate(async () => {
  const urls = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt']
  const out = []
  for (const url of urls) {
    const result = await new Promise((resolve) => {
      let done = false
      const finish = (state) => {
        if (done) return
        done = true
        try {
          ws.close()
        } catch {}
        resolve({ url, state })
      }
      const ws = new WebSocket(url, 'mqtt')
      const timer = setTimeout(() => finish('timeout'), 9000)
      ws.onopen = () => {
        clearTimeout(timer)
        finish('open')
      }
      ws.onerror = () => {
        clearTimeout(timer)
        finish('error')
      }
      ws.onclose = (e) => {
        clearTimeout(timer)
        finish(`close(${e.code})`)
      }
    })
    out.push(result)
  }
  return out
})
console.log('RAW WebSocket:', JSON.stringify(sockets))

// 2) enable sharing through the UI
await page.locator('button[aria-label="Spiel teilen"]').click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: /Teilen aktivieren/ }).click()
await page.waitForTimeout(12000)

const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('bosseln:prefs:v1')))
console.log('prefs:', JSON.stringify({ syncEnabled: prefs.syncEnabled, syncRoom: prefs.syncRoom, brokers: prefs.brokers }))

const sheet = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 400))
console.log('Screen-Text:', sheet)

await page.locator('[role=dialog] button[aria-label="close"]').first().click()
await page.locator('nav').getByRole('button', { name: 'Einstellungen' }).click()
await page.waitForTimeout(800)
const panel = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('grid-cols-2') && d.textContent.includes('Status'))
  return el ? el.innerText.replace(/\n+/g, ' | ') : '(Panel nicht gefunden)'
})
console.log('Sync-Panel:', panel)

console.log('Konsole:', logs.slice(0, 8).join(' || ') || '(leer)')
await browser.close()
