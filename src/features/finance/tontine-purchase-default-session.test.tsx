import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { tontinesService } from '@/services/tontines.service';

/**
 * Mandat « Transaction automatique lors de l'encaissement d'une tontine avec achat » (2026-09-28),
 * TEST 9 : sans aucun filtre (ni caisse, ni séance dans l'URL), Trésorerie → Transactions s'ouvre
 * sur la séance courante — la transaction « Achat tontine » générée par l'encaissement y figure.
 * Avant le correctif elle n'avait pas de séance et n'était visible que via « Toutes les séances ».
 */
describe('Trésorerie → Transactions — vue par défaut après encaissement d’une tontine avec achat', () => {
  it('la transaction « Achat tontine » est visible dans la séance courante, en crédit du montant de l’achat', async () => {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Encaissement visible ${Date.now()}`, valueType: 'MONEY', contributionAmount: 10_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, withPurchase: true,
    } as never);
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 50_000);

    renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: '/finance/treasury/transactions' });
    const comment = await screen.findByText(`Achat tontine ${tontine!.name} — tour ${occurrence!.occurrenceNumber}`, {}, { timeout: 10_000 });
    expect((document.getElementById('finance-session') as HTMLSelectElement | null)?.value).toBe('FS-001');
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim());
    const cells = within(comment.closest('tr')!).getAllByRole('cell');
    expect(cells[headers.indexOf('Caisse')]).toHaveTextContent('Achat tontine');
    expect(cells[headers.indexOf('Crédit')].textContent?.replace(/\D/g, '')).toBe('50000');
  }, 30_000);
});
