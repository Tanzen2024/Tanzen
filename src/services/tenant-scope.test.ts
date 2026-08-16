import { describe, it, expect } from 'vitest';
import { getTenantScoped } from './tenant-scope';

type Resource = { id: string; tenantId: string; name: string };

const items: Resource[] = [
  { id: 'R-001', tenantId: 'T-001', name: 'Alpha' },
  { id: 'R-002', tenantId: 'T-002', name: 'Beta' },
];

describe('getTenantScoped', () => {
  it('ALLOW: returns the resource when it belongs to the requesting tenant', () => {
    const result = getTenantScoped(items, (item) => item.id === 'R-001', 'T-001');
    expect(result).toEqual(items[0]);
  });

  it('DENY: returns undefined when the resource belongs to a different tenant', () => {
    const result = getTenantScoped(items, (item) => item.id === 'R-002', 'T-001');
    expect(result).toBeUndefined();
  });

  it('is indistinguishable between "not found" and "wrong tenant" (both undefined)', () => {
    const notFound = getTenantScoped(items, (item) => item.id === 'R-999', 'T-001');
    const wrongTenant = getTenantScoped(items, (item) => item.id === 'R-002', 'T-001');
    expect(notFound).toBeUndefined();
    expect(wrongTenant).toBeUndefined();
    expect(notFound).toBe(wrongTenant);
  });

  it('defaults requesterScope to "tenant" (strict) when omitted', () => {
    const result = getTenantScoped(items, (item) => item.id === 'R-002', 'T-001');
    expect(result).toBeUndefined();
  });

  it('PLATFORM BYPASS: returns the resource regardless of tenant when requesterScope is "platform"', () => {
    const result = getTenantScoped(items, (item) => item.id === 'R-002', 'T-001', 'platform');
    expect(result).toEqual(items[1]);
  });

  it('PLATFORM BYPASS still returns undefined for a genuinely missing resource', () => {
    const result = getTenantScoped(items, (item) => item.id === 'R-999', 'T-001', 'platform');
    expect(result).toBeUndefined();
  });
});
