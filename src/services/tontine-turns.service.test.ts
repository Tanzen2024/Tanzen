import { describe, it, expect } from 'vitest';
import { tontineTurnsService } from './tontine-turns.service';
import { tontinesService } from './tontines.service';
import { organizationService } from './organization.service';
import { workflowService } from './workflow.service';

/**
 * Vues agrégées transverses (mandat vue d'ensemble Tontines — Membres/Contributions/Opérations
 * toutes tontines confondues). Bug réel trouvé et corrigé pendant l'implémentation : les
 * mutations existantes (createAdhesion, createContribution, createOccurrence, etc.) n'invalidaient
 * que leurs clés React Query tontine/période-scopées, jamais ces nouvelles clés agrégées — la
 * vue d'ensemble restait donc silencieusement obsolète après toute création, jusqu'au prochain
 * rechargement complet. Corrigé en ajoutant ces clés aux `invalidateKeys` concernés dans
 * periods-module.tsx/adhesions-module.tsx/occurrences-module.tsx/contributions-module.tsx.
 * Ces tests couvrent la correction au niveau service (isolation tenant) ; la non-régression du
 * rafraîchissement UI est vérifiée en navigateur (Playwright), hors de portée d'un test service pur.
 */
describe('tontineTurnsService — vues agrégées (listAllX), isolation tenant', () => {
  it('listAllPeriods ne retourne que les périodes du tenant demandé', async () => {
    const periods = await tontineTurnsService.listAllPeriods('T-002');
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.every((item) => item.tenantId === 'T-002')).toBe(true);
  });

  it('listAllAdhesions ne retourne que les adhésions du tenant demandé', async () => {
    const adhesions = await tontineTurnsService.listAllAdhesions('T-002');
    expect(adhesions.length).toBeGreaterThan(0);
    expect(adhesions.every((item) => item.tenantId === 'T-002')).toBe(true);
    const otherTenant = await tontineTurnsService.listAllAdhesions('T-999');
    expect(otherTenant).toEqual([]);
  });

  it('listAllContributions ne retourne que les contributions du tenant demandé', async () => {
    const contributions = await tontineTurnsService.listAllContributions('T-002');
    expect(contributions.length).toBeGreaterThan(0);
    expect(contributions.every((item) => item.tenantId === 'T-002')).toBe(true);
  });

  it('listAllOccurrences ne retourne que les occurrences du tenant demandé, triées par date planifiée', async () => {
    const occurrences = await tontineTurnsService.listAllOccurrences('T-002');
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((item) => item.tenantId === 'T-002')).toBe(true);
    const dates = occurrences.map((item) => item.plannedDate);
    expect(dates).toEqual([...dates].sort());
  });

  it('listAllTurns et listAllBeneficiaries ne retournent que les entrées du tenant demandé', async () => {
    const turns = await tontineTurnsService.listAllTurns('T-002');
    const beneficiaries = await tontineTurnsService.listAllBeneficiaries('T-002');
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((item) => item.tenantId === 'T-002')).toBe(true);
    expect(beneficiaries.length).toBeGreaterThan(0);
    expect(beneficiaries.every((item) => item.tenantId === 'T-002')).toBe(true);
  });

  it('un tenant sans aucune donnée reçoit des listes vides, jamais une erreur', async () => {
    const [periods, adhesions, contributions, occurrences, turns, beneficiaries] = await Promise.all([
      tontineTurnsService.listAllPeriods('T-999'),
      tontineTurnsService.listAllAdhesions('T-999'),
      tontineTurnsService.listAllContributions('T-999'),
      tontineTurnsService.listAllOccurrences('T-999'),
      tontineTurnsService.listAllTurns('T-999'),
      tontineTurnsService.listAllBeneficiaries('T-999'),
    ]);
    expect([periods, adhesions, contributions, occurrences, turns, beneficiaries].every((list) => Array.isArray(list) && list.length === 0)).toBe(true);
  });
});

describe('tontineTurnsService — tenant isolation', () => {
  it('DENY: an occurrence of another tenant is never returned', async () => {
    const occurrence = await tontineTurnsService.getOccurrence('T-999', 'OCC-001');
    expect(occurrence).toBeNull();
  });

  it('DENY: a turn accessed through the wrong tenant is never returned', async () => {
    const turn = await tontineTurnsService.getTurn('T-999', 'TURN-001');
    expect(turn).toBeNull();
  });
});

describe('tontineTurnsService — multi-beneficiary (D-TON-04-19)', () => {
  it('a Turn can expose more than one beneficiary', async () => {
    const beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', 'TURN-002');
    expect(beneficiaries.length).toBe(2);
    expect(beneficiaries.map((item) => item.adhesionId).sort()).toEqual(['ADH-002', 'ADH-003']);
  });

  it('each beneficiary is tracked independently (one PARTIAL, one PENDING on the same Turn)', async () => {
    const beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', 'TURN-002');
    const b1 = beneficiaries.find((item) => item.adhesionId === 'ADH-002')!;
    const b2 = beneficiaries.find((item) => item.adhesionId === 'ADH-003')!;
    expect(b1.status).toBe('PARTIAL');
    expect(b2.status).toBe('PENDING');
  });
});

describe('tontineTurnsService — reception ledger (D-TON-04-21 / réceptions successives)', () => {
  it('a correction never overwrites the original operation, and nets out to the corrected value', async () => {
    const beneficiary = await tontineTurnsService.getBeneficiary('T-002', 'TB-002');
    // OP-002 reception 800_000, OP-003 correction -> 750_000 (net -50_000), OP-004 regularization +200_000
    expect(beneficiary?.operations.length).toBe(3);
    expect(beneficiary?.operations.some((op) => op.type === 'reception')).toBe(true);
    expect(beneficiary?.operations.some((op) => op.type === 'correction')).toBe(true);
    expect(beneficiary?.receivedTotal).toBe(950_000); // 750_000 + 200_000
  });

  it('a new reception is appended, never replacing the previous one', async () => {
    const before = await tontineTurnsService.getBeneficiary('T-002', 'TB-003');
    const opsBefore = before?.operations.length ?? 0;
    await tontineTurnsService.recordReception('T-002', 'TB-003', { amount: 500_000 });
    const after = await tontineTurnsService.getBeneficiary('T-002', 'TB-003');
    expect(after?.operations.length).toBe(opsBefore + 1);
    expect(after?.receivedTotal).toBe(500_000);
    await tontineTurnsService.recordReception('T-002', 'TB-003', { amount: 300_000 });
    const afterSecond = await tontineTurnsService.getBeneficiary('T-002', 'TB-003');
    expect(afterSecond?.operations.length).toBe(opsBefore + 2);
    expect(afterSecond?.receivedTotal).toBe(800_000); // cumulated, not overwritten
  });

  it('correction requires a reason', async () => {
    const result = await tontineTurnsService.correctReception('T-002', 'TB-002', { operationId: 'OP-002', amount: 700_000, reason: '' });
    expect(result).toBeNull();
  });

  it('cancellation invalidates an operation without deleting its history entry', async () => {
    const before = await tontineTurnsService.getBeneficiary('T-005', 'TB-004');
    const opId = before!.operations[0].id;
    const opsCountBefore = before!.operations.length; // snapshot as a primitive, not a live array reference
    const cancelledQuantity = before!.operations[0].quantity ?? 0;
    const totalBefore = before!.receivedTotal;
    const after = await tontineTurnsService.cancelReception('T-005', 'TB-004', { operationId: opId, reason: 'Réception erronée, jamais reçue en réalité.' });
    expect(after?.operations.length).toBe(opsCountBefore + 1); // appended, not removed
    expect(after?.operations.some((op) => op.id === opId)).toBe(true); // original still present
    expect(after?.receivedTotal).toBe(totalBefore - cancelledQuantity);
  });
});

describe('tontineTurnsService — closure preconditions (D-TON-06-09/-10/-13)', () => {
  it('DENY: a Turn cannot be closed while a beneficiary is not RECEIVED', async () => {
    const result = await tontineTurnsService.closeTurn('T-002', 'TURN-002');
    expect(result).toBeNull();
  });

  it('DENY: a Turn already CLOSED can never be re-closed or reopened (immutability)', async () => {
    const result = await tontineTurnsService.closeTurn('T-002', 'TURN-001');
    expect(result).toBeNull();
  });

  it('DENY: an Occurrence cannot be closed while its Turn is still OPEN', async () => {
    const result = await tontineTurnsService.closeOccurrence('T-002', 'OCC-002');
    expect(result).toBeNull();
  });

  it('DENY: recording a reception on a beneficiary of a CLOSED Turn is refused', async () => {
    const result = await tontineTurnsService.recordReception('T-002', 'TB-001', { amount: 1 });
    expect(result).toBeNull();
  });
});

describe('tontineTurnsService — Adhesion (Member ≠ Adhesion)', () => {
  it('a Member can be looked up via its adhesions without being conflated with them', async () => {
    const adhesions = await tontineTurnsService.listAdhesionsByMember('T-002', 'M-001');
    expect(adhesions.length).toBe(1);
    expect(adhesions[0].id).toBe('ADH-001');
    expect(adhesions[0].memberId).toBe('M-001');
  });

  it('DENY: an adhesion of another tenant is never returned', async () => {
    const adhesion = await tontineTurnsService.getAdhesion('T-999', 'ADH-001');
    expect(adhesion).toBeNull();
  });

  it('creates a new adhesion scoped to the tenant, defaulting to active', async () => {
    const created = await tontineTurnsService.createAdhesion('T-002', { periodId: 'PER-001', memberId: 'M-002', memberName: 'Mamadou Sow', joinedAt: '2026-08-18' });
    expect(created?.status).toBe('active');
    expect(created?.tenantId).toBe('T-002');
    const listed = await tontineTurnsService.listAdhesionsByTontine('T-002', 'TON-001');
    expect(listed.some((item) => item.id === created?.id)).toBe(true);
  });

  it('allows multiple adhesions for the same member on the same tontine (D-TON-04-08, no cardinality limit)', async () => {
    const before = await tontineTurnsService.listAdhesionsByMember('T-002', 'M-001');
    await tontineTurnsService.createAdhesion('T-002', { periodId: 'PER-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', joinedAt: '2026-08-18' });
    const after = await tontineTurnsService.listAdhesionsByMember('T-002', 'M-001');
    expect(after.length).toBe(before.length + 1);
  });
});

describe('tontineTurnsService — adhesion relations (préparation Contribution/Beneficiary)', () => {
  it('lists the contributions linked to a given adhesion, tenant-scoped', async () => {
    const contributions = await tontineTurnsService.listContributionsByAdhesion('T-002', 'ADH-001');
    expect(contributions.length).toBe(1);
    expect(contributions[0].id).toBe('CTB-001');
  });

  it('lists the beneficiary entries linked to a given adhesion, with a derived status', async () => {
    const beneficiaries = await tontineTurnsService.listBeneficiariesByAdhesion('T-002', 'ADH-001');
    expect(beneficiaries.length).toBe(1);
    expect(beneficiaries[0].status).toBe('RECEIVED');
  });

  it('returns an empty list for an adhesion with no linked contribution', async () => {
    const contributions = await tontineTurnsService.listContributionsByAdhesion('T-002', 'ADH-004');
    expect(contributions).toEqual([]);
  });
});

describe('tontineTurnsService — Contributions (Adhesion → Contribution → Occurrence, D-TON-04-29)', () => {
  it('lists every contribution of a tontine by traversing its adhesions, tenant-scoped', async () => {
    const contributions = await tontineTurnsService.listContributionsByTontine('T-002', 'TON-001');
    expect(contributions.map((item) => item.id).sort()).toEqual(['CTB-001', 'CTB-002', 'CTB-003']);
  });

  it('lists occurrences of a tontine by traversing its cycles, for the occurrence selector', async () => {
    const occurrences = await tontineTurnsService.listOccurrencesByTontine('T-002', 'TON-001');
    expect(occurrences.map((item) => item.id)).toEqual(['OCC-001', 'OCC-002']);
  });

  it('creates a MONEY contribution, PENDING and unpaid by default (expected value is historical, D-TON-04-29)', async () => {
    const created = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-004', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 350_000 });
    expect(created?.status).toBe('PENDING');
    expect(created?.paidAmount).toBe(0);
    expect(created?.paidAt).toBeNull();
    const list = await tontineTurnsService.listContributionsByAdhesion('T-002', 'ADH-004');
    expect(list.some((item) => item.id === created?.id)).toBe(true);
  });

  it('creates a GOODS contribution tracking quantity and item, not an amount', async () => {
    const created = await tontineTurnsService.createContribution('T-005', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'GOODS', expectedQuantity: 3, item: 'Sac de riz 25kg' });
    expect(created?.valueType).toBe('GOODS');
    expect(created?.expectedQuantity).toBe(3);
    expect(created?.item).toBe('Sac de riz 25kg');
    expect(created?.expectedAmount).toBeUndefined();
  });

  it('DENY: creation is refused if the adhesion does not belong to the tenant', async () => {
    const result = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 1 });
    expect(result).toBeNull();
  });

  it('DENY: creation is refused if the occurrence does not belong to the tenant', async () => {
    const result = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-001', tontineOccurrenceId: 'OCC-003', valueType: 'MONEY', expectedAmount: 1 });
    expect(result).toBeNull();
  });
});

describe('tontineTurnsService — Contribution payments (paiements successifs traçables, D-TON "Contributions")', () => {
  it('DENY: a payment on another tenant\'s contribution is never returned', async () => {
    const result = await tontineTurnsService.recordContributionPayment('T-999', 'CTB-002', { amount: 1 });
    expect(result).toBeNull();
  });

  it('a single payment on a PENDING contribution moves it to PARTIAL if below the expected value', async () => {
    const created = await tontineTurnsService.createContribution('T-005', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'MONEY', expectedAmount: 100_000 });
    const result = await tontineTurnsService.recordContributionPayment('T-005', created!.id, { amount: 40_000 });
    expect(result?.status).toBe('PARTIAL');
    expect(result?.paidAmount).toBe(40_000);
  });

  it('multiple successive payments are cumulated and never overwrite each other (traceability)', async () => {
    const created = await tontineTurnsService.createContribution('T-005', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'MONEY', expectedAmount: 150_000 });
    await tontineTurnsService.recordContributionPayment('T-005', created!.id, { amount: 50_000 });
    await tontineTurnsService.recordContributionPayment('T-005', created!.id, { amount: 70_000 });
    const result = await tontineTurnsService.recordContributionPayment('T-005', created!.id, { amount: 30_000 });
    expect(result?.paidAmount).toBe(150_000);
    expect(result?.status).toBe('PAID'); // reaches the expected value exactly
    expect(result?.payments.length).toBe(3); // three distinct entries, none replaced
  });

  it('a GOODS contribution accumulates paid quantity across payments', async () => {
    const created = await tontineTurnsService.createContribution('T-005', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'GOODS', expectedQuantity: 5, item: 'Sac de riz 25kg' });
    await tontineTurnsService.recordContributionPayment('T-005', created!.id, { quantity: 2 });
    const result = await tontineTurnsService.recordContributionPayment('T-005', created!.id, { quantity: 3 });
    expect(result?.paidQuantity).toBe(5);
    expect(result?.status).toBe('PAID');
  });

  it('DENY: a payment is refused on a WAIVED contribution (WAIVED ≠ unpaid, a distinct state)', async () => {
    const result = await tontineTurnsService.recordContributionPayment('T-002', 'CTB-003', { amount: 100 });
    expect(result).toBeNull();
  });

  it('the payment ledger of the CTB-002 seed already demonstrates multiple traceable payments', async () => {
    const contribution = await tontineTurnsService.getContribution('T-002', 'CTB-002');
    expect(contribution?.payments.length).toBe(2);
    expect(contribution?.paidAmount).toBe(200_000);
    expect(contribution?.status).toBe('PARTIAL');
  });

  it('getContribution never crosses tenants', async () => {
    const result = await tontineTurnsService.getContribution('T-999', 'CTB-001');
    expect(result).toBeNull();
  });
});

describe('tontineTurnsService — MONEY / GOODS (common model)', () => {
  it('a GOODS beneficiary tracks quantity, not amount', async () => {
    const beneficiary = await tontineTurnsService.getBeneficiary('T-005', 'TB-004');
    expect(beneficiary?.valueType).toBe('GOODS');
    expect(beneficiary?.item).toBe('Bidon d’huile 5L');
    expect(beneficiary?.expectedQuantity).toBe(2);
  });
});

describe('tontineTurnsService — createOccurrence (P1 calendrier, parent Période)', () => {
  it('creates an Occurrence and its paired Turn in the same call (D-TON-04-06: relation 1:1)', async () => {
    const occurrence = await tontineTurnsService.createOccurrence('T-002', { periodId: 'PER-001', occurrenceNumber: 3, plannedDate: '2026-08-20' });
    expect(occurrence?.periodId).toBe('PER-001');
    expect(occurrence?.occurrenceNumber).toBe(3);
    expect(occurrence?.status).toBe('OPEN');
    expect(occurrence?.actualDate).toBeNull();
    const turn = await tontineTurnsService.getTurnByOccurrence('T-002', occurrence!.id);
    expect(turn).not.toBeNull();
    expect(turn?.turnNumber).toBe(3);
    expect(turn?.status).toBe('OPEN');
  });

  it('DENY: refuses a duplicate occurrenceNumber within the same period', async () => {
    const result = await tontineTurnsService.createOccurrence('T-002', { periodId: 'PER-001', occurrenceNumber: 1, plannedDate: '2026-08-20' });
    expect(result).toBeNull();
  });

  it('DENY: refuses to write against a period of another tenant', async () => {
    const result = await tontineTurnsService.createOccurrence('T-001', { periodId: 'PER-001', occurrenceNumber: 5, plannedDate: '2026-08-20' });
    expect(result).toBeNull();
  });

  it('the newly created occurrence is only visible through its own tenant (isolation preserved)', async () => {
    const occurrence = await tontineTurnsService.createOccurrence('T-005', { periodId: 'PER-002', occurrenceNumber: 2, plannedDate: '2026-09-01' });
    const ownTenant = await tontineTurnsService.getOccurrence('T-005', occurrence!.id);
    const otherTenant = await tontineTurnsService.getOccurrence('T-002', occurrence!.id);
    expect(ownTenant?.id).toBe(occurrence!.id);
    expect(otherTenant).toBeNull();
  });
});

describe('tontineTurnsService — Period (nouveau niveau temporel, mandat refonte)', () => {
  it('creates a Period for an existing Tontine (never recreates the Tontine)', async () => {
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: 'TON-001', startDate: '2027-06-01', endDate: '2028-05-31' });
    expect(period?.tontineId).toBe('TON-001');
    expect(period?.status).toBe('ACTIVE');
  });

  it('a new Period does not modify existing periods of the same Tontine', async () => {
    const before = await tontineTurnsService.getPeriod('T-002', 'PER-001');
    await tontineTurnsService.createPeriod('T-002', { tontineId: 'TON-001', startDate: '2027-06-01', endDate: '2028-05-31' });
    const after = await tontineTurnsService.getPeriod('T-002', 'PER-001');
    expect(after?.status).toBe(before?.status);
    expect(after?.startDate).toBe(before?.startDate);
  });

  it('DENY: refuses to create a period against a tontine of another tenant', async () => {
    const result = await tontineTurnsService.createPeriod('T-001', { tontineId: 'TON-001', startDate: '2027-06-01', endDate: '2028-05-31' });
    expect(result).toBeNull();
  });

  it('chaining createTontine then createPeriod (the current TontineCreate "first period" flow, replacing the old Cycle chaining) attaches the period to the new tontine', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Avec première période', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE' });
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2027-01-01', endDate: '2027-12-31' });
    expect(period?.tontineId).toBe(tontine.id);
    const periods = await tontineTurnsService.listPeriodsByTontine('T-002', tontine.id);
    expect(periods.map((item) => item.id)).toEqual([period?.id]);
  });

  it('listPeriodsByTontine is tenant-scoped and returns periods sorted by startDate', async () => {
    const periods = await tontineTurnsService.listPeriodsByTontine('T-002', 'TON-001');
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.every((item) => item.tenantId === 'T-002')).toBe(true);
  });

  it('the seed PER-001/PER-002 already demonstrate the migration away from Cycle as Occurrence parent', async () => {
    const occ1 = await tontineTurnsService.getOccurrence('T-002', 'OCC-001');
    const occ3 = await tontineTurnsService.getOccurrence('T-005', 'OCC-003');
    expect(occ1?.periodId).toBe('PER-001');
    expect(occ3?.periodId).toBe('PER-002');
  });

  it('DENY: a period id that was never created returns null — a real Not Found, never a crash (routing correction mandate §3.6)', async () => {
    const result = await tontineTurnsService.getPeriod('T-002', 'PER-1787164457244-7fb9yr');
    expect(result).toBeNull();
  });
});

describe('tontineTurnsService — parcours complet Tontine → Période → Occurrence → Turn/Contribution (correction routing 404)', () => {
  /**
   * Reproduit exactement la chaîne rapportée dans le mandat (création d'une
   * Tontine supplémentaire — id dynamique du type TON-00N — puis d'une
   * Période dont l'id suit le format `uniqueId('PER')`, ex.
   * PER-1787164457244-7fb9yr) et vérifie que chaque étape reste accessible
   * par le même chemin que celui suivi par `PeriodDetail`/`OccurrenceDetail`
   * (tenantId + id, jamais un autre paramètre).
   */
  it('a freshly created Tontine → Period → Occurrence → Turn chain is reachable end-to-end via getTontine/getPeriod/getOccurrence/getTurnByOccurrence', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Parcours bout en bout', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE', frequency: 'WEEKLY', weekday: 'WEDNESDAY' });
    expect(tontine.id).toMatch(/^TON-\d{3}$/);
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(period).not.toBeNull();

    // Étape 1 : la Tontine reste accessible par son id, sous le même tenant.
    const fetchedTontine = await tontinesService.getTontine('T-002', tontine.id);
    expect(fetchedTontine?.id).toBe(tontine.id);

    // Étape 2 : la Période est accessible exactement comme PeriodDetail le fait (tenantId + periodId).
    const fetchedPeriod = await tontineTurnsService.getPeriod('T-002', period!.id);
    expect(fetchedPeriod?.id).toBe(period!.id);
    expect(fetchedPeriod?.tontineId).toBe(tontine.id);

    // Étape 3 : génération des occurrences à partir de la fréquence de la Tontine, rattachées à cette Période.
    const created = await tontineTurnsService.generateOccurrences('T-002', period!.id);
    expect(created).not.toBeNull();
    expect(created!.length).toBeGreaterThan(0);
    expect(created!.every((occurrence) => occurrence.periodId === period!.id)).toBe(true);

    // Étape 4 : chaque Occurrence est accessible individuellement, comme OccurrenceDetail le ferait.
    const firstOccurrence = created![0];
    const fetchedOccurrence = await tontineTurnsService.getOccurrence('T-002', firstOccurrence.id);
    expect(fetchedOccurrence?.id).toBe(firstOccurrence.id);

    // Étape 5 : le Turn pairé existe et est accessible, comme TurnDetail le ferait.
    const turn = await tontineTurnsService.getTurnByOccurrence('T-002', firstOccurrence.id);
    expect(turn).not.toBeNull();
    expect(turn?.status).toBe('OPEN');
  });

  it('the same chain is inaccessible from another tenant at every step (isolation preserved end-to-end)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Parcours isolation', valueType: 'MONEY', tenantId: 'T-005', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE', frequency: 'WEEKLY', weekday: 'FRIDAY' });
    const period = await tontineTurnsService.createPeriod('T-005', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-01-31' });
    const created = await tontineTurnsService.generateOccurrences('T-005', period!.id);

    expect(await tontinesService.getTontine('T-002', tontine.id)).toBeNull();
    expect(await tontineTurnsService.getPeriod('T-002', period!.id)).toBeNull();
    expect(await tontineTurnsService.getOccurrence('T-002', created![0].id)).toBeNull();
  });
});

describe('tontineTurnsService — closeAdhesion (clôture logique, mandat refonte §8)', () => {
  it('closes an active adhesion: status becomes exited, endDate is set (UPDATE, never DELETE)', async () => {
    const created = await tontineTurnsService.createAdhesion('T-002', { periodId: 'PER-001', memberId: 'M-999', memberName: 'Test Historique', joinedAt: '2026-01-01' });
    const closed = await tontineTurnsService.closeAdhesion('T-002', created!.id, '2026-06-01');
    expect(closed?.status).toBe('exited');
    expect(closed?.endDate).toBe('2026-06-01');
    const stillThere = await tontineTurnsService.getAdhesion('T-002', created!.id);
    expect(stillThere?.id).toBe(created!.id);
  });

  it('DENY: refuses to close an adhesion that is already exited (no silent double-closure)', async () => {
    const result = await tontineTurnsService.closeAdhesion('T-002', 'ADH-006', '2026-06-01');
    expect(result).toBeNull();
  });

  it('a newly created adhesion has endDate null and status active by default', async () => {
    const created = await tontineTurnsService.createAdhesion('T-002', { periodId: 'PER-001', memberId: 'M-998', memberName: 'Test Actif', joinedAt: '2026-01-01' });
    expect(created?.endDate).toBeNull();
    expect(created?.status).toBe('active');
  });
});

describe('tontineTurnsService — eligibility rule (mandat refonte §10)', () => {
  it('ALLOW: an adhesion active at the occurrence date can receive a contribution', async () => {
    const result = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-001', tontineOccurrenceId: 'OCC-001', valueType: 'MONEY', expectedAmount: 10_000 });
    expect(result).not.toBeNull();
  });

  it('DENY: an adhesion already exited before the occurrence date is refused', async () => {
    // ADH-006 : joinedAt 2025-06-01, endDate 2026-05-01 — OCC-001 actualDate 2026-06-20, postérieure à la sortie.
    const result = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-006', tontineOccurrenceId: 'OCC-001', valueType: 'MONEY', expectedAmount: 10_000 });
    expect(result).toBeNull();
  });

  it('DENY: an adhesion joining after the occurrence date is refused', async () => {
    const lateAdhesion = await tontineTurnsService.createAdhesion('T-002', { periodId: 'PER-001', memberId: 'M-997', memberName: 'Rejoint tard', joinedAt: '2027-01-01' });
    const result = await tontineTurnsService.createContribution('T-002', { adhesionId: lateAdhesion!.id, tontineOccurrenceId: 'OCC-001', valueType: 'MONEY', expectedAmount: 10_000 });
    expect(result).toBeNull();
  });

  it('ALLOW: an adhesion with no endDate is eligible for any occurrence on/after joinedAt', async () => {
    const result = await tontineTurnsService.createContribution('T-005', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'GOODS', expectedQuantity: 1, item: 'Savon' });
    expect(result).not.toBeNull();
  });
});

describe('tontineTurnsService — createContribution currency/unit (préremplissage devise/unité mandate)', () => {
  it('a MONEY contribution persists the currency it is created with (supports Tontine-level prefill in ContributionCreate)', async () => {
    const contribution = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-001', tontineOccurrenceId: 'OCC-001', valueType: 'MONEY', expectedAmount: 100_000, currency: 'XOF' });
    expect(contribution?.currency).toBe('XOF');
  });

  it('a GOODS contribution persists the item/unit it is created with (supports Tontine-level prefill in ContributionCreate)', async () => {
    const contribution = await tontineTurnsService.createContribution('T-005', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'GOODS', expectedQuantity: 2, item: 'Bidon d’huile 5L', unit: 'BIDON' });
    expect(contribution?.item).toBe('Bidon d’huile 5L');
    expect(contribution?.unit).toBe('BIDON');
  });

  it('a contribution created without currency/unit leaves them undefined (not invented)', async () => {
    const contribution = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-001', tontineOccurrenceId: 'OCC-001', valueType: 'MONEY', expectedAmount: 50_000 });
    expect(contribution?.currency).toBeUndefined();
  });

  it('isolation tenant is preserved on a currency/unit-bearing contribution', async () => {
    const contribution = await tontineTurnsService.createContribution('T-005', { adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'GOODS', expectedQuantity: 3, item: 'Sucre', unit: 'SAC' });
    const ownTenant = await tontineTurnsService.getContribution('T-005', contribution!.id);
    const otherTenant = await tontineTurnsService.getContribution('T-002', contribution!.id);
    expect(ownTenant?.id).toBe(contribution!.id);
    expect(otherTenant).toBeNull();
  });
});

describe('tontineTurnsService — adhésions au niveau de la période (mandat « TENANT → TONTINE → PÉRIODE → ADHÉSIONS → OCCURRENCES »)', () => {
  it('listAdhesionsByPeriod is tenant-scoped and returns exactly the adhesions of that period, none of another period', async () => {
    // PER-001 est réutilisée comme fixture par d'autres tests de ce fichier (createAdhesion y ajoute des lignes) —
    // on vérifie donc que les 5 adhésions seedées y sont bien présentes, jamais une égalité stricte sur ce tableau partagé.
    const per001 = await tontineTurnsService.listAdhesionsByPeriod('T-002', 'PER-001');
    expect(per001.map((item) => item.id)).toEqual(expect.arrayContaining(['ADH-001', 'ADH-002', 'ADH-003', 'ADH-004', 'ADH-006']));
    expect(per001.every((item) => item.tenantId === 'T-002')).toBe(true);
    const per002 = await tontineTurnsService.listAdhesionsByPeriod('T-005', 'PER-002');
    expect(per002.map((item) => item.id)).toEqual(['ADH-005']);
  });

  it('DENY: listAdhesionsByPeriod never returns adhesions through another tenant', async () => {
    const result = await tontineTurnsService.listAdhesionsByPeriod('T-999', 'PER-001');
    expect(result).toEqual([]);
  });

  it('creates an adhesion directly inside an existing period (no assignment layer)', async () => {
    const created = await tontineTurnsService.createAdhesion('T-002', { periodId: 'PER-001', memberId: 'M-010', memberName: 'Nouvel Adhérent', joinedAt: '2026-08-19' });
    expect(created?.periodId).toBe('PER-001');
    const listed = await tontineTurnsService.listAdhesionsByPeriod('T-002', 'PER-001');
    expect(listed.some((item) => item.id === created?.id)).toBe(true);
  });

  it('DENY: refuses to create an adhesion against a period that does not exist', async () => {
    const result = await tontineTurnsService.createAdhesion('T-002', { periodId: 'PER-INEXISTANT', memberId: 'M-010', memberName: 'Nouvel Adhérent', joinedAt: '2026-08-19' });
    expect(result).toBeNull();
  });

  it('DENY: refuses to create an adhesion against a period of another tenant (no cross-tenant write)', async () => {
    const result = await tontineTurnsService.createAdhesion('T-001', { periodId: 'PER-001', memberId: 'M-010', memberName: 'Nouvel Adhérent', joinedAt: '2026-08-19' });
    expect(result).toBeNull();
  });

  it('the same member can hold an adhesion in two different periods of the same Tontine (AC-08 : deux Périodes peuvent avoir des adhésions différentes)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Épargne — adhésions par période', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE' });
    const period2026 = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-12-31' });
    const period2027 = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2027-01-01', endDate: '2027-12-31' });
    await tontineTurnsService.createAdhesion('T-002', { periodId: period2026!.id, memberId: 'M-001', memberName: 'Jean', joinedAt: '2026-01-01' });
    await tontineTurnsService.createAdhesion('T-002', { periodId: period2027!.id, memberId: 'M-001', memberName: 'Jean', joinedAt: '2027-01-01' });
    const in2026 = await tontineTurnsService.listAdhesionsByPeriod('T-002', period2026!.id);
    const in2027 = await tontineTurnsService.listAdhesionsByPeriod('T-002', period2027!.id);
    expect(in2026.length).toBe(1);
    expect(in2027.length).toBe(1);
    expect(in2026[0].id).not.toBe(in2027[0].id); // deux adhésions distinctes, jamais réutilisées entre périodes
  });

  it('a new period never inherits the adhesions of a previous period of the same Tontine (AC-13 : pas de copie automatique)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Pas de copie automatique', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE' });
    const period1 = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-12-31' });
    await tontineTurnsService.createAdhesion('T-002', { periodId: period1!.id, memberId: 'M-001', memberName: 'Jean', joinedAt: '2026-01-01' });
    const period2 = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2027-01-01', endDate: '2027-12-31' });
    const adhesionsOfPeriod2 = await tontineTurnsService.listAdhesionsByPeriod('T-002', period2!.id);
    expect(adhesionsOfPeriod2).toEqual([]); // zéro adhésion tant que le gestionnaire n'en a pas ajouté
  });

  it('a Tontine can be created with zero adhesions (AC-01)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine sans adhésion', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE' });
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-12-31' });
    const adhesions = await tontineTurnsService.listAdhesionsByPeriod('T-002', period!.id);
    expect(adhesions).toEqual([]); // AC-07 : zéro adhésion est un état valide
  });
});

describe('tontineTurnsService — createAdhesionsForPeriod (mandat ajout multiple d’adhésions)', () => {
  /** Fixture isolée (Tontine + Période fraîches, T-002) pour ne dépendre d'aucun ordre d'exécution ni de l'état déjà mutable des seeds partagées entre tests. */
  async function createFreshPeriod() {
    const tontine = await tontinesService.createTontine({ name: 'Fixture ajout multiple', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE' });
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-12-31' });
    return period!;
  }

  it('creates two adhesions in a single call, both attached to the same period (AC-01/AC-09)', async () => {
    const period = await createFreshPeriod();
    // M-002 (Mamadou Sow) et M-007 (Khadija Mbaye) sont les deux seuls membres actifs du tenant T-002 dans les seeds.
    const result = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, ['M-002', 'M-007'], '2026-01-15');
    expect(result?.created.length).toBe(2);
    expect(result?.skippedMemberIds).toEqual([]);
    expect(result?.created.every((item) => item.periodId === period.id)).toBe(true);
    expect(result?.created.map((item) => item.memberId).sort()).toEqual(['M-002', 'M-007']);
  });

  it('creates ten adhesions in a single call (AC-01 at scale — 10 fresh active members created via organizationService for this test, since only 8 members exist across all tenant seeds)', async () => {
    const period = await createFreshPeriod();
    const memberIds: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const member = await organizationService.createMember({ firstName: `Test${index}`, lastName: 'Multiple', email: `test${index}@example.sn`, phone: `+221 70 000 00 ${String(index).padStart(2, '0')}`, occupation: 'Test', nationality: 'Sénégalaise', address: 'N/A', status: 'active', gender: '', matricule: '', tenantId: 'T-002', tenantName: 'Tontine Horizon' });
      memberIds.push(member!.id);
    }
    const result = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, memberIds, '2026-01-15');
    expect(result?.created.length).toBe(10);
    expect(result?.skippedMemberIds).toEqual([]);
    expect(new Set(result?.created.map((item) => item.periodId))).toEqual(new Set([period.id]));
  });

  it('a member already adherent to the period is skipped, not duplicated (AC-03)', async () => {
    const period = await createFreshPeriod();
    const first = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, ['M-002'], '2026-01-15');
    expect(first?.created.length).toBe(1);
    const second = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, ['M-002', 'M-007'], '2026-01-15');
    expect(second?.created.map((item) => item.memberId)).toEqual(['M-007']);
    expect(second?.skippedMemberIds).toEqual(['M-002']);
    const all = await tontineTurnsService.listAdhesionsByPeriod('T-002', period.id);
    expect(all.filter((item) => item.memberId === 'M-002').length).toBe(1); // toujours une seule adhésion pour ce membre dans cette période
  });

  it('DENY (skipped, not tenant DENY): an inactive member of the SAME tenant as the period is refused, not created (AC-11)', async () => {
    const period = await createFreshPeriod(); // T-002
    const inactiveMember = await organizationService.createMember({ firstName: 'Inactif', lastName: 'Test', email: 'inactif@example.sn', phone: '+221 70 111 11 11', occupation: 'Test', nationality: 'Sénégalaise', address: 'N/A', status: 'inactive', gender: '', matricule: '', tenantId: 'T-002', tenantName: 'Tontine Horizon' });
    const result = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, [inactiveMember!.id], '2026-01-15');
    expect(result?.created).toEqual([]);
    expect(result?.skippedMemberIds).toEqual([inactiveMember!.id]);
  });

  it('DENY (skipped): a member of another tenant is never adhered (AC-10, isolation tenant)', async () => {
    const period = await createFreshPeriod(); // T-002
    // M-003 (Aïssatou Bâ) appartient à T-003, pas T-002.
    const result = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, ['M-003'], '2026-01-15');
    expect(result?.created).toEqual([]);
    expect(result?.skippedMemberIds).toEqual(['M-003']);
    const adhesions = await tontineTurnsService.listAdhesionsByPeriod('T-002', period.id);
    expect(adhesions.some((item) => item.memberId === 'M-003')).toBe(false);
  });

  it('DENY: refuses when the period does not exist (returns null, no partial write)', async () => {
    const result = await tontineTurnsService.createAdhesionsForPeriod('T-002', 'PER-INEXISTANT', ['M-002'], '2026-01-15');
    expect(result).toBeNull();
  });

  it('DENY: refuses to write against a period of another tenant', async () => {
    const period = await createFreshPeriod(); // T-002
    const result = await tontineTurnsService.createAdhesionsForPeriod('T-001', period.id, ['M-002'], '2026-01-15');
    expect(result).toBeNull();
  });

  it('a mixed batch reports created/skipped precisely, never a false total success (mandat §12)', async () => {
    const period = await createFreshPeriod(); // T-002
    // M-002/M-007 valides et actifs (T-002) ; M-003 d'un autre tenant ; M-INEXISTANT n'existe pas.
    const result = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, ['M-002', 'M-007', 'M-003', 'M-INEXISTANT'], '2026-01-15');
    expect(result?.created.map((item) => item.memberId).sort()).toEqual(['M-002', 'M-007']);
    expect(result?.skippedMemberIds.sort()).toEqual(['M-003', 'M-INEXISTANT']);
  });

  it('the unitary createAdhesion path keeps working unchanged after this migration (AC-12, no divergent implementation)', async () => {
    const period = await createFreshPeriod();
    const created = await tontineTurnsService.createAdhesion('T-002', { periodId: period.id, memberId: 'M-002', memberName: 'Mamadou Sow', joinedAt: '2026-01-15' });
    expect(created?.periodId).toBe(period.id);
    expect(created?.status).toBe('active');
  });

  it('no regression on listAdhesionsByPeriod after bulk creation', async () => {
    const period = await createFreshPeriod();
    await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, ['M-002', 'M-007'], '2026-01-15');
    const listed = await tontineTurnsService.listAdhesionsByPeriod('T-002', period.id);
    expect(listed.length).toBe(2);
    expect(listed.every((item) => item.tenantId === 'T-002' && item.periodId === period.id)).toBe(true);
  });

  it('no regression on createContribution eligibility after bulk creation (same periodId cross-check as before, §17)', async () => {
    const period = await createFreshPeriod();
    const bulk = await tontineTurnsService.createAdhesionsForPeriod('T-002', period.id, ['M-002'], '2026-01-15');
    const occurrence = await tontineTurnsService.createOccurrence('T-002', { periodId: period.id, occurrenceNumber: 1, plannedDate: '2026-02-01' });
    const contribution = await tontineTurnsService.createContribution('T-002', { adhesionId: bulk!.created[0].id, tontineOccurrenceId: occurrence!.id, valueType: 'MONEY', expectedAmount: 10_000 });
    expect(contribution).not.toBeNull();
  });
});

describe('tontineTurnsService — createContribution : l’adhésion doit appartenir à la Période de l’Occurrence (mandat « adhésions au niveau de la période » §17)', () => {
  it('ALLOW: contribution acceptée quand l’adhésion et l’occurrence partagent la même Période (cas seed déjà cohérent)', async () => {
    const result = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-004', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 1 });
    expect(result).not.toBeNull();
  });

  it('DENY: contribution refusée si l’adhésion appartient à une AUTRE période que l’occurrence', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Cross-période', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE', frequency: 'WEEKLY', weekday: 'MONDAY' });
    const periodA = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-01-31' });
    const periodB = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2027-01-01', endDate: '2027-01-31' });
    const adhesionOfB = await tontineTurnsService.createAdhesion('T-002', { periodId: periodB!.id, memberId: 'M-001', memberName: 'Jean', joinedAt: '2027-01-01' });
    const occurrenceOfA = await tontineTurnsService.generateOccurrences('T-002', periodA!.id);
    const result = await tontineTurnsService.createContribution('T-002', { adhesionId: adhesionOfB!.id, tontineOccurrenceId: occurrenceOfA![0].id, valueType: 'MONEY', expectedAmount: 1 });
    expect(result).toBeNull();
  });
});

describe('tontineTurnsService — indépendance vis-à-vis de l’exercice fiscal (mandat finalisation UX)', () => {
  it('une Période peut chevaucher deux exercices fiscaux : la génération ne dépend que de period.startDate/endDate/tontine.frequency, jamais d’un identifiant d’exercice fiscal', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Chevauchement exercice fiscal', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 });
    // Chevauche deux exercices calendaires (nov 2026 → fév 2027) : ni createPeriod ni generateOccurrences n'acceptent ou ne dérivent quoi que ce soit d'un exercice fiscal.
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-11-01', endDate: '2027-02-28' });
    expect(period).not.toBeNull();
    const created = await tontineTurnsService.generateOccurrences('T-002', period!.id);
    expect(created!.map((item) => item.plannedDate)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']);
  });
});

describe('tontineTurnsService — périodes successives sur la même Tontine (mandat finalisation UX)', () => {
  it('trois périodes successives cohabitent sous la même Tontine, sans jamais la recréer, avec un historique intact', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Épargne mensuelle successive', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE' });
    const period1 = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-12-31' });
    const period2 = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2027-01-01', endDate: '2027-12-31' });
    const period3 = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2028-01-01', endDate: '2028-12-31' });
    expect([period1, period2, period3].every((p) => p?.tontineId === tontine.id)).toBe(true);

    const periods = await tontineTurnsService.listPeriodsByTontine('T-002', tontine.id);
    expect(periods.map((p) => p.id).sort()).toEqual([period1!.id, period2!.id, period3!.id].sort());

    // La création de period2/period3 ne modifie ni les dates ni le statut de period1 (historique intact).
    const refetchedPeriod1 = await tontineTurnsService.getPeriod('T-002', period1!.id);
    expect(refetchedPeriod1?.startDate).toBe('2026-01-01');
    expect(refetchedPeriod1?.endDate).toBe('2026-12-31');

    // La Tontine reste unique : un seul id, jamais recréé par les périodes suivantes.
    const stillSameTontine = await tontinesService.getTontine('T-002', tontine.id);
    expect(stillSameTontine?.id).toBe(tontine.id);
  });
});

describe('tontineTurnsService — generateOccurrences (mandat fréquence)', () => {
  /** Fixture isolée (Tontine + Période fraîches) pour ne dépendre d'aucun ordre d'exécution ni de l'état déjà mutable des seeds partagées entre tests. */
  async function createWeeklyFixture() {
    const tontine = await tontinesService.createTontine({ name: 'Fixture hebdo', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', frequency: 'WEEKLY', weekday: 'WEDNESDAY' });
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-01-01', endDate: '2026-01-31' });
    return { tontine, period: period! };
  }

  it('generates all occurrences of a period from its tontine frequency (WEEKLY mercredi → 4 dates in January 2026), each with a paired Turn', async () => {
    const { period } = await createWeeklyFixture();
    const created = await tontineTurnsService.generateOccurrences('T-002', period.id);
    expect(created).not.toBeNull();
    expect(created!.map((item) => item.plannedDate)).toEqual(['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28']);
    expect(created!.map((item) => item.occurrenceNumber)).toEqual([1, 2, 3, 4]);
    for (const occurrence of created!) {
      const turn = await tontineTurnsService.getTurnByOccurrence('T-002', occurrence.id);
      expect(turn).not.toBeNull();
      expect(turn?.turnNumber).toBe(occurrence.occurrenceNumber);
    }
  });

  it('continues numbering after occurrences already created manually, and never regenerates an occupied date', async () => {
    const { period } = await createWeeklyFixture();
    const manual = await tontineTurnsService.createOccurrence('T-002', { periodId: period.id, occurrenceNumber: 1, plannedDate: '2026-01-07' });
    expect(manual?.plannedDate).toBe('2026-01-07');
    const created = await tontineTurnsService.generateOccurrences('T-002', period.id);
    expect(created!.map((item) => item.plannedDate)).toEqual(['2026-01-14', '2026-01-21', '2026-01-28']);
    expect(created!.map((item) => item.occurrenceNumber)).toEqual([2, 3, 4]);
  });

  it('calling generateOccurrences twice never creates duplicates the second time', async () => {
    const { period } = await createWeeklyFixture();
    const first = await tontineTurnsService.generateOccurrences('T-002', period.id);
    expect(first!.length).toBe(4);
    const second = await tontineTurnsService.generateOccurrences('T-002', period.id);
    expect(second).toEqual([]);
    const all = await tontineTurnsService.listOccurrencesByPeriod('T-002', period.id);
    expect(all.length).toBe(4);
  });

  it('DENY: refuses when the tontine has no frequency configured (PER-002 → TON-002, GOODS sans fréquence dérivable des seeds)', async () => {
    const result = await tontineTurnsService.generateOccurrences('T-005', 'PER-002');
    expect(result).toBeNull();
  });

  it('DENY: refuses to write against a period of another tenant', async () => {
    const { period } = await createWeeklyFixture();
    const result = await tontineTurnsService.generateOccurrences('T-001', period.id);
    expect(result).toBeNull();
  });

  it('isolation tenant: generated occurrences are only visible through their own tenant', async () => {
    const { period } = await createWeeklyFixture();
    const created = await tontineTurnsService.generateOccurrences('T-002', period.id);
    const ownTenant = await tontineTurnsService.getOccurrence('T-002', created![0].id);
    const otherTenant = await tontineTurnsService.getOccurrence('T-005', created![0].id);
    expect(ownTenant?.id).toBe(created![0].id);
    expect(otherTenant).toBeNull();
  });
});

/**
 * AUDIT ENTERPRISE — RBAC : preuve que l'application des permissions est
 * exclusivement côté UI (`PermissionGate`), jamais côté service. Aucune méthode de
 * `tontineTurnsService`/`tontinesService` ne reçoit ni ne consulte `currentUser`/`can()` —
 * masquer un bouton dans l'interface ne constitue donc PAS une garantie de sécurité :
 * un appel direct au service (ex. depuis la console du navigateur) contourne
 * intégralement le RBAC. Caractéristique de toute l'architecture mock du projet
 * (aucun backend réel n'existe encore, cf. `auth.service.ts` — "BACKEND PENDING"),
 * pas une régression propre à Tontines ; documentée ici avec preuve reproductible.
 */
describe('AUDIT — RBAC appliqué uniquement côté UI, jamais côté service', () => {
  it('createOccurrence réussit sans aucune vérification de permission, même pour une action normalement gardée par PermissionGate("cycles.manage") côté UI', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Audit RBAC', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF' });
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-02-01', endDate: '2026-02-28' });
    // Aucun `currentUser`/`can()` n'est passé ni consulté ici — le service ne peut structurellement pas refuser pour une raison de permission.
    const occurrence = await tontineTurnsService.createOccurrence('T-002', { periodId: period!.id, occurrenceNumber: 1, plannedDate: '2026-02-05' });
    expect(occurrence).toBeDefined();
  });

  it('recordReception (normalement gardé par PermissionGate("beneficiaries.manage") côté UI) réussit sans aucun contrôle de permission côté service', async () => {
    const result = await tontineTurnsService.recordReception('T-002', 'TB-003', { amount: 100 });
    expect(result).toBeDefined();
    expect(result?.receivedTotal).toBeGreaterThan(0);
  });
});

/**
 * `addBeneficiaries` — enregistre le résultat d'un tirage MANUEL déjà réalisé hors
 * TANZEN (RB-06/RB-07 du mandat) ; ne choisit, ne calcule ni ne propose jamais
 * lui-même un bénéficiaire. Remplace l'ancien audit "aucune voie de création
 * n'existe" (devenu obsolète depuis l'implémentation de cette méthode).
 */
describe('AUDIT — Bénéficiaires : createOccurrence ne crée toujours aucun TurnBeneficiary par défaut', () => {
  it('createOccurrence crée un Turn sans aucun TurnBeneficiary (0 bénéficiaire, jamais un état "en attente d\'attribution")', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Audit Bénéficiaires', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF' });
    const period = await tontineTurnsService.createPeriod('T-002', { tontineId: tontine.id, startDate: '2026-03-01', endDate: '2026-03-31' });
    const occurrence = await tontineTurnsService.createOccurrence('T-002', { periodId: period!.id, occurrenceNumber: 1, plannedDate: '2026-03-05' });
    const turn = await tontineTurnsService.getTurnByOccurrence('T-002', occurrence!.id);
    const beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn!.id);
    expect(beneficiaries).toEqual([]);
  });

  it('un TurnBeneficiary reste structurellement rattaché à une seule Tontine (via adhesionId → Adhesion.periodId → Period.tontineId) — aucune fuite possible vers une autre tontine par construction', async () => {
    const beneficiary = await tontineTurnsService.getBeneficiary('T-002', 'TB-002');
    const adhesion = await tontineTurnsService.getAdhesion('T-002', beneficiary!.adhesionId);
    const period = await tontineTurnsService.getPeriod('T-002', adhesion!.periodId);
    expect(period?.tontineId).toBe('TON-001'); // Tontine Horizon, seule tontine à laquelle ADH-002/TB-002 est structurellement rattachable.
  });
});

describe('addBeneficiaries — enregistrement du résultat d\'un tirage manuel (RB-01 à RB-10)', () => {
  async function setupOpenTurn(tenantId: string, memberSuffix = 'A') {
    const tontine = await tontinesService.createTontine({ name: `Tirage manuel ${memberSuffix}`, valueType: 'MONEY', tenantId, currency: 'XAF' });
    const period = await tontineTurnsService.createPeriod(tenantId, { tontineId: tontine.id, startDate: '2026-04-01', endDate: '2026-04-30' });
    const adhesion1 = await tontineTurnsService.createAdhesion(tenantId, { periodId: period!.id, memberId: `MBR-${memberSuffix}-1`, memberName: `Membre ${memberSuffix}1`, joinedAt: '2026-04-01' });
    const adhesion2 = await tontineTurnsService.createAdhesion(tenantId, { periodId: period!.id, memberId: `MBR-${memberSuffix}-2`, memberName: `Membre ${memberSuffix}2`, joinedAt: '2026-04-01' });
    const occurrence = await tontineTurnsService.createOccurrence(tenantId, { periodId: period!.id, occurrenceNumber: 1, plannedDate: '2026-04-05' });
    const turn = await tontineTurnsService.getTurnByOccurrence(tenantId, occurrence!.id);
    return { tontine, period: period!, adhesion1: adhesion1!, adhesion2: adhesion2!, occurrence: occurrence!, turn: turn! };
  }

  /**
   * Régression — cause racine du bug « 0 bénéficiaire ajouté / tous non éligibles » observé
   * en usage réel : ce n'était pas un défaut de `isAdhesionActiveAt` (inchangée ici), mais une
   * valeur par défaut incorrecte dans les formulaires d'adhésion (`joinedAt` = date du jour au
   * lieu de `period.startDate`). Ce test documente explicitement le chemin nominal que la
   * correction UI restaure par défaut : une adhésion dont `joinedAt` correspond au début de la
   * Période reste éligible pour n'importe quelle Occurrence future de cette même Période.
   */
  it('une adhésion jointe dès le début de la Période reste éligible pour une Occurrence future de cette Période (chemin nominal restauré)', async () => {
    const { period, turn } = await setupOpenTurn('T-002', 'NOMINAL');
    const adhesionFromPeriodStart = await tontineTurnsService.createAdhesion('T-002', { periodId: period.id, memberId: 'MBR-NOMINAL-START', memberName: 'Membre Nominal', joinedAt: period.startDate });
    const result = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [adhesionFromPeriodStart!.id], valueType: 'MONEY' });
    expect(result?.created.length).toBe(1);
    expect(result?.skippedAdhesionIds).toEqual([]);
  });

  it('T2/T3 — enregistre un ou plusieurs bénéficiaires à partir d\'adhésions explicitement sélectionnées', async () => {
    const { adhesion1, adhesion2, turn } = await setupOpenTurn('T-002', 'B');
    const result = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [adhesion1.id, adhesion2.id], valueType: 'MONEY', expectedAmount: 100_000 });
    expect(result?.created.length).toBe(2);
    expect(result?.skippedAdhesionIds).toEqual([]);
    const beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn.id);
    expect(beneficiaries.map((item) => item.adhesionId).sort()).toEqual([adhesion1.id, adhesion2.id].sort());
  });

  it('T6 — refuse un doublon : la même adhésion deux fois dans le même appel, ou déjà bénéficiaire de ce Turn', async () => {
    const { adhesion1, turn } = await setupOpenTurn('T-002', 'C');
    const first = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [adhesion1.id, adhesion1.id], valueType: 'MONEY' });
    expect(first?.created.length).toBe(1);
    expect(first?.skippedAdhesionIds).toEqual([adhesion1.id]);
    const second = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [adhesion1.id], valueType: 'MONEY' });
    expect(second?.created.length).toBe(0);
    expect(second?.skippedAdhesionIds).toEqual([adhesion1.id]);
  });

  it('T4 — refuse une adhésion qui n\'appartient pas à la Période de l\'Occurrence de ce Turn (RB-01/02/03)', async () => {
    const setupA = await setupOpenTurn('T-002', 'D1');
    const setupB = await setupOpenTurn('T-002', 'D2');
    const result = await tontineTurnsService.addBeneficiaries('T-002', setupA.turn.id, { adhesionIds: [setupB.adhesion1.id], valueType: 'MONEY' });
    expect(result?.created).toEqual([]);
    expect(result?.skippedAdhesionIds).toEqual([setupB.adhesion1.id]);
  });

  /**
   * Régression — cause exacte du bug rapporté « 0 bénéficiaire ajouté » : une adhésion de
   * la BONNE période, jamais un cas croisé, mais dont `joinedAt` est postérieur à la date
   * de référence de l'Occurrence (`actualDate ?? plannedDate`) — donc pas encore active à
   * cette date (`isAdhesionActiveAt`). C'était déjà la règle voulue côté service (§10 mandat
   * refonte, réutilisée telle quelle par `addBeneficiaries`) ; le bug réel était l'absence de
   * ce même calcul côté UI (`AddBeneficiaryDialog`), corrigé sans toucher au service.
   */
  it('refuse une adhésion de la bonne période mais pas encore active à la date de l\'occurrence (joinedAt postérieur)', async () => {
    const { period, occurrence, turn } = await setupOpenTurn('T-002', 'D3');
    const lateAdhesion = await tontineTurnsService.createAdhesion('T-002', { periodId: period.id, memberId: 'MBR-LATE', memberName: 'Membre Tardif', joinedAt: '2026-04-06' });
    expect(lateAdhesion!.joinedAt > occurrence.plannedDate).toBe(true);
    const result = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [lateAdhesion!.id], valueType: 'MONEY' });
    expect(result?.created).toEqual([]);
    expect(result?.skippedAdhesionIds).toEqual([lateAdhesion!.id]);
  });

  it('T4bis — refuse une adhésion inexistante (identifiant arbitraire)', async () => {
    const { turn } = await setupOpenTurn('T-002', 'E');
    const result = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: ['ADH-DOES-NOT-EXIST'], valueType: 'MONEY' });
    expect(result?.created).toEqual([]);
    expect(result?.skippedAdhesionIds).toEqual(['ADH-DOES-NOT-EXIST']);
  });

  it('T5/T13 — un Turn du tenant T-002 refuse l\'ajout d\'une adhésion appartenant au tenant T-005 (isolation tenant/tontine stricte)', async () => {
    const { turn } = await setupOpenTurn('T-002', 'F');
    const otherTenantSetup = await setupOpenTurn('T-005', 'G');
    const result = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [otherTenantSetup.adhesion1.id], valueType: 'MONEY' });
    expect(result?.created).toEqual([]);
    expect(result?.skippedAdhesionIds).toEqual([otherTenantSetup.adhesion1.id]);
  });

  it('refuse l\'ajout sur un Turn CLOSED, sans échouer sur un Turn OPEN (même immuabilité que recordReception/correctReception)', async () => {
    const { adhesion1, adhesion2, turn } = await setupOpenTurn('T-002', 'H');
    await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [adhesion1.id], valueType: 'MONEY' });
    await tontineTurnsService.recordReception('T-002', (await tontineTurnsService.listBeneficiariesByTurn('T-002', turn.id))[0].id, { amount: 100 });
    const closed = await tontineTurnsService.closeTurn('T-002', turn.id);
    expect(closed).toBeDefined();
    const afterClose = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [adhesion2.id], valueType: 'MONEY' });
    expect(afterClose).toBeNull();
  });

  it('T14 — le même membre peut être bénéficiaire dans deux tontines différentes indépendamment (aucun couplage entre tontines)', async () => {
    const setupA = await setupOpenTurn('T-002', 'I1');
    const setupB = await setupOpenTurn('T-002', 'I2');
    const adhesionA = await tontineTurnsService.createAdhesion('T-002', { periodId: setupA.period.id, memberId: 'MBR-SHARED', memberName: 'Membre Partagé', joinedAt: '2026-04-01' });
    const adhesionB = await tontineTurnsService.createAdhesion('T-002', { periodId: setupB.period.id, memberId: 'MBR-SHARED', memberName: 'Membre Partagé', joinedAt: '2026-04-01' });
    const resultA = await tontineTurnsService.addBeneficiaries('T-002', setupA.turn.id, { adhesionIds: [adhesionA!.id], valueType: 'MONEY' });
    const resultB = await tontineTurnsService.addBeneficiaries('T-002', setupB.turn.id, { adhesionIds: [adhesionB!.id], valueType: 'MONEY' });
    expect(resultA?.created.length).toBe(1);
    expect(resultB?.created.length).toBe(1);
    expect(resultA?.created[0].id).not.toBe(resultB?.created[0].id);
  });

  it('T15 — preuve structurelle qu\'aucun tirage automatique n\'est jamais déclenché : un appel avec une liste vide ne crée rien, et rien n\'est créé sans appel explicite de addBeneficiaries', async () => {
    const { turn } = await setupOpenTurn('T-002', 'J');
    const beforeAnyCall = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn.id);
    expect(beforeAnyCall).toEqual([]);
    const emptyCallResult = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [], valueType: 'MONEY' });
    expect(emptyCallResult?.created).toEqual([]);
    const afterEmptyCall = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn.id);
    expect(afterEmptyCall).toEqual([]);
  });

  it('T10 — comme le reste du service, addBeneficiaries ne reçoit ni ne consulte currentUser/can() (RBAC uniquement côté UI)', async () => {
    const { adhesion1, turn } = await setupOpenTurn('T-002', 'K');
    const result = await tontineTurnsService.addBeneficiaries('T-002', turn.id, { adhesionIds: [adhesion1.id], valueType: 'MONEY' });
    expect(result?.created.length).toBe(1);
  });
});

/**
 * AUDIT ENTERPRISE — Isolation tenant : les lectures "listAllX" ajoutées pour la Vue
 * d'ensemble ne doivent jamais mélanger deux tenants, même quand les deux ont des
 * données réelles simultanément (pas seulement "l'autre tenant renvoie []").
 */
describe('AUDIT — Isolation tenant stricte des vues agrégées (T-002 vs T-005, tous deux non vides)', () => {
  it('listAllAdhesions : les jeux de résultats de deux tenants avec données ne se chevauchent jamais', async () => {
    const t002 = await tontineTurnsService.listAllAdhesions('T-002');
    const t005 = await tontineTurnsService.listAllAdhesions('T-005');
    expect(t002.length).toBeGreaterThan(0);
    expect(t005.length).toBeGreaterThan(0);
    const overlap = t002.filter((a) => t005.some((b) => b.id === a.id));
    expect(overlap).toEqual([]);
  });

  it('listAllOccurrences : les jeux de résultats de deux tenants avec données ne se chevauchent jamais', async () => {
    const t002 = await tontineTurnsService.listAllOccurrences('T-002');
    const t005 = await tontineTurnsService.listAllOccurrences('T-005');
    expect(t002.length).toBeGreaterThan(0);
    expect(t005.length).toBeGreaterThan(0);
    const overlap = t002.filter((a) => t005.some((b) => b.id === a.id));
    expect(overlap).toEqual([]);
  });
});

/**
 * Planification + permutation (mandat planification/permutation, WD-006) — le tirage reste
 * manuel et externe (RB-06/RB-07, jamais remis en cause) ; ces tests couvrent uniquement
 * l'échange de deux `TontineTurnBeneficiary` déjà planifiés, via le moteur de workflow
 * générique déjà existant (`workflowService`), jamais un second moteur.
 */
describe('requestTurnPermutation / applyTurnPermutationDecision — permutation de tours planifiés', () => {
  async function setupTwoPlannedTurns(tenantId: string, suffix: string) {
    const tontine = await tontinesService.createTontine({ name: `Planification ${suffix}`, valueType: 'MONEY', tenantId, currency: 'XAF' });
    const period = await tontineTurnsService.createPeriod(tenantId, { tontineId: tontine.id, startDate: '2026-10-01', endDate: '2027-09-30' });
    const adhesionA = await tontineTurnsService.createAdhesion(tenantId, { periodId: period!.id, memberId: `MBR-${suffix}-A`, memberName: `Membre ${suffix}A`, joinedAt: '2026-10-01' });
    const adhesionB = await tontineTurnsService.createAdhesion(tenantId, { periodId: period!.id, memberId: `MBR-${suffix}-B`, memberName: `Membre ${suffix}B`, joinedAt: '2026-10-01' });
    const occurrence1 = await tontineTurnsService.createOccurrence(tenantId, { periodId: period!.id, occurrenceNumber: 1, plannedDate: '2026-10-05' });
    const occurrence2 = await tontineTurnsService.createOccurrence(tenantId, { periodId: period!.id, occurrenceNumber: 2, plannedDate: '2026-11-05' });
    const turn1 = (await tontineTurnsService.getTurnByOccurrence(tenantId, occurrence1!.id))!;
    const turn2 = (await tontineTurnsService.getTurnByOccurrence(tenantId, occurrence2!.id))!;
    const resultA = await tontineTurnsService.addBeneficiaries(tenantId, turn1.id, { adhesionIds: [adhesionA!.id], valueType: 'MONEY', expectedAmount: 500_000 });
    const resultB = await tontineTurnsService.addBeneficiaries(tenantId, turn2.id, { adhesionIds: [adhesionB!.id], valueType: 'MONEY', expectedAmount: 500_000 });
    const beneficiaryA = resultA!.created[0];
    const beneficiaryB = resultB!.created[0];
    return { tontine, period: period!, adhesionA: adhesionA!, adhesionB: adhesionB!, turn1, turn2, beneficiaryA, beneficiaryB };
  }

  it('TEST5/6 — le bénéficiaire planifié est retrouvé automatiquement par tour/occurrence, sans aucun tirage', async () => {
    const { turn1, beneficiaryA, adhesionA } = await setupTwoPlannedTurns('T-002', 'A');
    const beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn1.id);
    expect(beneficiaries.length).toBe(1);
    expect(beneficiaries[0].id).toBe(beneficiaryA.id);
    expect(beneficiaries[0].adhesionId).toBe(adhesionA.id);
  });

  it('TEST7 — une demande de permutation ne modifie rien tant qu\'elle n\'est pas approuvée', async () => {
    const { turn1, turn2, beneficiaryA, beneficiaryB } = await setupTwoPlannedTurns('T-002', 'B');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    expect(request).toBeDefined();
    expect(request!.status).toBe('pending');
    const turn1Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn1.id);
    const turn2Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn2.id);
    expect(turn1Beneficiaries[0].adhesionId).toBe(beneficiaryA.adhesionId);
    expect(turn2Beneficiaries[0].adhesionId).toBe(beneficiaryB.adhesionId);
  });

  it('TEST8 — un rejet laisse la planification inchangée', async () => {
    const { turn1, turn2, beneficiaryA, beneficiaryB } = await setupTwoPlannedTurns('T-002', 'C');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    const decided = await workflowService.submitAction('T-002', request!.id, 'reject', 'Approbateur');
    tontineTurnsService.applyTurnPermutationDecision('T-002', decided!);
    const turn1Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn1.id);
    const turn2Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn2.id);
    expect(turn1Beneficiaries[0].adhesionId).toBe(beneficiaryA.adhesionId);
    expect(turn2Beneficiaries[0].adhesionId).toBe(beneficiaryB.adhesionId);
  });

  it('TEST9/10 — une approbation échange atomiquement les deux adhésions (avant/après cohérent, aucun état intermédiaire possible)', async () => {
    const { turn1, turn2, beneficiaryA, beneficiaryB, adhesionA, adhesionB } = await setupTwoPlannedTurns('T-002', 'D');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    const decided = await workflowService.submitAction('T-002', request!.id, 'approve', 'Approbateur');
    tontineTurnsService.applyTurnPermutationDecision('T-002', decided!);
    const turn1Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn1.id);
    const turn2Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn2.id);
    // Échange complet : jamais les deux du même côté (ni les deux inchangés, ni les deux permutés vers le même adhésionId).
    expect(turn1Beneficiaries[0].adhesionId).toBe(adhesionB.id);
    expect(turn2Beneficiaries[0].adhesionId).toBe(adhesionA.id);
  });

  it('TEST11 — refuse la permutation si l\'un des deux tours est déjà clôturé', async () => {
    const { turn1, turn2, beneficiaryA, beneficiaryB } = await setupTwoPlannedTurns('T-002', 'E');
    await tontineTurnsService.recordReception('T-002', beneficiaryA.id, { amount: 500_000 });
    await tontineTurnsService.closeTurn('T-002', turn1.id);
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    expect(request).toBeUndefined();
    void turn2;
  });

  it('TEST12 — refuse une permutation entre deux tours de tontines différentes', async () => {
    const setupA = await setupTwoPlannedTurns('T-002', 'F1');
    const setupB = await setupTwoPlannedTurns('T-002', 'F2');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: setupA.beneficiaryA.id, turnBeneficiaryBId: setupB.beneficiaryA.id, requestedBy: 'Testeur' });
    expect(request).toBeUndefined();
  });

  it('TEST3 — refuse une permutation référençant un bénéficiaire d\'un autre tenant', async () => {
    const setupT002 = await setupTwoPlannedTurns('T-002', 'G');
    const setupT005 = await setupTwoPlannedTurns('T-005', 'H');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: setupT002.beneficiaryA.id, turnBeneficiaryBId: setupT005.beneficiaryA.id, requestedBy: 'Testeur' });
    expect(request).toBeUndefined();
  });

  it('TEST13 — refuse un « doublon » : les deux côtés désignent le même bénéficiaire', async () => {
    const { beneficiaryA } = await setupTwoPlannedTurns('T-002', 'I');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryA.id, requestedBy: 'Testeur' });
    expect(request).toBeUndefined();
  });

  it('TEST14 — deux demandes concurrentes référençant le même bénéficiaire : la seconde est refusée tant que la première est en attente', async () => {
    const { beneficiaryA, beneficiaryB } = await setupTwoPlannedTurns('T-002', 'J');
    const other = await setupTwoPlannedTurns('T-002', 'J2');
    const first = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur 1' });
    expect(first).toBeDefined();
    const second = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: other.beneficiaryA.id, requestedBy: 'Testeur 2' });
    expect(second).toBeUndefined();
  });

  it('TEST15 — deux approbations successives sur la même demande n\'échangent pas deux fois (idempotence, pas de double-échange)', async () => {
    const { turn1, turn2, beneficiaryA, beneficiaryB, adhesionA, adhesionB } = await setupTwoPlannedTurns('T-002', 'K');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    const decided1 = await workflowService.submitAction('T-002', request!.id, 'approve', 'Approbateur 1');
    tontineTurnsService.applyTurnPermutationDecision('T-002', decided1!);
    const decided2 = await workflowService.submitAction('T-002', request!.id, 'approve', 'Approbateur 2');
    tontineTurnsService.applyTurnPermutationDecision('T-002', decided2!);
    const turn1Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn1.id);
    const turn2Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn2.id);
    expect(turn1Beneficiaries[0].adhesionId).toBe(adhesionB.id);
    expect(turn2Beneficiaries[0].adhesionId).toBe(adhesionA.id);
  });

  it('TEST16 — comme le reste du service, requestTurnPermutation/applyTurnPermutationDecision ne reçoivent ni ne consultent currentUser/can() (RBAC uniquement côté UI)', async () => {
    const { beneficiaryA, beneficiaryB } = await setupTwoPlannedTurns('T-002', 'L');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    expect(request).toBeDefined();
  });

  it('TEST18 — l\'historique de permutation est retrouvable pour les deux adhésions concernées, avec avant/après cohérent', async () => {
    const { beneficiaryA, beneficiaryB, adhesionA, adhesionB } = await setupTwoPlannedTurns('T-002', 'M');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    const decided = await workflowService.submitAction('T-002', request!.id, 'approve', 'Approbateur');
    tontineTurnsService.applyTurnPermutationDecision('T-002', decided!);
    const historyA = await tontineTurnsService.listPermutationHistoryForAdhesion('T-002', adhesionA.id);
    const historyB = await tontineTurnsService.listPermutationHistoryForAdhesion('T-002', adhesionB.id);
    expect(historyA.length).toBe(1);
    expect(historyB.length).toBe(1);
    expect(historyA[0].id).toBe(historyB[0].id);
    expect(historyA[0].context?.adhesionId).toBe(adhesionA.id);
    expect(historyA[0].context?.otherAdhesionId).toBe(adhesionB.id);
  });

  it('n\'échange rien si l\'une des deux réceptions a déjà été enregistrée avant l\'approbation (intégrité de l\'historique financier)', async () => {
    const { turn1, turn2, beneficiaryA, beneficiaryB, adhesionA, adhesionB } = await setupTwoPlannedTurns('T-002', 'N');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    await tontineTurnsService.recordReception('T-002', beneficiaryA.id, { amount: 100_000 });
    const decided = await workflowService.submitAction('T-002', request!.id, 'approve', 'Approbateur');
    tontineTurnsService.applyTurnPermutationDecision('T-002', decided!);
    const turn1Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn1.id);
    const turn2Beneficiaries = await tontineTurnsService.listBeneficiariesByTurn('T-002', turn2.id);
    expect(turn1Beneficiaries[0].adhesionId).toBe(adhesionA.id);
    expect(turn2Beneficiaries[0].adhesionId).toBe(adhesionB.id);
  });

  it('T9/T10 (photos) — getTurnPermutationPreview reconstruit les deux côtés (tour, nom, photo) pour l\'écran générique de validation', async () => {
    const { turn1, turn2, beneficiaryA, beneficiaryB } = await setupTwoPlannedTurns('T-002', 'O');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    const preview = await tontineTurnsService.getTurnPermutationPreview('T-002', request!.id);
    expect(preview?.a.turnNumber).toBe(turn1.turnNumber);
    expect(preview?.b.turnNumber).toBe(turn2.turnNumber);
    expect(preview?.a.memberName).toContain('Membre O');
    expect(preview?.b.memberName).toContain('Membre O');
    // Régression (audit) : `turnId` doit être porté par les deux côtés — c'est la clé
    // manquante qui empêchait `WorkflowDetail` d'invalider `['tontines','turn-beneficiaries',
    // turnId, tenantId]` après approbation, laissant `TurnDetail` afficher l'ancien
    // bénéficiaire jusqu'à expiration du `staleTime` (30s).
    expect(preview?.a.turnId).toBe(turn1.id);
    expect(preview?.b.turnId).toBe(turn2.id);
  });

  it('getTurnPermutationPreview retourne undefined pour un workflowRequestId inconnu ou d\'un autre tenant (isolation)', async () => {
    const { beneficiaryA, beneficiaryB } = await setupTwoPlannedTurns('T-002', 'P');
    const request = await tontineTurnsService.requestTurnPermutation('T-002', { turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id, requestedBy: 'Testeur' });
    expect(await tontineTurnsService.getTurnPermutationPreview('T-002', 'WR-DOES-NOT-EXIST')).toBeNull();
    expect(await tontineTurnsService.getTurnPermutationPreview('T-005', request!.id)).toBeNull();
  });
});
