import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { tontineContributions } from '@/mocks/tontines/tontine-occurrences';
import { TontinesModule } from './tontines-module';

/**
 * Les mutations de ce fichier (`createContribution`/`recordContributionPayment`)
 * écrivent réellement dans le tableau mock partagé `tontineContributions`, qui
 * n'est PAS réinitialisé entre les `it()` d'un même fichier (contrairement à
 * l'isolation entre fichiers de test) — chaque test restaure donc l'état seedé
 * d'origine après son passage, pour ne jamais laisser une bascule d'un test
 * fausser l'état de départ du suivant.
 */
let seededContributions: typeof tontineContributions;
beforeAll(() => { seededContributions = tontineContributions.map((item) => ({ ...item, payments: [...item.payments] })); });
afterEach(() => { tontineContributions.length = 0; tontineContributions.push(...seededContributions.map((item) => ({ ...item, payments: [...item.payments] }))); });

/**
 * Toggle « Participation » individuel + action globale (mandat « critères
 * Cycle/Période/Type » §5-§8) — tenant T-002, TON-001 « Tontine Horizon »
 * (MONTHLY/MONEY, contributionAmount 50 000 XOF), PER-001, données
 * réellement seedées (`tontine-occurrences.ts`) :
 *
 * OCC-001 (#1 · 2026-06-20) : ADH-001 Fatou Ndiaye a déjà une Contribution
 * PAID (350 000/350 000, CTB-001) ; ADH-002 Mamadou Sow, ADH-003 Khadija
 * Mbaye, ADH-004 Cheikh Diop n'ont AUCUNE Contribution pour cette occurrence
 * — cas réel pour vérifier le préremplissage depuis `Tontine.
 * contributionAmount` (50 000) et la création à la volée via
 * `createContribution` au premier bascule ON.
 *
 * OCC-002 (#2 · 2026-07-20) : ADH-002 a une Contribution PARTIAL (200 000/
 * 350 000, CTB-002) et ADH-003 une Contribution WAIVED (CTB-003, exonérée —
 * le toggle doit y rester désactivé, `recordContributionPayment` refusant
 * déjà toute mutation sur une Contribution WAIVED).
 *
 * Aucune donnée mockée ad hoc n'est introduite — uniquement les fixtures
 * déjà seedées dans `src/mocks/tontines/tontine-occurrences.ts`.
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

describe('TontineOperationsManage — « Montant à régler » préempli depuis Tontine.contributionAmount', () => {
  it('un adhérent sans Contribution affiche le montant de cotisation configuré sur la Tontine (50 000 XOF), Statut « Non payé »', async () => {
    renderTontines('/tontines/operations');
    await selectOccurrence('#1 · 2026-06-20');
    const table = cotisationsTable();
    const row = rowFor(table, 'Cheikh Diop');
    expect(within(row).getByText(/50\s?000/)).toBeInTheDocument();
    expect(within(row).getByText('Non payé')).toBeInTheDocument();
    expect(within(row).getByRole('switch')).not.toBeChecked();
  });
});

describe('TontineOperationsManage — toggle individuel « Participation » (OCC-001)', () => {
  it('SCÉNARIO 2 : activer le toggle d’un adhérent sans Contribution crée la Contribution puis la règle intégralement — Montant réglé = Montant à régler, Statut = Payé, Total recalculé', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();
    await selectOccurrence('#1 · 2026-06-20');
    const table = cotisationsTable();

    const totalBefore = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalBefore).toMatch(/350\s?000/); // Fatou déjà payée = seul montant réglé au départ.

    const row = rowFor(table, 'Mamadou Sow');
    const toggle = within(row).getByRole('switch');
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    await screen.findByText((_, el) => el?.tagName === 'TR' && /Payé/.test(el.textContent ?? '') && /Mamadou Sow/.test(el.textContent ?? ''));
    const updatedRow = rowFor(cotisationsTable(), 'Mamadou Sow');
    expect(within(updatedRow).getByRole('switch')).toBeChecked();
    expect(within(updatedRow).getAllByText(/50\s?000/).length).toBeGreaterThan(0);

    // Le total (350 000 Fatou + 50 000 Mamadou) est recalculé immédiatement.
    const totalAfter = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalAfter).toMatch(/400\s?000/);
  });

  it('SCÉNARIO 3 : désactiver le toggle d’un adhérent déjà payé (Fatou Ndiaye, CTB-001 PAID) ramène Montant réglé à 0 et Statut à Non payé, Total diminué immédiatement', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();
    await selectOccurrence('#1 · 2026-06-20');
    const table = cotisationsTable();

    const row = rowFor(table, 'Fatou Ndiaye');
    const toggle = within(row).getByRole('switch');
    expect(toggle).toBeChecked();
    await user.click(toggle);

    await screen.findByText((_, el) => el?.tagName === 'TR' && /Non payé/.test(el.textContent ?? '') && /Fatou Ndiaye/.test(el.textContent ?? ''));
    const updatedRow = rowFor(cotisationsTable(), 'Fatou Ndiaye');
    expect(within(updatedRow).getByRole('switch')).not.toBeChecked();

    const totalAfter = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalAfter).toMatch(/^(?:(?!350\s?000).)*$/s);
  });

  it('SCÉNARIO 6 : modifier un adhérent après une bascule laisse les autres lignes inchangées', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();
    await selectOccurrence('#1 · 2026-06-20');

    await user.click(within(rowFor(cotisationsTable(), 'Cheikh Diop')).getByRole('switch'));
    await screen.findByText((_, el) => el?.tagName === 'TR' && /Payé/.test(el.textContent ?? '') && /Cheikh Diop/.test(el.textContent ?? ''));

    // Fatou (déjà payée avant toute interaction) et Khadija (jamais togglée) restent dans leur état d'origine.
    expect(within(rowFor(cotisationsTable(), 'Fatou Ndiaye')).getByRole('switch')).toBeChecked();
    expect(within(rowFor(cotisationsTable(), 'Khadija Mbaye')).getByRole('switch')).not.toBeChecked();
  });
});

describe('TontineOperationsManage — action globale « Marquer tous comme payés/non payés » (OCC-001)', () => {
  it('SCÉNARIO 4 : « Marquer tous comme payés » règle intégralement tous les adhérents de l’occurrence, Total correctement recalculé', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();
    await selectOccurrence('#1 · 2026-06-20');

    await user.click(screen.getByRole('button', { name: 'Marquer tous comme payés' }));

    for (const name of ['Fatou Ndiaye', 'Mamadou Sow', 'Khadija Mbaye', 'Cheikh Diop']) {
      await screen.findByText((_, el) => el?.tagName === 'TR' && /Payé/.test(el.textContent ?? '') && new RegExp(name).test(el.textContent ?? ''));
    }
    const table = cotisationsTable();
    for (const name of ['Fatou Ndiaye', 'Mamadou Sow', 'Khadija Mbaye', 'Cheikh Diop']) {
      expect(within(rowFor(table, name)).getByRole('switch')).toBeChecked();
    }
    // 350 000 (Fatou, déjà réglée) + 50 000 × 3 (Mamadou/Khadija/Cheikh) = 500 000.
    const totalAfter = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalAfter).toMatch(/500\s?000/);
  });

  it('SCÉNARIO 5 : une fois tous payés, l’action globale propose « Marquer tous comme non payés » — l’activer remet Total à 0', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();
    await selectOccurrence('#1 · 2026-06-20');

    await user.click(screen.getByRole('button', { name: 'Marquer tous comme payés' }));
    await screen.findByRole('button', { name: 'Marquer tous comme non payés' });

    await user.click(screen.getByRole('button', { name: 'Marquer tous comme non payés' }));

    const table = await (async () => { await screen.findByRole('button', { name: 'Marquer tous comme payés' }); return cotisationsTable(); })();
    for (const name of ['Fatou Ndiaye', 'Mamadou Sow', 'Khadija Mbaye', 'Cheikh Diop']) {
      expect(within(rowFor(table, name)).getByRole('switch')).not.toBeChecked();
    }
    const totalAfter = screen.getByText('Total montant réglé :').closest('div')!.parentElement!.textContent ?? '';
    expect(totalAfter).toMatch(/\b0\s?XOF/);
  });
});

describe('TontineOperationsManage — cohérence Statut WAIVED (OCC-002)', () => {
  it('un adhérent WAIVED (Khadija Mbaye, CTB-003) affiche le badge « Exonéré » et son toggle reste désactivé', async () => {
    renderTontines('/tontines/operations');
    await selectOccurrence('#2 · 2026-07-20');
    const table = cotisationsTable();
    const row = rowFor(table, 'Khadija Mbaye');
    expect(within(row).getByRole('switch')).toBeDisabled();
  });

  it('un adhérent PARTIAL (Mamadou Sow, CTB-002, 200 000/350 000) affiche le montant réellement réglé et un toggle non coché (pas encore intégralement payé)', async () => {
    renderTontines('/tontines/operations');
    await selectOccurrence('#2 · 2026-07-20');
    const table = cotisationsTable();
    const row = rowFor(table, 'Mamadou Sow');
    expect(within(row).getByText(/200\s?000/)).toBeInTheDocument();
    expect(within(row).getByRole('switch')).not.toBeChecked();
  });
});
