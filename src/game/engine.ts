import { uid, nowIso, DEFAULT_PENALTY_RULES } from './rules'
import type {
  Derived,
  Game,
  GameEvent,
  GameSettings,
  ModifierKind,
  PenaltyRule,
  ScoringMode,
  Team,
  TeamState,
} from './types'

/** events are sorted deterministically so every device derives the same state */
export const sortEvents = (events: GameEvent[]): GameEvent[] =>
  [...events].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)))

export const defaultSettings = (): GameSettings => ({
  scoringMode: 'tiebreak',
  drinkingEnabled: true,
  drinkingCards: true,
  categories: { harmless: true, modifier: true, drinking: true },
  autoRotate: true,
  haptics: true,
})

export interface NewGameConfig {
  name: string
  route: string
  teams: Team[]
  birthdayTeamId?: string
  birthdayPlayerId?: string
  penaltyRules: PenaltyRule[]
  settings: GameSettings
}

export function createGame(cfg: NewGameConfig): Game {
  const id = uid()
  const now = nowIso()
  const game: Game = {
    id,
    name: cfg.name.trim() || 'Boßeln',
    route: cfg.route.trim(),
    createdAt: now,
    birthdayTeamId: cfg.birthdayTeamId,
    birthdayPlayerId: cfg.birthdayPlayerId,
    teams: cfg.teams,
    penaltyRules: cfg.penaltyRules.length ? cfg.penaltyRules : DEFAULT_PENALTY_RULES,
    settings: cfg.settings,
    events: [],
  }
  game.events = [makeEvent('game', { note: game.name })]
  return game
}

export function makeEvent(type: GameEvent['type'], partial: Partial<GameEvent> = {}): GameEvent {
  return { id: uid(), at: nowIso(), type, ...partial }
}

export const appendEvent = (game: Game, ev: GameEvent): Game => ({
  ...game,
  events: [...game.events, ev],
})

/** Turn an event list into read-only team totals. Pure. */
export function derive(game: Game): Derived {
  const raw: Record<string, TeamState> = {}
  const order: string[] = []

  for (const team of game.teams) {
    order.push(team.id)
    raw[team.id] = {
      id: team.id,
      name: team.name,
      emoji: team.emoji,
      color: team.color,
      players: team.players,
      throws: 0,
      penaltyPoints: 0,
      penaltyCount: 0,
      discounts: 0,
      drinks: 0,
      softDrinks: 0,
      jokerUsed: false,
      nextPlayerIndex: 0,
      nextPlayer: team.players[0] ?? null,
      lastThrower: null,
      modifiers: [],
    }
  }

  let settings = game.settings
  let finished = Boolean(game.finishedAt)

  const advance = (t: TeamState) => {
    if (!t.players.length) return
    t.nextPlayerIndex = (t.nextPlayerIndex + 1) % t.players.length
  }

  for (const ev of sortEvents(game.events)) {
    const t = ev.teamId ? raw[ev.teamId] : undefined
    switch (ev.type) {
      case 'throw': {
        if (!t) break
        t.lastThrower = t.players[t.nextPlayerIndex] ?? null
        t.throws += 1
        t.lastEventId = ev.id
        if (settings.autoRotate) advance(t)
        t.modifiers = []
        break
      }
      case 'penalty': {
        if (!t) break
        const points = typeof ev.points === 'number' ? ev.points : 1
        t.penaltyPoints += points
        t.penaltyCount += 1
        t.lastEventId = ev.id
        break
      }
      case 'drink': {
        const target = raw[ev.teamId ?? ''] ?? (ev.targetTeamId ? raw[ev.targetTeamId] : undefined)
        if (!target) break
        target.drinks += 1
        if (ev.soft) target.softDrinks += 1
        target.lastEventId = ev.id
        break
      }
      case 'joker': {
        if (!t) break
        t.discounts += 1
        if (ev.grantedBy !== 'card') t.jokerUsed = true
        t.lastEventId = ev.id
        break
      }
      case 'modifier': {
        if (!t || !ev.modifier) break
        if (!t.modifiers.includes(ev.modifier as ModifierKind)) t.modifiers.push(ev.modifier as ModifierKind)
        t.lastEventId = ev.id
        if (ev.modifier === 'switch_thrower') advance(t)
        break
      }
      case 'playerSet': {
        if (!t || !ev.playerId) break
        const idx = t.players.findIndex((p) => p.id === ev.playerId)
        if (idx >= 0) {
          t.nextPlayerIndex = idx
          t.lastEventId = ev.id
        }
        break
      }
      case 'settings': {
        settings = { ...settings, ...(ev.patch ?? {}) }
        break
      }
      case 'finish':
        finished = true
        break
      case 'reopen':
        finished = false
        break
      default:
        break
    }
  }

  const teams = order.map((id) => {
    const t = raw[id]
    t.penaltyPoints = Math.max(0, t.penaltyPoints - t.discounts)
    t.nextPlayer = t.players[t.nextPlayerIndex] ?? null
    return t
  })

  const byId: Record<string, TeamState> = {}
  for (const t of teams) byId[t.id] = t

  return {
    teams,
    byId,
    ranking: rankTeams(teams, settings.scoringMode),
    finished,
    totals: {
      throws: teams.reduce((s, t) => s + t.throws, 0),
      penaltyPoints: teams.reduce((s, t) => s + t.penaltyPoints, 0),
      drinks: teams.reduce((s, t) => s + t.drinks, 0),
      events: game.events.length,
    },
  }
}

export const scoreOf = (t: TeamState, mode: ScoringMode): number =>
  mode === 'additive' ? t.throws + t.penaltyPoints : t.throws

export function rankTeams(teams: TeamState[], mode: ScoringMode): TeamState[] {
  return [...teams].sort((a, b) => {
    const diff = scoreOf(a, mode) - scoreOf(b, mode)
    if (diff !== 0) return diff
    if (mode !== 'ignored' && a.penaltyPoints !== b.penaltyPoints) {
      return a.penaltyPoints - b.penaltyPoints
    }
    if (a.throws !== b.throws) return a.throws - b.throws
    return a.name.localeCompare(b.name)
  })
}

/** 1-based place, equal scores share a place */
export function places(ranking: TeamState[], mode: ScoringMode): Record<string, number> {
  const out: Record<string, number> = {}
  let lastScore: number | null = null
  let lastPlace = 0
  ranking.forEach((t, i) => {
    const s = scoreOf(t, mode)
    if (lastScore === null || s !== lastScore) {
      lastPlace = i + 1
      lastScore = s
    }
    out[t.id] = lastPlace
  })
  return out
}

export const penaltyRuleById = (game: Game, id?: string): PenaltyRule | undefined =>
  id ? game.penaltyRules.find((r) => r.id === id) : undefined

export const teamById = (game: Game, id?: string): Team | undefined =>
  id ? game.teams.find((t) => t.id === id) : undefined

export const playerName = (game: Game, playerId?: string): string | undefined => {
  if (!playerId) return undefined
  for (const t of game.teams) {
    const p = t.players.find((x) => x.id === playerId)
    if (p) return p.name
  }
  return undefined
}

/** the team with the highest score, used by a few party cards */
export function trailingTeam(d: Derived, mode: ScoringMode): TeamState | undefined {
  const ranking = rankTeams(d.teams, mode)
  return ranking.length ? ranking[ranking.length - 1] : undefined
}

export function leaderTeam(d: Derived, mode: ScoringMode): TeamState | undefined {
  return rankTeams(d.teams, mode)[0]
}
