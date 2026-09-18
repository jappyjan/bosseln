import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { de, type TranslationKey } from './de'
import { en } from './en'
import type { Lang } from '../game/types'

const DICTS = { de, en } as const

export type TVars = Record<string, string | number>
export type TFn = (key: TranslationKey, vars?: TVars) => string

const interpolate = (template: string, vars?: TVars): string => {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m,
  )
}

interface I18nValue {
  lang: Lang
  /** null = following the browser language */
  manual: Lang | null
  t: TFn
  /** plural helper: picks `one`/`other` based on `n`, always exposes {n} */
  tp: (one: TranslationKey, other: TranslationKey, n: number, extra?: TVars) => string
  setLang: (lang: Lang | null) => void
  formatTime: (iso: string) => string
  formatDate: (iso: string) => string
}

const I18nCtx = createContext<I18nValue | null>(null)

export function I18nProvider({
  lang,
  manual,
  setLang,
  children,
}: {
  lang: Lang
  manual: Lang | null
  setLang: (lang: Lang | null) => void
  children: ReactNode
}) {
  const value = useMemo<I18nValue>(() => {
    const dict = DICTS[lang] ?? de
    const t: TFn = (key, vars) => interpolate(dict[key] ?? de[key] ?? String(key), vars)
    const locale = lang === 'de' ? 'de-DE' : 'en-GB'
    return {
      lang,
      manual,
      t,
      tp: (one, other, n, extra) => t(n === 1 ? one : other, { n, ...(extra ?? {}) }),
      setLang,
      formatTime: (iso) =>
        new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      formatDate: (iso) =>
        new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
    }
  }, [lang, manual, setLang])

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nCtx)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

export const useT = (): TFn => useI18n().t

export type { TranslationKey }
export { de, en }
