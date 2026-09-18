import { cn } from './ui'
import { useI18n } from '../i18n'
import { useStore, type Screen } from '../state/store'

const ICONS: Record<string, string> = {
  score: 'M4 18h10M4 12h16M4 6h13',
  history: 'M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v4h4',
  party: 'M4 20l7-16 3 6 6 2-16 8zM13 10l-2 4',
  rules: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm12 3h2v13',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.2-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.2 15H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1.2 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z',
}

const TABS: { id: Screen; labelKey: 'nav.score' | 'nav.history' | 'nav.party' | 'nav.rules' | 'nav.settings' }[] = [
  { id: 'score', labelKey: 'nav.score' },
  { id: 'history', labelKey: 'nav.history' },
  { id: 'party', labelKey: 'nav.party' },
  { id: 'rules', labelKey: 'nav.rules' },
  { id: 'settings', labelKey: 'nav.settings' },
]

export function BottomNav() {
  const { t } = useI18n()
  const { screen, setScreen, prefs, haptic } = useStore()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'var(--safe-b)' }}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map((tab) => {
          const active = screen === tab.id || (screen === 'finish' && tab.id === 'score')
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => {
                  haptic()
                  setScreen(tab.id)
                }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition',
                  active ? 'text-brand' : 'text-sub',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-14 items-center justify-center rounded-full transition',
                    active && 'bg-brand/12',
                    tab.id === 'party' && !active && prefs.theme === 'light' && 'bg-amber-100',
                  )}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
                    <path d={ICONS[tab.id]} />
                  </svg>
                </span>
                {t(tab.labelKey)}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
