import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { notify } from '@/lib/notify';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontines, tontineOccurrences, tontineAdhesions, tontineBeneficiaryPlans } from '@/mocks/tontines/tontines';

/**
 * Mandat « Évolution globale du module Finance » §33-§36 (validation UI) :
 * Supprimer (= désactivation logique) / Réactiver / Archiver une tontine, avec la confirmation du mandat,
 * et bandeau « consultation seule » sur la fiche quand elle n'est plus active.
 * Les refus (Tour ouvert) sont expliqués par la raison métier. Depuis le mandat
 * du 2026-09-27, ces actions sont dans le menu « ⋯ » de la LIGNE de la tontine
 * (liste), comme pour les Caisses — plus sur la fiche.
 */
const SEED = structuredClone(tontines);
const restore = () => tontines.splice(0, tontines.length, ...structuredClone(SEED));
beforeEach(restore);
afterEach(restore);

function renderTontines(route: string) {
  return renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route });
}
async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions — ${name}` }));
  return screen.findByRole('menu');
}

describe('Tontine — cycle de vie depuis la liste', () => {
  it('Supprimer (en rouge) : confirmation du mandat, tontine inactive conservée avec tours/adhérents/plans, masquée des actives, « Réactiver » proposé sous « Tontines inactives »', async () => {
    const user = userEvent.setup();
    const owned = <T extends { tontineId: string }>(items: T[]) => items.filter((item) => item.tontineId === 'TON-004').length;
    const before = { occurrences: owned(tontineOccurrences), adhesions: owned(tontineAdhesions), plans: owned(tontineBeneficiaryPlans) };
    const { unmount } = renderTontines('/tontines');
    const menu = await openRowMenu(user, 'Coopérative Sutura');
    expect(within(menu).queryByRole('menuitem', { name: /Désactiver/ })).not.toBeInTheDocument();
    const deleteItem = within(menu).getByRole('menuitem', { name: 'Supprimer la tontine' });
    expect(deleteItem).toHaveClass('text-destructive');
    await user.click(deleteItem);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Supprimer cette tontine ?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('La tontine sera désactivée. Ses données et son historique seront conservés.');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(tontines.find((item) => item.id === 'TON-004')?.status).toBe('statusInactive'));
    expect({ occurrences: owned(tontineOccurrences), adhesions: owned(tontineAdhesions), plans: owned(tontineBeneficiaryPlans) }).toEqual(before);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Actions — Coopérative Sutura' })).not.toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Statut' }), 'inactive');
    const inactiveMenu = await openRowMenu(user, 'Coopérative Sutura');
    await waitFor(() => expect(within(inactiveMenu).getByRole('menuitem', { name: 'Réactiver la tontine' })).toBeInTheDocument());
    expect(within(inactiveMenu).queryByRole('menuitem', { name: 'Supprimer la tontine' })).not.toBeInTheDocument();
    unmount();
    renderTontines('/tontines/TON-004');
    expect(await screen.findByTestId('tontine-not-operational')).toHaveTextContent('consultation seule');
  });

  it('Archiver une tontine dont un Tour est ouvert : refus expliqué, statut inchangé', async () => {
    const user = userEvent.setup();
    renderTontines('/tontines');
    await user.click(within(await openRowMenu(user, 'Coopérative Sutura')).getByRole('menuitem', { name: 'Archiver la tontine' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('La tontine ne sera plus disponible dans la gestion courante. Son historique sera conservé.');
    const error = vi.spyOn(notify, 'error');
    await user.click(within(dialog).getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringMatching(/Archivage impossible : un tour est encore ouvert/)));
    error.mockRestore();
    expect(tontines.find((item) => item.id === 'TON-004')?.status).toBe('statusActive');
  });

  it('tontine archivée : masquée de la liste par défaut ; filtre « Tontines inactives » → plus de « Modifier », seul « Désarchiver » ; bandeau sur la fiche', async () => {
    tontines.find((item) => item.id === 'TON-004')!.status = 'statusArchived';
    const user = userEvent.setup();
    const { unmount } = renderTontines('/tontines');
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Coopérative Sutura' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Statut' }), 'inactive');
    const menu = await openRowMenu(user, 'Coopérative Sutura');
    expect(within(menu).queryByRole('menuitem', { name: 'Modifier la tontine' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Désarchiver la tontine' })).toBeInTheDocument();
    unmount();
    renderTontines('/tontines/TON-004');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByTestId('tontine-not-operational')).toHaveTextContent('Tontine archivée');
  });
});
