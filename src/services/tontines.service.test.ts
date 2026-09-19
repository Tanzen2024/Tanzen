import { describe, it, expect } from 'vitest';
import { tontinesService } from './tontines.service';
import { settingsService } from './settings.service';
import { permissionCatalog } from '@/mocks/rbac.mocks';
import { tontineOccurrences, tontines, tontineAdhesions } from '@/mocks/tontines/tontines';
import { fiscalYears } from '@/mocks/settings/fiscal-years';

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

  it('ALLOW: a member can hold SEVERAL distinct representations in the SAME tontine (mandat « finalisation ajout multiple » §1/§2) — never blocked by an existing active adhesion', async () => {
    const tontine = await freshTontine('T-001');
    const first = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-02');
    const second = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-03');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second?.id).not.toBe(first?.id); // deux représentations distinctes, identifiées par leur propre id
    expect(second?.memberId).toBe(first?.memberId);
    expect(second?.status).toBe('active');
    const adhesions = await tontinesService.listAdhesions('T-001', tontine!.id);
    expect(adhesions).toHaveLength(2);
    expect(adhesions.every((item) => item.memberId === 'M-001' && item.tontineId === tontine!.id)).toBe(true);
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

  it('DENY: addAdhesion refuses a member belonging to a DIFFERENT tenant — never affiliates across tenants', async () => {
    const tontine = await freshTontine('T-001');
    const foreignMemberAdhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-009', '2026-09-01'); // M-009 appartient à T-002
    expect(foreignMemberAdhesion).toBeNull();
    const adhesions = await tontinesService.listAdhesions('T-001', tontine!.id);
    expect(adhesions).toHaveLength(0);
  });

  it('ALLOW: a member can belong to SEVERAL different tontines simultaneously (mandat §1) — appartenance évaluée par Tontine, jamais globalement', async () => {
    const tontineA = await freshTontine('T-001');
    const tontineB = await freshTontine('T-001');
    const tontineC = await freshTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontineA!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontineB!.id, 'M-001', '2026-09-01');
    const adhesionC = await tontinesService.addAdhesion('T-001', tontineC!.id, 'M-001', '2026-09-01');
    expect(adhesionA).toBeTruthy();
    expect(adhesionB).toBeTruthy();
    expect(adhesionC).toBeTruthy();
    expect(new Set([adhesionA!.id, adhesionB!.id, adhesionC!.id]).size).toBe(3);
    // listAdhesionsByMember n'est pas scopée à une Tontine précise — vérifier ici uniquement que CES trois adhésions y figurent bien, sans présumer que ce soient les seules du membre sur l'ensemble du tenant (d'autres tests créent aussi des adhésions pour M-001).
    const byMember = await tontinesService.listAdhesionsByMember('T-001', 'M-001');
    const byMemberIds = byMember.map((item) => item.id);
    expect(byMemberIds).toEqual(expect.arrayContaining([adhesionA!.id, adhesionB!.id, adhesionC!.id]));
  });
});

describe('tontinesService — addAdhesions (ajout multiple, retour structuré, mandat « finalisation ajout multiple »)', () => {
  it('ALLOW: 10 membres sélectionnés / 10 créés — le résultat structuré reflète exactement ce nombre, jamais déduit de la longueur de l’entrée', async () => {
    const tontine = await freshTontine('T-001');
    const memberIds = ['M-001', 'M-006', 'M-016', 'M-018', 'M-001', 'M-006', 'M-016', 'M-018', 'M-001', 'M-006']; // 10 entrées, membres valides de T-001 (répétés — chacun crée sa propre représentation, cf. describe suivant)
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, memberIds, '2026-09-01');
    expect(created).toHaveLength(10);
    expect(skipped).toBe(0);
    expect(created.every((item) => item.tontineId === tontine!.id && item.status === 'active')).toBe(true);
    const adhesions = await tontinesService.listAdhesions('T-001', tontine!.id);
    expect(adhesions).toHaveLength(10);
  });

  it('ALLOW: adding a single member via the batch method behaves exactly like addAdhesion (mandat §21 — one interface covers both cases)', async () => {
    const tontine = await freshTontine('T-001');
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, ['M-001'], '2026-09-01');
    expect(created).toHaveLength(1);
    expect(skipped).toBe(0);
    expect(created[0].memberId).toBe('M-001');
  });

  it('ALLOW: repeating the same memberId within one batch call creates ONE representation PER occurrence — never deduplicated (mandat §1/§2/§19, la clé d’unicité n’est plus memberId+tontineId)', async () => {
    const tontine = await freshTontine('T-001');
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, ['M-001', 'M-001', 'M-001'], '2026-09-01');
    expect(created).toHaveLength(3);
    expect(skipped).toBe(0);
    expect(new Set(created.map((item) => item.id)).size).toBe(3); // trois représentations distinctes, jamais le même id
    expect(created.every((item) => item.memberId === 'M-001')).toBe(true);
    const adhesions = await tontinesService.listAdhesions('T-001', tontine!.id);
    expect(adhesions).toHaveLength(3);
  });

  it('ALLOW: a member already an active adherent of this tontine can still receive an additional representation via the batch — coexists with new members in the same call', async () => {
    const tontine = await freshTontine('T-001');
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-08-01');
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, ['M-001', 'M-006'], '2026-09-01');
    expect(created).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(created.map((item) => item.memberId).sort()).toEqual(['M-001', 'M-006']);
    const adhesions = await tontinesService.listAdhesions('T-001', tontine!.id);
    expect(adhesions.filter((item) => item.memberId === 'M-001')).toHaveLength(2); // la préexistante + la nouvelle représentation
  });

  it('DENY (partiel) : 10 demandés / 8 créés / 2 ignorés — le résultat structuré distingue les deux, jamais un succès global trompeur', async () => {
    const tontine = await freshTontine('T-001');
    const memberIds = ['M-001', 'M-006', 'M-016', 'M-018', 'M-001', 'M-006', 'M-016', 'M-018', 'M-DOES-NOT-EXIST', 'M-009']; // 8 valides (T-001) + 1 inexistant + 1 d'un autre tenant (T-002)
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, memberIds, '2026-09-01');
    expect(created).toHaveLength(8);
    expect(skipped).toBe(2);
  });

  it('DENY: a member belonging to a DIFFERENT tenant is skipped — never affiliates across tenants, even mixed with valid members', async () => {
    const tontine = await freshTontine('T-001');
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, ['M-001', 'M-009'], '2026-09-01'); // M-009 appartient à T-002
    expect(created).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(created[0].memberId).toBe('M-001');
    const adhesions = await tontinesService.listAdhesions('T-001', tontine!.id);
    expect(adhesions.some((item) => item.memberId === 'M-009')).toBe(false);
  });

  it('DENY (total) : 10 demandés / 0 créé — jamais un faux succès, le résultat structuré porte les 10 échecs', async () => {
    const tontine = await freshTontine('T-001');
    const memberIds = Array.from({ length: 10 }, (_, index) => `M-DOES-NOT-EXIST-${index}`);
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, memberIds, '2026-09-01');
    expect(created).toHaveLength(0);
    expect(skipped).toBe(10);
  });

  it('DENY: addAdhesions refuses a tontine belonging to a DIFFERENT tenant — returns an all-skipped result, never leaks/creates across tenants', async () => {
    const tontine = await freshTontine('T-002');
    const { created, skipped } = await tontinesService.addAdhesions('T-001', tontine!.id, ['M-001'], '2026-09-01');
    expect(created).toHaveLength(0);
    expect(skipped).toBe(1);
    const adhesions = await tontinesService.listAdhesions('T-002', tontine!.id);
    expect(adhesions).toHaveLength(0);
  });
});

describe('tontinesService — Continuité fiscale (Tontine/Adhésion ne dépendent d’aucun Exercice fiscal)', () => {
  it('ALLOW: an adhesion stays active and readable across a fiscal year close — no new Tontine/Adhesion is auto-created', async () => {
    const tontine = await freshTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    expect(adhesion?.status).toBe('active');
    expect('fiscalYearId' in (tontine as object)).toBe(false);
    expect('fiscalYearId' in (adhesion as object)).toBe(false);

    const tontineCountBefore = tontines.filter((item) => item.tenantId === 'T-001').length;
    const adhesionCountBefore = tontineAdhesions.filter((item) => item.tenantId === 'T-001').length;
    const currentYearBefore = fiscalYears.find((item) => item.tenantId === 'T-001' && item.isCurrent);
    expect(currentYearBefore?.status).toBe('open');

    const outcome = await settingsService.closeCurrentFiscalYear('T-001');
    expect(outcome.ok).toBe(true);
    const closedYear = fiscalYears.find((item) => item.id === currentYearBefore!.id);
    expect(closedYear?.status).toBe('closed');
    expect(fiscalYears.some((item) => item.tenantId === 'T-001' && item.isCurrent)).toBe(false); // aucune succession automatique

    // La même relation Membre ↔ Tontine reste valide, sans duplication ni recréation.
    const stillReadable = await tontinesService.getAdhesion('T-001', adhesion!.id);
    expect(stillReadable?.status).toBe('active');
    expect(stillReadable?.tontineId).toBe(tontine!.id);
    expect(tontines.filter((item) => item.tenantId === 'T-001').length).toBe(tontineCountBefore);
    expect(tontineAdhesions.filter((item) => item.tenantId === 'T-001').length).toBe(adhesionCountBefore);
    const stillReadableTontine = await tontinesService.getTontine('T-001', tontine!.id);
    expect(stillReadableTontine?.status).toBe('statusActive');
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
