import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'tanzen-theme';
const validTheme = (value: string | null): value is ThemePreference => value === 'light' || value === 'dark' || value === 'system';

export type TenantBranding = { primaryColor: string; logoLight: string; logoDark: string; tenantName: string };
export const defaultTenantBranding: TenantBranding = { primaryColor: '#1b6bd1', logoLight: '/branding/tanzen-logo-light.svg', logoDark: '/branding/tanzen-logo-dark.svg', tenantName: 'Coopérative Sutura' };

type ThemeContextValue = { theme: ThemePreference; setTheme: (theme: ThemePreference) => void; branding: TenantBranding; setBranding: (branding: Partial<TenantBranding>) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => { const stored = localStorage.getItem(STORAGE_KEY); return validTheme(stored) ? stored : 'system'; });
  const [branding, setBrandingState] = useState<TenantBranding>(defaultTenantBranding);
  useEffect(() => { document.documentElement.style.setProperty('--tanzen-primary', branding.primaryColor); }, [branding.primaryColor]);
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches)); apply(); if (theme !== 'system') return; media.addEventListener('change', apply); return () => media.removeEventListener('change', apply); }, [theme]);
  const setTheme = (nextTheme: ThemePreference) => { localStorage.setItem(STORAGE_KEY, nextTheme); setThemeState(nextTheme); };
  const setBranding = (nextBranding: Partial<TenantBranding>) => setBrandingState((current) => ({ ...current, ...nextBranding }));
  const value = useMemo(() => ({ theme, setTheme, branding, setBranding }), [branding, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const context = useContext(ThemeContext); if (!context) throw new Error('useTheme must be used inside ThemeProvider'); return context; }
