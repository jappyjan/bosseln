/**
 * Cross-device sharing via MQTT over WebSocket.
 *
 * Why MQTT instead of Gun: public Gun relays measured here either dropped
 * messages between peers or never delivered the game metadata, while public
 * MQTT brokers provide retained messages — which is exactly what "join with a
 * code" needs: the broker hands the newest game state to every late subscriber.
 *
 * Design:
 * - one room per game code, topics `bosseln/v1/<code>/state` (retained) and
 *   `bosseln/v1/<code>/presence/<deviceId>` (retained, heartbeat)
 * - published payload is the whole game (teams, rules, events). Merging is a
 *   union of immutable events, so no conflicts and no ordering issues.
 * - a revision hash of the event-id set prevents echo loops between devices.
 * - offline stays fully local; on reconnect the retained state is applied again.
 *
 * mqtt.js is loaded lazily so the offline bundle stays small.
 */

import type { Game } from './types'

/** Public brokers, free and account-less. Tried in order. */
export const DEFAULT_BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
]

export interface SyncStatus {
  state: 'off' | 'connecting' | 'live' | 'error'
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
  /** called with every *newer* remote state; `from` is the sending device */
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
const presenceWildcard = (room: string) => `bosseln/v1/${room}/presence/+`

/** stable revision of a game: same events (regardless of order) → same revision */
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

export async function startSync(opts: StartOpts): Promise<SyncHandle> {
  const status: SyncStatus = { state: 'connecting', broker: '', room: opts.room, devices: 1 }
  const emit = () => opts.onStatus({ ...status })

  const mqttModule = await import('mqtt')
  const mqtt = ((mqttModule as unknown as { default?: unknown }).default ?? mqttModule) as {
    connect: (url: string, o?: Record<string, unknown>) => any
  }

  const brokers = opts.brokers.filter(Boolean)
  if (!brokers.length) throw new Error('no broker configured')

  const seenDevices = new Map<string, number>()
  let client: any = null
  let publishedRev = ''
  let destroyed = false
  /** kept so the newest state can be (re)published the moment the link is up */
  let lastGame: Game | null = null

  const publishNow = () => {
    if (!client?.connected || !lastGame) return
    const rev = stateRev(lastGame)
    publishedRev = rev
    const payload: StatePayload = {
      app: 'bosseln',
      v: 1,
      rev,
      from: opts.deviceId,
      at: new Date().toISOString(),
      game: lastGame,
    }
    client.publish(stateTopic(opts.room), JSON.stringify(payload), { qos: 1, retain: true })
  }

  const url = (i: number) => brokers[i % brokers.length]

  const connect = (index: number) => {
    const broker = url(index)
    status.broker = broker
    status.state = 'connecting'
    emit()
    const c = mqtt.connect(broker, {
      clientId: `bosseln-${opts.deviceId}-${Math.random().toString(16).slice(2, 8)}`,
      keepalive: 30,
      reconnectPeriod: 4000,
      connectTimeout: 8000,
      clean: true,
    })
    client = c

    c.on('connect', () => {
      status.state = 'live'
      status.error = undefined
      emit()
      c.subscribe([stateTopic(opts.room), presenceWildcard(opts.room)], { qos: 1 })
      announce()
      // (re)publish the current game: covers the first connect and every reconnect
      publishNow()
    })

    c.on('reconnect', () => {
      status.state = 'connecting'
      emit()
    })

    c.on('close', () => {
      status.state = status.state === 'error' ? 'error' : 'connecting'
      emit()
    })

    c.on('error', (err: Error) => {
      status.error = err?.message ?? 'connection error'
      status.state = 'error'
      emit()
      // rotate to the next broker on the first failure
      if (!destroyed) {
        const next = index + 1
        if (next < brokers.length) {
          try {
            c.end(true)
          } catch {
            /* ignore */
          }
          connect(next)
        }
      }
    })

    c.on('message', (topic: string, payload: Uint8Array) => {
      let data: unknown
      try {
        data = JSON.parse(new TextDecoder().decode(payload))
      } catch {
        return
      }
      if (topic.startsWith(presenceWildcard(opts.room).slice(0, -1))) {
        const device = topic.split('/').pop() ?? ''
        if (!device) return
        const at = typeof (data as { at?: number }).at === 'number' ? (data as { at: number }).at : Date.now()
        if (device === opts.deviceId) {
          // our own heartbeat, not part of the peer count
        } else if (at === 0) {
          seenDevices.delete(device)
        } else {
          seenDevices.set(device, at)
        }
        const now = Date.now()
        const alive = [...seenDevices.values()].filter((t) => now - t < 120000).length
        status.devices = alive + 1
        emit()
        return
      }

      const state = data as StatePayload
      if (!state || state.app !== 'bosseln' || !state.game || !state.rev) return
      if (state.from === opts.deviceId) return
      if (state.rev === publishedRev || state.rev === lastSeenRev) {
        lastSeenRev = state.rev
        return
      }
      lastSeenRev = state.rev
      publishedRev = state.rev
      status.lastStateAt = state.at
      status.state = 'live'
      emit()
      opts.onRemoteState(state.game, { rev: state.rev, from: state.from })
    })
  }

  let lastSeenRev = ''

  const announce = () => {
    if (!client?.connected) return
    client.publish(presenceTopic(opts.room, opts.deviceId), JSON.stringify({ at: Date.now() }), {
      qos: 1,
      retain: true,
    })
  }

  connect(0)
  const heartbeat = setInterval(() => {
    const now = Date.now()
    for (const [device, at] of seenDevices) if (now - at > 120000) seenDevices.delete(device)
    announce()
    status.devices = [...seenDevices.values()].filter((t) => now - t < 120000).length + 1
    emit()
  }, 30000)

  emit()

  return {
    publishState(game: Game) {
      lastGame = game
      const rev = stateRev(game)
      if (rev === publishedRev) return
      publishedRev = rev
      publishNow()
    },
    destroy() {
      destroyed = true
      clearInterval(heartbeat)
      try {
        client?.publish?.(presenceTopic(opts.room, opts.deviceId), JSON.stringify({ at: 0 }), {
          qos: 1,
          retain: true,
        })
      } catch {
        /* ignore */
      }
      try {
        client?.end?.(true)
      } catch {
        /* ignore */
      }
      status.state = 'off'
      status.devices = 1
      emit()
    },
  }
}
