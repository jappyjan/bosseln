import { DEFAULT_PENALTY_RULES, uid } from './rules'
import { DEFAULT_BROKERS } from './sync'
import { defaultSettings } from './engine'
import type { Game, Lang, Prefs } from './types'

const GAME_KEY = 'bosseln:game:v1'
const PREFS_KEY = 'bosseln:prefs:v1'

export const defaultPrefs = (): Prefs => ({
  theme: 'light',
  textScale: 'normal',
  brokers: DEFAULT_BROKERS,
  syncEnabled: false,
  deviceId: uid(),
})

export function guessLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const cands = [nav?.language, ...(nav?.languages ?? [])].filter(Boolean) as string[]
  for (const c of cands) {
    const l = c.toLowerCase()
    if (l.startsWith('de')) return 'de'
  }
  return cands.length ? 'en' : 'de'
}

/* ------------------------------------------------------------------ prefs */

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPrefs()
    const parsed = JSON.parse(raw) as Partial<Prefs> & { relays?: string[] }
    const base = defaultPrefs()
    // `relays` was the Gun-era key; keep such installs working
    const brokers = parsed.brokers?.length ? parsed.brokers : base.brokers
    return {
      ...base,
      ...parsed,
      brokers,
      deviceId: parsed.deviceId ?? base.deviceId,
    }
  } catch {
    return defaultPrefs()
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* storage full or blocked — the app keeps working in memory */
  }
}

/* ------------------------------------------------------------------- game */

export function loadGame(): Game | null {
  try {
    const raw = localStorage.getItem(GAME_KEY)
    if (!raw) return null
    return normalizeGame(JSON.parse(raw) as Game)
  } catch {
    return null
  }
}

export function saveGame(game: Game): void {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(game))
  } catch {
    /* ignore quota errors, in-memory game continues */
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(GAME_KEY)
  } catch {
    /* ignore */
  }
}

/** tolerate older / partially broken payloads so a game is never lost */
export function normalizeGame(input: unknown): Game {
  const g = input as Game
  if (!g || typeof g !== 'object') throw new Error('invalid game')
  if (!Array.isArray(g.teams) || g.teams.length < 1) throw new Error('invalid teams')
  const teams = g.teams.map((t, i) => ({
    id: t.id ?? `t${i}`,
    name: t.name ?? `Team ${i + 1}`,
    emoji: t.emoji ?? '🍺',
    color: t.color ?? '#2563eb',
    players: Array.isArray(t.players) ? t.players.map((p, j) => ({ id: p.id ?? `p${i}${j}`, name: p.name ?? '' })) : [],
  }))
  const settings = { ...defaultSettings(), ...(g.settings ?? {}) }
  settings.categories = { ...defaultSettings().categories, ...(g.settings?.categories ?? {}) }
  return {
    id: g.id ?? `game-${Date.now()}`,
    name: g.name ?? 'Boßeln',
    route: g.route ?? '',
    createdAt: g.createdAt ?? new Date().toISOString(),
    birthdayTeamId: g.birthdayTeamId,
    birthdayPlayerId: g.birthdayPlayerId,
    teams,
    penaltyRules: Array.isArray(g.penaltyRules) && g.penaltyRules.length ? g.penaltyRules : DEFAULT_PENALTY_RULES,
    settings,
    events: Array.isArray(g.events) ? g.events.filter((e) => e && e.id && e.at && e.type) : [],
    finishedAt: g.finishedAt,
  }
}

export function exportJson(game: Game): string {
  return JSON.stringify({ app: 'bosseln', version: 1, exportedAt: new Date().toISOString(), game }, null, 2)
}

export function downloadJson(game: Game): void {
  const blob = new Blob([exportJson(game)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${game.name.replace(/[^\w.-]+/g, '_') || 'bosseln'}-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseImport(text: string): Game {
  const data = JSON.parse(text) as { game?: unknown }
  return normalizeGame(data?.game ?? data)
}
