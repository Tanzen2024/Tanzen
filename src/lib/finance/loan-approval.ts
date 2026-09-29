import type { LoanRuleApprovalLevel } from '@/mocks/finance/loan-rules';

/**
 * WORKFLOW D'APPROBATION DES PRÊTS (mandat du 2026-09-27) — le niveau d'approbation de la règle
 * de crédit détermine l'UNIQUE étape du workflow et la permission exigée pour la traiter
 * (permissions du catalogue RBAC existant, attribuables aux rôles via la matrice).
 */
export const LOAN_APPROVAL_PERMISSION: Record<LoanRuleApprovalLevel, string> = {
  MEMBER: 'loans.approve.member',
  BOARD: 'loans.approve.board',
  ADMIN: 'loans.approve.admin',
};

const LOAN_APPROVAL_STEP_NAME: Record<LoanRuleApprovalLevel, string> = {
  MEMBER: 'Approbation membre',
  BOARD: 'Approbation du bureau',
  ADMIN: 'Approbation administrateur',
};

/** L'étape unique d'une demande de prêt, pour le niveau de la règle (Administrateur par défaut). */
export function loanApprovalStep(level: LoanRuleApprovalLevel | null | undefined): { name: string; approverPermission: string } {
  const effective = level ?? 'ADMIN';
  return { name: LOAN_APPROVAL_STEP_NAME[effective], approverPermission: LOAN_APPROVAL_PERMISSION[effective] };
}

/**
 * Étapes d'une demande de prêt selon la DÉFINITION de workflow active (Paramètres → Workflows de
 * validation) — le nombre d'approbations configuré est respecté :
 *   - une seule étape configurée (cas par défaut) → l'étape unique du niveau de la règle de crédit
 *     (`loanApprovalStep`, décision du 2026-09-27, comportement inchangé) ;
 *   - plusieurs étapes configurées → reprises telles qu'elles sont configurées (nom et permission) :
 *     la demande reste dans le workflow jusqu'à la dernière approbation.
 */
export function loanApprovalSteps(configured: { name: string; approverPermission: string }[], level: LoanRuleApprovalLevel | null | undefined): { name: string; approverPermission: string }[] {
  if (configured.length <= 1) return [loanApprovalStep(level)];
  return configured.map((step) => ({ name: step.name, approverPermission: step.approverPermission }));
}
