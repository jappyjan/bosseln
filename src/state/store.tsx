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
  mergeGames,
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
import { roomCode, shareLink, startSync, stateRev, type SyncHandle, type SyncStatus } from '../game/sync'
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
  /** code + link of the shared game, null when sharing is off */
  shareUrl: string | null
  devices: number
  joining: boolean
  joinError: boolean
  joinGame: (code: string) => void
  cancelJoin: () => void
  enableSharing: () => void
  leaveSync: () => void
  lastEvent: GameEvent | null
}

const StoreCtx = createContext<StoreValue | null>(null)

const OFF_STATUS: SyncStatus = { state: 'off', broker: '', room: '', devices: 1 }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [game, setGame] = useState<Game | null>(null)
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs())
  const [screen, setScreen] = useState<Screen>('score')
  const [toast, setToast] = useState<Toast | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(OFF_STATUS)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(false)
  const publishedRev = useRef('')
  const adoptRef = useRef(false)

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
    // a shared link carries the game code: ?join=ABC123 (or #join=ABC123)
    const fromQuery = new URLSearchParams(location.search).get('join')
    const fromHash = /join=([A-Za-z0-9]+)/.exec(location.hash)?.[1]
    const raw = (fromQuery ?? fromHash ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (raw.length >= 4) {
      adoptRef.current = true
      setJoining(true)
      setPrefsState((cur) => ({ ...cur, syncRoom: raw, syncEnabled: true }))
      window.history.replaceState({}, '', location.pathname + location.hash.replace(/[#&]?join=[^&]*/i, ''))
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

  /* ---------------------------------------------------------------- share
     Cross-device sharing over MQTT (free public brokers, no account).
     The room code *is* the game: the state sits as a retained message on the
     broker, so a phone that joins later gets the full game instantly. Only
     immutable events are exchanged, which keeps the merge conflict-free; the
     local copy stays master and offline play keeps working.
  ------------------------------------------------------------------------ */
  useEffect(() => {
    const room = prefs.syncRoom
    if (!ready || !prefs.syncEnabled || !room) {
      syncRef.current?.destroy()
      syncRef.current = null
      setSyncStatus(OFF_STATUS)
      return
    }
    let cancelled = false
    setSyncStatus({ state: 'connecting', broker: '', room, devices: 1 })
    startSync({
      room,
      brokers: prefs.brokers,
      deviceId: prefs.deviceId,
      onRemoteState: (remote) => {
        setGame((cur) => {
          const adopt = adoptRef.current
          adoptRef.current = false
          const result = adopt
            ? { game: remote, changed: true, adopted: cur ? cur.id !== remote.id : false }
            : mergeGames(cur, remote)
          if (!result.changed) return cur
          publishedRev.current = stateRev(result.game)
          if (result.adopted) showToast('toast.gameAdopted')
          return result.game
        })
      },
      onStatus: (status) => {
        setSyncStatus(status)
        if (status.state === 'live') setJoinError(false)
      },
    })
      .then((handle) => {
        if (cancelled) {
          handle.destroy()
          return
        }
        syncRef.current = handle
        const g = gameRef.current
        if (g) handle.publishState(g)
      })
      .catch((err) => {
        setSyncStatus({ state: 'error', broker: '', room, devices: 1, error: String(err) })
      })

    return () => {
      cancelled = true
      syncRef.current?.destroy()
      syncRef.current = null
    }
  }, [ready, prefs.syncEnabled, prefs.syncRoom, prefs.brokers, prefs.deviceId, showToast])

  /** publish local changes (throttled) so the other phones follow along */
  useEffect(() => {
    const handle = syncRef.current
    if (!handle || !game) return
    if (stateRev(game) === publishedRev.current) return
    const timer = window.setTimeout(() => handle.publishState(game), 350)
    return () => window.clearTimeout(timer)
  }, [game])

  /** joining a code: wait for the host's state, then say so honestly */
  useEffect(() => {
    if (!joining || game) return
    const timer = window.setTimeout(() => setJoinError(true), 10000)
    return () => window.clearTimeout(timer)
  }, [joining, game])

  useEffect(() => {
    if (joining && game) setJoining(false)
  }, [joining, game])

  /* ------------------------------------------------------- share actions */
  const joinGame = useCallback(
    (raw: string) => {
      const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
      if (code.length < 4) {
        showToast('setup.joinInvalid')
        return
      }
      adoptRef.current = true
      setJoinError(false)
      setJoining(true)
      setPrefs({ syncRoom: code, syncEnabled: true })
      showToast('toast.joining', { code })
    },
    [setPrefs, showToast],
  )

  const cancelJoin = useCallback(() => {
    setJoining(false)
    setJoinError(false)
    setPrefs({ syncEnabled: false, syncRoom: undefined })
  }, [setPrefs])

  const enableSharing = useCallback(() => {
    const code = prefsRef.current.syncRoom ?? roomCode()
    setPrefs({ syncRoom: code, syncEnabled: true })
    showToast('toast.sharing', { code })
  }, [setPrefs, showToast])

  const leaveSync = useCallback(() => {
    setPrefs({ syncEnabled: false })
    setJoining(false)
    setJoinError(false)
    showToast('toast.sharingOff')
  }, [setPrefs, showToast])

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
      shareUrl: prefs.syncRoom && prefs.syncEnabled ? shareLink(prefs.syncRoom) : null,
      devices: syncStatus.devices,
      joining,
      joinError,
      joinGame,
      cancelJoin,
      enableSharing,
      leaveSync,
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
      prefs.syncRoom,
      prefs.syncEnabled,
      joining,
      joinError,
      joinGame,
      cancelJoin,
      enableSharing,
      leaveSync,
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
