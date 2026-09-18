/**
 * Cross-device sharing via MQTT over WebSocket.
 *
 * Why MQTT: public brokers offer *retained* messages, which is exactly what
 * "join with a code" needs — the broker hands the newest game state to every
 * late subscriber. (Public Gun relays measured here delivered nothing between
 * two clients, so gun was dropped.)
 *
 * Design decisions that matter:
 * - one room per game code: `bosseln/v1/<code>/state` (retained) and
 *   `bosseln/v1/<code>/presence/<deviceId>` (retained heartbeat)
 * - **every device connects to every configured broker.** Trying brokers in
 *   order silently put devices on different brokers, where they could not see
 *   each other. Subscribing on all of them makes them meet wherever they land;
 *   duplicates are harmless because a revision guard drops repeated states.
 * - published payload is the whole game; merging is a union of immutable events
 * - offline stays fully local, reconnects republish and catch up
 *
 * mqtt.js is loaded lazily so the offline bundle stays lean.
 */

import type { Game } from './types'

/** Public brokers, free and account-less. */
export const DEFAULT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]

export interface SyncStatus {
  state: 'off' | 'connecting' | 'live' | 'error'
  /** the brokers we are currently connected to */
  broker: string
  room: string
  devices: number
  lastStateAt?: string
  error?: string
}

export interface SyncHandle {
  publishState(game: Game): void
  destroy(): void
}

interface StartOpts {
  room: string
  brokers: string[]
  deviceId: string
  onRemoteState: (game: Game, meta: { rev: string; from: string }) => void
  onStatus: (s: SyncStatus) => void
}

interface StatePayload {
  app: 'bosseln'
  v: 1
  rev: string
  from: string
  at: string
  game: Game
}

const stateTopic = (room: string) => `bosseln/v1/${room}/state`
const presenceTopic = (room: string, device: string) => `bosseln/v1/${room}/presence/${device}`
const presencePrefix = (room: string) => `bosseln/v1/${room}/presence/`
const presenceWildcard = (room: string) => `${presencePrefix(room)}+`

const STALE_MS = 120000

/** stable revision of a game: the same events (any order) give the same revision */
export function stateRev(game: Game): string {
  const ids = game.events.map((e) => e.id).sort()
  let hash = 5381
  for (const chunk of ids.join('|')) hash = ((hash << 5) + hash + chunk.charCodeAt(0)) | 0
  return `${ids.length}x${(hash >>> 0).toString(36)}`
}

export const roomCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  return Array.from(bytes, (b, i) => alphabet[(b || i * 37) % alphabet.length]).join('')
}

export const shareLink = (code: string): string =>
  `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`

const shortBroker = (url: string): string => url.replace(/^wss?:\/\//, '').split('/')[0]

export async function startSync(opts: StartOpts): Promise<SyncHandle> {
  const mqttModule = await import('mqtt')
  const mqtt = ((mqttModule as unknown as { default?: unknown }).default ?? mqttModule) as {
    connect: (url: string, o?: Record<string, unknown>) => any
  }

  const brokers = opts.brokers.map((b) => b.trim()).filter(Boolean)
  if (!brokers.length) throw new Error('no broker configured')

  const status: SyncStatus = { state: 'connecting', broker: '', room: opts.room, devices: 1 }
  const clients: any[] = []
  const connected = new Set<number>()
  const seenDevices = new Map<string, number>()
  let lastGame: Game | null = null
  let publishedRev = ''
  let lastSeenRev = ''
  let lastError = ''
  let destroyed = false

  const aliveDevices = () => {
    const now = Date.now()
    for (const [device, at] of seenDevices) if (now - at > STALE_MS) seenDevices.delete(device)
    return seenDevices.size
  }

  const emit = () => {
    if (destroyed) return
    status.broker = [...connected].map((i) => shortBroker(brokers[i])).join(' + ')
    status.devices = aliveDevices() + 1
    status.state = connected.size ? 'live' : lastError ? 'error' : 'connecting'
    status.error = connected.size ? undefined : lastError || undefined
    opts.onStatus({ ...status })
  }

  const payloadFor = (game: Game): string => {
    const rev = stateRev(game)
    const payload: StatePayload = {
      app: 'bosseln',
      v: 1,
      rev,
      from: opts.deviceId,
      at: new Date().toISOString(),
      game,
    }
    return JSON.stringify(payload)
  }

  /** publish to every broker we are connected to */
  const publishNow = () => {
    if (!lastGame) return
    publishedRev = stateRev(lastGame)
    const body = payloadFor(lastGame)
    for (const index of connected) {
      try {
        clients[index]?.publish(stateTopic(opts.room), body, { qos: 1, retain: true })
      } catch {
        /* a single broker failing must not stop the others */
      }
    }
  }

  const announce = (index: number) => {
    try {
      clients[index]?.publish(
        presenceTopic(opts.room, opts.deviceId),
        JSON.stringify({ at: Date.now() }),
        { qos: 1, retain: true },
      )
    } catch {
      /* ignore */
    }
  }

  const onMessage = (topic: string, raw: Uint8Array) => {
    let data: unknown
    try {
      data = JSON.parse(new TextDecoder().decode(raw))
    } catch {
      return
    }

    if (topic.startsWith(presencePrefix(opts.room))) {
      const device = topic.split('/').pop() ?? ''
      if (!device || device === opts.deviceId) return
      const at = typeof (data as { at?: number }).at === 'number' ? (data as { at: number }).at : Date.now()
      if (at === 0) seenDevices.delete(device)
      else seenDevices.set(device, at)
      emit()
      return
    }

    const state = data as StatePayload
    if (!state || state.app !== 'bosseln' || !state.game || !state.rev) return
    if (state.from === opts.deviceId) return
    // the same revision can arrive on several brokers — apply it once
    if (state.rev === lastSeenRev) return
    lastSeenRev = state.rev
    publishedRev = state.rev
    status.lastStateAt = state.at
    emit()
    opts.onRemoteState(state.game, { rev: state.rev, from: state.from })
  }

  brokers.forEach((url, index) => {
    const client = mqtt.connect(url, {
      clientId: `bosseln-${opts.deviceId}-${index}-${Math.random().toString(16).slice(2, 8)}`,
      keepalive: 30,
      reconnectPeriod: 4000,
      connectTimeout: 8000,
      clean: true,
    })
    clients.push(client)

    client.on('connect', () => {
      connected.add(index)
      lastError = ''
      emit()
      client.subscribe([stateTopic(opts.room), presenceWildcard(opts.room)], { qos: 1 })
      announce(index)
      // covers the first connect, a late-connecting broker and every reconnect
      publishNow()
    })

    client.on('close', () => {
      connected.delete(index)
      emit()
    })

    client.on('error', (err: Error) => {
      connected.delete(index)
      lastError = err?.message ?? 'connection error'
      emit()
    })

    client.on('message', onMessage)
  })

  const heartbeat = setInterval(() => {
    connected.forEach((index) => announce(index))
    emit()
  }, 30000)

  emit()

  return {
    publishState(game: Game) {
      lastGame = game
      if (stateRev(game) === publishedRev) return
      publishNow()
    },
    destroy() {
      destroyed = true
      clearInterval(heartbeat)
      connected.forEach((index) => {
        try {
          clients[index]?.publish(
            presenceTopic(opts.room, opts.deviceId),
            JSON.stringify({ at: 0 }),
            { qos: 1, retain: true },
          )
        } catch {
          /* ignore */
        }
      })
      clients.forEach((client) => {
        try {
          client?.end?.(true)
        } catch {
          /* ignore */
        }
      })
      status.state = 'off'
      status.devices = 1
      opts.onStatus({ ...status })
    },
  }
}
