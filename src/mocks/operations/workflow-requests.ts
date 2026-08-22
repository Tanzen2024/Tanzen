import type { WorkflowDomain } from './workflow-definitions';

export type WorkflowStatus = 'pending' | 'inProgress' | 'approved' | 'rejected' | 'returned' | 'cancelled';
export type WorkflowStepStatus = 'pending' | 'approved' | 'rejected' | 'returned' | 'skipped';

export type WorkflowStep = {
  order: number;
  name: string;
  approverPermission: string;
  status: WorkflowStepStatus;
  actedBy?: string;
  actedByName?: string;
  actedAt?: string;
  comment?: string;
};

export type WorkflowRequest = {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  domain: WorkflowDomain;
  entityType: 'application' | 'loan' | 'cycle' | 'assembly' | 'distribution' | 'fiscalYear' | 'turnPermutation';
  entityId: string;
  entityLabel: string;
  amount?: number;
  /**
   * Champ générique optionnel — justification libre fournie par le
   * demandeur, visible par l'approbateur dans l'écran de détail existant
   * (`WorkflowDetail`). Ajouté pour la réouverture de Fiscal Year (§24-BIS,
   * justification obligatoire), mais volontairement générique (pas
   * `reopenReason`) : réutilisable par tout futur domaine ayant besoin du
   * même contexte, sans dupliquer le mécanisme.
   */
  justification?: string;
  /** Nom libre du demandeur — conservé pour compatibilité (affichage, seed data existante Credit/Tontines/Governance/Finance, jamais un identifiant fiable). */
  requestedBy: string;
  /**
   * D-FY-08 (VALIDÉE, Option B, cf.
   * docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md) :
   * identifiant fiable du demandeur (`CurrentUser.id`), optionnel pour
   * préserver la compatibilité avec les `WorkflowRequest` déjà en seed
   * (Credit/Tontines/Governance/Finance), qui n'en portent pas et n'ont pas
   * besoin d'un contrôle d'auto-approbation. Renseigné uniquement par
   * `settingsService.requestFiscalYearReopen` à ce stade — c'est ce champ,
   * comparé à l'acteur courant, qui bloque l'auto-approbation d'une demande
   * de réouverture d'exercice fiscal (voir `settingsService.decideFiscalYearReopen`).
   */
  requestedByUserId?: string;
  requestedAt: string;
  status: WorkflowStatus;
  currentStepOrder: number;
  steps: WorkflowStep[];
};

export const workflowRequests: WorkflowRequest[] = [
  {
    id: 'WR-001', tenantId: 'T-005', workflowDefinitionId: 'WD-001', domain: 'credit', entityType: 'application', entityId: 'AP-004', entityLabel: 'Demande AP-004 · Awa Cissé', amount: 540_000, requestedBy: 'Awa Cissé', requestedAt: '2026-08-01', status: 'inProgress', currentStepOrder: 2,
    steps: [
      { order: 1, name: 'Vérification du dossier', approverPermission: 'applications.approve', status: 'approved', actedBy: 'U-001', actedByName: 'Amadou Mbaye', actedAt: '2026-08-05', comment: 'Dossier conforme, revenus vérifiés.' },
      { order: 2, name: 'Décision finale', approverPermission: 'loans.approve', status: 'pending' },
    ],
  },
  {
    id: 'WR-002', tenantId: 'T-002', workflowDefinitionId: 'WD-001', domain: 'credit', entityType: 'application', entityId: 'AP-005', entityLabel: 'Demande AP-005 · Khadija Mbaye', amount: 350_000, requestedBy: 'Khadija Mbaye', requestedAt: '2026-08-05', status: 'pending', currentStepOrder: 1,
    steps: [
      { order: 1, name: 'Vérification du dossier', approverPermission: 'applications.approve', status: 'pending' },
      { order: 2, name: 'Décision finale', approverPermission: 'loans.approve', status: 'pending' },
    ],
  },
  {
    id: 'WR-003', tenantId: 'T-003', workflowDefinitionId: 'WD-001', domain: 'credit', entityType: 'loan', entityId: 'L-005', entityLabel: 'Prêt L-005 · Ibrahima Sarr', amount: 450_000, requestedBy: 'Ibrahima Sarr', requestedAt: '2026-07-20', status: 'rejected', currentStepOrder: 2,
    steps: [
      { order: 1, name: 'Vérification du dossier', approverPermission: 'applications.approve', status: 'approved', actedBy: 'U-001', actedByName: 'Amadou Mbaye', actedAt: '2026-07-22' },
      { order: 2, name: 'Décision finale', approverPermission: 'loans.approve', status: 'rejected', actedBy: 'U-001', actedByName: 'Amadou Mbaye', actedAt: '2026-07-25', comment: 'Retards de remboursement répétés sur prêt en cours.' },
    ],
  },
  {
    id: 'WR-004', tenantId: 'T-005', workflowDefinitionId: 'WD-002', domain: 'tontines', entityType: 'cycle', entityId: 'CYC-003', entityLabel: 'Tontine Avenir · Cycle 1', requestedBy: 'Awa Cissé', requestedAt: '2026-06-25', status: 'approved', currentStepOrder: 2,
    steps: [
      { order: 1, name: 'Validation trésorerie', approverPermission: 'cycles.manage', status: 'approved', actedBy: 'U-001', actedByName: 'Amadou Mbaye', actedAt: '2026-06-27' },
      { order: 2, name: 'Autorisation direction', approverPermission: 'cycles.manage', status: 'approved', actedBy: 'U-001', actedByName: 'Amadou Mbaye', actedAt: '2026-06-29' },
    ],
  },
  {
    id: 'WR-005', tenantId: 'T-001', workflowDefinitionId: 'WD-002', domain: 'tontines', entityType: 'cycle', entityId: 'CYC-005', entityLabel: 'Coopérative Sutura · Cycle 3', requestedBy: 'Cheikh Diop', requestedAt: '2026-08-10', status: 'pending', currentStepOrder: 1,
    steps: [
      { order: 1, name: 'Validation trésorerie', approverPermission: 'cycles.manage', status: 'pending' },
      { order: 2, name: 'Autorisation direction', approverPermission: 'cycles.manage', status: 'pending' },
    ],
  },
  // entityId : AS-002 (ancienne entité autonome Assembly) migrée vers MT-008 par la correction post-implémentation Phase 4C-4 — cf. src/mocks/organization/governance.ts.
  {
    id: 'WR-006', tenantId: 'T-001', workflowDefinitionId: 'WD-003', domain: 'governance', entityType: 'assembly', entityId: 'MT-008', entityLabel: 'AGE Budget Q3', requestedBy: 'Fatou Ndiaye', requestedAt: '2026-08-12', status: 'inProgress', currentStepOrder: 2,
    steps: [
      { order: 1, name: 'Préparation ordre du jour', approverPermission: 'governance.create', status: 'approved', actedBy: 'U-001', actedByName: 'Amadou Mbaye', actedAt: '2026-08-13' },
      { order: 2, name: 'Validation du bureau', approverPermission: 'governance.approve', status: 'pending' },
    ],
  },
  {
    id: 'WR-007', tenantId: 'T-001', workflowDefinitionId: 'WD-004', domain: 'finance', entityType: 'distribution', entityId: 'DI-005', entityLabel: 'Distribution DI-005 · Cheikh Diop', amount: 220_000, requestedBy: 'Cheikh Diop', requestedAt: '2026-08-18', status: 'pending', currentStepOrder: 1,
    steps: [
      { order: 1, name: 'Contrôle comptable', approverPermission: 'distributions.create', status: 'pending' },
      { order: 2, name: 'Approbation finale', approverPermission: 'distributions.approve', status: 'pending' },
    ],
  },
  {
    id: 'WR-008', tenantId: 'T-002', workflowDefinitionId: 'WD-004', domain: 'finance', entityType: 'distribution', entityId: 'DI-004', entityLabel: 'Distribution DI-004 · Mamadou Sow', amount: 180_000, requestedBy: 'Mamadou Sow', requestedAt: '2026-08-14', status: 'returned', currentStepOrder: 1,
    steps: [
      { order: 1, name: 'Contrôle comptable', approverPermission: 'distributions.create', status: 'returned', actedBy: 'U-001', actedByName: 'Amadou Mbaye', actedAt: '2026-08-15', comment: 'Justificatif manquant, à compléter.' },
      { order: 2, name: 'Approbation finale', approverPermission: 'distributions.approve', status: 'pending' },
    ],
  },
];
