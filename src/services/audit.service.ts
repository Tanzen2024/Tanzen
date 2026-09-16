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
  /**
   * Point d'entrée d'ÉCRITURE générique — absent jusqu'ici (mandat « Moteur
   * générique de workflow de validation », besoin §23) : chaque domaine
   * (Crédit, Fiscal Year…) réimplémentait son propre `record<Domain>Audit`
   * qui poussait directement dans `auditEvents`. Cette fonction fait la même
   * chose, exposée une seule fois pour que le nouveau moteur (et tout futur
   * appelant) n'ait plus besoin de dupliquer ce helper. Les `record<Domain>Audit`
   * existants ne sont PAS migrés vers cette fonction dans ce mandat — risque
   * de régression hors périmètre, laissé en nettoyage futur.
   */
  record: (entry: { tenantId: string; actorId: string; actorName: string; module: AuditEvent['module']; action: string; eventType?: AuditEvent['eventType']; resourceType: string; resourceId: string; resourceLabel: string; status?: AuditEvent['status']; sensitive?: boolean; before?: Record<string, string | number>; after?: Record<string, string | number>; context?: Record<string, string | number> }): AuditEvent => {
    const event: AuditEvent = {
      id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: entry.tenantId,
      timestamp: new Date().toISOString(),
      actorId: entry.actorId,
      actorName: entry.actorName,
      module: entry.module,
      action: entry.action,
      eventType: entry.eventType ?? 'action',
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      resourceLabel: entry.resourceLabel,
      status: entry.status ?? 'success',
      sensitive: entry.sensitive ?? false,
      correlationId: entry.resourceId,
      ...(entry.before ? { before: entry.before } : {}),
      ...(entry.after ? { after: entry.after } : {}),
      ...(entry.context ? { context: entry.context } : {}),
    };
    auditEvents.push(event);
    return event;
  },
};
