import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_REGIONAL_FORMAT, amountInputToCanonical, canonicalToAmountText, formatAmountInput, parsePastedAmount, formatNumberWith, isRegionalFormatValid, resolveRegionalFormat, setActiveRegionalFormat, getActiveRegionalFormat } from './number-format';
import { formatNumber } from './utils';
import { formatCurrency, DEFAULT_CURRENCY_CODE, getCurrencyLabel } from '@/constants/currencies';

/** Espaces (fine insécable U+202F comprise) ramenés à une espace simple pour comparer lisiblement. */
const plain = (text: string) => text.replace(/\s/g, ' ');

afterEach(() => setActiveRegionalFormat(undefined));

describe('Format régional — valeurs par défaut (configuration absente)', () => {
  it('devise XAF, espace pour les milliers, virgule pour les décimales', () => {
    expect(DEFAULT_CURRENCY_CODE).toBe('XAF');
    expect(resolveRegionalFormat(undefined)).toEqual({ thousandsSeparator: 'space', decimalSeparator: 'comma' });
    expect(getActiveRegionalFormat()).toEqual(DEFAULT_REGIONAL_FORMAT);
    expect(getCurrencyLabel('XAF', 'fr')).toBe('Franc CFA d’Afrique centrale');
  });

  it('le séparateur de milliers « espace » est insécable (un montant ne se coupe jamais)', () => {
    expect(formatNumber(1000)).toBe('1 000');
  });
});

describe('Nombres (format par défaut)', () => {
  it.each([
    [1000, '1 000'],
    [10000, '10 000'],
    [50000, '50 000'],
    [1000000, '1 000 000'],
    [1234567, '1 234 567'],
    [2000000, '2 000 000'],
  ])('%d → %s', (value, expected) => {
    expect(plain(formatNumber(value))).toBe(expected);
  });

  it('décimales : 1234567.89 → 1 234 567,89', () => {
    expect(plain(formatNumber(1234567.89))).toBe('1 234 567,89');
  });

  it('jamais de notation compacte (2 000 000, pas 2M ni 2 000 k)', () => {
    expect(plain(formatNumber(2_000_000))).toBe('2 000 000');
  });
});

describe('Montants', () => {
  it('2000000 → 2 000 000 FCFA (code technique XAF, libellé d’affichage FCFA)', () => {
    expect(plain(formatCurrency(2_000_000, 'XAF'))).toBe('2 000 000 FCFA');
  });

  it('1234567.89 → 1 234 567,89 FCFA (jamais arrondi en silence)', () => {
    expect(plain(formatCurrency(1234567.89, 'XAF'))).toBe('1 234 567,89 FCFA');
  });

  it('devise absente → XAF par défaut', () => {
    expect(plain(formatCurrency(50_000, undefined))).toBe('50 000 FCFA');
  });

  it('la langue de l’interface ne change plus les séparateurs : c’est l’association qui décide', () => {
    expect(formatCurrency(720_000, 'XAF', 'en')).toBe(formatCurrency(720_000, 'XAF', 'fr'));
  });
});

describe('Changement de configuration de l’association', () => {
  it('séparateur de milliers = virgule : 2000000 → 2,000,000', () => {
    setActiveRegionalFormat({ thousandsSeparator: 'comma', decimalSeparator: 'period' });
    expect(formatNumber(2_000_000)).toBe('2,000,000');
    expect(formatNumber(1234567.89)).toBe('1,234,567.89');
    expect(formatCurrency(2_000_000, 'XAF')).toBe('2,000,000 FCFA');
  });

  it('séparateur de milliers = point : 2000000 → 2.000.000', () => {
    setActiveRegionalFormat({ thousandsSeparator: 'period', decimalSeparator: 'comma' });
    expect(formatNumber(2_000_000)).toBe('2.000.000');
    expect(formatNumber(1234567.89)).toBe('1.234.567,89');
  });

  it('la valeur interne reste 2000000 : le formatage ne produit qu’un texte, jamais une valeur métier', () => {
    const value = 2_000_000;
    setActiveRegionalFormat({ thousandsSeparator: 'period', decimalSeparator: 'comma' });
    formatCurrency(value, 'XAF');
    expect(value).toBe(2000000);
    expect(typeof value).toBe('number');
  });

  it('séparateurs identiques refusés (ambigus) : on retombe sur le défaut', () => {
    expect(isRegionalFormatValid({ thousandsSeparator: 'comma', decimalSeparator: 'comma' })).toBe(false);
    expect(resolveRegionalFormat({ thousandsSeparator: 'comma', decimalSeparator: 'comma' })).toEqual(DEFAULT_REGIONAL_FORMAT);
  });

  it('format explicite (ex. aperçu du formulaire) sans toucher au format actif', () => {
    expect(formatNumberWith(1234567.89, { thousandsSeparator: 'comma', decimalSeparator: 'period' }, { minimumFractionDigits: 2 })).toBe('1,234,567.89');
    expect(plain(formatNumber(1000))).toBe('1 000');
  });
});

describe('Identifiants jamais formatés', () => {
  it('les références restent des chaînes intactes (le formateur ne s’applique qu’aux nombres)', () => {
    for (const reference of ['TON-004', 'T-001', 'EXP-20260924-12337', '3fa85f64-5717-4562-b3fc-2c963f66afa6']) expect(`${reference}`).toBe(reference);
  });
});

/**
 * SAISIE DES MONTANTS (mandat « Formatage des montants », 2026-09-27) : même format que
 * l'affichage, valeur canonique « 2000000.50 » pour le formulaire.
 */
describe('Saisie des montants — formatAmountInput / amountInputToCanonical / canonicalToAmountText / parsePastedAmount', () => {
  const SPACE_COMMA = { thousandsSeparator: 'space', decimalSeparator: 'comma' } as const;
  const COMMA_PERIOD = { thousandsSeparator: 'comma', decimalSeparator: 'period' } as const;
  const PERIOD_COMMA = { thousandsSeparator: 'period', decimalSeparator: 'comma' } as const;

  it.each([
    ['50000', '50 000', '50000'],
    ['2000000', '2 000 000', '2000000'],
    ['3000000', '3 000 000', '3000000'],
    ['2000000,50', '2 000 000,50', '2000000.50'],
    ['2000000,', '2 000 000,', '2000000'],
    ['0', '0', '0'],
    ['', '', ''],
  ])('espace / virgule : saisie « %s » → affichage « %s », valeur « %s »', (typed, shown, canonical) => {
    const text = formatAmountInput(typed, SPACE_COMMA);
    expect(plain(text)).toBe(shown);
    expect(amountInputToCanonical(text, SPACE_COMMA)).toBe(canonical);
  });

  it.each([
    ['50000', '50,000', '50000'],
    ['2000000', '2,000,000', '2000000'],
    ['3000000', '3,000,000', '3000000'],
    ['2000000.50', '2,000,000.50', '2000000.50'],
  ])('virgule / point : saisie « %s » → affichage « %s », valeur « %s »', (typed, shown, canonical) => {
    const text = formatAmountInput(typed, COMMA_PERIOD);
    expect(text).toBe(shown);
    expect(amountInputToCanonical(text, COMMA_PERIOD)).toBe(canonical);
  });

  it('point / virgule : « 2000000,50 » → « 2.000.000,50 »', () => {
    const text = formatAmountInput('2000000,50', PERIOD_COMMA);
    expect(text).toBe('2.000.000,50');
    expect(amountInputToCanonical(text, PERIOD_COMMA)).toBe('2000000.50');
  });

  it('jamais de double séparateur ni de valeur invalide : 2e décimale ignorée, décimales bornées, zéros de tête retirés, lettres ignorées', () => {
    expect(plain(formatAmountInput('2000000,5,5', SPACE_COMMA))).toBe('2 000 000,55');
    expect(plain(formatAmountInput('1,2345', SPACE_COMMA))).toBe('1,23');
    expect(plain(formatAmountInput('000123', SPACE_COMMA))).toBe('123');
    expect(plain(formatAmountInput('12a3 FCFA', SPACE_COMMA))).toBe('123');
    expect(formatAmountInput(',5', SPACE_COMMA)).toBe('0,5');
    expect(plain(formatAmountInput('1500,75', SPACE_COMMA, 0))).toBe('150 075'); // devise sans décimale autorisée : séparateur ignoré
  });

  it('modification d’une valeur déjà formatée / suppression d’un séparateur : les chiffres sont regroupés à nouveau', () => {
    expect(plain(formatAmountInput('2 000 0000', SPACE_COMMA))).toBe('20 000 000');
    expect(plain(formatAmountInput('2 00000', SPACE_COMMA))).toBe('200 000');
    expect(formatAmountInput('2,000,0000', COMMA_PERIOD)).toBe('20,000,000');
  });

  it('valeur canonique → affichage hors saisie : décimales de la devise (XAF 0, EUR 2), comme formatCurrency', () => {
    expect(plain(canonicalToAmountText('50000', SPACE_COMMA, 0))).toBe('50 000');
    expect(plain(canonicalToAmountText('50000', SPACE_COMMA, 2))).toBe('50 000,00');
    expect(canonicalToAmountText('3000000', COMMA_PERIOD, 2)).toBe('3,000,000.00');
    expect(plain(canonicalToAmountText('2000000.5', SPACE_COMMA, 0))).toBe('2 000 000,5');
    expect(canonicalToAmountText('', SPACE_COMMA, 2)).toBe('');
    expect(canonicalToAmountText('0', SPACE_COMMA, 0)).toBe('0');
    expect(plain(canonicalToAmountText('123456789012', SPACE_COMMA, 0))).toBe('123 456 789 012');
  });

  it('format actif de l’association utilisé par défaut (changement de séparateur)', () => {
    setActiveRegionalFormat(COMMA_PERIOD);
    expect(formatAmountInput('2000000.50')).toBe('2,000,000.50');
    expect(amountInputToCanonical('2,000,000.50')).toBe('2000000.50');
    setActiveRegionalFormat(SPACE_COMMA);
    expect(plain(formatAmountInput('2000000,50'))).toBe('2 000 000,50');
  });

  it.each([
    ['2 000 000,50', SPACE_COMMA, '2000000.50'],
    ['2,000,000.50', SPACE_COMMA, '2000000.50'],
    ['2000000.50', SPACE_COMMA, '2000000.50'],
    ['1.234,5', SPACE_COMMA, '1234.5'],
    ['2,000,000', SPACE_COMMA, '2000000'],
    ['2,000,000.50', COMMA_PERIOD, '2000000.50'],
    ['2.000.000,50', PERIOD_COMMA, '2000000.50'],
    ['2.000.000', PERIOD_COMMA, '2000000'],
    ['50 000 FCFA', SPACE_COMMA, '50000'],
    ['abc', SPACE_COMMA, null],
  ] as const)('collage « %s » → « %s »', (pasted, format, canonical) => {
    expect(parsePastedAmount(pasted, format)).toBe(canonical);
  });

  it('un « - » en tête est conservé (jamais converti en positif) : la validation « strictement positif » reste celle du formulaire', () => {
    expect(plain(formatAmountInput('-2000000', SPACE_COMMA))).toBe('-2 000 000');
    expect(amountInputToCanonical(formatAmountInput('-500', SPACE_COMMA), SPACE_COMMA)).toBe('-500');
    expect(Number(amountInputToCanonical(formatAmountInput('-500', SPACE_COMMA), SPACE_COMMA))).toBe(-500);
    expect(formatAmountInput('-', SPACE_COMMA)).toBe('-');
    expect(amountInputToCanonical('-', SPACE_COMMA)).toBe('');
    expect(formatAmountInput('5-00', SPACE_COMMA)).toBe('500'); // « - » au milieu : ignoré
    expect(parsePastedAmount('-1 500', SPACE_COMMA)).toBe('-1500');
  });

  it('la valeur canonique reste un nombre propre pour les calculs et validations (Number)', () => {
    const canonical = amountInputToCanonical(formatAmountInput('2000000,50', SPACE_COMMA), SPACE_COMMA);
    expect(Number(canonical)).toBe(2_000_000.5);
    expect(Number(amountInputToCanonical(formatAmountInput('50000', SPACE_COMMA), SPACE_COMMA)) <= Number(canonical)).toBe(true);
  });
});
