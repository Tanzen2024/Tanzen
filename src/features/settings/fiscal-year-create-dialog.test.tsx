import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render-with-providers';
import { FiscalYearCreateDialog } from './fiscal-year-create-dialog';
import { fiscalYears, type FiscalYear } from '@/mocks/settings/fiscal-years';

/**
 * Le composant est contrôlé (`open`/`onOpenChange` viennent du parent) — un
 * petit harnais avec son propre `useState` reproduit l'usage réel
 * (`SettingsFiscalYears` / `FiscalYearSelector`), pour que la fermeture après
 * succès soit observable comme elle le serait en production.
 */
function Harness({ tenantId, years }: { tenantId: string; years: FiscalYear[] }) {
  const [open, setOpen] = useState(true);
  return <FiscalYearCreateDialog open={open} onOpenChange={setOpen} tenantId={tenantId} years={years} />;
}

function makeYear(overrides: Partial<FiscalYear> & { tenantId: string }): FiscalYear {
  return { id: `FY-${Math.random()}`, label: 'Exercice', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', closedAt: null, closedBy: null, ...overrides };
}

describe('FiscalYearCreateDialog — assistant de création (partagé Paramètres + sélecteur)', () => {
  it('préremplit le libellé et les dates avec le prochain exercice suggéré, à partir du dernier exercice réel du tenant', () => {
    const tenantId = 'T-TEST-FY-PREFILL';
    const years = [makeYear({ tenantId, label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false })];
    renderWithProviders(<Harness tenantId={tenantId} years={years} />);

    expect(screen.getByLabelText('Exercice')).toHaveValue('Exercice 2028');
    expect(screen.getByLabelText('Date de début')).toHaveValue('2028-01-01');
    expect(screen.getByLabelText('Date de fin')).toHaveValue('2028-12-31');
  });

  it('Annuler ferme la modale sans rien créer', async () => {
    const tenantId = 'T-TEST-FY-CANCEL';
    const before = fiscalYears.filter((year) => year.tenantId === tenantId).length;
    const user = userEvent.setup();
    renderWithProviders(<Harness tenantId={tenantId} years={[]} />);

    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByText('Nouvel exercice fiscal (1/2)')).not.toBeInTheDocument();
    expect(fiscalYears.filter((year) => year.tenantId === tenantId).length).toBe(before);
  });

  it('création réussie : passe les 2 étapes, ferme la modale et n’active jamais automatiquement le nouvel exercice', async () => {
    const tenantId = 'T-TEST-FY-CREATE-OK';
    const years = [makeYear({ tenantId, label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true })];
    const user = userEvent.setup();
    renderWithProviders(<Harness tenantId={tenantId} years={years} />);

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Initialiser le nouvel exercice (2/2)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Créer l’exercice' }));

    await waitFor(() => expect(screen.queryByText('Initialiser le nouvel exercice (2/2)')).not.toBeInTheDocument());

    const created = fiscalYears.find((year) => year.tenantId === tenantId && year.label === 'Exercice 2027');
    expect(created).toBeTruthy();
    expect(created?.status).toBe('upcoming');
    expect(created?.isCurrent).toBe(false);
  });

  it('désactive le bouton de confirmation pendant la création (empêche la double soumission)', async () => {
    const tenantId = 'T-TEST-FY-NO-DOUBLE-SUBMIT';
    const years = [makeYear({ tenantId, label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31' })];
    const user = userEvent.setup();
    renderWithProviders(<Harness tenantId={tenantId} years={years} />);

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByText('Initialiser le nouvel exercice (2/2)');

    const confirmButton = screen.getByRole('button', { name: 'Créer l’exercice' });
    // Deux clics tirés dans le même tick (avant tout re-rendu) — le pire cas pour un
    // double-clic réel, où le bouton n'a pas encore eu le temps de s'afficher désactivé.
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(screen.queryByText('Initialiser le nouvel exercice (2/2)')).not.toBeInTheDocument());
    expect(fiscalYears.filter((year) => year.tenantId === tenantId && year.label === 'Exercice 2027')).toHaveLength(1);
  });

  it('affiche proprement l’erreur retournée par la validation métier (chevauchement/doublon) sans fermer la modale', async () => {
    const tenantId = 'T-TEST-FY-DUPLICATE';
    // Suggestion calculée à partir de ce dernier exercice → 01/01/2028-31/12/2028 "Exercice 2028".
    const previous = makeYear({ tenantId, label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false });
    // Doublon déjà présent côté "backend" (source de vérité) pour ce tenant, avec exactement les mêmes dates/label que la suggestion.
    const duplicate = makeYear({ tenantId, label: 'Exercice 2028', startDate: '2028-01-01', endDate: '2028-12-31', status: 'upcoming', isCurrent: false });
    fiscalYears.push(previous, duplicate);
    const user = userEvent.setup();
    renderWithProviders(<Harness tenantId={tenantId} years={[previous, duplicate]} />);

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Créer l’exercice' }));

    expect(await screen.findByText('Période invalide ou exercice déjà existant pour ce tenant.')).toBeInTheDocument();
    // Retour à l'étape 1, modale toujours ouverte — rien n'a été contourné côté validation backend.
    expect(await screen.findByText('Nouvel exercice fiscal (1/2)')).toBeInTheDocument();
  });
});
