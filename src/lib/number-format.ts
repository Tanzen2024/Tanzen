/**
 * FORMAT RÉGIONAL DES NOMBRES — configuration de l'ASSOCIATION (mandat du 2026-09-26),
 * saisie dans Paramètres → Organisation (`OrganizationSettings.thousandsSeparator` /
 * `decimalSeparator`). SEUL endroit où les séparateurs sont appliqués : `formatNumber`
 * (lib/utils) et `formatCurrency` (constants/currencies) passent tous deux par ici.
 *
 * Pur affichage : la valeur métier reste un `number` (2000000), jamais la chaîne formatée ;
 * aucun calcul, stockage ni envoi à l'API ne passe par ce texte.
 *
 * Le format ACTIF est celui de l'association courante, posé par `useRegionalFormatSync`
 * (shell applicatif) dès que ses paramètres sont chargés. Il n'y a pas de configuration
 * partagée entre tenants : chaque association a la sienne, seule la valeur active change
 * quand on change d'association. Sans configuration → défaut (espace, virgule).
 */
export type ThousandsSeparator = 'space' | 'comma' | 'period';
export type DecimalSeparator = 'comma' | 'period';
export type RegionalFormat = { thousandsSeparator: ThousandsSeparator; decimalSeparator: DecimalSeparator };

export const DEFAULT_REGIONAL_FORMAT: RegionalFormat = { thousandsSeparator: 'space', decimalSeparator: 'comma' };
export const THOUSANDS_SEPARATORS: ThousandsSeparator[] = ['space', 'comma', 'period'];
export const DECIMAL_SEPARATORS: DecimalSeparator[] = ['comma', 'period'];

/** Espace fine insécable (U+202F) : le séparateur que l'affichage « fr » utilisait déjà — un nombre ne se coupe jamais en fin de ligne. */
const THOUSANDS_CHAR: Record<ThousandsSeparator, string> = { space: ' ', comma: ',', period: '.' };
const DECIMAL_CHAR: Record<DecimalSeparator, string> = { comma: ',', period: '.' };

/** Un même caractère ne peut pas séparer à la fois les milliers et les décimales (1,000,5 serait ambigu). */
export function isRegionalFormatValid(format: RegionalFormat): boolean {
  return THOUSANDS_CHAR[format.thousandsSeparator] !== DECIMAL_CHAR[format.decimalSeparator];
}

/** Complète une configuration partielle / absente avec les valeurs par défaut. */
export function resolveRegionalFormat(format?: Partial<RegionalFormat> | null): RegionalFormat {
  const resolved = { ...DEFAULT_REGIONAL_FORMAT, ...Object.fromEntries(Object.entries(format ?? {}).filter(([, value]) => value)) } as RegionalFormat;
  return isRegionalFormatValid(resolved) ? resolved : DEFAULT_REGIONAL_FORMAT;
}

let activeFormat: RegionalFormat = DEFAULT_REGIONAL_FORMAT;
/** Pose le format de l'association courante (appelé par le shell ; `undefined` → défaut). */
export function setActiveRegionalFormat(format?: Partial<RegionalFormat> | null): void {
  activeFormat = resolveRegionalFormat(format);
}
export function getActiveRegionalFormat(): RegionalFormat {
  return activeFormat;
}

export type NumberFormatOptions = { minimumFractionDigits?: number; maximumFractionDigits?: number };

/**
 * Formate un nombre avec les séparateurs de `format` (par défaut : format actif de
 * l'association). Les chiffres et l'arrondi viennent d'`Intl.NumberFormat` ; seuls les
 * séparateurs sont remplacés. Ex. (défaut) 1234567.89 → « 1 234 567,89 ».
 */
export function formatNumberWith(value: number, format: RegionalFormat = activeFormat, options: NumberFormatOptions = {}): string {
  const parts = new Intl.NumberFormat('en-US', { useGrouping: true, ...options }).formatToParts(value);
  return parts.map((part) => {
    if (part.type === 'group') return THOUSANDS_CHAR[format.thousandsSeparator];
    if (part.type === 'decimal') return DECIMAL_CHAR[format.decimalSeparator];
    return part.value;
  }).join('');
}

/**
 * SAISIE D'UN MONTANT (champs monétaires, mandat « Formatage des montants », 2026-09-27) —
 * mêmes séparateurs que l'affichage. Trois représentations, jamais mélangées :
 *   - texte saisi / affiché : « 2 000 000,50 » (format de l'association) ;
 *   - valeur CANONIQUE du formulaire : « 2000000.50 » → chaîne sans séparateur de milliers,
 *     point décimal, lisible par `Number()` ;
 *   - valeur métier : `number` (2000000.5), produite par le formulaire au moment de l'envoi.
 */

/** Caractère du séparateur décimal de `format` (« , » ou « . »). */
export function decimalSeparatorChar(format: RegionalFormat = activeFormat): string {
  return DECIMAL_CHAR[format.decimalSeparator];
}

/** Séparateurs acceptés comme DÉCIMALE à la saisie : « , » et « . » sauf celui qui sépare les milliers (« 2000000.50 » collé reste 2000000,50). */
function decimalMarkers(format: RegionalFormat): string[] {
  return [',', '.'].filter((char) => char !== THOUSANDS_CHAR[format.thousandsSeparator]);
}

const groupDigits = (digits: string, format: RegionalFormat) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_CHAR[format.thousandsSeparator]);

/**
 * Reformate le texte d'un champ montant PENDANT la frappe : chiffres regroupés par milliers,
 * au plus UN séparateur décimal (le premier saisi ; les suivants sont ignorés), au plus
 * `maxFractionDigits` décimales. Tout autre caractère (lettres, séparateurs de milliers
 * mal placés, libellé de devise) est ignoré. Ex. (défaut) « 2000000,5 » → « 2 000 000,5 ».
 * Un « - » EN TÊTE est conservé : un montant négatif reste négatif et les validations
 * existantes (« strictement positif ») le refusent — le formatage ne corrige jamais une saisie.
 */
export function formatAmountInput(text: string, format: RegionalFormat = activeFormat, maxFractionDigits = 2): string {
  const markers = decimalMarkers(format);
  let integer = '';
  let fraction = '';
  let hasDecimal = false;
  const sign = text.trimStart().startsWith('-') ? '-' : '';
  for (const char of text) {
    if (char >= '0' && char <= '9') {
      if (!hasDecimal) integer += char;
      else if (fraction.length < maxFractionDigits) fraction += char;
    } else if (markers.includes(char) && !hasDecimal && maxFractionDigits > 0) {
      hasDecimal = true;
    }
  }
  if (!integer && !hasDecimal) return sign;
  integer = integer.replace(/^0+(?=\d)/, '') || '0';
  return sign + groupDigits(integer, format) + (hasDecimal ? DECIMAL_CHAR[format.decimalSeparator] + fraction : '');
}

/** Texte formaté (sortie de `formatAmountInput`) → valeur canonique (« 2 000 000,50 » → « 2000000.50 », vide → « »). */
export function amountInputToCanonical(text: string, format: RegionalFormat = activeFormat): string {
  const decimal = DECIMAL_CHAR[format.decimalSeparator];
  let canonical = '';
  for (const char of text) {
    if (char >= '0' && char <= '9') canonical += char;
    else if (char === decimal && !canonical.includes('.')) canonical += '.';
  }
  canonical = canonical.replace(/\.$/, '');
  return canonical && text.trimStart().startsWith('-') ? `-${canonical}` : canonical;
}

/**
 * Montant COLLÉ (texte libre, format inconnu : « 2 000 000,50 », « 2,000,000.50 », « 1.234,5 »)
 * → texte canonique. Le séparateur décimal est le DERNIER séparateur admis qui n'apparaît
 * qu'une fois ; tous les autres sont des séparateurs de milliers. `null` si aucun chiffre.
 */
export function parsePastedAmount(text: string, format: RegionalFormat = activeFormat): string | null {
  if (!/\d/.test(text)) return null;
  const markers = decimalMarkers(format).concat(DECIMAL_CHAR[format.decimalSeparator]);
  let decimalIndex = -1;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (markers.includes(char) && text.split(char).length === 2) { decimalIndex = index; break; }
    if (char === ',' || char === '.') break; // dernier séparateur répété → que des milliers
  }
  const digits = (part: string) => part.replace(/\D/g, '');
  const sign = text.trimStart().startsWith('-') ? '-' : '';
  if (decimalIndex < 0) return sign + digits(text).replace(/^0+(?=\d)/, '');
  const integer = digits(text.slice(0, decimalIndex)).replace(/^0+(?=\d)/, '') || '0';
  const fraction = digits(text.slice(decimalIndex + 1));
  return sign + (fraction ? `${integer}.${fraction}` : integer);
}

/**
 * Valeur canonique → texte affiché hors saisie, EXACTEMENT comme `formatCurrency` (sans le
 * libellé de devise) : `minFractionDigits` = décimales de la devise, jusqu'à 2 décimales si
 * le montant en a. Ex. (défaut, XAF) « 50000 » → « 50 000 » ; (EUR) → « 50 000,00 ».
 */
export function canonicalToAmountText(canonical: string, format: RegionalFormat = activeFormat, minFractionDigits = 0): string {
  if (canonical.trim() === '') return '';
  const value = Number(canonical);
  if (!Number.isFinite(value)) return canonical;
  return formatNumberWith(value, format, { minimumFractionDigits: minFractionDigits, maximumFractionDigits: Math.max(minFractionDigits, 2) });
}
