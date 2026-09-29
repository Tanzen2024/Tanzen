import { describe, it, expect } from 'vitest';
import { planLoanFunding, splitByAllocations, unfundableAmount } from './loan-funding';

/** Financement multi-caisses d'un prêt — calcul pur (mandat du 2026-09-26). */
describe('planLoanFunding — caisse courante prioritaire, reliquat par les compléments', () => {
  it('CAS 1 — courante 200 000, prêt 150 000 : financement intégral par la courante, allocation unique, aucun reliquat', () => {
    const plan = planLoanFunding(150_000, 'EPG', [], { EPG: 200_000, INS: 200_000 });
    expect(plan).toMatchObject({ currentAmount: 150_000, remainingAfterCurrent: 0, allocatedTotal: 150_000, remaining: 0, isComplete: true });
    expect(plan.allocations).toEqual([{ cashboxId: 'EPG', amount: 150_000 }]);
  });

  it('CAS 2 — courante 110 000, prêt 150 000 : 110 000 pris automatiquement, reliquat 40 000, prêt non finançable en l’état', () => {
    const plan = planLoanFunding(150_000, 'EPG', [], { EPG: 110_000, INS: 200_000 });
    expect(plan).toMatchObject({ currentAvailable: 110_000, currentAmount: 110_000, remainingAfterCurrent: 40_000, remaining: 40_000, isComplete: false });
    expect(plan.issues).toContain('shortfall');
  });

  it('CAS 3 — courante 110 000 + complément 40 000 sur une autre caisse : total 150 000, prêt validable', () => {
    const plan = planLoanFunding(150_000, 'EPG', [{ cashboxId: 'INS', amount: 40_000 }], { EPG: 110_000, INS: 50_000 });
    expect(plan.allocations).toEqual([{ cashboxId: 'EPG', amount: 110_000 }, { cashboxId: 'INS', amount: 40_000 }]);
    expect(plan).toMatchObject({ allocatedTotal: 150_000, remaining: 0, isComplete: true });
  });

  it('CAS 4 — courante 100 000, B 120 000, C 50 000, D pour le solde : plusieurs caisses, total = 300 000, aucune allocation excessive', () => {
    const plan = planLoanFunding(300_000, 'A', [{ cashboxId: 'B', amount: 120_000 }, { cashboxId: 'C', amount: 50_000 }, { cashboxId: 'D', amount: 30_000 }], { A: 100_000, B: 120_000, C: 50_000, D: 80_000 });
    expect(plan.allocations.map((allocation) => allocation.amount)).toEqual([100_000, 120_000, 50_000, 30_000]);
    expect(plan).toMatchObject({ allocatedTotal: 300_000, isComplete: true });
  });

  it('CAS 5 — toutes les caisses réunies ne suffisent pas : non finançable, montant manquant connu', () => {
    const plan = planLoanFunding(150_000, 'EPG', [{ cashboxId: 'INS', amount: 20_000 }], { EPG: 110_000, INS: 20_000 });
    expect(plan).toMatchObject({ remaining: 20_000, isComplete: false });
    expect(unfundableAmount(plan.remainingAfterCurrent, [20_000])).toBe(20_000);
  });

  it('CAS 6 — Σ allocations ne peut jamais dépasser le capital (110 000 + 50 000 pour 150 000 → refusé)', () => {
    const plan = planLoanFunding(150_000, 'EPG', [{ cashboxId: 'INS', amount: 50_000 }], { EPG: 110_000, INS: 200_000 });
    expect(plan.issues).toContain('exceedsPrincipal');
    expect(plan.isComplete).toBe(false);
  });

  it('un complément ne dépasse jamais le disponible de sa caisse, ni ne réutilise la caisse courante ou une caisse déjà listée', () => {
    expect(planLoanFunding(150_000, 'EPG', [{ cashboxId: 'INS', amount: 40_000 }], { EPG: 110_000, INS: 30_000 }).issues).toContain('complementExceedsAvailable');
    expect(planLoanFunding(150_000, 'EPG', [{ cashboxId: 'EPG', amount: 40_000 }], { EPG: 110_000 }).issues).toContain('complementIsCurrent');
    expect(planLoanFunding(150_000, 'EPG', [{ cashboxId: 'INS', amount: 20_000 }, { cashboxId: 'INS', amount: 20_000 }], { EPG: 110_000, INS: 100_000 }).issues).toContain('duplicateComplement');
  });

  it('caisse courante vide (ou débitrice) : elle ne finance rien, tout vient des compléments', () => {
    const plan = planLoanFunding(100_000, 'EPG', [{ cashboxId: 'INS', amount: 100_000 }], { EPG: -5_000, INS: 100_000 });
    expect(plan).toMatchObject({ currentAvailable: 0, currentAmount: 0, isComplete: true });
    expect(plan.allocations).toEqual([{ cashboxId: 'INS', amount: 100_000 }]);
  });

  it('un complément inutile (courante suffisante) est refusé : jamais de financement au-delà du besoin', () => {
    expect(planLoanFunding(100_000, 'EPG', [{ cashboxId: 'INS', amount: 10_000 }], { EPG: 200_000, INS: 50_000 }).isComplete).toBe(false);
  });
});

describe('splitByAllocations — remboursement au prorata du financement', () => {
  it('11 000 sur (110 000 ; 40 000) → (8 067 ; 2 933), somme exacte', () => {
    expect(splitByAllocations(11_000, [{ cashboxId: 'EPG', amount: 110_000 }, { cashboxId: 'INS', amount: 40_000 }])).toEqual([{ cashboxId: 'EPG', amount: 8_067 }, { cashboxId: 'INS', amount: 2_933 }]);
  });

  it('la somme des parts est toujours exactement le montant, quel que soit l’arrondi', () => {
    for (const amount of [1, 7, 99, 10_001, 158_667]) {
      const parts = splitByAllocations(amount, [{ cashboxId: 'A', amount: 100_000 }, { cashboxId: 'B', amount: 120_000 }, { cashboxId: 'C', amount: 50_000 }]);
      expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBe(amount);
    }
  });

  it('une seule allocation → tout le montant pour elle', () => {
    expect(splitByAllocations(50_000, [{ cashboxId: 'TRES', amount: 400_000 }])).toEqual([{ cashboxId: 'TRES', amount: 50_000 }]);
  });
});
