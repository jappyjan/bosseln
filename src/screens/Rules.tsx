import { useState } from 'react'
import { Button, Card, cn } from '../components/ui'
import { useI18n, type TranslationKey } from '../i18n'
import { useStore } from '../state/store'

type Tab = 'rules' | 'penalties' | 'safety'

export function RulesScreen() {
  const { t } = useI18n()
  const { game, setScreen } = useStore()
  const [tab, setTab] = useState<Tab>('rules')

  const modeKey: TranslationKey =
    game?.settings.scoringMode === 'additive'
      ? 'rules.winning.modeAdditive'
      : game?.settings.scoringMode === 'ignored'
        ? 'rules.winning.modeIgnored'
        : 'rules.winning.modeTiebreak'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rules', label: t('rules.tabs.rules') },
    { id: 'penalties', label: t('rules.tabs.penalties') },
    { id: 'safety', label: t('rules.tabs.safety') },
  ]

  return (
    <div className="mx-auto max-w-2xl px-3 pb-40 pt-safe">
      <header className="py-3">
        <h1 className="text-xl font-black">{t('rules.title')}</h1>
        <p className="text-xs font-semibold text-sub">{t('rules.intro')}</p>
      </header>

      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={cn(
              'min-h-[44px] shrink-0 rounded-full border-2 px-4 text-sm font-black',
              tab === x.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'rules' ? (
        <div className="space-y-3">
          <Block icon="🎯" title={t('rules.goal.title')} body={t('rules.goal.body')} />
          <Block
            icon="🎳"
            title={t('rules.throwing.title')}
            bullets={[
              t('rules.throwing.1'),
              t('rules.throwing.2'),
              t('rules.throwing.3'),
              t('rules.throwing.4'),
            ]}
          />
          <Block
            icon="🏆"
            title={t('rules.winning.title')}
            body={t('rules.winning.body')}
            note={t(modeKey)}
            onAction={() => setScreen('settings')}
            actionLabel={t('settings.scoring')}
          />
          <Block icon="🃏" title={t('rules.joker.title')} body={t('rules.joker.body')} />
          <Block icon="🎴" title={t('rules.party.title')} body={t('rules.party.body')} />
          <Block icon="🍺" title={t('rules.drinks.title')} body={t('rules.drinks.body')} />
        </div>
      ) : null}

      {tab === 'penalties' ? (
        <div className="space-y-3">
          <Block icon="⚠️" title={t('rules.penalties.title')} body={t('rules.penalties.body')} />
          <Card className="border-2">
            <ul className="divide-y divide-line">
              {(game?.penaltyRules ?? []).map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 py-3">
                  <span className="text-2xl">{rule.icon}</span>
                  <span className="flex-1">
                    <span className="block font-bold leading-tight">
                      {rule.label ?? (rule.labelKey ? t(rule.labelKey as TranslationKey) : rule.id)}
                    </span>
                    <span className="text-xs text-sub">
                      +{rule.points} {t('common.points')}
                      {rule.drink ? ' · 🍺' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setScreen('settings')}
              className="mt-3 w-full rounded-2xl border-2 border-dashed border-line py-3 text-sm font-bold text-sub"
            >
              {t('settings.penaltyRules')} ✎
            </button>
          </Card>
          <Block icon="🧾" title={t('rules.simplified.title')} body={t('rules.simplified.body')} />
        </div>
      ) : null}

      {tab === 'safety' ? (
        <div className="space-y-3">
          <Card className="border-4 border-red-600 bg-red-50">
            <p className="flex items-center gap-2 text-lg font-black text-red-900">
              🚨 {t('rules.safety.banner')}
            </p>
          </Card>
          <Block
            icon="🦺"
            title={t('rules.safety.title')}
            bullets={[t('rules.safety.1'), t('rules.safety.2'), t('rules.safety.3'), t('rules.safety.4')]}
          />
          <Block icon="🧾" title={t('rules.simplified.title')} body={t('rules.simplified.body')} />
        </div>
      ) : null}
    </div>
  )
}

function Block({
  icon,
  title,
  body,
  bullets,
  note,
  actionLabel,
  onAction,
}: {
  icon: string
  title: string
  body?: string
  bullets?: string[]
  note?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <Card className="border-2">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <span className="text-2xl">{icon}</span>
        {title}
      </h2>
      {body ? <p className="mt-2 text-sm leading-relaxed text-ink">{body}</p> : null}
      {bullets ? (
        <ul className="mt-2 space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm leading-snug">
              <span className="mt-0.5 text-brand">▸</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? (
        <p className="mt-3 rounded-2xl bg-surface2 px-3 py-2 text-xs font-bold text-sub">{note}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-2" block size="sm" onClick={onAction}>
          {actionLabel} ✎
        </Button>
      ) : null}
    </Card>
  )
}
