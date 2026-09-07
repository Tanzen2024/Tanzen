import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Mandats successifs sur le panneau « Opérations » — a perdu au fil du
 * temps : le tableau « Opérations de la séance » (8 colonnes) et son tri, le
 * Fiscal Year affiché comme critère, l'ancien pied de page à 2 valeurs, la
 * barre d'actions (Imprimer/Récapitulatif/Nouveau/Supprimer), les Cards
 * « Synthèse cotisations »/« Synthèse opération » (remplacées par un unique
 * total « Total montant réglé »), « Libellé compte » (doublon Account-
 * flavored du champ Tontine), et désormais Cycle/Type comme critères
 * d'affichage ainsi que la colonne Matricule dans les tableaux Cotisations
 * ET Bénéficiaire (mandat « retirer Cycle/Type des critères + Matricule des
 * tableaux ») — Tontine/Période restent les deux seuls critères. Ce fichier
 * vérifie l'ABSENCE de tout ce qui précède dans le DOM réellement rendu,
 * jamais leur présence, tout en conservant Tontine/Cotisations/Bénéficiaire.
 * Le tenant par défaut des tests (T-001, cf. `rbac.mocks.currentUser`) n'a
 * aucune Period/Occurrence seedée (`tontine-periods.ts` ne couvre que
 * T-002/T-005) — on bascule donc le tenant courant sur T-002 (TON-001 →
 * PER-001 → OCC-001, déjà seedé avec une cotisation PAID réelle) via un mock
 * ciblé de `rbac.mocks`, sans toucher au code source : seule la donnée de
 * contexte utilisateur change, l'isolation tenant elle-même (chaque service
 * filtre toujours par `currentTenant.id`) n'est pas contournée.
 */
vi.mock('@/mocks/rbac.mocks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/mocks/rbac.mocks')>();
  return { ...actual, currentUser: { ...actual.currentUser, tenantId: 'T-002' } };
});

function renderTontines(route: string) {
  return renderWithProviders(
    <Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>,
    { route },
  );
}

describe('TontineOperationsManage — panneau minimal (Tontine/Période + Cotisations/Bénéficiaire/Total), tout le reste supprimé (tenant T-002 réellement seedé)', () => {
  it('DENY: sélectionner Tontine → Période affiche Cotisations/Bénéficiaire/Total montant réglé, sans aucune trace des blocs supprimés', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();

    const tontineSelect = await screen.findByLabelText('Tontine') as HTMLSelectElement;
    await user.selectOptions(tontineSelect, 'Tontine Horizon');

    const periodSelect = screen.getByLabelText('Période') as HTMLSelectElement;
    const occurrenceOption = await screen.findByRole('option', { name: '#1 · 2026-06-20' });
    await user.selectOptions(periodSelect, occurrenceOption);

    // Le contenu attendu apparaît bien (preuve que la séance est réellement sélectionnée)…
    expect(await screen.findByText(/Cotisations des adhérents/)).toBeInTheDocument();
    expect(screen.getByText(/Bénéficiaire de la séance/)).toBeInTheDocument();
    expect(screen.getByText('Total montant réglé :')).toBeInTheDocument();

    // …mais plus aucune trace des blocs supprimés au fil des mandats.
    expect(screen.queryByText('Opérations de la séance')).not.toBeInTheDocument();
    expect(screen.queryByText('Date Réunion')).not.toBeInTheDocument();
    expect(screen.queryByText('Report Dette')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Trier par')).not.toBeInTheDocument();
    expect(screen.queryByText('Synthèse cotisations')).not.toBeInTheDocument();
    expect(screen.queryByText('Synthèse opération')).not.toBeInTheDocument();
    expect(screen.queryByText('Imprimer')).not.toBeInTheDocument();
    expect(screen.queryByText('Récapitulatif')).not.toBeInTheDocument();
    expect(screen.queryByText('Solde période')).not.toBeInTheDocument();
    expect(screen.queryByText('Total à régler')).not.toBeInTheDocument();
    expect(screen.queryByText('Reste à payer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cycle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
  });

  it('DENY: aucune trace de Libellé compte/Account, ni du Fiscal Year comme critère graphique — mais « Tontine » est bien présent', async () => {
    renderTontines('/tontines/operations');
    const tontineSelect = await screen.findByLabelText('Tontine');
    expect(tontineSelect).toBeInTheDocument();
    expect(screen.queryByLabelText('Libellé compte')).not.toBeInTheDocument();
    expect(screen.queryByText('Sélectionner un compte')).not.toBeInTheDocument();
    expect(screen.queryByText('Exercice 2026')).not.toBeInTheDocument();
  });

  it('TEST 5/TEST 6 : « Matricule » n’est plus rendu ni dans le tableau Cotisations, ni dans le tableau Bénéficiaire (ciblage précis, pas une recherche globale — la clé i18n `memberMatricule` reste légitimement utilisée par d’autres écrans Tontines)', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();

    const tontineSelect = await screen.findByLabelText('Tontine') as HTMLSelectElement;
    await user.selectOptions(tontineSelect, 'Tontine Horizon');
    const periodSelect = screen.getByLabelText('Période') as HTMLSelectElement;
    const occurrenceOption = await screen.findByRole('option', { name: '#1 · 2026-06-20' });
    await user.selectOptions(periodSelect, occurrenceOption);

    const cotisationsHeading = await screen.findByText(/Cotisations des adhérents/);
    const cotisationsCard = cotisationsHeading.closest('div')!.parentElement as HTMLElement;
    expect(within(cotisationsCard).queryByText('Matricule')).not.toBeInTheDocument();

    const beneficiaryHeading = screen.getByText(/Bénéficiaire de la séance/);
    const beneficiaryCard = beneficiaryHeading.closest('div')!.parentElement as HTMLElement;
    expect(within(beneficiaryCard).queryByText('Matricule')).not.toBeInTheDocument();
  });
});
