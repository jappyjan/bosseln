import { places, scoreOf } from './engine'
import type { TFn } from '../i18n'
import type { Derived, Game, TeamState } from './types'

export interface FunStat {
  id: string
  emoji: string
  /** i18n key, interpolated with `value` / `extra` */
  key: string
  value: number | string
  team?: { id: string; name: string; emoji: string }
  extra?: string
}

export interface Stats {
  totalThrows: number
  totalPenalties: number
  totalDrinks: number
  softDrinks: number
  cards: number
  modifiers: number
  events: number
  places: Record<string, number>
  fun: FunStat[]
}

const withTeam = (t: TeamState) => ({ id: t.id, name: t.name, emoji: t.emoji })

export function computeStats(game: Game, d: Derived): Stats {
  const { teams } = d
  const throws = d.totals.throws
  const penalties = teams.reduce((s, t) => s + t.penaltyCount, 0)
  const drinks = teams.reduce((s, t) => s + t.drinks, 0)
  const softDrinks = teams.reduce((s, t) => s + t.softDrinks, 0)
  const cards = game.events.filter((e) => e.type === 'card').length
  const modifiers = game.events.filter((e) => e.type === 'modifier').length

  const fun: FunStat[] = [{ id: 'totalThrows', emoji: '🎯', key: 'stats.totalThrows', value: throws }]

  if (teams.length > 1) {
    const mostThrows = [...teams].sort((a, b) => b.throws - a.throws || a.name.localeCompare(b.name))[0]
    fun.push({ id: 'mostThrows', emoji: '🐌', key: 'stats.mostThrows', value: mostThrows.throws, team: withTeam(mostThrows) })

    const cleanest = [...teams].sort(
      (a, b) => a.penaltyPoints - b.penaltyPoints || a.throws - b.throws || a.name.localeCompare(b.name),
    )[0]
    fun.push({
      id: 'cleanest',
      emoji: '🧼',
      key: 'stats.cleanest',
      value: cleanest.penaltyPoints,
      team: withTeam(cleanest),
    })

    const mostPenalties = [...teams].sort(
      (a, b) => b.penaltyPoints - a.penaltyPoints || a.name.localeCompare(b.name),
    )[0]
    if (mostPenalties.penaltyPoints > 0) {
      fun.push({
        id: 'mostPenalties',
        emoji: '⚠️',
        key: 'stats.mostPenalties',
        value: mostPenalties.penaltyPoints,
        team: withTeam(mostPenalties),
      })
    }

    const mostDrinks = [...teams].sort((a, b) => b.drinks - a.drinks || a.name.localeCompare(b.name))[0]
    if (drinks > 0 && mostDrinks.drinks > 0) {
      fun.push({
        id: 'mostDrinks',
        emoji: '🍺',
        key: 'stats.mostDrinks',
        value: mostDrinks.drinks,
        team: withTeam(mostDrinks),
      })
    }
  }

  const birthday = teams.find((t) => t.id === game.birthdayTeamId)
  if (birthday) {
    fun.push({
      id: 'birthday',
      emoji: '🎂',
      key: 'stats.birthday',
      value: game.birthdayPlayerId
        ? birthday.players.find((p) => p.id === game.birthdayPlayerId)?.name ?? birthday.name
        : birthday.name,
      team: withTeam(birthday),
    })
    fun.push({
      id: 'joker',
      emoji: '🃏',
      key: birthday.jokerUsed ? 'stats.jokerUsed' : 'stats.jokerUnused',
      value: birthday.jokerUsed ? 1 : 0,
      team: withTeam(birthday),
    })
  }

  if (cards > 0) fun.push({ id: 'cards', emoji: '🎴', key: 'stats.cardsDrawn', value: cards })
  if (penalties > 0) fun.push({ id: 'penalties', emoji: '🚩', key: 'stats.penaltyEvents', value: penalties })
  if (drinks > 0) {
    fun.push({ id: 'drinks', emoji: '🥤', key: 'stats.drinkEvents', value: drinks, extra: String(softDrinks) })
  }
  if (teams.length > 1 && throws > 0) {
    const closest = spacing(teams, game.settings.scoringMode)
    fun.push({ id: 'spacing', emoji: '📏', key: 'stats.spacing', value: closest })
  }

  return {
    totalThrows: throws,
    totalPenalties: penalties,
    totalDrinks: drinks,
    softDrinks,
    cards,
    modifiers,
    events: game.events.length,
    places: places(d.ranking, game.settings.scoringMode),
    fun,
  }
}

/** smallest gap between two teams in the final ranking */
function spacing(teams: TeamState[], mode: Game['settings']['scoringMode']): number {
  const scores = teams.map((t) => scoreOf(t, mode)).sort((a, b) => a - b)
  let min = Number.POSITIVE_INFINITY
  for (let i = 1; i < scores.length; i += 1) min = Math.min(min, scores[i] - scores[i - 1])
  return Number.isFinite(min) ? min : 0
}

/** shareable plain-text result, also used for the Web Share API / clipboard */
export function resultText(game: Game, d: Derived, t: TFn): string {
  const p = places(d.ranking, game.settings.scoringMode)
  const lines = [`${game.name}${game.route ? ` — ${game.route}` : ''}`, '']
  d.ranking.forEach((team) => {
    lines.push(
      `${p[team.id]}. ${team.emoji} ${team.name} — ${team.throws} ${t('score.throwsShort')}` +
        ` · ${team.penaltyPoints} ${t('score.penaltyShort')} · ${team.drinks} ${t('score.drinkShort')}`,
    )
  })
  lines.push('', `${t('finish.totalThrows')}: ${d.totals.throws}`)
  return lines.join('\n')
}
