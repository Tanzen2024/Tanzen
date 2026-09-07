import { describe, it, expect } from 'vitest';
import { settingsService } from './settings.service';
import { workflowService } from './workflow.service';
import { auditEvents } from '@/mocks/audit/audit-events';
import { fiscalYearTransferCategories } from '@/mocks/settings/fiscal-year-transfer-categories';

describe('fiscalYearTransferCategories — TRANSFER SELECTION CORRECTION (D-FY-07/08 gate §11)', () => {
  it('`transferable` is consistently derived from `transferability` (TRANSFERABLE/PARTIAL -> true, else false)', () => {
    for (const category of fiscalYearTransferCategories) {
      const expected = category.transferability === 'TRANSFERABLE' || category.transferability === 'PARTIAL';
      expect(category.transferable).toBe(expected);
    }
  });

  it('exactly the 4 permanent/tenant-scoped categories are transferable, not all 9', () => {
    const transferableIds = fiscalYearTransferCategories.filter((c) => c.transferable).map((c) => c.id);
    expect(transferableIds.sort()).toEqual(['accountsConfig', 'activeMembers', 'loanRules', 'tontineConfig'].sort());
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

  it('DENY: updateLocalizationSettings returns null for a tenant with no seeded settings', async () => {
    const result = await settingsService.updateLocalizationSettings('T-999', { timezone: 'Africa/Test' });
    expect(result).toBeNull();
  });
});

describe('settingsService — REGRESSION: fiscal year isCurrent invariant (Phase 11)', () => {
  it('ALLOW: closeCurrentFiscalYear closes the current year and clears isCurrent', async () => {
    const before = await settingsService.getCurrentFiscalYear('T-003');
    expect(before?.status).toBe('open');
    const closed = await settingsService.closeCurrentFiscalYear('T-003');
    expect(closed?.status).toBe('closed');
    expect(closed?.isCurrent).toBe(false);
    const current = await settingsService.getCurrentFiscalYear('T-003');
    expect(current).toBeNull();
  });

  it('DENY: closeCurrentFiscalYear is a no-op when there is no open current year', async () => {
    // T-003 was just closed above by the previous test in this same module instance.
    const result = await settingsService.closeCurrentFiscalYear('T-003');
    expect(result).toBeNull();
  });

  it('BUG FIXED: opening a new fiscal year clears isCurrent on the previously-current year (never two current years for one tenant)', async () => {
    const years = await settingsService.listFiscalYears('T-001');
    const upcoming = years.find((year) => year.status === 'upcoming');
    expect(upcoming).toBeTruthy();
    const previousCurrent = await settingsService.getCurrentFiscalYear('T-001');
    expect(previousCurrent).not.toBeNull();
    const previousCurrentId = previousCurrent?.id;

    const opened = await settingsService.openFiscalYear('T-001', upcoming!.id);
    expect(opened?.status).toBe('open');
    expect(opened?.isCurrent).toBe(true);

    const allYears = await settingsService.listFiscalYears('T-001');
    const currentOnes = allYears.filter((year) => year.isCurrent);
    expect(currentOnes.length).toBe(1);
    expect(currentOnes[0].id).toBe(upcoming!.id);
    // The previously-current year must have lost isCurrent, but its status is untouched (no invented cascade).
    const previousYear = allYears.find((year) => year.id === previousCurrentId);
    expect(previousYear?.isCurrent).toBe(false);
    expect(previousYear?.status).toBe('open');
  });

  it('DENY: openFiscalYear only opens a fiscal year belonging to the requesting tenant', async () => {
    const [t002Upcoming] = (await settingsService.listFiscalYears('T-002')).filter((year) => year.status === 'upcoming');
    if (t002Upcoming) {
      const result = await settingsService.openFiscalYear('T-001', t002Upcoming.id);
      expect(result).toBeNull();
    }
  });
});

describe('settingsService — IMPLEMENTATION GO: createFiscalYear (D-FY-01, CREATE ≠ CLOSE)', () => {
  it('ALLOW: createFiscalYear creates a new upcoming fiscal year for the requesting tenant, without touching the current one', async () => {
    const before = await settingsService.listFiscalYears('T-002');
    const created = await settingsService.createFiscalYear('T-002', { label: 'Exercice 2028', startDate: '2028-01-01', endDate: '2028-12-31' });
    expect(created?.status).toBe('upcoming');
    expect(created?.isCurrent).toBe(false);
    expect(created?.tenantId).toBe('T-002');
    const after = await settingsService.listFiscalYears('T-002');
    expect(after.length).toBe(before.length + 1);
    const current = await settingsService.getCurrentFiscalYear('T-002');
    expect(current?.id).toBe('FY-T002-2026'); // unchanged — creating a FY never closes/replaces the current one
  });

  it('DENY: createFiscalYear rejects a duplicate (same label already used by this tenant)', async () => {
    const result = await settingsService.createFiscalYear('T-002', { label: 'Exercice 2026', startDate: '2029-01-01', endDate: '2029-12-31' });
    expect(result).toBeNull();
  });

  it('DENY: createFiscalYear rejects an invalid period (endDate not after startDate)', async () => {
    const result = await settingsService.createFiscalYear('T-002', { label: 'Exercice invalide', startDate: '2030-06-01', endDate: '2030-01-01' });
    expect(result).toBeNull();
  });

  it('ALLOW: createFiscalYear never touches another tenant\'s fiscal years', async () => {
    const t004Before = await settingsService.listFiscalYears('T-004');
    await settingsService.createFiscalYear('T-002', { label: 'Exercice 2031', startDate: '2031-01-01', endDate: '2031-12-31' });
    const t004After = await settingsService.listFiscalYears('T-004');
    expect(t004After.length).toBe(t004Before.length);
  });

  it('AUDIT (D-FY-06): createFiscalYear records a fiscalYears.create event in audit_logs', async () => {
    const before = auditEvents.length;
    const created = await settingsService.createFiscalYear('T-002', { label: 'Exercice 2032', startDate: '2032-01-01', endDate: '2032-12-31' });
    expect(auditEvents.length).toBe(before + 1);
    const event = auditEvents[auditEvents.length - 1];
    expect(event.action).toBe('fiscalYears.create');
    expect(event.tenantId).toBe('T-002');
    expect(event.resourceId).toBe(created?.id);
    expect(event.module).toBe('settings');
  });

  it('TRANSFER SELECTION CORRECTION: createFiscalYear records only the categories actually selected, never all of them implicitly', async () => {
    const before = auditEvents.length;
    await settingsService.createFiscalYear('T-002', { label: 'Exercice 2034', startDate: '2034-01-01', endDate: '2034-12-31', transferSelections: ['tontineConfig', 'activeMembers'] });
    const event = auditEvents[auditEvents.length - 1];
    expect(auditEvents.length).toBe(before + 1);
    expect(event.context?.transferSelections).toBe('tontineConfig,activeMembers');
  });

  it('TRANSFER SELECTION CORRECTION: createFiscalYear accepts an empty selection (no category is mandatory)', async () => {
    const created = await settingsService.createFiscalYear('T-002', { label: 'Exercice 2035', startDate: '2035-01-01', endDate: '2035-12-31', transferSelections: [] });
    expect(created).not.toBeNull();
    const event = auditEvents[auditEvents.length - 1];
    expect(event.context?.transferSelections).toBe('');
  });
});

describe('settingsService — §24-BIS: requestFiscalYearReopen (D-FY-05, workflow demande → approbation, jamais direct)', () => {
  it('ALLOW: requestFiscalYearReopen creates a pending WorkflowRequest, WITHOUT touching the fiscal year status or isCurrent', async () => {
    const before = await settingsService.getCurrentFiscalYear('T-005');
    const request = await settingsService.requestFiscalYearReopen('T-005', 'FY-T005-2025', 'Correction comptable exceptionnelle');
    expect(request?.status).toBe('pending');
    expect(request?.domain).toBe('settings');
    expect(request?.entityType).toBe('fiscalYear');
    expect(request?.justification).toBe('Correction comptable exceptionnelle');
    const years = await settingsService.listFiscalYears('T-005');
    expect(years.find((item) => item.id === 'FY-T005-2025')?.status).toBe('closed'); // never touched by the request itself
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
  it('ALLOW: approving via the generic workflowService.submitAction, then applying the decision, opens the fiscal year — isCurrent still untouched', async () => {
    const request = await settingsService.requestFiscalYearReopen('T-002', 'FY-T002-2025', 'Justification pour approbation');
    expect(request).not.toBeNull();
    const approved = await workflowService.submitAction('T-002', request!.id, 'approve', 'Amadou Mbaye');
    expect(approved?.status).toBe('approved'); // single-step workflow (WD-005) -> immediately final
    const before = auditEvents.length;
    await settingsService.applyFiscalYearReopenDecision('T-002', approved!);
    const years = await settingsService.listFiscalYears('T-002');
    const year = years.find((item) => item.id === 'FY-T002-2025');
    expect(year?.status).toBe('open');
    expect(year?.isCurrent).toBe(false);
    const current = await settingsService.getCurrentFiscalYear('T-002');
    expect(current?.id).toBe('FY-T002-2026'); // unchanged
    const event = auditEvents[auditEvents.length - 1];
    expect(auditEvents.length).toBe(before + 1);
    expect(event.action).toBe('fiscalYears.reopened');
    expect(event.tenantId).toBe('T-002');
  });

  it('DENY: rejecting via the generic engine leaves the fiscal year closed, no fiscalYears.reopened event', async () => {
    await settingsService.closeCurrentFiscalYear('T-004'); // FY-T004-2026 (open/current) -> closed, so T-004 has a closed year to test against
    const request = await settingsService.requestFiscalYearReopen('T-004', 'FY-T004-2026', 'Justification pour rejet');
    expect(request).not.toBeNull();
    const rejected = await workflowService.submitAction('T-004', request!.id, 'reject', 'Amadou Mbaye', 'Motif insuffisant');
    expect(rejected?.status).toBe('rejected');
    const before = auditEvents.length;
    await settingsService.applyFiscalYearReopenDecision('T-004', rejected!);
    const years = await settingsService.listFiscalYears('T-004');
    expect(years.find((item) => item.id === 'FY-T004-2026')?.status).toBe('closed');
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
    expect(years.find((item) => item.id === 'FY-T001-2024')?.status).toBe('closed'); // untouched
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
    expect(years.find((item) => item.id === 'FY-T001-2024')?.status).toBe('open');
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
    expect(years.find((item) => item.id === 'FY-T001-2024')?.status).toBe('open'); // still open, not re-toggled
    expect(auditEvents.length).toBe(before); // no new fiscalYears.reopenApproved / fiscalYears.reopened
  });

  it('DENY: rejecting by a different actor records fiscalYears.reopenRejected and leaves the fiscal year closed', async () => {
    const request = await findReopenRequest('T-005', 'FY-T005-2025', 'pending');
    expect(request).toBeDefined();
    const before = auditEvents.length;
    const rejected = await settingsService.decideFiscalYearReopen('T-005', request!.id, 'reject', 'U-777', 'Autre Approbateur', 'Justification insuffisante');
    expect(rejected?.status).toBe('rejected');
    const years = await settingsService.listFiscalYears('T-005');
    expect(years.find((item) => item.id === 'FY-T005-2025')?.status).toBe('closed');
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
    expect(years.find((item) => item.id === 'FY-T003-2025')?.status).toBe('closed');
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
