import { useState } from 'react'
import { Button, Card, ConfirmDialog, SectionTitle, cn } from '../components/ui'
import { places } from '../game/engine'
import { resultText } from '../game/stats'
import { computeStats } from '../game/stats'
import { useI18n, type TranslationKey } from '../i18n'
import { useStore } from '../state/store'

export function FinishScreen() {
  const { t, formatDate } = useI18n()
  const { game, derived, finish, reopen, resetGame, setScreen, showToast } = useStore()
  const [newGameOpen, setNewGameOpen] = useState(false)

  if (!game) return null

  const stats = computeStats(game, derived)
  const rank = places(derived.ranking, game.settings.scoringMode)
  const winner = derived.ranking[0]

  const share = async () => {
    const text = resultText(game, derived, t)
    const nav = navigator as Navigator & { share?: (d: { text: string; title: string }) => Promise<void> }
    try {
      if (nav.share) await nav.share({ title: game.name, text })
      else {
        await navigator.clipboard.writeText(text)
        showToast('common.copied')
      }
    } catch {
      /* user cancelled the share sheet */
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-3 pb-32 pt-safe">
      <header className="py-3">
        <h1 className="text-2xl font-black">{t('finish.title')}</h1>
        {winner ? (
          <p className="text-sm font-bold text-sub">
            🏆 {t('finish.winnerIs', { name: `${winner.emoji} ${winner.name}` })}
          </p>
        ) : null}
      </header>

      {/* screenshot friendly result card */}
      <div className="rounded-3xl border-4 border-ink bg-ink p-4 text-surface shadow-sheet">
        <div className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">{t('result.header')}</p>
          <p className="text-xl font-black leading-tight">{game.name}</p>
          <p className="text-xs font-semibold opacity-70">
            {game.route ? `${game.route} · ` : ''}
            {formatDate(game.createdAt)}
          </p>
        </div>

        <div className="space-y-2">
          {derived.ranking.map((team) => (
            <div
              key={team.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-2 px-3 py-2',
                rank[team.id] === 1 ? 'border-amber-400 bg-amber-400/15' : 'border-surface/25',
              )}
            >
              <span className="tnum w-6 text-lg font-black">{rank[team.id]}</span>
              <span className="text-2xl">{team.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-base font-black">{team.name}</span>
              <span className="tnum text-right text-sm font-bold">
                {team.throws} <span className="text-[10px] opacity-70">{t('score.throwsShort')}</span>
                <br />
                <span className="text-[11px] opacity-80">
                  ⚠ {team.penaltyPoints} · 🍺 {team.drinks}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-surface/20 pt-3 text-xs font-bold opacity-80">
          <span>
            {t('finish.totalThrows')}: <span className="tnum">{derived.totals.throws}</span>
          </span>
          <span>{t('result.generated')}</span>
        </div>
        <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-wide opacity-60">
          {t('result.footer')}
        </p>
      </div>
      <p className="mt-2 text-center text-xs text-sub">{t('finish.screenshot')}</p>

      <SectionTitle>{t('finish.ranking')}</SectionTitle>
      <div className="space-y-2">
        {derived.ranking.map((team) => (
          <Card key={team.id} className="border-2 p-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-black text-white"
                style={{ backgroundColor: team.color }}
              >
                {rank[team.id]}
              </span>
              <span className="text-2xl">{team.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-base font-black">{team.name}</span>
              <span className="tnum text-3xl font-black">{team.throws}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs font-bold text-sub">
              <span>
                {t('finish.throws')}: <span className="tnum text-ink">{team.throws}</span>
              </span>
              <span>
                {t('finish.penalties')}: <span className="tnum text-ink">{team.penaltyPoints}</span>
              </span>
              <span>
                {t('finish.drinks')}: <span className="tnum text-ink">{team.drinks}</span>
              </span>
            </div>
            <p className="mt-1 text-center text-[11px] font-semibold text-sub">
              {t('finish.penaltyEvents')}: {team.penaltyCount}
            </p>
          </Card>
        ))}
      </div>

      <SectionTitle>{t('finish.stats')}</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {stats.fun.map((stat) => (
          <Card key={stat.id} className="border-2 p-3">
            <p className="text-2xl">{stat.emoji}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-wide text-sub">
              {t(stat.key as TranslationKey, {
                value: typeof stat.value === 'number' ? stat.value : String(stat.value),
                extra: stat.extra ?? 0,
              })}
            </p>
            {stat.team && stat.id !== 'birthday' ? (
              <p className="mt-1 truncate text-sm font-bold">
                {stat.team.emoji} {stat.team.name}
              </p>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <Button block variant="primary" size="lg" onClick={share}>
          📤 {t('finish.shareText')}
        </Button>
        {derived.finished ? (
          <Button block onClick={reopen}>
            ↩ {t('finish.keepPlaying')} — {t('finish.keepPlayingHint')}
          </Button>
        ) : (
          <Button block onClick={finish}>
            🏁 {t('score.finish')}
          </Button>
        )}
        <Button block onClick={() => setScreen('score')}>
          {t('nav.score')}
        </Button>
        <Button block variant="danger" onClick={() => setNewGameOpen(true)}>
          ✨ {t('finish.newGame')}
        </Button>
      </div>

      <ConfirmDialog
        open={newGameOpen}
        title={t('finish.newGame')}
        body={t('finish.newGameConfirm')}
        confirmLabel={t('finish.newGame')}
        danger
        onCancel={() => setNewGameOpen(false)}
        onConfirm={() => {
          setNewGameOpen(false)
          resetGame()
        }}
      />
    </div>
  )
}
