import { describe, it, expect } from 'vitest';
import { financePositionService } from './finance-position.service';
import { members } from '@/mocks/organization/members';
import { cashboxes } from '@/mocks/finance/cashboxes';

/** Bilan des adhérents — isolation tenant assurée par le service (seul point où le `tenantId` entre en jeu). */
describe('financePositionService.memberBalanceSheets — isolation tenant', () => {
  const t001 = members.filter((member) => member.tenantId === 'T-001').map((member) => member.id);
  const foreignMember = members.find((member) => member.tenantId !== 'T-001')!;
  const foreignCashbox = cashboxes.find((cashbox) => cashbox.tenantId !== 'T-001')!;

  it('« ALL » = exactement les adhérents du tenant ; synthèse = somme des bilans', async () => {
    const { sheets, summary } = await financePositionService.memberBalanceSheets('T-001', { memberIds: 'ALL', asOfDate: '2026-12-31' });
    expect(sheets.map((sheet) => sheet.memberId).sort()).toEqual([...t001].sort());
    expect(summary.memberCount).toBe(t001.length);
    expect(summary.savings).toBe(sheets.reduce((sum, sheet) => sum + sheet.savings, 0));
    expect(summary.debt).toBe(sheets.reduce((sum, sheet) => sum + sheet.debt, 0));
    expect(summary.netPosition).toBeCloseTo(summary.savings + summary.gains - summary.debt, 6);
  });

  it('un adhérent d’un autre tenant n’est jamais calculé ; une caisse d’un autre tenant est ignorée', async () => {
    const { sheets } = await financePositionService.memberBalanceSheets('T-001', { memberIds: [t001[0], foreignMember.id], asOfDate: '2026-12-31', cashboxId: foreignCashbox.id });
    expect(sheets.map((sheet) => sheet.memberId)).toEqual([t001[0]]);
    expect(sheets[0].cashboxId).toBeNull();
  });
});
