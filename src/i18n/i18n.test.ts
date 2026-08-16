import { describe, expect, it } from 'vitest';
import { en } from '@/locales/en';
import { fr } from '@/locales/fr';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe('i18n key parity (fr/en)', () => {
  it('has no key present in fr but missing in en', () => {
    const missingInEn = keyPaths(fr).filter((path) => !keyPaths(en).includes(path));
    expect(missingInEn).toEqual([]);
  });

  it('has no key present in en but missing in fr', () => {
    const missingInFr = keyPaths(en).filter((path) => !keyPaths(fr).includes(path));
    expect(missingInFr).toEqual([]);
  });
});
