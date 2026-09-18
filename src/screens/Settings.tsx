import { useRef, useState } from 'react'
import { Button, Card, Chip, ConfirmDialog, Field, SectionTitle, Segmented, Stepper, Toggle, cn } from '../components/ui'
import { ShareSheet } from '../components/ShareSheet'
import { CARD_CATEGORIES } from '../game/rules'
import { uid } from '../game/rules'
import { downloadJson } from '../game/storage'
import { roomCode } from '../game/sync'
import { useI18n, type TranslationKey } from '../i18n'
import { useStore } from '../state/store'
import type { CardCategory, ScoringMode } from '../game/types'

const VERSION = '1.0.0'

export function SettingsScreen() {
  const { t, manual, setLang, formatTime } = useI18n()
  const {
    game,
    prefs,
    setPrefs,
    updateSettings,
    updateGame,
    updatePenaltyRule,
    removePenaltyRule,
    addPenaltyRule,
    resetGame,
    importGame,
    syncStatus,
    showToast,
  } = useStore()

  const [resetOpen, setResetOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [newRule, setNewRule] = useState({ label: '', points: 1, drink: false })
  const [brokerText, setBrokerText] = useState(() => prefs.brokers.join(', '))
  const fileRef = useRef<HTMLInputElement | null>(null)

  if (!game) return null

  const statusKey: TranslationKey =
    syncStatus.state === 'off'
      ? 'settings.syncOff'
      : syncStatus.state === 'connecting'
        ? 'settings.syncConnecting'
        : syncStatus.state === 'error'
          ? 'settings.syncError'
          : 'settings.syncLive'

  return (
    <div className="mx-auto max-w-2xl px-3 pb-40 pt-safe">
      <header className="py-3">
        <h1 className="text-xl font-black">{t('settings.title')}</h1>
      </header>

      {/* ---------------------------------------------------------- language */}
      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Card className="border-2">
        <Segmented<'auto' | 'de' | 'en'>
          columns={3}
          value={manual ?? 'auto'}
          onChange={(v) => setLang(v === 'auto' ? null : v)}
          options={[
            { value: 'auto', label: t('settings.languageAuto') },
            { value: 'de', label: 'Deutsch' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Card>

      {/* ------------------------------------------------------- appearance */}
      <SectionTitle hint={t('settings.themeHint')}>{t('settings.theme')}</SectionTitle>
      <Card className="space-y-3 border-2">
        <Segmented<'light' | 'dark'>
          columns={2}
          value={prefs.theme}
          onChange={(v) => setPrefs({ theme: v })}
          options={[
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
          ]}
        />
        <Segmented<'normal' | 'large'>
          columns={2}
          value={prefs.textScale}
          onChange={(v) => setPrefs({ textScale: v })}
          options={[
            { value: 'normal', label: t('settings.textScale.normal') },
            { value: 'large', label: t('settings.textScale.large') },
          ]}
        />
      </Card>

      {/* ---------------------------------------------------------- scoring */}
      <SectionTitle hint={t('settings.scoringHint')}>{t('settings.scoring')}</SectionTitle>
      <div className="grid gap-2">
        {(['tiebreak', 'additive', 'ignored'] as ScoringMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => updateSettings({ scoringMode: mode })}
            className={cn(
              'rounded-2xl border-2 px-4 py-3 text-left',
              game.settings.scoringMode === mode ? 'border-brand bg-brand/10' : 'border-line bg-surface',
            )}
          >
            <span className="block font-bold">
              {mode === 'tiebreak'
                ? t('setup.scoringTiebreak')
                : mode === 'additive'
                  ? t('setup.scoringAdditive')
                  : t('setup.scoringIgnored')}
            </span>
            <span className="text-xs text-sub">
              {mode === 'tiebreak'
                ? t('setup.scoringTiebreakHint')
                : mode === 'additive'
                  ? t('setup.scoringAdditiveHint')
                  : t('setup.scoringIgnoredHint')}
            </span>
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------- behaviour */}
      <SectionTitle hint={t('settings.drinkingHint')}>{t('settings.drinking')}</SectionTitle>
      <Card className="divide-y divide-line border-2">
        <Toggle
          label={t('settings.drinking')}
          hint={t('drink.softHint')}
          checked={game.settings.drinkingEnabled}
          onChange={(v) => updateSettings({ drinkingEnabled: v, drinkingCards: v ? game.settings.drinkingCards : false })}
        />
        <Toggle
          label={t('settings.drinkingCards')}
          checked={game.settings.drinkingCards}
          onChange={(v) => updateSettings({ drinkingCards: v })}
        />
        <Toggle
          label={t('settings.autoRotate')}
          checked={game.settings.autoRotate}
          onChange={(v) => updateSettings({ autoRotate: v })}
        />
        <Toggle
          label={t('settings.haptics')}
          hint={t('settings.hapticsHint')}
          checked={game.settings.haptics}
          onChange={(v) => updateSettings({ haptics: v })}
        />
      </Card>

      <SectionTitle hint={t('cat.drinkingHint')}>{t('settings.categories')}</SectionTitle>
      <Card className="divide-y divide-line border-2">
        {CARD_CATEGORIES.map((category: CardCategory) => (
          <Toggle
            key={category}
            label={t(`cat.${category}` as TranslationKey)}
            hint={t(`cat.${category}Hint` as TranslationKey)}
            checked={game.settings.categories[category]}
            onChange={(v) => updateSettings({ categories: { ...game.settings.categories, [category]: v } })}
          />
        ))}
      </Card>

      {/* --------------------------------------------------------------- game */}
      <SectionTitle>{t('settings.game')}</SectionTitle>
      <Card className="space-y-3 border-2">
        <Field
          label={t('settings.renameGame')}
          value={game.name}
          onChange={(e) => updateGame({ name: e.target.value })}
        />
        <Field
          label={t('setup.route')}
          value={game.route}
          onChange={(e) => updateGame({ route: e.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          {game.teams.map((team) => (
            <Chip key={team.id} color={team.color} active>
              {team.emoji} {team.name}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-sub">{t('setup.playersHint')}</p>
      </Card>

      {/* ------------------------------------------------------ penalty rules */}
      <SectionTitle hint={t('settings.penaltyRulesHint')}>{t('settings.penaltyRules')}</SectionTitle>
      <Card className="border-2">
        <ul className="divide-y divide-line">
          {game.penaltyRules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="text-xl">{rule.icon}</span>
              <span className="min-w-0 flex-1 truncate font-bold">
                {rule.label ?? (rule.labelKey ? t(rule.labelKey as TranslationKey) : rule.id)}
              </span>
              <Stepper
                value={rule.points}
                min={1}
                max={5}
                onChange={(v) => updatePenaltyRule({ ...rule, points: v })}
              />
              <button
                type="button"
                aria-label={t('penalty.drinkAttach')}
                onClick={() => updatePenaltyRule({ ...rule, drink: !rule.drink })}
                className={cn(
                  'min-h-[44px] min-w-[44px] rounded-xl border-2 text-lg',
                  rule.drink ? 'border-amber-500 bg-amber-100' : 'border-line',
                )}
              >
                🍺
              </button>
              {!rule.builtIn ? (
                <Button size="sm" variant="danger" onClick={() => removePenaltyRule(rule.id)}>
                  🗑
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-3 border-t border-line pt-3">
          <Field
            label={t('setup.penaltyLabel')}
            placeholder={t('penalty.customPlaceholder')}
            value={newRule.label}
            onChange={(e) => setNewRule((c) => ({ ...c, label: e.target.value }))}
          />
          <div className="mt-2 flex items-center justify-between">
            <Stepper
              value={newRule.points}
              min={1}
              max={5}
              label={t('common.points')}
              onChange={(v) => setNewRule((c) => ({ ...c, points: v }))}
            />
            <Chip active={newRule.drink} color="#f59e0b" onClick={() => setNewRule((c) => ({ ...c, drink: !c.drink }))}>
              🍺
            </Chip>
          </div>
          <Button
            className="mt-2"
            block
            disabled={!newRule.label.trim()}
            onClick={() => {
              addPenaltyRule({
                id: uid(),
                label: newRule.label.trim(),
                points: newRule.points,
                drink: newRule.drink,
                icon: '📌',
              })
              setNewRule({ label: '', points: 1, drink: false })
            }}
          >
            {t('common.add')}
          </Button>
        </div>
      </Card>

      {/* --------------------------------------------------------------- data */}
      <SectionTitle hint={t('settings.dataHint')}>{t('settings.data')}</SectionTitle>
      <Card className="space-y-2 border-2">
        <Button block variant="neutral" onClick={() => downloadJson(game)}>
          ⬇ {t('settings.exportJson')}
        </Button>
        <Button block variant="neutral" onClick={() => fileRef.current?.click()}>
          ⬆ {t('settings.importJson')}
        </Button>
        <p className="text-xs text-sub">{t('settings.importReplace')}</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const text = await file.text()
            importGame(text)
            e.target.value = ''
          }}
        />
        <Button block variant="danger" onClick={() => setResetOpen(true)}>
          🗑 {t('settings.resetGame')}
        </Button>
      </Card>

      {/* --------------------------------------------------------------- sync */}
      <SectionTitle hint={t('settings.syncHint')}>{t('settings.sync')}</SectionTitle>
      <Card className="space-y-3 border-2">
        <Button block variant="primary" onClick={() => setShareOpen(true)}>
          📤 {t('share.title')}
        </Button>
        <Toggle
          label={t('settings.syncEnable')}
          checked={prefs.syncEnabled}
          onChange={(v) =>
            setPrefs({
              syncEnabled: v,
              syncRoom: prefs.syncRoom ?? roomCode(),
            })
          }
        />
        <Field
          label={t('settings.syncRoom')}
          hint={t('settings.syncRoomHint')}
          value={prefs.syncRoom ?? ''}
          placeholder="ABC123"
          onChange={(e) => setPrefs({ syncRoom: e.target.value.toUpperCase().replace(/\s+/g, '') })}
        />
        <div className="flex gap-2">
          <Button block size="sm" onClick={() => setPrefs({ syncRoom: roomCode() })}>
            🔄 {t('settings.syncNewRoom')}
          </Button>
          <Button
            block
            size="sm"
            onClick={async () => {
              const code = prefs.syncRoom ?? ''
              try {
                await navigator.clipboard.writeText(code)
                showToast('common.copied')
              } catch {
                showToast('settings.syncError')
              }
            }}
          >
            ⧉ {t('common.copy')}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface2 p-3 text-sm">
          <span className="text-sub">{t('settings.syncStatus')}</span>
          <span className="text-right font-bold">{t(statusKey)}</span>
          <span className="text-sub">{t('settings.syncDevices')}</span>
          <span className="tnum text-right font-bold">{syncStatus.devices}</span>
          <span className="text-sub">{t('settings.syncBroker')}</span>
          <span className="truncate text-right font-bold">
            {syncStatus.broker ? syncStatus.broker.replace(/^wss?:\/\//, '').split('/')[0] : '—'}
          </span>
          <span className="text-sub">{t('settings.syncLast')}</span>
          <span className="text-right font-bold">
            {syncStatus.lastStateAt ? formatTime(syncStatus.lastStateAt) : '—'}
          </span>
        </div>
        <Field
          label={t('settings.brokers')}
          hint={t('settings.brokersHint')}
          value={brokerText}
          onChange={(e) => setBrokerText(e.target.value)}
          onBlur={() =>
            setPrefs({
              brokers: brokerText
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
        <p className="text-xs text-sub">{t('settings.syncPublicHint')}</p>
      </Card>

      {/* -------------------------------------------------------------- about */}
      <SectionTitle>{t('settings.about')}</SectionTitle>
      <Card className="border-2">
        <p className="text-sm text-sub">{t('settings.aboutBody')}</p>
        <p className="mt-2 text-xs font-bold text-sub">{t('settings.version')} {VERSION}</p>
        <p className="mt-2 rounded-2xl bg-surface2 px-3 py-2 text-xs font-bold text-sub">{t('err.pwaHint')}</p>
      </Card>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />

      <ConfirmDialog
        open={resetOpen}
        title={t('confirm.reset')}
        body={t('settings.resetConfirm')}
        confirmLabel={t('settings.resetGame')}
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false)
          resetGame()
        }}
      />
    </div>
  )
}
