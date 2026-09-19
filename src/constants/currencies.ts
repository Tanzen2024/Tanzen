/**
 * Devises de référence pour les tontines financières (MONEY). Liste
 * centralisée (un seul point de vérité) — étendre se fait uniquement ici.
 *
 * `displayLabel` = libellé d'affichage utilisateur (jamais le code ISO
 * stocké) et `decimals` = nombre de décimales attendu pour cette devise
 * (unité mineure ISO 4217 : 0 pour XOF/XAF/JPY, 2 pour les autres). Pour les
 * devises sans convention d'affichage distincte explicitement démontrée par
 * Tanzen (au-delà de XOF/XAF/EUR/USD/GBP), `displayLabel` retombe sur le code
 * ISO lui-même — pas de symbole inventé arbitrairement (cf. rapport d'audit).
 */
export type Currency = { code: string; labelFr: string; labelEn: string; displayLabel: string; decimals: number };

export const currencies: Currency[] = [
  { code: 'XAF', labelFr: 'Franc CFA BEAC', labelEn: 'CFA Franc BEAC', displayLabel: 'FCFA', decimals: 0 },
  { code: 'XOF', labelFr: 'Franc CFA BCEAO', labelEn: 'CFA Franc BCEAO', displayLabel: 'FCFA', decimals: 0 },
  { code: 'EUR', labelFr: 'Euro', labelEn: 'Euro', displayLabel: '€', decimals: 2 },
  { code: 'USD', labelFr: 'Dollar américain', labelEn: 'US Dollar', displayLabel: '$', decimals: 2 },
  { code: 'GBP', labelFr: 'Livre sterling', labelEn: 'Pound Sterling', displayLabel: '£', decimals: 2 },
  { code: 'CAD', labelFr: 'Dollar canadien', labelEn: 'Canadian Dollar', displayLabel: 'CAD', decimals: 2 },
  { code: 'CHF', labelFr: 'Franc suisse', labelEn: 'Swiss Franc', displayLabel: 'CHF', decimals: 2 },
  { code: 'JPY', labelFr: 'Yen japonais', labelEn: 'Japanese Yen', displayLabel: 'JPY', decimals: 0 },
  { code: 'CNY', labelFr: 'Yuan chinois', labelEn: 'Chinese Yuan', displayLabel: 'CNY', decimals: 2 },
  { code: 'MAD', labelFr: 'Dirham marocain', labelEn: 'Moroccan Dirham', displayLabel: 'MAD', decimals: 2 },
  { code: 'NGN', labelFr: 'Naira nigérian', labelEn: 'Nigerian Naira', displayLabel: 'NGN', decimals: 2 },
  { code: 'GHS', labelFr: 'Cedi ghanéen', labelEn: 'Ghanaian Cedi', displayLabel: 'GHS', decimals: 2 },
  { code: 'ZAR', labelFr: 'Rand sud-africain', labelEn: 'South African Rand', displayLabel: 'ZAR', decimals: 2 },
  { code: 'KES', labelFr: 'Shilling kényan', labelEn: 'Kenyan Shilling', displayLabel: 'KES', decimals: 2 },
  { code: 'AED', labelFr: 'Dirham des Émirats arabes unis', labelEn: 'UAE Dirham', displayLabel: 'AED', decimals: 2 },
];

/**
 * Repli utilisé quand le code ISO n'est pas (encore) dans `currencies` —
 * ne jamais fabriquer un libellé arbitraire : le code ISO brut reste le
 * seul affichage honnête pour une devise non cataloguée.
 */
function findCurrency(code: string | undefined) {
  return currencies.find((item) => item.code === code);
}

export function getCurrencyDisplayLabel(code: string | undefined): string {
  return findCurrency(code)?.displayLabel ?? code ?? '';
}

/**
 * FORMATTER CENTRAL — seul point d'affichage d'un montant monétaire dans
 * tout le projet (audit "normalisation devises"). Le code ISO stocké n'est
 * JAMAIS modifié : cette fonction ne fait que dériver un texte d'affichage
 * à partir de (montant, code ISO, locale). `Intl.NumberFormat` gère
 * uniquement les séparateurs/décimales régionaux — le libellé métier
 * (`displayLabel`) reste maîtrisé par la table `currencies` ci-dessus.
 */
export function formatCurrency(amount: number, currencyCode: string | undefined, locale: 'fr' | 'en' = 'fr', options?: { compact?: boolean }): string {
  const definition = findCurrency(currencyCode);
  const decimals = definition?.decimals ?? 0;
  const label = definition?.displayLabel ?? currencyCode ?? '';
  const localeStr = locale === 'en' ? 'en-US' : 'fr-FR';
  const numberOptions: Intl.NumberFormatOptions = options?.compact
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  const formatted = new Intl.NumberFormat(localeStr, numberOptions).format(amount);
  return label ? `${formatted} ${label}` : formatted;
}

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
 * Même convention que `formatCurrency`/`MoneyDisplay` (le formatter central
 * de ce projet), qui affichent un libellé courant plutôt que le code ISO pour les
 * francs CFA (XOF/XAF) — ici « CFA » plutôt que « FCFA », à la demande
 * explicite du mandat « devise du montant de cotisation ». Toute autre
 * devise retombe sur son code ISO, faute de convention de libellé court
 * démontrée ailleurs dans le projet pour ces devises.
 */
export function getCurrencyShortLabel(code: string | undefined): string {
  if (code === 'XOF' || code === 'XAF') return 'CFA';
  return getCurrencyDisplayLabel(code);
}
