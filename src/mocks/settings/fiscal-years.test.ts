import { describe, it, expect } from 'vitest';
import { suggestNextFiscalYear, type FiscalYear } from './fiscal-years';

function makeYear(overrides: Partial<FiscalYear>): FiscalYear {
  return { id: 'FY-X', tenantId: 'T-X', label: 'Exercice', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', closedAt: null, closedBy: null, ...overrides };
}

describe('suggestNextFiscalYear', () => {
  it('sans aucun exercice existant, ne propose rien (pas de convention inventée)', () => {
    expect(suggestNextFiscalYear([])).toEqual({ label: '', startDate: '', endDate: '' });
  });

  it('exercice calendaire (01/01 → 31/12) : propose l’année civile suivante', () => {
    const years = [makeYear({ label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31' })];
    expect(suggestNextFiscalYear(years)).toEqual({ label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31' });
  });

  it('exercice juillet → juin : propose le même cycle décalé d’un an, avec un libellé sur deux années', () => {
    const years = [makeYear({ label: 'Exercice 2025–2026', startDate: '2025-07-01', endDate: '2026-06-30' })];
    expect(suggestNextFiscalYear(years)).toEqual({ label: 'Exercice 2026–2027', startDate: '2026-07-01', endDate: '2027-06-30' });
  });

  it('utilise le dernier exercice par date de fin, pas le premier du tableau ni celui marqué isCurrent', () => {
    const years = [
      makeYear({ label: 'Exercice 2024', startDate: '2024-01-01', endDate: '2024-12-31', status: 'closed', isCurrent: false }),
      makeYear({ label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false }),
      makeYear({ label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true }),
    ];
    expect(suggestNextFiscalYear(years)).toEqual({ label: 'Exercice 2028', startDate: '2028-01-01', endDate: '2028-12-31' });
  });

  it('exercice prorogé (endDate réelle postérieure à la durée théorique) : part de la date de fin réellement enregistrée', () => {
    // Exercice théoriquement 01/01 → 31/12/2026, mais prorogé jusqu’au 31/03/2027 (endDate reflète la prorogation).
    const years = [makeYear({ label: 'Exercice 2026 (prorogé)', startDate: '2026-01-01', endDate: '2027-03-31' })];
    expect(suggestNextFiscalYear(years)).toEqual({ label: 'Exercice 2027–2028', startDate: '2027-04-01', endDate: '2028-03-31' });
  });
});
