import { useEffect, useState } from 'react'
import { Button, Card, Chip, ConfirmDialog, Sheet, Stepper, cn } from './ui'
import { makeEvent } from '../game/engine'
import { uid } from '../game/rules'
import { useI18n, type TranslationKey } from '../i18n'
import { useStore } from '../state/store'
import type { PartyCard, CardAction } from '../game/rules'
import type { PenaltyRule, TeamState } from '../game/types'

export const ruleText = (t: (k: TranslationKey) => string, rule: PenaltyRule): string =>
  rule.label ?? (rule.labelKey ? t(rule.labelKey as TranslationKey) : rule.id)

function TeamButtons({
  teams,
  onPick,
  highlightId,
  suffix,
}: {
  teams: TeamState[]
  onPick: (teamId: string) => void
  highlightId?: string
  suffix?: string
}) {
  return (
    <div className="grid gap-2">
      {teams.map((team) => (
        <button
          key={team.id}
          type="button"
          onClick={() => onPick(team.id)}
          style={{ borderColor: team.color }}
          className={cn(
            'flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 text-left font-bold transition active:scale-[0.98]',
            highlightId === team.id ? 'bg-brand/10' : 'bg-surface',
          )}
        >
          <span className="text-2xl">{team.emoji}</span>
          <span className="flex-1 text-lg">{team.name}</span>
          {suffix ? <span className="text-xs text-sub">{suffix}</span> : null}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- penalties */

export function PenaltySheet({
  open,
  onClose,
  teamId,
}: {
  open: boolean
  onClose: () => void
  teamId: string
}) {
  const { t } = useI18n()
  const { game, derived, addPenalty, addDrink } = useStore()
  const [step, setStep] = useState<'list' | 'drink' | 'custom'>('list')
  const [rule, setRule] = useState<PenaltyRule | null>(null)
  const [custom, setCustom] = useState({ label: '', points: 1, drink: false })

  useEffect(() => {
    if (open) {
      setStep('list')
      setRule(null)
      setCustom({ label: '', points: 1, drink: false })
    }
  }, [open, teamId])

  if (!game) return null
  const team = derived.byId[teamId]
  if (!team) return null
  const drinking = game.settings.drinkingEnabled

  const choose = (r: PenaltyRule) => {
    if (r.id === 'custom' && r.builtIn) {
      setRule(r)
      setCustom({ label: '', points: r.points, drink: r.drink })
      setStep('custom')
      return
    }
    if (drinking && r.drink) {
      setRule(r)
      setStep('drink')
      return
    }
    addPenalty(teamId, r, { drink: false })
    onClose()
  }

  const logWithDrink = (drinkerId?: string) => {
    if (rule) addPenalty(teamId, rule, { drink: Boolean(drinkerId) })
    if (drinkerId) addDrink(drinkerId, { source: 'penalty', targetTeamId: drinkerId })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('penalty.title', { team: team.name })}
      subtitle={step === 'list' ? t('penalty.subtitle') : t('penalty.whistleWarning')}
    >
      {step === 'list' ? (
        <div className="grid grid-cols-1 gap-2">
          {game.penaltyRules.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => choose(r)}
              className="flex min-h-[68px] items-center gap-3 rounded-2xl border-2 border-line bg-surface px-4 text-left transition active:scale-[0.98]"
            >
              <span className="text-2xl">{r.icon}</span>
              <span className="flex-1">
                <span className="block text-base font-bold leading-tight">{ruleText(t, r)}</span>
                <span className="text-xs text-sub">
                  +{r.points} {t('common.points')}
                  {r.drink && drinking ? ' · 🍺' : ''}
                </span>
              </span>
              <span className="text-2xl text-sub">›</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 'drink' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-sub">
            <span className="text-xl">{rule?.icon}</span>
            {rule ? ruleText(t, rule) : ''}
          </div>
          <p className="text-sm font-bold">{t('penalty.drinkWho')}</p>
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => logWithDrink(teamId)}
          >
            🍺 {team.name}
          </Button>
          <TeamButtons teams={derived.teams.filter((x) => x.id !== teamId)} onPick={(id) => logWithDrink(id)} />
          <Button variant="ghost" block onClick={() => logWithDrink(undefined)}>
            {t('common.skip')}
          </Button>
          <p className="pt-1 text-center text-xs text-sub">{t('drink.chug')}</p>
        </div>
      ) : null}

      {step === 'custom' ? (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-sub">
              {t('penalty.customPlaceholder')}
            </span>
            <input
              value={custom.label}
              autoFocus
              onChange={(e) => setCustom((c) => ({ ...c, label: e.target.value }))}
              className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-base font-semibold outline-none focus:border-brand"
            />
          </label>
          <div className="flex items-center justify-between">
            <Stepper
              value={custom.points}
              min={1}
              max={5}
              label={t('common.points')}
              onChange={(v) => setCustom((c) => ({ ...c, points: v }))}
            />
            {drinking ? (
              <Chip active={custom.drink} color="#f59e0b" onClick={() => setCustom((c) => ({ ...c, drink: !c.drink }))}>
                🍺 {t('penalty.drinkAttach')}
              </Chip>
            ) : null}
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              const label = custom.label.trim() || t('penalty.custom')
              addPenalty(teamId, rule ?? { id: 'custom', points: custom.points, drink: false, icon: '✏️' }, {
                points: custom.points,
                drink: false,
                label,
              })
              if (custom.drink) addDrink(teamId, { source: 'penalty' })
              onClose()
            }}
          >
            {t('common.apply')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}

/* ----------------------------------------------------------------- drinks */

export function DrinkSheet({
  open,
  onClose,
  teamId,
}: {
  open: boolean
  onClose: () => void
  teamId: string
}) {
  const { t } = useI18n()
  const { derived, addDrink, game } = useStore()
  const [soft, setSoft] = useState(false)

  useEffect(() => {
    if (open) setSoft(false)
  }, [open, teamId])

  const team = derived.byId[teamId]
  if (!team) return null

  const log = (whoId: string) => {
    addDrink(whoId, { soft, source: 'manual', targetTeamId: whoId })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('drink.title', { team: team.name })}
      subtitle={t('drink.subtitle')}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={!soft} onClick={() => setSoft(false)}>
            🍺 {t('common.drinks')}
          </Chip>
          <Chip active={soft} color="#0891b2" onClick={() => setSoft(true)}>
            💧 {t('drink.soft')}
          </Chip>
        </div>
        <p className="text-sm font-bold">{t('drink.who')}</p>
        <TeamButtons teams={[team]} onPick={log} suffix={t('common.team')} />
        <p className="text-xs font-bold uppercase tracking-wide text-sub">{t('drink.toAnother')}</p>
        <TeamButtons teams={derived.teams.filter((x) => x.id !== teamId)} onPick={log} />
        <p className="pt-1 text-center text-xs text-sub">{game?.settings.drinkingEnabled ? t('drink.chug') : t('drink.softHint')}</p>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------ party cards */

export function CardSheet({
  card,
  teamId,
  open,
  onClose,
}: {
  card: PartyCard | null
  teamId: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const { derived, addDrink, setModifier, dispatch, game } = useStore()
  const [pick, setPick] = useState<'team' | null>(null)

  useEffect(() => {
    if (open) setPick(null)
  }, [open, card])

  if (!game) return null
  const key = (suffix: string) => `card.${card?.id ?? 'none'}.${suffix}` as TranslationKey

  const drinkFor = (ids: string[], soft = false) => {
    ids.forEach((id) => addDrink(id, { soft, source: 'card', targetTeamId: id }))
    onClose()
  }

  const run = (action: CardAction) => {
    switch (action.kind) {
      case 'drink': {
        if (action.target === 'all') return drinkFor(derived.teams.map((x) => x.id), action.soft ?? false)
        if (action.target === 'allButBirthday') {
          const ids = derived.teams.filter((x) => x.id !== game.birthdayTeamId).map((x) => x.id)
          return drinkFor(ids.length ? ids : derived.teams.map((x) => x.id))
        }
        if (action.target === 'birthday') {
          const id = game.birthdayTeamId ?? teamId
          return drinkFor([id])
        }
        if (action.target === 'mostThrows') {
          const worst = [...derived.teams].sort((a, b) => b.throws - a.throws)[0]
          return drinkFor(worst ? [worst.id] : [teamId])
        }
        setPick('team')
        return
      }
      case 'modifier':
        setPick('team')
        return
      case 'removePenalty': {
        const target = action.target === 'birthday' ? game.birthdayTeamId ?? teamId : teamId
        dispatch(makeEvent('joker', { teamId: target, grantedBy: 'card' }))
        onClose()
        return
      }
      default:
        onClose()
    }
  }

  const applyTeam = (id: string) => {
    const action = card?.actions.find((a) => a.kind === 'drink' || a.kind === 'modifier')
    if (!action) return
    if (action.kind === 'drink') {
      addDrink(id, { soft: action.soft ?? false, source: 'card', targetTeamId: id })
    } else if (action.kind === 'modifier') {
      setModifier(id, action.modifier)
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={card ? t(key('title')) : ''}
      subtitle={t('party.drawn')}
      actions={
        <Button variant="ghost" block onClick={onClose}>
          {t('party.actionInfo')}
        </Button>
      }
    >
      {card ? (
        <div className="space-y-4">
          <Card className="border-2" style={{ borderColor: '#f59e0b' }}>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-5xl">{card.icon}</span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900">
                {t(`cat.${card.category}` as TranslationKey)}
              </span>
            </div>
            <p className="text-lg font-bold leading-snug">{t(key('body'))}</p>
          </Card>

          {pick === 'team' ? (
            <div className="space-y-2">
              <p className="text-sm font-bold">{t('party.pickTeam')}</p>
              <TeamButtons teams={derived.teams} onPick={applyTeam} highlightId={teamId} suffix={t('common.team')} />
            </div>
          ) : (
            <div className="grid gap-2">
              {card.actions.map((action, i) => (
                <Button key={i} variant="primary" size="lg" block onClick={() => run(action)}>
                  {action.kind === 'drink' && action.soft
                    ? `💧 ${t('party.actionDrinkSoft')}`
                    : action.kind === 'drink'
                      ? `🍺 ${t('party.actionDrink')}`
                      : action.kind === 'modifier'
                        ? `📣 ${t('party.actionModifier')}`
                        : action.kind === 'removePenalty'
                          ? `🃏 ${t('party.actionRemovePenalty')}`
                          : `👏 ${t('party.actionInfo')}`}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Sheet>
  )
}

/* --------------------------------------------------------------- players */

export function PlayerSheet({
  open,
  onClose,
  teamId,
}: {
  open: boolean
  onClose: () => void
  teamId: string
}) {
  const { t } = useI18n()
  const { derived, setNextPlayer, setPlayers } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) {
      setEditing(false)
      setDraft('')
    }
  }, [open, teamId])

  const team = derived.byId[teamId]
  if (!team) return null

  return (
    <Sheet open={open} onClose={onClose} title={t('score.setThrowerTitle')} subtitle={team.name}>
      {team.players.length === 0 ? (
        <p className="mb-3 text-sm text-sub">{t('setup.playersHint')}</p>
      ) : (
        <div className="grid gap-2">
          {team.players.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setNextPlayer(teamId, p.id)
                  onClose()
                }}
                className={cn(
                  'flex min-h-[56px] flex-1 items-center gap-3 rounded-2xl border-2 px-4 text-left font-bold transition active:scale-[0.98]',
                  team.nextPlayer?.id === p.id ? 'border-brand bg-brand/10' : 'border-line bg-surface',
                )}
              >
                <span className="text-xl">{team.nextPlayer?.id === p.id ? '▶️' : '👤'}</span>
                {p.name}
              </button>
              {editing ? (
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={t('common.remove')}
                  onClick={() => setPlayers(teamId, team.players.filter((x) => x.id !== p.id))}
                >
                  🗑
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {editing ? (
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('setup.playerPlaceholder')}
              className="min-h-[52px] flex-1 rounded-2xl border-2 border-line bg-surface px-4 font-semibold outline-none focus:border-brand"
            />
            <Button
              variant="primary"
              onClick={() => {
                if (!draft.trim()) return
                setPlayers(teamId, [...team.players, { id: uid(), name: draft.trim() }])
                setDraft('')
              }}
            >
              {t('common.add')}
            </Button>
          </div>
        ) : null}
        <Button variant="ghost" block onClick={() => setEditing((v) => !v)}>
          {editing ? t('common.done') : `✏️ ${t('setup.players')}`}
        </Button>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ joker */

export function JokerDialog({
  open,
  teamId,
  onCancel,
  onConfirm,
}: {
  open: boolean
  teamId: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const { derived } = useStore()
  const team = derived.byId[teamId]
  const hasPenalty = (team?.penaltyPoints ?? 0) > 0
  return (
    <ConfirmDialog
      open={open}
      title={t('score.joker')}
      body={
        hasPenalty
          ? t('score.jokerConfirm', { team: team?.name ?? '' })
          : t('score.jokerNone')
      }
      confirmLabel={t('score.useJoker')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
