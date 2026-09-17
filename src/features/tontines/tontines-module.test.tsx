import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontinesService } from '@/services/tontines.service';

function renderTontines(route: string) {
  return renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route });
}

describe('Créer une tontine — « Avec achat », jamais « Mode achat »/« Mode d’achat »', () => {
  it('affiche le libellé « Avec achat », jamais « Mode achat »', async () => {
    renderTontines('/tontines/create');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.getAllByText('Avec achat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Avec achat')).toBeInTheDocument();
    expect(screen.queryByText('Mode achat')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mode d.achat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Caisse liée/)).not.toBeInTheDocument();
  });

  it('n’affiche aucun champ Devise dans le formulaire de création — la devise est toujours automatique', async () => {
    renderTontines('/tontines/create');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByRole('combobox', { name: 'Devise' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
  });
});

describe('Fiche Tontine — édition sans aucun champ Devise', () => {
  it('la fiche en lecture affiche « Avec achat », jamais « Mode achat »', async () => {
    renderTontines('/tontines/TON-004'); // MONEY, tenant T-001, withPurchase: true (seed)
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getAllByText('Avec achat').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Mode achat')).not.toBeInTheDocument();
  });

  it('le formulaire de modification ne contient AUCUN champ Devise, même sélectionnable', async () => {
    renderTontines('/tontines/TON-004/edit');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByRole('combobox', { name: 'Devise' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
    expect(screen.queryByText('Devise')).not.toBeInTheDocument();
  });
});

describe('Tontine sans date propre — la Tontine définit les règles, le Tour porte la date', () => {
  it('DENY: aucun champ « Date de début » dans le formulaire de création', async () => {
    renderTontines('/tontines/create');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByLabelText(/Date de début/)).not.toBeInTheDocument();
  });

  it('DENY: aucun champ « Date de début » dans le formulaire de modification, ni sur la fiche en lecture', async () => {
    renderTontines('/tontines/TON-004/edit');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByLabelText(/Date de début/)).not.toBeInTheDocument();
    renderTontines('/tontines/TON-004');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.queryByText(/Date de début/)).not.toBeInTheDocument();
  });

  it('ALLOW: une Tontine créée n’a pas de propriété `startDate` du tout (pas seulement `undefined`)', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test sans date ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    expect(tontine).toBeTruthy();
    expect('startDate' in (tontine as object)).toBe(false);
  });

  it('ALLOW: la suggestion de date du prochain tour dérive UNIQUEMENT du dernier tour déjà créé + la fréquence — jamais inventée quand aucun tour n’existe', async () => {
    // TON-004 porte déjà un tour (OCC-004, 2026-06-01, mensuelle jour 1) → suggestion = 2026-07-01, sans aucune dépendance à un champ Tontine.
    renderTontines('/tontines/TON-004');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    const dateInput = await screen.findByLabelText(/Date du tour/) as HTMLInputElement;
    expect(dateInput.value).toBe('2026-07-01');
  });

  it('ALLOW: une Tontine fraîchement créée (aucun tour) ne propose AUCUNE date suggérée — le champ reste vide, l’utilisateur saisit librement la date du premier tour', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test zéro tour ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    renderTontines(`/tontines/${tontine!.id}`);
    await screen.findByRole('heading', { name: tontine!.name });
    const dateInput = await screen.findByLabelText(/Date du tour/) as HTMLInputElement;
    expect(dateInput.value).toBe('');
  });
});

describe('Vue d’ensemble Tontines — groupée par fréquence', () => {
  it('affiche une métrique par fréquence (Journalière/Hebdomadaire/Mensuelle/Trimestrielle), jamais de compteur « Cycle »', async () => {
    renderTontines('/tontines');
    await screen.findAllByText('Mensuelle');
    expect(screen.getByText('Journalière')).toBeInTheDocument();
    expect(screen.getByText('Hebdomadaire')).toBeInTheDocument();
    expect(screen.getAllByText('Trimestrielle').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/[Cc]ycle/)).not.toBeInTheDocument();
    expect(screen.queryByText(/[Tt]irage/)).not.toBeInTheDocument();
  });
});
