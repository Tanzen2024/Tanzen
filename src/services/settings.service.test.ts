import { describe, it, expect } from 'vitest';
import { settingsService } from './settings.service';
import { workflowService } from './workflow.service';
import { financePositionService } from './finance-position.service';
import { auditEvents } from '@/mocks/audit/audit-events';
import { distributions } from '@/mocks/finance/distributions';
import { fiscalYearTransferCategories } from '@/mocks/settings/fiscal-year-transfer-categories';
import { fiscalYears, fiscalYearStatus } from '@/mocks/settings/fiscal-years';

describe('fiscalYearTransferCategories — TRANSFER SELECTION CORRECTION (D-FY-07/08 gate §11)', () => {
  it('`transferable` is consistently derived from `transferability` (TRANSFERABLE/PARTIAL -> true, else false)', () => {
    for (const category of fiscalYearTransferCategories) {
      const expected = category.transferability === 'TRANSFERABLE' || category.transferability === 'PARTIAL';
      expect(category.transferable).toBe(expected);
    }
  });

  it('exactly the 4 permanent/tenant-scoped categories are transferable, not all 9', () => {
    const transferableIds = fiscalYearTransferCategories.filter((c) => c.transferable).map((c) => c.id);
    expect(transferableIds.sort()).toEqual(['cashboxesConfig', 'activeMembers', 'loanRules', 'tontineConfig'].sort());
  });

  it('historical/operational categories remain locked as NOT_TRANSFERABLE, not silently reclassified as transferable', () => {
    const historical = ['contributions', 'transactions', 'draws', 'attendance', 'votes'];
    for (const id of historical) {
      const category = fiscalYearTransferCategories.find((c) => c.id === id);
      expect(category?.transferability).toBe('NOT_TRANSFERABLE');
      expect(category?.transferable).toBe(false);
    }
  });
});

describe('settingsService — Organization/Localization', () => {
  it('ALLOW: updateOrganizationSettings only mutates the requesting tenant', async () => {
    const before = await settingsService.getOrganizationSettings('T-002');
    const beforeTimezone = before?.timezone;
    const updated = await settingsService.updateOrganizationSettings('T-001', { timezone: 'Africa/Test', currency: 'XOF' });
    expect(updated?.timezone).toBe('Africa/Test');
    const t002After = await settingsService.getOrganizationSettings('T-002');
    expect(t002After?.timezone).toBe(beforeTimezone);
  });

  it('ALLOW: an association without settings yet is initialised with the defaults (XAF), then updated', async () => {
    // Mandat du 2026-09-27 : paramètres absents → initialisés (devise XAF), plus refusés — détail dans organization-defaults.test.ts.
    expect(await settingsService.updateOrganizationSettings('T-999', { timezone: 'Africa/Test' })).toMatchObject({ tenantId: 'T-999', timezone: 'Africa/Test', currency: 'XAF' });
  });

  it('CAMEROUN : une association sans paramètres reçoit le fuseau Africa/Douala ; un fuseau déjà enregistré est conservé', async () => {
    expect(await settingsService.getOrganizationSettings('T-998')).toMatchObject({ tenantId: 'T-998', timezone: 'Africa/Douala', currency: 'XAF' });
    await settingsService.updateOrganizationSettings('T-998', { timezone: 'Europe/Paris' });
    expect((await settingsService.getOrganizationSettings('T-998'))?.timezone).toBe('Europe/Paris');
  });

  it('FORMAT RÉGIONAL : séparateurs enregistrés par association ; devise inconnue ou séparateurs identiques refusés', async () => {
    const saved = await settingsService.updateOrganizationSettings('T-003', { thousandsSeparator: 'comma', decimalSeparator: 'period', currency: 'XAF' });
    expect(saved).toMatchObject({ thousandsSeparator: 'comma', decimalSeparator: 'period', currency: 'XAF' });
    expect((await settingsService.getOrganizationSettings('T-004'))).toMatchObject({ thousandsSeparator: 'space', decimalSeparator: 'comma' }); // jamais partagé entre associations
    expect(await settingsService.updateOrganizationSettings('T-003', { thousandsSeparator: 'comma', decimalSeparator: 'comma' })).toBeNull();
    expect(await settingsService.updateOrganizationSettings('T-003', { currency: 'FCFA' })).toBeNull(); // FCFA est un libellé, jamais un code ISO
    expect((await settingsService.getOrganizationSettings('T-003'))).toMatchObject({ thousandsSeparator: 'comma', decimalSeparator: 'period', currency: 'XAF' }); // rien d'appliqué après un refus
  });
});

/**
 * Mandat « Caisse + exercice fiscal contexte global » (2026-09-25) : statut
 * métier calculé (À venir / En cours / Clôturé), clôture explicite d'un
 * exercice désigné, plus d'action « Ouvrir l'exercice » ni de drapeau isCurrent.
 */
describe('settingsService — closeFiscalYear: clôture explicite d’un exercice « En cours »', () => {
  it('ALLOW: closes an in-progress year — status becomes Clôturé and the closedAt/closedBy cache is set', async () => {
    const before = await settingsService.getCurrentFiscalYear('T-003');
    expect(before?.id).toBe('FY-T003-2026');
    expect(fiscalYearStatus(before!)).toBe('in_progress');
    const closed = await settingsService.closeFiscalYear('T-003', 'FY-T003-2026');
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(fiscalYearStatus(closed.year)).toBe('closed');
      expect(closed.year.closedAt).not.toBeNull();
      expect(closed.year.closedBy).toBeTruthy();
    }
    // Plus aucun exercice « En cours » pour T-003 : la clôture n'ouvre jamais le suivant.
    const current = await settingsService.getCurrentFiscalYear('T-003');
    expect(current ?? null).toBeNull();
  });

  it('DENY: an already-closed year cannot be closed again (ALREADY_CLOSED)', async () => {
    // FY-T003-2026 vient d'être clôturé par le test précédent (même instance de module).
    const result = await settingsService.closeFiscalYear('T-003', 'FY-T003-2026');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('ALREADY_CLOSED');
  });

  it('DENY: an upcoming year (start date not reached) cannot be closed (NOT_STARTED)', async () => {
    const result = await settingsService.closeFiscalYear('T-001', 'FY-T001-2027');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_STARTED');
    expect(fiscalYearStatus((await settingsService.listFiscalYears('T-001')).find((year) => year.id === 'FY-T001-2027')!)).toBe('upcoming');
  });

  it('DENY: tenant isolation — a tenant cannot close another tenant’s fiscal year (NOT_FOUND)', async () => {
    const result = await settingsService.closeFiscalYear('T-001', 'FY-T002-2026');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
    expect((await settingsService.listFiscalYears('T-002')).find((year) => year.id === 'FY-T002-2026')?.isClosed).toBe(false);
  });

  it('the "Ouvrir l’exercice" action no longer exists — upcoming/in-progress are derived from dates only', () => {
    expect('openFiscalYear' in settingsService).toBe(false);
  });
});

describe('settingsService — IMPLEMENTATION GO: createFiscalYear (D-FY-01, CREATE ≠ CLOSE)', () => {
  it('ALLOW: createFiscalYear creates a new, never-closed fiscal year for the requesting tenant, without touching the current one', async () => {
    const before = await settingsService.listFiscalYears('T-002');
    const created = await settingsService.createFiscalYear('T-002', { startDate: '2028-01-01', endDate: '2028-12-31' });
    expect(created?.isClosed).toBe(false);
    expect(created && fiscalYearStatus(created, '2026-09-25')).toBe('upcoming');
    expect(created?.tenantId).toBe('T-002');
    const after = await settingsService.listFiscalYears('T-002');
    expect(after.length).toBe(before.length + 1);
    const current = await settingsService.getCurrentFiscalYear('T-002');
    expect(current?.id).toBe('FY-T002-2026'); // unchanged — creating a FY never closes/replaces the current one
  });

  it('DENY: createFiscalYear rejects an exact duplicate period already used by this tenant', async () => {
    const result = await settingsService.createFiscalYear('T-002', { startDate: '2028-01-01', endDate: '2028-12-31' });
    expect(result).toBeNull();
  });

  it('DENY: createFiscalYear rejects a period that overlaps an existing exercise of this tenant (mandat §23)', async () => {
    // FY-T002-2027 (upcoming, seed) couvre 2027-01-01 → 2027-12-31 : un exercice qui déborde dessus doit être refusé.
    const result = await settingsService.createFiscalYear('T-002', { startDate: '2027-06-01', endDate: '2028-06-01' });
    expect(result).toBeNull();
  });

  it('ALLOW: createFiscalYear accepts a period strictly contiguous to an existing exercise (no gap, no overlap)', async () => {
    const result = await settingsService.createFiscalYear('T-002', { startDate: '2029-01-01', endDate: '2029-12-31' });
    expect(result).not.toBeNull();
  });

  it('DENY: createFiscalYear rejects an invalid period (endDate not after startDate)', async () => {
    const result = await settingsService.createFiscalYear('T-002', { startDate: '2030-06-01', endDate: '2030-01-01' });
    expect(result).toBeNull();
  });

  it('ALLOW: createFiscalYear never touches another tenant\'s fiscal years', async () => {
    const t004Before = await settingsService.listFiscalYears('T-004');
    await settingsService.createFiscalYear('T-002', { startDate: '2031-01-01', endDate: '2031-12-31' });
    const t004After = await settingsService.listFiscalYears('T-004');
    expect(t004After.length).toBe(t004Before.length);
  });

  it('AUDIT (D-FY-06): createFiscalYear records a fiscalYears.create event in audit_logs', async () => {
    const before = auditEvents.length;
    const created = await settingsService.createFiscalYear('T-002', { startDate: '2032-01-01', endDate: '2032-12-31' });
    expect(auditEvents.length).toBe(before + 1);
    const event = auditEvents[auditEvents.length - 1];
    expect(event.action).toBe('fiscalYears.create');
    expect(event.tenantId).toBe('T-002');
    expect(event.resourceId).toBe(created?.id);
    expect(event.module).toBe('settings');
  });

  it('TRANSFER SELECTION CORRECTION: createFiscalYear records only the categories actually selected, never all of them implicitly', async () => {
    const before = auditEvents.length;
    await settingsService.createFiscalYear('T-002', { startDate: '2034-01-01', endDate: '2034-12-31', transferSelections: ['tontineConfig', 'activeMembers'] });
    const event = auditEvents[auditEvents.length - 1];
    expect(auditEvents.length).toBe(before + 1);
    expect(event.context?.transferSelections).toBe('tontineConfig,activeMembers');
  });

  it('TRANSFER SELECTION CORRECTION: createFiscalYear accepts an empty selection (no category is mandatory)', async () => {
    const created = await settingsService.createFiscalYear('T-002', { startDate: '2035-01-01', endDate: '2035-12-31', transferSelections: [] });
    expect(created).not.toBeNull();
    const event = auditEvents[auditEvents.length - 1];
    expect(event.context?.transferSelections).toBe('');
  });
});

describe('settingsService — §24-BIS: requestFiscalYearReopen (D-FY-05, workflow demande → approbation, jamais direct)', () => {
  it('ALLOW: requestFiscalYearReopen creates a pending WorkflowRequest, WITHOUT touching the fiscal year closure', async () => {
    const before = await settingsService.getCurrentFiscalYear('T-005');
    const request = await settingsService.requestFiscalYearReopen('T-005', 'FY-T005-2025', 'Correction comptable exceptionnelle');
    expect(request?.status).toBe('pending');
    expect(request?.domain).toBe('settings');
    expect(request?.entityType).toBe('fiscalYear');
    expect(request?.justification).toBe('Correction comptable exceptionnelle');
    const years = await settingsService.listFiscalYears('T-005');
    expect(years.find((item) => item.id === 'FY-T005-2025')?.isClosed).toBe(true); // never touched by the request itself
    const currentAfter = await settingsService.getCurrentFiscalYear('T-005');
    expect(currentAfter?.id).toBe(before?.id);
  });

  it('DENY: requestFiscalYearReopen requires a non-empty justification', async () => {
    const result = await settingsService.requestFiscalYearReopen('T-001', 'FY-T001-2024', '   ');
    expect(result).toBeNull();
  });

  it('DENY: requestFiscalYearReopen only accepts a fiscal year whose status is "closed"', async () => {
    const result = await settingsService.requestFiscalYearReopen('T-002', 'FY-T002-2027', 'Motif quelconque'); // FY-T002-2027 is 'upcoming', not 'closed'
    expect(result).toBeNull();
  });

  it('DENY: requestFiscalYearReopen refuses a fiscal year belonging to another tenant', async () => {
    const result = await settingsService.requestFiscalYearReopen('T-004', 'FY-T005-2025', 'Tentative inter-tenant');
    expect(result).toBeNull();
  });

  it('DENY: requestFiscalYearReopen refuses a second request while one is already pending for the same fiscal year', async () => {
    const first = await settingsService.requestFiscalYearReopen('T-001', 'FY-T001-2024', 'Première demande');
    expect(first).not.toBeNull();
    const second = await settingsService.requestFiscalYearReopen('T-001', 'FY-T001-2024', 'Deuxième demande');
    expect(second).toBeNull();
  });

  it('AUDIT (D-FY-06): requestFiscalYearReopen records a fiscalYears.reopenRequested event with the justification', async () => {
    const before = auditEvents.length;
    const request = await settingsService.requestFiscalYearReopen('T-003', 'FY-T003-2025', 'Vérification exceptionnelle du régulateur');
    expect(auditEvents.length).toBe(before + 1);
    const event = auditEvents[auditEvents.length - 1];
    expect(event.action).toBe('fiscalYears.reopenRequested');
    expect(event.tenantId).toBe('T-003');
    expect(event.context?.justification).toBe('Vérification exceptionnelle du régulateur');
    expect(event.context?.requestId).toBe(request?.id);
  });
});

describe('settingsService — §24-BIS: applyFiscalYearReopenDecision (le statut ne change qu\'après décision du moteur workflow générique)', () => {
  it('ALLOW: approving via the generic workflowService.submitAction, then applying the decision, lifts the closure of the fiscal year', async () => {
    const request = await settingsService.requestFiscalYearReopen('T-002', 'FY-T002-2025', 'Justification pour approbation');
    expect(request).not.toBeNull();
    const approved = await workflowService.submitAction('T-002', request!.id, 'approve', 'Amadou Mbaye');
    expect(approved?.status).toBe('approved'); // single-step workflow (WD-005) -> immediately final
    const before = auditEvents.length;
    await settingsService.applyFiscalYearReopenDecision('T-002', approved!);
    const years = await settingsService.listFiscalYears('T-002');
    const year = years.find((item) => item.id === 'FY-T002-2025');
    expect(year?.isClosed).toBe(false);
    const current = await settingsService.getCurrentFiscalYear('T-002');
    expect(current?.id).toBe('FY-T002-2026'); // unchanged
    const event = auditEvents[auditEvents.length - 1];
    expect(auditEvents.length).toBe(before + 1);
    expect(event.action).toBe('fiscalYears.reopened');
    expect(event.tenantId).toBe('T-002');
  });

  it('DENY: rejecting via the generic engine leaves the fiscal year closed, no fiscalYears.reopened event', async () => {
    await settingsService.closeFiscalYear('T-004', 'FY-T004-2026'); // FY-T004-2026 (en cours) -> clôturé, so T-004 has a closed year to test against
    const request = await settingsService.requestFiscalYearReopen('T-004', 'FY-T004-2026', 'Justification pour rejet');
    expect(request).not.toBeNull();
    const rejected = await workflowService.submitAction('T-004', request!.id, 'reject', 'Amadou Mbaye', 'Motif insuffisant');
    expect(rejected?.status).toBe('rejected');
    const before = auditEvents.length;
    await settingsService.applyFiscalYearReopenDecision('T-004', rejected!);
    const years = await settingsService.listFiscalYears('T-004');
    expect(years.find((item) => item.id === 'FY-T004-2026')?.isClosed).toBe(true);
    expect(auditEvents.slice(before).some((event) => event.action === 'fiscalYears.reopened')).toBe(false);
  });

  it('applyFiscalYearReopenDecision is a no-op for any other domain (does not touch unrelated WorkflowRequests)', async () => {
    const tontineRequest = await workflowService.getRequest('T-005', 'WR-004'); // seeded tontines request, unrelated to Fiscal Year
    expect(tontineRequest).not.toBeNull();
    expect(tontineRequest?.domain).toBe('tontines');
    await settingsService.applyFiscalYearReopenDecision('T-005', tontineRequest!);
    const stillSame = await workflowService.getRequest('T-005', 'WR-004');
    expect(stillSame?.status).toBe(tontineRequest?.status); // untouched
  });
});

describe('settingsService — Notifications', () => {
  it('DENY: updateNotificationChannel cannot mutate a channel of another tenant', async () => {
    const result = await settingsService.updateNotificationChannel('T-001', 'NC-005', false); // NC-005 belongs to T-002
    expect(result).toBeNull();
  });

  it('DENY: updateNotificationRule cannot mutate a rule of another tenant', async () => {
    const result = await settingsService.updateNotificationRule('T-002', 'NR-001', false); // NR-001 belongs to T-001
    expect(result).toBeNull();
  });

  it('ALLOW: updateNotificationChannel mutates a channel of the owning tenant', async () => {
    const result = await settingsService.updateNotificationChannel('T-001', 'NC-001', false);
    expect(result?.enabled).toBe(false);
  });
});

describe('settingsService — Security policies (single-tenant patch, no cross-tenant leak)', () => {
  it('ALLOW/DENY: updateSecurityPolicies only mutates the requesting tenant\'s 4 policies', async () => {
    const [password, session, mfa, login] = await Promise.all([
      settingsService.getPasswordPolicy('T-002'),
      settingsService.getSessionPolicy('T-002'),
      settingsService.getMfaPolicy('T-002'),
      settingsService.getLoginPolicy('T-002'),
    ]);
    const t001MinLengthBefore = (await settingsService.getPasswordPolicy('T-001'))?.minLength;

    const patch = {
      password: { minLength: 99, requireUppercase: true, requireNumber: true, requireSymbol: true, expiryDays: 30, preventReuseCount: 5 },
      session: session!,
      mfa: mfa!,
      login: login!,
    };
    const updated = await settingsService.updateSecurityPolicies('T-002', patch);
    expect(updated).not.toBeNull();

    const t001After = await settingsService.getPasswordPolicy('T-001');
    expect(t001After?.minLength).toBe(t001MinLengthBefore);
    expect(t001After?.minLength).not.toBe(99);

    const t002After = await settingsService.getPasswordPolicy('T-002');
    expect(t002After?.minLength).toBe(99);
    expect(password).toBeTruthy();
  });
});

describe('settingsService — Modules', () => {
  it('ALLOW: updateModule only mutates the requesting tenant\'s module config', async () => {
    const t002Before = (await settingsService.listModules('T-002')).find((module_) => module_.key === 'finance');
    const updated = await settingsService.updateModule('T-001', 'finance', false);
    expect(updated?.enabled).toBe(false);
    const t002After = (await settingsService.listModules('T-002')).find((module_) => module_.key === 'finance');
    expect(t002After?.enabled).toBe(t002Before?.enabled);
  });

  it('DENY: updateModule returns null for a tenant with no seeded module config', async () => {
    const result = await settingsService.updateModule('T-999', 'finance', true);
    expect(result).toBeNull();
  });
});

describe('settingsService — decideFiscalYearReopen (D-FY-07/D-FY-08 IMPLEMENTATION GO: auto-approbation bloquée côté service, pas seulement RBAC)', () => {
  async function findReopenRequest(tenantId: string, fiscalYearId: string, status: 'pending' | 'approved' | 'rejected') {
    const requests = await settingsService.listReopenRequests(tenantId);
    return requests.find((request) => request.entityId === fiscalYearId && request.status === status);
  }

  it('DENY: the requester cannot approve their own reopening request, even as role-admin holding fiscalYears.approve (§7 mandat — RBAC alone cannot separate requester/approver for role-admin, reuses the pending request seeded earlier in this file by requestFiscalYearReopen tests)', async () => {
    const request = await findReopenRequest('T-001', 'FY-T001-2024', 'pending');
    expect(request).toBeDefined();
    expect(request?.requestedByUserId).toBe('U-001'); // currentUser.id — the mock actor behind requestFiscalYearReopen
    const blocked = await settingsService.decideFiscalYearReopen('T-001', request!.id, 'approve', 'U-001', 'Amadou Mbaye');
    expect(blocked).toBeNull();
    const years = await settingsService.listFiscalYears('T-001');
    expect(years.find((item) => item.id === 'FY-T001-2024')?.isClosed).toBe(true); // untouched
    const stillPending = await workflowService.getRequest('T-001', request!.id);
    expect(stillPending?.status).toBe('pending'); // never mutated by the blocked attempt
  });

  it('ALLOW: a different actor can approve the very request that was just blocked for the requester — fiscal year opens, fiscalYears.reopenApproved recorded', async () => {
    const request = await findReopenRequest('T-001', 'FY-T001-2024', 'pending');
    expect(request).toBeDefined();
    const before = auditEvents.length;
    const approved = await settingsService.decideFiscalYearReopen('T-001', request!.id, 'approve', 'U-777', 'Autre Approbateur');
    expect(approved?.status).toBe('approved');
    const years = await settingsService.listFiscalYears('T-001');
    expect(years.find((item) => item.id === 'FY-T001-2024')?.isClosed).toBe(false);
    const events = auditEvents.slice(before);
    expect(events.some((event) => event.action === 'fiscalYears.reopenApproved')).toBe(true);
    expect(events.some((event) => event.action === 'fiscalYears.reopened')).toBe(true);
  });

  it('IDEMPOTENCE: approving an already-approved request again does not duplicate the audit trail or re-toggle the fiscal year', async () => {
    const request = await findReopenRequest('T-001', 'FY-T001-2024', 'approved');
    expect(request).toBeDefined();
    const before = auditEvents.length;
    const result = await settingsService.decideFiscalYearReopen('T-001', request!.id, 'approve', 'U-888', 'Encore un autre');
    expect(result?.status).toBe('approved'); // unchanged, submitAction's own pending-guard already handles this
    const years = await settingsService.listFiscalYears('T-001');
    expect(years.find((item) => item.id === 'FY-T001-2024')?.isClosed).toBe(false); // still reopened, not re-toggled
    expect(auditEvents.length).toBe(before); // no new fiscalYears.reopenApproved / fiscalYears.reopened
  });

  it('DENY: rejecting by a different actor records fiscalYears.reopenRejected and leaves the fiscal year closed', async () => {
    const request = await findReopenRequest('T-005', 'FY-T005-2025', 'pending');
    expect(request).toBeDefined();
    const before = auditEvents.length;
    const rejected = await settingsService.decideFiscalYearReopen('T-005', request!.id, 'reject', 'U-777', 'Autre Approbateur', 'Justification insuffisante');
    expect(rejected?.status).toBe('rejected');
    const years = await settingsService.listFiscalYears('T-005');
    expect(years.find((item) => item.id === 'FY-T005-2025')?.isClosed).toBe(true);
    const events = auditEvents.slice(before);
    expect(events.some((event) => event.action === 'fiscalYears.reopenRejected')).toBe(true);
    expect(events.some((event) => event.action === 'fiscalYears.reopened')).toBe(false);
  });

  it('TENANT ISOLATION: decideFiscalYearReopen cannot act on a reopening request belonging to another tenant', async () => {
    const request = await findReopenRequest('T-003', 'FY-T003-2025', 'pending');
    expect(request).toBeDefined();
    const result = await settingsService.decideFiscalYearReopen('T-001', request!.id, 'approve', 'U-777', 'Intrus');
    expect(result).toBeNull();
    const years = await settingsService.listFiscalYears('T-003');
    expect(years.find((item) => item.id === 'FY-T003-2025')?.isClosed).toBe(true);
  });

  it('DEFENSIVE: decideFiscalYearReopen returns null for a request outside the settings/fiscalYear domain — never imposes the self-approval rule on other domains (Credit/Tontines/Governance/Finance), which have no PO decision on the subject', async () => {
    const result = await settingsService.decideFiscalYearReopen('T-005', 'WR-004', 'approve', 'U-777', 'Amadou Mbaye'); // WR-004: seeded tontines request
    expect(result).toBeNull();
  });

  it('LEGACY DATA: a WorkflowRequest without requestedByUserId (created directly via workflowService.createRequest, bypassing requestFiscalYearReopen) is never blocked by the self-approval check', async () => {
    const legacyRequest = await workflowService.createRequest('T-002', 'WD-005', { entityId: 'FY-T002-LEGACY', entityLabel: 'Exercice legacy (sans requestedByUserId)', requestedBy: 'Ancien Demandeur' });
    expect(legacyRequest?.requestedByUserId).toBeUndefined();
    const result = await settingsService.decideFiscalYearReopen('T-002', legacyRequest!.id, 'approve', 'U-001', 'Amadou Mbaye');
    expect(result?.status).toBe('approved'); // the guard only fires when requestedByUserId is set — no false positive on legacy/incomplete data
  });
});

/**
 * Mandat « Évolution du cycle de vie des exercices fiscaux » §8/§9 — clôture
 * validée : intégration avec le moteur de clôture financière, opérations en
 * attente signalées (jamais bloquantes). Chaque test crée son propre exercice
 * dans le PASSÉ (une clôture exige un exercice commencé, statut « En cours »)
 * sur une plage libre du tenant, plutôt que de dépendre d'un exercice de seed
 * éventuellement déjà clôturé par un test antérieur.
 */
describe('settingsService — closeFiscalYear: clôture financière intégrée + opérations en attente signalées, jamais bloquantes', () => {
  it('ALLOW: closing creates the financial ClosingEntry FINAL for every cashbox and reports (without blocking) a pending distribution dated within the period', async () => {
    const tenantId = 'T-001';
    const year = await settingsService.createFiscalYear(tenantId, { startDate: '1990-01-01', endDate: '1990-12-31' });
    expect(year).toBeTruthy();
    // Opération en attente dans la période — signalée, jamais bloquante (voir le commentaire de closeFiscalYear).
    distributions.push({ id: `DI-TEST-${Date.now()}`, tenantId, beneficiary: 'Test', source: 'Test', amount: 10_000, date: '1990-06-15', status: 'pending' });

    const result = await settingsService.closeFiscalYear(tenantId, year!.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.year.isClosed).toBe(true);
      expect(result.pendingOperations.distributions).toBeGreaterThanOrEqual(1);
    }
    // L'exercice est désormais clôturé (clôture incluse dans closeFiscalYear) : un
    // second appel direct au moteur financier est refusé par la garde de statut en amont
    // (FISCAL_YEAR_NOT_OPEN), pas par ALREADY_CLOSED (qui suppose l'exercice non clôturé avec des
    // ClosingEntry déjà posées — le scénario exercé séparément par le test IDEMPOTENT ci-dessous).
    const financeAgain = await financePositionService.closeFiscalYear(tenantId, year!.id);
    expect(financeAgain?.ok).toBe(false);
    if (financeAgain && !financeAgain.ok) expect(financeAgain.reason).toBe('FISCAL_YEAR_NOT_OPEN');
  });

  it('IDEMPOTENT: closing gouvernance after the financial closing was already done separately does not block (ALREADY_CLOSED treated as a satisfied precondition, not a failure)', async () => {
    const financeFirst = await financePositionService.closeFiscalYear('T-002', 'FY-T002-2026');
    expect(financeFirst?.ok).toBe(true);
    const result = await settingsService.closeFiscalYear('T-002', 'FY-T002-2026');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.year.isClosed).toBe(true);
  });
});

/**
 * Mandat §6 — prorogation. Chaque cas crée son propre exercice (préfixé par un
 * horodatage) pour rester indépendant de l'état laissé par les tests ci-dessus.
 */
describe('settingsService — extendFiscalYearEndDate (prorogation)', () => {
  it('ALLOW: extends the end date of an upcoming fiscal year, audited as fiscalYears.extend', async () => {
    const created = await settingsService.createFiscalYear('T-003', { startDate: '2030-01-01', endDate: '2030-12-31' });
    expect(created).toBeTruthy();
    const before = auditEvents.length;
    const result = await settingsService.extendFiscalYearEndDate('T-003', created!.id, '2031-01-31');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.year.endDate).toBe('2031-01-31');
    expect(auditEvents.length).toBe(before + 1);
    expect(auditEvents[auditEvents.length - 1].action).toBe('fiscalYears.extend');
  });

  it('DENY: refuses a new end date that is not strictly after the current one', async () => {
    // 2032 (pas 2031) : le test précédent a prorogé son exercice T-003 jusqu'au 2031-01-31, donc 2031-2031 chevaucherait désormais (mandat §23 — chevauchement refusé).
    const created = await settingsService.createFiscalYear('T-003', { startDate: '2032-01-01', endDate: '2032-12-31' });
    const result = await settingsService.extendFiscalYearEndDate('T-003', created!.id, '2032-06-01');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_AN_EXTENSION');
  });

  it('DENY: refuses to extend a closed fiscal year (T-003\'s FY-T003-2026, closed by the first test in this file)', async () => {
    const result = await settingsService.extendFiscalYearEndDate('T-003', 'FY-T003-2026', '2027-06-30');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('CLOSED');
  });

  it('DENY: refuses an extension that would overlap an already-existing next fiscal year', async () => {
    const first = await settingsService.createFiscalYear('T-004', { startDate: '2040-01-01', endDate: '2040-12-31' });
    const second = await settingsService.createFiscalYear('T-004', { startDate: '2041-01-01', endDate: '2041-12-31' });
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    const result = await settingsService.extendFiscalYearEndDate('T-004', first!.id, '2041-06-30');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('OVERLAPS_NEXT_YEAR');
  });
});

/**
 * Mandat §14 — avertissements de réouverture (non bloquants). Chaque test
 * construit son propre couple d'exercices passés (create → close) pour rester
 * indépendant des exercices de seed déjà consommés par les tests précédents.
 */
describe('settingsService — requestFiscalYearReopen: avertissements non bloquants', () => {
  it('WARNING: flags NEXT_YEAR_ACTIVE when a later fiscal year already exists for the tenant, without blocking the request', async () => {
    const tenantId = 'T-004';
    const target = await settingsService.createFiscalYear(tenantId, { startDate: '1950-01-01', endDate: '1950-12-31' });
    const next = await settingsService.createFiscalYear(tenantId, { startDate: '1951-01-01', endDate: '1951-12-31' });
    expect(target).toBeTruthy();
    expect(next).toBeTruthy();
    const closed = await settingsService.closeFiscalYear(tenantId, target!.id);
    expect(closed.ok).toBe(true);
    const request = await settingsService.requestFiscalYearReopen(tenantId, target!.id, 'Vérification avec avertissement attendu');
    expect(request).toBeTruthy();
    expect(request?.warnings).toContain('NEXT_YEAR_ACTIVE');
    expect(request?.warnings).not.toContain('CARRY_FORWARD_APPLIED');
  });

  it('NO WARNING: an empty warnings array when no later fiscal year exists for the tenant', async () => {
    const tenantId = 'T-004';
    // Le DERNIER exercice du tenant est forcément dans le futur (À venir), donc non clôturable par
    // `closeFiscalYear` (NOT_STARTED) : la clôture est posée directement sur la donnée de test — seul
    // le calcul des avertissements de réouverture est exercé ici.
    const target = await settingsService.createFiscalYear(tenantId, { startDate: '2160-01-01', endDate: '2160-12-31' });
    expect(target).toBeTruthy();
    fiscalYears.find((year) => year.id === target!.id)!.isClosed = true;
    const request = await settingsService.requestFiscalYearReopen(tenantId, target!.id, 'Aucun exercice suivant');
    expect(request?.warnings ?? []).toEqual([]);
  });
});

/**
 * Mandat §25/§26 — le cache d'affichage closedAt/closedBy représente l'état
 * COURANT, remis à null lors d'une réouverture ; l'historique complet de la
 * clôture reste dans l'audit (jamais effacé).
 */
describe('settingsService — applyFiscalYearReopenDecision: cache closedAt/closedBy remis à null', () => {
  it('ALLOW: reopening resets closedAt/closedBy on the entity while the audit trail keeps the close/reopen history', async () => {
    const tenantId = 'T-004';
    const target = await settingsService.createFiscalYear(tenantId, { startDate: '1970-01-01', endDate: '1970-12-31' });
    expect(target).toBeTruthy();
    const closed = await settingsService.closeFiscalYear(tenantId, target!.id);
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.year.closedAt).not.toBeNull();
      expect(closed.year.closedBy).toBeTruthy();
    }
    const request = await settingsService.requestFiscalYearReopen(tenantId, target!.id, 'Correction pour test de reset du cache');
    expect(request).toBeTruthy();
    await settingsService.applyFiscalYearReopenDecision(tenantId, { ...request!, status: 'approved' });
    const years = await settingsService.listFiscalYears(tenantId);
    const year = years.find((item) => item.id === target!.id);
    expect(year?.isClosed).toBe(false);
    expect(year?.closedAt).toBeNull();
    expect(year?.closedBy).toBeNull();
    expect(auditEvents.some((event) => event.tenantId === tenantId && event.action === 'fiscalYears.close' && event.resourceId === target!.id)).toBe(true);
    expect(auditEvents.some((event) => event.tenantId === tenantId && event.action === 'fiscalYears.reopened' && event.resourceId === target!.id)).toBe(true);
  });
});
