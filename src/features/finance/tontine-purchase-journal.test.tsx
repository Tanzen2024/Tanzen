import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { tontinesService } from '@/services/tontines.service';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { transactions } from '@/mocks/finance/transactions';

/**
 * Mandat « Achat de tontine → crédit automatique » (2026-09-27), TEST 7 : l'achat enregistré
 * côté Tontine apparaît dans Finance → Transactions, caisse « Achat tontine », en Crédit du
 * montant exact, action « Autres », commentaire d'origine « Achat tontine … ».
 */
describe('Finance → Transactions — achat de tontine', () => {
  it('la transaction générée figure au journal : caisse Achat tontine, adhérent, action Autres, crédit 50 000, débit —', async () => {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Horizon ${Date.now()}`, valueType: 'MONEY', contributionAmount: 10_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, withPurchase: true,
    } as never);
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 50_000);

    const cashbox = cashboxes.find((item) => item.tenantId === 'T-001' && item.systemCode === 'TONTINE_PURCHASE')!;
    renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: `/finance/treasury/transactions?cashboxId=${cashbox.id}` });
    const comment = await screen.findByText(`Achat tontine ${tontine!.name} — tour ${occurrence!.occurrenceNumber}`, {}, { timeout: 10_000 });
    const row = comment.closest('tr')!;
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim());
    const cells = within(row).getAllByRole('cell');
    const cell = (name: string) => cells[headers.indexOf(name)];
    expect(cell('Caisse')).toHaveTextContent('Achat tontine');
    expect(cell('Adhérent')).toHaveTextContent(adhesion!.memberName);
    expect(cell('Actions')).toHaveTextContent('Autres');
    expect(cell('Débit')).toHaveTextContent('—');
    expect(cell('Crédit').textContent?.replace(/\D/g, '')).toBe('50000');
  }, 30_000);

  it('TEST 8 — la fiche de la transaction identifie l’origine de l’achat : tontine, tour, adhérent acheteur, montant', async () => {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Horizon ${Date.now()}`, valueType: 'MONEY', contributionAmount: 10_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, withPurchase: true,
    } as never);
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 50_000);
    const tx = transactions.find((item) => item.tontineBeneficiaryId === beneficiary!.id)!;

    renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: `/finance/transactions/${tx.id}` });
    expect(await screen.findByRole('button', { name: tontine!.name }, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByText('Tour concerné')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^Tour ${occurrence!.occurrenceNumber} · cycle 1 — `))).toBeInTheDocument();
    expect(screen.getByText('Adhérent acheteur').parentElement).toHaveTextContent(adhesion!.memberName);
    expect(screen.getByText('Montant de l’achat').parentElement?.textContent?.replace(/\D/g, '')).toBe('50000');
  }, 30_000);
});
