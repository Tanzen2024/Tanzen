import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { workflowService, type ApprovalAction } from './workflow.service';

/**
 * Unique point d'entrée pour l'audit transversal. Ne recopie pas
 * l'historique des workflows (Operations) : il le dérive à la volée depuis
 * `workflowService.listHistory`, en plus des événements propres à l'audit
 * (sécurité, actions générales) qui n'ont pas d'équivalent ailleurs.
 */
function fromApprovalAction(action: ApprovalAction, tenantId: string): AuditEvent {
  return {
    id: `AUD-WF-${action.id}`,
    tenantId,
    timestamp: action.date,
    actorId: '',
    actorName: action.actorName,
    module: action.domain,
    action: `workflows.${action.action}`,
    eventType: 'action',
    resourceType: action.domain,
    resourceId: action.workflowRequestId,
    resourceLabel: action.entityLabel,
    status: action.action === 'rejected' ? 'failure' : 'success',
    sensitive: action.domain === 'finance' || action.domain === 'credit',
    correlationId: action.workflowRequestId,
    context: action.comment ? { stepName: action.stepName, comment: action.comment } : { stepName: action.stepName },
  };
}

async function listEvents(tenantId: string): Promise<AuditEvent[]> {
  const workflowHistory = await workflowService.listHistory(tenantId);
  const derived = workflowHistory.map((action) => fromApprovalAction(action, tenantId));
  const seeded = auditEvents.filter((event) => event.tenantId === tenantId);
  return [...seeded, ...derived].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export const auditService = {
  list: (tenantId: string) => listEvents(tenantId),
  get: async (tenantId: string, eventId: string) => (await listEvents(tenantId)).find((event) => event.id === eventId),
};
