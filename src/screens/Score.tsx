import { useState } from 'react'
import { Button, Card, ConfirmDialog, FlashNumber, cn } from '../components/ui'
import { CardSheet, DrinkSheet, JokerDialog, PenaltySheet, PlayerSheet } from '../components/sheets'
import { ShareChip, ShareSheet } from '../components/ShareSheet'
import { places, scoreOf } from '../game/engine'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import type { TeamState } from '../game/types'
import type { PartyCard } from '../game/rules'

type SheetKind = 'penalty' | 'drink' | 'player' | 'card' | null

export function ScoreScreen() {
  const { t } = useI18n()
  const {
    game,
    derived,
    addThrow,
    undo,
    finish,
    useJoker,
    drawCard,
    setScreen,
    haptic,
  } = useStore()

  const [sheet, setSheet] = useState<SheetKind>(null)
  const [activeTeam, setActiveTeam] = useState<string>('')
  const [card, setCard] = useState<PartyCard | null>(null)
  const [jokerOpen, setJokerOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  if (!game) return null

  const drinking = game.settings.drinkingEnabled
  const twoTeams = derived.teams.length === 2
  const rank = places(derived.ranking, game.settings.scoringMode)
  const birthdayTeam = derived.byId[game.birthdayTeamId ?? '']
  const partyEnabled = Object.values(game.settings.categories).some(Boolean)

  const open = (kind: Exclude<SheetKind, null>, teamId: string) => {
    setActiveTeam(teamId)
    setSheet(kind)
  }

  const throwFor = (teamId: string) => {
    addThrow(teamId)
  }

  const onDraw = (teamId: string) => {
    const picked = drawCard(teamId)
    if (!picked) return
    setCard(picked)
    setActiveTeam(teamId)
    setSheet('card')
  }

  return (
    <div className="mx-auto max-w-3xl px-3 pb-40 pt-safe">
      <header className="flex items-start gap-2 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black leading-tight">{game.name}</h1>
          <p className="truncate text-xs font-semibold text-sub">
            {game.route ? `${game.route} · ` : ''}
            {derived.finished ? t('score.finished') : t('score.inProgress')}
            {derived.ranking.length > 1
              ? ` · ${t('score.rankLeaders', { name: derived.ranking[0].name })}`
              : ''}
          </p>
        </div>
        <ShareChip
          onClick={() => {
            haptic()
            setShareOpen(true)
          }}
        />
        <Button
          variant="neutral"
          size="sm"
          className="shrink-0"
          onClick={() => {
            haptic()
            undo()
          }}
          aria-label={t('common.undo')}
        >
          ↩
        </Button>
        <Button
          variant="neutral"
          size="sm"
          className="shrink-0"
          onClick={() => setFinishOpen(true)}
          aria-label={t('score.finish')}
        >
          🏁
        </Button>
      </header>

      {derived.finished ? (
        <button
          type="button"
          onClick={() => setScreen('finish')}
          className="mb-3 w-full rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-left font-bold text-emerald-900"
        >
          🏁 {t('score.finished')} · {t('finish.title')} ›
        </button>
      ) : null}

      <div className={cn('gap-3', twoTeams ? 'grid grid-cols-2' : 'flex flex-col')}>
        {derived.teams.map((team) => (
          <TeamCard
            key={team.id}
            state={team}
            dense={twoTeams}
            place={rank[team.id]}
            showPlace={derived.teams.length > 1}
            mode={game.settings.scoringMode}
            drinking={drinking}
            isBirthday={team.id === game.birthdayTeamId}
            onThrow={() => throwFor(team.id)}
            onPenalty={() => open('penalty', team.id)}
            onDrink={() => open('drink', team.id)}
            onPlayer={() => open('player', team.id)}
          />
        ))}
      </div>

      {partyEnabled ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button
            variant="primary"
            size="lg"
            block
            className="border-amber-500 bg-amber-500 text-amber-950"
            onClick={() => onDraw(derived.teams[0]?.id ?? '')}
          >
            🎴 {t('party.draw')}
          </Button>
        </div>
      ) : null}

      {birthdayTeam ? (
        <Card className="mt-4 border-4 border-pink-500 bg-pink-50/70">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🃏</span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-pink-900">{t('score.joker')}</p>
              <p className="text-xs font-semibold text-pink-900/70">
                {birthdayTeam.jokerUsed ? t('score.jokerUsedHint') : t('score.jokerHint')}
              </p>
            </div>
          </div>
          <Button
            className="mt-3"
            block
            size="lg"
            variant={birthdayTeam.jokerUsed ? 'neutral' : 'danger'}
            disabled={birthdayTeam.jokerUsed}
            onClick={() => setJokerOpen(true)}
          >
            {birthdayTeam.jokerUsed ? `✔ ${t('score.jokerUsed')}` : `🃏 ${t('score.useJoker')}`}
          </Button>
        </Card>
      ) : null}

      <PenaltySheet
        open={sheet === 'penalty'}
        onClose={() => setSheet(null)}
        teamId={activeTeam}
      />
      <DrinkSheet open={sheet === 'drink'} onClose={() => setSheet(null)} teamId={activeTeam} />
      <PlayerSheet open={sheet === 'player'} onClose={() => setSheet(null)} teamId={activeTeam} />
      <CardSheet open={sheet === 'card'} card={card} teamId={activeTeam} onClose={() => setSheet(null)} />
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
      <JokerDialog
        open={jokerOpen}
        teamId={game.birthdayTeamId ?? ''}
        onCancel={() => setJokerOpen(false)}
        onConfirm={() => {
          useJoker(game.birthdayTeamId ?? '')
          setJokerOpen(false)
        }}
      />
      <ConfirmDialog
        open={finishOpen}
        title={t('score.finish')}
        body={t('finish.winnerIs', { name: derived.ranking[0]?.name ?? '' })}
        confirmLabel={t('score.finish')}
        onConfirm={() => {
          setFinishOpen(false)
          finish()
        }}
        onCancel={() => setFinishOpen(false)}
      />
    </div>
  )
}

function TeamCard({
  state,
  dense,
  place,
  showPlace,
  mode,
  drinking,
  isBirthday,
  onThrow,
  onPenalty,
  onDrink,
  onPlayer,
}: {
  state: TeamState
  dense: boolean
  place: number
  showPlace: boolean
  mode: 'tiebreak' | 'additive' | 'ignored'
  drinking: boolean
  isBirthday: boolean
  onThrow: () => void
  onPenalty: () => void
  onDrink: () => void
  onPlayer: () => void
}) {
  const { t } = useI18n()
  const score = scoreOf(state, mode)

  return (
    <Card
      className={cn('flex flex-col gap-2 border-2 p-3 team-glow', dense && 'p-2.5')}
      style={{ ['--team-color' as string]: state.color, borderLeftColor: state.color }}
    >
      <div className="flex items-center gap-2">
        <span className={cn('leading-none', dense ? 'text-2xl' : 'text-3xl')}>{state.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-black leading-tight', dense ? 'text-base' : 'text-lg')}>
            {state.name}
            {isBirthday ? ' 🎂' : ''}
          </p>
          {showPlace && state.throws + state.penaltyCount > 0 ? (
            <p className="text-[11px] font-bold uppercase text-sub">
              {t('finish.place', { n: place })}
              {mode === 'additive' ? ` · ${score} ${t('common.points')}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Stat name="throws" label={t('score.throwsShort')} value={state.throws} big={!dense} primary />
        <Stat
          name="penalties"
          label={t('score.penaltyShort')}
          value={state.penaltyPoints}
          big={!dense}
          warn={state.penaltyPoints > 0}
        />
        <Stat
          name="drinks"
          label={t('score.drinkShort')}
          value={state.drinks}
          big={!dense}
          emoji="🍺"
          muted={!drinking}
          dim={!drinking}
        />
      </div>

      {state.modifiers.length ? (
        <div className="flex flex-wrap gap-1">
          {state.modifiers.map((m) => (
            <span
              key={m}
              className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-black uppercase text-violet-900"
            >
              {t(`modifiers.${m}` as 'modifiers.weak_arm')}
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onThrow}
        style={{ backgroundColor: state.color, borderColor: state.color }}
        className={cn(
          'flex w-full items-center justify-center rounded-2xl border-2 font-black text-white shadow-card transition active:scale-[0.97]',
          dense ? 'min-h-[72px] text-xl' : 'min-h-[84px] text-2xl',
        )}
        aria-label={`+ ${t('score.addThrow')} ${state.name}`}
      >
        ＋ {t('score.addThrow').toUpperCase()}
      </button>

      <div className={cn('grid gap-1.5', drinking && !dense ? 'grid-cols-2' : 'grid-cols-1')}>
        <Button variant="neutral" className="min-h-[56px] font-black" onClick={onPenalty}>
          ⚠️ {t('score.addPenalty')}
        </Button>
        {drinking ? (
          <Button
            variant="neutral"
            className="min-h-[56px] border-amber-500 font-black text-amber-700"
            onClick={onDrink}
          >
            🍺 {t('score.addDrink')}
          </Button>
        ) : null}
      </div>

      {state.players.length ? (
        <button
          type="button"
          onClick={onPlayer}
          className="min-h-[44px] truncate rounded-xl border border-dashed border-line px-3 text-left text-xs font-bold text-sub"
        >
          {state.nextPlayer
            ? t('score.nextThrower', { name: state.nextPlayer.name })
            : t('score.nextThrowerNone')}{' '}
          ✎
        </button>
      ) : null}
    </Card>
  )
}

function Stat({
  name,
  label,
  value,
  big,
  primary,
  warn,
  emoji,
  dim,
  muted,
}: {
  name: string
  label: string
  value: number
  big?: boolean
  primary?: boolean
  warn?: boolean
  emoji?: string
  dim?: boolean
  muted?: boolean
}) {
  return (
    <div
      data-stat={name}
      data-value={value}
      className={cn(
        'rounded-2xl border-2 px-1 py-1.5',
        primary ? 'border-brand/40 bg-brand/5' : 'border-line bg-surface2',
        dim && 'opacity-45',
      )}
    >
      <div
        className={cn(
          'font-black leading-none',
          big ? 'text-4xl' : 'text-2xl',
          warn ? 'text-red-600' : 'text-ink',
        )}
      >
        <FlashNumber value={value} />
        {emoji && !muted ? <span className="ml-0.5 align-middle text-sm">{emoji}</span> : null}
      </div>
      <div className="mt-0.5 truncate text-[10px] font-black uppercase tracking-wide text-sub">{label}</div>
    </div>
  )
}
