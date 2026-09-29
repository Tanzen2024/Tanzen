import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { OperationsModule } from './operations-module';
import { sortRequestsNewestFirst } from './sort-workflow-requests';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';

/**
 * Onglet « Demandes » (Workflows) : demandes triées par « Demandé le » décroissant — la plus
 * récente en premier —, sur la vraie date `requestedAt`, identifiant décroissant à date égale.
 */
const SEED = structuredClone(workflowRequests);
const restore = () => { workflowRequests.splice(0, workflowRequests.length, ...structuredClone(SEED)); };
beforeEach(restore);
afterEach(restore);

const request = (id: string, requestedAt: string, entityLabel = id): WorkflowRequest => ({ ...structuredClone(SEED.find((item) => item.id === 'WR-005')!), id, requestedAt, entityLabel });

describe('sortRequestsNewestFirst', () => {
  it('trie par date réelle décroissante (et non par libellé jj/mm/aaaa)', () => {
    const rows = [request('A', '2026-08-10'), request('B', '2026-08-12'), request('C', '2026-08-18'), request('D', '2026-09-29')];
    expect(sortRequestsNewestFirst(rows).map((row) => row.requestedAt)).toEqual(['2026-09-29', '2026-08-18', '2026-08-12', '2026-08-10']);
  });

  it('à date identique, ordre déterministe par identifiant décroissant, quel que soit l’ordre d’entrée', () => {
    const rows = [request('WR-001', '2026-08-10'), request('WR-003', '2026-08-10'), request('WR-002', '2026-08-10')];
    expect(sortRequestsNewestFirst(rows).map((row) => row.id)).toEqual(['WR-003', 'WR-002', 'WR-001']);
    expect(sortRequestsNewestFirst([...rows].reverse()).map((row) => row.id)).toEqual(['WR-003', 'WR-002', 'WR-001']);
  });

  it('ne mute pas la liste source', () => {
    const rows = [request('A', '2026-08-10'), request('B', '2026-09-29')];
    sortRequestsNewestFirst(rows);
    expect(rows.map((row) => row.id)).toEqual(['A', 'B']);
  });
});

describe('Workflows → onglet « Demandes »', { timeout: 30_000 }, () => {
  it('affiche les demandes de la plus récente à la plus ancienne', async () => {
    // Ajoutée en DERNIER dans le store mais la plus récente : doit apparaître en tête.
    workflowRequests.push(request('WR-NEW', '2026-09-29', 'Demande du 29/09'));
    renderWithProviders(<Routes><Route path="/operations/*" element={<OperationsModule />} /></Routes>, { route: '/operations/workflows' });
    const panel = await screen.findByRole('tabpanel');
    await within(panel).findByText('Demande du 29/09');
    const labels = within(panel).getAllByRole('row').slice(1).map((row) => row.querySelector('td button span')?.textContent);
    expect(labels.indexOf('Demande du 29/09')).toBe(0);
    const expected = ['Demande du 29/09', 'Distribution DI-005 · Cheikh Diop', 'AGE Budget Q3', 'Coopérative Sutura · Permutation']; // 29/09, 18/08, 12/08, 10/08
    expect(labels.filter((label) => expected.includes(label ?? ''))).toEqual(expected);
  });
});
