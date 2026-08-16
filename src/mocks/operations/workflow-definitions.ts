export type WorkflowDomain = 'credit' | 'tontines' | 'governance' | 'finance';

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
  entityType: 'application' | 'loan' | 'cycle' | 'assembly' | 'distribution';
  steps: WorkflowStepDefinition[];
  active: boolean;
};

export const workflowDefinitions: WorkflowDefinition[] = [
  { id: 'WD-001', tenantId: 'T-001', name: 'Approbation de demande de crédit', domain: 'credit', description: 'Instruction puis décision finale sur une demande de prêt.', entityType: 'application', steps: [{ order: 1, name: 'Vérification du dossier', approverPermission: 'applications.approve' }, { order: 2, name: 'Décision finale', approverPermission: 'loans.approve' }], active: true },
  { id: 'WD-002', tenantId: 'T-001', name: 'Ouverture de cycle de tontine', domain: 'tontines', description: 'Validation de trésorerie puis autorisation avant ouverture d’un cycle.', entityType: 'cycle', steps: [{ order: 1, name: 'Validation trésorerie', approverPermission: 'cycles.manage' }, { order: 2, name: 'Autorisation direction', approverPermission: 'cycles.manage' }], active: true },
  { id: 'WD-003', tenantId: 'T-001', name: 'Convocation d’assemblée', domain: 'governance', description: 'Préparation de l’ordre du jour puis validation par le bureau.', entityType: 'assembly', steps: [{ order: 1, name: 'Préparation ordre du jour', approverPermission: 'governance.create' }, { order: 2, name: 'Validation du bureau', approverPermission: 'governance.approve' }], active: true },
  { id: 'WD-004', tenantId: 'T-001', name: 'Distribution de fonds', domain: 'finance', description: 'Contrôle comptable puis approbation finale d’une distribution.', entityType: 'distribution', steps: [{ order: 1, name: 'Contrôle comptable', approverPermission: 'distributions.create' }, { order: 2, name: 'Approbation finale', approverPermission: 'distributions.approve' }], active: true },
];
