import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { workflowDefinitions, type WorkflowDefinition, type WorkflowDomain, type WorkflowActionType, type WorkflowStepDefinition } from '@/mocks/operations/workflow-definitions';
import { workflowRequests, type WorkflowRequest, type WorkflowStatus, type WorkflowStep } from '@/mocks/operations/workflow-requests';
import { delegations } from '@/mocks/operations/delegations';
import type { Permission } from '@/mocks/rbac.mocks';
import type { ChangeSetItem } from '@/lib/workflow/change-set';

/** Entrée d'un formulaire d'administration (Paramètres → Workflows de validation) — mêmes champs qu'une `WorkflowDefinition`, sans les champs techniques (`id`/`tenantId`/`version`/timestamps) gérés par le service. `steps` sans `order` : réindexé par le service selon la position dans le tableau (l'UI réordonne via ↑/↓, jamais en éditant un numéro). */
export type WorkflowDefinitionInput = {
  code: string;
  name: string;
  domain: WorkflowDomain;
  description: string;
  entityType: WorkflowDefinition['entityType'];
  action: WorkflowActionType;
  steps: { name: string; approverPermission: string }[];
  active: boolean;
};

function reindexSteps(steps: { name: string; approverPermission: string }[]): WorkflowStepDefinition[] {
  return steps.map((step, index) => ({ order: index + 1, name: step.name, approverPermission: step.approverPermission }));
}

/** Désactive toutes les autres versions du même `code` pour ce tenant — au plus une version active à la fois (besoin §14), imposé ici plutôt que par une contrainte de type. */
function deactivateSiblingVersions(tenantId: string, code: string, keepId: string) {
  workflowDefinitions.forEach((definition) => {
    if (definition.tenantId === tenantId && definition.code === code && definition.id !== keepId) definition.active = false;
  });
}

export type ApprovalAction = {
  id: string;
  workflowRequestId: string;
  domain: WorkflowRequest['domain'];
  entityLabel: string;
  stepName: string;
  action: 'approved' | 'rejected' | 'returned';
  actorName: string;
  comment?: string;
  date: string;
};

function currentStepOf(request: WorkflowRequest) {
  return request.steps.find((step) => step.order === request.currentStepOrder);
}

function deriveHistory(tenantId: string): ApprovalAction[] {
  return workflowRequests
    .filter((request) => request.tenantId === tenantId)
    .flatMap((request) =>
      request.steps
        .filter((step) => step.status === 'approved' || step.status === 'rejected' || step.status === 'returned')
        .map((step) => ({
          id: `${request.id}-step-${step.order}`,
          workflowRequestId: request.id,
          domain: request.domain,
          entityLabel: request.entityLabel,
          stepName: step.name,
          action: step.status as 'approved' | 'rejected' | 'returned',
          actorName: step.actedByName ?? '—',
          comment: step.comment,
          date: step.actedAt ?? request.requestedAt,
        })),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export const workflowService = {
  listDefinitions: (tenantId: string) => mockRequest(() => workflowDefinitions.filter((definition) => definition.tenantId === tenantId)),
  getDefinition: (tenantId: string, definitionId: string) => mockRequest(() => getTenantScoped(workflowDefinitions, (definition) => definition.id === definitionId, tenantId)),

  /** Toutes les versions d'un même `code`, plus récente d'abord — alimente l'historique des versions sur la page de détail (besoin §17). */
  listDefinitionVersions: (tenantId: string, code: string) =>
    mockRequest(() => workflowDefinitions.filter((definition) => definition.tenantId === tenantId && definition.code === code).sort((a, b) => b.version - a.version)),

  /** Une définition déjà référencée par au moins une `WorkflowRequest` (n'importe quel statut, y compris `cancelled`/`rejected` — l'historique reste l'historique) ne doit plus être éditée en place (besoin §16). Non tenant-scopée à dessein : `WorkflowRequest.workflowDefinitionId` référence l'`id` exact, peu importe le tenant courant de l'appelant. */
  isDefinitionUsed: (definitionId: string) => mockRequest(() => workflowRequests.some((request) => request.workflowDefinitionId === definitionId)),

  /**
   * Administration (Paramètres → Workflows de validation) — création d'une
   * définition en VERSION 1. `code` unique par tenant (même convention
   * d'unicité que `matricule`/etc. côté Membres : vérifié au niveau service,
   * jamais laissé à la seule validation UI).
   */
  createDefinition: (tenantId: string, input: WorkflowDefinitionInput) =>
    mockRequest(() => {
      if (workflowDefinitions.some((definition) => definition.tenantId === tenantId && definition.code === input.code)) return undefined;
      const now = new Date().toISOString();
      const definition: WorkflowDefinition = {
        id: `WD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId,
        code: input.code,
        name: input.name,
        domain: input.domain,
        description: input.description,
        entityType: input.entityType,
        action: input.action,
        steps: reindexSteps(input.steps),
        active: input.active,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      if (definition.active) deactivateSiblingVersions(tenantId, definition.code, definition.id);
      workflowDefinitions.push(definition);
      return definition;
    }),

  /**
   * Édition EN PLACE — refusée (retourne `undefined`, aucune mutation) si la
   * définition est déjà utilisée par une `WorkflowRequest` (besoin §16) :
   * l'appelant doit passer par `createNewVersionOfDefinition` à la place.
   * Contrôle de sécurité appliqué ici, pas seulement côté UI (l'UI désactive
   * déjà le formulaire, mais un appel direct au service reste bloqué).
   */
  updateDefinition: (tenantId: string, definitionId: string, patch: WorkflowDefinitionInput) =>
    mockRequest(() => {
      const definition = getTenantScoped(workflowDefinitions, (item) => item.id === definitionId, tenantId);
      if (!definition) return undefined;
      if (workflowRequests.some((request) => request.workflowDefinitionId === definitionId)) return undefined;
      if (patch.code !== definition.code && workflowDefinitions.some((item) => item.tenantId === tenantId && item.code === patch.code && item.id !== definitionId)) return undefined;
      definition.code = patch.code;
      definition.name = patch.name;
      definition.domain = patch.domain;
      definition.description = patch.description;
      definition.entityType = patch.entityType;
      definition.action = patch.action;
      definition.steps = reindexSteps(patch.steps);
      definition.active = patch.active;
      definition.updatedAt = new Date().toISOString();
      if (definition.active) deactivateSiblingVersions(tenantId, definition.code, definition.id);
      return definition;
    }),

  /**
   * Nouvelle version (besoin §13/§16) — la source N'EST JAMAIS MODIFIÉE :
   * une nouvelle ligne est créée (`version: source.version + 1`), la source
   * et toute autre version du même `code` sont désactivées, la nouvelle est
   * activée. Les `WorkflowRequest` déjà créées continuent de référencer
   * l'`id` de leur version d'origine, intacte pour toujours.
   */
  createNewVersionOfDefinition: (tenantId: string, definitionId: string, patch: WorkflowDefinitionInput) =>
    mockRequest(() => {
      const source = getTenantScoped(workflowDefinitions, (item) => item.id === definitionId, tenantId);
      if (!source) return undefined;
      const now = new Date().toISOString();
      const next: WorkflowDefinition = {
        id: `WD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId,
        code: source.code,
        name: patch.name,
        domain: patch.domain,
        description: patch.description,
        entityType: patch.entityType,
        action: patch.action,
        steps: reindexSteps(patch.steps),
        active: true,
        version: source.version + 1,
        createdAt: now,
        updatedAt: now,
      };
      deactivateSiblingVersions(tenantId, source.code, next.id);
      workflowDefinitions.push(next);
      return next;
    }),

  /**
   * Activer/désactiver (besoin §14/§15) — n'affecte QUE la résolution des
   * NOUVELLES demandes (`getWorkflowFor`) : les `WorkflowRequest` déjà créées
   * poursuivent leur traitement sans changement, leurs `steps` étant déjà un
   * instantané propre à la demande. Activer une version désactive les autres
   * versions du même `code` (une seule version active à la fois).
   */
  setDefinitionActive: (tenantId: string, definitionId: string, active: boolean) =>
    mockRequest(() => {
      const definition = getTenantScoped(workflowDefinitions, (item) => item.id === definitionId, tenantId);
      if (!definition) return undefined;
      definition.active = active;
      definition.updatedAt = new Date().toISOString();
      if (active) deactivateSiblingVersions(tenantId, definition.code, definition.id);
      return definition;
    }),

  /**
   * Générique — création réelle d'une `WorkflowRequest`, réutilisable par
   * n'importe quel domaine (pas seulement Fiscal Year). Absente jusqu'ici :
   * toutes les `WorkflowRequest` du projet n'étaient que des données de seed,
   * jamais créées à l'exécution.
   *
   * Recherche de la définition PAR IDENTIFIANT SEUL, non tenant-scopée : les
   * données de seed existantes référencent déjà des `WorkflowDefinition` à
   * travers les tenants (ex. `WR-004`, tenant `T-005`, référence `WD-002`,
   * défini uniquement pour `T-001`) — une définition est une configuration
   * de processus, pas une donnée métier tenant-isolée ; seule la
   * `WorkflowRequest` créée reste strictement tenant-scopée (`tenantId`
   * passé explicitement, jamais dérivé de la définition).
   */
  createRequest: (
    tenantId: string,
    definitionId: string,
    input: { entityId: string; entityLabel: string; requestedBy: string; requestedByUserId?: string; amount?: number; justification?: string; warnings?: string[]; changeSet?: ChangeSetItem[]; entitySnapshotVersion?: number },
  ) =>
    mockRequest(() => {
      const definition = workflowDefinitions.find((item) => item.id === definitionId && item.active);
      if (!definition) return undefined;
      const steps: WorkflowStep[] = definition.steps.map((step) => ({ order: step.order, name: step.name, approverPermission: step.approverPermission, status: 'pending' }));
      const request: WorkflowRequest = {
        // `Date.now()` seul colliderait entre deux créations survenant dans la même milliseconde
        // (observé en test : deux demandes créées rapidement dans le même fichier de test généraient
        // le même id, faisant échouer getTenantScoped en retournant la première correspondance —
        // d'un autre tenant) — suffixe aléatoire pour garantir l'unicité.
        id: `WR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId,
        workflowDefinitionId: definition.id,
        domain: definition.domain,
        entityType: definition.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        amount: input.amount,
        justification: input.justification,
        warnings: input.warnings && input.warnings.length > 0 ? input.warnings : undefined,
        changeSet: input.changeSet && input.changeSet.length > 0 ? input.changeSet : undefined,
        entitySnapshotVersion: input.entitySnapshotVersion,
        workflowDefinitionVersion: definition.version,
        requestedBy: input.requestedBy,
        requestedByUserId: input.requestedByUserId,
        requestedAt: new Date().toISOString().slice(0, 10),
        status: 'pending',
        currentStepOrder: steps[0]?.order ?? 1,
        steps,
      };
      workflowRequests.push(request);
      return request;
    }),

  /**
   * Résolveur générique "entityType + action → WorkflowDefinition active"
   * (besoin §6/§29). Recherche PAR entityType/action SEULE, non tenant-scopée
   * — même philosophie documentée ci-dessus pour `createRequest` : une
   * définition est une configuration de processus, pas une donnée métier
   * tenant-isolée. Retourne `undefined` si aucune définition active ne
   * couvre ce couple — c'est ce qui permet l'activation progressive (§41) :
   * l'appelant doit alors muter l'entité directement, aucun workflow requis.
   */
  getWorkflowFor: (entityType: WorkflowRequest['entityType'], action: WorkflowActionType) =>
    mockRequest(() => workflowDefinitions.find((definition) => definition.entityType === entityType && definition.action === action && definition.active)),

  /**
   * Anti-double-demande concurrente sur une même entité (besoin §34) — la
   * `WorkflowRequest` `pending`/`inProgress` existante, s'il y en a une.
   * Générique : réutilisable par tout domaine, pas seulement `member`.
   */
  hasPendingApproval: (tenantId: string, entityType: WorkflowRequest['entityType'], entityId: string) =>
    mockRequest(() => workflowRequests.find((request) => request.tenantId === tenantId && request.entityType === entityType && request.entityId === entityId && (request.status === 'pending' || request.status === 'inProgress'))),

  /**
   * Garde anti-auto-approbation (besoin §22), factorisée pour que les futurs
   * domaines n'aient plus à réécrire à la main le `requestedByUserId ===
   * actorId` déjà présent dans `settingsService.decideFiscalYearReopen`.
   * Volontairement PAS appelée automatiquement par `submitAction` ci-dessous
   * — un commentaire sur `WD-006` documente une décision de mandat
   * antérieure de ne pas généraliser ce contrôle dans le moteur lui-même
   * (spécifique à Fiscal Year à l'origine). Chaque domaine qui veut ce
   * contrôle l'appelle explicitement depuis son propre `decide<X>`, exactement
   * comme Fiscal Year le fait déjà — ce helper évite seulement la duplication
   * de la comparaison elle-même.
   */
  isSelfApprovalBlocked: (request: WorkflowRequest, actorId: string): boolean => Boolean(request.requestedByUserId && request.requestedByUserId === actorId),

  listRequests: (tenantId: string) => mockRequest(() => workflowRequests.filter((request) => request.tenantId === tenantId)),
  getRequest: (tenantId: string, requestId: string) => mockRequest(() => getTenantScoped(workflowRequests, (request) => request.id === requestId, tenantId)),

  /** Étapes en cours dont la permission requise est détenue par l'utilisateur courant (RBAC réel, pas un filtre par rôle nommé). */
  listMyApprovals: (tenantId: string, userPermissions: Permission[]) =>
    mockRequest(() =>
      workflowRequests.filter((request) => {
        if (request.tenantId !== tenantId) return false;
        if (request.status !== 'pending' && request.status !== 'inProgress') return false;
        const step = currentStepOf(request);
        return Boolean(step && step.status === 'pending' && userPermissions.includes(step.approverPermission));
      }),
    ),

  listDelegations: (tenantId: string) => mockRequest(() => delegations.filter((delegation) => delegation.tenantId === tenantId)),

  listHistory: (tenantId: string) => mockRequest(() => deriveHistory(tenantId)),

  /**
   * `actorId` (nouveau paramètre optionnel, dernière position — signature
   * rétrocompatible) : identifiant fiable de l'utilisateur ayant réellement
   * effectué l'action, écrit dans `WorkflowStep.actedBy` (champ existant
   * dans le type mais jusqu'ici jamais renseigné — seul `actedByName` l'était).
   * Générique, pas spécifique à Fiscal Year : bénéficie à tout domaine
   * (Credit/Tontines/Governance/Finance) dès que son appelant le fournit ;
   * les appels existants qui ne le passent pas conservent exactement le
   * même comportement qu'avant (`actedBy` reste `undefined`).
   */
  submitAction: (tenantId: string, requestId: string, action: 'approve' | 'reject' | 'return', actorName: string, comment?: string, actorId?: string) =>
    mockRequest(() => {
      const request = getTenantScoped(workflowRequests, (item) => item.id === requestId, tenantId);
      if (!request) return undefined;
      const step = currentStepOf(request);
      if (!step || step.status !== 'pending') return request;

      step.actedBy = actorId;
      step.actedByName = actorName;
      step.actedAt = new Date().toISOString();
      step.comment = comment;

      if (action === 'approve') {
        step.status = 'approved';
        const nextStep = request.steps.find((item) => item.order === request.currentStepOrder + 1);
        if (nextStep) {
          request.currentStepOrder = nextStep.order;
          request.status = 'inProgress' as WorkflowStatus;
        } else {
          request.status = 'approved';
        }
      } else if (action === 'reject') {
        step.status = 'rejected';
        request.status = 'rejected';
      } else {
        step.status = 'returned';
        request.status = 'returned';
      }
      return request;
    }),

  /** UC100W-10 « Annuler une demande ». Gardée par la même permission d'étape que approve/reject/return (cf. docs/PHASE_09_DECISIONS_A_VALIDER.md — WorkflowRequest n'a pas de lien vers Users.id pour distinguer le demandeur lui-même). */
  cancelRequest: (tenantId: string, requestId: string, actorName: string, comment?: string) =>
    mockRequest(() => {
      const request = getTenantScoped(workflowRequests, (item) => item.id === requestId, tenantId);
      if (!request) return undefined;
      const step = currentStepOf(request);
      if (!step || step.status !== 'pending') return request;
      step.actedByName = actorName;
      step.actedAt = new Date().toISOString();
      step.comment = comment;
      request.status = 'cancelled';
      return request;
    }),
};
