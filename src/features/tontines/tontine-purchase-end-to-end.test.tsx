import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { FinanceModule } from '@/features/finance/finance-module';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { transactions } from '@/mocks/finance/transactions';

/**
 * PARCOURS COMPLET « Achat tontine » (mandat « Finalisation des règles financières », 2026-09-28, §13) :
 * Trésorerie → Transactions déjà ouverte, encaissement d'un bénéficiaire « Avec achat » dans le Tour
 * (action « Régler »), puis retour dans Trésorerie → Transactions DANS LA MÊME SESSION (même cache React
 * Query, staleTime 30 s) : la transaction automatique doit y figurer sans rechargement de la page.
 */
function Navigator({ paths }: { paths: Record<string, string> }) {
  const navigate = useNavigate();
  return <nav>{Object.entries(paths).map(([label, path]) => <button key={label} type="button" onClick={() => navigate(path)}>{label}</button>)}</nav>;
}

describe('Achat tontine — de l’encaissement au journal de Trésorerie', () => {
  it('encaissement « Avec achat » → UNE transaction Achat tontine visible dans Trésorerie → Transactions, sans rechargement', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Parcours ${Date.now()}`, valueType: 'MONEY', contributionAmount: 20_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true,
    } as never);
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); // Fatou Ndiaye
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    const purchaseCashbox = cashboxes.find((item) => item.tenantId === 'T-001' && item.systemCode === 'TONTINE_PURCHASE')!;
    const journal = `/finance/treasury/transactions?cashboxId=${purchaseCashbox.id}`;
    const comment = `Achat tontine ${tontine!.name} — tour ${occurrence!.occurrenceNumber}`;

    // 1. Le journal de la caisse Achat tontine est déjà chargé (et en cache) : l'achat n'existe pas encore.
    renderWithProviders(
      <><Navigator paths={{ 'test-tour': `/tontines/${tontine!.id}/occurrences/${occurrence!.id}`, 'test-journal': journal }} />
        <Routes><Route path="/finance/*" element={<FinanceModule />} /><Route path="/tontines/*" element={<TontinesModule />} /></Routes></>,
      { route: journal, staleTime: 30_000 }, // staleTime réel de src/app/providers.tsx
    );
    await screen.findAllByRole('columnheader', {}, { timeout: 10_000 });
    expect(screen.queryByText(comment)).not.toBeInTheDocument();

    // 2. Encaissement de Fatou dans le Tour : bénéficiaire ajouté, « Régler » avec un achat de 50 000.
    await user.click(screen.getByRole('button', { name: 'test-tour' }));
    await user.click(within((await screen.findByText('Fatou Ndiaye', {}, { timeout: 10_000 })).closest('tr')!).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    const card = () => screen.getByText(/Bénéficiaires du Tour \(\d+\)/).closest('[class*="rounded"]') as HTMLElement;
    await screen.findByText('Bénéficiaires du Tour (1)');
    await user.click(within(within(card()).getByText('Fatou Ndiaye').closest('tr')!).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));
    const dialog = within(await screen.findByRole('dialog'));
    const purchaseInput = dialog.getByLabelText('Montant achat');
    await user.clear(purchaseInput);
    await user.type(purchaseInput, '50000');
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));
    await within(within(card()).getByText('Fatou Ndiaye').closest('tr')!).findByText('Réglé');
    // Déjà réglé : plus aucune action « Régler » sur la ligne (aucun second encaissement depuis l'UI).
    expect(within(within(card()).getByText('Fatou Ndiaye').closest('tr')!).queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();

    // 3. Retour au journal (même session, même cache) : la transaction automatique est visible.
    await user.click(screen.getByRole('button', { name: 'test-journal' }));
    const row = (await screen.findByText(comment, {}, { timeout: 10_000 })).closest('tr')!;
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim());
    const cells = within(row).getAllByRole('cell');
    const cell = (name: string) => cells[headers.indexOf(name)];
    expect(cell('Caisse')).toHaveTextContent('Achat tontine');
    expect(cell('Adhérent')).toHaveTextContent('Fatou Ndiaye');
    expect(cell('Débit')).toHaveTextContent('—');
    expect(cell('Crédit').textContent?.replace(/\D/g, '')).toBe('50000');

    // UNE seule transaction, crédit, caisse système, reliée au bénéficiaire (clé d'idempotence).
    const created = transactions.filter((tx) => tx.description === comment);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ tenantId: 'T-001', category: 'AUTRES', subcategory: 'ACHAT_TONTINE', type: 'credit', amount: 50_000, destination: purchaseCashbox.cashboxNumber, status: 'completed' });
    expect(created[0].tontineBeneficiaryId).toBeTruthy();
    expect(created[0].reference).toMatch(/^REF-/);
  }, 60_000);
});
