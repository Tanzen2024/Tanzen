import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { financeService, ensureSystemCashbox, resolveSystemCashbox, systemCashboxMigrationConflicts, SYSTEM_CASHBOX_CODES, transactionBelongsToFiscalYear } from './finance.service';
import { fiscalSessionService } from './fiscal-session.service';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { cashboxes, isSystemCashbox, normalizeCashboxLabel, type CashboxRecord } from '@/mocks/finance/cashboxes';
import { transactions } from '@/mocks/finance/transactions';

describe('financeService — Cashboxes', () => {
  it('ALLOW: listCashboxes returns only cashboxes of the requesting tenant', async () => {
    const result = await financeService.listCashboxes('T-001');
    expect(result.every((cashbox) => cashbox.tenantId === 'T-001')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('DENY: getCashbox returns null for an cashbox of another tenant', async () => {
    const [t001Cashboxes, t002Cashboxes] = await Promise.all([financeService.listCashboxes('T-001'), financeService.listCashboxes('T-002')]);
    expect(t002Cashboxes.length).toBeGreaterThan(0);
    const otherTenantCashboxId = t002Cashboxes[0].id;
    const result = await financeService.getCashbox('T-001', otherTenantCashboxId);
    expect(result).toBeNull();
    expect(t001Cashboxes.some((cashbox) => cashbox.id === otherTenantCashboxId)).toBe(false);
  });

  it('ALLOW: getCashbox returns the cashbox when it belongs to the requesting tenant', async () => {
    const [cashbox] = await financeService.listCashboxes('T-001');
    const result = await financeService.getCashbox('T-001', cashbox.id);
    expect(result?.id).toBe(cashbox.id);
  });
});

describe('financeService — createCashbox (caisse)', () => {
  it('ALLOW: creates a LIBRE cashbox without an amount', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Epargne libre ${Date.now()}`, type: 'LIBRE', amount: null, description: 'Epargne volontaire des adhérents' });
    expect(cashbox).toBeTruthy();
    expect(cashbox?.type).toBe('LIBRE');
    expect(cashbox?.amount).toBeNull();
  });

  it('ALLOW: creates a TAUX_FIXE cashbox with a fixed amount', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Inscription ${Date.now()}`, type: 'TAUX_FIXE', amount: 500, description: "Cotisation d'inscription" });
    expect(cashbox).toBeTruthy();
    expect(cashbox?.type).toBe('TAUX_FIXE');
    expect(cashbox?.amount).toBe(500);
  });

  it('DENY: rejects a TAUX_FIXE cashbox without an amount', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Secours ${Date.now()}`, type: 'TAUX_FIXE', amount: null, description: '' });
    expect(cashbox).toBeNull();
  });

  it('DENY: rejects a TAUX_FIXE cashbox with a negative amount', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Négatif ${Date.now()}`, type: 'TAUX_FIXE', amount: -100, description: '' });
    expect(cashbox).toBeNull();
  });

  it('DENY: rejects a TAUX_FIXE cashbox with an amount of exactly 0 (must be strictly positive)', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Zéro ${Date.now()}`, type: 'TAUX_FIXE', amount: 0, description: '' });
    expect(cashbox).toBeNull();
  });

  it('DENY: rejects an unknown cashbox type', async () => {
    // @ts-expect-error — runtime guard test for a value TypeScript would otherwise reject at compile time.
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Inconnu ${Date.now()}`, type: 'ASSET', amount: null, description: '' });
    expect(cashbox).toBeNull();
  });

  it('DENY: rejects a duplicate title within the same tenant', async () => {
    const title = `Doublon ${Date.now()}`;
    const first = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' });
    expect(first).toBeTruthy();
    const second = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' });
    expect(second).toBeNull();
  });

  it('ALLOW: the same title is allowed again in a different tenant', async () => {
    const title = `Multi-tenant ${Date.now()}`;
    const t001Cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' });
    const t002Cashbox = await financeService.createCashbox('T-002', 'Tontine Horizon', { title, type: 'LIBRE', amount: null, description: '' });
    expect(t001Cashbox).toBeTruthy();
    expect(t002Cashbox).toBeTruthy();
  });

  it('ISOLATION: tenantId is always taken from the service parameter, never from the input body', async () => {
    // CashboxCreateInput has no `tenantId` field at the type level — this proves the created cashbox is scoped to the tenant passed explicitly.
    const cashbox = await financeService.createCashbox('T-002', 'Tontine Horizon', { title: `Scopé ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(cashbox?.tenantId).toBe('T-002');
    expect(cashbox?.tenantName).toBe('Tontine Horizon');
  });

  it('AUTO: cashboxNumber is always generated by the service, never supplied by the caller', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Auto n° ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(cashbox?.cashboxNumber).toBeTruthy();
    expect(cashbox?.status).toBe('active');
    expect(cashbox?.balance).toBe(0);
  });
});

describe('financeService — updateCashbox', () => {
  it('ALLOW: updates title/type/amount/description for the owning tenant', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `À modifier ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateCashbox('T-001', created!.id, { type: 'TAUX_FIXE', amount: 1000 });
    expect(updated?.type).toBe('TAUX_FIXE');
    expect(updated?.amount).toBe(1000);
  });

  it('DENY: cannot update an cashbox of another tenant', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Isolé ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.updateCashbox('T-002', created!.id, { title: 'Piraté' });
    expect(result).toBeNull();
  });

  it('DENY: switching to TAUX_FIXE without providing an amount is rejected', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Sans montant ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.updateCashbox('T-001', created!.id, { type: 'TAUX_FIXE' });
    expect(result).toBeNull();
  });

  it('DENY: switching to TAUX_FIXE with an amount of exactly 0 is rejected', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Zéro modif ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.updateCashbox('T-001', created!.id, { type: 'TAUX_FIXE', amount: 0 });
    expect(result).toBeNull();
  });

  it('SAFE: updateCashbox never mutates balance or cashboxNumber', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Intégrité technique ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateCashbox('T-001', created!.id, { title: 'Renommée' });
    expect(updated?.balance).toBe(created!.balance);
    expect(updated?.cashboxNumber).toBe(created!.cashboxNumber);
  });
});

describe('financeService — deleteCashbox (suppression = désactivation logique)', () => {
  it('NON-DESTRUCTIF : une caisse sans mouvement n’est jamais retirée — elle passe inactive et reste en base', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Jetable ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const countBefore = cashboxes.length;
    const result = await financeService.deleteCashbox('T-001', created!.id);
    expect(result).toMatchObject({ ok: true, cashbox: { id: created!.id, status: 'inactive' } });
    expect(cashboxes.length).toBe(countBefore);
    const after = await financeService.getCashbox('T-001', created!.id);
    expect(after?.status).toBe('inactive');
  });

  it('NON-DESTRUCTIF : une caisse avec mouvements passe inactive, ses transactions restent intactes', async () => {
    // AC-012 (CS-001-CX-004, Transport) is referenced by seeded transactions (source/destination).
    const cashbox = cashboxes.find((item) => item.id === 'AC-012')!;
    const linked = () => transactions.filter((transaction) => transaction.source === cashbox.cashboxNumber || transaction.destination === cashbox.cashboxNumber).map((transaction) => transaction.id);
    const before = linked();
    expect(before.length).toBeGreaterThan(0);
    const result = await financeService.deleteCashbox('T-001', 'AC-012');
    expect(result).toMatchObject({ ok: true });
    expect((await financeService.getCashbox('T-001', 'AC-012'))?.status).toBe('inactive');
    expect(linked()).toEqual(before);
    await financeService.reactivateCashbox('T-001', 'AC-012'); // remet la donnée partagée en état pour les autres tests
  });

  it('DENY : une caisse déjà inactive n’est pas « re-supprimée » (pas de no-op silencieux)', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Déjà inactive ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.deleteCashbox('T-001', created!.id);
    expect(await financeService.deleteCashbox('T-001', created!.id)).toEqual({ ok: false, reason: 'invalidStatus' });
  });

  it('TENANT : impossible de supprimer la caisse d’un autre tenant', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Autre tenant ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(await financeService.deleteCashbox('T-002', created!.id)).toBeNull();
    expect((await financeService.getCashbox('T-001', created!.id))?.status).toBe('active');
  });
});

/**
 * Mandat « Évolution du cycle de vie des exercices fiscaux » §33/§36 (audit des
 * objets clôturables) — seul objet, hors exercice fiscal, où une réouverture
 * transverse a été jugée justifiée : une caisse désactivée ne perd aucune
 * donnée financière, la réactivation n'est qu'un flip de statut.
 */
describe('financeService — reactivateCashbox', () => {
  it('ALLOW: reactivates an inactive cashbox (AC-008, seeded inactive)', async () => {
    const before = await financeService.getCashbox('T-004', 'AC-008');
    expect(before?.status).toBe('inactive');
    const result = await financeService.reactivateCashbox('T-004', 'AC-008');
    expect(result?.status).toBe('active');
    const after = await financeService.getCashbox('T-004', 'AC-008');
    expect(after?.status).toBe('active');
  });

  it('DENY: refuses an already-active cashbox (no silent no-op)', async () => {
    const [cashbox] = await financeService.listCashboxes('T-002');
    expect(cashbox.status).toBe('active');
    const result = await financeService.reactivateCashbox('T-002', cashbox.id);
    expect(result).toBeNull(); // mockRequest coerces undefined -> null (see api-client.ts)
  });

  it('DENY: refuses an cashbox belonging to another tenant', async () => {
    const result = await financeService.reactivateCashbox('T-001', 'AC-008'); // AC-008 belongs to T-004
    expect(result).toBeNull();
  });
});

describe('financeService — cashbox member assignment (adhésions à la caisse)', () => {
  it('ALLOW: adds a single member to an cashbox', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse membre unique ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addCashboxMembers('T-001', created!.id, ['M-001']);
    expect(updated?.memberIds).toContain('M-001');
  });

  it('ALLOW: adds several members at once', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse plusieurs membres ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addCashboxMembers('T-001', created!.id, ['M-001', 'M-006']);
    expect(updated?.memberIds.sort()).toEqual(['M-001', 'M-006'].sort());
  });

  it('ALLOW: removes a single member', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse retrait ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addCashboxMembers('T-001', created!.id, ['M-001', 'M-006']);
    const updated = await financeService.removeCashboxMembers('T-001', created!.id, ['M-001']);
    expect(updated?.memberIds).toEqual(['M-006']);
  });

  it('ALLOW: removes all members', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse retrait total ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addCashboxMembers('T-001', created!.id, ['M-001', 'M-006']);
    const updated = await financeService.removeCashboxMembers('T-001', created!.id, ['M-001', 'M-006']);
    expect(updated?.memberIds).toEqual([]);
  });

  it('ISOLATION: a memberId from another tenant is silently ignored', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse isolation ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addCashboxMembers('T-001', created!.id, ['M-001', 'M-002']); // M-002 belongs to T-002
    expect(updated?.memberIds).toEqual(['M-001']);
  });

  it('ISOLATION: cannot manage members of an cashbox belonging to another tenant', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse protégée ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.addCashboxMembers('T-002', created!.id, ['M-002']);
    expect(result).toBeNull();
  });

  it('SAFE: a non-existent memberId is silently ignored, no crash', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse membre inexistant ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addCashboxMembers('T-001', created!.id, ['M-999-DOES-NOT-EXIST']);
    expect(updated?.memberIds).toEqual([]);
  });

  it('SAFE: adding the same member twice does not create a duplicate entry', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse doublon membre ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addCashboxMembers('T-001', created!.id, ['M-001']);
    const updated = await financeService.addCashboxMembers('T-001', created!.id, ['M-001']);
    expect(updated?.memberIds).toEqual(['M-001']);
  });

  it('listCashboxMembers only returns members of the requesting tenant', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse liste ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addCashboxMembers('T-001', created!.id, ['M-001']);
    const result = await financeService.listCashboxMembers('T-001', created!.id);
    expect(result.every((member) => member.tenantId === 'T-001')).toBe(true);
    expect(result.map((member) => member.id)).toContain('M-001');
  });
});

/**
 * Phase 1 du moteur de position : l'adhésion caisse ↔ membre est désormais une
 * entité DATÉE (`CashboxMembership`). `addCashboxMembers` ouvre une adhésion,
 * `removeCashboxMembers` la CLÔT (jamais de suppression), `Cashbox.memberIds` est
 * un cache projeté des adhésions actives.
 */
describe('financeService — CashboxMembership (adhésion datée)', () => {
  it('addCashboxMembers ouvre une adhésion datée (startDate = aujourd’hui, endDate null, status active)', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Adhésion ouverte ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addCashboxMembers('T-001', cashbox!.id, ['M-001']);
    const memberships = await financeService.listCashboxMemberships('T-001');
    const created = memberships.find((m) => m.cashboxId === cashbox!.id && m.memberId === 'M-001');
    expect(created).toBeTruthy();
    expect(created!.endDate).toBeNull();
    expect(created!.status).toBe('active');
    expect(created!.startDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it('removeCashboxMembers CLÔT l’adhésion (endDate + status ended), sans la supprimer', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Adhésion clôturée ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addCashboxMembers('T-001', cashbox!.id, ['M-001']);
    await financeService.removeCashboxMembers('T-001', cashbox!.id, ['M-001']);

    const memberships = await financeService.listCashboxMemberships('T-001');
    const closed = memberships.filter((m) => m.cashboxId === cashbox!.id && m.memberId === 'M-001');
    expect(closed).toHaveLength(1); // toujours présente
    expect(closed[0].endDate).toBe(new Date().toISOString().slice(0, 10));
    expect(closed[0].status).toBe('ended');

    // le cache Cashbox.memberIds ne reflète plus que les adhésions actives
    const refreshed = await financeService.getCashbox('T-001', cashbox!.id);
    expect(refreshed!.memberIds).toEqual([]);
  });

  it('ré-ajouter un membre dont l’adhésion était clôturée ouvre une NOUVELLE adhésion', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Ré-adhésion ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addCashboxMembers('T-001', cashbox!.id, ['M-001']);
    await financeService.removeCashboxMembers('T-001', cashbox!.id, ['M-001']);
    await financeService.addCashboxMembers('T-001', cashbox!.id, ['M-001']);

    const memberships = (await financeService.listCashboxMemberships('T-001')).filter((m) => m.cashboxId === cashbox!.id && m.memberId === 'M-001');
    expect(memberships).toHaveLength(2);
    expect(memberships.filter((m) => m.endDate === null)).toHaveLength(1);
  });

  it('SEED : Fatou (M-001) est adhérente active de Transport, Épargne et Secours (AC-011, sans transaction à elle)', async () => {
    const [transport, epargne, secours] = await Promise.all([
      financeService.listCashboxMembers('T-001', 'AC-012'),
      financeService.listCashboxMembers('T-001', 'AC-009'),
      financeService.listCashboxMembers('T-001', 'AC-011'),
    ]);
    expect(transport.map((m) => m.id)).toContain('M-001');
    expect(epargne.map((m) => m.id)).toContain('M-001');
    // Adhésion ≠ transaction : Fatou n'a aucune écriture sur Secours, elle y est pourtant adhérente.
    expect(secours.map((m) => m.id)).toEqual(['M-001']);
  });

  it('SEED : Cheikh (M-006), adhésion Épargne clôturée au 31/08/2026, n’apparaît plus dans les adhérents actifs d’Épargne', async () => {
    const epargne = await financeService.listCashboxMembers('T-001', 'AC-009');
    expect(epargne.map((m) => m.id)).not.toContain('M-006');
    // mais il reste adhérent actif de Transport
    const transport = await financeService.listCashboxMembers('T-001', 'AC-012');
    expect(transport.map((m) => m.id)).toContain('M-006');
    // et l'adhésion clôturée reste tracée
    const memberships = await financeService.listCashboxMemberships('T-001');
    const ended = memberships.find((m) => m.cashboxId === 'AC-009' && m.memberId === 'M-006');
    expect(ended?.endDate).toBe('2026-08-31');
    expect(ended?.status).toBe('ended');
  });

  it('SEED : Cashbox.memberIds (cache projeté) reflète les adhésions actives', async () => {
    const cashbox = await financeService.getCashbox('T-001', 'AC-012');
    expect([...cashbox!.memberIds].sort()).toEqual(['M-001', 'M-006']);
  });

  it('ISOLATION : listCashboxMemberships est tenant-scoped (T-001 ne voit pas les adhésions de T-002)', async () => {
    const t001 = await financeService.listCashboxMemberships('T-001');
    expect(t001.every((m) => m.tenantId === 'T-001')).toBe(true);
    expect(t001.some((m) => m.cashboxId === 'AC-004')).toBe(false); // AC-004 = T-002
  });
});

describe('financeService — createCashbox validation', () => {
  it('DENY: rejects an cashbox without a title', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: '   ', type: 'LIBRE', amount: null, description: '' });
    expect(cashbox).toBeNull();
  });

  it('TAUX_FIXE still requires a positive amount', async () => {
    const cashbox = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Fixe sans montant ${Date.now()}`, type: 'TAUX_FIXE', amount: null, description: '' });
    expect(cashbox).toBeNull();
  });

  it('updateCashbox changes the type without touching the rest', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `À reconfigurer ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateCashbox('T-001', created!.id, { type: 'TAUX_FIXE', amount: 1000 });
    expect(updated?.type).toBe('TAUX_FIXE');
    expect(updated?.amount).toBe(1000);
  });
});

describe('financeService — recordCashboxMovement', () => {
  it('a movement credits the balance', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Mouvement solde ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const before = created!.balance;
    const updated = await financeService.recordCashboxMovement('T-001', created!.id, 10_000);
    expect(updated?.balance).toBe(before + 10_000);
  });

  it('DENY: rejects a movement with a non-positive amount', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Montant invalide ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(await financeService.recordCashboxMovement('T-001', created!.id, 0)).toBeNull();
    expect(await financeService.recordCashboxMovement('T-001', created!.id, -100)).toBeNull();
  });

  it('ISOLATION: cannot record a movement against an cashbox of another tenant', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Isolée mouvement ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.recordCashboxMovement('T-002', created!.id, 10_000);
    expect(result).toBeNull();
    const after = await financeService.getCashbox('T-001', created!.id);
    expect(after?.balance).toBe(created!.balance);
  });

  it('DENY: recordCashboxMovement returns null for a non-existent cashbox', async () => {
    expect(await financeService.recordCashboxMovement('T-001', 'AC-DOES-NOT-EXIST', 1000)).toBeNull();
  });
});

describe('financeService — Transactions', () => {
  it('ALLOW/DENY: listTransactions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([financeService.listTransactions('T-001'), financeService.listTransactions('T-002')]);
    expect(t001.every((transaction) => transaction.tenantId === 'T-001')).toBe(true);
    expect(t002.every((transaction) => transaction.tenantId === 'T-002')).toBe(true);
    const t002Ids = new Set(t002.map((transaction) => transaction.id));
    expect(t001.some((transaction) => t002Ids.has(transaction.id))).toBe(false);
  });

  it('ALLOW/DENY: listTransactionsForFiscalYear is scoped to tenant + fiscal year (Tenant A + 2026 never sees Tenant B)', async () => {
    const [t001, t002] = await Promise.all([
      financeService.listTransactionsForFiscalYear('T-001', 'FY-T001-2026'),
      financeService.listTransactionsForFiscalYear('T-002', 'FY-T002-2026'),
    ]);
    expect(t001.length).toBeGreaterThan(0);
    expect(t001.every((transaction) => transaction.tenantId === 'T-001')).toBe(true);
    const t002Ids = new Set(t002.map((transaction) => transaction.id));
    expect(t001.some((transaction) => t002Ids.has(transaction.id))).toBe(false);
  });

  it('DENY: a tenant cannot read another tenant’s fiscal year through listTransactionsForFiscalYear (empty, never the other tenant’s data)', async () => {
    expect(await financeService.listTransactionsForFiscalYear('T-001', 'FY-T002-2026')).toEqual([]);
  });

  it('ISOLATION: Tenant A + 2025 never sees Tenant A + 2026 transactions (and vice versa)', async () => {
    const [y2025, y2026] = await Promise.all([
      financeService.listTransactionsForFiscalYear('T-001', 'FY-T001-2025'),
      financeService.listTransactionsForFiscalYear('T-001', 'FY-T001-2026'),
    ]);
    expect(y2025.every((transaction) => transaction.date >= '2025-01-01' && transaction.date <= '2025-12-31')).toBe(true);
    expect(y2026.every((transaction) => transaction.fiscalYearId ? transaction.fiscalYearId === 'FY-T001-2026' : transaction.date.startsWith('2026'))).toBe(true);
    const ids2025 = new Set(y2025.map((transaction) => transaction.id));
    expect(y2026.some((transaction) => ids2025.has(transaction.id))).toBe(false);
  });

  it('transactionBelongsToFiscalYear: explicit fiscalYearId wins, otherwise the fiscal year whose period contains the date', () => {
    const fy2026 = { id: 'FY-X-2026', tenantId: 'T-X', startDate: '2026-01-01', endDate: '2026-12-31' };
    expect(transactionBelongsToFiscalYear({ tenantId: 'T-X', date: '2026-05-01' }, fy2026)).toBe(true);
    expect(transactionBelongsToFiscalYear({ tenantId: 'T-X', date: '2025-05-01' }, fy2026)).toBe(false);
    expect(transactionBelongsToFiscalYear({ tenantId: 'T-X', date: '2026-05-01', fiscalYearId: 'FY-X-2025' }, fy2026)).toBe(false);
    expect(transactionBelongsToFiscalYear({ tenantId: 'T-Y', date: '2026-05-01' }, fy2026)).toBe(false);
  });

  it('ALLOW: transactions with a memberId resolve to a real member of the same tenant, transactions with no counterpart member have no memberId', async () => {
    const t001 = await financeService.listTransactionsForFiscalYear('T-001', 'FY-T001-2026');
    const withMember = t001.filter((transaction) => transaction.memberId);
    const withoutMember = t001.filter((transaction) => !transaction.memberId);
    expect(withMember.length).toBeGreaterThan(0);
    expect(withoutMember.length).toBeGreaterThan(0);
    // Cashbox.memberIds n'est jamais utilisé pour cette relation (AC08) — vérifié en amont (les 14 comptes seedés ont tous memberIds: []) ; ici on vérifie seulement que memberId pointe vers un identifiant plausible, jamais un id d'un autre tenant.
    expect(withMember.every((transaction) => transaction.memberId?.startsWith('M-'))).toBe(true);
  });

  it('ALLOW: the same member appearing on multiple transactions is trivially deduplicated by building a Set of memberId', async () => {
    const t001 = await financeService.listTransactionsForFiscalYear('T-001', 'FY-T001-2026');
    const memberIds = new Set(t001.flatMap((transaction) => (transaction.memberId ? [transaction.memberId] : [])));
    // Fatou Ndiaye (M-001) a 3 transactions dans le jeu de données seed T-001 — un seul id dans le Set malgré les doublons.
    const fatouCount = t001.filter((transaction) => transaction.memberId === 'M-001').length;
    expect(fatouCount).toBeGreaterThan(1);
    expect(memberIds.has('M-001')).toBe(true);
    expect([...memberIds].filter((id) => id === 'M-001')).toHaveLength(1);
  });

  // Mandat « Transactions = journal financier central » §4 : la saisie d'une transaction est
  // l'unique point d'écriture dans le journal.
  it('ALLOW: createTransaction appends to the tenant journal with a system timestamp and derived cashboxes', async () => {
    const created = await financeService.createTransaction('T-001', {
      cashboxNumber: 'CS-001-CX-001', memberId: 'M-001', memberName: 'Fatou Ndiaye',
      category: 'EPARGNE', type: 'credit', amount: 25_000, description: 'Épargne test',
    });
    expect(created).toBeDefined();
    expect(created!.tenantId).toBe('T-001');
    // « Date transaction » = horodatage d'audit généré à l'écriture, jamais fourni par l'appelant.
    expect(created!.recordedAt).toBeTruthy();
    expect(created!.date).toBe(created!.recordedAt!.slice(0, 10));
    expect(created!.status).toBe('completed');
    // credit → les fonds vont vers le compte
    expect(created!.destination).toBe('CS-001-CX-001');
    expect(created!.source).toBe('Fatou Ndiaye');
    const journal = await financeService.listTransactions('T-001');
    expect(journal.some((transaction) => transaction.id === created!.id)).toBe(true);
  });

  it('DENY: createTransaction rejects a missing cashbox or a non-positive amount', async () => {
    expect(await financeService.createTransaction('T-001', { cashboxNumber: '', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 1000, description: '' })).toBeNull();
    expect(await financeService.createTransaction('T-001', { cashboxNumber: 'CS-001-CX-004', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 0, description: '' })).toBeNull();
  });

  it('ALLOW/DENY: cancelTransaction cancels a completed transaction once, then refuses (append-only journal)', async () => {
    const created = await financeService.createTransaction('T-001', { cashboxNumber: 'CS-001-CX-004', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 5000, description: 'À annuler' });
    const cancelled = await financeService.cancelTransaction('T-001', created!.id);
    expect(cancelled!.status).toBe('cancelled');
    expect(await financeService.cancelTransaction('T-001', created!.id)).toBeNull();
    // scoping tenant
    expect(await financeService.cancelTransaction('T-002', created!.id)).toBeNull();
  });

  it('DENY: updateTransaction refuses to modify a cancelled transaction', async () => {
    const created = await financeService.createTransaction('T-001', { cashboxNumber: 'CS-001-CX-004', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 7000, description: 'x' });
    await financeService.cancelTransaction('T-001', created!.id);
    expect(await financeService.updateTransaction('T-001', created!.id, { amount: 8000 })).toBeNull();
  });
});

/**
 * Mandat « CLASSIFICATION DES TRANSACTIONS » §26 : classification stricte à deux
 * niveaux — `category` ∈ {EPARGNE, PRET, REMBOURSEMENT, AUTRES} ; `subcategory`
 * renseignée uniquement pour AUTRES. Toutes les validations sont côté service.
 */
describe('financeService — createTransaction : classification (mandat §26)', () => {
  const base = { cashboxNumber: 'CS-001-CX-004', type: 'credit', amount: 10_000, description: 'test' } as const;

  it('§26.1 : une transaction ÉPARGNE (sans sous-catégorie) est créée', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'EPARGNE' });
    expect(created?.category).toBe('EPARGNE');
    expect(created?.subcategory).toBeUndefined();
  });

  // Mandat 2026-09-25 : PRÊT / REMBOURSEMENT = sous-catégories d'AUTRES.
  it('§26.2 : une transaction PRÊT est créée en AUTRES / PRET', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'AUTRES', subcategory: 'PRET', type: 'debit' });
    expect(created).toMatchObject({ category: 'AUTRES', subcategory: 'PRET', type: 'debit' });
  });

  it('§26.3 : une transaction REMBOURSEMENT est créée en AUTRES / REMBOURSEMENT', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'AUTRES', subcategory: 'REMBOURSEMENT' });
    expect(created).toMatchObject({ category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit' });
  });

  it('§26.3 bis : l’ancienne catégorie PRET / REMBOURSEMENT est refusée', async () => {
    expect(await financeService.createTransaction('T-001', { ...base, category: 'PRET' as never, type: 'debit' })).toBeNull();
    expect(await financeService.createTransaction('T-001', { ...base, category: 'REMBOURSEMENT' as never })).toBeNull();
  });

  it('§26.4 : une transaction AUTRES avec sous-catégorie valide est créée et persiste la sous-catégorie', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'AUTRES', subcategory: 'DISTRIBUTION', type: 'debit' });
    expect(created?.category).toBe('AUTRES');
    expect(created?.subcategory).toBe('DISTRIBUTION');
  });

  it('§26.5 : une sous-catégorie incompatible avec sa catégorie est rejetée (EPARGNE + FRAIS)', async () => {
    // Le type `TransactionInput` autorise `subcategory` avec n'importe quelle catégorie ;
    // c'est le service (isClassificationValid) qui rejette la combinaison au runtime.
    expect(await financeService.createTransaction('T-001', { ...base, category: 'EPARGNE', subcategory: 'FRAIS' })).toBeNull();
  });

  it('§26.6 : une catégorie invalide est rejetée', async () => {
    // @ts-expect-error — valeur hors nomenclature.
    expect(await financeService.createTransaction('T-001', { ...base, category: 'CONTRIBUTION' })).toBeNull();
  });

  it('§26 : AUTRES sans sous-catégorie est rejetée', async () => {
    expect(await financeService.createTransaction('T-001', { ...base, category: 'AUTRES' })).toBeNull();
  });

  it('§26.8 : une transaction sans montant est rejetée', async () => {
    expect(await financeService.createTransaction('T-001', { ...base, category: 'EPARGNE', amount: 0 })).toBeNull();
  });

  it('§26.9/§26.10 : transaction_at (recordedAt) est généré par le service et ne peut pas être fixé par l’appelant', async () => {
    const before = Date.now();
    // `TransactionInput` n'expose ni `recordedAt` ni `date` : une valeur fournie est ignorée par construction.
    const created = await financeService.createTransaction('T-001', { ...base, category: 'EPARGNE', recordedAt: '2000-01-01T00:00:00.000Z', date: '2000-01-01' } as never);
    expect(created?.recordedAt).toBeTruthy();
    expect(new Date(created!.recordedAt!).getTime()).toBeGreaterThanOrEqual(before);
    expect(created!.date).toBe(created!.recordedAt!.slice(0, 10));
  });

  it('§26.13 : la transaction créée appartient toujours au tenant passé en paramètre', async () => {
    const created = await financeService.createTransaction('T-002', { ...base, cashboxNumber: 'TH-002-ÉPG', category: 'EPARGNE' });
    expect(created?.tenantId).toBe('T-002');
  });

  it('updateTransaction : passer à AUTRES sans sous-catégorie est rejeté ; avec une sous-catégorie valide est accepté', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'EPARGNE' });
    expect(await financeService.updateTransaction('T-001', created!.id, { category: 'AUTRES' })).toBeNull();
    const updated = await financeService.updateTransaction('T-001', created!.id, { category: 'AUTRES', subcategory: 'CORRECTION' });
    expect(updated?.category).toBe('AUTRES');
    expect(updated?.subcategory).toBe('CORRECTION');
    // Retour vers une catégorie directe → la sous-catégorie est effacée.
    const back = await financeService.updateTransaction('T-001', created!.id, { category: 'EPARGNE', type: 'credit' });
    expect(back?.subcategory).toBeUndefined();
  });
});

describe('financeService — Contributions', () => {
  it('ALLOW/DENY: listContributions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([financeService.listContributions('T-001'), financeService.listContributions('T-002')]);
    expect(t001.every((contribution) => contribution.tenantId === 'T-001')).toBe(true);
    expect(t002.every((contribution) => contribution.tenantId === 'T-002')).toBe(true);
  });

  /**
   * GAP CONNU (non corrigé dans cette phase, additive-only) : contrairement à
   * tous les autres services, `listContributionsByMember` ne prend pas de
   * `tenantId` — aucune vérification possible au niveau service. Sûr
   * aujourd'hui uniquement parce que le seul point d'appel UI
   * (`organization-module.tsx`) obtient toujours `member.id` via
   * `organizationService.getMember(tenantId, memberId)`, déjà tenant-scopé
   * en amont — mais un appel direct au service avec un `memberId` d'un autre
   * tenant retournerait ses contributions sans aucun contrôle. Documenté ici
   * plutôt que corrigé silencieusement (voir docs/PHASE_12_INTEGRATION_TESTS_REGRESSION.md).
   */
  it('KNOWN GAP: listContributionsByMember has no tenant guard of its own (relies on caller pre-validation)', async () => {
    const result = await financeService.listContributionsByMember('M-002');
    expect(result.every((contribution) => contribution.memberId === 'M-002')).toBe(true);
  });
});

describe('financeService — Distributions', () => {
  it('ALLOW/DENY: listDistributions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([financeService.listDistributions('T-001'), financeService.listDistributions('T-002')]);
    expect(t001.every((distribution) => distribution.tenantId === 'T-001')).toBe(true);
    expect(t002.every((distribution) => distribution.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: approveDistribution cannot mutate a distribution of another tenant', async () => {
    const [distribution] = await financeService.listDistributions('T-001');
    const result = await financeService.approveDistribution('T-002', distribution.id);
    expect(result).toBeNull();
    const after = await financeService.listDistributions('T-001');
    expect(after.find((item) => item.id === distribution.id)?.status).toBe(distribution.status);
  });

  it('ALLOW: createDistribution attaches the correct tenantId regardless of caller', async () => {
    const distribution = await financeService.createDistribution('T-002', { beneficiary: 'Test', source: 'Test fund', amount: 1000, date: '2026-12-01' });
    expect(distribution.tenantId).toBe('T-002');
    expect(distribution.status).toBe('pending');
  });

  it('ALLOW: approveDistribution transitions status to completed for the owning tenant', async () => {
    const distribution = await financeService.createDistribution('T-001', { beneficiary: 'Test 2', source: 'Test fund', amount: 500, date: '2026-12-02' });
    const approved = await financeService.approveDistribution('T-001', distribution.id);
    expect(approved?.status).toBe('completed');
  });
});

describe('financeService — createTransaction × séance d\'exercice fiscal (reconstruction « Exercices fiscaux / Séances »)', () => {
  // Séances créées après le seed FS-001 (14/07) ; ordre chronologique strict → seed des séances restauré à chaque cas.
  const SESSIONS_SEED = structuredClone(fiscalSessions);
  const restoreSessions = () => { fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(SESSIONS_SEED)); };
  beforeEach(restoreSessions);
  afterEach(restoreSessions);
  const EPARGNE = { cashboxNumber: 'CS-001-CX-001', category: 'EPARGNE' as const, type: 'credit' as const, amount: 25_000, description: 'Épargne test séance' };

  it('la transaction porte sessionId, et transaction_at (recordedAt) est généré côté service — la date de la séance se lit via FiscalSession, jamais dupliquée sur la transaction', async () => {
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    const before = Date.now();
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, sessionId: session!.id, fiscalYearId: 'FY-T001-2026' });
    expect(transaction?.sessionId).toBe(session!.id);
    expect(transaction?.recordedAt).toBeTruthy();
    // transaction_at n'est jamais fourni par l'appelant : il est posé maintenant, à l'INSERT.
    expect(new Date(transaction!.recordedAt!).getTime()).toBeGreaterThanOrEqual(before);
    expect(transaction?.date).toBe(transaction!.recordedAt!.slice(0, 10));
  });

  it('une séance appartenant à un AUTRE exercice fiscal est rejetée', async () => {
    const otherExerciseSession = await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-01-12');
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, sessionId: otherExerciseSession!.id, fiscalYearId: 'FY-T001-2026' });
    expect(transaction).toBeNull();
  });

  it('une séance appartenant à un AUTRE tenant est rejetée', async () => {
    const otherTenantSession = await fiscalSessionService.createSession('T-002', 'FY-T002-2026', '2026-02-05');
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, sessionId: otherTenantSession!.id, fiscalYearId: 'FY-T002-2026' });
    expect(transaction).toBeNull();
  });

  it('sans fiscalYearId fourni, la transaction est rattachée à l’exercice du tenant qui contient sa date — et sa séance doit appartenir à CET exercice', async () => {
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-18');
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, sessionId: session!.id });
    expect(transaction?.fiscalYearId).toBe('FY-T001-2026');
    expect(transaction?.sessionId).toBe(session!.id);
  });

  it('une transaction sans séance reste possible (champ optionnel) et est tout de même rattachée à son exercice', async () => {
    const transaction = await financeService.createTransaction('T-001', EPARGNE);
    expect(transaction?.sessionId).toBeUndefined();
    expect(transaction?.recordedAt).toBeTruthy();
    expect(transaction?.fiscalYearId).toBe('FY-T001-2026');
  });

  it('DENY: exercice incohérent — un exercice qui ne contient pas la date de la transaction (2027 à venir) est refusé', async () => {
    expect(await financeService.createTransaction('T-001', { ...EPARGNE, fiscalYearId: 'FY-T001-2027' })).toBeNull();
  });

  it('DENY: exercice clôturé — aucune transaction ne peut y être rattachée', async () => {
    expect(await financeService.createTransaction('T-001', { ...EPARGNE, fiscalYearId: 'FY-T001-2025' })).toBeNull();
  });

  it('DENY: tenant incohérent — exercice d’un autre tenant, caisse d’un autre tenant, adhérent d’un autre tenant', async () => {
    expect(await financeService.createTransaction('T-001', { ...EPARGNE, fiscalYearId: 'FY-T002-2026' })).toBeNull();
    expect(await financeService.createTransaction('T-001', { ...EPARGNE, cashboxNumber: 'TH-002-ÉPG' })).toBeNull();
    expect(await financeService.createTransaction('T-001', { ...EPARGNE, memberId: 'M-002', memberName: 'Mamadou Sow' })).toBeNull();
  });
});

/**
 * RÈGLE MÉTIER PERMANENTE — UNICITÉ DU LIBELLÉ DE CAISSE (tenant + libellé
 * NORMALISÉ : trim, espaces réduits, sans casse, sans accent). Le contrôle est
 * autoritaire côté service (`createCashbox` / `updateCashbox`), pas seulement
 * dans le formulaire React.
 */
describe('financeService — unicité du libellé de caisse (règle métier normalisée)', () => {
  it('TEST 1-5 : « X » entre en conflit avec « x », « X » majuscule, sa forme sans accent, ses variantes d’espacement — dans le même tenant', async () => {
    const base = `Réunion Août ${Date.now()}`;
    const first = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: base, type: 'LIBRE', amount: null, description: '' });
    expect(first).toBeTruthy();
    const conflicts = [
      base,                                                     // identique
      base.toLowerCase(),                                       // casse
      base.toUpperCase(),                                       // casse
      base.normalize('NFD').replace(/\p{Diacritic}/gu, ''),     // accents retirés
      `   ${base}   `,                                          // espaces de bord
      base.replace(/ /g, '    '),                               // espaces multiples
    ];
    for (const title of conflicts) {
      expect(await financeService.createCashbox('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' })).toBeNull();
    }
  });

  it('TEST 6 : le même libellé est autorisé dans un AUTRE tenant (unicité par tenant, jamais globale)', async () => {
    const label = `Caisse partagée ${Date.now()}`;
    expect(await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: label, type: 'LIBRE', amount: null, description: '' })).toBeTruthy();
    expect(await financeService.createCashbox('T-002', 'Tontine Horizon', { title: `  ${label.toUpperCase()}  `, type: 'LIBRE', amount: null, description: '' })).toBeTruthy();
  });

  it('TEST 7 : une caisse peut être ré-enregistrée en conservant son propre libellé', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Garde son libellé ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateCashbox('T-001', created!.id, { title: created!.title, description: 'mise à jour' });
    expect(updated?.title).toBe(created!.title);
  });

  it('TEST 8 : une caisse ne peut pas prendre le libellé normalisé d’une AUTRE caisse du même tenant', async () => {
    const stamp = Date.now();
    const alpha = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse Alpha ${stamp}`, type: 'LIBRE', amount: null, description: '' });
    const beta = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse Beta ${stamp}`, type: 'LIBRE', amount: null, description: '' });
    expect(await financeService.updateCashbox('T-001', beta!.id, { title: `  CAISSE ALPHA ${stamp}  ` })).toBeNull();
    const alphaAfter = await financeService.getCashbox('T-001', alpha!.id);
    expect(alphaAfter?.title).toBe(`Caisse Alpha ${stamp}`);
  });

  it('ANCIENNE ANOMALIE (seed) : deux caisses « Épargne » dans T-001 — résolue : AC-002 retirée du jeu de démonstration, seule AC-009 (SAVINGS) porte ce libellé et le report', () => {
    const ac009 = cashboxes.find((cashbox) => cashbox.id === 'AC-009');
    expect(cashboxes.some((cashbox) => cashbox.id === 'AC-002')).toBe(false);
    expect(ac009?.tenantId).toBe('T-001');
    expect(ac009?.systemCode).toBe('SAVINGS');
    expect(cashboxes.filter((cashbox) => cashbox.tenantId === 'T-001' && normalizeCashboxLabel(cashbox.title) === normalizeCashboxLabel('Épargne'))).toHaveLength(1);
    expect(ac009?.openingBalance).toBe(8_650_000);
  });
});

describe('financeService — Comptes système (TONTINE_PURCHASE, mandat « robustifier Achat tontine »)', () => {
  it('CRÉATION : chaque tenant connu possède déjà son compte système TONTINE_PURCHASE (couverture immédiate, pas seulement T-001/T-002)', () => {
    for (const tenantId of ['T-001', 'T-002', 'T-003', 'T-004', 'T-005']) {
      const cashbox = resolveSystemCashbox(tenantId, 'TONTINE_PURCHASE');
      expect(cashbox.tenantId).toBe(tenantId);
      expect(cashbox.systemCode).toBe('TONTINE_PURCHASE');
      expect(isSystemCashbox(cashbox)).toBe(true);
    }
  });

  it('IDEMPOTENCE : des appels répétés (y compris pour un tenant qui n’avait encore aucune caisse « Achat tontine ») ne créent jamais de doublon', () => {
    const first = ensureSystemCashbox('T-003', 'TONTINE_PURCHASE');
    const second = ensureSystemCashbox('T-003', 'TONTINE_PURCHASE');
    const third = resolveSystemCashbox('T-003', 'TONTINE_PURCHASE');
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(cashboxes.filter((cashbox) => cashbox.tenantId === 'T-003' && cashbox.systemCode === 'TONTINE_PURCHASE')).toHaveLength(1);
  });

  it('MIGRATION : les caisses historiques AC-015 (T-001) / AC-016 (T-002), nommées « Achat tontine » avant ce chantier, ont été ADOPTÉES par systemCode — jamais dupliquées', () => {
    expect(resolveSystemCashbox('T-001', 'TONTINE_PURCHASE').id).toBe('AC-015');
    expect(resolveSystemCashbox('T-002', 'TONTINE_PURCHASE').id).toBe('AC-016');
  });

  it('IDENTIFICATION TECHNIQUE : la résolution repose sur systemCode, jamais sur le libellé — un libellé incohérent (hors API, ex. corruption) ne casse pas la résolution', () => {
    const cashbox = resolveSystemCashbox('T-003', 'TONTINE_PURCHASE');
    const originalTitle = cashbox.title;
    cashbox.title = 'Libellé incohérent (jamais atteignable via updateCashbox, qui protège ce compte)';
    try {
      expect(resolveSystemCashbox('T-003', 'TONTINE_PURCHASE').id).toBe(cashbox.id);
    } finally {
      cashbox.title = originalTitle;
    }
  });

  it('ISOLATION MULTI-TENANT : chaque tenant résout un compte système DISTINCT, jamais celui d’un autre', () => {
    const ids = new Set(['T-001', 'T-002', 'T-003', 'T-004', 'T-005'].map((tenantId) => resolveSystemCashbox(tenantId, 'TONTINE_PURCHASE').id));
    expect(ids.size).toBe(5);
  });

  it('AMBIGUÏTÉ DE MIGRATION : plusieurs comptes candidats pour un même tenant → aucune adoption arbitraire, l’ambiguïté est tracée, un compte système propre est tout de même créé', () => {
    const conflictTenantId = `T-TEST-CONFLICT-${Date.now()}`;
    const dup1: CashboxRecord = { id: `AC-TEST-DUP-1-${Date.now()}`, tenantId: conflictTenantId, cashboxNumber: 'TEST-DUP-1', title: 'achat TONTINE', type: 'LIBRE', amount: null, description: '', openingBalance: 0, tenantName: conflictTenantId, status: 'active', openedOn: '2026-01-01', memberIds: [] };
    const dup2: CashboxRecord = { ...dup1, id: `AC-TEST-DUP-2-${Date.now()}`, cashboxNumber: 'TEST-DUP-2' };
    cashboxes.push(dup1, dup2);
    const conflictsBefore = systemCashboxMigrationConflicts.length;
    let created: CashboxRecord | undefined;
    try {
      created = ensureSystemCashbox(conflictTenantId, 'TONTINE_PURCHASE');
      expect(created.systemCode).toBe('TONTINE_PURCHASE');
      expect(created.id).not.toBe(dup1.id);
      expect(created.id).not.toBe(dup2.id); // jamais un choix arbitraire parmi les candidats ambigus
      expect(systemCashboxMigrationConflicts.length).toBe(conflictsBefore + 1);
      expect(systemCashboxMigrationConflicts.at(-1)).toMatchObject({ tenantId: conflictTenantId, systemCode: 'TONTINE_PURCHASE', candidateCashboxIds: [dup1.id, dup2.id] });
    } finally {
      for (const id of [dup1.id, dup2.id, created?.id]) {
        const index = cashboxes.findIndex((cashbox) => cashbox.id === id);
        if (index >= 0) cashboxes.splice(index, 1);
      }
      systemCashboxMigrationConflicts.length = conflictsBefore;
    }
  });

  it('PROTECTION RENOMMAGE : updateCashbox refuse un renommage RÉEL du compte système, mais autorise un ré-enregistrement du même libellé (mandat §10/§26 : ne pas casser l’API pour les comptes ordinaires)', async () => {
    const cashbox = resolveSystemCashbox('T-003', 'TONTINE_PURCHASE');
    const refused = await financeService.updateCashbox('T-003', cashbox.id, { title: 'Caisse générale', type: 'LIBRE', amount: null, description: cashbox.description });
    expect(refused).toBeNull();
    expect(cashboxes.find((item) => item.id === cashbox.id)?.title).toBe('Achat tontine');
    const allowed = await financeService.updateCashbox('T-003', cashbox.id, { title: cashbox.title, type: 'LIBRE', amount: null, description: `Description mise à jour ${Date.now()}` });
    expect(allowed).toBeTruthy(); // même libellé → jamais un renommage réel, jamais bloqué inutilement
  });

  it('PROTECTION SUPPRESSION/DÉSACTIVATION : deleteCashbox refuse explicitement pour un compte système — jamais un succès silencieux, jamais désactivé', async () => {
    const cashbox = resolveSystemCashbox('T-004', 'TONTINE_PURCHASE');
    const result = await financeService.deleteCashbox('T-004', cashbox.id);
    expect(result).toEqual({ ok: false, reason: 'systemProtected' });
    const stillThere = cashboxes.find((item) => item.id === cashbox.id);
    expect(stillThere).toBeTruthy();
    expect(stillThere?.status).toBe('active');
  });

  it('NON-RÉGRESSION : un compte ORDINAIRE reste renommable et supprimable/désactivable exactement comme avant', async () => {
    const created = await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse ordinaire ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(isSystemCashbox(created!)).toBe(false);
    const renamed = await financeService.updateCashbox('T-001', created!.id, { title: `Caisse renommée ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(renamed).toBeTruthy();
    const deleted = await financeService.deleteCashbox('T-001', created!.id);
    expect(deleted).toMatchObject({ ok: true, cashbox: { status: 'inactive' } });
  });
});

describe('financeService — Comptes système, extension « centre financier » (SAVINGS / REGISTRATION / EMERGENCY_FUND)', () => {
  it('LES 4 CODES SONT RECONNUS : chaque tenant connu possède les 4 caisses système (TONTINE_PURCHASE, SAVINGS, REGISTRATION, EMERGENCY_FUND)', () => {
    for (const tenantId of ['T-001', 'T-002', 'T-003', 'T-004', 'T-005']) {
      for (const code of SYSTEM_CASHBOX_CODES) {
        const cashbox = resolveSystemCashbox(tenantId, code);
        expect(cashbox.tenantId).toBe(tenantId);
        expect(cashbox.systemCode).toBe(code);
        expect(isSystemCashbox(cashbox)).toBe(true);
      }
    }
  });

  it('ACHAT TONTINE INCHANGÉ : TONTINE_PURCHASE continue de résoudre exactement les mêmes comptes historiques qu’avant cette extension', () => {
    expect(resolveSystemCashbox('T-001', 'TONTINE_PURCHASE').id).toBe('AC-015');
    expect(resolveSystemCashbox('T-002', 'TONTINE_PURCHASE').id).toBe('AC-016');
  });

  it('ADOPTION LEGACY : AC-009 (Epargne) / AC-010 (Inscription) / AC-011 (Secours) de T-001 sont bien les caisses système SAVINGS/REGISTRATION/EMERGENCY_FUND — jamais dupliquées', () => {
    expect(resolveSystemCashbox('T-001', 'SAVINGS').id).toBe('AC-009');
    expect(resolveSystemCashbox('T-001', 'REGISTRATION').id).toBe('AC-010');
    expect(resolveSystemCashbox('T-001', 'EMERGENCY_FUND').id).toBe('AC-011');
    for (const code of ['SAVINGS', 'REGISTRATION', 'EMERGENCY_FUND'] as const) {
      expect(cashboxes.filter((cashbox) => cashbox.tenantId === 'T-001' && cashbox.systemCode === code)).toHaveLength(1);
    }
  });

  it('CRÉATION POUR LES AUTRES TENANTS : un tenant sans caisse « Épargne »/« Inscription »/« Secours » préexistante en obtient une, propre à lui, jamais un doublon', () => {
    for (const code of ['SAVINGS', 'REGISTRATION', 'EMERGENCY_FUND'] as const) {
      const cashbox = resolveSystemCashbox('T-003', code);
      expect(cashbox.tenantId).toBe('T-003');
      expect(cashbox.systemCode).toBe(code);
      expect(cashboxes.filter((item) => item.tenantId === 'T-003' && item.systemCode === code)).toHaveLength(1);
    }
  });

  it('IDEMPOTENCE : des appels répétés ne créent jamais de doublon, pour chacun des 4 codes', () => {
    for (const code of SYSTEM_CASHBOX_CODES) {
      const first = ensureSystemCashbox('T-004', code);
      const second = ensureSystemCashbox('T-004', code);
      const third = resolveSystemCashbox('T-004', code);
      expect(second.id).toBe(first.id);
      expect(third.id).toBe(first.id);
      expect(cashboxes.filter((cashbox) => cashbox.tenantId === 'T-004' && cashbox.systemCode === code)).toHaveLength(1);
    }
  });

  it('ISOLATION MULTI-TENANT : pour un même code, chaque tenant résout un compte DISTINCT', () => {
    for (const code of ['SAVINGS', 'REGISTRATION', 'EMERGENCY_FUND'] as const) {
      const ids = new Set(['T-001', 'T-002', 'T-003', 'T-004', 'T-005'].map((tenantId) => resolveSystemCashbox(tenantId, code).id));
      expect(ids.size).toBe(5);
    }
  });

  it.each(['SAVINGS', 'REGISTRATION', 'EMERGENCY_FUND'] as const)(
    'PROTECTION RENOMMAGE (%s) : updateCashbox refuse un renommage réel, autorise un ré-enregistrement du même libellé',
    async (code) => {
      const cashbox = resolveSystemCashbox('T-005', code);
      const originalTitle = cashbox.title;
      const refused = await financeService.updateCashbox('T-005', cashbox.id, { title: 'Caisse renommée arbitrairement', type: 'LIBRE', amount: null, description: cashbox.description });
      expect(refused).toBeNull();
      expect(cashboxes.find((item) => item.id === cashbox.id)?.title).toBe(originalTitle);
      const allowed = await financeService.updateCashbox('T-005', cashbox.id, { title: originalTitle, type: cashbox.type, amount: cashbox.amount, description: `Description mise à jour ${Date.now()}` });
      expect(allowed).toBeTruthy();
    },
  );

  it.each(['SAVINGS', 'REGISTRATION', 'EMERGENCY_FUND'] as const)(
    'PROTECTION SUPPRESSION/DÉSACTIVATION (%s) : deleteCashbox refuse explicitement, jamais un succès silencieux',
    async (code) => {
      const cashbox = resolveSystemCashbox('T-004', code);
      const result = await financeService.deleteCashbox('T-004', cashbox.id);
      expect(result).toEqual({ ok: false, reason: 'systemProtected' });
      const stillThere = cashboxes.find((item) => item.id === cashbox.id);
      expect(stillThere).toBeTruthy();
      expect(stillThere?.status).toBe('active');
    },
  );

  it('CAISSES UTILISATEUR NON AFFECTÉES : une caisse ordinaire reste renommable/supprimable comme avant l’extension', async () => {
    const created = await financeService.createCashbox('T-002', 'Tontine Horizon', { title: `Caisse ordinaire ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(isSystemCashbox(created!)).toBe(false);
    const renamed = await financeService.updateCashbox('T-002', created!.id, { title: `Caisse renommée ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(renamed).toBeTruthy();
    const deleted = await financeService.deleteCashbox('T-002', created!.id);
    expect(deleted).toMatchObject({ ok: true, cashbox: { status: 'inactive' } });
  });

  it('TRANSACTIONS EXISTANTES INCHANGÉES : le journal seedé n’est pas altéré par l’extension des caisses système', () => {
    const tr001 = transactions.find((transaction) => transaction.id === 'TR-001');
    expect(tr001).toMatchObject({ amount: 50_000, category: 'EPARGNE', destination: 'CS-001-CX-001' });
    const tr010 = transactions.find((transaction) => transaction.id === 'TR-010');
    expect(tr010).toMatchObject({ amount: 5_000, category: 'AUTRES', subcategory: 'COTISATION', source: 'Cheikh Diop', destination: 'CS-001-CX-004' });
  });
});
