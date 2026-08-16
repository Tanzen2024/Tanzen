import { describe, it, expect } from 'vitest';
import { notificationService } from './notification.service';

/**
 * Dual check (Phase 9) : `tenantId` ET `userId` doivent correspondre
 * simultanément — l'un des deux corrects ne suffit jamais.
 */
describe('notificationService — dual check tenantId + userId (Phase 9)', () => {
  it('ALLOW: correct tenantId AND correct userId', async () => {
    const result = await notificationService.list('T-001', 'U-001');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((notification) => notification.tenantId === 'T-001' && notification.userId === 'U-001')).toBe(true);
  });

  it('DENY: correct userId but wrong tenantId', async () => {
    const result = await notificationService.list('T-002', 'U-001');
    expect(result.some((notification) => notification.tenantId === 'T-001')).toBe(false);
  });

  it('DENY: correct tenantId but wrong userId', async () => {
    const result = await notificationService.list('T-001', 'U-999');
    expect(result).toEqual([]);
  });

  it('DENY: both tenantId and userId wrong', async () => {
    const result = await notificationService.list('T-002', 'U-999');
    expect(result).toEqual([]);
  });

  it('DENY: markAsRead refuses a notification of the correct tenant but wrong userId', async () => {
    const before = await notificationService.list('T-001', 'U-001');
    const target = before.find((notification) => !notification.read) ?? before[0];
    const result = await notificationService.markAsRead('T-001', 'U-999', target.id);
    expect(result).toBeNull();
  });

  it('DENY: markAsRead refuses a notification of the correct userId but wrong tenantId', async () => {
    const [t001] = await notificationService.list('T-001', 'U-001');
    const result = await notificationService.markAsRead('T-002', 'U-001', t001.id);
    expect(result).toBeNull();
  });

  it('ALLOW: markAsRead succeeds when both tenantId and userId match', async () => {
    const [t002] = await notificationService.list('T-002', 'U-001');
    const result = await notificationService.markAsRead('T-002', 'U-001', t002.id);
    expect(result?.read).toBe(true);
  });

  it('ALLOW: markAllAsRead only affects notifications matching both tenantId and userId', async () => {
    const before = await notificationService.list('T-004', 'U-001');
    expect(before.length).toBeGreaterThan(0);
    const after = await notificationService.markAllAsRead('T-004', 'U-001');
    expect(after.every((notification) => notification.read)).toBe(true);
    // A different tenant's notifications must remain untouched by this call.
    const otherTenant = await notificationService.list('T-005', 'U-001');
    expect(otherTenant.some((notification) => !notification.read)).toBe(true);
  });
});
