import { describe, it, expect } from 'vitest';
import { settingsService } from './settings.service';

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
