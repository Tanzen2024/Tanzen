import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'tanzen-theme';
const validTheme = (value: string | null): value is ThemePreference => value === 'light' || value === 'dark' || value === 'system';

export type TenantBranding = { primaryColor: string; logoLight: string; logoDark: string; tenantName: string };
export const defaultTenantBranding: TenantBranding = { primaryColor: '#1b6bd1', logoLight: '/branding/tanzen-logo-light.svg', logoDark: '/branding/tanzen-logo-dark.svg', tenantName: 'Coopérative Sutura' };

/**
 * `resolvedTheme` (mandat "Finalisation header/layout" — 2026-09-16) : la
 * préférence `theme` reste `'light' | 'dark' | 'system'` (aucune donnée
 * perdue pour un utilisateur déjà sur `'system'`), mais le contrôle exposé
 * dans le header ne propose plus que Clair/Sombre — il a besoin de savoir
 * quelle valeur CONCRÈTE afficher/activer quand `theme === 'system'`.
 * Réutilise exactement le même calcul que l'effet qui applique déjà la
 * classe `.dark` sur `<html>`, au lieu de le dupliquer ailleurs.
 */
type ThemeContextValue = { theme: ThemePreference; resolvedTheme: 'light' | 'dark'; setTheme: (theme: ThemePreference) => void; branding: TenantBranding; setBranding: (branding: Partial<TenantBranding>) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => { const stored = localStorage.getItem(STORAGE_KEY); return validTheme(stored) ? stored : 'system'; });
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [branding, setBrandingState] = useState<TenantBranding>(defaultTenantBranding);
  useEffect(() => { document.documentElement.style.setProperty('--tanzen-primary', branding.primaryColor); }, [branding.primaryColor]);
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const apply = () => setSystemPrefersDark(media.matches); apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply); }, []);
  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;
  useEffect(() => { document.documentElement.classList.toggle('dark', resolvedTheme === 'dark'); }, [resolvedTheme]);
  const setTheme = (nextTheme: ThemePreference) => { localStorage.setItem(STORAGE_KEY, nextTheme); setThemeState(nextTheme); };
  const setBranding = (nextBranding: Partial<TenantBranding>) => setBrandingState((current) => ({ ...current, ...nextBranding }));
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme, branding, setBranding }), [branding, theme, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const context = useContext(ThemeContext); if (!context) throw new Error('useTheme must be used inside ThemeProvider'); return context; }
