import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BottomNav } from './components/Nav'
import { PromptProvider, ToastHost } from './components/ui'
import { guessLang } from './game/storage'
import { I18nProvider, useI18n } from './i18n'
import { StoreProvider, useStore } from './state/store'
import { FinishScreen } from './screens/Finish'
import { HistoryScreen } from './screens/History'
import { PartyScreen } from './screens/Party'
import { RulesScreen } from './screens/Rules'
import { ScoreScreen } from './screens/Score'
import { SettingsScreen } from './screens/Settings'
import { SetupScreen } from './screens/Setup'

class ErrorBoundary extends Component<
  { children: ReactNode; title: string; reload: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Boßeln app error', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="text-4xl">🙈</p>
          <h1 className="mt-2 text-xl font-black">{this.props.title}</h1>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 min-h-[56px] w-full rounded-2xl border-2 border-brand bg-brand font-black text-white"
          >
            {this.props.reload}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Shell() {
  const { ready, game, screen } = useStore()

  if (!ready) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="animate-pulse text-sm font-bold text-sub">…</p>
      </div>
    )
  }

  if (!game) return <SetupScreen />

  return (
    <>
      {screen === 'score' ? <ScoreScreen /> : null}
      {screen === 'history' ? <HistoryScreen /> : null}
      {screen === 'party' ? <PartyScreen /> : null}
      {screen === 'rules' ? <RulesScreen /> : null}
      {screen === 'settings' ? <SettingsScreen /> : null}
      {screen === 'finish' ? <FinishScreen /> : null}
      {screen !== 'finish' ? <BottomNav /> : null}
      <ToastHost />
    </>
  )
}

function Guarded() {
  const { t } = useI18n()
  return (
    <ErrorBoundary title={t('err.title')} reload={t('err.reload')}>
      <Shell />
    </ErrorBoundary>
  )
}

function I18nBridge() {
  const { prefs, setPrefs } = useStore()
  const lang = prefs.lang ?? guessLang()
  return (
    <I18nProvider
      lang={lang}
      manual={prefs.lang ?? null}
      setLang={(l) => setPrefs({ lang: l ?? undefined })}
    >
      <PromptProvider>
        <Guarded />
      </PromptProvider>
    </I18nProvider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <I18nBridge />
    </StoreProvider>
  )
}
