/**
 * Does "share a code, everyone sees the same game" actually work?
 *
 * Two independent browser contexts (two phones). Device A creates a game and
 * enables sharing, device B joins with the code via the shared link. Then both
 * must follow each other live, count devices, and survive a network outage.
 *
 * Usage: BASE_URL=http://127.0.0.1:4173 node sync-share.mjs
 */
import { chromium, devices } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'shots')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'

const t0 = Date.now()
const log = (...a) => console.log(`${String(Date.now() - t0).padStart(6)}ms`, ...a)
const check = (name, ok, detail = '') => log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const game = {
  id: 'share-host',
  name: 'Geburtstag Boßeln',
  route: 'Deichweg bis zum Pavillon',
  createdAt: new Date(Date.now() - 600000).toISOString(),
  birthdayTeamId: 't1',
  teams: [
    { id: 't1', name: 'Team Rot', emoji: '🍺', color: '#e11d48', players: [{ id: 'p1', name: 'Jan' }, { id: 'p2', name: 'Anna' }] },
    { id: 't2', name: 'Team Blau', emoji: '🚀', color: '#2563eb', players: [{ id: 'p3', name: 'Ben' }] },
  ],
  penaltyRules: [
    { id: 'ditch', labelKey: 'penalty.ditch', points: 1, drink: false, icon: '🌊', builtIn: true },
    { id: 'whistle', labelKey: 'penalty.whistle', points: 1, drink: true, icon: '🚨', builtIn: true },
    { id: 'custom', labelKey: 'penalty.custom', points: 1, drink: false, icon: '✏️', builtIn: true },
  ],
  settings: {
    scoringMode: 'tiebreak',
    drinkingEnabled: true,
    drinkingCards: true,
    categories: { harmless: true, modifier: true, drinking: true },
    autoRotate: true,
    haptics: false,
  },
  events: [
    { id: 'share-start', at: new Date(Date.now() - 600000).toISOString(), type: 'game', note: 'Geburtstag Boßeln' },
    { id: 'share-throw-1', at: new Date(Date.now() - 500000).toISOString(), type: 'throw', teamId: 't1', playerId: 'p1' },
  ],
}

const browser = await chromium.launch()
const throwsOf = async (page, index = 0) =>
  Number(await page.locator('[data-stat="throws"]').nth(index).getAttribute('data-value'))

const waitForThrows = async (page, want, index = 0, limitMs = 30000) => {
  const started = Date.now()
  while (Date.now() - started < limitMs) {
    await page.waitForTimeout(700)
    if ((await throwsOf(page, index)) === want) return Date.now() - started
  }
  return -1
}

/* ---------------------------------------------------------------- device A */
const ctxA = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE' })
const A = await ctxA.newPage()
await A.goto(BASE, { waitUntil: 'domcontentloaded' })
await A.evaluate((g) => {
  localStorage.setItem('bosseln:game:v1', JSON.stringify(g))
  localStorage.setItem(
    'bosseln:prefs:v1',
    JSON.stringify({ lang: 'de', theme: 'light', textScale: 'normal', syncEnabled: false }),
  )
}, game)
await A.reload({ waitUntil: 'domcontentloaded' })
await A.waitForSelector('text=Deichweg', { timeout: 15000 })
log('Gerät A: Spiel angelegt')

// share via the header chip → enable → read the code
await A.locator('button[aria-label="Spiel teilen"]').click()
await A.waitForTimeout(400)
await A.getByRole('button', { name: /Teilen aktivieren/ }).click()
await A.waitForTimeout(800)
const code = (await A.evaluate(() => {
  const el = [...document.querySelectorAll('[role=dialog] p')].find((p) => /^[A-Z0-9]{4,8}$/.test(p.textContent.trim()))
  return el ? el.textContent.trim() : null
})) ?? ''
check('Teilen aktiviert und Code erzeugt', /^[A-Z0-9]{4,8}$/.test(code), `Code=${code || 'keiner'}`)
const shareUrl = await A.evaluate(() => {
  const raw = localStorage.getItem('bosseln:prefs:v1')
  const room = raw ? JSON.parse(raw).syncRoom : null
  return room ? `${location.origin}${location.pathname}?join=${room}` : null
})
await A.screenshot({ path: join(SHOTS, '40-share-sheet.png') })
await A.locator('[role=dialog] button[aria-label="close"]').first().click()
await A.waitForTimeout(300)

/* ---------------------------------------------------------------- device B */
const ctxB = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE' })
const B = await ctxB.newPage()
await B.goto(shareUrl, { waitUntil: 'domcontentloaded' })
const sawOverlay = await B.getByText(/Beitritt zu/).first().isVisible().catch(() => false)
log('Gerät B: Link geöffnet, Beitritts-Overlay sichtbar:', sawOverlay)

let joined = false
try {
  await B.waitForSelector('text=Deichweg', { timeout: 20000 })
  joined = true
} catch {
  joined = false
}
check('Beitritt per Link holt den Spielstand (ohne JSON-Datei)', joined)
await B.screenshot({ path: join(SHOTS, '41-joined.png') })
const bTeams = await B.evaluate(() => {
  const raw = localStorage.getItem('bosseln:game:v1')
  return raw ? JSON.parse(raw).teams.map((t) => t.name) : []
})
check('B hat dieselben Teams wie A', bTeams.join(',') === 'Team Rot,Team Blau', bTeams.join(','))
check('B sieht bereits eingetragene Würfe von A', (await throwsOf(B)) === 1, `B zählt ${await throwsOf(B)}`)

/* ------------------------------------------------- live sync, both ways */
await A.bringToFront()
await A.locator('.team-glow').first().getByRole('button', { name: /Wurf Team Rot/ }).click()
const dtAB = await waitForThrows(B, 2)
check('A wirft → B zählt live mit', dtAB >= 0, dtAB >= 0 ? `${dtAB}ms` : 'nichts nach 30s')

await B.bringToFront()
await B.locator('.team-glow').nth(1).getByRole('button', { name: /Wurf Team Blau/ }).click()
const dtBA = await waitForThrows(A, 1, 1)
check('B wirft → A zählt live mit', dtBA >= 0, dtBA >= 0 ? `${dtBA}ms` : 'nichts nach 30s')

/* ------------------------------------------------------------- presence */
await A.bringToFront()
await A.locator('button[aria-label="Spiel teilen"]').click()
await A.waitForTimeout(2500)
const sheetText = await A.evaluate(() => document.body.innerText)
check(
  'Beide Geräte werden als verbunden angezeigt',
  /2 Geräte verbunden/.test(sheetText),
  (sheetText.match(/\d+ Gerät[^\n]*/) ?? ['nichts gefunden'])[0],
)
await A.screenshot({ path: join(SHOTS, '42-share-two-devices.png') })
await A.locator('[role=dialog] button[aria-label="close"]').first().click()

/* --------------------------------- offline: local play, catch up later */
await B.bringToFront()
const beforeOffline = await throwsOf(B, 0)
const aBeforeOffline = await throwsOf(A, 0)
await ctxB.setOffline(true)
log('Gerät B: Netz weg (Flugmodus)')
await B.locator('.team-glow').first().getByRole('button', { name: /Wurf Team Rot/ }).click()
await B.waitForTimeout(1500)
const offlineCount = await throwsOf(B, 0)
check('B kann ohne Netz weiter zählen', offlineCount === beforeOffline + 1, `${beforeOffline} → ${offlineCount}`)

await ctxB.setOffline(false)
log('Gerät B: Netz wieder da')
const dtCatchup = await waitForThrows(A, aBeforeOffline + 1, 0, 40000)
check(
  'Nach Netzrückkehr gleicht sich B automatisch ab',
  dtCatchup >= 0,
  dtCatchup >= 0 ? `${dtCatchup}ms (A: ${aBeforeOffline} → ${await throwsOf(A, 0)})` : 'kein Abgleich nach 40s',
)

// and a normal throw after reconnecting must still arrive
await B.locator('.team-glow').first().getByRole('button', { name: /Wurf Team Rot/ }).click()
const dtAfter = await waitForThrows(A, aBeforeOffline + 2, 0, 30000)
check('Nach Reconnect läuft der Live-Sync weiter', dtAfter >= 0, dtAfter >= 0 ? `${dtAfter}ms` : 'nichts nach 30s')

const aEvents = await A.evaluate(() => JSON.parse(localStorage.getItem('bosseln:game:v1')).events.length)
const bEvents = await B.evaluate(() => JSON.parse(localStorage.getItem('bosseln:game:v1')).events.length)
check('Beide Geräte haben identisch viele Ereignisse', aEvents === bEvents, `A=${aEvents} B=${bEvents}`)

await browser.close()
log(`A→B ${dtAB}ms · B→A ${dtBA}ms · Nachabgleich ${dtCatchup}ms · Events je ${aEvents}`)
