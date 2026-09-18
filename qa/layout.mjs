/**
 * Layout risk check across real phone widths: horizontal overflow, cramped
 * layouts and touch-target size on every screen, for 2 and for 6 teams.
 *
 * Usage: BASE_URL=http://127.0.0.1:4173 node layout.mjs
 */
import { chromium } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'
const SHOTS = join(HERE, 'shots')

const VIEWPORTS = [
  { name: 'iPhone-13_390x844', width: 390, height: 844, dsf: 3 },
  { name: 'Android-small_360x740', width: 360, height: 740, dsf: 2 },
  { name: 'iPhone-ProMax_430x932', width: 430, height: 932, dsf: 3 },
]

const makeGame = (teamCount) => {
  const names = ['Team Rot', 'Team Blau', 'Team Grün', 'Team Gelb', 'Team Lila', 'Team Türkis']
  const emojis = ['🍺', '🚀', '🐢', '🦊', '🐗', '⚡']
  const colors = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2']
  const events = [{ id: 'e0', at: new Date().toISOString(), type: 'game', note: 'Layout Test' }]
  const teams = Array.from({ length: teamCount }, (_, i) => ({
    id: `t${i + 1}`,
    name: names[i],
    emoji: emojis[i],
    color: colors[i],
    players: [{ id: `p${i}a`, name: 'Jan' }, { id: `p${i}b`, name: 'Anna' }],
  }))
  teams.forEach((t, i) => {
    events.push({ id: `th${i}`, at: new Date(Date.now() + i * 1000).toISOString(), type: 'throw', teamId: t.id, playerId: t.players[0].id })
    if (i % 2 === 0) {
      events.push({ id: `pe${i}`, at: new Date(Date.now() + i * 1000 + 10).toISOString(), type: 'penalty', teamId: t.id, ruleId: 'whistle', points: 2 })
      events.push({ id: `dr${i}`, at: new Date(Date.now() + i * 1000 + 20).toISOString(), type: 'drink', teamId: t.id, source: 'penalty' })
    }
  })
  return {
    id: 'layout-game',
    name: 'Geburtstag Boßeln',
    route: 'Deichweg bis zum Pavillon',
    createdAt: new Date().toISOString(),
    birthdayTeamId: 't1',
    teams,
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
      haptics: true,
    },
    events,
  }
}

const problems = []
const report = (line) => console.log(line)

const browser = await chromium.launch()
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: true,
    hasTouch: true,
    locale: 'de-DE',
  })
  const page = await context.newPage()

  for (const teamCount of [2, 6]) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.evaluate((game) => {
      localStorage.setItem('bosseln:game:v1', JSON.stringify(game))
      localStorage.setItem('bosseln:prefs:v1', JSON.stringify({ lang: 'de', theme: 'light', textScale: 'normal', relays: [], syncEnabled: false }))
    }, makeGame(teamCount))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)

    const screens = [
      ['score', null],
      ['history', 'Verlauf'],
      ['party', 'Party'],
      ['rules', 'Regeln'],
      ['settings', 'Einstellungen'],
    ]
    for (const [screen, navLabel] of screens) {
      if (navLabel) {
        await page.locator('nav').getByRole('button', { name: navLabel }).click()
        await page.waitForTimeout(350)
      }
      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const wide = [...document.querySelectorAll('body *')]
          .map((el) => ({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40), r: el.getBoundingClientRect() }))
          .filter((x) => x.r.width > vw + 1 && x.r.height > 0 && getComputedStyle(document.querySelector('body *')).position !== 'fixed')
          .slice(0, 3)
        const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent)
        const small = btns
          .map((b) => ({ t: (b.textContent || '').trim().slice(0, 18), h: Math.round(b.getBoundingClientRect().height) }))
          .filter((r) => r.h > 0 && r.h < 44)
        return {
          scrollW: document.documentElement.scrollWidth,
          clientW: vw,
          wide: wide.map((x) => `${x.tag}.${x.cls} w=${Math.round(x.r.width)}`),
          small,
        }
      })
      const overflow = m.scrollW > m.clientW + 1
      if (overflow) problems.push(`${vp.name} ${teamCount}T ${screen}: horizontal overflow scroll=${m.scrollW} client=${m.clientW} ${JSON.stringify(m.wide)}`)
      if (m.small.length) problems.push(`${vp.name} ${teamCount}T ${screen}: touch targets < 44px ${JSON.stringify(m.small)}`)
      report(
        `${overflow || m.small.length ? 'WARN' : 'ok  '}  ${vp.name}  ${teamCount} Teams  ${screen.padEnd(9)} scroll=${m.scrollW}/${m.clientW} small=${m.small.length}`,
      )
      if (screen === 'score') await page.screenshot({ path: join(SHOTS, `vp-${vp.name}-${teamCount}teams-score.png`) })
    }
  }
  await context.close()
}

await browser.close()
console.log('')
if (problems.length) {
  console.log(`PROBLEME (${problems.length}):`)
  problems.forEach((p) => console.log(' - ' + p))
  process.exit(1)
}
console.log('Kein horizontaler Überlauf, alle Touch-Targets ≥ 44px auf allen getesteten Breiten.')
