import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render-with-providers';
import { FiscalYearCreateDialog } from './fiscal-year-create-dialog';
import { fiscalYears, fiscalYearLabel, fiscalYearStatus, type FiscalYear } from '@/mocks/settings/fiscal-years';

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
  return { id: `FY-${Math.random()}`, startDate: '2026-01-01', endDate: '2026-12-31', isClosed: false, createdAt: '2026-01-01', closedAt: null, closedBy: null, ...overrides };
}

describe('FiscalYearCreateDialog — assistant de création (Paramètres → Exercices fiscaux)', () => {
  it('préremplit les dates avec le prochain exercice suggéré, à partir du dernier exercice réel du tenant — le libellé est calculé, jamais saisi', () => {
    const tenantId = 'T-TEST-FY-PREFILL';
    const years = [makeYear({ tenantId, startDate: '2027-01-01', endDate: '2027-12-31' })];
    renderWithProviders(<Harness tenantId={tenantId} years={years} />);

    expect(screen.queryByLabelText('Exercice')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Date de début')).toHaveValue('2028-01-01');
    expect(screen.getByLabelText('Date de fin')).toHaveValue('2028-12-31');
    expect(screen.getByTestId('fy-create-preview')).toHaveTextContent('Exercice 2028');
  });

  it('le libellé aperçu se recalcule immédiatement lorsque les dates changent', async () => {
    const tenantId = 'T-TEST-FY-LIVE-LABEL';
    const user = userEvent.setup();
    renderWithProviders(<Harness tenantId={tenantId} years={[]} />);

    const startInput = screen.getByLabelText('Date de début');
    const endInput = screen.getByLabelText('Date de fin');
    await user.clear(startInput);
    fireEvent.change(startInput, { target: { value: '2025-05-15' } });
    await user.clear(endInput);
    fireEvent.change(endInput, { target: { value: '2026-04-09' } });

    await waitFor(() => expect(screen.getByTestId('fy-create-preview')).toHaveTextContent('Exercice 2025-2026'));
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
    const years = [makeYear({ tenantId, startDate: '2026-01-01', endDate: '2026-12-31' })];
    const user = userEvent.setup();
    renderWithProviders(<Harness tenantId={tenantId} years={years} />);

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Initialiser le nouvel exercice (2/2)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Créer l’exercice' }));

    await waitFor(() => expect(screen.queryByText('Initialiser le nouvel exercice (2/2)')).not.toBeInTheDocument());

    const created = fiscalYears.find((year) => year.tenantId === tenantId && year.startDate === '2027-01-01' && year.endDate === '2027-12-31');
    expect(created).toBeTruthy();
    expect(fiscalYearLabel(created!)).toBe('Exercice 2027');
    expect(created && fiscalYearStatus(created, '2026-09-25')).toBe('upcoming');
  });

  it('désactive le bouton de confirmation pendant la création (empêche la double soumission)', async () => {
    const tenantId = 'T-TEST-FY-NO-DOUBLE-SUBMIT';
    const years = [makeYear({ tenantId, startDate: '2026-01-01', endDate: '2026-12-31' })];
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
    expect(fiscalYears.filter((year) => year.tenantId === tenantId && year.startDate === '2027-01-01' && year.endDate === '2027-12-31')).toHaveLength(1);
  });

  it('affiche proprement l’erreur retournée par la validation métier (chevauchement/doublon) sans fermer la modale', async () => {
    const tenantId = 'T-TEST-FY-DUPLICATE';
    // Suggestion calculée à partir de ce dernier exercice → 01/01/2028-31/12/2028.
    const previous = makeYear({ tenantId, startDate: '2027-01-01', endDate: '2027-12-31' });
    // Doublon déjà présent côté "backend" (source de vérité) pour ce tenant, avec exactement les mêmes dates que la suggestion.
    const duplicate = makeYear({ tenantId, startDate: '2028-01-01', endDate: '2028-12-31' });
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
