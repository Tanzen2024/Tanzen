import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';

/**
 * Onglet par défaut à l'ouverture d'une Tontine (mandat « onglet par défaut
 * selon adhérents et planification ») — chaque test construit sa PROPRE
 * Tontine (tenant T-001), jamais les seeds partagés. Rendu sur l'URL « bare »
 * (`/tontines/:id`, aucun onglet explicite) sauf pour les tests de routes
 * explicites (§16).
 */
async function makeTontine(withPurchase: boolean) {
  const tontine = await tontinesService.createTontine({
    tenantId: 'T-001', name: `Tontine Défaut ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1,
    withPurchase,
  } as never);
  return tontine!.id;
}

function renderBare(tontineId: string, explicitTab?: string) {
  const route = explicitTab ? `/tontines/${tontineId}/${explicitTab}` : `/tontines/${tontineId}`;
  return renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route });
}

async function expectActiveTab(name: string) {
  expect(await screen.findByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

describe('Onglet par défaut — Tontine « Avec achat » (planification sans objet)', () => {
  it('TEST 1 — 0 adhérent → Adhérents', async () => {
    const tontineId = await makeTontine(true);
    renderBare(tontineId);
    await expectActiveTab('Adhérents');
  });

  it('TEST 2 — 1 adhérent → Tours', async () => {
    const tontineId = await makeTontine(true);
    await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    renderBare(tontineId);
    await expectActiveTab('Tours');
  });

  it('TEST 3/4 — 4 adhérents, aucune planification (sans objet) → Tours quand même', async () => {
    const tontineId = await makeTontine(true);
    for (const memberId of ['M-001', 'M-006', 'M-016', 'M-018']) await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01');
    renderBare(tontineId);
    await expectActiveTab('Tours');
  });
});

describe('Onglet par défaut — Tontine « Sans achat » (le positionnement se fait désormais dans Adhérents)', () => {
  it('TEST 5 — 0 adhérent → Adhérents', async () => {
    const tontineId = await makeTontine(false);
    renderBare(tontineId);
    await expectActiveTab('Adhérents');
  });

  it('TEST 6 — 1 adhérent, 0 planification → Adhérents', async () => {
    const tontineId = await makeTontine(false);
    await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    renderBare(tontineId);
    await expectActiveTab('Adhérents');
  });

  it('TEST 7 — 4 adhérents, 0 planification → Adhérents', async () => {
    const tontineId = await makeTontine(false);
    for (const memberId of ['M-001', 'M-006', 'M-016', 'M-018']) await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01');
    renderBare(tontineId);
    await expectActiveTab('Adhérents');
  });

  it('TEST 8 — 4 adhérents, 2 planifications → Adhérents (pas encore Tours)', async () => {
    const tontineId = await makeTontine(false);
    const adhesionIds: string[] = [];
    for (const memberId of ['M-001', 'M-006', 'M-016', 'M-018']) adhesionIds.push((await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01'))!.id);
    await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesionIds[0]);
    await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesionIds[1]);
    renderBare(tontineId);
    await expectActiveTab('Adhérents');
  });

  it('TEST 9 — 4 adhérents, 4 planifications → Tours', async () => {
    const tontineId = await makeTontine(false);
    const adhesionIds: string[] = [];
    for (const memberId of ['M-001', 'M-006', 'M-016', 'M-018']) adhesionIds.push((await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01'))!.id);
    for (const adhesionId of adhesionIds) await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesionId);
    renderBare(tontineId);
    await expectActiveTab('Tours');
  });
});

describe('Onglet par défaut — granularité `adhesionId` (participations multiples d’un même membre)', () => {
  it('TEST 10 — un membre a 2 participations dont une seule planifiée → Adhérents', async () => {
    const tontineId = await makeTontine(false);
    const jeanAdh1 = await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-05'); // seconde représentation, NON planifiée
    const marieAdh = await tontinesService.addAdhesion('T-001', tontineId, 'M-006', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontineId, jeanAdh1!.id);
    await tontineOperationsService.addPlanEntry('T-001', tontineId, marieAdh!.id);
    renderBare(tontineId);
    await expectActiveTab('Adhérents');
  });

  it('TEST 11 — les 3 participations (adhesionId) sont toutes planifiées → Tours', async () => {
    const tontineId = await makeTontine(false);
    const jeanAdh1 = await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    const jeanAdh2 = await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-05');
    const marieAdh = await tontinesService.addAdhesion('T-001', tontineId, 'M-006', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontineId, jeanAdh1!.id);
    await tontineOperationsService.addPlanEntry('T-001', tontineId, jeanAdh2!.id);
    await tontineOperationsService.addPlanEntry('T-001', tontineId, marieAdh!.id);
    renderBare(tontineId);
    await expectActiveTab('Tours');
  });
});

describe('Onglet par défaut — les routes explicites restent toujours prioritaires (mandat §16)', () => {
  it('TEST 12 — Tontine entièrement planifiée, URL explicite /adherents → Adhérents (jamais écrasé par le défaut Tours)', async () => {
    const tontineId = await makeTontine(false);
    const adhesion = await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesion!.id); // planification complète (1/1)
    renderBare(tontineId, 'adherents');
    await expectActiveTab('Adhérents');
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'false');
  });

  it('TEST 13 — Tontine sans planification complète, URL explicite /tours → Tours (jamais écrasé par le défaut Adhérents)', async () => {
    const tontineId = await makeTontine(false);
    await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01'); // aucune planification
    renderBare(tontineId, 'tours');
    await expectActiveTab('Tours');
    expect(screen.getByRole('tab', { name: 'Adhérents' })).toHaveAttribute('aria-selected', 'false');
  });
});
