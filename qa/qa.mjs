/**
 * Acceptance run for the Boßeln PWA.
 *
 * - mobile viewport (iPhone 13, 390x844 @2x)
 * - seeds a realistic mid-game state
 * - walks the real UI, asserts derived numbers against the stored event log
 * - captures screenshots into ./shots
 *
 * Usage: BASE_URL=http://127.0.0.1:4173 node qa.mjs
 */
import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'shots')
const PROFILE = join(HERE, 'profile')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'

mkdirSync(SHOTS, { recursive: true })

/* --------------------------------------------------------------- fixtures */

const TEAMS = [
  { id: 't1', name: 'Team Rot', emoji: '🍺', color: '#e11d48', players: [{ id: 'p1', name: 'Jan' }, { id: 'p2', name: 'Anna' }] },
  { id: 't2', name: 'Team Blau', emoji: '🚀', color: '#2563eb', players: [{ id: 'p3', name: 'Ben' }, { id: 'p4', name: 'Carla' }] },
  { id: 't3', name: 'Team Grün', emoji: '🐢', color: '#16a34a', players: [{ id: 'p5', name: 'Dana' }] },
]

const seedEvents = () => {
  const T = (ms) => new Date(Date.now() - ms).toISOString()
  let s = 300000
  let n = 0
  const ev = (o) => {
    s -= 11000
    n += 1
    return Object.assign({ id: `seed-${String(n).padStart(3, '0')}`, at: T(s) }, o)
  }
  return [
    ev({ type: 'game', note: 'Geburtstag Boßeln' }),
    ev({ type: 'throw', teamId: 't1', playerId: 'p1' }),
    ev({ type: 'throw', teamId: 't2', playerId: 'p3' }),
    ev({ type: 'throw', teamId: 't3', playerId: 'p5' }),
    ev({ type: 'throw', teamId: 't1', playerId: 'p2' }),
    ev({ type: 'penalty', teamId: 't2', ruleId: 'ditch', points: 1, playerId: 'p3' }),
    ev({ type: 'drink', teamId: 't2', playerId: 'p3', source: 'manual' }),
    ev({ type: 'throw', teamId: 't2', playerId: 'p4' }),
    ev({ type: 'penalty', teamId: 't1', ruleId: 'whistle', points: 1, drink: true, playerId: 'p1' }),
    ev({ type: 'drink', teamId: 't1', playerId: 'p1', source: 'penalty' }),
    ev({ type: 'card', teamId: 't3', cardId: 'weak_arm' }),
    ev({ type: 'modifier', teamId: 't3', modifier: 'weak_arm' }),
    ev({ type: 'throw', teamId: 't1', playerId: 'p1' }),
    ev({ type: 'joker', teamId: 't1', playerId: 'p1', grantedBy: 'joker' }),
    ev({ type: 'throw', teamId: 't2', playerId: 'p3' }),
    ev({ type: 'card', teamId: 't2', cardId: 'water_break' }),
    ev({ type: 'drink', teamId: 't2', soft: true, source: 'card' }),
    ev({ type: 'drink', teamId: 't3', soft: true, source: 'card' }),
    ev({ type: 'throw', teamId: 't3', playerId: 'p5' }),
    ev({ type: 'throw', teamId: 't2', playerId: 'p4' }),
  ]
}

const seedGame = (opts = {}) => ({
  id: 'qa-game-3',
  name: opts.name ?? 'Geburtstag Boßeln',
  route: 'Deichweg bis zum Pavillon',
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  birthdayTeamId: 't1',
  teams: TEAMS,
  penaltyRules: [
    { id: 'ditch', labelKey: 'penalty.ditch', points: 1, drink: false, icon: '🌊', builtIn: true },
    { id: 'line', labelKey: 'penalty.line', points: 1, drink: false, icon: '📏', builtIn: true },
    { id: 'whistle', labelKey: 'penalty.whistle', points: 1, drink: true, icon: '🚨', builtIn: true },
    { id: 'lost', labelKey: 'penalty.lost', points: 1, drink: false, icon: '🔍', builtIn: true },
    { id: 'house', labelKey: 'penalty.house', points: 1, drink: false, icon: '🏠', builtIn: true },
    { id: 'custom', labelKey: 'penalty.custom', points: 1, drink: false, icon: '✏️', builtIn: true },
    { id: 'r-custom-1', label: 'Ball im Bach', points: 2, drink: true, icon: '📌' },
  ],
  settings: {
    scoringMode: 'tiebreak',
    drinkingEnabled: true,
    drinkingCards: true,
    categories: { harmless: true, modifier: true, drinking: true },
    autoRotate: true,
    haptics: true,
  },
  events: seedEvents(),
})

/** independent expectation model — deliberately not the app's own code */
const expectFrom = (game) => {
  const out = {}
  for (const t of game.teams) out[t.id] = { throws: 0, penalties: 0, drinks: 0 }
  for (const e of game.events) {
    if (e.type === 'throw' && out[e.teamId]) out[e.teamId].throws += 1
    if (e.type === 'penalty' && out[e.teamId]) out[e.teamId].penalties += e.points ?? 1
    if (e.type === 'joker' && out[e.teamId]) out[e.teamId].penalties -= 1
    if (e.type === 'drink') {
      const id = out[e.teamId] ? e.teamId : e.targetTeamId
      if (id && out[id]) out[id].drinks += 1
    }
  }
  for (const id of Object.keys(out)) out[id].penalties = Math.max(0, out[id].penalties)
  return out
}

/* ----------------------------------------------------------------- helpers */

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('bosseln:game:v1')))
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) })
const goNav = async (page, label) => {
  await page.locator('nav').getByRole('button', { name: label }).click()
  await page.waitForTimeout(320)
}

/* -------------------------------------------------------------------- run */

const context = await chromium.launchPersistentContext(PROFILE, {
  ...devices['iPhone 13'],
  colorScheme: 'light',
  locale: 'de-DE',
  serviceWorkers: 'allow',
})
const page = context.pages()[0] ?? (await context.newPage())

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

const seed = seedGame()

// first launch: no game yet → setup screen
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Neues Spiel', { timeout: 15000 })
await page.waitForTimeout(400)
check('Erststart: Startbildschirm mit Spiel-Einrichtung', await page.evaluate(() => document.body.innerText.includes('Team')))
await shot(page, '00-setup')

// returning player: the game was persisted before, so a reload must restore it
await page.evaluate((game) => {
  localStorage.setItem('bosseln:game:v1', JSON.stringify(game))
  localStorage.setItem(
    'bosseln:prefs:v1',
    JSON.stringify({ lang: 'de', theme: 'light', textScale: 'normal', relays: ['https://relay.peer.ooo/gun'], syncEnabled: false }),
  )
}, seed)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Deichweg', { timeout: 15000 })
await page.waitForTimeout(700)

/* 1 — score screen at a glance ------------------------------------------- */

const view = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent)
  const rects = btns.map((b) => ({
    t: (b.textContent || '').trim().slice(0, 22),
    h: Math.round(b.getBoundingClientRect().height),
  }))
  const cards = [...document.querySelectorAll('.team-glow')].map((card) => ({
    name: (card.querySelector('p')?.textContent ?? '').replace('🎂', '').trim(),
    throws: Number(card.querySelector('[data-stat="throws"]')?.dataset.value),
    penalties: Number(card.querySelector('[data-stat="penalties"]')?.dataset.value),
    drinks: Number(card.querySelector('[data-stat="drinks"]')?.dataset.value),
  }))
  return {
    cards,
    small: rects.filter((r) => r.h > 0 && r.h < 44),
    min: Math.min(...rects.map((r) => r.h).filter((h) => h > 0)),
    body: document.body.innerText,
    vw: innerWidth,
  }
})

check('Score: eine Karte je Team', view.cards.length === 3, view.cards.map((c) => c.name).join(', '))
check(
  'Score: Touch-Targets ≥ 44px (Handschuh-/Gehbetrieb)',
  view.small.length === 0,
  view.small.length ? JSON.stringify(view.small) : `kleinstes = ${view.min}px @ ${view.vw}px Viewport`,
)

const exp = expectFrom(seed)
const byName = { 'Team Rot': 't1', 'Team Blau': 't2', 'Team Grün': 't3' }
const mismatches = view.cards.flatMap((c) => {
  const e = exp[byName[c.name]]
  return ['throws', 'penalties', 'drinks']
    .filter((k) => e[k] !== c[k])
    .map((k) => `${c.name}.${k}: DOM=${c[k]} erwartet=${e[k]}`)
})
check('Score: Zahlen stimmen exakt mit dem Ereignis-Log überein', mismatches.length === 0, mismatches.join(' | '))
check('Score: Joker rechnet die Strafe weg (Team Rot 1 Strafe → 0)', exp.t1.penalties === 0 && view.cards.find((c) => c.name === 'Team Rot').penalties === 0)
check('Score: Kopfzeile mit Strecke + Führendem', /Deichweg/.test(view.body) && /Vorne: Team Grün/.test(view.body))
check('Score: Werfer-Rotation sichtbar', /Nächster: \w+/.test(view.body))
check('Score: 3 Teams vertikal gestapelt statt gequetscht', await page.evaluate(() => getComputedStyle(document.querySelector('.team-glow').parentElement).display === 'flex'))
await shot(page, '01-score-3-teams')

/* 2 — throw, rotation, undo --------------------------------------------- */

const before = (await stored(page)).events.length
const nextBefore = await page.locator('.team-glow').first().locator('text=/Nächster: /').innerText()
await page.locator('.team-glow').first().getByRole('button', { name: /Wurf Team Rot/ }).click()
await page.waitForTimeout(350)

const after = await stored(page)
const thrown = after.events[after.events.length - 1]
const rot = { t1: ['p1', 'p2'], t2: ['p3', 'p4'], t3: ['p5'] }
const expectedNext = rot.t1[after.events.filter((e) => e.type === 'throw' && e.teamId === 't1').length % 2]
const nextAfter = await page.locator('.team-glow').first().locator('text=/Nächster: /').innerText()
check('Wurf: Event wird angehängt und dem Werfer zugeordnet', after.events.length === before + 1 && thrown.type === 'throw' && thrown.playerId, `player=${thrown.playerId}`)
check(
  'Wurf: Rotation Jan → Anna stimmt mit dem Log überein',
  nextAfter.includes(expectedNext === 'p2' ? 'Anna' : 'Jan') && nextBefore !== nextAfter,
  `${nextBefore.trim()} → ${nextAfter.trim()}`,
)
await shot(page, '02-throw-toast')

await page.locator('button[aria-label="Rückgängig"]').first().click()
await page.waitForTimeout(300)
check('Undo: Event entfernt, Rotation zurückgesetzt', (await stored(page)).events.length === before)

/* 3 — penalty flow (custom rule + drink in one pass) -------------------- */

await page.locator('.team-glow').first().getByRole('button', { name: /Strafe/ }).click()
await page.waitForTimeout(320)
const reasonCount = await page.getByRole('dialog').locator('button').count()
check('Strafe: Sheet zeigt alle Gründe inkl. eigener Regel', reasonCount >= 8, `${reasonCount} Buttons`)
await shot(page, '03-penalty-sheet')

await page.getByRole('dialog').getByText('Ball im Bach').click()
await page.waitForTimeout(320)
const drinkStep = await page.getByRole('dialog').innerText()
check('Strafe: Trinkfolge wird abgefragt (Grund mit 🍺)', /Wer trinkt|Team Rot/.test(drinkStep))
await page.getByRole('dialog').getByRole('button', { name: /Team Rot/ }).first().click()
await page.waitForTimeout(350)

const afterPenalty = await stored(page)
const tail = afterPenalty.events.slice(-2)
check(
  'Strafe: eigener Grund → 2 Punkte + Schluck, beide als eigene Events',
  tail[0].type === 'penalty' && tail[0].points === 2 && tail[0].ruleId === 'r-custom-1' && tail[1].type === 'drink' && tail[1].source === 'penalty',
  tail.map((e) => `${e.type}${e.points ? `(${e.points})` : ''}`).join(' + '),
)

/* 4 — party card --------------------------------------------------------- */

await page.getByRole('button', { name: /Karte ziehen/ }).click()
await page.waitForTimeout(450)
const cardText = await page.getByRole('dialog').innerText()
check('Partykarte: Karte gezogen, Kategorie + Text sichtbar', cardText.length > 20, cardText.split('\n').slice(0, 3).join(' / '))
check('Partykarte: Ereignis im Log', (await stored(page)).events.some((e) => e.type === 'card'))
await shot(page, '04-party-card')
await page.getByRole('dialog').getByRole('button', { name: /Nur vormachen|Eintragen|Schluck|Wasser/ }).last().click()
await page.waitForTimeout(300)

/* 5 — rules / party / history ------------------------------------------- */

await goNav(page, 'Regeln')
const rulesText = await page.evaluate(() => document.body.innerText)
check('Regeln: Ziel, Werfen, Wertung auf Deutsch erklärt', /Ziel/.test(rulesText) && /Werfen/.test(rulesText) && /Wertung/.test(rulesText))
check('Regeln: vereinfachte Runde klar benannt', /vereinfacht/.test(rulesText))
await shot(page, '05-rules')

await page.getByRole('button', { name: 'Sicherheit' }).click()
await page.waitForTimeout(300)
const safety = await page.evaluate(() => document.body.innerText)
check('Sicherheit: Pfiff als Verkehrswarnung + Vorrang des Verkehrs', /Verkehrswarnung/.test(safety) && /Vorrang|vorrang|priorit/.test(safety))
await shot(page, '06-rules-safety')

await goNav(page, 'Party')
const partyText = await page.evaluate(() => document.body.innerText)
check('Party: Kategorien getrennt schaltbar', /Trinkkarten/.test(partyText) && /Harmlos/.test(partyText) && /Spiel-Auflagen/.test(partyText))
await shot(page, '07-party')

await goNav(page, 'Verlauf')
const historyText = await page.evaluate(() => document.body.innerText)
check('Verlauf: Würfe fortlaufend nummeriert', /Wurf #\d/.test(historyText))
check('Verlauf: Strafe mit Grund und Punkten', /Ball im Graben \(\+1 Strafe\)/.test(historyText))
check('Verlauf: eigene Strafe mit 2 Punkten', /Ball im Bach \(\+2 Strafe/.test(historyText))
check('Verlauf: Schlucke getrennt gelistet (inkl. alkoholfrei)', /Schluck/.test(historyText))
check('Verlauf: Joker-Eintrag sichtbar', /Joker/.test(historyText))
check('Verlauf: Auflage aus Partykarte sichtbar', /Auflage/.test(historyText))
await shot(page, '08-history')

/* 6 — settings, scoring switch, export ---------------------------------- */

await goNav(page, 'Einstellungen')
await shot(page, '09-settings')

const exported = await page.evaluate(async () => {
  const real = URL.createObjectURL
  let blob = null
  URL.createObjectURL = (b) => {
    blob = b
    return real.call(URL, b) // keep the real URL so the download itself still works
  }
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('JSON sichern'))
  btn.click()
  await new Promise((r) => setTimeout(r, 400))
  URL.createObjectURL = real
  return blob ? await blob.text() : null
})
let exportOk = false
let exportInfo = 'kein Blob'
if (exported) {
  try {
    const parsed = JSON.parse(exported)
    const game = parsed.game ?? parsed
    exportOk = Array.isArray(game.events) && game.teams.length === 3 && game.events.length > 15
    exportInfo = `${exported.length} Bytes · ${game.events.length} Events · ${game.teams.length} Teams`
  } catch (err) {
    exportInfo = `JSON-Fehler ${err.message}`
  }
}
check('Export: vollständiger JSON-Snapshot (Teams + Events)', exportOk, exportInfo)

await page.getByRole('button', { name: /Jede Strafe zählt einen Wurf/ }).click()
await page.waitForTimeout(300)
const switched = await stored(page)
check(
  'Wertung umstellbar (wird als Ereignis protokolliert)',
  switched.settings.scoringMode === 'additive' && switched.events.some((e) => e.type === 'settings' && e.patch?.scoringMode === 'additive'),
)
await page.getByRole('button', { name: /Strafen nur bei Gleichstand/ }).click()
await page.waitForTimeout(250)

/* 7 — JSON import ------------------------------------------------------- */

const payload = JSON.stringify({ app: 'bosseln', version: 1, game: seedGame({ name: 'Import-Test Runde' }) })
await page.evaluate(async (p) => {
  const input = document.querySelector('input[type="file"][accept*="json"]')
  const dt = new DataTransfer()
  dt.items.add(new File([p], 'bosseln.json', { type: 'application/json' }))
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}, payload)
await page.waitForTimeout(700)
check('Import: Spiel wird ersetzt und sofort persistiert', (await stored(page)).name === 'Import-Test Runde')

/* 8 — finish screen ----------------------------------------------------- */

await goNav(page, 'Punkte')
await page.locator('button[aria-label="Spiel beenden"]').click()
await page.waitForTimeout(320)
await page.getByRole('dialog').getByRole('button', { name: 'Spiel beenden' }).click()
await page.waitForTimeout(600)

const fin = await page.evaluate(() => document.body.innerText)
// note: CSS text-transform is reflected in innerText, so match case-insensitively
for (const [label, ok] of Object.entries({
  'Titel Endstand': /endstand/i.test(fin),
  'Gewinner benannt': /gewonnen:/i.test(fin),
  'Platzierung': /platzierung/i.test(fin),
  'Würfe je Team': /würfe/i.test(fin),
  'Strafpunkte je Team': /strafpunkte/i.test(fin),
  'Schlücke je Team': /schlücke/i.test(fin),
  'Summe der Würfe': /würfe insgesamt/i.test(fin),
  'Kuriositäten-Statistiken': /kuriositäten/i.test(fin),
  'Joker-Status': /joker/i.test(fin),
  'Sauberstes Team / meiste Strafen': /sauberstes team/i.test(fin) && /meiste strafpunkte/i.test(fin),
  'Geburtstagskind benannt': /geburtstagskind/i.test(fin),
  'Teilen-Aktion': /teilen/i.test(fin),
  'Screenshot-Hinweis': /bildschirmfoto/i.test(fin),
  'Hinweis kein Wettkampf': /wettkampf/i.test(fin),
  'Keine Trink-Bewertung (nur neutrale Zählung)': !/bestes trinker|meiste getrunken|trinkkönig/i.test(fin),
})) check(`Endstand: ${label}`, ok)
check('Endstand: als beendet gespeichert', Boolean((await stored(page)).finishedAt))
await shot(page, '10-finish')
await page.evaluate(() => window.scrollTo(0, 900))
await page.waitForTimeout(400)
await shot(page, '11-finish-stats')

/* 9 — persistence + setup screen --------------------------------------- */

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(900)
const reloadText = await page.evaluate(() => document.body.innerText)
const reloaded = await stored(page)
check(
  'Reload: Spielstand überlebt das Neuladen',
  /Import-Test Runde/.test(reloadText) && reloaded.events.length > 15 && Boolean(reloaded.finishedAt),
  `${reloaded.events.length} Events, finished=${Boolean(reloaded.finishedAt)}`,
)
check('Service Worker kontrolliert die Seite', await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))
await shot(page, '12-reload-persisted')

const realErrors = consoleErrors.filter((e) => !/favicon|manifest|ERR_/i.test(e))
check('Keine JS-Fehler', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

writeFileSync(join(HERE, 'report.json'), JSON.stringify({ results, consoleErrors: realErrors }, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} Checks bestanden`)
console.log(`Screenshots: ${SHOTS}`)
await context.close()
process.exit(failed.length ? 1 : 0)
