import { describe, it, expect } from 'vitest';
import { tontinesService } from './tontines.service';
import { permissionCatalog } from '@/mocks/rbac.mocks';
import { tontineOccurrences } from '@/mocks/tontines/tontines';

describe('tontinesService — Tontine CRUD', () => {
  it('ALLOW: listTontines returns only tontines of the requesting tenant', async () => {
    const result = await tontinesService.listTontines('T-002');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((tontine) => tontine.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: getTontine returns null for a tontine of another tenant', async () => {
    const [t001, t002] = await Promise.all([tontinesService.listTontines('T-001'), tontinesService.listTontines('T-002')]);
    expect(t002.length).toBeGreaterThan(0);
    const result = await tontinesService.getTontine('T-001', t002[0].id);
    expect(result).toBeNull();
    expect(t001.some((item) => item.id === t002[0].id)).toBe(false);
  });

  it('ALLOW: creates a MONEY tontine — currency is resolved from organization settings, never from the caller', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Tontine ${Date.now()}`, valueType: 'MONEY', contributionAmount: 20_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, withPurchase: false } as never);
    expect(tontine).toBeTruthy();
    expect(tontine?.currency).toBe('XOF');
  });

  it('DENY: any currency passed by the caller is ignored — the organization currency always wins', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Tontine ${Date.now()}`, valueType: 'MONEY', contributionAmount: 20_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, withPurchase: false, currency: 'USD' } as never);
    expect(tontine?.currency).toBe('XOF');
  });

  it('DENY: a Tontine has no `startDate` property at all — the Tontine carries rules, never a date (mandat suppression startDate)', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test No StartDate ${Date.now()}`, valueType: 'MONEY', contributionAmount: 20_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5 } as never);
    expect('startDate' in (tontine as object)).toBe(false);
    // Même en passant explicitement un `startDate` à la création — le champ n'existe pas dans `TontineInput`, il est donc ignoré silencieusement par le typage, jamais stocké.
    const tontineWithAttempt = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Attempted StartDate ${Date.now()}`, valueType: 'MONEY', contributionAmount: 20_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, startDate: '2026-01-01' } as never);
    expect('startDate' in (tontineWithAttempt as object)).toBe(false);
  });

  it('DENY: creating a Tontine never auto-creates a first Tour — Tours are always created progressively, one manual act at a time', async () => {
    const before = tontineOccurrences.length;
    await tontinesService.createTontine({ tenantId: 'T-001', name: `Test No Auto Tour ${Date.now()}`, valueType: 'MONEY', contributionAmount: 20_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5 } as never);
    expect(tontineOccurrences.length).toBe(before);
  });

  it('DENY: a MONEY tontine without a strictly positive contributionAmount is refused', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Tontine ${Date.now()}`, valueType: 'MONEY', contributionAmount: 0, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5 } as never);
    expect(tontine).toBeNull();
  });

  it('DENY: an incomplete frequency configuration is refused', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Tontine ${Date.now()}`, valueType: 'MONEY', contributionAmount: 10_000, frequency: 'WEEKLY' } as never);
    expect(tontine).toBeNull();
  });

  it('ALLOW: « Avec achat » ON resolves and stores the tenant’s « Achat tontine » purchase account automatically', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Avec Achat ${Date.now()}`, valueType: 'MONEY', contributionAmount: 15_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 10, withPurchase: true } as never);
    expect(tontine?.withPurchase).toBe(true);
    expect(tontine?.purchaseAccountId).toBe('AC-015');
  });

  it('ALLOW: « Avec achat » OFF never associates a purchase account', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Sans Achat ${Date.now()}`, valueType: 'MONEY', contributionAmount: 15_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 10, withPurchase: false } as never);
    expect(tontine?.withPurchase).toBe(false);
    expect(tontine?.purchaseAccountId).toBeUndefined();
  });

  it('ALLOW: creates a GOODS tontine without any currency/withPurchase field', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-002', name: `Test Nature ${Date.now()}`, valueType: 'GOODS', item: 'Sac de riz', quantity: 3, unit: 'SAC', frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    expect(tontine).toBeTruthy();
    expect(tontine?.currency).toBeUndefined();
    expect(tontine?.withPurchase).toBeUndefined();
  });

  it('DENY: updateTontine never accepts a currency field, even if one is passed', async () => {
    const created = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Update ${Date.now()}`, valueType: 'MONEY', contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    const updated = await tontinesService.updateTontine('T-001', created!.id, { currency: 'EUR' } as never);
    expect(updated?.currency).toBe('XOF');
  });

  it('ALLOW: toggling withPurchase ON via update resolves the purchase account', async () => {
    const created = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Toggle ${Date.now()}`, valueType: 'MONEY', contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: false } as never);
    expect(created?.purchaseAccountId).toBeUndefined();
    const updated = await tontinesService.updateTontine('T-001', created!.id, { withPurchase: true });
    expect(updated?.purchaseAccountId).toBe('AC-015');
  });
});

/** Chaque test crée sa propre Tontine plutôt que de réutiliser TON-004 (seed partagé) — évite tout épuisement des membres actifs disponibles / toute interférence entre tests. */
async function freshTontine(tenantId: string) {
  return tontinesService.createTontine({ tenantId, name: `Test Adhesions ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
}

describe('tontinesService — Adhesions (rattachées directement à la Tontine)', () => {
  it('ALLOW: addAdhesion attaches a member directly to the tontine, with tontineId (no Period in between)', async () => {
    const tontine = await freshTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    expect(adhesion).toBeTruthy();
    expect(adhesion?.tontineId).toBe(tontine!.id);
    expect(adhesion?.status).toBe('active');
  });

  it('DENY: addAdhesion refuses a member already an active adherent of this tontine', async () => {
    const tontine = await freshTontine('T-001');
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-02');
    const second = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-03');
    expect(second).toBeNull();
  });

  it('DENY: listAdhesions of a tenant never leaks another tenant’s adhesions', async () => {
    const tontine = await freshTontine('T-001');
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const result = await tontinesService.listAdhesions('T-002', tontine!.id);
    expect(result).toEqual([]);
  });

  it('ALLOW: closeAdhesion is a logical closure (UPDATE), never a deletion — history remains readable', async () => {
    const tontine = await freshTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
    const closed = await tontinesService.closeAdhesion('T-001', adhesion!.id, '2026-09-10');
    expect(closed?.status).toBe('exited');
    expect(closed?.leftAt).toBe('2026-09-10');
    const stillReadable = await tontinesService.getAdhesion('T-001', adhesion!.id);
    expect(stillReadable?.id).toBe(adhesion!.id);
  });

  it('DENY: closeAdhesion refuses a double closure', async () => {
    const tontine = await freshTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-05');
    await tontinesService.closeAdhesion('T-001', adhesion!.id, '2026-09-20');
    const secondClose = await tontinesService.closeAdhesion('T-001', adhesion!.id, '2026-09-25');
    expect(secondClose).toBeNull();
  });
});

describe('RBAC — legacy Cycle/Draw keys removed, no duplicated new keys', () => {
  it('DENY: the permission catalog no longer contains any cycles.*/draws.* key', () => {
    expect(permissionCatalog.some((permission) => permission.startsWith('cycles.') || permission.startsWith('draws.'))).toBe(false);
  });
  it('ALLOW: the permission catalog still exposes the generic keys reused by the rebuilt Tontines module', () => {
    expect(permissionCatalog).toEqual(expect.arrayContaining(['tontines.read', 'tontines.create', 'tontines.update', 'beneficiaries.manage', 'adhesions.read', 'adhesions.manage', 'contributions.manage']));
  });
});
