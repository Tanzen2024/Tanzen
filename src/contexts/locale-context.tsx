import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultLocale, getTranslation, type SupportedLocale, type TranslationDictionary } from '@/i18n';

const STORAGE_KEY = 'tanzen-locale';
const validLocale = (value: string | null): value is SupportedLocale => value === 'fr' || value === 'en';

type LocaleContextValue = { locale: SupportedLocale; dictionary: TranslationDictionary; setLocale: (locale: SupportedLocale) => void; t: (section: keyof TranslationDictionary, key: string, values?: Record<string, string>) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => { const stored = localStorage.getItem(STORAGE_KEY); return validLocale(stored) ? stored : defaultLocale; });
  const dictionary = getTranslation(locale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = (nextLocale: SupportedLocale) => { localStorage.setItem(STORAGE_KEY, nextLocale); setLocaleState(nextLocale); };
  const value = useMemo<LocaleContextValue>(() => ({ locale, dictionary, setLocale, t: (section, key, values) => { const value = String((dictionary[section] as Record<string, unknown>)[key] ?? (getTranslation(defaultLocale)[section] as Record<string, unknown>)[key] ?? key); return values ? Object.entries(values).reduce((text, [name, replacement]) => text.split(`{${name}}`).join(replacement), value) : value; } }), [dictionary, locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() { const context = useContext(LocaleContext); if (!context) throw new Error('useLocale must be used inside LocaleProvider'); return context; }
