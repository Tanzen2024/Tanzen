import { describe, it, expect } from 'vitest';
import { tontineTurnsService } from './tontine-turns.service';

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
    const created = await tontineTurnsService.createAdhesion('T-002', { tontineId: 'TON-001', memberId: 'M-002', memberName: 'Mamadou Sow', joinedAt: '2026-08-18' });
    expect(created?.status).toBe('active');
    expect(created?.tenantId).toBe('T-002');
    const listed = await tontineTurnsService.listAdhesionsByTontine('T-002', 'TON-001');
    expect(listed.some((item) => item.id === created?.id)).toBe(true);
  });

  it('allows multiple adhesions for the same member on the same tontine (D-TON-04-08, no cardinality limit)', async () => {
    const before = await tontineTurnsService.listAdhesionsByMember('T-002', 'M-001');
    await tontineTurnsService.createAdhesion('T-002', { tontineId: 'TON-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', joinedAt: '2026-08-18' });
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
