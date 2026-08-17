import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { meetings } from '@/mocks/organization/governance';
import { assemblyDecisions, type AssemblyDecision } from '@/mocks/organization/assembly-decisions';

export type AssemblyDecisionInput = { title: string; description: string; createdBy: string };

/** Isolation indirecte (D-4C4-WEB-09, pas de tenant_id propre) : une AssemblyDecision appartient au tenant courant ssi son Meeting l'est. */
function getMeetingScoped(tenantId: string, meetingId: string) {
  return getTenantScoped(meetings, (item) => item.id === meetingId && item.type === 'GENERAL_ASSEMBLY', tenantId);
}

function getDecisionScoped(tenantId: string, decisionId: string): AssemblyDecision | undefined {
  const decision = assemblyDecisions.find((item) => item.id === decisionId);
  if (!decision) return undefined;
  return getMeetingScoped(tenantId, decision.meetingId) ? decision : undefined;
}

export const assemblyDecisionService = {
  listAssemblyDecisionsByMeeting: (tenantId: string, meetingId: string) =>
    mockRequest(() => {
      const meeting = getMeetingScoped(tenantId, meetingId);
      if (!meeting) return [];
      return assemblyDecisions.filter((decision) => decision.meetingId === meetingId);
    }),

  getAssemblyDecision: (tenantId: string, decisionId: string) =>
    mockRequest(() => getDecisionScoped(tenantId, decisionId)),

  /** `decisionNumber` : séquentiel par Meeting (1, 2, 3...), pas de source ne précisant un autre schéma. `status` toujours DRAFT à la création. */
  createAssemblyDecision: (tenantId: string, meetingId: string, input: AssemblyDecisionInput) =>
    mockRequest(() => {
      const meeting = getMeetingScoped(tenantId, meetingId);
      if (!meeting) return undefined;
      if (!input.title.trim()) return undefined;
      const decisionNumber = assemblyDecisions.filter((decision) => decision.meetingId === meetingId).length + 1;
      const now = new Date().toISOString();
      const decision: AssemblyDecision = {
        id: `AD-${String(assemblyDecisions.length + 1).padStart(3, '0')}`,
        meetingId,
        decisionNumber,
        title: input.title,
        description: input.description,
        status: 'DRAFT',
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        submittedAt: null,
        decidedAt: null,
      };
      assemblyDecisions.push(decision);
      return decision;
    }),

  /**
   * Cycle de vie validé : DRAFT -> SUBMITTED -> VOTING -> DECIDED (terminal) ;
   * annulation depuis DRAFT/SUBMITTED -> CANCELLED (terminal). Toute autre
   * transition est refusée (undefined), jamais silencieusement acceptée —
   * même garde que le cycle de vie Meeting (D-4C3-TECH-01).
   */
  submitAssemblyDecision: (tenantId: string, decisionId: string) =>
    mockRequest(() => {
      const decision = getDecisionScoped(tenantId, decisionId);
      if (!decision || decision.status !== 'DRAFT') return undefined;
      decision.status = 'SUBMITTED';
      decision.submittedAt = new Date().toISOString();
      decision.updatedAt = decision.submittedAt;
      return decision;
    }),
  startAssemblyDecisionVoting: (tenantId: string, decisionId: string) =>
    mockRequest(() => {
      const decision = getDecisionScoped(tenantId, decisionId);
      if (!decision || decision.status !== 'SUBMITTED') return undefined;
      decision.status = 'VOTING';
      decision.updatedAt = new Date().toISOString();
      return decision;
    }),
  decideAssemblyDecision: (tenantId: string, decisionId: string) =>
    mockRequest(() => {
      const decision = getDecisionScoped(tenantId, decisionId);
      if (!decision || decision.status !== 'VOTING') return undefined;
      decision.status = 'DECIDED';
      decision.decidedAt = new Date().toISOString();
      decision.updatedAt = decision.decidedAt;
      return decision;
    }),
  cancelAssemblyDecision: (tenantId: string, decisionId: string) =>
    mockRequest(() => {
      const decision = getDecisionScoped(tenantId, decisionId);
      if (!decision || (decision.status !== 'DRAFT' && decision.status !== 'SUBMITTED')) return undefined;
      decision.status = 'CANCELLED';
      decision.updatedAt = new Date().toISOString();
      return decision;
    }),
};
