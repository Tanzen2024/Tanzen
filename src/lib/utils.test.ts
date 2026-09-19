import { describe, it, expect } from 'vitest';
import { formatTourDate } from './utils';

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
