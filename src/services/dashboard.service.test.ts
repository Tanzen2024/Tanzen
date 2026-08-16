import { describe, it, expect } from 'vitest';
import { dashboardService } from './dashboard.service';
import { organizationService } from './organization.service';

describe('dashboardService — getOverview aggregates only the requesting tenant\'s data', () => {
  it('ALLOW/DENY: the members KPI matches the tenant\'s own member count, not a global total', async () => {
    const [t001Overview, t001Members, t002Members] = await Promise.all([
      dashboardService.getOverview('T-001'),
      organizationService.listMembers('T-001'),
      organizationService.listMembers('T-002'),
    ]);
    expect(t001Overview.kpis.members.value).toBe(t001Members.length);
    expect(t001Overview.kpis.members.value).not.toBe(t001Members.length + t002Members.length);
  });

  it('DENY: recentActivity never surfaces a member belonging to another tenant', async () => {
    const [t002Overview, t002Members] = await Promise.all([dashboardService.getOverview('T-002'), organizationService.listMembers('T-002')]);
    const t002MemberIds = new Set(t002Members.map((member) => member.id));
    const memberActivity = t002Overview.recentActivity.find((activity) => activity.id.startsWith('activity-member-'));
    if (memberActivity) {
      const memberId = memberActivity.id.replace('activity-member-', '');
      expect(t002MemberIds.has(memberId)).toBe(true);
    }
  });

  it('two different tenants produce independent, non-identical overviews', async () => {
    const [t001, t002] = await Promise.all([dashboardService.getOverview('T-001'), dashboardService.getOverview('T-002')]);
    expect(t001.kpis.treasury.value).not.toBe(t002.kpis.treasury.value);
  });
});
