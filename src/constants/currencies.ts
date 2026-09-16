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

/**
 * Repli utilisé uniquement par le formulaire d'édition d'une tontine
 * existante qui n'a jamais eu de devise enregistrée (rétrocompatibilité,
 * cf. `TontineEdit`). N'est plus utilisé à la création : depuis le mandat
 * « devise automatique », la devise d'une nouvelle tontine MONEY est
 * héritée de Paramètres > Organisation (`organizationSettingsList`), jamais
 * choisie dans le formulaire.
 */
export const DEFAULT_CURRENCY_CODE = 'XAF';

export function getCurrencyLabel(code: string | undefined, locale: 'fr' | 'en' = 'fr'): string {
  const currency = currencies.find((item) => item.code === code);
  if (!currency) return code ?? '';
  return locale === 'en' ? currency.labelEn : currency.labelFr;
}

/**
 * Libellé court affiché directement accolé à un montant (ex. suffixe du
 * champ « Montant de cotisation »), par opposition au code ISO technique
 * (`code`) ou au libellé long (`getCurrencyLabel`, ex. « Franc CFA BCEAO »).
 * Même convention que `formatFCFA`/`MoneyDisplay` (déjà présents dans ce
 * projet), qui affichent un libellé courant plutôt que le code ISO pour les
 * francs CFA (XOF/XAF) — ici « CFA » plutôt que « FCFA », à la demande
 * explicite du mandat « devise du montant de cotisation ». Toute autre
 * devise retombe sur son code ISO, faute de convention de libellé court
 * démontrée ailleurs dans le projet pour ces devises.
 */
export function getCurrencyShortLabel(code: string | undefined): string {
  if (code === 'XOF' || code === 'XAF') return 'CFA';
  return code ?? '';
}
