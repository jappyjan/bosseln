import { useMemo, useState } from 'react'
import { Button, Card, ConfirmDialog, EmptyState } from '../components/ui'
import { penaltyRuleById, playerName } from '../game/engine'
import { PARTY_CARDS } from '../game/rules'
import { useI18n, type TranslationKey, type TFn } from '../i18n'
import { useStore } from '../state/store'
import type { Game, GameEvent } from '../game/types'

const ICONS: Record<string, string> = {
  game: '🎉',
  throw: '🎯',
  penalty: '⚠️',
  drink: '🍺',
  joker: '🃏',
  card: '🎴',
  modifier: '📣',
  playerSet: '👤',
  settings: '⚙️',
  finish: '🏁',
  reopen: '↩️',
}

function describe(ev: GameEvent, t: TFn, game: Game, throwCount: number): string {
  const team = game.teams.find((x) => x.id === ev.teamId)
  const teamName = team?.name ?? ''
  const target = game.teams.find((x) => x.id === ev.targetTeamId)
  switch (ev.type) {
    case 'game':
      return t('history.created', { name: ev.note ?? game.name })
    case 'throw':
      return t('history.throw', { team: teamName, n: throwCount })
    case 'penalty': {
      const rule = penaltyRuleById(game, ev.ruleId)
      const reason = ev.label ?? (rule?.labelKey ? t(rule.labelKey as TranslationKey) : (rule?.label ?? ''))
      return t('history.penalty', { team: teamName, reason, points: ev.points ?? 1 })
    }
    case 'drink': {
      const who = playerName(game, ev.playerId) ?? teamName
      if (ev.targetTeamId && ev.targetTeamId !== ev.teamId && target) {
        return t('history.drinkFor', { team: teamName, target: target.name })
      }
      return t(ev.soft ? 'history.drinkSoft' : 'history.drink', { who })
    }
    case 'card': {
      const card = PARTY_CARDS.find((c) => c.id === ev.cardId)
      return t('history.card', {
        team: teamName,
        card: card ? t(`card.${card.id}.title` as TranslationKey) : (ev.cardId ?? ''),
      })
    }
    case 'joker':
      return t(ev.grantedBy === 'card' ? 'history.grant' : 'history.joker', { team: teamName })
    case 'modifier':
      return t('history.modifier', {
        team: teamName,
        name: t(`modifiers.${ev.modifier}` as TranslationKey),
      })
    case 'playerSet':
      return t('history.playerSet', { team: teamName, name: playerName(game, ev.playerId) ?? '' })
    case 'settings':
      return t('history.settings', {
        mode:
          ev.patch?.scoringMode === 'additive'
            ? t('setup.scoringAdditive')
            : ev.patch?.scoringMode === 'ignored'
              ? t('setup.scoringIgnored')
              : t('setup.scoringTiebreak'),
      })
    case 'finish':
      return t('history.finish')
    case 'reopen':
      return t('history.reopen')
    default:
      return ev.type
  }
}

export function HistoryScreen() {
  const { t, formatTime } = useI18n()
  const { game, undo, removeEvent, derived } = useStore()

  const [pending, setPending] = useState<GameEvent | null>(null)
  const [filter, setFilter] = useState<'all' | 'throw' | 'penalty' | 'drink' | 'card'>('all')

  const rows = useMemo(() => {
    if (!game) return []
    const counters: Record<string, number> = {}
    const labels: { ev: GameEvent; text: string; seq: number }[] = []
    game.events.forEach((ev, index) => {
      if (ev.type === 'throw' && ev.teamId) counters[ev.teamId] = (counters[ev.teamId] ?? 0) + 1
      labels.push({ ev, text: describe(ev, t, game, ev.teamId ? counters[ev.teamId] ?? 0 : 0), seq: index })
    })
    return labels
      .filter((row) => filter === 'all' || row.ev.type === filter)
      .reverse()
  }, [game, t, filter])

  if (!game) return null

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'all', label: t('history.filterAll') },
    { id: 'throw', label: t('common.throws') },
    { id: 'penalty', label: t('common.penalties') },
    { id: 'drink', label: t('common.drinks') },
    { id: 'card', label: t('nav.party') },
  ]

  return (
    <div className="mx-auto max-w-2xl px-3 pb-40 pt-safe">
      <header className="flex items-center gap-2 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black">{t('history.title')}</h1>
          <p className="truncate text-xs font-semibold text-sub">
            {t('history.subtitle', { n: game.events.length })} · {derived.totals.throws} {t('common.throws')}
          </p>
        </div>
        <Button
          variant="neutral"
          size="sm"
          className="shrink-0"
          disabled={!game.events.length}
          onClick={undo}
        >
          ↩ {t('history.undoLast')}
        </Button>
      </header>

      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={
              'min-h-[44px] shrink-0 rounded-full border-2 px-3 text-sm font-bold ' +
              (filter === f.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState text={t('history.empty')} emoji="🎳" />
      ) : (
        <div className="space-y-2">
          {rows.map(({ ev, text }) => (
            <Card key={ev.id} className="flex items-center gap-3 border-2 p-3">
              <span className="text-2xl">{ICONS[ev.type] ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-tight">{text}</p>
                <p className="text-[11px] font-semibold text-sub">{formatTime(ev.at)}</p>
              </div>
              <button
                type="button"
                aria-label={t('history.deleteEvent')}
                onClick={() => setPending(ev)}
                className="min-h-[44px] min-w-[44px] rounded-xl border-2 border-line text-lg"
              >
                🗑
              </button>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={t('history.deleteEvent')}
        body={t('history.deleteConfirm')}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) removeEvent(pending.id)
          setPending(null)
        }}
      />
    </div>
  )
}
