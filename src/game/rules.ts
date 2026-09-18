import type { CardCategory, ModifierKind, PenaltyRule, Team } from './types'

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const nowIso = (): string => new Date().toISOString()

export const DEFAULT_PENALTY_RULES: PenaltyRule[] = [
  { id: 'ditch', labelKey: 'penalty.ditch', points: 1, drink: false, icon: '🌊', builtIn: true },
  { id: 'line', labelKey: 'penalty.line', points: 1, drink: false, icon: '📏', builtIn: true },
  { id: 'whistle', labelKey: 'penalty.whistle', points: 1, drink: true, icon: '🚨', builtIn: true },
  { id: 'lost', labelKey: 'penalty.lost', points: 1, drink: false, icon: '🔍', builtIn: true },
  { id: 'house', labelKey: 'penalty.house', points: 1, drink: false, icon: '🏠', builtIn: true },
  { id: 'custom', labelKey: 'penalty.custom', points: 1, drink: false, icon: '✏️', builtIn: true },
]

export type DrinkTarget = 'choose' | 'allButBirthday' | 'birthday' | 'mostThrows' | 'all'

export type CardAction =
  | { kind: 'drink'; target: DrinkTarget; soft?: boolean }
  | { kind: 'modifier'; modifier: ModifierKind }
  | { kind: 'removePenalty'; target: 'birthday' | 'choose' }
  | { kind: 'info' }

export interface PartyCard {
  id: string
  category: CardCategory
  icon: string
  /** mechanical parts the app can record with one tap */
  actions: CardAction[]
}

/**
 * Card texts live in the i18n files under `card.<id>.title` / `card.<id>.body`.
 * Drinking cards always mean "one small sip" and alcohol-free counts the same.
 */
export const PARTY_CARDS: PartyCard[] = [
  {
    id: 'perfect_line',
    category: 'harmless',
    icon: '🎯',
    actions: [{ kind: 'drink', target: 'choose' }],
  },
  {
    id: 'birthday_privilege',
    category: 'drinking',
    icon: '👑',
    actions: [{ kind: 'removePenalty', target: 'birthday' }],
  },
  {
    id: 'birthday_tax',
    category: 'drinking',
    icon: '🎂',
    actions: [{ kind: 'drink', target: 'allButBirthday' }],
  },
  {
    id: 'team_cheers',
    category: 'drinking',
    icon: '📣',
    actions: [{ kind: 'drink', target: 'mostThrows' }],
  },
  { id: 'water_break', category: 'harmless', icon: '💧', actions: [{ kind: 'drink', target: 'all', soft: true }] },
  { id: 'switch_thrower', category: 'modifier', icon: '🔁', actions: [{ kind: 'modifier', modifier: 'switch_thrower' }] },
  { id: 'weak_arm', category: 'modifier', icon: '💪', actions: [{ kind: 'modifier', modifier: 'weak_arm' }] },
  { id: 'commentator', category: 'modifier', icon: '🎙️', actions: [{ kind: 'modifier', modifier: 'commentator' }] },
  { id: 'prediction', category: 'modifier', icon: '🔮', actions: [{ kind: 'modifier', modifier: 'prediction' }] },
  { id: 'no_pressure', category: 'modifier', icon: '🤫', actions: [{ kind: 'modifier', modifier: 'no_pressure' }] },
  { id: 'victory_pose', category: 'modifier', icon: '🏆', actions: [{ kind: 'modifier', modifier: 'victory_pose' }] },
  { id: 'both_feet', category: 'modifier', icon: '🦶', actions: [{ kind: 'modifier', modifier: 'both_feet' }] },
  { id: 'group_photo', category: 'harmless', icon: '📸', actions: [{ kind: 'info' }] },
  { id: 'toast', category: 'drinking', icon: '🥂', actions: [{ kind: 'drink', target: 'all' }] },
  { id: 'hand_it_over', category: 'drinking', icon: '🤝', actions: [{ kind: 'drink', target: 'choose' }] },
  { id: 'ball_kiss', category: 'harmless', icon: '💋', actions: [{ kind: 'info' }] },
  { id: 'route_check', category: 'harmless', icon: '🗺️', actions: [{ kind: 'info' }] },
  { id: 'captain_speech', category: 'harmless', icon: '🗣️', actions: [{ kind: 'info' }] },
]

export const CARD_CATEGORIES: CardCategory[] = ['harmless', 'modifier', 'drinking']

export const MODIFIER_KINDS: ModifierKind[] = [
  'switch_thrower',
  'weak_arm',
  'no_pressure',
  'victory_pose',
  'prediction',
  'commentator',
  'both_feet',
]

export const TEAM_EMOJIS = ['🍺', '🚀', '🐢', '🦊', '🐗', '⚡', '🍀', '🐳', '🌻', '🦉', '🎈', '🧨']

export const TEAM_COLORS = [
  '#e11d48',
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
]

export const newTeam = (index: number, name?: string): Team => ({
  id: uid(),
  name: name ?? `Team ${index + 1}`,
  emoji: TEAM_EMOJIS[index % TEAM_EMOJIS.length],
  color: TEAM_COLORS[index % TEAM_COLORS.length],
  players: [],
})

export const ruleLabel = (rule: PenaltyRule): string => rule.label ?? rule.labelKey ?? rule.id

/**
 * Verified reachable public Gun relay. Users can add more (or their own peer)
 * in Settings → Device sync. Dead default peers only cause reconnect noise,
 * so we ship the one that actually answers.
 */
export const DEFAULT_RELAYS = ['https://relay.peer.ooo/gun']
