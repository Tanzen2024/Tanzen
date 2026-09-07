/** `'settings'` ajouté pour la réouverture d'exercice fiscal (D-FY-05, §24-BIS) — réutilise le moteur Workflow existant plutôt que d'en créer un second. */
export type WorkflowDomain = 'credit' | 'tontines' | 'governance' | 'finance' | 'settings';

export type WorkflowStepDefinition = {
  order: number;
  name: string;
  /** Permission RBAC requise pour agir à cette étape (module.action). */
  approverPermission: string;
};

export type WorkflowDefinition = {
  id: string;
  tenantId: string;
  name: string;
  domain: WorkflowDomain;
  description: string;
  entityType: 'application' | 'loan' | 'assembly' | 'distribution' | 'fiscalYear' | 'beneficiaryPermutation';
  steps: WorkflowStepDefinition[];
  active: boolean;
};

export const workflowDefinitions: WorkflowDefinition[] = [
  { id: 'WD-001', tenantId: 'T-001', name: 'Approbation de demande de crédit', domain: 'credit', description: 'Instruction puis décision finale sur une demande de prêt.', entityType: 'application', steps: [{ order: 1, name: 'Vérification du dossier', approverPermission: 'applications.approve' }, { order: 2, name: 'Décision finale', approverPermission: 'loans.approve' }], active: true },
  { id: 'WD-003', tenantId: 'T-001', name: 'Convocation d’assemblée', domain: 'governance', description: 'Préparation de l’ordre du jour puis validation par le bureau.', entityType: 'assembly', steps: [{ order: 1, name: 'Préparation ordre du jour', approverPermission: 'governance.create' }, { order: 2, name: 'Validation du bureau', approverPermission: 'governance.approve' }], active: true },
  { id: 'WD-004', tenantId: 'T-001', name: 'Distribution de fonds', domain: 'finance', description: 'Contrôle comptable puis approbation finale d’une distribution.', entityType: 'distribution', steps: [{ order: 1, name: 'Contrôle comptable', approverPermission: 'distributions.create' }, { order: 2, name: 'Approbation finale', approverPermission: 'distributions.approve' }], active: true },
  /**
   * §24-BIS puis D-FY-07/D-FY-08 (VALIDÉES, cf.
   * docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md) :
   * réouverture d'un exercice fiscal clôturé — jamais directe, toujours via
   * ce workflow. `fiscalYears.approve` (D-FY-07, Option B) est désormais une
   * permission distincte de `fiscalYears.manage` (qui reste requise pour
   * SOUMETTRE la demande, cf. `requestFiscalYearReopen` /
   * `settings.service.ts`) : role-admin détient les deux, donc le blocage de
   * l'auto-approbation (D-FY-08, Option B) ne peut PAS reposer sur le RBAC
   * seul — il est appliqué explicitement par
   * `settingsService.decideFiscalYearReopen` (`requestedByUserId !==
   * actorId`), pas par une permission ou un rôle supplémentaire.
   */
  { id: 'WD-005', tenantId: 'T-001', name: 'Réouverture d’exercice fiscal', domain: 'settings', description: 'Demande de réouverture exceptionnelle d’un exercice fiscal clôturé, avec justification obligatoire.', entityType: 'fiscalYear', steps: [{ order: 1, name: 'Autorisation de réouverture', approverPermission: 'fiscalYears.approve' }], active: true },
  /**
   * Mandat planification/permutation des bénéficiaires — étape unique,
   * `beneficiaries.manage` (déjà la permission de gestion des bénéficiaires,
   * réutilisée telle quelle : aucune permission `*.approve` dédiée n'existe
   * pour le domaine Tontines). Auto-approbation autorisée (décision
   * explicite du mandat : ne PAS généraliser le blocage D-FY-08, spécifique
   * à Fiscal Year) — voir `tontineTurnsService.applyBeneficiaryPermutationDecision`,
   * appelé sans aucun contrôle `requestedByUserId`, contrairement à
   * `decideFiscalYearReopen`.
   */
  { id: 'WD-006', tenantId: 'T-001', name: 'Permutation de bénéficiaires', domain: 'tontines', description: 'Échange de deux bénéficiaires déjà désignés sur des occurrences, entre deux adhésions, soumis à validation avant application.', entityType: 'beneficiaryPermutation', steps: [{ order: 1, name: 'Validation de la permutation', approverPermission: 'beneficiaries.manage' }], active: true },
];
