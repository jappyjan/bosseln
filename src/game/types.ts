/**
 * Domain types for the Boßeln birthday scorer.
 * Pure data only — no UI concerns. Keeping these separate means scoring
 * rules can be changed without touching components.
 */

export type Lang = 'de' | 'en'

/** A) penalties only break ties  B) each penalty adds one throw  C) penalties ignored */
export type ScoringMode = 'tiebreak' | 'additive' | 'ignored'

export type CardCategory = 'harmless' | 'modifier' | 'drinking'

export interface Player {
  id: string
  name: string
}

export interface Team {
  id: string
  name: string
  /** emoji badge, shown large on the team card */
  emoji: string
  /** hex color used for accents (works in light + dark theme) */
  color: string
  players: Player[]
}

export interface PenaltyRule {
  id: string
  /** i18n key for the built-in rules */
  labelKey?: string
  /** free text label for custom rules */
  label?: string
  points: number
  /** triggers a drink penalty by default */
  drink: boolean
  icon: string
  builtIn?: boolean
}

export interface GameSettings {
  scoringMode: ScoringMode
  /** master switch for all drink-related features */
  drinkingEnabled: boolean
  /** drink penalties may be attached to a penalty */
  drinkingCards: boolean
  categories: Record<CardCategory, boolean>
  /** advance to the next player automatically after a throw */
  autoRotate: boolean
  /** show a short vibration on every score action */
  haptics: boolean
}

export type ModifierKind =
  | 'switch_thrower'
  | 'weak_arm'
  | 'no_pressure'
  | 'victory_pose'
  | 'prediction'
  | 'commentator'
  | 'both_feet'

export type EventType =
  | 'game'
  | 'throw'
  | 'penalty'
  | 'drink'
  | 'joker'
  | 'card'
  | 'modifier'
  | 'playerSet'
  | 'settings'
  | 'finish'
  | 'reopen'

export type DrinkSource = 'manual' | 'penalty' | 'card'

/**
 * Every score change is an immutable event. Totals are always derived from
 * the event list, which makes undo / history / cross-device merge trivial.
 */
export interface GameEvent {
  id: string
  /** ISO timestamp — also the merge sort key together with `id` */
  at: string
  type: EventType
  teamId?: string
  playerId?: string
  /** penalty reason */
  ruleId?: string
  points?: number
  /** a drink penalty was attached */
  drink?: boolean
  cardId?: string
  modifier?: ModifierKind
  /** drink assigned to another team / player */
  targetTeamId?: string
  targetPlayerId?: string
  /** non-alcoholic (water, soft drink) — counts as a drink but never as alcohol */
  soft?: boolean
  source?: DrinkSource
  /** birthday joker vs. a party card grant */
  grantedBy?: 'joker' | 'card'
  note?: string
  patch?: Partial<GameSettings>
  label?: string
}

export interface Game {
  id: string
  name: string
  route: string
  createdAt: string
  birthdayTeamId?: string
  birthdayPlayerId?: string
  teams: Team[]
  penaltyRules: PenaltyRule[]
  settings: GameSettings
  events: GameEvent[]
  finishedAt?: string
}

export interface Prefs {
  lang?: Lang
  theme: 'light' | 'dark'
  textScale: 'normal' | 'large'
  relays: string[]
  syncRoom?: string
  syncEnabled: boolean
}

/** Derived, read-only view of a team. */
export interface TeamState {
  id: string
  name: string
  emoji: string
  color: string
  players: Player[]
  throws: number
  /** penalty points after deductions (joker / card grants) */
  penaltyPoints: number
  penaltyCount: number
  discounts: number
  drinks: number
  softDrinks: number
  jokerUsed: boolean
  nextPlayerIndex: number
  nextPlayer: Player | null
  lastThrower: Player | null
  modifiers: ModifierKind[]
  lastEventId?: string
}

export interface Derived {
  teams: TeamState[]
  byId: Record<string, TeamState>
  /** sorted by the active scoring mode */
  ranking: TeamState[]
  finished: boolean
  totals: { throws: number; penaltyPoints: number; drinks: number; events: number }
}
