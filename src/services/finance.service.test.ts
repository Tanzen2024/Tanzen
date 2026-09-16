import { describe, it, expect } from 'vitest';
import { financeService } from './finance.service';
import { fiscalMeetingId } from '@/mocks/settings/meeting-schedule';
import { accounts, normalizeAccountLabel } from '@/mocks/finance/accounts';

describe('financeService — Accounts', () => {
  it('ALLOW: listAccounts returns only accounts of the requesting tenant', async () => {
    const result = await financeService.listAccounts('T-001');
    expect(result.every((account) => account.tenantId === 'T-001')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('DENY: getAccount returns null for an account of another tenant', async () => {
    const [t001Accounts, t002Accounts] = await Promise.all([financeService.listAccounts('T-001'), financeService.listAccounts('T-002')]);
    expect(t002Accounts.length).toBeGreaterThan(0);
    const otherTenantAccountId = t002Accounts[0].id;
    const result = await financeService.getAccount('T-001', otherTenantAccountId);
    expect(result).toBeNull();
    expect(t001Accounts.some((account) => account.id === otherTenantAccountId)).toBe(false);
  });

  it('ALLOW: getAccount returns the account when it belongs to the requesting tenant', async () => {
    const [account] = await financeService.listAccounts('T-001');
    const result = await financeService.getAccount('T-001', account.id);
    expect(result?.id).toBe(account.id);
  });
});

describe('financeService — createAccount (caisse)', () => {
  it('ALLOW: creates a LIBRE account without an amount', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Epargne libre ${Date.now()}`, type: 'LIBRE', amount: null, description: 'Epargne volontaire des adhérents' });
    expect(account).toBeTruthy();
    expect(account?.type).toBe('LIBRE');
    expect(account?.amount).toBeNull();
  });

  it('ALLOW: creates a TAUX_FIXE account with a fixed amount', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Inscription ${Date.now()}`, type: 'TAUX_FIXE', amount: 500, description: "Cotisation d'inscription" });
    expect(account).toBeTruthy();
    expect(account?.type).toBe('TAUX_FIXE');
    expect(account?.amount).toBe(500);
  });

  it('DENY: rejects a TAUX_FIXE account without an amount', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Secours ${Date.now()}`, type: 'TAUX_FIXE', amount: null, description: '' });
    expect(account).toBeNull();
  });

  it('DENY: rejects a TAUX_FIXE account with a negative amount', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Négatif ${Date.now()}`, type: 'TAUX_FIXE', amount: -100, description: '' });
    expect(account).toBeNull();
  });

  it('DENY: rejects a TAUX_FIXE account with an amount of exactly 0 (must be strictly positive)', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Zéro ${Date.now()}`, type: 'TAUX_FIXE', amount: 0, description: '' });
    expect(account).toBeNull();
  });

  it('DENY: rejects an unknown account type', async () => {
    // @ts-expect-error — runtime guard test for a value TypeScript would otherwise reject at compile time.
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Inconnu ${Date.now()}`, type: 'ASSET', amount: null, description: '' });
    expect(account).toBeNull();
  });

  it('DENY: rejects a duplicate title within the same tenant', async () => {
    const title = `Doublon ${Date.now()}`;
    const first = await financeService.createAccount('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' });
    expect(first).toBeTruthy();
    const second = await financeService.createAccount('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' });
    expect(second).toBeNull();
  });

  it('ALLOW: the same title is allowed again in a different tenant', async () => {
    const title = `Multi-tenant ${Date.now()}`;
    const t001Account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' });
    const t002Account = await financeService.createAccount('T-002', 'Tontine Horizon', { title, type: 'LIBRE', amount: null, description: '' });
    expect(t001Account).toBeTruthy();
    expect(t002Account).toBeTruthy();
  });

  it('ISOLATION: tenantId is always taken from the service parameter, never from the input body', async () => {
    // AccountCreateInput has no `tenantId` field at the type level — this proves the created account is scoped to the tenant passed explicitly.
    const account = await financeService.createAccount('T-002', 'Tontine Horizon', { title: `Scopé ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(account?.tenantId).toBe('T-002');
    expect(account?.tenantName).toBe('Tontine Horizon');
  });

  it('AUTO: accountNumber is always generated by the service, never supplied by the caller', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Auto n° ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(account?.accountNumber).toBeTruthy();
    expect(account?.status).toBe('active');
    expect(account?.balance).toBe(0);
  });
});

describe('financeService — updateAccount', () => {
  it('ALLOW: updates title/type/amount/description for the owning tenant', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `À modifier ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateAccount('T-001', created!.id, { type: 'TAUX_FIXE', amount: 1000 });
    expect(updated?.type).toBe('TAUX_FIXE');
    expect(updated?.amount).toBe(1000);
  });

  it('DENY: cannot update an account of another tenant', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Isolé ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.updateAccount('T-002', created!.id, { title: 'Piraté' });
    expect(result).toBeNull();
  });

  it('DENY: switching to TAUX_FIXE without providing an amount is rejected', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Sans montant ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.updateAccount('T-001', created!.id, { type: 'TAUX_FIXE' });
    expect(result).toBeNull();
  });

  it('DENY: switching to TAUX_FIXE with an amount of exactly 0 is rejected', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Zéro modif ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.updateAccount('T-001', created!.id, { type: 'TAUX_FIXE', amount: 0 });
    expect(result).toBeNull();
  });

  it('SAFE: updateAccount never mutates balance or accountNumber', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Intégrité technique ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateAccount('T-001', created!.id, { title: 'Renommée' });
    expect(updated?.balance).toBe(created!.balance);
    expect(updated?.accountNumber).toBe(created!.accountNumber);
  });
});

describe('financeService — deleteAccount', () => {
  it('ALLOW: deletes an account with no linked transactions', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Jetable ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.deleteAccount('T-001', created!.id);
    expect(result?.deleted).toBe(true);
    const after = await financeService.getAccount('T-001', created!.id);
    expect(after).toBeNull();
  });

  it('SAFE: deactivates instead of deleting an account with existing movements', async () => {
    // AC-001 (CS-001-TRÉS) is referenced by seeded transactions (fromAccount/toAccount).
    const result = await financeService.deleteAccount('T-001', 'AC-001');
    expect(result?.deleted).toBe(false);
    expect(result?.deactivated).toBe(true);
    const after = await financeService.getAccount('T-001', 'AC-001');
    expect(after?.status).toBe('inactive');
  });
});

/**
 * Mandat « Évolution du cycle de vie des exercices fiscaux » §33/§36 (audit des
 * objets clôturables) — seul objet, hors exercice fiscal, où une réouverture
 * transverse a été jugée justifiée : une caisse désactivée ne perd aucune
 * donnée financière, la réactivation n'est qu'un flip de statut.
 */
describe('financeService — reactivateAccount', () => {
  it('ALLOW: reactivates an inactive account (AC-008, seeded inactive)', async () => {
    const before = await financeService.getAccount('T-004', 'AC-008');
    expect(before?.status).toBe('inactive');
    const result = await financeService.reactivateAccount('T-004', 'AC-008');
    expect(result?.status).toBe('active');
    const after = await financeService.getAccount('T-004', 'AC-008');
    expect(after?.status).toBe('active');
  });

  it('DENY: refuses an already-active account (no silent no-op)', async () => {
    const [account] = await financeService.listAccounts('T-002');
    expect(account.status).toBe('active');
    const result = await financeService.reactivateAccount('T-002', account.id);
    expect(result).toBeNull(); // mockRequest coerces undefined -> null (see api-client.ts)
  });

  it('DENY: refuses an account belonging to another tenant', async () => {
    const result = await financeService.reactivateAccount('T-001', 'AC-008'); // AC-008 belongs to T-004
    expect(result).toBeNull();
  });
});

describe('financeService — account member assignment (adhésions à la caisse)', () => {
  it('ALLOW: adds a single member to an account', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse membre unique ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addAccountMembers('T-001', created!.id, ['M-001']);
    expect(updated?.memberIds).toContain('M-001');
  });

  it('ALLOW: adds several members at once', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse plusieurs membres ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addAccountMembers('T-001', created!.id, ['M-001', 'M-006']);
    expect(updated?.memberIds.sort()).toEqual(['M-001', 'M-006'].sort());
  });

  it('ALLOW: removes a single member', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse retrait ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addAccountMembers('T-001', created!.id, ['M-001', 'M-006']);
    const updated = await financeService.removeAccountMembers('T-001', created!.id, ['M-001']);
    expect(updated?.memberIds).toEqual(['M-006']);
  });

  it('ALLOW: removes all members', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse retrait total ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addAccountMembers('T-001', created!.id, ['M-001', 'M-006']);
    const updated = await financeService.removeAccountMembers('T-001', created!.id, ['M-001', 'M-006']);
    expect(updated?.memberIds).toEqual([]);
  });

  it('ISOLATION: a memberId from another tenant is silently ignored', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse isolation ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addAccountMembers('T-001', created!.id, ['M-001', 'M-002']); // M-002 belongs to T-002
    expect(updated?.memberIds).toEqual(['M-001']);
  });

  it('ISOLATION: cannot manage members of an account belonging to another tenant', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse protégée ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.addAccountMembers('T-002', created!.id, ['M-002']);
    expect(result).toBeNull();
  });

  it('SAFE: a non-existent memberId is silently ignored, no crash', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse membre inexistant ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.addAccountMembers('T-001', created!.id, ['M-999-DOES-NOT-EXIST']);
    expect(updated?.memberIds).toEqual([]);
  });

  it('SAFE: adding the same member twice does not create a duplicate entry', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse doublon membre ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addAccountMembers('T-001', created!.id, ['M-001']);
    const updated = await financeService.addAccountMembers('T-001', created!.id, ['M-001']);
    expect(updated?.memberIds).toEqual(['M-001']);
  });

  it('listAccountMembers only returns members of the requesting tenant', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse liste ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addAccountMembers('T-001', created!.id, ['M-001']);
    const result = await financeService.listAccountMembers('T-001', created!.id);
    expect(result.every((member) => member.tenantId === 'T-001')).toBe(true);
    expect(result.map((member) => member.id)).toContain('M-001');
  });
});

/**
 * Phase 1 du moteur de position : l'adhésion caisse ↔ membre est désormais une
 * entité DATÉE (`AccountMembership`). `addAccountMembers` ouvre une adhésion,
 * `removeAccountMembers` la CLÔT (jamais de suppression), `Account.memberIds` est
 * un cache projeté des adhésions actives.
 */
describe('financeService — AccountMembership (adhésion datée)', () => {
  it('addAccountMembers ouvre une adhésion datée (startDate = aujourd’hui, endDate null, status active)', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Adhésion ouverte ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addAccountMembers('T-001', account!.id, ['M-001']);
    const memberships = await financeService.listAccountMemberships('T-001');
    const created = memberships.find((m) => m.accountId === account!.id && m.memberId === 'M-001');
    expect(created).toBeTruthy();
    expect(created!.endDate).toBeNull();
    expect(created!.status).toBe('active');
    expect(created!.startDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it('removeAccountMembers CLÔT l’adhésion (endDate + status ended), sans la supprimer', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Adhésion clôturée ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addAccountMembers('T-001', account!.id, ['M-001']);
    await financeService.removeAccountMembers('T-001', account!.id, ['M-001']);

    const memberships = await financeService.listAccountMemberships('T-001');
    const closed = memberships.filter((m) => m.accountId === account!.id && m.memberId === 'M-001');
    expect(closed).toHaveLength(1); // toujours présente
    expect(closed[0].endDate).toBe(new Date().toISOString().slice(0, 10));
    expect(closed[0].status).toBe('ended');

    // le cache Account.memberIds ne reflète plus que les adhésions actives
    const refreshed = await financeService.getAccount('T-001', account!.id);
    expect(refreshed!.memberIds).toEqual([]);
  });

  it('ré-ajouter un membre dont l’adhésion était clôturée ouvre une NOUVELLE adhésion', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Ré-adhésion ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    await financeService.addAccountMembers('T-001', account!.id, ['M-001']);
    await financeService.removeAccountMembers('T-001', account!.id, ['M-001']);
    await financeService.addAccountMembers('T-001', account!.id, ['M-001']);

    const memberships = (await financeService.listAccountMemberships('T-001')).filter((m) => m.accountId === account!.id && m.memberId === 'M-001');
    expect(memberships).toHaveLength(2);
    expect(memberships.filter((m) => m.endDate === null)).toHaveLength(1);
  });

  it('SEED : Fatou (M-001) est adhérente active de Trésorerie, Épargne et Secours (AC-011, sans transaction)', async () => {
    const [tresorerie, epargne, secours] = await Promise.all([
      financeService.listAccountMembers('T-001', 'AC-001'),
      financeService.listAccountMembers('T-001', 'AC-002'),
      financeService.listAccountMembers('T-001', 'AC-011'),
    ]);
    expect(tresorerie.map((m) => m.id)).toContain('M-001');
    expect(epargne.map((m) => m.id)).toContain('M-001');
    // Adhésion ≠ transaction : Secours n'a aucune écriture, Fatou y est pourtant adhérente.
    expect(secours.map((m) => m.id)).toEqual(['M-001']);
  });

  it('SEED : Cheikh (M-006), adhésion Épargne clôturée au 30/06/2026, n’apparaît plus dans les adhérents actifs d’Épargne', async () => {
    const epargne = await financeService.listAccountMembers('T-001', 'AC-002');
    expect(epargne.map((m) => m.id)).not.toContain('M-006');
    // mais il reste adhérent actif de Trésorerie
    const tresorerie = await financeService.listAccountMembers('T-001', 'AC-001');
    expect(tresorerie.map((m) => m.id)).toContain('M-006');
    // et l'adhésion clôturée reste tracée
    const memberships = await financeService.listAccountMemberships('T-001');
    const ended = memberships.find((m) => m.accountId === 'AC-002' && m.memberId === 'M-006');
    expect(ended?.endDate).toBe('2026-06-30');
    expect(ended?.status).toBe('ended');
  });

  it('SEED : Account.memberIds (cache projeté) reflète les adhésions actives', async () => {
    const account = await financeService.getAccount('T-001', 'AC-001');
    expect([...account!.memberIds].sort()).toEqual(['M-001', 'M-006']);
  });

  it('ISOLATION : listAccountMemberships est tenant-scoped (T-001 ne voit pas les adhésions de T-002)', async () => {
    const t001 = await financeService.listAccountMemberships('T-001');
    expect(t001.every((m) => m.tenantId === 'T-001')).toBe(true);
    expect(t001.some((m) => m.accountId === 'AC-004')).toBe(false); // AC-004 = T-002
  });
});

describe('financeService — createAccount validation', () => {
  it('DENY: rejects an account without a title', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: '   ', type: 'LIBRE', amount: null, description: '' });
    expect(account).toBeNull();
  });

  it('TAUX_FIXE still requires a positive amount', async () => {
    const account = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Fixe sans montant ${Date.now()}`, type: 'TAUX_FIXE', amount: null, description: '' });
    expect(account).toBeNull();
  });

  it('updateAccount changes the type without touching the rest', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `À reconfigurer ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateAccount('T-001', created!.id, { type: 'TAUX_FIXE', amount: 1000 });
    expect(updated?.type).toBe('TAUX_FIXE');
    expect(updated?.amount).toBe(1000);
  });
});

describe('financeService — recordAccountMovement', () => {
  it('a movement credits the balance', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Mouvement solde ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const before = created!.balance;
    const updated = await financeService.recordAccountMovement('T-001', created!.id, 10_000);
    expect(updated?.balance).toBe(before + 10_000);
  });

  it('DENY: rejects a movement with a non-positive amount', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Montant invalide ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    expect(await financeService.recordAccountMovement('T-001', created!.id, 0)).toBeNull();
    expect(await financeService.recordAccountMovement('T-001', created!.id, -100)).toBeNull();
  });

  it('ISOLATION: cannot record a movement against an account of another tenant', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Isolée mouvement ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const result = await financeService.recordAccountMovement('T-002', created!.id, 10_000);
    expect(result).toBeNull();
    const after = await financeService.getAccount('T-001', created!.id);
    expect(after?.balance).toBe(created!.balance);
  });

  it('DENY: recordAccountMovement returns null for a non-existent account', async () => {
    expect(await financeService.recordAccountMovement('T-001', 'AC-DOES-NOT-EXIST', 1000)).toBeNull();
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

  it('ALLOW/DENY: listTransactionsInDateRange is scoped to the requesting tenant (mandat « vue consolidée Finance → Transactions »)', async () => {
    const [t001, t002] = await Promise.all([
      financeService.listTransactionsInDateRange('T-001', '2026-01-01', '2026-12-31'),
      financeService.listTransactionsInDateRange('T-002', '2026-01-01', '2026-12-31'),
    ]);
    expect(t001.length).toBeGreaterThan(0);
    expect(t001.every((transaction) => transaction.tenantId === 'T-001')).toBe(true);
    const t002Ids = new Set(t002.map((transaction) => transaction.id));
    expect(t001.some((transaction) => t002Ids.has(transaction.id))).toBe(false);
  });

  it('ALLOW: listTransactionsInDateRange only returns transactions within the inclusive date range (fiscal year scoping)', async () => {
    const result = await financeService.listTransactionsInDateRange('T-001', '2026-08-01', '2026-08-31');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((transaction) => transaction.date >= '2026-08-01' && transaction.date <= '2026-08-31')).toBe(true);
  });

  it('ALLOW: listTransactionsInDateRange returns an empty list for a fiscal year with no transactions', async () => {
    const result = await financeService.listTransactionsInDateRange('T-001', '2025-01-01', '2025-12-31');
    expect(result).toEqual([]);
  });

  it('ALLOW: transactions with a memberId resolve to a real member of the same tenant, transactions with no counterpart member have no memberId', async () => {
    const t001 = await financeService.listTransactionsInDateRange('T-001', '2026-01-01', '2026-12-31');
    const withMember = t001.filter((transaction) => transaction.memberId);
    const withoutMember = t001.filter((transaction) => !transaction.memberId);
    expect(withMember.length).toBeGreaterThan(0);
    expect(withoutMember.length).toBeGreaterThan(0);
    // Account.memberIds n'est jamais utilisé pour cette relation (AC08) — vérifié en amont (les 14 comptes seedés ont tous memberIds: []) ; ici on vérifie seulement que memberId pointe vers un identifiant plausible, jamais un id d'un autre tenant.
    expect(withMember.every((transaction) => transaction.memberId?.startsWith('M-'))).toBe(true);
  });

  it('ALLOW: the same member appearing on multiple transactions is trivially deduplicated by building a Set of memberId', async () => {
    const t001 = await financeService.listTransactionsInDateRange('T-001', '2026-01-01', '2026-12-31');
    const memberIds = new Set(t001.flatMap((transaction) => (transaction.memberId ? [transaction.memberId] : [])));
    // Fatou Ndiaye (M-001) a 3 transactions dans le jeu de données seed T-001 — un seul id dans le Set malgré les doublons.
    const fatouCount = t001.filter((transaction) => transaction.memberId === 'M-001').length;
    expect(fatouCount).toBeGreaterThan(1);
    expect(memberIds.has('M-001')).toBe(true);
    expect([...memberIds].filter((id) => id === 'M-001')).toHaveLength(1);
  });

  // Mandat « Transactions = journal financier central » §4 : la saisie d'une transaction est
  // l'unique point d'écriture dans le journal.
  it('ALLOW: createTransaction appends to the tenant journal with a system timestamp and derived accounts', async () => {
    const created = await financeService.createTransaction('T-001', {
      accountNumber: 'CS-001-ÉPG', memberId: 'M-001', memberName: 'Fatou Ndiaye',
      category: 'EPARGNE', type: 'credit', amount: 25_000, description: 'Épargne test',
    });
    expect(created).toBeDefined();
    expect(created!.tenantId).toBe('T-001');
    // « Date transaction » = horodatage d'audit généré à l'écriture, jamais fourni par l'appelant.
    expect(created!.recordedAt).toBeTruthy();
    expect(created!.date).toBe(created!.recordedAt!.slice(0, 10));
    expect(created!.status).toBe('completed');
    // credit → les fonds vont vers le compte
    expect(created!.toAccount).toBe('CS-001-ÉPG');
    expect(created!.fromAccount).toBe('Fatou Ndiaye');
    const journal = await financeService.listTransactions('T-001');
    expect(journal.some((transaction) => transaction.id === created!.id)).toBe(true);
  });

  it('DENY: createTransaction rejects a missing account or a non-positive amount', async () => {
    expect(await financeService.createTransaction('T-001', { accountNumber: '', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 1000, description: '' })).toBeNull();
    expect(await financeService.createTransaction('T-001', { accountNumber: 'CS-001-COUR', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 0, description: '' })).toBeNull();
  });

  it('ALLOW/DENY: cancelTransaction cancels a completed transaction once, then refuses (append-only journal)', async () => {
    const created = await financeService.createTransaction('T-001', { accountNumber: 'CS-001-COUR', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 5000, description: 'À annuler' });
    const cancelled = await financeService.cancelTransaction('T-001', created!.id);
    expect(cancelled!.status).toBe('cancelled');
    expect(await financeService.cancelTransaction('T-001', created!.id)).toBeNull();
    // scoping tenant
    expect(await financeService.cancelTransaction('T-002', created!.id)).toBeNull();
  });

  it('DENY: updateTransaction refuses to modify a cancelled transaction', async () => {
    const created = await financeService.createTransaction('T-001', { accountNumber: 'CS-001-COUR', category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 7000, description: 'x' });
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
  const base = { accountNumber: 'CS-001-COUR', type: 'credit', amount: 10_000, description: 'test' } as const;

  it('§26.1 : une transaction ÉPARGNE (sans sous-catégorie) est créée', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'EPARGNE' });
    expect(created?.category).toBe('EPARGNE');
    expect(created?.subcategory).toBeUndefined();
  });

  it('§26.2 : une transaction PRÊT (sans sous-catégorie) est créée', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'PRET', type: 'debit' });
    expect(created?.category).toBe('PRET');
    expect(created?.subcategory).toBeUndefined();
  });

  it('§26.3 : une transaction REMBOURSEMENT (sans sous-catégorie) est créée', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'REMBOURSEMENT' });
    expect(created?.category).toBe('REMBOURSEMENT');
    expect(created?.subcategory).toBeUndefined();
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
    const created = await financeService.createTransaction('T-002', { ...base, accountNumber: 'TH-002-ÉPG', category: 'EPARGNE' });
    expect(created?.tenantId).toBe('T-002');
  });

  it('updateTransaction : passer à AUTRES sans sous-catégorie est rejeté ; avec une sous-catégorie valide est accepté', async () => {
    const created = await financeService.createTransaction('T-001', { ...base, category: 'EPARGNE' });
    expect(await financeService.updateTransaction('T-001', created!.id, { category: 'AUTRES' })).toBeNull();
    const updated = await financeService.updateTransaction('T-001', created!.id, { category: 'AUTRES', subcategory: 'CORRECTION' });
    expect(updated?.category).toBe('AUTRES');
    expect(updated?.subcategory).toBe('CORRECTION');
    // Retour vers une catégorie directe → la sous-catégorie est effacée.
    const back = await financeService.updateTransaction('T-001', created!.id, { category: 'REMBOURSEMENT' });
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

describe('financeService — createTransaction × réunion d\'exercice fiscal (mandat « RÈGLE CENTRALE — DATES DE RÉUNION »)', () => {
  const EPARGNE = { accountNumber: 'CS-001-ÉPG', category: 'EPARGNE' as const, type: 'credit' as const, amount: 25_000, description: 'Épargne test réunion' };
  // FY-T001-2026 : « deuxième mardi de chaque mois » → 2026-01-13 est une occurrence réelle.
  const validMeetingId = fiscalMeetingId('FY-T001-2026', '2026-01-13');

  it('§9 — la transaction porte meeting_id, meetingDate = meeting.meeting_date, et transaction_at (recordedAt) est généré côté service', async () => {
    const before = Date.now();
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, meetingId: validMeetingId, fiscalYearId: 'FY-T001-2026' });
    expect(transaction?.meetingId).toBe(validMeetingId);
    expect(transaction?.meetingDate).toBe('2026-01-13'); // date de la réunion, pas la date de saisie
    expect(transaction?.recordedAt).toBeTruthy();
    // transaction_at n'est jamais fourni par l'appelant : il est posé maintenant, à l'INSERT.
    expect(new Date(transaction!.recordedAt!).getTime()).toBeGreaterThanOrEqual(before);
    expect(transaction?.date).toBe(transaction!.recordedAt!.slice(0, 10));
  });

  it('§13 — un meeting_id appartenant à un AUTRE exercice fiscal est rejeté', async () => {
    const otherExerciseMeeting = fiscalMeetingId('FY-T001-2027', '2027-01-12');
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, meetingId: otherExerciseMeeting, fiscalYearId: 'FY-T001-2026' });
    expect(transaction).toBeNull();
  });

  it('§13 — un meeting_id appartenant à un AUTRE tenant est rejeté', async () => {
    // FY-T002-2026 (tenant T-002) : « le 5 de chaque mois » → 2026-02-05 est une occurrence réelle de CET exercice.
    const otherTenantMeeting = fiscalMeetingId('FY-T002-2026', '2026-02-05');
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, meetingId: otherTenantMeeting, fiscalYearId: 'FY-T002-2026' });
    expect(transaction).toBeNull();
  });

  it('§12 — un meeting_id sans fiscalYearId associé est rejeté (aucune date inventée)', async () => {
    const transaction = await financeService.createTransaction('T-001', { ...EPARGNE, meetingId: validMeetingId });
    expect(transaction).toBeNull();
  });

  it('une transaction sans réunion reste possible (champ optionnel)', async () => {
    const transaction = await financeService.createTransaction('T-001', EPARGNE);
    expect(transaction?.meetingId).toBeUndefined();
    expect(transaction?.meetingDate).toBeUndefined();
    expect(transaction?.recordedAt).toBeTruthy();
  });
});

/**
 * RÈGLE MÉTIER PERMANENTE — UNICITÉ DU LIBELLÉ DE CAISSE (tenant + libellé
 * NORMALISÉ : trim, espaces réduits, sans casse, sans accent). Le contrôle est
 * autoritaire côté service (`createAccount` / `updateAccount`), pas seulement
 * dans le formulaire React.
 */
describe('financeService — unicité du libellé de caisse (règle métier normalisée)', () => {
  it('TEST 1-5 : « X » entre en conflit avec « x », « X » majuscule, sa forme sans accent, ses variantes d’espacement — dans le même tenant', async () => {
    const base = `Réunion Août ${Date.now()}`;
    const first = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: base, type: 'LIBRE', amount: null, description: '' });
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
      expect(await financeService.createAccount('T-001', 'Coopérative Sutura', { title, type: 'LIBRE', amount: null, description: '' })).toBeNull();
    }
  });

  it('TEST 6 : le même libellé est autorisé dans un AUTRE tenant (unicité par tenant, jamais globale)', async () => {
    const label = `Caisse partagée ${Date.now()}`;
    expect(await financeService.createAccount('T-001', 'Coopérative Sutura', { title: label, type: 'LIBRE', amount: null, description: '' })).toBeTruthy();
    expect(await financeService.createAccount('T-002', 'Tontine Horizon', { title: `  ${label.toUpperCase()}  `, type: 'LIBRE', amount: null, description: '' })).toBeTruthy();
  });

  it('TEST 7 : une caisse peut être ré-enregistrée en conservant son propre libellé', async () => {
    const created = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Garde son libellé ${Date.now()}`, type: 'LIBRE', amount: null, description: '' });
    const updated = await financeService.updateAccount('T-001', created!.id, { title: created!.title, description: 'mise à jour' });
    expect(updated?.title).toBe(created!.title);
  });

  it('TEST 8 : une caisse ne peut pas prendre le libellé normalisé d’une AUTRE caisse du même tenant', async () => {
    const stamp = Date.now();
    const alpha = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse Alpha ${stamp}`, type: 'LIBRE', amount: null, description: '' });
    const beta = await financeService.createAccount('T-001', 'Coopérative Sutura', { title: `Caisse Beta ${stamp}`, type: 'LIBRE', amount: null, description: '' });
    expect(await financeService.updateAccount('T-001', beta!.id, { title: `  CAISSE ALPHA ${stamp}  ` })).toBeNull();
    const alphaAfter = await financeService.getAccount('T-001', alpha!.id);
    expect(alphaAfter?.title).toBe(`Caisse Alpha ${stamp}`);
  });

  it('ANOMALIE DE DONNÉES CONNUE (seed) : AC-002 « Épargne » et AC-009 « Epargne » (T-001) sont un conflit selon la règle — signalé, JAMAIS corrigé/fusionné automatiquement', () => {
    const ac002 = accounts.find((account) => account.id === 'AC-002');
    const ac009 = accounts.find((account) => account.id === 'AC-009');
    expect(ac002?.tenantId).toBe('T-001');
    expect(ac009?.tenantId).toBe('T-001');
    // Libellés distincts à l'affichage, mais équivalents après normalisation → conflit.
    expect(ac002?.title).not.toBe(ac009?.title);
    expect(normalizeAccountLabel(ac002!.title)).toBe(normalizeAccountLabel(ac009!.title));
    // Le seed n'est pas réécrit : correction métier humaine requise (renommer AC-009,
    // ex. « Épargne volontaire », ou fusionner les deux caisses si doublon réel).
  });
});
