import { useState } from 'react'
import { Button, Card, Chip, Field, SectionTitle, Stepper, Toggle, cn } from '../components/ui'
import {
  DEFAULT_PENALTY_RULES,
  TEAM_COLORS,
  TEAM_EMOJIS,
  newTeam,
  uid,
} from '../game/rules'
import type { PenaltyRule, ScoringMode, Team } from '../game/types'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'

export function SetupScreen() {
  const { t, lang, setLang, manual } = useI18n()
  const { startGame, prefs, setPrefs, haptic, joinGame } = useStore()

  const [name, setName] = useState(() => t('setup.defaultGameName'))
  const [route, setRoute] = useState('')
  const [teams, setTeams] = useState<Team[]>(() => [
    newTeam(0, t('setup.defaultTeam', { n: 1 })),
    newTeam(1, t('setup.defaultTeam', { n: 2 })),
  ])
  const [birthdayTeamId, setBirthdayTeamId] = useState<string | undefined>()
  const [rules, setRules] = useState<PenaltyRule[]>(DEFAULT_PENALTY_RULES)
  const [scoringMode, setScoringMode] = useState<ScoringMode>('tiebreak')
  const [drinking, setDrinking] = useState(true)
  const [partyMode, setPartyMode] = useState(true)
  const [newRule, setNewRule] = useState<{ label: string; points: number; drink: boolean }>({
    label: '',
    points: 1,
    drink: false,
  })
  const [joinCode, setJoinCode] = useState('')

  const setCount = (n: number) => {
    setTeams((cur) => {
      const next = [...cur]
      while (next.length < n) next.push(newTeam(next.length, t('setup.defaultTeam', { n: next.length + 1 })))
      return next.slice(0, n)
    })
  }

  const patchTeam = (id: string, patch: Partial<Team>) =>
    setTeams((cur) => cur.map((team) => (team.id === id ? { ...team, ...patch } : team)))

  const canStart = teams.length > 0 && teams.every((team) => team.name.trim().length > 0)

  const start = () => {
    if (!canStart) return
    haptic('heavy')
    startGame({
      name,
      route,
      teams: teams.map((team) => ({
        ...team,
        name: team.name.trim(),
        players: team.players.filter((p) => p.name.trim()),
      })),
      birthdayTeamId,
      penaltyRules: rules,
      settings: {
        scoringMode,
        drinkingEnabled: drinking,
        drinkingCards: drinking,
        categories: { harmless: partyMode, modifier: partyMode, drinking: partyMode && drinking },
        autoRotate: true,
        haptics: true,
      },
    })
    setPrefs({})
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-safe">
      <header className="flex items-start justify-between gap-3 py-4">
        <div>
          <h1 className="text-2xl font-black leading-tight">{t('app.name')}</h1>
          <p className="text-sm text-sub">{t('app.tagline')}</p>
        </div>
        <div className="flex gap-1">
          <Chip active={manual === 'de'} onClick={() => setLang('de')}>
            DE
          </Chip>
          <Chip active={manual === 'en'} onClick={() => setLang('en')}>
            EN
          </Chip>
          <Chip active={!manual} onClick={() => setLang(null)} title={t('settings.languageAuto')}>
            {lang === 'de' ? 'Auto' : 'Auto'}
          </Chip>
        </div>
      </header>

      <Card className="border-2">
        <h2 className="text-lg font-black">{t('setup.title')}</h2>
        <p className="mb-3 text-sm text-sub">{t('setup.subtitle')}</p>
        <div className="space-y-3">
          <Field label={t('setup.gameName')} value={name} onChange={(e) => setName(e.target.value)} />
          <Field
            label={`${t('setup.route')} (${t('common.optional')})`}
            placeholder={t('setup.routePlaceholder')}
            value={route}
            onChange={(e) => setRoute(e.target.value)}
          />
        </div>
      </Card>

      <Card className="mb-1 border-2 border-emerald-600 bg-emerald-50/60">
        <h2 className="flex items-center gap-2 text-base font-black text-emerald-950">
          🔗 {t('setup.modeJoin')}
        </h2>
        <p className="mt-1 text-xs font-semibold text-emerald-950/80">{t('setup.joinHint')}</p>
        <div className="mt-3 flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="ABC123"
            aria-label={t('share.code')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="min-h-[56px] w-full flex-1 rounded-2xl border-2 border-emerald-600 bg-surface px-3 text-center font-mono text-2xl font-black tracking-[0.2em] outline-none focus:border-emerald-700"
          />
          <Button
            variant="success"
            className="min-h-[56px] shrink-0"
            disabled={joinCode.replace(/[^A-Z0-9]/g, '').length < 4}
            onClick={() => joinGame(joinCode)}
          >
            {t('setup.modeJoin')}
          </Button>
        </div>
      </Card>

      <SectionTitle>{t('setup.teams')}</SectionTitle>
      <Card className="mb-3 border-2">
        <div className="flex items-center justify-between">
          <span className="font-bold">{t('setup.teamCount')}</span>
          <Stepper value={teams.length} min={1} max={8} onChange={setCount} />
        </div>
      </Card>

      <div className="space-y-3">
        {teams.map((team) => (
          <Card key={team.id} className="border-2" style={{ borderLeftWidth: 8, borderLeftColor: team.color }}>
            <div className="flex items-center gap-2">
              <span className="text-3xl">{team.emoji}</span>
              <input
                value={team.name}
                onChange={(e) => patchTeam(team.id, { name: e.target.value })}
                className="min-h-[48px] flex-1 rounded-2xl border-2 border-line bg-surface px-3 text-base font-bold outline-none focus:border-brand"
                aria-label={t('setup.teamName')}
              />
            </div>

            <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto pb-1">
              {TEAM_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={emoji}
                  onClick={() => patchTeam(team.id, { emoji })}
                  className={cn(
                    'min-h-[44px] min-w-[44px] shrink-0 rounded-xl border-2 text-xl',
                    team.emoji === emoji ? 'border-brand bg-brand/10' : 'border-line bg-surface',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => patchTeam(team.id, { color })}
                  style={{ backgroundColor: color }}
                  className={cn(
                    'h-9 w-9 rounded-full border-4',
                    team.color === color ? 'border-ink' : 'border-transparent',
                  )}
                />
              ))}
            </div>

            <PlayerEditor
              team={team}
              onChange={(players) => patchTeam(team.id, { players })}
              addLabel={t('setup.addPlayer')}
              placeholder={t('setup.playerPlaceholder')}
            />

            <div className="mt-3">
              <Chip
                active={birthdayTeamId === team.id}
                color="#db2777"
                onClick={() => setBirthdayTeamId(birthdayTeamId === team.id ? undefined : team.id)}
              >
                🎂 {t('setup.birthday')}
              </Chip>
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle hint={t('setup.scoringHint')}>{t('setup.scoring')}</SectionTitle>
      <div className="grid gap-2">
        {(['tiebreak', 'additive', 'ignored'] as ScoringMode[]).map((mode) => {
          const active = scoringMode === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setScoringMode(mode)}
              className={cn(
                'rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.99]',
                active ? 'border-brand bg-brand/10' : 'border-line bg-surface',
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
          )
        })}
      </div>

      <SectionTitle hint={t('setup.drinkingHint')}>{t('setup.drinking')}</SectionTitle>
      <Card className="border-2">
        <Toggle label={t('setup.drinking')} checked={drinking} onChange={setDrinking} hint={t('drink.chug')} />
      </Card>

      <SectionTitle hint={t('setup.partyHint')}>{t('setup.party')}</SectionTitle>
      <Card className="border-2">
        <Toggle label={t('party.categories')} checked={partyMode} onChange={setPartyMode} />
        <p className="mt-1 text-xs text-sub">{t('cat.drinkingHint')}</p>
      </Card>

      <SectionTitle hint={t('setup.customPenaltiesHint')}>{t('setup.customPenalties')}</SectionTitle>
      <Card className="border-2">
        <div className="space-y-2">
          {rules
            .filter((r) => !r.builtIn)
            .map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2">
                <span className="flex-1 font-semibold">{r.label}</span>
                <span className="tnum text-sm font-bold text-sub">+{r.points}</span>
                {r.drink ? <span>🍺</span> : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('common.remove')}
                  onClick={() => setRules((cur) => cur.filter((x) => x.id !== r.id))}
                >
                  🗑
                </Button>
              </div>
            ))}
          {rules.filter((r) => !r.builtIn).length === 0 ? (
            <p className="text-sm text-sub">{t('setup.noCustomPenalties')}</p>
          ) : null}

          <div className="pt-2">
            <Field
              label={t('setup.penaltyLabel')}
              placeholder={t('penalty.customPlaceholder')}
              value={newRule.label}
              onChange={(e) => setNewRule((cur) => ({ ...cur, label: e.target.value }))}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <Stepper
                value={newRule.points}
                min={1}
                max={5}
                label={t('common.points')}
                onChange={(v) => setNewRule((cur) => ({ ...cur, points: v }))}
              />
              <Chip active={newRule.drink} color="#f59e0b" onClick={() => setNewRule((cur) => ({ ...cur, drink: !cur.drink }))}>
                🍺
              </Chip>
            </div>
            <Button
              className="mt-2"
              block
              disabled={!newRule.label.trim()}
              onClick={() => {
                setRules((cur) => [
                  ...cur,
                  { id: uid(), label: newRule.label.trim(), points: newRule.points, drink: newRule.drink, icon: '📌' },
                ])
                setNewRule({ label: '', points: 1, drink: false })
              }}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 mt-5 bg-surface2/90 py-3 backdrop-blur" style={{ paddingBottom: 'calc(var(--safe-b) + 0.75rem)' }}>
        <Button variant="primary" size="lg" block disabled={!canStart} onClick={start}>
          ▶ {t('setup.startGame')}
        </Button>
        <p className="mt-2 text-center text-xs text-sub">
          {t('setup.summary', {
            teams: teams.length,
            players: teams.reduce((s, x) => s + x.players.length, 0),
            cards: partyMode ? 18 : 0,
          })}
          {prefs.syncEnabled ? ' · Sync' : ''}
        </p>
      </div>
    </div>
  )
}

function PlayerEditor({
  team,
  onChange,
  addLabel,
  placeholder,
}: {
  team: Team
  onChange: (players: Team['players']) => void
  addLabel: string
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {team.players.map((p) => (
          <span
            key={p.id}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border-2 border-line px-3 text-sm font-bold"
          >
            {p.name}
            <button
              type="button"
              aria-label="remove"
              onClick={() => onChange(team.players.filter((x) => x.id !== p.id))}
              className="text-sub"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              onChange([...team.players, { id: uid(), name: draft.trim() }])
              setDraft('')
            }
          }}
          className="min-h-[48px] flex-1 rounded-2xl border-2 border-line bg-surface px-3 font-semibold outline-none focus:border-brand"
        />
        <Button
          disabled={!draft.trim()}
          onClick={() => {
            onChange([...team.players, { id: uid(), name: draft.trim() }])
            setDraft('')
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  )
}
