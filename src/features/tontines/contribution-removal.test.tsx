import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { tontineTurnsService } from '@/services/tontine-turns.service';
import { tontineContributions } from '@/mocks/tontines/tontine-occurrences';
import { TontinesModule } from './tontines-module';

/**
 * Mandat « suppression de l'écran Contribution » — l'écran indépendant
 * Contributions (liste/création/détail) est retiré du module Tontine, mais
 * l'entité/les services Contribution restent nécessaires au panneau
 * Opérations (`tontine-operations-module.tsx`, non modifié). Vérifie
 * exactement la checklist du mandat : plus de route/bouton/lien Contribution
 * navigable, Opérations continue de fonctionner à l'identique (toggle
 * individuel, action globale, recalcul du total), et les services Contribution
 * utilisés par Opérations restent opérationnels.
 */
vi.mock('@/mocks/rbac.mocks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/mocks/rbac.mocks')>();
  return { ...actual, currentUser: { ...actual.currentUser, tenantId: 'T-002' } };
});

let seededContributions: typeof tontineContributions;
beforeAll(() => { seededContributions = tontineContributions.map((item) => ({ ...item, payments: [...item.payments] })); });
afterEach(() => { tontineContributions.length = 0; tontineContributions.push(...seededContributions.map((item) => ({ ...item, payments: [...item.payments] }))); });

function renderTontines(route: string) {
  return renderWithProviders(
    <Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>,
    { route },
  );
}

async function selectOccurrence(label: string) {
  const user = userEvent.setup();
  const tontineSelect = await screen.findByLabelText('Tontine') as HTMLSelectElement;
  await user.selectOptions(tontineSelect, 'Tontine Horizon');
  const periodSelect = screen.getByLabelText('Période') as HTMLSelectElement;
  const option = await screen.findByRole('option', { name: label });
  await user.selectOptions(periodSelect, option);
  await screen.findByText(/Cotisations des adhérents/);
  return user;
}

function cotisationsTable() {
  return screen.getByText(/Cotisations des adhérents/).closest('div')!.parentElement!.querySelector('table') as HTMLTableElement;
}

function rowFor(table: HTMLTableElement, memberName: string) {
  return within(table).getByText(memberName).closest('tr') as HTMLTableRowElement;
}

describe('Suppression de l’écran Contribution — routes', () => {
  it('1) DENY: la route /tontines/:id/contributions n’existe plus', async () => {
    renderTontines('/tontines/TON-001/contributions');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('2a) DENY: une navigation directe vers l’ancienne URL de création Contribution aboutit à une 404 propre', async () => {
    const { unmount } = renderTontines('/tontines/TON-001/contributions/new');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
    unmount();
  });

  it('2b) DENY: une navigation directe vers l’ancienne URL de détail Contribution aboutit à une 404 propre', async () => {
    const { unmount } = renderTontines('/tontines/TON-001/contributions/CTB-001');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
    unmount();
  });
});

describe('Suppression de l’écran Contribution — navigation', () => {
  it('3) DENY: la fiche Tontine n’affiche plus de bouton « Contributions »', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryByRole('button', { name: 'Contributions' })).not.toBeInTheDocument();
  });

  it('4) DENY: aucun lien/bouton « Nouvelle contribution » n’existe plus dans le module Tontine', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryByText(/nouvelle contribution/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nouvelle contribution/i })).not.toBeInTheDocument();
  });
});

describe('Suppression de l’écran Contribution — le panneau Opérations reste fonctionnel', () => {
  it('5) Le panneau Opérations s’affiche toujours', async () => {
    renderTontines('/tontines/operations');
    expect(await screen.findByText('Critères d’affichage')).toBeInTheDocument();
    expect(screen.getByLabelText('Tontine')).toBeInTheDocument();
    expect(screen.getByLabelText('Période')).toBeInTheDocument();
  });

  it('6/8/9/10) le toggle individuel « Participation » règle un adhérent (Montant réglé + Statut Payé) et recalcule le total immédiatement', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();
    await selectOccurrence('#1 · 2026-06-20');
    const table = cotisationsTable();

    const row = rowFor(table, 'Mamadou Sow');
    const toggle = within(row).getByRole('switch');
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    await screen.findByText((_, el) => el?.tagName === 'TR' && /Payé/.test(el.textContent ?? '') && /Mamadou Sow/.test(el.textContent ?? ''));
    const updatedRow = rowFor(cotisationsTable(), 'Mamadou Sow');
    expect(within(updatedRow).getByRole('switch')).toBeChecked();
    expect(within(updatedRow).getAllByText(/50\s?000/).length).toBeGreaterThan(0);
    const totalAfter = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalAfter).toMatch(/400\s?000/); // 350 000 (Fatou déjà payée) + 50 000 (Mamadou).

    // Retour à Non payé : Montant réglé revient à 0, total redescend.
    await user.click(toggle);
    await screen.findByText((_, el) => el?.tagName === 'TR' && /Non payé/.test(el.textContent ?? '') && /Mamadou Sow/.test(el.textContent ?? ''));
    expect(within(rowFor(cotisationsTable(), 'Mamadou Sow')).getByRole('switch')).not.toBeChecked();
    const totalReverted = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalReverted).toMatch(/350\s?000/);
  });

  it('7) l’action globale « Marquer tous comme payés/non payés » reste fonctionnelle', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();
    await selectOccurrence('#1 · 2026-06-20');

    await user.click(screen.getByRole('button', { name: 'Marquer tous comme payés' }));
    for (const name of ['Fatou Ndiaye', 'Mamadou Sow', 'Khadija Mbaye', 'Cheikh Diop']) {
      await screen.findByText((_, el) => el?.tagName === 'TR' && /Payé/.test(el.textContent ?? '') && new RegExp(name).test(el.textContent ?? ''));
    }
    const totalAfter = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalAfter).toMatch(/500\s?000/);
  });
});

describe('Suppression de l’écran Contribution — services Contribution nécessaires à Opérations', () => {
  it('11) createContribution/recordContributionPayment/listContributionsByOccurrence/listContributionsByAdhesion restent exposés et fonctionnels', async () => {
    const created = await tontineTurnsService.createContribution('T-002', { adhesionId: 'ADH-004', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 350_000 });
    expect(created?.status).toBe('PENDING');

    const paid = await tontineTurnsService.recordContributionPayment('T-002', created!.id, { amount: 350_000 });
    expect(paid?.status).toBe('PAID');

    const byOccurrence = await tontineTurnsService.listContributionsByOccurrence('T-002', 'OCC-002');
    expect(byOccurrence.some((item) => item.id === created!.id)).toBe(true);

    const byAdhesion = await tontineTurnsService.listContributionsByAdhesion('T-002', 'ADH-004');
    expect(byAdhesion.some((item) => item.id === created!.id)).toBe(true);
  });

  it('11bis) DENY: les fonctions exclusives à l’ancien écran Contribution (getContribution, listContributionsByTontine) ont bien été retirées', () => {
    expect('getContribution' in tontineTurnsService).toBe(false);
    expect('listContributionsByTontine' in tontineTurnsService).toBe(false);
  });
});
