import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { workflowDefinitions } from '@/mocks/operations/workflow-definitions';
import { workflowRequests, type WorkflowRequest, type WorkflowStatus } from '@/mocks/operations/workflow-requests';
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

  submitAction: (tenantId: string, requestId: string, action: 'approve' | 'reject' | 'return', actorName: string, comment?: string) =>
    mockRequest(() => {
      const request = getTenantScoped(workflowRequests, (item) => item.id === requestId, tenantId);
      if (!request) return undefined;
      const step = currentStepOf(request);
      if (!step || step.status !== 'pending') return request;

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
