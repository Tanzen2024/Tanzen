import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';

/**
 * Refonte « Adhérents + Ordre de passage » (Tontine SANS ACHAT — l'ancien
 * onglet Planification a disparu, tout se passe désormais dans l'onglet
 * Adhérents, `AdherentsOrderPanel`) — chaque test construit sa PROPRE
 * Tontine (tenant T-001), jamais les seeds partagés.
 */
async function makeTontine(withPurchase = false) {
  const tontine = await tontinesService.createTontine({
    tenantId: 'T-001', name: `Tontine Ajout+Plan ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1,
    withPurchase,
  } as never);
  return tontine!.id;
}

function renderAdherents(tontineId: string) {
  return renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route: `/tontines/${tontineId}/adherents` });
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, tontineId: string) {
  renderAdherents(tontineId);
  // « Ajouter des adhérents » (état vide) ou simplement « Ajouter » (liste déjà non vide) — les deux ouvrent le même Dialog.
  const addButton = await screen.findByRole('button', { name: /Ajouter/ });
  await user.click(addButton);
  return within(await screen.findByRole('dialog'));
}

describe('« Adhérents + Ordre de passage » — Tontine sans achat', () => {
  it('TEST 1 — ajouter un adhérent lui attribue automatiquement la position suivante, aucun bouton « Ajouter seulement »', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    expect(dialog.queryByRole('button', { name: 'Ajouter seulement' })).not.toBeInTheDocument(); // supprimé (mandat « une seule interface, un seul bouton »)
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter (1)' }));
    await screen.findByText('Fatou Ndiaye');
    const adhesions = await tontinesService.listAdhesions('T-001', tontineId);
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    expect(plans.length).toBe(1);
    expect(plans[0].position).toBe(1);
    expect(plans[0].adhesionId).toBe(adhesions[0].id);
  });

  it('TEST 2/3/4/5/6 — ajouter 2 adhérents crée les adhésions ET des positions séquentielles sur les mêmes `adhesionId`, sans recréer d’adhésion', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByText('Cheikh Diop'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter (2)' }));
    await screen.findByText('Fatou Ndiaye');

    const adhesions = await tontinesService.listAdhesions('T-001', tontineId);
    expect(adhesions.length).toBe(2); // aucune adhésion supplémentaire créée pour la planification

    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    expect(plans.length).toBe(2);
    expect(plans.map((p) => p.position)).toEqual([1, 2]); // positions séquentielles
    const fatouAdhesion = adhesions.find((a) => a.memberName === 'Fatou Ndiaye')!;
    const cheikhAdhesion = adhesions.find((a) => a.memberName === 'Cheikh Diop')!;
    expect(plans.find((p) => p.position === 1)?.adhesionId).toBe(fatouAdhesion.id);
    expect(plans.find((p) => p.position === 2)?.adhesionId).toBe(cheikhAdhesion.id);
  });

  it('TEST 2b — ajout groupé de 4 adhérents en une fois → 4 positions séquentielles', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    await user.click(dialog.getByRole('button', { name: 'Tout sélectionner' }));
    await user.click(dialog.getByRole('button', { name: 'Ajouter (4)' }));
    await screen.findByText('Fatou Ndiaye');
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    expect(plans.map((p) => p.position)).toEqual([1, 2, 3, 4]);
  });

  it('ajouter des adhérents à une planification existante les insère en fin de liste (comportement par défaut, mandat §10)', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const fatouAdhesion = await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontineId, fatouAdhesion!.id); // #1 déjà planifiée
    renderAdherents(tontineId);
    await screen.findByText('Fatou Ndiaye');
    const addButton = screen.getByRole('button', { name: /Ajouter/ });
    await user.click(addButton);
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByText('Modou Faye'));
    await user.click(dialog.getByText('Coumba Thiam'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter (2)' }));
    await screen.findByText('Modou Faye');
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    expect(plans.map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it('sélectionner Fatou lui attribue la position 1 ; sélectionner ensuite Cheikh lui attribue 2', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    const fatouToggle = dialog.getByText('Fatou Ndiaye').closest('button')!;
    const fatouRow = fatouToggle.parentElement!;
    await user.click(fatouToggle);
    expect(within(fatouRow).getByDisplayValue('1')).toBeInTheDocument();
    const cheikhToggle = dialog.getByText('Cheikh Diop').closest('button')!;
    const cheikhRow = cheikhToggle.parentElement!;
    await user.click(cheikhToggle);
    expect(within(cheikhRow).getByDisplayValue('2')).toBeInTheDocument();
    expect(within(fatouRow).getByDisplayValue('1')).toBeInTheDocument(); // Fatou garde sa position 1, inchangée par la sélection de Cheikh
  });

  it('désélectionner le membre en position 2 recalcule les positions sans trou', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    const fatouToggle = dialog.getByText('Fatou Ndiaye').closest('button')!;
    const cheikhToggle = dialog.getByText('Cheikh Diop').closest('button')!;
    const modouToggle = dialog.getByText('Modou Faye').closest('button')!;
    const fatouRow = fatouToggle.parentElement!;
    const modouRow = modouToggle.parentElement!;
    await user.click(fatouToggle); // 1
    await user.click(cheikhToggle); // 2
    await user.click(modouToggle); // 3
    await user.click(cheikhToggle); // désélection de Cheikh
    expect(within(fatouRow).getByDisplayValue('1')).toBeInTheDocument();
    expect(within(modouRow).getByDisplayValue('2')).toBeInTheDocument(); // recalculée de 3 → 2, jamais de trou
  });

  it('RÈGLE RE-SÉLECTION — désélectionner puis resélectionner un membre l’envoie en DERNIÈRE position, jamais son ancien rang', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    const fatouToggle = dialog.getByText('Fatou Ndiaye').closest('button')!;
    const cheikhToggle = dialog.getByText('Cheikh Diop').closest('button')!;
    const modouToggle = dialog.getByText('Modou Faye').closest('button')!;
    const fatouRow = fatouToggle.parentElement!;
    const modouRow = modouToggle.parentElement!;
    await user.click(fatouToggle); // 1
    await user.click(cheikhToggle); // 2
    await user.click(modouToggle); // 3
    await user.click(cheikhToggle); // désélection — Fatou 1, Modou 2
    await user.click(cheikhToggle); // resélection — doit repartir en fin, jamais reprendre 2
    const cheikhRow = cheikhToggle.parentElement!;
    expect(within(fatouRow).getByDisplayValue('1')).toBeInTheDocument();
    expect(within(modouRow).getByDisplayValue('2')).toBeInTheDocument();
    expect(within(cheikhRow).getByDisplayValue('3')).toBeInTheDocument();
  });

  it('une recherche entre deux sélections ne fait jamais perdre la sélection déjà faite', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    const search = dialog.getByPlaceholderText('Rechercher un membre...');
    await user.type(search, 'Fatou');
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.clear(search);
    await user.type(search, 'Cheikh');
    await user.click(dialog.getByText('Cheikh Diop'));
    await user.clear(search);
    expect(dialog.getByText('2 membres sélectionnés')).toBeInTheDocument();
    const fatouRow = dialog.getByText('Fatou Ndiaye').closest('button')!.parentElement!;
    const cheikhRow = dialog.getByText('Cheikh Diop').closest('button')!.parentElement!;
    expect(within(fatouRow).getByDisplayValue('1')).toBeInTheDocument(); // toujours 1, jamais réinitialisée par le changement de recherche
    expect(within(cheikhRow).getByDisplayValue('2')).toBeInTheDocument();
  });

  it('modifier directement une position dans le Dialog réorganise automatiquement les autres, avant même de valider l’ajout', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    await user.click(dialog.getByText('Fatou Ndiaye').closest('button')!); // 1
    await user.click(dialog.getByText('Cheikh Diop').closest('button')!); // 2
    await user.click(dialog.getByText('Modou Faye').closest('button')!); // 3
    await user.click(dialog.getByText('Coumba Thiam').closest('button')!); // 4

    // Cheikh : 2 → 4 (déplacement vers le bas) — Modou et Coumba se décalent vers le haut.
    const cheikhRow = dialog.getByText('Cheikh Diop').closest('button')!.parentElement!;
    const cheikhPositionField = within(cheikhRow).getByRole('spinbutton');
    await user.clear(cheikhPositionField);
    await user.type(cheikhPositionField, '4');
    await user.tab();

    const fatouRow = dialog.getByText('Fatou Ndiaye').closest('button')!.parentElement!;
    const modouRow = dialog.getByText('Modou Faye').closest('button')!.parentElement!;
    const coumbaRow = dialog.getByText('Coumba Thiam').closest('button')!.parentElement!;
    expect(within(fatouRow).getByDisplayValue('1')).toBeInTheDocument();
    expect(within(modouRow).getByDisplayValue('2')).toBeInTheDocument();
    expect(within(coumbaRow).getByDisplayValue('3')).toBeInTheDocument();
    expect(within(cheikhRow).getByDisplayValue('4')).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Ajouter (4)' }));
    await screen.findByText('Fatou Ndiaye');
    const adhesions = await tontinesService.listAdhesions('T-001', tontineId);
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    const cheikhAdhesion = adhesions.find((a) => a.memberName === 'Cheikh Diop')!;
    // Le service reçoit bien l'ordre FINAL (après modification dans le Dialog), jamais l'ordre de sélection initial.
    expect(plans.find((p) => p.adhesionId === cheikhAdhesion.id)?.position).toBe(4);
  });

  it('une position hors bornes (0, négative, > N) est normalisée vers la borne valide la plus proche, jamais rejetée dans ce Dialog', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    await user.click(dialog.getByText('Fatou Ndiaye').closest('button')!); // 1
    await user.click(dialog.getByText('Cheikh Diop').closest('button')!); // 2
    await user.click(dialog.getByText('Modou Faye').closest('button')!); // 3
    await user.click(dialog.getByText('Coumba Thiam').closest('button')!); // 4

    const fatouRow = dialog.getByText('Fatou Ndiaye').closest('button')!.parentElement!;
    const positionField = within(fatouRow).getByRole('spinbutton');
    await user.clear(positionField);
    await user.type(positionField, '10'); // > 4 membres sélectionnés → normalisée à 4
    await user.tab();
    expect(within(fatouRow).getByDisplayValue('4')).toBeInTheDocument();
  });

  it('TEST 8 (recherche) — l’onglet Adhérents ne renumérote jamais les résultats filtrés', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const adhesionIds: string[] = [];
    for (const memberId of ['M-001', 'M-006', 'M-016', 'M-018']) adhesionIds.push((await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01'))!.id);
    for (const adhesionId of adhesionIds) await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesionId); // Fatou#1 Cheikh#2 Modou#3 Coumba#4
    renderAdherents(tontineId);
    await screen.findByText('Fatou Ndiaye');
    await user.type(screen.getByPlaceholderText('Rechercher un adhérent...'), 'Modou');
    expect(screen.queryByText('Fatou Ndiaye')).not.toBeInTheDocument();
    const modouRow = screen.getByText('Modou Faye').closest('tr')!;
    expect(within(modouRow).getByRole('spinbutton')).toHaveValue(3); // sa VRAIE position, jamais renumérotée à 1
  });

  it('TEST 9 — deux représentations du même membre (adhesionId distincts) apparaissent comme deux lignes/positions séparées, jamais fusionnées', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter (1)' }));
    await screen.findByText('Fatou Ndiaye');

    // Seconde représentation via le menu de ligne « Ajouter une représentation » — combine désormais adhésion + position automatiquement.
    const fatouRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(fatouRow).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ajouter une représentation' }));
    await screen.findAllByText('Fatou Ndiaye');

    const adhesions = await tontinesService.listAdhesions('T-001', tontineId);
    expect(adhesions.length).toBe(2); // TEST 12 — jamais une seconde adhésion de trop, exactement les 2 représentations attendues
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    expect(plans.length).toBe(2);
    expect(plans.map((p) => p.position)).toEqual([1, 2]);
    expect(screen.getAllByText('Fatou Ndiaye').length).toBe(2);
  });

  it('TEST 7 (suppression) — retirer une position renumérote les suivantes', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const adhesionIds: string[] = [];
    for (const memberId of ['M-001', 'M-006']) adhesionIds.push((await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01'))!.id);
    for (const adhesionId of adhesionIds) await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesionId);
    renderAdherents(tontineId);
    await screen.findByText('Fatou Ndiaye');
    const fatouRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(fatouRow).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirer' }));
    // Fatou reste adhérente (retirée du Plan, pas de la Tontine) — désormais sans position, donc l'ordre n'est PAS complet.
    await screen.findByText('1 positions planifiées · 1 adhérents restant à planifier');
    const cheikhRow = screen.getByText('Cheikh Diop').closest('tr')!;
    expect(within(cheikhRow).getByRole('spinbutton')).toHaveValue(1);
    expect(within(fatouRow).getByRole('button', { name: 'Ajouter à l’ordre de passage' })).toBeInTheDocument();
  });

  it('modifier directement une position réorganise correctement les autres (aucun glisser-déposer)', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const adhesionIds: string[] = [];
    for (const memberId of ['M-001', 'M-006', 'M-016']) adhesionIds.push((await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01'))!.id);
    for (const adhesionId of adhesionIds) await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesionId); // Fatou#1 Cheikh#2 Modou#3
    renderAdherents(tontineId);
    await screen.findByText('Fatou Ndiaye');
    const modouRow = screen.getByText('Modou Faye').closest('tr')!;
    const positionField = within(modouRow).getByRole('spinbutton');
    await user.clear(positionField);
    await user.type(positionField, '1');
    await user.tab();
    const fatouRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    const cheikhRow = screen.getByText('Cheikh Diop').closest('tr')!;
    await waitFor(() => expect(within(modouRow).getByRole('spinbutton')).toHaveValue(1));
    expect(within(fatouRow).getByRole('spinbutton')).toHaveValue(2);
    expect(within(cheikhRow).getByRole('spinbutton')).toHaveValue(3);
  });

  it('TEST 6 (position invalide) — une valeur hors bornes est refusée proprement et revient à l’ancienne valeur, sans corrompre l’ordre', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const adhesionIds: string[] = [];
    for (const memberId of ['M-001', 'M-006']) adhesionIds.push((await tontinesService.addAdhesion('T-001', tontineId, memberId, '2026-01-01'))!.id);
    for (const adhesionId of adhesionIds) await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesionId);
    renderAdherents(tontineId);
    await screen.findByText('Fatou Ndiaye');
    const cheikhRow = screen.getByText('Cheikh Diop').closest('tr')!;
    const positionField = within(cheikhRow).getByRole('spinbutton');
    await user.clear(positionField);
    await user.type(positionField, '9'); // hors bornes (seulement 2 positions existent)
    await user.tab();
    expect(within(cheikhRow).getByRole('spinbutton')).toHaveValue(2); // reste à sa position réelle, jamais une position inventée
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    expect(new Set(plans.map((p) => p.position)).size).toBe(plans.length); // aucun doublon
  });

  it('TEST 10/16 — une adhésion historique (héritée, sans position — ex. nouveau cycle) reste complétable sans être recréée', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    // Créée directement via le service (jamais via le Dialog) pour simuler une adhésion active SANS position, cas réel après « Démarrer un nouveau cycle » (mandat §21).
    const fatouAdhesion = await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    renderAdherents(tontineId);
    await screen.findByText('Fatou Ndiaye');
    const adhesionsBefore = await tontinesService.listAdhesions('T-001', tontineId);
    expect(adhesionsBefore.length).toBe(1);

    const fatouRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(fatouRow).getByRole('button', { name: 'Ajouter à l’ordre de passage' }));
    await screen.findByText('Toutes les participations sont planifiées.');

    const adhesionsAfter = await tontinesService.listAdhesions('T-001', tontineId);
    expect(adhesionsAfter.length).toBe(1); // toujours une seule adhésion — jamais recréée pour la planifier
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    expect(plans.length).toBe(1);
    expect(plans[0].adhesionId).toBe(fatouAdhesion!.id);
  });

  it('TEST 20 — aucune double saisie : après l’ajout, l’onglet Adhérents affiche directement la complétude, jamais une resélection', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    const dialog = await openDialog(user, tontineId);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByText('Cheikh Diop'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter (2)' }));
    await screen.findByText('Fatou Ndiaye');
    await screen.findByText('Toutes les participations sont planifiées.'); // même onglet, aucune navigation, aucune resélection
  });

  it('Avec achat — le Dialog conserve EXACTEMENT le comportement historique (un seul bouton, aucune pastille de position)', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine(true);
    const dialog = await openDialog(user, tontineId);
    const fatouRow = dialog.getByText('Fatou Ndiaye').closest('button')!;
    await user.click(fatouRow);
    expect(dialog.getByRole('button', { name: 'Ajouter 1 adhérent' })).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Ajouter seulement' })).not.toBeInTheDocument();
    expect(within(fatouRow).queryByText('1')).not.toBeInTheDocument(); // aucune pastille de position — ordre de passage sans objet pour « Avec achat »
  });
});
