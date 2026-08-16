import { describe, it, expect } from 'vitest';
import { auditService } from './audit.service';

describe('auditService', () => {
  it('ALLOW: list returns only seeded events of the requesting tenant', async () => {
    const result = await auditService.list('T-001');
    expect(result.some((event) => event.id === 'AUD-001')).toBe(true);
    expect(result.every((event) => event.tenantId === 'T-001')).toBe(true);
  });

  it('DENY: list never includes a seeded event of another tenant', async () => {
    const result = await auditService.list('T-001');
    expect(result.some((event) => event.id === 'AUD-003')).toBe(false); // AUD-003 belongs to T-002
  });

  it('DENY: get returns undefined for an event of another tenant', async () => {
    const result = await auditService.get('T-001', 'AUD-003');
    expect(result).toBeUndefined();
  });

  it('ALLOW: get returns the event when it belongs to the requesting tenant', async () => {
    const result = await auditService.get('T-002', 'AUD-003');
    expect(result?.id).toBe('AUD-003');
  });

  it('ALLOW/DENY: derived workflow-history events are tagged with the requesting tenantId, never another tenant\'s', async () => {
    const [t001, t002] = await Promise.all([auditService.list('T-001'), auditService.list('T-002')]);
    expect(t001.every((event) => event.tenantId === 'T-001')).toBe(true);
    expect(t002.every((event) => event.tenantId === 'T-002')).toBe(true);
  });
});
