import { useMemo, useState } from 'react'
import { Card, Button, Chip, SectionTitle, Toggle, cn } from '../components/ui'
import { CardSheet } from '../components/sheets'
import { CARD_CATEGORIES } from '../game/rules'
import { deckFor, useStore } from '../state/store'
import { useI18n, type TranslationKey } from '../i18n'
import type { PartyCard } from '../game/rules'
import type { CardCategory } from '../game/types'

export function PartyScreen() {
  const { t } = useI18n()
  const { game, derived, drawCard, updateSettings, setScreen } = useStore()
  const [card, setCard] = useState<PartyCard | null>(null)
  const [open, setOpen] = useState(false)
  const [drawer, setDrawer] = useState<string>('')
  const [showDeck, setShowDeck] = useState(false)

  const deck = useMemo(() => (game ? deckFor(game.settings) : []), [game])
  const drawn = useMemo(() => {
    if (!game) return []
    return game.events
      .filter((e) => e.type === 'card' && e.cardId)
      .slice(-8)
      .reverse()
      .map((e) => ({
        id: e.id,
        at: e.at,
        card: deck.find((c) => c.id === e.cardId) ?? null,
        team: game.teams.find((tg) => tg.id === e.teamId)?.name ?? '',
      }))
  }, [game, deck])

  if (!game) return null

  const active = derived.byId[drawer] ?? derived.teams[0]

  const onDraw = () => {
    const picked = drawCard(active?.id)
    if (!picked) return
    setCard(picked)
    setOpen(true)
  }

  const toggleCategory = (category: CardCategory, value: boolean) => {
    updateSettings({ categories: { ...game.settings.categories, [category]: value } })
  }

  return (
    <div className="mx-auto max-w-2xl px-3 pb-40 pt-safe">
      <header className="py-3">
        <h1 className="text-xl font-black">{t('party.title')}</h1>
        <p className="text-xs font-semibold text-sub">{t('party.subtitle')}</p>
      </header>

      <Card className="border-2 border-amber-400 bg-amber-50/60">
        <p className="text-sm font-bold text-amber-950">{t('party.cardsLeft', { n: deck.length })}</p>
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {derived.teams.map((team) => (
            <Chip
              key={team.id}
              active={active?.id === team.id}
              color={team.color}
              onClick={() => setDrawer(team.id)}
            >
              {team.emoji} {team.name}
            </Chip>
          ))}
        </div>
        <Button
          className="mt-3 border-amber-600 bg-amber-500 text-lg text-amber-950"
          size="lg"
          block
          disabled={!deck.length}
          onClick={onDraw}
        >
          🎴 {t('party.draw')}
        </Button>
        {!deck.length ? <p className="mt-2 text-xs font-bold text-amber-900">{t('party.noCards')}</p> : null}
      </Card>

      <SectionTitle hint={t('cat.drinkingHint')}>{t('party.categories')}</SectionTitle>
      <Card className="divide-y divide-line border-2">
        {CARD_CATEGORIES.map((category) => {
          const isDrinking = category === 'drinking'
          const disabled = isDrinking && !game.settings.drinkingEnabled
          return (
            <div key={category} className={cn(disabled && 'opacity-50')}>
              <Toggle
                label={t(`cat.${category}` as TranslationKey)}
                hint={t(`cat.${category}Hint` as TranslationKey)}
                checked={game.settings.categories[category] && !disabled}
                onChange={(v) => {
                  if (disabled) return
                  toggleCategory(category, v)
                }}
              />
            </div>
          )
        })}
      </Card>
      {!game.settings.drinkingEnabled ? (
        <p className="mt-2 px-1 text-xs font-bold text-sub">{t('party.drinkingOff')}</p>
      ) : null}

      {drawn.length ? (
        <>
          <SectionTitle>{t('party.drawn')}</SectionTitle>
          <div className="space-y-2">
            {drawn.map((row) => (
              <Card key={row.id} className="flex items-center gap-3 border-2 p-3">
                <span className="text-2xl">{row.card?.icon ?? '🎴'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {row.card ? t(`card.${row.card.id}.title` as TranslationKey) : ''}
                  </p>
                  <p className="truncate text-[11px] font-semibold text-sub">{row.team}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!row.card) return
                    setCard(row.card)
                    setOpen(true)
                  }}
                >
                  👁
                </Button>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle>{t('settings.categories')}</SectionTitle>
      <Button block variant="ghost" onClick={() => setShowDeck((v) => !v)}>
        {showDeck ? '▲' : '▼'} {t('party.cardsLeft', { n: deck.length })}
      </Button>
      {showDeck ? (
        <div className="mt-2 space-y-2">
          {deck.map((c) => (
            <Card key={c.id} className="border-2 p-3">
              <p className="flex items-center gap-2 font-black">
                <span className="text-2xl">{c.icon}</span>
                {t(`card.${c.id}.title` as TranslationKey)}
                <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[10px] uppercase text-sub">
                  {t(`cat.${c.category}` as TranslationKey)}
                </span>
              </p>
              <p className="mt-1 text-sm text-sub">{t(`card.${c.id}.body` as TranslationKey)}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <p className="mt-4 px-1 text-center text-xs text-sub">{t('drink.softHint')}</p>
      <Button className="mt-2" block size="sm" onClick={() => setScreen('settings')}>
        ⚙ {t('nav.settings')}
      </Button>

      <CardSheet card={card} teamId={active?.id ?? ''} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
