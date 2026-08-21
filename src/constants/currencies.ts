/**
 * Devises de référence pour les tontines financières (MONEY). Liste
 * centralisée (un seul point de vérité) — étendre se fait uniquement ici.
 */
export type Currency = { code: string; labelFr: string; labelEn: string };

export const currencies: Currency[] = [
  { code: 'XAF', labelFr: 'Franc CFA BEAC', labelEn: 'CFA Franc BEAC' },
  { code: 'XOF', labelFr: 'Franc CFA BCEAO', labelEn: 'CFA Franc BCEAO' },
  { code: 'EUR', labelFr: 'Euro', labelEn: 'Euro' },
  { code: 'USD', labelFr: 'Dollar américain', labelEn: 'US Dollar' },
  { code: 'GBP', labelFr: 'Livre sterling', labelEn: 'Pound Sterling' },
  { code: 'CAD', labelFr: 'Dollar canadien', labelEn: 'Canadian Dollar' },
  { code: 'CHF', labelFr: 'Franc suisse', labelEn: 'Swiss Franc' },
  { code: 'JPY', labelFr: 'Yen japonais', labelEn: 'Japanese Yen' },
  { code: 'CNY', labelFr: 'Yuan chinois', labelEn: 'Chinese Yuan' },
  { code: 'MAD', labelFr: 'Dirham marocain', labelEn: 'Moroccan Dirham' },
  { code: 'NGN', labelFr: 'Naira nigérian', labelEn: 'Nigerian Naira' },
  { code: 'GHS', labelFr: 'Cedi ghanéen', labelEn: 'Ghanaian Cedi' },
  { code: 'ZAR', labelFr: 'Rand sud-africain', labelEn: 'South African Rand' },
  { code: 'KES', labelFr: 'Shilling kényan', labelEn: 'Kenyan Shilling' },
  { code: 'AED', labelFr: 'Dirham des Émirats arabes unis', labelEn: 'UAE Dirham' },
];

/** XAF par défaut à la création — l'utilisateur reste libre d'en choisir une autre (aucune règle imposant une devise selon le tenant/pays). */
export const DEFAULT_CURRENCY_CODE = 'XAF';

export function getCurrencyLabel(code: string | undefined, locale: 'fr' | 'en' = 'fr'): string {
  const currency = currencies.find((item) => item.code === code);
  if (!currency) return code ?? '';
  return locale === 'en' ? currency.labelEn : currency.labelFr;
}
