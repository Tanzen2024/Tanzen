import { vi } from 'vitest';
import { loanRuleService, type LoanRuleUpdateInput } from './loan-rule.service';
import { loanRules } from '@/mocks/finance/loan-rules';
import { workflowRequests } from '@/mocks/operations/workflow-requests';

/**
 * Acteurs RÉELS de la démo T-001 pour la double approbation (mocks/access/users.ts) :
 *   - DEMANDEUR « métier » : U-002 Fatou Ndiaye (Gestionnaire → `loanRules.manage`, sans `loanRules.approve`) ;
 *   - ADMINISTRATEURS actifs : U-001 Amadou Mbaye (utilisateur connecté de la démo), U-013 Jeanne
 *     Mbarga, U-014 Paul Ekotto — trois administrateurs distincts, pour qu'une demande faite PAR un
 *     administrateur reçoive encore deux approbations d'administrateurs différents.
 */
export const REQUESTER = { id: 'U-002', name: 'Fatou Ndiaye' };
export const APPROVER_1 = { id: 'U-001', name: 'Amadou Mbaye' };
export const APPROVER_2 = { id: 'U-013', name: 'Jeanne Mbarga' };
export const APPROVER_3 = { id: 'U-014', name: 'Paul Ekotto' };

/** Deux approbations par deux approbateurs distincts, jamais le demandeur ; renvoie la dernière décision. */
async function approveTwice(tenantId: string, requestId: string, requesterId?: string) {
  const [first, second] = [APPROVER_1, APPROVER_2, APPROVER_3].filter((approver) => approver.id !== requesterId);
  await loanRuleService.decideLoanRuleUpdate(tenantId, requestId, 'approve', first.id, first.name);
  return loanRuleService.decideLoanRuleUpdate(tenantId, requestId, 'approve', second.id, second.name);
}

/**
 * Modification EFFECTIVE d'une règle par le seul chemin autorisé : demande puis deux approbations
 * par deux approbateurs distincts. Renvoie la règle après activation, `null` si la demande est refusée.
 */
export async function applyChange(tenantId: string, ruleId: string, patch: LoanRuleUpdateInput) {
  const requested = await loanRuleService.requestLoanRuleUpdate(tenantId, ruleId, patch, REQUESTER.id, REQUESTER.name);
  if (!requested.ok) return null;
  const decision = await approveTwice(tenantId, requested.request.id, REQUESTER.id);
  if (!decision.ok || !decision.activated) return null;
  return loanRules.find((rule) => rule.id === ruleId) ?? null;
}

/** Écrans : attend la demande soumise par « Soumettre la modification », puis la fait approuver deux fois. */
export async function approvePendingChange(tenantId: string, ruleId: string) {
  let requestId = '';
  let requesterId: string | undefined;
  await vi.waitFor(() => {
    const pending = workflowRequests.find((request) => request.tenantId === tenantId && request.entityType === 'creditRule' && request.entityId === ruleId && (request.status === 'pending' || request.status === 'inProgress'));
    if (!pending) throw new Error('aucune demande de modification en attente');
    requestId = pending.id;
    requesterId = pending.requestedByUserId;
  });
  return approveTwice(tenantId, requestId, requesterId);
}
