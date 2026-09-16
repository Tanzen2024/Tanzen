import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render-with-providers';
import { fr } from '@/locales/fr';
import { ValidationWorkflowsList, ValidationWorkflowCreate } from './settings-validation-workflows';
import { workflowDefinitions } from '@/mocks/operations/workflow-definitions';

type T = (section: 'settings' | 'nav' | 'system', key: string, values?: Record<string, string>) => string;
const t: T = (section, key, values) => {
  const raw = (fr[section] as Record<string, string>)[key] ?? key;
  return values ? Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), raw) : raw;
};

/**
 * `useTenant()` (`src/contexts/tenant-context.tsx`) fixe `currentTenant` sur
 * le tenant du `currentUser` de démonstration — TOUJOURS `T-001`, sans
 * mécanisme d'override en test (isolation stricte "un seul tenant par
 * session", cf. docs/FIX_TENANT_APP_SINGLE_TENANT.md). `T-001` porte déjà
 * les 7 définitions de seed en permanence : un scénario "liste réellement
 * vide" n'est donc pas atteignable dans ce harnais — les fixtures ci-dessous
 * utilisent `tenantId: 'T-001'` avec des `code` uniques (`TEST_*`) pour
 * rester visibles au composant sans collision avec les seeds.
 */
describe('ValidationWorkflowsList — Paramètres → Workflows de validation (liste)', () => {
  it("n'affiche qu'une seule ligne par code (la version la plus récente), pas une ligne par version", async () => {
    workflowDefinitions.push(
      { id: 'WD-TEST-LIST-V1', tenantId: 'T-001', code: 'TEST_LIST_ROW', name: 'Workflow de test liste', domain: 'organization', description: '', entityType: 'member', action: 'update', version: 1, active: false, steps: [{ order: 1, name: 'Étape', approverPermission: 'members.approve' }] },
      { id: 'WD-TEST-LIST-V2', tenantId: 'T-001', code: 'TEST_LIST_ROW', name: 'Workflow de test liste', domain: 'organization', description: '', entityType: 'member', action: 'update', version: 2, active: true, steps: [{ order: 1, name: 'Étape', approverPermission: 'members.approve' }] },
    );
    renderWithProviders(<ValidationWorkflowsList t={t} />, { route: '/settings/validation-workflows' });
    await waitFor(() => expect(screen.getAllByText('Workflow de test liste')).toHaveLength(1));
    expect(screen.getByText((_, node) => node?.textContent === 'V2 (2)')).toBeInTheDocument();
  });

  it('affiche le statut Actif/Inactif de la version listée', async () => {
    workflowDefinitions.push({ id: 'WD-TEST-LIST-STATUS', tenantId: 'T-001', code: 'TEST_LIST_STATUS', name: 'Workflow statut test', domain: 'organization', description: '', entityType: 'member', action: 'update', version: 1, active: false, steps: [{ order: 1, name: 'Étape', approverPermission: 'members.approve' }] });
    renderWithProviders(<ValidationWorkflowsList t={t} />, { route: '/settings/validation-workflows' });
    await waitFor(() => expect(screen.getByText('Workflow statut test')).toBeInTheDocument());
    // role-admin (utilisateur de démonstration) détient `workflows.manage` -> toggle interactif, pas juste un badge.
    expect(screen.getByLabelText(`Statut — Workflow statut test`)).not.toBeChecked();
  });
});

describe('ValidationWorkflowCreate — création d’un workflow', () => {
  it('valide les champs obligatoires (nom, code, étapes) avant soumission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ValidationWorkflowCreate t={t} />, { route: '/settings/validation-workflows/new' });
    await user.click(screen.getByRole('button', { name: /Enregistrer le workflow/ }));
    expect(await screen.findAllByText('Ce champ est obligatoire.')).not.toHaveLength(0);
  });

  it('rejette un code au mauvais format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ValidationWorkflowCreate t={t} />, { route: '/settings/validation-workflows/new' });
    await user.type(screen.getByLabelText(/^Nom \*/), 'Workflow test format');
    await user.type(screen.getByLabelText(/^Code \*/), 'not-a-valid-code');
    await user.type(screen.getByLabelText('Nom de l’étape'), 'Étape 1');
    await user.click(screen.getByRole('button', { name: /Enregistrer le workflow/ }));
    expect(await screen.findByText(/doit être en MAJUSCULES/)).toBeInTheDocument();
  });

  it('création réussie : crée une WorkflowDefinition en version 1 avec l’étape saisie', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ValidationWorkflowCreate t={t} />, { route: '/settings/validation-workflows/new' });

    await user.type(screen.getByLabelText(/^Nom \*/), 'Modification d’une tontine (test)');
    await user.type(screen.getByLabelText(/^Code \*/), 'test_tontine_update');
    await user.type(screen.getByLabelText('Nom de l’étape'), 'Responsable de la tontine');
    await user.click(screen.getByRole('button', { name: /Enregistrer le workflow/ }));

    await waitFor(() => expect(workflowDefinitions.some((definition) => definition.code === 'TEST_TONTINE_UPDATE')).toBe(true));
    const created = workflowDefinitions.find((definition) => definition.code === 'TEST_TONTINE_UPDATE');
    expect(created).toBeTruthy();
    expect(created?.version).toBe(1);
    expect(created?.active).toBe(false); // toggle "Actif" laissé décoché par défaut (§41, activation progressive)
    expect(created?.steps).toEqual([{ order: 1, name: 'Responsable de la tontine', approverPermission: expect.any(String) }]);
  });

  it('permet d’ajouter/réordonner/supprimer des étapes avant soumission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ValidationWorkflowCreate t={t} />, { route: '/settings/validation-workflows/new' });

    await user.click(screen.getByRole('button', { name: 'Ajouter une étape' }));
    const stepNameInputs = screen.getAllByLabelText('Nom de l’étape');
    expect(stepNameInputs).toHaveLength(2);
    await user.type(stepNameInputs[0], 'Première étape');
    await user.type(stepNameInputs[1], 'Deuxième étape');

    // Monte la deuxième étape en première position.
    const moveUpButtons = screen.getAllByLabelText('Monter');
    await user.click(moveUpButtons[1]);
    const reordered = screen.getAllByLabelText('Nom de l’étape');
    expect(within(reordered[0].closest('div')!.parentElement!).getByDisplayValue('Deuxième étape')).toBeInTheDocument();

    await user.click(screen.getAllByLabelText('Supprimer l’étape')[1]);
    expect(screen.getAllByLabelText('Nom de l’étape')).toHaveLength(1);
  });
});
