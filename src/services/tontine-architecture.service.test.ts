import { describe, it, expect } from 'vitest';
import { tontinesService } from './tontines.service';
import { tontineTurnsService } from './tontine-turns.service';

/**
 * Mandat « SUPPRESSION COMPLÈTE DE LA LOGIQUE CYCLE/TOUR DU MODULE TONTINE »
 * §22, points 1 à 9 — vérifie explicitement les propriétés structurelles
 * attendues de l'architecture cible Tontine → Fréquence → Période →
 * Occurrence → Opérations/Contributions/Bénéficiaire. Ne re-décrit pas ce que
 * `tontines.service.test.ts`/`tontine-turns.service.test.ts` couvrent déjà en
 * détail : ce fichier assemble les points de contrôle exacts du mandat en un
 * seul endroit, comme preuve de conformité explicite. Volontairement
 * séparé de la vérification UI (`tontine-architecture-navigation.test.tsx`) :
 * mélanger de nombreux appels de service asynchrones avec des rendus React
 * dans le même fichier fait s'accumuler du travail React Query en arrière-
 * plan et peut faire échouer par timeout un rendu ultérieur sans rapport
 * (observé pendant ce mandat), au lieu d'indiquer une vraie régression —
 * même séparation que le reste du module (fichiers `*.service.test.ts` vs
 * fichiers de rendu).
 */
async function buildFixture(suffix: string) {
  const tontine = (await tontinesService.createTontine({ name: `Architecture ${suffix}`, valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
  const period = (await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-06-01', endDate: '2026-06-30' }))!;
  const occurrence = (await tontineTurnsService.createOccurrence('T-002', { periodId: period.id, occurrenceNumber: 1, plannedDate: '2026-06-05' }))!;
  const adhesion = (await tontineTurnsService.createAdhesion('T-002', { periodId: period.id, memberId: `M-ARCH-${suffix}`, memberName: `Membre Archi ${suffix}`, joinedAt: '2026-06-01' }))!;
  return { tontine, period, occurrence, adhesion };
}

describe('§22.1-2 — Tontine porte une Fréquence et des Périodes', () => {
  it('1) une Tontine créée avec une fréquence la conserve directement sur l’entité (pas de niveau Cycle intermédiaire)', async () => {
    const { tontine } = await buildFixture('freq');
    expect(tontine.frequency).toBe('MONTHLY');
  });

  it('2) une Tontine a des Périodes, listées directement via listPeriodsByTontine (jamais via un Cycle parent)', async () => {
    const { tontine, period } = await buildFixture('periods');
    const periods = await tontineTurnsService.listPeriodsByTontine('T-002', tontine.id);
    expect(periods.some((item) => item.id === period.id)).toBe(true);
    expect(periods.every((item) => item.tontineId === tontine.id)).toBe(true);
  });
});

describe('§22.3-5 — Période a des Occurrences, chacune directement accessible avec ses propres opérations', () => {
  it('3) une Période a des Occurrences, listées via listOccurrencesByPeriod', async () => {
    const { period, occurrence } = await buildFixture('occ');
    const occurrences = await tontineTurnsService.listOccurrencesByPeriod('T-002', period.id);
    expect(occurrences.map((item) => item.id)).toEqual([occurrence.id]);
  });

  it('4) une Occurrence est directement accessible par son id (getOccurrence), sans passer par un Turn/Cycle intermédiaire', async () => {
    const { occurrence } = await buildFixture('direct');
    const fetched = await tontineTurnsService.getOccurrence('T-002', occurrence.id);
    expect(fetched?.id).toBe(occurrence.id);
  });

  it('5) une Occurrence a ses propres opérations (bénéficiaires + réceptions) accessibles via son propre id, jamais via un id de Turn', async () => {
    const { occurrence, adhesion } = await buildFixture('ops');
    const added = (await tontineTurnsService.addBeneficiaries('T-002', occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 100_000 }))!;
    const beneficiaries = await tontineTurnsService.listBeneficiariesByOccurrence('T-002', occurrence.id);
    expect(beneficiaries.map((item) => item.id)).toEqual([added.created[0].id]);
    expect(beneficiaries[0].tontineOccurrenceId).toBe(occurrence.id);
  });
});

describe('§22.6-7 — Contributions et Membres référencent occurrenceId/memberId directement', () => {
  it('6) une Contribution référence tontineOccurrenceId directement (jamais un turnId)', async () => {
    const { occurrence, adhesion } = await buildFixture('ctb');
    const contribution = await tontineTurnsService.createContribution('T-002', { adhesionId: adhesion.id, tontineOccurrenceId: occurrence.id, valueType: 'MONEY', expectedAmount: 10_000 });
    expect(contribution?.tontineOccurrenceId).toBe(occurrence.id);
    expect(contribution && 'turnId' in contribution).toBe(false);
  });

  it('7) une Adhésion référence memberId directement (le Membre n’est jamais conflaté avec l’Adhésion)', async () => {
    const { adhesion } = await buildFixture('mbr');
    expect(adhesion.memberId).toBe('M-ARCH-mbr');
    expect(adhesion.id).not.toBe(adhesion.memberId);
  });
});

describe('§22.8 — Le Bénéficiaire est rattaché directement à l’Occurrence', () => {
  it('8) OccurrenceBeneficiary.tontineOccurrenceId pointe directement vers l’Occurrence, sans niveau Turn intermédiaire', async () => {
    const { occurrence, adhesion } = await buildFixture('benef');
    const result = (await tontineTurnsService.addBeneficiaries('T-002', occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 50_000 }))!;
    const beneficiary = result.created[0];
    expect(beneficiary.tontineOccurrenceId).toBe(occurrence.id);
    expect('tontineTurnId' in beneficiary).toBe(false);
  });
});

describe('§22.9 — La clôture utilise closeOccurrence directement', () => {
  it('9) closeOccurrence clôture l’Occurrence en un seul appel, sans closeTurn intermédiaire (fonction inexistante)', async () => {
    const { occurrence, adhesion } = await buildFixture('close');
    const result = (await tontineTurnsService.addBeneficiaries('T-002', occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 10_000 }))!;
    await tontineTurnsService.recordReception('T-002', result.created[0].id, { amount: 10_000 });
    const closed = await tontineTurnsService.closeOccurrence('T-002', occurrence.id);
    expect(closed?.status).toBe('CLOSED');
    expect('closeTurn' in tontineTurnsService).toBe(false);
  });
});
