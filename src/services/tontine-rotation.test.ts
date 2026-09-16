import { describe, it, expect } from 'vitest';
import { tontineTurnsService } from './tontine-turns.service';
import { tontinesService } from './tontines.service';

/**
 * Mandat « Finalisation Finance/Tontines » — ordre automatique de passage des
 * bénéficiaires (`suggestNextBeneficiary`/`listRotationOrder`). Chaque test
 * construit sa propre Tontine/Période/Adhésions/Occurrences via les fonctions
 * de service réelles (même convention que `tontine-turns.service.test.ts`) —
 * aucune dépendance au jeu de seed partagé.
 */
const TENANT = 'T-002';

async function makeTontine() {
  return (await tontinesService.createTontine({
    tenantId: TENANT, name: `Rotation ${Date.now()}-${Math.random()}`, valueType: 'MONEY', currency: 'XOF',
    purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000,
  }))!;
}

async function makePeriod(tontineId: string) {
  return (await tontineTurnsService.createPeriod(TENANT, { tontineId, startDate: '2026-01-01', endDate: '2026-12-31' }))!;
}

async function makeAdhesion(periodId: string, memberId: string, memberName: string, joinedAt: string) {
  return (await tontineTurnsService.createAdhesion(TENANT, { periodId, memberId, memberName, joinedAt }))!;
}

async function makeOccurrence(periodId: string, occurrenceNumber: number, plannedDate: string) {
  return (await tontineTurnsService.createOccurrence(TENANT, { periodId, occurrenceNumber, plannedDate }))!;
}

describe('tontineTurnsService — suggestNextBeneficiary (ordre d’adhésion, rotation ROSCA)', () => {
  it('2 adhérents : propose le plus ancien en premier, puis le second à l’occurrence suivante', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const adhA = await makeAdhesion(period.id, 'MBR-A', 'Membre A', '2026-01-01');
    const adhB = await makeAdhesion(period.id, 'MBR-B', 'Membre B', '2026-01-05');
    const occ1 = await makeOccurrence(period.id, 1, '2026-02-01');
    const occ2 = await makeOccurrence(period.id, 2, '2026-03-01');

    const first = await tontineTurnsService.suggestNextBeneficiary(TENANT, occ1.id);
    expect(first).toEqual({ adhesionId: adhA.id, memberName: 'Membre A', cycleComplete: false });

    await tontineTurnsService.addBeneficiaries(TENANT, occ1.id, { adhesionIds: [adhA.id], valueType: 'MONEY', expectedAmount: 100_000 });

    const second = await tontineTurnsService.suggestNextBeneficiary(TENANT, occ2.id);
    expect(second).toEqual({ adhesionId: adhB.id, memberName: 'Membre B', cycleComplete: false });
  });

  it('3 adhérents : ordre strictement déterminé par joinedAt croissant', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const adhC = await makeAdhesion(period.id, 'MBR-C1', 'Troisième', '2026-01-10');
    const adhA = await makeAdhesion(period.id, 'MBR-C2', 'Premier', '2026-01-01');
    const adhB = await makeAdhesion(period.id, 'MBR-C3', 'Deuxième', '2026-01-05');
    const occ1 = await makeOccurrence(period.id, 1, '2026-02-01');

    const suggestion = await tontineTurnsService.suggestNextBeneficiary(TENANT, occ1.id);
    expect(suggestion).toEqual({ adhesionId: adhA.id, memberName: 'Premier', cycleComplete: false });
    expect(adhB.id).not.toBe(adhC.id); // sanity : 3 adhésions bien distinctes
  });

  it('4 adhérents : le tour complet sert chacun exactement une fois, dans l’ordre d’adhésion', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const adhesions = [];
    for (let i = 0; i < 4; i += 1) {
      adhesions.push(await makeAdhesion(period.id, `MBR-4-${i}`, `Membre ${i}`, `2026-01-0${i + 1}`));
    }
    const served: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const occurrence = await makeOccurrence(period.id, i + 1, `2026-0${2 + i}-01`);
      const suggestion = await tontineTurnsService.suggestNextBeneficiary(TENANT, occurrence.id);
      expect(suggestion && 'cycleComplete' in suggestion && suggestion.cycleComplete).toBe(false);
      const adhesionId = (suggestion as { adhesionId: string }).adhesionId;
      served.push(adhesionId);
      await tontineTurnsService.addBeneficiaries(TENANT, occurrence.id, { adhesionIds: [adhesionId], valueType: 'MONEY', expectedAmount: 50_000 });
    }
    expect(served).toEqual(adhesions.map((item) => item.id));
  });

  it('10 adhérents : aucun doublon sur les 10 occurrences du tour complet', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    for (let i = 0; i < 10; i += 1) {
      await makeAdhesion(period.id, `MBR-10-${i}`, `Membre ${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`);
    }
    const served = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const occurrence = await makeOccurrence(period.id, i + 1, `2026-${String(2 + i).padStart(2, '0')}-01`);
      const suggestion = await tontineTurnsService.suggestNextBeneficiary(TENANT, occurrence.id);
      const adhesionId = (suggestion as { adhesionId: string }).adhesionId;
      expect(served.has(adhesionId)).toBe(false);
      served.add(adhesionId);
      await tontineTurnsService.addBeneficiaries(TENANT, occurrence.id, { adhesionIds: [adhesionId], valueType: 'MONEY', expectedAmount: 20_000 });
    }
    expect(served.size).toBe(10);
  });

  it('nouvel adhérent arrivé en cours de période : entre dans le pool dès que son adhésion est active', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const adhA = await makeAdhesion(period.id, 'MBR-N1', 'Ancien', '2026-01-01');
    const occ1 = await makeOccurrence(period.id, 1, '2026-02-01');
    await tontineTurnsService.addBeneficiaries(TENANT, occ1.id, { adhesionIds: [adhA.id], valueType: 'MONEY', expectedAmount: 50_000 });

    // Personne d'autre n'est encore éligible : le tour est déclaré terminé.
    const occ2 = await makeOccurrence(period.id, 2, '2026-03-01');
    expect(await tontineTurnsService.suggestNextBeneficiary(TENANT, occ2.id)).toEqual({ cycleComplete: true });

    // Un nouvel adhérent rejoint avant la 3e occurrence.
    const adhNew = await makeAdhesion(period.id, 'MBR-N2', 'Nouveau', '2026-02-15');
    const occ3 = await makeOccurrence(period.id, 3, '2026-04-01');
    expect(await tontineTurnsService.suggestNextBeneficiary(TENANT, occ3.id)).toEqual({ adhesionId: adhNew.id, memberName: 'Nouveau', cycleComplete: false });
  });

  it('adhérent suspendu (adhésion clôturée avant la date de référence) : exclu du calcul', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const adhSuspended = await makeAdhesion(period.id, 'MBR-S1', 'Suspendu', '2026-01-01');
    const adhOther = await makeAdhesion(period.id, 'MBR-S2', 'Actif', '2026-01-05');
    await tontineTurnsService.closeAdhesion(TENANT, adhSuspended.id, '2026-01-20');

    const occurrence = await makeOccurrence(period.id, 1, '2026-02-01');
    const suggestion = await tontineTurnsService.suggestNextBeneficiary(TENANT, occurrence.id);
    expect(suggestion).toEqual({ adhesionId: adhOther.id, memberName: 'Actif', cycleComplete: false });
  });

  it('occurrence déjà pourvue d’un bénéficiaire : celui-ci n’est plus jamais reproposé', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const adhA = await makeAdhesion(period.id, 'MBR-D1', 'A', '2026-01-01');
    const adhB = await makeAdhesion(period.id, 'MBR-D2', 'B', '2026-01-02');
    const occ1 = await makeOccurrence(period.id, 1, '2026-02-01');
    await tontineTurnsService.addBeneficiaries(TENANT, occ1.id, { adhesionIds: [adhA.id], valueType: 'MONEY', expectedAmount: 50_000 });
    await tontineTurnsService.recordReception(TENANT, (await tontineTurnsService.listBeneficiariesByOccurrence(TENANT, occ1.id))[0].id, { amount: 50_000 });
    await tontineTurnsService.closeOccurrence(TENANT, occ1.id);

    const occ2 = await makeOccurrence(period.id, 2, '2026-03-01');
    // Même en interrogeant plusieurs fois, A (déjà servi et l'occurrence est close) ne revient jamais.
    expect(await tontineTurnsService.suggestNextBeneficiary(TENANT, occ2.id)).toEqual({ adhesionId: adhB.id, memberName: 'B', cycleComplete: false });
  });

  it('cycle terminé : cycleComplete une fois tous les adhérents servis, un NOUVEAU cycle (nouvelle Période) réinitialise le pool', async () => {
    const tontine = await makeTontine();
    const period1 = await makePeriod(tontine.id);
    const adh1 = await makeAdhesion(period1.id, 'MBR-CY1', 'Seul', '2026-01-01');
    const occ1 = await makeOccurrence(period1.id, 1, '2026-02-01');
    await tontineTurnsService.addBeneficiaries(TENANT, occ1.id, { adhesionIds: [adh1.id], valueType: 'MONEY', expectedAmount: 50_000 });

    const occ2 = await makeOccurrence(period1.id, 2, '2026-03-01');
    expect(await tontineTurnsService.suggestNextBeneficiary(TENANT, occ2.id)).toEqual({ cycleComplete: true });

    // Nouveau cycle = nouvelle Période (mécanisme déjà existant, jamais une boucle automatique).
    const period2 = (await tontineTurnsService.createPeriod(TENANT, { tontineId: tontine.id, startDate: '2027-01-01', endDate: '2027-12-31' }))!;
    const adh2 = await makeAdhesion(period2.id, 'MBR-CY1', 'Seul', '2027-01-01');
    const occNew = await makeOccurrence(period2.id, 1, '2027-02-01');
    expect(await tontineTurnsService.suggestNextBeneficiary(TENANT, occNew.id)).toEqual({ adhesionId: adh2.id, memberName: 'Seul', cycleComplete: false });
  });

  it('DENY : occurrence ou tenant introuvable → null (mockRequest)', async () => {
    expect(await tontineTurnsService.suggestNextBeneficiary(TENANT, 'OCC-DOES-NOT-EXIST')).toBeNull();
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const occurrence = await makeOccurrence(period.id, 1, '2026-02-01');
    expect(await tontineTurnsService.suggestNextBeneficiary('T-999', occurrence.id)).toBeNull();
  });
});

describe('tontineTurnsService — listRotationOrder', () => {
  it('retourne les adhésions dans l’ordre de rotation avec le numéro d’occurrence les ayant servies', async () => {
    const tontine = await makeTontine();
    const period = await makePeriod(tontine.id);
    const adhA = await makeAdhesion(period.id, 'MBR-R1', 'A', '2026-01-01');
    const adhB = await makeAdhesion(period.id, 'MBR-R2', 'B', '2026-01-05');
    const occ1 = await makeOccurrence(period.id, 1, '2026-02-01');
    await tontineTurnsService.addBeneficiaries(TENANT, occ1.id, { adhesionIds: [adhA.id], valueType: 'MONEY', expectedAmount: 50_000 });

    const order = await tontineTurnsService.listRotationOrder(TENANT, period.id);
    expect(order).toEqual([
      { adhesionId: adhA.id, memberName: 'A', joinedAt: '2026-01-01', active: true, servedOccurrenceNumber: 1 },
      { adhesionId: adhB.id, memberName: 'B', joinedAt: '2026-01-05', active: true, servedOccurrenceNumber: null },
    ]);
  });

  it('isolation tenant : une période d’un autre tenant renvoie une liste vide', async () => {
    expect(await tontineTurnsService.listRotationOrder('T-999', 'PER-DOES-NOT-EXIST')).toEqual([]);
  });
});
