import { Button, Card, Sheet, cn } from './ui'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'

/**
 * The sharing hub: shows the game code, keeps it readable from a distance
 * (you will read it out loud while standing in a field), offers the link via
 * the native share sheet and reports how many phones are on the game.
 */
export function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tp } = useI18n()
  const { prefs, shareUrl, devices, syncStatus, enableSharing, leaveSync, showToast, haptic } = useStore()

  const code = prefs.syncRoom ?? ''
  const active = prefs.syncEnabled && Boolean(code)
  const statusKey =
    syncStatus.state === 'off'
      ? 'settings.syncOff'
      : syncStatus.state === 'connecting'
        ? 'settings.syncConnecting'
        : syncStatus.state === 'error'
          ? 'settings.syncError'
          : 'settings.syncLive'

  const copy = async (value: string, key: 'toast.codeCopied' | 'toast.linkCopied') => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(key)
    } catch {
      showToast('settings.syncError')
    }
  }

  const nativeShare = async () => {
    haptic()
    const text = t('share.message', { code, link: shareUrl ?? '' })
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url?: string }) => Promise<void> }
    try {
      if (nav.share) await nav.share({ title: t('share.title'), text, url: shareUrl ?? undefined })
      else await copy(text, 'toast.linkCopied')
    } catch {
      /* user dismissed the share sheet */
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('share.title')}
      subtitle={active ? t('share.subtitle') : t('share.enableHint')}
    >
      {active ? (
        <div className="space-y-4">
          <Card className="border-2 border-brand bg-brand/5 text-center">
            <p className="text-xs font-black uppercase tracking-wide text-sub">{t('share.code')}</p>
            <p className="mt-1 select-all font-mono text-5xl font-black tracking-[0.2em] text-ink">{code}</p>
            <p className="mt-2 text-sm font-bold">
              {syncStatus.state === 'live'
                ? devices > 1
                  ? tp('share.devices', 'share.devicesPlural', devices)
                  : t('share.waiting')
                : t(statusKey)}
            </p>
          </Card>

          <Button variant="primary" size="lg" block onClick={nativeShare}>
            📤 {t('share.send')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button block onClick={() => copy(code, 'toast.codeCopied')}>
              ⧉ {t('share.copyCode')}
            </Button>
            <Button block disabled={!shareUrl} onClick={() => copy(shareUrl ?? '', 'toast.linkCopied')}>
              🔗 {t('share.copyLink')}
            </Button>
          </div>

          <p className={cn('rounded-2xl bg-surface2 px-3 py-2 text-xs font-bold text-sub')}>
            {t('share.localHint')}
          </p>
          <p className="text-center text-[11px] font-semibold text-sub">
            {t('settings.syncPublicHint')}
          </p>

          <Button variant="ghost" block onClick={() => { leaveSync(); onClose() }}>
            {t('share.stop')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2">
            {[t('share.enableHint'), t('share.localHint')].map((line) => (
              <li key={line} className="flex gap-2 text-sm font-semibold">
                <span className="text-brand">▸</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              haptic('medium')
              enableSharing()
            }}
          >
            🔗 {t('share.enable')}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

/** small header chip that opens the sharing hub */
export function ShareChip({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  const { prefs, devices } = useStore()
  const active = prefs.syncEnabled && Boolean(prefs.syncRoom)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('share.title')}
      className={cn(
        'flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border-2 px-2 text-sm font-black',
        active ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-line bg-surface text-ink',
      )}
    >
      {active ? '🔗' : '📤'}
      <span className="tnum">{active ? (devices > 1 ? `${devices}📱` : '1📱') : ''}</span>
    </button>
  )
}
