import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { workflowService } from '@/services/workflow.service';
import { settingsService } from '@/services/settings.service';
import { organizationService } from '@/services/organization.service';
import { creditService } from '@/services/credit.service';
import { loanRuleService } from '@/services/loan-rule.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { queryKeys } from '@/services/query-keys';
import { notify } from '@/lib/notify';
import type { WorkflowRequest } from '@/mocks/operations/workflow-requests';

export type WorkflowDecisionAction = 'approve' | 'reject' | 'return' | 'cancel';
type T = (section: 'operations', key: string, values?: Record<string, string>) => string;
/** `errorKey` : clé `operations.*` du motif de blocage renvoyé par le service (rien n'a été modifié). */
type DecisionOutcome = { request: WorkflowRequest } | { errorKey: string };

/**
 * UNIQUE point d'exécution d'une décision de workflow côté écran — partagé par la fiche d'une demande
 * et par l'onglet « Mes approbations ». Chaque domaine passe par SON service métier (contrôles :
 * demande existante, étape et statut courants, permission de l'acteur, auto-approbation, action
 * autorisée) ; l'historique est celui du moteur (étapes `actedBy` / `actedAt` / `comment`).
 */
export function useWorkflowDecision(t: T, onSettled?: () => void) {
  const { currentTenant } = useTenant(); const { user } = usePermissions(); const queryClient = useQueryClient();
  const tenantId = currentTenant.id;

  return useMutation({
    mutationFn: async ({ request, action, comment }: { request: WorkflowRequest; action: WorkflowDecisionAction; comment?: string }): Promise<DecisionOutcome> => {
      const requestId = request.id;
      const note = comment || undefined;
      const decisive = action === 'approve' || action === 'reject';
      /**
       * D-FY-08 (VALIDÉE, Option B) : approve/reject d'une réouverture d'exercice ne passe JAMAIS
       * directement par `workflowService.submitAction` — `decideFiscalYearReopen` bloque
       * l'auto-approbation AVANT toute mutation (`null` = bloqué).
       */
      if (request.domain === 'settings' && request.entityType === 'fiscalYear' && decisive) {
        const result = await settingsService.decideFiscalYearReopen(tenantId, requestId, action, user.id, user.name, note);
        return result ? { request: result } : { errorKey: 'cannotActOwnRequest' };
      }
      /** Même principe — `decideMemberUpdate` bloque l'auto-approbation, le moteur générique reste agnostique. */
      if (request.domain === 'organization' && request.entityType === 'member' && decisive) {
        const result = await organizationService.decideMemberUpdate(tenantId, requestId, action, user.id, user.name, note);
        return result ? { request: result } : { errorKey: 'cannotActOwnRequest' };
      }
      /** Workflow d'approbation des prêts : droits du niveau, auto-approbation interdite (`creditService.decideLoanApplication`). */
      if (request.domain === 'credit' && request.entityType === 'application' && decisive) {
        const decision = await creditService.decideLoanApplication(tenantId, requestId, action, user.id, user.name, note);
        if (!decision.ok) return { errorKey: decision.reason === 'selfApproval' ? 'cannotActOwnRequest' : decision.reason === 'sameApprover' ? 'cannotApproveTwice' : decision.reason === 'forbidden' ? 'noPermission' : 'requestNoLongerPending' };
        return { request: decision.request };
      }
      /** Modification de la règle de crédit : double approbation (`loanRuleService.decideLoanRuleUpdate` — demandeur ≠ approbateurs, 2e approbateur ≠ 1er, activation après la 2e). */
      if (request.domain === 'credit' && request.entityType === 'creditRule' && decisive) {
        const decision = await loanRuleService.decideLoanRuleUpdate(tenantId, requestId, action, user.id, user.name, note);
        if (!decision.ok) return { errorKey: decision.reason === 'selfApproval' ? 'cannotActOwnRequest' : decision.reason === 'sameApprover' ? 'cannotApproveTwice' : decision.reason === 'forbidden' ? 'noPermission' : 'requestNoLongerPending' };
        return { request: decision.request };
      }
      const result = action === 'cancel' ? await workflowService.cancelRequest(tenantId, requestId, user.name, note) : await workflowService.decide(tenantId, requestId, action, user.id, user.name, note);
      if (!result) return { errorKey: 'noPermission' };
      /**
       * §24-BIS : le moteur reste agnostique du domaine — les effets de bord propres à chaque domaine
       * sont déclenchés ici, au seul point d'appel générique ; chacun est un no-op hors de son
       * domaine/entityType et pour toute action qui ne fait pas passer le statut à `approved`.
       */
      await settingsService.applyFiscalYearReopenDecision(tenantId, result);
      tontineOperationsService.applyPlanPermutationDecision(tenantId, result);
      creditService.applyLoanApplicationDecision(tenantId, result);
      await organizationService.applyMemberUpdateDecision(tenantId, result);
      return { request: result };
    },
    onSuccess: (outcome) => {
      if ('errorKey' in outcome) { notify.error(t('operations', outcome.errorKey)); return; }
      const result = outcome.request;
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.workflowRequest(result.id) });
      queryClient.invalidateQueries({ queryKey: ['operations'] });
      if (result.domain === 'settings' && result.entityType === 'fiscalYear') queryClient.invalidateQueries({ queryKey: queryKeys.settings.fiscalYears(tenantId) });
      // Demande de prêt : liste des demandes et fiche de la demande (statut suivi par le demandeur).
      if (result.domain === 'credit' && result.entityType === 'application') queryClient.invalidateQueries({ queryKey: ['credit', 'applications'] });
      if (result.domain === 'credit' && result.entityType === 'creditRule') queryClient.invalidateQueries({ queryKey: queryKeys.credit.loanRules(tenantId) });
      if (result.domain === 'organization' && result.entityType === 'member') {
        queryClient.invalidateQueries({ queryKey: queryKeys.members.list(tenantId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(result.entityId) });
        queryClient.invalidateQueries({ queryKey: ['operations', 'member-pending-approval', result.entityId, tenantId] });
      }
      // Permutation de bénéficiaires : le panneau Opérations lit les plans — sans invalidation, l'ancien bénéficiaire resterait affiché jusqu'à 30 s (`staleTime`).
      if (result.domain === 'tontines' && result.entityType === 'beneficiaryPermutation') queryClient.invalidateQueries({ queryKey: ['tontines', 'plans'] });
    },
    onSettled: () => onSettled?.(),
  });
}
