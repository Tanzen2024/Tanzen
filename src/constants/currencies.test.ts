import { describe, it, expect } from 'vitest';
import { formatCurrency, getCurrencyDisplayLabel, getCurrencyShortLabel, currencies } from './currencies';

describe('formatCurrency — formatter central (audit normalisation devises)', () => {
  describe('XOF (Franc CFA BCEAO) — 0 décimale, libellé FCFA', () => {
    it('10000 → "10 000 FCFA"', () => {
      expect(formatCurrency(10_000, 'XOF').replace(/\s/g, '')).toBe('10000FCFA');
    });
    it('0 → "0 FCFA"', () => {
      expect(formatCurrency(0, 'XOF').replace(/\s/g, '')).toBe('0FCFA');
    });
    it('250000 (montant important) → "250 000 FCFA"', () => {
      expect(formatCurrency(250_000, 'XOF').replace(/\s/g, '')).toBe('250000FCFA');
    });
    it('le code ISO stocké n\'est jamais modifié par le formatter (reste "XOF" en donnée)', () => {
      const code: string = 'XOF';
      formatCurrency(10_000, code);
      expect(code).toBe('XOF');
    });
  });

  describe('XAF (Franc CFA BEAC) — même libellé FCFA que XOF, code ISO distinct', () => {
    it('10000 → "10 000 FCFA"', () => {
      expect(formatCurrency(10_000, 'XAF').replace(/\s/g, '')).toBe('10000FCFA');
    });
  });

  describe('EUR — 2 décimales, libellé €', () => {
    it('10000 → "10 000,00 €"', () => {
      expect(formatCurrency(10_000, 'EUR', 'fr').replace(/\s/g, '')).toBe('10000,00€');
    });
    it('locale en → même format que l’association (défaut : "10 000,00 €") — mandat « Format régional » 2026-09-26', () => {
      expect(formatCurrency(10_000, 'EUR', 'en').replace(/\s/g, '')).toBe('10000,00€');
    });
    it('0 → "0,00 €"', () => {
      expect(formatCurrency(0, 'EUR', 'fr').replace(/\s/g, '')).toBe('0,00€');
    });
  });

  describe('USD — 2 décimales, libellé $', () => {
    it('10000 → "10 000,00 $"', () => {
      expect(formatCurrency(10_000, 'USD', 'fr').replace(/\s/g, '')).toBe('10000,00$');
    });
  });

  describe('GBP — 2 décimales, libellé £', () => {
    it('10000 → "10 000,00 £"', () => {
      expect(formatCurrency(10_000, 'GBP', 'fr').replace(/\s/g, '')).toBe('10000,00£');
    });
  });

  it('JPY — 0 décimale (comme XOF/XAF), libellé = code ISO (pas de convention Tanzen démontrée)', () => {
    expect(formatCurrency(10_000, 'JPY', 'fr').replace(/\s/g, '')).toBe('10000JPY');
  });

  it('devise ISO inconnue du catalogue : repli honnête sur le code ISO brut, jamais un libellé inventé', () => {
    expect(formatCurrency(1_000, 'ZZZ', 'fr').replace(/\s/g, '')).toBe('1000ZZZ');
  });

  it('code ISO undefined (association sans devise configurée) : devise par défaut XAF → « 1 000 FCFA »', () => {
    expect(formatCurrency(1_000, undefined, 'fr').replace(/\s/g, '')).toBe('1000FCFA');
  });

  /** Mandat « Normalisation des montants » (2026-09-25) : valeur COMPLÈTE, séparateur de milliers = espace, jamais k / M / Md. */
  it.each([
    [0, '0 FCFA'],
    [1_000, '1 000 FCFA'],
    [10_000, '10 000 FCFA'],
    [100_000, '100 000 FCFA'],
    [720_000, '720 000 FCFA'],
    [1_400_000, '1 400 000 FCFA'],
    [24_500_000, '24 500 000 FCFA'],
    [-850_000, '-850 000 FCFA'],
  ])('%d XOF → « %s » (montant complet, jamais compact)', (amount, expected) => {
    const output = formatCurrency(amount, 'XOF', 'fr');
    // Intl fr-FR sépare les milliers par une espace fine insécable (U+202F) : normalisée ici en espace simple.
    expect(output.replace(/\s/g, ' ').replace('−', '-')).toBe(expected);
    expect(output).not.toMatch(/\d\s*(k|M|Md)\b/);
  });

  it('devise à décimales : précision conservée, aucune notation compacte', () => {
    expect(formatCurrency(1_400_000.5, 'EUR', 'fr').replace(/\s/g, ' ')).toBe('1 400 000,50 €');
    expect(formatCurrency(24_500_000, 'EUR', 'en').replace(/\s/g, ' ')).toBe('24 500 000,00 €'); // langue sans effet : format de l'association
  });
});

describe('MULTI-TENANT — même montant, devises différentes du tenant courant (aucune fuite de devise)', () => {
  it('10000 chez un tenant XOF vs un tenant EUR produit deux affichages distincts, sans se contaminer', () => {
    const tenantAOutput = formatCurrency(10_000, 'XOF', 'fr');
    const tenantBOutput = formatCurrency(10_000, 'EUR', 'fr');
    expect(tenantAOutput).not.toBe(tenantBOutput);
    expect(tenantAOutput).toContain('FCFA');
    expect(tenantAOutput).not.toContain('€');
    expect(tenantBOutput).toContain('€');
    expect(tenantBOutput).not.toContain('FCFA');
  });

  it('un tenant USD et un tenant XOF ne partagent jamais le même libellé pour le même montant', () => {
    const tenantC = formatCurrency(10_000, 'USD', 'fr');
    const tenantA = formatCurrency(10_000, 'XOF', 'fr');
    expect(tenantC).toContain('$');
    expect(tenantA).not.toContain('$');
  });
});

describe('getCurrencyDisplayLabel', () => {
  it('XOF → FCFA', () => expect(getCurrencyDisplayLabel('XOF')).toBe('FCFA'));
  it('EUR → €', () => expect(getCurrencyDisplayLabel('EUR')).toBe('€'));
  it('code inconnu → renvoie le code brut, jamais un libellé fabriqué', () => expect(getCurrencyDisplayLabel('ZZZ')).toBe('ZZZ'));
  it('undefined → chaîne vide', () => expect(getCurrencyDisplayLabel(undefined)).toBe(''));
});

describe('getCurrencyShortLabel — suffixe de champ de saisie (convention CFA existante préservée)', () => {
  it('XOF/XAF → "CFA" (convention explicite historique, distincte de "FCFA")', () => {
    expect(getCurrencyShortLabel('XOF')).toBe('CFA');
    expect(getCurrencyShortLabel('XAF')).toBe('CFA');
  });
  it('EUR → € (jamais le code ISO brut)', () => expect(getCurrencyShortLabel('EUR')).toBe('€'));
});

describe('catalogue des devises — un seul point de vérité', () => {
  it('chaque devise catalogée porte un code ISO, un displayLabel et un nombre de décimales', () => {
    for (const currency of currencies) {
      expect(currency.code).toMatch(/^[A-Z]{3}$/);
      expect(currency.displayLabel.length).toBeGreaterThan(0);
      expect(currency.decimals).toBeGreaterThanOrEqual(0);
    }
  });
});
