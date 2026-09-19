import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';

/**
 * Régression : ajouter des adhérents depuis l'URL « bare » (`/tontines/:id`,
 * cas réel d'une navigation depuis la liste des Tontines) ne doit JAMAIS
 * faire basculer l'affichage vers Tours, même quand l'ajout complète la
 * planification (`planningStatus.complete` passe à `true`, ce qui ferait
 * normalement pencher `defaultTab` vers Tours au prochain calcul). Avant
 * correctif : `activeTab` restait dérivé de `defaultTab` en direct tant que
 * l'URL restait bare, donc un ajout d'adhérents faisait « sauter »
 * silencieusement l'utilisateur sur Tours pendant qu'il continuait de
 * travailler sur Adhérents (aucun `navigate()` explicite en cause — seulement
 * `activeTab` qui suivait une valeur devenue mouvante). Ne couvre QUE ce
 * scénario : le calcul de `defaultTab` lui-même et les routes explicites
 * restent déjà couverts par `tontine-default-tab.test.tsx` et
 * `tontines-module.test.tsx`.
 */
async function makeTontine() {
  const tontine = await tontinesService.createTontine({
    tenantId: 'T-001', name: `Tontine Nav Ajout ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1,
    withPurchase: false,
  } as never);
  return tontine!.id;
}

function renderBare(tontineId: string) {
  return renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route: `/tontines/${tontineId}` });
}

async function expectActiveTab(name: string) {
  expect(await screen.findByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

describe('Navigation après ajout d’adhérents — reste sur Adhérents (URL bare)', () => {
  it('atterrit sur Adhérents (0 adhérent) puis reste sur Adhérents une fois l’ajout terminé, planification complète y compris', async () => {
    const user = userEvent.setup();
    const tontineId = await makeTontine();
    renderBare(tontineId);
    await expectActiveTab('Adhérents');

    const addButton = await screen.findByRole('button', { name: /Ajouter/ });
    await user.click(addButton);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByText('Fatou Ndiaye'));
    await user.click(within(dialog).getByText('Cheikh Diop'));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter (2)' }));

    // Le Dialog se ferme (succès) et les nouveaux adhérents apparaissent — la planification (2/2) est désormais complète.
    await screen.findByText('Fatou Ndiaye');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expectActiveTab('Adhérents');
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'false');
  });

  it('un remontage ultérieur de la MÊME Tontine (retour depuis la liste, refresh) applique le défaut À JOUR — Tours — car le gel ne survit pas au démontage', async () => {
    const tontineId = await makeTontine();
    const { unmount } = renderBare(tontineId);
    await expectActiveTab('Adhérents');
    unmount();

    await tontinesService.addAdhesion('T-001', tontineId, 'M-001', '2026-01-01');
    const adhesions = await tontinesService.listAdhesions('T-001', tontineId);
    await tontineOperationsService.addPlanEntry('T-001', tontineId, adhesions[0].id);

    renderBare(tontineId);
    await expectActiveTab('Tours');
  });
});
