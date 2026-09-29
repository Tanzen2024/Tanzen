import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService } from './credit.service';
import { workflowService } from './workflow.service';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { guarantors } from '@/mocks/finance/guarantors';
import { loanRules } from '@/mocks/finance/loan-rules';
import { auditEvents } from '@/mocks/audit/audit-events';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { permissionCatalog, systemRoles, currentUser } from '@/mocks/rbac.mocks';
import type { TransactionInput } from './finance.service';

/**
 * WORKFLOW D'APPROBATION DES PRÊTS (mandat du 2026-09-27) — côté service :
 * approbation requise ⇒ demande de workflow (une étape = niveau de la règle) ; décision contrôlée
 * (droits du niveau, auto-approbation interdite, demande encore en attente) ; approuvé ⇒ décaissement
 * possible ; refusé ⇒ jamais. Utilisateurs seed : U-001 Amadou Mbaye (Administrateur, utilisateur
 * connecté), U-002 Fatou Ndiaye (Gestionnaire : aucune permission « approve »).
 */
const stores = { transactions, loans, loanFundingAllocations, applications, guarantors, loanRules, auditEvents, workflowRequests } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);

const rule = () => loanRules.find((item) => item.id === 'LR-001')!;
/** Demande de prêt conforme à LR-001 (garant 100 %), soumise par `requesterId`. */
async function submit(requesterId = 'U-002', requester = 'Fatou Ndiaye') {
  return (await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: 200_000, purpose: 'Équipement', guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 200_000, relation: 'Membre' }] }, requester, requesterId))!;
}

describe('Permissions d’approbation par niveau', () => {
  it('trois permissions dédiées dans le catalogue RBAC ; Administrateur les a, Gestionnaire et Lecture seule non', () => {
    const levels = ['loans.approve.member', 'loans.approve.board', 'loans.approve.admin'];
    expect(permissionCatalog).toEqual(expect.arrayContaining(levels));
    const role = (id: string) => systemRoles.find((item) => item.id === id)!;
    for (const permission of levels) {
      expect(role('role-admin').permissions).toContain(permission);
      expect(role('role-manager').permissions).not.toContain(permission);
      expect(role('role-viewer').permissions).not.toContain(permission);
    }
  });
});

describe('Soumission — approbation requise', () => {
  it('crée UNE demande de workflow (domaine crédit, liée à la demande de prêt), une seule étape au niveau de la règle, EN ATTENTE ; aucun prêt ni transaction', async () => {
    const before = { loans: loans.length, transactions: transactions.length };
    const { application, request } = await submit();
    expect(application.stage).toBe('stageSubmitted');
    expect(request).toMatchObject({ domain: 'credit', entityType: 'application', entityId: application.id, status: 'pending', requestedByUserId: 'U-002', amount: 200_000 });
    expect(request.steps.map((step) => [step.name, step.approverPermission])).toEqual([['Approbation administrateur', 'loans.approve.admin']]);
    expect({ loans: loans.length, transactions: transactions.length }).toEqual(before);
  });

  it.each([
    ['MEMBER', 'Approbation membre', 'loans.approve.member'],
    ['BOARD', 'Approbation du bureau', 'loans.approve.board'],
  ] as const)('niveau %s → étape « %s » exigeant %s', async (level, name, permission) => {
    rule().approvalLevel = level;
    const { request } = await submit();
    expect(request.steps.map((step) => [step.name, step.approverPermission])).toEqual([[name, permission]]);
  });

  it('les conditions normales de la règle restent vérifiées à la soumission (garant manquant → refus, rien de créé)', async () => {
    rule().requiresGuarantor = true; // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    const before = { applications: applications.length, requests: workflowRequests.length };
    expect(await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: 200_000, purpose: '', guarantors: [] }, 'Fatou Ndiaye', 'U-002')).toBeUndefined();
    expect({ applications: applications.length, requests: workflowRequests.length }).toEqual(before);
  });

  it('un prêt DIRECT est refusé tant que l’approbation est requise (plus d’auto-attestation)', async () => {
    const transactionInput: TransactionInput = { cashboxNumber: 'CS-001-TRÉS', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: 200_000, description: 'Prêt' };
    expect(await creditService.createLoanTransaction('T-001', { memberId: 'M-016', principal: 200_000, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 200_000, relation: '' }], approved: true, transactionInput })).toBeUndefined();
  });
});

describe('Décision — contrôles côté service', () => {
  it('approbation par un utilisateur habilité : acteur, date, commentaire enregistrés ; demande et prêt APPROUVÉS ; décaissement alors possible', async () => {
    const { application, request } = await submit();
    expect(await creditService.disburseLoan('T-001', application.id)).toBeUndefined(); // en attente : jamais décaissé
    const decision = await creditService.decideLoanApplication('T-001', request.id, 'approve', 'U-001', 'Amadou Mbaye', 'Dossier complet');
    expect(decision.ok).toBe(true);
    const decided = workflowRequests.find((item) => item.id === request.id)!;
    expect(decided.status).toBe('approved');
    expect(decided.steps[0]).toMatchObject({ status: 'approved', actedBy: 'U-001', actedByName: 'Amadou Mbaye', comment: 'Dossier complet' });
    expect(decided.steps[0].actedAt).toBeTruthy();
    expect(applications.find((item) => item.id === application.id)?.stage).toBe('stageApproved');
    const disbursed = (await creditService.disburseLoan('T-001', application.id))!;
    expect(disbursed.loan).toMatchObject({ memberId: 'M-016', principal: 200_000, status: 'active' });
    expect(guarantors.some((item) => item.loanId === disbursed.loan.id && item.guarantorName === 'Cheikh Diop')).toBe(true);
    // L'historique du workflow reprend la décision (pas de second système d'audit).
    const history = await workflowService.listHistory('T-001');
    expect(history.find((item) => item.workflowRequestId === request.id)).toMatchObject({ action: 'approved', actorName: 'Amadou Mbaye', comment: 'Dossier complet', stepName: 'Approbation administrateur' });
  });

  it('refus : demande et prêt REFUSÉS, décaissement impossible', async () => {
    const { application, request } = await submit();
    const decision = await creditService.decideLoanApplication('T-001', request.id, 'reject', 'U-001', 'Amadou Mbaye', 'Capacité insuffisante');
    expect(decision.ok).toBe(true);
    expect(workflowRequests.find((item) => item.id === request.id)?.status).toBe('rejected');
    expect(applications.find((item) => item.id === application.id)?.stage).toBe('stageRejected');
    expect(await creditService.disburseLoan('T-001', application.id)).toBeUndefined();
  });

  it('décaissement : le WORKFLOW fait foi — un dossier passé à « approuvé » hors workflow reste NON décaissable', async () => {
    const { application } = await submit();
    applications.find((item) => item.id === application.id)!.stage = 'stageApproved'; // contournement : aucune décision de workflow
    const before = { transactions: transactions.length, loans: loans.length };
    expect(await creditService.disburseLoan('T-001', application.id)).toBeUndefined();
    expect({ transactions: transactions.length, loans: loans.length }).toEqual(before);
  });

  it('traçabilité : l’audit de la décision porte l’acteur réel, le statut précédent, le nouveau statut et le commentaire', async () => {
    for (const [action, status, stage] of [['approve', 'approved', 'stageApproved'], ['reject', 'rejected', 'stageRejected']] as const) {
      const { application, request } = await submit();
      await creditService.decideLoanApplication('T-001', request.id, action, 'U-001', 'Amadou Mbaye', 'Motif ' + action);
      const event = auditEvents.filter((item) => item.resourceId === application.id).at(-1)!;
      expect(event).toMatchObject({ actorId: 'U-001', actorName: 'Amadou Mbaye', before: { status: 'pending', stage: 'stageSubmitted' }, after: { status, stage }, context: { requestId: request.id, comment: 'Motif ' + action } });
    }
  });

  it('refusé : utilisateur sans la permission du niveau (Gestionnaire) — rien ne change', async () => {
    const { request } = await submit('U-001', 'Amadou Mbaye');
    expect(await creditService.decideLoanApplication('T-001', request.id, 'approve', 'U-002', 'Fatou Ndiaye')).toEqual({ ok: false, reason: 'forbidden' });
    expect(workflowRequests.find((item) => item.id === request.id)?.status).toBe('pending');
  });

  it('refusé : auto-approbation (le demandeur ne décide jamais de sa propre demande)', async () => {
    const { request } = await submit('U-001', 'Amadou Mbaye');
    expect(await creditService.decideLoanApplication('T-001', request.id, 'approve', 'U-001', 'Amadou Mbaye')).toEqual({ ok: false, reason: 'selfApproval' });
    expect(workflowRequests.find((item) => item.id === request.id)?.status).toBe('pending');
  });

  it('refusé : demande déjà traitée (une seconde décision n’a aucun effet)', async () => {
    const { request } = await submit();
    await creditService.decideLoanApplication('T-001', request.id, 'approve', 'U-001', 'Amadou Mbaye');
    expect(await creditService.decideLoanApplication('T-001', request.id, 'reject', 'U-001', 'Amadou Mbaye')).toEqual({ ok: false, reason: 'notPending' });
    expect(workflowRequests.find((item) => item.id === request.id)?.status).toBe('approved');
  });

  it('les droits sont relus côté service : retirer la permission à l’utilisateur connecté bloque la décision', async () => {
    const { request } = await submit();
    const saved = [...currentUser.permissions];
    currentUser.permissions.splice(0, currentUser.permissions.length, ...saved.filter((permission) => permission !== 'loans.approve.admin'));
    try {
      expect(await creditService.decideLoanApplication('T-001', request.id, 'approve', 'U-001', 'Amadou Mbaye')).toEqual({ ok: false, reason: 'forbidden' });
    } finally {
      currentUser.permissions.splice(0, currentUser.permissions.length, ...saved);
    }
  });
});

describe('Statuts issus des actions', () => {
  it('ouverture par un approbateur habilité : EN ATTENTE → EN COURS (demande de prêt « en instruction ») ; sans le droit, aucun effet', async () => {
    const { application, request } = await submit();
    expect((await workflowService.openRequest('T-001', request.id, ['loans.read']))?.status).toBe('pending');
    const opened = (await workflowService.openRequest('T-001', request.id, currentUser.permissions))!;
    expect(opened.status).toBe('inProgress');
    creditService.applyLoanApplicationDecision('T-001', opened);
    expect(applications.find((item) => item.id === application.id)?.stage).toBe('stageReview');
    // Toujours décidable une fois en cours.
    expect((await creditService.decideLoanApplication('T-001', request.id, 'approve', 'U-001', 'Amadou Mbaye')).ok).toBe(true);
  });
});

describe('« Mes approbations »', () => {
  it('seulement les demandes que l’utilisateur peut traiter : pas les siennes, pas sans le droit, plus après décision', async () => {
    const other = await submit('U-002', 'Fatou Ndiaye');
    const own = await submit('U-001', 'Amadou Mbaye');
    const mine = (await workflowService.listMyApprovals('T-001', currentUser.permissions, 'U-001')).map((request) => request.id);
    expect(mine).toContain(other.request.id);
    expect(mine).not.toContain(own.request.id);
    expect((await workflowService.listMyApprovals('T-001', ['loans.read'], 'U-003')).map((request) => request.id)).not.toContain(other.request.id);
    await creditService.decideLoanApplication('T-001', other.request.id, 'approve', 'U-001', 'Amadou Mbaye');
    expect((await workflowService.listMyApprovals('T-001', currentUser.permissions, 'U-001')).map((request) => request.id)).not.toContain(other.request.id);
  });
});

describe('Approbation NON requise', () => {
  it('prêt enregistré directement, aucune demande de workflow créée', async () => {
    rule().requiresApproval = false;
    const before = workflowRequests.length;
    const transactionInput: TransactionInput = { cashboxNumber: 'CS-001-TRÉS', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: 200_000, description: 'Prêt' };
    const result = await creditService.createLoanTransaction('T-001', { memberId: 'M-016', principal: 200_000, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 200_000, relation: '' }], approved: false, transactionInput });
    expect(result?.loan.principal).toBe(200_000);
    expect(workflowRequests).toHaveLength(before);
  });
});
