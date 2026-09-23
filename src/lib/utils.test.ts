import { describe, it, expect } from 'vitest';
import { formatDate, formatTourDate } from './utils';

describe('formatTourDate — format d\'affichage JJ/MM/AAAA des dates de Tour (mandat « format d\'affichage des dates »)', () => {
  it('"2026-09-09" → "09/09/2026"', () => {
    expect(formatTourDate('2026-09-09')).toBe('09/09/2026');
  });

  it('"2026-12-31" → "31/12/2026"', () => {
    expect(formatTourDate('2026-12-31')).toBe('31/12/2026');
  });

  it('"2027-01-01" → "01/01/2027"', () => {
    expect(formatTourDate('2027-01-01')).toBe('01/01/2027');
  });

  it('la chaîne source (format de stockage YYYY-MM-DD) n\'est jamais modifiée par le formatter', () => {
    const stored = '2026-09-16';
    formatTourDate(stored);
    expect(stored).toBe('2026-09-16');
  });

  it('accepte un horodatage complet (YYYY-MM-DDTHH:mm:ss) et n\'utilise que la partie date, sans décalage de fuseau', () => {
    expect(formatTourDate('2026-09-09T00:00:00.000Z')).toBe('09/09/2026');
  });
});

describe('formatDate — formatter de date GLOBAL de l\'application (mandat « normalisation de l\'affichage des dates »)', () => {
  it('"2026-01-01" → "01/01/2026"', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
  });

  it('"2026-02-05" → "05/02/2026"', () => {
    expect(formatDate('2026-02-05')).toBe('05/02/2026');
  });

  it('"2026-09-19" → "19/09/2026"', () => {
    expect(formatDate('2026-09-19')).toBe('19/09/2026');
  });

  it('"2026-12-31" → "31/12/2026"', () => {
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });

  it('toujours deux chiffres pour le jour et le mois, jamais "1/1/2026"', () => {
    expect(formatDate('2026-01-09')).toBe('09/01/2026');
    expect(formatDate('2026-01-09')).not.toBe('9/1/2026');
  });

  it('null → placeholder "—", jamais "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('undefined → placeholder "—"', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('chaîne vide → placeholder "—"', () => {
    expect(formatDate('')).toBe('—');
  });

  it('date invalide → placeholder "—", jamais "Invalid Date"', () => {
    expect(formatDate('ceci-nest-pas-une-date')).toBe('—');
    expect(formatDate('not a date')).not.toContain('Invalid');
  });

  it('accepte un objet Date natif et respecte le fuseau LOCAL (jour/mois/année de la machine)', () => {
    const date = new Date(2026, 8, 19); // 19 septembre 2026, construit en heure locale — jamais d'ambiguïté UTC
    expect(formatDate(date)).toBe('19/09/2026');
  });

  it('aucun décalage de jour pour une date métier "YYYY-MM-DD" (jamais 18/09 pour 2026-09-19)', () => {
    expect(formatDate('2026-09-19')).toBe('19/09/2026');
    expect(formatDate('2026-09-19')).not.toBe('18/09/2026');
  });

  it('ne modifie jamais la chaîne source (format de stockage préservé)', () => {
    const stored = '2026-09-16';
    formatDate(stored);
    expect(stored).toBe('2026-09-16');
  });

  it('withTime=true sur une date métier sans heure ajoute "00:00" sans introduire de décalage', () => {
    expect(formatDate('2026-09-19', true)).toBe('19/09/2026 00:00');
  });

  it('withTime=true sur un horodatage complet ajoute l\'heure LOCALE réelle sans supprimer l\'information temporelle', () => {
    const timestamp = new Date(2026, 8, 19, 14, 30);
    expect(formatDate(timestamp, true)).toBe('19/09/2026 14:30');
  });

  it('withTime=false (par défaut) sur un horodatage complet n\'affiche que la date, jamais l\'heure', () => {
    const timestamp = new Date(2026, 8, 19, 14, 30);
    expect(formatDate(timestamp, false)).toBe('19/09/2026');
  });
});
