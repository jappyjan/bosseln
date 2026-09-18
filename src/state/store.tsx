import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  appendEvent,
  createGame,
  derive,
  makeEvent,
  type NewGameConfig,
} from '../game/engine'
import { PARTY_CARDS, type PartyCard } from '../game/rules'
import {
  clearGame as clearStoredGame,
  guessLang,
  loadGame,
  loadPrefs,
  normalizeGame,
  parseImport,
  saveGame,
  savePrefs,
} from '../game/storage'
import { startSync, type SyncHandle, type SyncStatus } from '../game/sync'
import type {
  Derived,
  Game,
  GameEvent,
  GameSettings,
  Lang,
  ModifierKind,
  PenaltyRule,
  Player,
  Prefs,
} from '../game/types'
import type { TranslationKey } from '../i18n/de'

export type Screen = 'score' | 'history' | 'party' | 'rules' | 'settings' | 'finish'
export type ToastVars = Record<string, string | number>

export interface Toast {
  id: string
  key: TranslationKey
  vars?: ToastVars
  subKey?: TranslationKey
  subVars?: ToastVars
  undoable: boolean
}

export const EMPTY_DERIVED: Derived = {
  teams: [],
  byId: {},
  ranking: [],
  finished: false,
  totals: { throws: 0, penaltyPoints: 0, drinks: 0, events: 0 },
}

/** which cards may appear given the current settings */
export function deckFor(settings: GameSettings): PartyCard[] {
  return PARTY_CARDS.filter((card) => {
    if (!settings.categories[card.category]) return false
    if (card.category === 'drinking') return settings.drinkingEnabled && settings.drinkingCards
    return true
  })
}

interface StoreValue {
  ready: boolean
  game: Game | null
  derived: Derived
  prefs: Prefs
  lang: Lang
  manualLang: Lang | null
  setLang: (lang: Lang | null) => void
  setPrefs: (patch: Partial<Prefs>) => void
  screen: Screen
  setScreen: (s: Screen) => void
  toast: Toast | null
  showToast: (key: TranslationKey, vars?: ToastVars, undoable?: boolean) => void
  dismissToast: () => void

  startGame: (cfg: NewGameConfig) => void
  /** raw append — used by sheets for card-driven events */
  dispatch: (ev: GameEvent) => void
  addThrow: (teamId: string) => void
  addPenalty: (
    teamId: string,
    rule: PenaltyRule,
    opts?: { points?: number; drink?: boolean; note?: string; label?: string; playerId?: string },
  ) => void
  addDrink: (
    teamId: string,
    opts?: { soft?: boolean; source?: GameEvent['source']; targetTeamId?: string; playerId?: string },
  ) => void
  useJoker: (teamId: string) => void
  drawCard: (teamId?: string) => PartyCard | null
  setModifier: (teamId: string, modifier: ModifierKind) => void
  setNextPlayer: (teamId: string, playerId: string) => void
  updateSettings: (patch: Partial<GameSettings>) => void
  updateGame: (patch: Partial<Game>) => void
  addPenaltyRule: (rule: PenaltyRule) => void
  updatePenaltyRule: (rule: PenaltyRule) => void
  removePenaltyRule: (id: string) => void
  setPlayers: (teamId: string, players: Player[]) => void
  undo: () => void
  removeEvent: (id: string) => void
  finish: () => void
  reopen: () => void
  resetGame: () => void
  importGame: (text: string) => boolean
  haptic: (kind?: 'light' | 'medium' | 'heavy') => void
  syncStatus: SyncStatus
  syncMismatch: string | null
  lastEvent: GameEvent | null
}

const StoreCtx = createContext<StoreValue | null>(null)

const OFF_STATUS: SyncStatus = { state: 'off', peers: 0, room: '', remoteEvents: 0 }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [game, setGame] = useState<Game | null>(null)
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs())
  const [screen, setScreen] = useState<Screen>('score')
  const [toast, setToast] = useState<Toast | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(OFF_STATUS)
  const [syncMismatch, setSyncMismatch] = useState<string | null>(null)

  const syncRef = useRef<SyncHandle | null>(null)
  const toastTimer = useRef<number | null>(null)
  const recentCards = useRef<string[]>([])
  const gameRef = useRef<Game | null>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => {
    gameRef.current = game
  }, [game])

  /* ------------------------------------------------------------ hydrate */
  useEffect(() => {
    const stored = loadGame()
    if (stored) {
      gameRef.current = stored
      setGame(stored)
    }
    setReady(true)
  }, [])

  /* -------------------------------------------------------- persistence */
  useEffect(() => {
    if (ready && game) saveGame(game)
  }, [game, ready])

  useEffect(() => {
    if (ready) savePrefs(prefs)
  }, [prefs, ready])

  /* --------------------------------------------------------------- theme */
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = prefs.theme
    root.dataset.text = prefs.textScale
    root.dataset.locale = prefs.lang ?? guessLang()
    root.lang = prefs.lang ?? guessLang()
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', prefs.theme === 'dark' ? '#0b1220' : '#f6f7fb')
  }, [prefs.theme, prefs.textScale, prefs.lang])

  /* ---------------------------------------------------------------- toast */
  const showToast = useCallback((key: TranslationKey, vars?: ToastVars, undoable = false) => {
    const id = Math.random().toString(36).slice(2)
    setToast({ id, key, vars, undoable })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 4200)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const haptic = useCallback((kind: 'light' | 'medium' | 'heavy' = 'light') => {
    if (gameRef.current ? !gameRef.current.settings.haptics : false) return
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
    try {
      nav.vibrate?.(kind === 'heavy' ? [24, 30, 24] : kind === 'medium' ? 18 : 10)
    } catch {
      /* unsupported (iOS) — the visual feedback carries it */
    }
  }, [])

  /* ------------------------------------------------------------ mutations */
  const dispatch = useCallback((ev: GameEvent) => {
    setGame((cur) => (cur ? appendEvent(cur, ev) : cur))
  }, [])

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((cur) => ({ ...cur, ...patch }))
  }, [])

  const derived = useMemo(() => (game ? derive(game) : EMPTY_DERIVED), [game])

  const lastEvent = useMemo(() => (game?.events.length ? game.events[game.events.length - 1] : null), [game])

  const startGame = useCallback((cfg: NewGameConfig) => {
    const g = createGame(cfg)
    gameRef.current = g
    setGame(g)
    setScreen('score')
  }, [])

  const addThrow = useCallback(
    (teamId: string) => {
      const state = derived.byId[teamId]
      if (!state) return
      const player = state.nextPlayer
      dispatch(makeEvent('throw', { teamId, playerId: player?.id }))
      haptic()
      const next =
        player && state.players.length > 1
          ? state.players[(state.nextPlayerIndex + 1) % state.players.length]
          : null
      showToast(
        'toast.throwAdded',
        { team: state.name, n: state.throws + 1 },
        true,
      )
      if (next) {
        setToast((cur) =>
          cur ? { ...cur, subKey: 'score.nextThrower', subVars: { name: next.name } } : cur,
        )
      }
    },
    [derived, dispatch, haptic, showToast],
  )

  const addPenalty = useCallback<StoreValue['addPenalty']>(
    (teamId, rule, opts = {}) => {
      const state = derived.byId[teamId]
      const drinkingEnabled = Boolean(gameRef.current?.settings.drinkingEnabled)
      dispatch(
        makeEvent('penalty', {
          teamId,
          playerId: opts.playerId ?? state?.lastThrower?.id,
          ruleId: rule.id,
          points: opts.points ?? rule.points,
          drink: opts.drink ?? rule.drink,
          note: opts.note,
          label: opts.label,
        }),
      )
      void drinkingEnabled
      haptic('medium')
      showToast('penalty.saved', undefined, true)
    },
    [derived, dispatch, haptic, showToast],
  )

  const addDrink = useCallback<StoreValue['addDrink']>(
    (teamId, opts = {}) => {
      dispatch(
        makeEvent('drink', {
          teamId,
          playerId: opts.playerId,
          soft: opts.soft,
          source: opts.source ?? 'manual',
          targetTeamId: opts.targetTeamId,
        }),
      )
      haptic()
      showToast('drink.saved', undefined, true)
    },
    [dispatch, haptic, showToast],
  )

  const useJoker = useCallback(
    (teamId: string) => {
      dispatch(makeEvent('joker', { teamId, playerId: gameRef.current?.birthdayPlayerId, grantedBy: 'joker' }))
      haptic('heavy')
      showToast('score.jokerDone', undefined, true)
    },
    [dispatch, haptic, showToast],
  )

  const drawCard = useCallback(
    (teamId?: string): PartyCard | null => {
      const settings = gameRef.current?.settings
      if (!settings) return null
      const deck = deckFor(settings)
      if (!deck.length) return null
      const pool = deck.filter((c) => !recentCards.current.includes(c.id))
      const source = pool.length ? pool : deck
      const picked = source[Math.floor(Math.random() * source.length)]
      recentCards.current = [picked.id, ...recentCards.current].slice(0, 4)
      dispatch(makeEvent('card', { cardId: picked.id, teamId }))
      haptic('medium')
      return picked
    },
    [dispatch, haptic],
  )

  const setModifier = useCallback(
    (teamId: string, modifier: ModifierKind) => {
      dispatch(makeEvent('modifier', { teamId, modifier }))
      haptic()
      showToast(`modifiers.${modifier}` as TranslationKey, undefined, true)
    },
    [dispatch, haptic, showToast],
  )

  const setNextPlayer = useCallback(
    (teamId: string, playerId: string) => {
      dispatch(makeEvent('playerSet', { teamId, playerId }))
      haptic()
      const name = derived.byId[teamId]?.players.find((p) => p.id === playerId)?.name ?? ''
      showToast('toast.playerTurn', { name }, true)
    },
    [derived, dispatch, haptic, showToast],
  )

  const updateSettings = useCallback(
    (patch: Partial<GameSettings>) => {
      setGame((cur) => (cur ? { ...cur, settings: { ...cur.settings, ...patch } } : cur))
      dispatch(makeEvent('settings', { patch }))
    },
    [dispatch],
  )

  const updateGame = useCallback((patch: Partial<Game>) => {
    setGame((cur) => (cur ? { ...cur, ...patch } : cur))
  }, [])

  const addPenaltyRule = useCallback((rule: PenaltyRule) => {
    setGame((cur) => (cur ? { ...cur, penaltyRules: [...cur.penaltyRules, rule] } : cur))
  }, [])

  const updatePenaltyRule = useCallback((rule: PenaltyRule) => {
    setGame((cur) =>
      cur ? { ...cur, penaltyRules: cur.penaltyRules.map((r) => (r.id === rule.id ? rule : r)) } : cur,
    )
  }, [])

  const removePenaltyRule = useCallback((id: string) => {
    setGame((cur) => (cur ? { ...cur, penaltyRules: cur.penaltyRules.filter((r) => r.id !== id) } : cur))
  }, [])

  const setPlayers = useCallback((teamId: string, players: Player[]) => {
    setGame((cur) =>
      cur ? { ...cur, teams: cur.teams.map((t) => (t.id === teamId ? { ...t, players } : t)) } : cur,
    )
  }, [])

  const undo = useCallback(() => {
    let emptied = false
    setGame((cur) => {
      if (!cur || !cur.events.length) {
        emptied = true
        return cur
      }
      const events = cur.events.slice(0, -1)
      const next: Game = { ...cur, events }
      if (!events.some((e) => e.type === 'finish')) delete next.finishedAt
      return next
    })
    if (emptied) {
      showToast('history.nothingToUndo')
      return
    }
    haptic()
    showToast('toast.undone')
  }, [haptic, showToast])

  const removeEvent = useCallback(
    (id: string) => {
      setGame((cur) => (cur ? { ...cur, events: cur.events.filter((e) => e.id !== id) } : cur))
      showToast('history.deleted')
    },
    [showToast],
  )

  const finish = useCallback(() => {
    setGame((cur) => (cur ? { ...cur, finishedAt: new Date().toISOString() } : cur))
    dispatch(makeEvent('finish'))
    setScreen('finish')
    haptic('heavy')
  }, [dispatch, haptic])

  const reopen = useCallback(() => {
    setGame((cur) => {
      if (!cur) return cur
      const next: Game = { ...cur }
      delete next.finishedAt
      return next
    })
    dispatch(makeEvent('reopen'))
    setScreen('score')
    showToast('finish.reopened')
  }, [dispatch, showToast])

  const resetGame = useCallback(() => {
    clearStoredGame()
    gameRef.current = null
    recentCards.current = []
    setGame(null)
    setScreen('score')
    setToast(null)
  }, [])

  const importGame = useCallback(
    (text: string) => {
      try {
        const imported = normalizeGame(parseImport(text))
        gameRef.current = imported
        setGame(imported)
        setScreen('score')
        showToast('settings.imported')
        return true
      } catch {
        showToast('settings.importError')
        return false
      }
    },
    [showToast],
  )

  /* ----------------------------------------------------------------- sync */
  useEffect(() => {
    const room = prefs.syncRoom
    if (!ready || !prefs.syncEnabled || !room || !game?.id) {
      syncRef.current?.destroy()
      syncRef.current = null
      setSyncStatus(OFF_STATUS)
      return
    }
    let cancelled = false
    setSyncStatus({ state: 'connecting', peers: 0, room, remoteEvents: 0 })
    startSync({
      room,
      relays: prefs.relays,
      onRemoteEvent: (ev) => {
        setGame((cur) => {
          if (!cur || cur.events.some((e) => e.id === ev.id)) return cur
          return { ...cur, events: [...cur.events, ev] }
        })
      },
      onRemoteMeta: (meta) => {
        const local = gameRef.current
        if (meta.gameId && local && meta.gameId !== local.id) setSyncMismatch(meta.name ?? '')
        else setSyncMismatch(null)
      },
      onStatus: setSyncStatus,
    })
      .then((handle) => {
        if (cancelled) {
          handle.destroy()
          return
        }
        syncRef.current = handle
        const g = gameRef.current
        if (!g) return
        g.events.forEach((ev) => handle.pushEvent(ev))
        handle.pushMeta({
          gameId: g.id,
          name: g.name,
          route: g.route,
          teams: g.teams.length,
          updatedAt: g.events.length ? g.events[g.events.length - 1].at : g.createdAt,
        })
      })
      .catch(() => setSyncStatus({ ...OFF_STATUS, state: 'error', room }))

    return () => {
      cancelled = true
      syncRef.current?.destroy()
      syncRef.current = null
    }
  }, [ready, prefs.syncEnabled, prefs.syncRoom, prefs.relays, game?.id])

  /** push freshly created events into the room */
  useEffect(() => {
    const handle = syncRef.current
    if (!handle || !game) return
    game.events.forEach((ev) => handle.pushEvent(ev))
    if (game.events.length) {
      handle.pushMeta({
        gameId: game.id,
        name: game.name,
        route: game.route,
        teams: game.teams.length,
        updatedAt: game.events[game.events.length - 1].at,
      })
    }
  }, [game])

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      game,
      derived,
      prefs,
      lang: prefs.lang ?? guessLang(),
      manualLang: prefs.lang ?? null,
      setLang: (lang) => setPrefs({ lang: lang ?? undefined }),
      setPrefs,
      screen,
      setScreen,
      toast,
      showToast,
      dismissToast,
      startGame,
      dispatch,
      addThrow,
      addPenalty,
      addDrink,
      useJoker,
      drawCard,
      setModifier,
      setNextPlayer,
      updateSettings,
      updateGame,
      addPenaltyRule,
      updatePenaltyRule,
      removePenaltyRule,
      setPlayers,
      undo,
      removeEvent,
      finish,
      reopen,
      resetGame,
      importGame,
      haptic,
      syncStatus,
      syncMismatch,
      lastEvent,
    }),
    [
      ready,
      game,
      derived,
      prefs,
      setPrefs,
      screen,
      toast,
      showToast,
      dismissToast,
      startGame,
      dispatch,
      addThrow,
      addPenalty,
      addDrink,
      useJoker,
      drawCard,
      setModifier,
      setNextPlayer,
      updateSettings,
      updateGame,
      addPenaltyRule,
      updatePenaltyRule,
      removePenaltyRule,
      setPlayers,
      undo,
      removeEvent,
      finish,
      reopen,
      resetGame,
      importGame,
      haptic,
      syncStatus,
      syncMismatch,
      lastEvent,
    ],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
