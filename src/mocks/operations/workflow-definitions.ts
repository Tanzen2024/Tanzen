/** `'settings'` ajouté pour la réouverture d'exercice fiscal (D-FY-05, §24-BIS) — réutilise le moteur Workflow existant plutôt que d'en créer un second. `'organization'` ajouté (mandat « Moteur générique de workflow de validation ») pour la demande de modification d'un Membre — même principe : réutilise le moteur existant, pas un second système. */
export type WorkflowDomain = 'credit' | 'tontines' | 'governance' | 'finance' | 'settings' | 'organization';

/**
 * Généralise le déclencheur d'une définition (mandat « Moteur générique de
 * workflow de validation », §6/§29 du besoin : "entityType + action →
 * workflow"). Ajouté rétroactivement sur les 5 définitions existantes
 * (champ additif, valeur choisie par analogie avec ce que chacune fait déjà
 * — WD-005 correspond exactement à l'exemple `FISCAL_YEAR + REOPEN` du
 * besoin) : n'altère aucun comportement existant, ces définitions restent
 * référencées par leur `id` fixe partout où elles le sont déjà
 * (`requestFiscalYearReopen`, `submitLoanApplication`, etc.). Seule la
 * nouvelle définition `WD-007` (Membre) est résolue dynamiquement via ce
 * champ, par `workflowService.getWorkflowFor`.
 */
export type WorkflowActionType = 'create' | 'update' | 'close' | 'reopen' | 'delete';

export type WorkflowStepDefinition = {
  order: number;
  name: string;
  /** Permission RBAC requise pour agir à cette étape (module.action). */
  approverPermission: string;
};

export type WorkflowDefinition = {
  id: string;
  tenantId: string;
  /**
   * Identifiant STABLE à travers les versions d'un même workflow (mandat
   * « Administration des workflows de validation »), indépendant de `id`
   * (qui reste unique PAR VERSION — chaque nouvelle version est une ligne
   * distincte, jamais une mutation en place, besoin §13/§16). Deux lignes
   * peuvent partager le même `code` (ex. `MEMBER_UPDATE` en v1 et v2) ; au
   * plus une seule doit être `active: true` pour un même `code`, imposé par
   * `workflowService.setDefinitionActive`/`createNewVersionOfDefinition`,
   * pas par une contrainte de type. Rétrofité sur les 7 définitions
   * existantes (champ additif, ne change aucun comportement d'exécution —
   * `createRequest`/`getWorkflowFor` continuent de résoudre par `id`/
   * `entityType`+`action`, jamais par `code`).
   */
  code: string;
  name: string;
  domain: WorkflowDomain;
  description: string;
  entityType: 'application' | 'loan' | 'assembly' | 'distribution' | 'fiscalYear' | 'beneficiaryPermutation' | 'member';
  action: WorkflowActionType;
  steps: WorkflowStepDefinition[];
  active: boolean;
  /**
   * Versionnement de la DÉFINITION (besoin §17) : une `WorkflowRequest` capture
   * cette valeur à sa création (`workflowDefinitionVersion`) et n'en suit
   * jamais une plus récente rétroactivement. Toutes les définitions existantes
   * démarrent à 1 (première version connue) ; à incrémenter manuellement le
   * jour où les étapes d'une définition active sont réellement modifiées.
   */
  version: number;
  /**
   * Opt-in explicite, PAS un comportement par défaut du moteur (besoin §22) —
   * voir `workflowService.isSelfApprovalBlocked`, qui n'est JAMAIS appelée
   * automatiquement par `submitAction` : un commentaire existant sur WD-006
   * documente une décision de mandat antérieure de ne pas généraliser ce
   * contrôle dans le moteur lui-même. Chaque domaine reste responsable
   * d'appeler (ou non) la garde depuis son propre `decide<X>`, exactement
   * comme `settingsService.decideFiscalYearReopen` le fait déjà pour Fiscal
   * Year. Absent/`undefined` = comportement inchangé pour les définitions
   * existantes (aucune n'appelle la garde sauf Fiscal Year, en dur).
   */
  allowSelfApproval?: boolean;
  /**
   * Optionnels (mandat « Administration des workflows de validation ») —
   * absents sur les 7 définitions de seed existantes (colonne « Dernière
   * modification » affiche `—` pour elles plutôt qu'une date inventée) ;
   * stampés par `createDefinition`/`updateDefinition`/
   * `createNewVersionOfDefinition`/`setDefinitionActive` pour toute nouvelle
   * écriture.
   */
  createdAt?: string;
  updatedAt?: string;
};

/** Valeurs réellement supportées par le moteur (besoin §8) — dérivées des unions de types ci-dessus, aucune valeur inventée pour l'UI. */
export const WORKFLOW_ENTITY_TYPES: WorkflowDefinition['entityType'][] = ['application', 'loan', 'assembly', 'distribution', 'fiscalYear', 'beneficiaryPermutation', 'member'];
export const WORKFLOW_ACTION_TYPES: WorkflowActionType[] = ['create', 'update', 'close', 'reopen', 'delete'];
export const WORKFLOW_DOMAINS: WorkflowDomain[] = ['credit', 'tontines', 'governance', 'finance', 'settings', 'organization'];

export const workflowDefinitions: WorkflowDefinition[] = [
  { id: 'WD-001', tenantId: 'T-001', code: 'CREDIT_APPLICATION_APPROVAL', name: 'Approbation de demande de crédit', domain: 'credit', description: 'Instruction puis décision finale sur une demande de prêt.', entityType: 'application', action: 'create', version: 1, steps: [{ order: 1, name: 'Vérification du dossier', approverPermission: 'applications.approve' }, { order: 2, name: 'Décision finale', approverPermission: 'loans.approve' }], active: true },
  { id: 'WD-003', tenantId: 'T-001', code: 'GOVERNANCE_ASSEMBLY_CONVOCATION', name: 'Convocation d’assemblée', domain: 'governance', description: 'Préparation de l’ordre du jour puis validation par le bureau.', entityType: 'assembly', action: 'create', version: 1, steps: [{ order: 1, name: 'Préparation ordre du jour', approverPermission: 'governance.create' }, { order: 2, name: 'Validation du bureau', approverPermission: 'governance.approve' }], active: true },
  { id: 'WD-004', tenantId: 'T-001', code: 'FINANCE_DISTRIBUTION_APPROVAL', name: 'Distribution de fonds', domain: 'finance', description: 'Contrôle comptable puis approbation finale d’une distribution.', entityType: 'distribution', action: 'create', version: 1, steps: [{ order: 1, name: 'Contrôle comptable', approverPermission: 'distributions.create' }, { order: 2, name: 'Approbation finale', approverPermission: 'distributions.approve' }], active: true },
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
  { id: 'WD-005', tenantId: 'T-001', code: 'FISCAL_YEAR_REOPEN', name: 'Réouverture d’exercice fiscal', domain: 'settings', description: 'Demande de réouverture exceptionnelle d’un exercice fiscal clôturé, avec justification obligatoire.', entityType: 'fiscalYear', action: 'reopen', version: 1, steps: [{ order: 1, name: 'Autorisation de réouverture', approverPermission: 'fiscalYears.approve' }], active: true },
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
  { id: 'WD-006', tenantId: 'T-001', code: 'TONTINE_BENEFICIARY_PERMUTATION', name: 'Permutation de bénéficiaires', domain: 'tontines', description: 'Échange de deux bénéficiaires déjà désignés sur des occurrences, entre deux adhésions, soumis à validation avant application.', entityType: 'beneficiaryPermutation', action: 'update', version: 1, steps: [{ order: 1, name: 'Validation de la permutation', approverPermission: 'beneficiaries.manage' }], active: true, allowSelfApproval: true },
  /**
   * Mandat « Moteur générique de workflow de validation » — entité pilote
   * choisie pour valider l'architecture (voir docs/GENERIC_VALIDATION_WORKFLOW_ENGINE.md) :
   * `organizationService.updateMember` ne mute plus directement le membre
   * quand cette définition est active — `requestMemberUpdate` crée une
   * `ApprovalRequest` (ChangeSet + snapshot de version) à la place.
   *
   * `active: false` PAR DÉFAUT (besoin §41 « activation progressive », §48
   * non-régression) : toute l'UI/tous les tests existants continuent
   * d'appliquer une modification de membre immédiatement, exactement comme
   * avant ce mandat, tant que cette définition n'est pas activée
   * explicitement (démonstration/tests dédiés uniquement).
   *
   * `members.approve` (nouvelle permission RBAC, distincte de
   * `members.update` qui reste requise pour SOUMETTRE la demande) — même
   * séparation demandeur/approbateur que `fiscalYears.manage`/`.approve`.
   * `allowSelfApproval` absent (= non autorisé) : role-admin détient les
   * deux permissions, donc `organizationService.decideMemberUpdate` bloque
   * explicitement l'auto-approbation (même pattern que
   * `settingsService.decideFiscalYearReopen`), pas seulement le RBAC.
   */
  { id: 'WD-007', tenantId: 'T-001', code: 'MEMBER_UPDATE', name: 'Modification d’un membre', domain: 'organization', description: 'Toute modification d’un membre déjà enregistré passe par une demande de validation avant application effective.', entityType: 'member', action: 'update', version: 1, steps: [{ order: 1, name: 'Validation de la modification', approverPermission: 'members.approve' }], active: false },
];
