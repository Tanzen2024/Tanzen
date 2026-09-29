import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { auditEvents } from '@/mocks/audit/audit-events';
import { transactions } from '@/mocks/finance/transactions';

/**
 * Mandat « Évolution globale du module Finance » §27-§32 (validation UI) :
 * Supprimer (= désactivation logique) / Réactiver / Archiver une caisse depuis sa
 * fiche ou sa ligne, avec les confirmations du mandat ; filtre Statut de l'onglet
 * Caisses (« Caisses actives » par défaut, « Caisses inactives », « Toutes les
 * caisses »). AC-012 « Transport » (T-001) sert de fixture.
 */
const CASHBOXES_SEED = structuredClone(cashboxes);
const AUDIT_SEED = structuredClone(auditEvents);
function restore() {
  cashboxes.splice(0, cashboxes.length, ...structuredClone(CASHBOXES_SEED));
  auditEvents.splice(0, auditEvents.length, ...structuredClone(AUDIT_SEED));
}
beforeEach(restore);
afterEach(restore);

function renderFinance(route: string) {
  return renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route });
}
const status = () => cashboxes.find((cashbox) => cashbox.id === 'AC-012')?.status;

describe('Caisse — cycle de vie depuis l’interface', () => {
  it('fiche : « Supprimer la caisse » en rouge, confirmation du mandat, caisse inactive conservée avec ses transactions, puis « Réactiver » / « Archiver »', async () => {
    const user = userEvent.setup();
    const cashboxNumber = cashboxes.find((cashbox) => cashbox.id === 'AC-012')!.cashboxNumber;
    const linkedTransactions = () => transactions.filter((tr) => tr.source === cashboxNumber || tr.destination === cashboxNumber).map((tr) => tr.id);
    const transactionsBefore = linkedTransactions();
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    await user.click(screen.getByRole('button', { name: 'Actions de la caisse' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Désactiver/ })).not.toBeInTheDocument();
    const deleteItem = within(menu).getByRole('menuitem', { name: 'Supprimer la caisse' });
    expect(deleteItem).toHaveClass('text-destructive');
    await user.click(deleteItem);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Supprimer cette caisse ?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('La caisse sera désactivée. Ses données et son historique seront conservés.');
    const confirm = within(dialog).getByRole('button', { name: 'Supprimer' });
    expect(confirm).toHaveClass('bg-destructive');
    await user.click(confirm);
    await waitFor(() => expect(status()).toBe('inactive'));
    expect(cashboxes.some((cashbox) => cashbox.id === 'AC-012')).toBe(true); // jamais de suppression physique
    expect(linkedTransactions()).toEqual(transactionsBefore);
    expect(await screen.findByTestId('cashbox-not-operational')).toBeInTheDocument();
    expect(within(screen.getByTestId('cashbox-header-info')).getByText('Inactive')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions de la caisse' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(expect.arrayContaining(['Réactiver la caisse', 'Archiver la caisse']));
    expect(items).not.toContain('Supprimer la caisse');
  });

  it('archiver depuis la fiche : confirmation, caisse archivée consultable, plus de « Modifier », seul « Désarchiver »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    await user.click(screen.getByRole('button', { name: 'Actions de la caisse' }));
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Archiver la caisse' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('La caisse ne sera plus disponible pour les opérations courantes. Son historique sera conservé.');
    await user.click(within(dialog).getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(status()).toBe('archived'));
    expect(screen.getByRole('heading', { name: 'Transport' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions de la caisse' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toContain('Désarchiver la caisse');
    expect(items).not.toContain('Modifier la caisse');
  });

  it('onglet Caisses : « Caisses actives » par défaut ; après « Supprimer » la caisse quitte les actives et apparaît sous « Caisses inactives » et « Toutes les caisses »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    const filter = screen.getByLabelText('Statut') as HTMLSelectElement;
    expect(filter.value).toBe('active');
    expect([...filter.options].map((option) => option.textContent)).toEqual(['Caisses actives', 'Caisses inactives', 'Toutes les caisses']);
    expect(within(table).getByRole('button', { name: 'Transport' })).toBeInTheDocument();
    await user.selectOptions(filter, 'all');
    expect(within(table).getByRole('button', { name: 'Transport' })).toBeInTheDocument();
    await user.selectOptions(filter, 'active');
    const row = within(table).getByRole('button', { name: 'Transport' }).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Actions — Transport' }));
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Supprimer la caisse' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(status()).toBe('inactive'));
    await waitFor(() => expect(within(table).queryByRole('button', { name: 'Transport' })).not.toBeInTheDocument());
    await user.selectOptions(filter, 'inactive');
    expect(await within(table).findByRole('button', { name: 'Transport' })).toBeInTheDocument();
    await user.selectOptions(filter, 'all');
    expect(within(table).getByRole('button', { name: 'Transport' })).toBeInTheDocument();
  });

  it('« Caisses inactives » regroupe aussi les caisses archivées (identifiables par leur badge)', async () => {
    cashboxes.find((cashbox) => cashbox.id === 'AC-012')!.status = 'archived';
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    expect(within(table).queryByRole('button', { name: 'Transport' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Statut'), 'inactive');
    const row = (await within(table).findByRole('button', { name: 'Transport' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('Archivée')).toBeInTheDocument();
  });

  it('ligne de la liste : menu « ⋯ » avec « Voir les transactions » et le cycle de vie selon le statut', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    const row = within(table).getByRole('button', { name: 'Transport' }).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Actions — Transport' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Voir les transactions', 'Modifier la caisse', 'Archiver la caisse', 'Supprimer la caisse']);
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Supprimer la caisse' })).toHaveClass('text-destructive');
  });
});
