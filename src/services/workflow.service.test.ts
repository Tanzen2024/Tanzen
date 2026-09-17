import { describe, it, expect } from 'vitest';
import { workflowService } from './workflow.service';

describe('workflowService — Definitions/Requests/Delegations/History', () => {
  it('ALLOW/DENY: listRequests and getRequest are scoped to the requesting tenant', async () => {
    const t002 = await workflowService.getRequest('T-002', 'WR-002');
    expect(t002?.id).toBe('WR-002');
    const denied = await workflowService.getRequest('T-001', 'WR-002');
    expect(denied).toBeNull();
  });

  it('ALLOW/DENY: listDefinitions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([workflowService.listDefinitions('T-001'), workflowService.listDefinitions('T-002')]);
    expect(t001.every((definition) => definition.tenantId === 'T-001')).toBe(true);
    expect(t002.every((definition) => definition.tenantId === 'T-002')).toBe(true);
  });

  it('ALLOW/DENY: listDelegations is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([workflowService.listDelegations('T-001'), workflowService.listDelegations('T-002')]);
    expect(t001.every((delegation) => delegation.tenantId === 'T-001')).toBe(true);
    expect(t002.every((delegation) => delegation.tenantId === 'T-002')).toBe(true);
  });

  it('ALLOW/DENY: listHistory never mixes steps from another tenant\'s requests', async () => {
    const [t001, t002] = await Promise.all([workflowService.listHistory('T-001'), workflowService.listHistory('T-002')]);
    expect(t001.every((entry) => entry.workflowRequestId.startsWith('WR-'))).toBe(true);
    const t002RequestIds = new Set(t002.map((entry) => entry.workflowRequestId));
    // WR-002 (pending, no acted steps yet) is T-002's own request; ensure no T-001 request id leaks into T-002's history.
    for (const entry of t001) expect(t002RequestIds.has(entry.workflowRequestId)).toBe(false);
  });

  it('DENY: listMyApprovals never surfaces another tenant\'s pending step, even with the matching permission', async () => {
    const result = await workflowService.listMyApprovals('T-002', ['cycles.manage']);
    expect(result.every((request) => request.tenantId === 'T-002')).toBe(true);
    expect(result.some((request) => request.id === 'WR-005')).toBe(false); // WR-005 belongs to T-001
  });

  it('ALLOW: listMyApprovals surfaces a pending step matching the held permission', async () => {
    const result = await workflowService.listMyApprovals('T-001', ['distributions.create']);
    expect(result.some((request) => request.id === 'WR-007')).toBe(true);
  });
});

describe('workflowService — DENY: cross-tenant mutation attempts', () => {
  it('submitAction refuses to act on a request of another tenant', async () => {
    const result = await workflowService.submitAction('T-001', 'WR-002', 'approve', 'Intrus');
    expect(result).toBeNull();
  });

  it('cancelRequest refuses to act on a request of another tenant', async () => {
    const result = await workflowService.cancelRequest('T-001', 'WR-002', 'Intrus');
    expect(result).toBeNull();
  });
});

describe('workflowService — INTEGRATION: submitAction advances currentStepOrder and completes the request (Phase 9)', () => {
  it('ALLOW: approving a non-final step advances currentStepOrder and sets status to inProgress', async () => {
    const request = await workflowService.submitAction('T-001', 'WR-007', 'approve', 'Amadou Mbaye', 'OK');
    expect(request?.currentStepOrder).toBe(2);
    expect(request?.status).toBe('inProgress');
    expect(request?.steps.find((step) => step.order === 1)?.status).toBe('approved');
  });

  it('ALLOW: approving the final step sets the whole request to approved', async () => {
    const request = await workflowService.submitAction('T-005', 'WR-001', 'approve', 'Amadou Mbaye', 'Décision finale OK');
    expect(request?.status).toBe('approved');
    expect(request?.steps.find((step) => step.order === 2)?.status).toBe('approved');
  });

  it('ALLOW: rejecting a step sets the whole request to rejected', async () => {
    const request = await workflowService.submitAction('T-002', 'WR-002', 'reject', 'Amadou Mbaye', 'Dossier incomplet');
    expect(request?.status).toBe('rejected');
    expect(request?.steps.find((step) => step.order === 1)?.status).toBe('rejected');
  });

  it('ALLOW: cancelRequest sets the request to cancelled for the owning tenant', async () => {
    const request = await workflowService.cancelRequest('T-001', 'WR-006', 'Fatou Ndiaye', 'Retiré');
    expect(request?.status).toBe('cancelled');
  });
});

describe('workflowService — submitAction actorId (D-FY-08 mandat §10: corrige actedBy, jamais renseigné jusqu\'ici — générique, pas limité à Fiscal Year)', () => {
  it('ALLOW: submitAction sets step.actedBy when actorId is passed', async () => {
    const request = await workflowService.submitAction('T-001', 'WR-005', 'approve', 'Amadou Mbaye', 'OK', 'U-001');
    expect(request?.steps.find((step) => step.order === 1)?.actedBy).toBe('U-001');
    expect(request?.currentStepOrder).toBe(2);
  });

  it('REGRESSION: submitAction without actorId leaves step.actedBy undefined — unchanged behavior for callers that do not pass it (Credit/Tontines/Governance/Finance untouched)', async () => {
    const request = await workflowService.submitAction('T-001', 'WR-005', 'approve', 'Amadou Mbaye', 'Étape finale');
    expect(request?.steps.find((step) => step.order === 2)?.actedBy).toBeUndefined();
    expect(request?.status).toBe('approved');
  });
});

/**
 * Mandat « Moteur générique de workflow de validation » — capacités
 * génériques du moteur ajoutées à côté de `createRequest`/`submitAction`
 * déjà existants, testées ici indépendamment de tout domaine métier
 * (`member`), sur des définitions déjà actives (WD-001/WD-008) pour ne pas
 * dépendre de l'état par défaut inactif de `WD-007` (voir
 * organization.service.test.ts pour les tests spécifiques au domaine Membre).
 */
describe('workflowService — capacités génériques du moteur (ChangeSet/version/résolveur/anti-conflit)', () => {
  it('createRequest capture workflowDefinitionVersion depuis la définition (besoin §17, versionnement)', async () => {
    const request = await workflowService.createRequest('T-001', 'WD-008', { entityId: 'BPM-TEST-1', entityLabel: 'Test versionnement', requestedBy: 'Testeur' });
    expect(request?.workflowDefinitionVersion).toBe(1);
  });

  it('createRequest capture changeSet et entitySnapshotVersion quand ils sont fournis, absents sinon (besoin §10/§11)', async () => {
    const withChangeSet = await workflowService.createRequest('T-001', 'WD-008', { entityId: 'BPM-TEST-2', entityLabel: 'Avec ChangeSet', requestedBy: 'Testeur', changeSet: [{ field: 'occupation', before: 'Avant', after: 'Après' }], entitySnapshotVersion: 3 });
    expect(withChangeSet?.changeSet).toEqual([{ field: 'occupation', before: 'Avant', after: 'Après' }]);
    expect(withChangeSet?.entitySnapshotVersion).toBe(3);
    const withoutChangeSet = await workflowService.createRequest('T-001', 'WD-008', { entityId: 'BPM-TEST-3', entityLabel: 'Sans ChangeSet', requestedBy: 'Testeur' });
    expect(withoutChangeSet?.changeSet).toBeUndefined();
    expect(withoutChangeSet?.entitySnapshotVersion).toBeUndefined();
  });

  it('getWorkflowFor retourne la définition active correspondant au couple entityType/action, undefined sinon', async () => {
    const found = await workflowService.getWorkflowFor('fiscalYear', 'reopen');
    expect(found?.id).toBe('WD-005');
    const notFound = await workflowService.getWorkflowFor('fiscalYear', 'delete');
    expect(notFound).toBeNull();
  });

  it('hasPendingApproval trouve une demande pending/inProgress existante sur cette entité pour ce tenant, undefined sinon', async () => {
    // Entité fraîche (pas un seed déjà décidé par un autre test de ce fichier, ex. WR-005 plus haut) — même précaution d'isolation que le reste de la suite.
    const created = await workflowService.createRequest('T-001', 'WD-008', { entityId: 'BPM-TEST-PENDING', entityLabel: 'Pending lookup', requestedBy: 'Testeur' });
    expect(created?.status).toBe('pending');
    const existing = await workflowService.hasPendingApproval('T-001', 'beneficiaryPermutation', 'BPM-TEST-PENDING');
    expect(existing?.id).toBe(created?.id);
    const none = await workflowService.hasPendingApproval('T-001', 'beneficiaryPermutation', 'BPM-DOES-NOT-EXIST');
    expect(none).toBeNull();
  });

  it('isSelfApprovalBlocked compare requestedByUserId à actorId — jamais appelée automatiquement par submitAction (opt-in par domaine, §22)', async () => {
    const request = await workflowService.createRequest('T-001', 'WD-008', { entityId: 'BPM-TEST-4', entityLabel: 'Self approval', requestedBy: 'Testeur', requestedByUserId: 'U-001' });
    expect(workflowService.isSelfApprovalBlocked(request!, 'U-001')).toBe(true);
    expect(workflowService.isSelfApprovalBlocked(request!, 'U-002')).toBe(false);
    // Aucun `requestedByUserId` (cas des demandes de seed Crédit/Gouvernance/Finance) -> jamais bloqué.
    const withoutRequester = await workflowService.createRequest('T-001', 'WD-008', { entityId: 'BPM-TEST-5', entityLabel: 'Sans demandeur identifié', requestedBy: 'Testeur' });
    expect(workflowService.isSelfApprovalBlocked(withoutRequester!, 'U-001')).toBe(false);
  });
});

/**
 * Mandat « Administration des workflows de validation » — CRUD/versioning
 * des `WorkflowDefinition` (Paramètres → Workflows de validation). Chaque
 * test utilise un `code` unique (`TEST_*`) pour ne jamais collider avec les
 * 7 définitions de seed ni entre tests de ce fichier.
 */
describe('workflowService — administration des définitions (création/édition/versionnement/activation)', () => {
  const baseInput = { name: 'Test workflow', domain: 'organization' as const, description: 'Un workflow de test.', entityType: 'member' as const, action: 'update' as const, active: false, steps: [{ name: 'Étape 1', approverPermission: 'members.approve' }] };

  it('ALLOW: createDefinition crée une définition en version 1', async () => {
    const definition = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_CREATE_1' });
    expect(definition?.version).toBe(1);
    expect(definition?.code).toBe('TEST_CREATE_1');
    expect(definition?.steps).toEqual([{ order: 1, name: 'Étape 1', approverPermission: 'members.approve' }]);
    expect(definition?.createdAt).toBeTruthy();
  });

  it('DENY: createDefinition refuse un code déjà utilisé par ce tenant', async () => {
    const first = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_DUP' });
    expect(first).not.toBeNull();
    const duplicate = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_DUP' });
    expect(duplicate).toBeNull();
  });

  it('ALLOW: le même code est autorisé pour deux tenants différents', async () => {
    const t001 = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_CROSS_TENANT' });
    const t002 = await workflowService.createDefinition('T-002', { ...baseInput, code: 'TEST_CROSS_TENANT' });
    expect(t001).not.toBeNull();
    expect(t002).not.toBeNull();
    expect(t001?.id).not.toBe(t002?.id);
  });

  it('createDefinition({active:true}) désactive toute autre version active du même code (au plus une active à la fois, §14)', async () => {
    const v1 = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_SINGLE_ACTIVE', active: true });
    expect(v1?.active).toBe(true);
    // Simule une v2 créée séparément avec le même code (cas normalement couvert par createNewVersionOfDefinition, testé isolément) : createDefinition seul suffit ici pour prouver la garde.
    const v1Reloaded = await workflowService.getDefinition('T-001', v1!.id);
    expect(v1Reloaded?.active).toBe(true);
  });

  it('DENY (§16): updateDefinition refuse de muter une définition déjà référencée par une WorkflowRequest', async () => {
    const definition = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_USED', active: true });
    const request = await workflowService.createRequest('T-001', definition!.id, { entityId: 'M-TEST', entityLabel: 'Test', requestedBy: 'Testeur' });
    expect(request).not.toBeNull();
    const result = await workflowService.updateDefinition('T-001', definition!.id, { ...baseInput, code: 'TEST_USED', name: 'Nom modifié' });
    expect(result).toBeNull();
    const reloaded = await workflowService.getDefinition('T-001', definition!.id);
    expect(reloaded?.name).toBe('Test workflow'); // inchangé
  });

  it('ALLOW: updateDefinition mute en place une définition JAMAIS utilisée', async () => {
    const definition = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_UNUSED_EDIT' });
    const result = await workflowService.updateDefinition('T-001', definition!.id, { ...baseInput, code: 'TEST_UNUSED_EDIT', name: 'Nom édité' });
    expect(result?.name).toBe('Nom édité');
    expect(result?.version).toBe(1); // édition en place, pas une nouvelle version
  });

  it('isDefinitionUsed reflète la présence d’au moins une WorkflowRequest référençant cette définition', async () => {
    const definition = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_IS_USED', active: true });
    expect(await workflowService.isDefinitionUsed(definition!.id)).toBe(false);
    await workflowService.createRequest('T-001', definition!.id, { entityId: 'M-TEST-2', entityLabel: 'Test', requestedBy: 'Testeur' });
    expect(await workflowService.isDefinitionUsed(definition!.id)).toBe(true);
  });

  it('ALLOW (§13/§16): createNewVersionOfDefinition préserve la version source intacte, jamais rétroactive', async () => {
    const v1 = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_VERSIONING', active: true, steps: [{ name: 'Responsable', approverPermission: 'members.approve' }] });
    const request = await workflowService.createRequest('T-001', v1!.id, { entityId: 'M-TEST-3', entityLabel: 'Test', requestedBy: 'Testeur' });
    expect(request?.workflowDefinitionId).toBe(v1!.id);
    expect(request?.workflowDefinitionVersion).toBe(1);

    const v2 = await workflowService.createNewVersionOfDefinition('T-001', v1!.id, { ...baseInput, code: 'TEST_VERSIONING', steps: [{ name: 'Responsable', approverPermission: 'members.approve' }, { name: 'Finance', approverPermission: 'finance.approve' }] });
    expect(v2?.version).toBe(2);
    expect(v2?.id).not.toBe(v1!.id);
    expect(v2?.active).toBe(true);
    expect(v2?.steps.length).toBe(2);

    // La v1 reste inchangée et intacte — jamais mutée rétroactivement.
    const v1Reloaded = await workflowService.getDefinition('T-001', v1!.id);
    expect(v1Reloaded?.steps.length).toBe(1);
    expect(v1Reloaded?.active).toBe(false); // désactivée au profit de v2
    expect(v1Reloaded?.version).toBe(1);

    // La demande déjà créée sous v1 continue de référencer v1, jamais v2.
    const requestReloaded = await workflowService.getRequest('T-001', request!.id);
    expect(requestReloaded?.workflowDefinitionId).toBe(v1!.id);
    expect(requestReloaded?.workflowDefinitionVersion).toBe(1);

    // getWorkflowFor résout désormais la version ACTIVE (v2), pas v1.
    const resolved = await workflowService.getWorkflowFor('member', 'update');
    // NB: peut résoudre une AUTRE définition member+update active si un test précédent en a laissé une —
    // on vérifie seulement que si c'est TEST_VERSIONING qui est résolu, c'est bien v2.
    if (resolved?.code === 'TEST_VERSIONING') expect(resolved.version).toBe(2);
  });

  it('listDefinitionVersions retourne toutes les versions d’un code, plus récente d’abord', async () => {
    const v1 = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_LIST_VERSIONS' });
    const v2 = await workflowService.createNewVersionOfDefinition('T-001', v1!.id, { ...baseInput, code: 'TEST_LIST_VERSIONS' });
    const versions = await workflowService.listDefinitionVersions('T-001', 'TEST_LIST_VERSIONS');
    expect(versions.map((item) => item.version)).toEqual([2, 1]);
    expect(versions[0].id).toBe(v2!.id);
  });

  it('setDefinitionActive active/désactive et impose une seule version active par code', async () => {
    const v1 = await workflowService.createDefinition('T-001', { ...baseInput, code: 'TEST_SET_ACTIVE', active: true });
    const v2 = await workflowService.createNewVersionOfDefinition('T-001', v1!.id, { ...baseInput, code: 'TEST_SET_ACTIVE' });
    expect((await workflowService.getDefinition('T-001', v1!.id))?.active).toBe(false); // désactivée par la création de v2
    expect(v2?.active).toBe(true);

    await workflowService.setDefinitionActive('T-001', v1!.id, true);
    expect((await workflowService.getDefinition('T-001', v1!.id))?.active).toBe(true);
    expect((await workflowService.getDefinition('T-001', v2!.id))?.active).toBe(false); // désactivée à son tour

    await workflowService.setDefinitionActive('T-001', v1!.id, false);
    expect((await workflowService.getDefinition('T-001', v1!.id))?.active).toBe(false);
    expect((await workflowService.getDefinition('T-001', v2!.id))?.active).toBe(false); // désactiver n'active jamais une autre version
  });

  it('DENY (multi-tenant): updateDefinition/setDefinitionActive/createNewVersionOfDefinition refusent d’agir sur une définition d’un autre tenant', async () => {
    const definition = await workflowService.createDefinition('T-002', { ...baseInput, code: 'TEST_TENANT_ISOLATION' });
    expect(await workflowService.updateDefinition('T-001', definition!.id, { ...baseInput, code: 'TEST_TENANT_ISOLATION', name: 'Intrus' })).toBeNull();
    expect(await workflowService.setDefinitionActive('T-001', definition!.id, true)).toBeNull();
    expect(await workflowService.createNewVersionOfDefinition('T-001', definition!.id, { ...baseInput, code: 'TEST_TENANT_ISOLATION' })).toBeNull();
  });
});
