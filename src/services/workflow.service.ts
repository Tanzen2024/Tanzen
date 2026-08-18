import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { workflowDefinitions } from '@/mocks/operations/workflow-definitions';
import { workflowRequests, type WorkflowRequest, type WorkflowStatus, type WorkflowStep } from '@/mocks/operations/workflow-requests';
import { delegations } from '@/mocks/operations/delegations';
import type { Permission } from '@/mocks/rbac.mocks';

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
  createRequest: (tenantId: string, definitionId: string, input: { entityId: string; entityLabel: string; requestedBy: string; requestedByUserId?: string; amount?: number; justification?: string }) =>
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
