import { en } from '@/locales/en';
import { fr } from '@/locales/fr';

export const supportedLocales = ['fr', 'en'] as const;
export type SupportedLocale = typeof supportedLocales[number];
export const defaultLocale: SupportedLocale = 'fr';
export const translations: Record<SupportedLocale, TranslationDictionary> = { fr, en };
export type TranslationDictionary = { localeName: string; nav: Record<string, string>; shell: Record<string, string>; dashboard: Record<string, string>; notifications: Record<string, string>; organization: Record<string, string>; finance: Record<string, string>; tontines: Record<string, string>; operations: Record<string, string>; access: Record<string, string>; audit: Record<string, string>; settings: Record<string, string>; system: Record<string, string>; public: Record<string, string>; platform: Record<string, string> };
export type TranslationKey = keyof TranslationDictionary;

export function getTranslation(locale: string | null | undefined): TranslationDictionary {
  return translations[locale === 'en' ? 'en' : defaultLocale];
}
