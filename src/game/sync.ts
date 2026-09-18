/**
 * Optional cross-device sync through Gun.js (free, community hosted relays —
 * nothing to self-host). The local game stays the source of truth: sync only
 * exchanges immutable events, which merge without conflicts.
 *
 * Gun.js is loaded lazily so the offline bundle stays lean.
 */

import type { GameEvent } from './types'

export interface SyncStatus {
  state: 'off' | 'connecting' | 'live' | 'error'
  peers: number
  room: string
  remoteEvents: number
  lastRemoteAt?: string
  error?: string
}

export interface SyncMeta {
  gameId?: string
  name?: string
  route?: string
  updatedAt?: string
  teams?: number
}

export interface SyncHandle {
  pushEvent(ev: GameEvent): void
  pushMeta(meta: SyncMeta): void
  destroy(): void
}

interface StartOpts {
  room: string
  relays: string[]
  onRemoteEvent: (ev: GameEvent) => void
  onRemoteMeta?: (meta: SyncMeta) => void
  onStatus: (s: SyncStatus) => void
}

const clean = (data: Record<string, unknown>): Record<string, unknown> => {
  const { _: meta, ...rest } = data
  void meta
  return rest
}

export async function startSync(opts: StartOpts): Promise<SyncHandle> {
  const status: SyncStatus = { state: 'connecting', peers: 0, room: opts.room, remoteEvents: 0 }
  const emit = () => opts.onStatus({ ...status })

  const gun = await import('gun')
  const Gun = (gun as unknown as { default: unknown }).default ?? gun
  const root = (Gun as (o: Record<string, unknown>) => any)({
    peers: opts.relays,
    localStorage: false,
    radisk: false,
    multicast: false,
    axe: false,
    // keep the noise low; we never drill into a single event node
    wait: 60,
  })

  const room = root.get('bosseln-v1').get(`room-${opts.room}`)
  const eventsNode = room.get('events')

  root.on('hi', () => {
    status.peers += 1
    status.state = 'live'
    emit()
  })
  root.on('bye', () => {
    status.peers = Math.max(0, status.peers - 1)
    status.state = status.peers > 0 ? 'live' : 'connecting'
    emit()
  })

  const pushed = new Set<string>()

  room.get('meta').on((data: Record<string, unknown> | null) => {
    if (!data) return
    const meta = clean(data) as SyncMeta
    if (meta.updatedAt) status.lastRemoteAt = meta.updatedAt
    opts.onRemoteMeta?.(meta)
    emit()
  })

  eventsNode.map().on((data: Record<string, unknown> | null, key: string) => {
    if (!data || typeof data !== 'object') return
    const ev = clean(data) as unknown as GameEvent
    if (!ev.id || !ev.type || !ev.at) return
    if (key && ev.id !== key) return
    status.remoteEvents += 1
    status.state = 'live'
    opts.onRemoteEvent(ev)
    emit()
  })

  emit()

  return {
    pushEvent(ev: GameEvent) {
      if (pushed.has(ev.id)) return
      pushed.add(ev.id)
      try {
        eventsNode.get(ev.id).put(ev)
      } catch (err) {
        status.state = 'error'
        status.error = String(err)
        emit()
      }
    },
    pushMeta(meta: SyncMeta) {
      try {
        room.get('meta').put(meta)
      } catch {
        /* ignore */
      }
    },
    destroy() {
      try {
        root.off?.()
      } catch {
        /* ignore */
      }
      status.state = 'off'
      status.peers = 0
      emit()
    },
  }
}

export const randomRoom = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[(bytes[i] || Math.floor(Math.random() * 255)) % alphabet.length]
  }
  return out
}
