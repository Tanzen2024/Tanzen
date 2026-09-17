import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tenants } from '@/mocks/organization/tenants';
import { members, type Member } from '@/mocks/organization/members';
import { meetings, boardMembers, type Meeting, type MeetingType, type BoardMember } from '@/mocks/organization/governance';
import { mandateFunctions, type MandateFunction } from '@/mocks/organization/mandate-functions';
import { currentUser, type PlatformScope } from '@/mocks/rbac.mocks';
import { workflowService } from './workflow.service';
import { auditService } from './audit.service';
import { notificationService } from './notification.service';
import { computeChangeSet } from '@/lib/workflow/change-set';
import type { WorkflowRequest } from '@/mocks/operations/workflow-requests';

/**
 * Séparation Commercial/Tenant (2026-08-16) : `createTenant`/`updateTenant`
 * (écriture du registre des tenants) n'existent plus ici — exclusifs à
 * tanzen-commercial (Platform Administration). `listTenants`/`getTenant`
 * (lecture seule) restent dupliquées à l'identique côté tenant : le
 * sélecteur "Tenant" du formulaire Membre en dépend encore, même s'il ne
 * contient jamais qu'un seul élément en pratique (scope toujours
 * `'tenant'` ici). Voir docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md §21.
 */
/** `matricule`/`gender`/`joinedAt` ajoutés au formulaire (mandat P1 MEMBERS — alignement du modèle canonique) ; `joinedAt` reste optionnel en entrée (défaut : date du jour, comportement préexistant conservé). */
/** `photoUrl` optionnel (défaut `''`, jamais requis) : de nombreux appelants pré-existants (tests d'autres services, ex. `tontine-operations.service.test.ts`) construisent un `MemberInput` sans le connaître — le rendre obligatoire aurait cassé des modules hors du périmètre Membres. */
export type MemberInput = Pick<Member, 'firstName' | 'lastName' | 'email' | 'phone' | 'occupation' | 'nationality' | 'address' | 'status' | 'gender' | 'matricule'> & { tenantId: string; tenantName: string; joinedAt?: string; photoUrl?: string };
/**
 * `type`/`description` optionnels : `type` par défaut à REGULAR (D-4C4-WEB-02).
 * Correction post-implémentation Phase 4C-4 (cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md
 * §6) : `createMeeting` est désormais le point d'entrée unique pour créer un
 * Meeting, REGULAR ou GENERAL_ASSEMBLY — `generalAssemblyService.createGeneralAssembly`
 * n'est plus le seul chemin vers GENERAL_ASSEMBLY (il reste utilisable en
 * interne/tests, mais n'a plus de route UI dédiée).
 */
export type MeetingInput = Pick<Meeting, 'title' | 'date' | 'location' | 'participants' | 'agenda'> & Partial<Pick<Meeting, 'type' | 'description'>>;
export type BoardMemberInput = Pick<BoardMember, 'memberId' | 'memberName' | 'position' | 'positionFunctionId' | 'mandateStart' | 'mandateEnd'>;
export type MandateFunctionInput = Pick<MandateFunction, 'name' | 'description'>;

export const organizationService = {
  /**
   * Le registre des tenants est le seul répertoire métier où le `scope`
   * ('tenant' | 'platform', voir mocks/rbac.mocks.ts) s'applique à un
   * `list()` — même principe que `userService.list` pour Access & Security.
   * Un `Tenant` est son propre `tenantId` (`t.id === tenantId`), comme dans
   * `getTenant`/`updateTenant` ci-dessous.
   */
  listTenants: (tenantId: string, scope: PlatformScope) =>
    mockRequest(() => (scope === 'platform' ? tenants : tenants.filter((tenant) => tenant.id === tenantId))),
  /**
   * Un `Tenant` EST le tenant (pas une ressource métier qui lui appartient) :
   * il n'a pas de champ `tenantId`, donc `getTenantScoped` ne s'applique pas
   * ici. Même principe malgré tout — `resource.id === tenantId`, sauf en
   * scope 'platform' (voir services/tenant-scope.ts) — c'est le seul
   * répertoire métier où ce scope est honoré.
   */
  getTenant: (tenantId: string, resourceId: string, scope: PlatformScope = 'tenant') =>
    mockRequest(() => {
      const tenant = tenants.find((item) => item.id === resourceId);
      if (!tenant) return undefined;
      return scope === 'platform' || tenant.id === tenantId ? tenant : undefined;
    }),

  listMembers: (tenantId: string) => mockRequest(() => members.filter((member) => member.tenantId === tenantId)),
  getMember: (tenantId: string, memberId: string) => mockRequest(() => getTenantScoped(members, (member) => member.id === memberId, tenantId)),
  /**
   * Contraintes du dictionnaire canonique `members`, telles que closes par
   * D-MEM-03 (Option B, `docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md` §8) —
   * appliquées ici au niveau service, jamais contournables par une
   * validation UI seule :
   * - `UNIQUE(tenant_id, matricule)` — tenant-scopée (D-MEM-03, Option B ;
   *   remplace l'ancienne portée globale de l'implémentation précédente) ;
   * - `UNIQUE(tenant_id, phone)`, `UNIQUE(tenant_id, email)` ;
   * - `UNIQUE(tenant_id, first_name, last_name, join_date)`.
   * Les trois champs `matricule`/`phone`/`email` sont nullable (dictionnaire) :
   * une valeur vide n'entre jamais en collision avec une autre valeur vide
   * (sémantique SQL NULL usuelle), cohérent avec la convention déjà en place
   * pour `phone`/`email` (chaîne vide = non renseigné, jamais `null`).
   */
  findMemberDuplicate: (tenantId: string, input: { matricule?: string; phone?: string; email?: string; firstName: string; lastName: string; joinedAt: string }, excludeMemberId?: string) =>
    mockRequest(() => {
      const tenantCandidates = members.filter((item) => item.tenantId === tenantId && item.id !== excludeMemberId);
      if (input.matricule && tenantCandidates.some((item) => item.matricule === input.matricule)) return 'matricule' as const;
      if (input.phone && tenantCandidates.some((item) => item.phone === input.phone)) return 'phone' as const;
      if (input.email && tenantCandidates.some((item) => item.email === input.email)) return 'email' as const;
      if (tenantCandidates.some((item) => item.firstName === input.firstName && item.lastName === input.lastName && item.joinedAt === input.joinedAt)) return 'identity' as const;
      return null;
    }),
  createMember: (input: MemberInput) =>
    mockRequest(() => {
      const joinedAt = input.joinedAt || new Date().toISOString().slice(0, 10);
      const tenantMembers = members.filter((item) => item.tenantId === input.tenantId);
      if (input.matricule && tenantMembers.some((item) => item.matricule === input.matricule)) return undefined;
      if (input.phone && tenantMembers.some((item) => item.phone === input.phone)) return undefined;
      if (input.email && tenantMembers.some((item) => item.email === input.email)) return undefined;
      if (tenantMembers.some((item) => item.firstName === input.firstName && item.lastName === input.lastName && item.joinedAt === joinedAt)) return undefined;
      const now = new Date().toISOString();
      const member: Member = {
        id: `M-${String(members.length + 1).padStart(3, '0')}`,
        uuid: crypto.randomUUID(),
        joinedAt,
        birthDate: '', idNumber: '',
        positions: [], accounts: [], documents: [], activities: [], governanceParticipation: [],
        statusHistory: [{ status: input.status, since: joinedAt }],
        syncStatus: 'synced', version: 1,
        createdAt: now, updatedAt: now, deletedAt: null,
        createdBy: currentUser.id, updatedBy: currentUser.id,
        photoUrl: '',
        ...input,
      };
      members.push(member);
      return member;
    }),
  /** D-4C4-WEB-03 : tout changement de `status` est historisé (append-only) pour permettre la reconstruction de l'état à une date donnée — voir `eligibility.service.ts`. */
  updateMember: (tenantId: string, memberId: string, patch: Partial<MemberInput>) =>
    mockRequest(() => {
      const member = getTenantScoped(members, (item) => item.id === memberId, tenantId);
      if (!member) return undefined;
      const tenantMembers = members.filter((item) => item.tenantId === tenantId && item.id !== memberId);
      if (patch.matricule && tenantMembers.some((item) => item.matricule === patch.matricule)) return undefined;
      if (patch.phone && tenantMembers.some((item) => item.phone === patch.phone)) return undefined;
      if (patch.email && tenantMembers.some((item) => item.email === patch.email)) return undefined;
      const nextFirstName = patch.firstName ?? member.firstName;
      const nextLastName = patch.lastName ?? member.lastName;
      const nextJoinedAt = patch.joinedAt ?? member.joinedAt;
      if (tenantMembers.some((item) => item.firstName === nextFirstName && item.lastName === nextLastName && item.joinedAt === nextJoinedAt)) return undefined;
      if (patch.status && patch.status !== member.status) {
        member.statusHistory.push({ status: patch.status, since: new Date().toISOString().slice(0, 10) });
      }
      Object.assign(member, patch);
      member.updatedAt = new Date().toISOString();
      member.updatedBy = currentUser.id;
      member.version += 1;
      return member;
    }),

  /**
   * Entité pilote du mandat « Moteur générique de workflow de validation »
   * (voir docs/GENERIC_VALIDATION_WORKFLOW_ENGINE.md). Remplace un appel
   * direct à `updateMember` depuis le formulaire d'édition membre : si aucun
   * workflow `member`+`update` actif n'est configuré (`WD-007`, `active:
   * false` par défaut — besoin §41), applique directement, comportement
   * strictement inchangé. Sinon, ne mute PAS le membre : calcule le
   * ChangeSet (`computeChangeSet`, seuls les champs réellement modifiés) et
   * crée une `ApprovalRequest` via le moteur générique, avec un snapshot de
   * `member.version` pour la détection de conflit (besoin §11, appliquée par
   * `applyMemberUpdateDecision`).
   *
   * Retourne `null` si le membre n'existe pas (hors tenant compris, même
   * sémantique que partout ailleurs) ou si `createRequest` échoue.
   */
  requestMemberUpdate: async (
    tenantId: string,
    memberId: string,
    patch: Partial<MemberInput>,
    requestedByUserId: string,
    requestedByName: string,
    justification?: string,
  ): Promise<{ applied: true; member: Member } | { applied: false; request: WorkflowRequest } | { blocked: true; existingRequestId: string } | null> => {
    const member = getTenantScoped(members, (item) => item.id === memberId, tenantId);
    if (!member) return null;
    const definition = await workflowService.getWorkflowFor('member', 'update');
    if (!definition) {
      const updated = await organizationService.updateMember(tenantId, memberId, patch);
      return updated ? { applied: true, member: updated } : null;
    }
    const pending = await workflowService.hasPendingApproval(tenantId, 'member', memberId);
    if (pending) return { blocked: true, existingRequestId: pending.id };
    const changeSet = computeChangeSet(member as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    if (changeSet.length === 0) return { applied: true, member };
    const request = await workflowService.createRequest(tenantId, definition.id, {
      entityId: member.id,
      entityLabel: `${member.firstName} ${member.lastName}`,
      requestedBy: requestedByName,
      requestedByUserId,
      justification,
      changeSet,
      entitySnapshotVersion: member.version,
    });
    if (!request) return null;
    auditService.record({
      tenantId, actorId: requestedByUserId, actorName: requestedByName, module: 'organization', action: 'members.updateRequested',
      resourceType: 'member', resourceId: member.id, resourceLabel: `${member.firstName} ${member.lastName}`, sensitive: true,
      context: { requestId: request.id, changedFields: changeSet.map((item) => item.field).join(',') },
    });
    /**
     * Notification des approbateurs de l'étape courante NON implémentée
     * (besoin §24) — même gap déjà documenté et volontairement laissé hors
     * périmètre pour UC02-15 (`docs/PHASE_09_OPERATIONS_WORKFLOWS_DOCUMENTS.md`
     * §11) : aucune résolution générique "utilisateurs détenant une
     * permission donnée, dans ce tenant" n'existe encore côté Access &
     * Security. Le demandeur, lui, EST notifié aux étapes suivantes
     * (rejet/application) ci-dessous, car `requestedByUserId` est toujours
     * connu — pas besoin de ce résolveur.
     */
    return { applied: false, request };
  },

  /**
   * Point d'entrée UNIQUE pour approuver/rejeter une demande de modification
   * de membre — appelé par `WorkflowDetail` (`operations-module.tsx`) À LA
   * PLACE de `workflowService.submitAction` pour ce domaine précis, jamais
   * l'inverse (le moteur reste agnostique), même pattern que
   * `settingsService.decideFiscalYearReopen`. Bloque l'auto-approbation via
   * `workflowService.isSelfApprovalBlocked` AVANT toute mutation :
   * role-admin détient à la fois `members.update` et `members.approve`, le
   * RBAC seul ne peut donc pas séparer demandeur et approbateur ici non plus.
   */
  decideMemberUpdate: async (tenantId: string, requestId: string, action: 'approve' | 'reject', actorId: string, actorName: string, comment?: string): Promise<WorkflowRequest | null> => {
    const request = await workflowService.getRequest(tenantId, requestId);
    if (!request || request.domain !== 'organization' || request.entityType !== 'member') return null;
    if (workflowService.isSelfApprovalBlocked(request, actorId)) return null;
    const wasActionable = request.status === 'pending' || request.status === 'inProgress';
    const result = await workflowService.submitAction(tenantId, requestId, action, actorName, comment, actorId);
    if (!result) return null;
    if (wasActionable && action === 'reject' && result.status === 'rejected') {
      auditService.record({ tenantId, actorId, actorName, module: 'organization', action: 'members.updateRejected', resourceType: 'member', resourceId: result.entityId, resourceLabel: result.entityLabel, sensitive: true, context: { requestId: result.id, comment: comment ?? '' } });
      if (result.requestedByUserId) {
        notificationService.notify({ tenantId, userId: result.requestedByUserId, type: 'workflow', title: 'Modification rejetée', message: `Votre demande de modification pour ${result.entityLabel} a été rejetée.${comment ? ` Motif : ${comment}` : ''}`, source: 'organization', link: `/operations/workflows/${result.id}` });
      }
    }
    await organizationService.applyMemberUpdateDecision(tenantId, result);
    return result;
  },

  /**
   * Seul effet de bord propre au domaine Membre après une décision prise via
   * le moteur générique — même point d'intégration que
   * `applyFiscalYearReopenDecision`/`applyBeneficiaryPermutationDecision`/
   * `applyLoanApplicationDecision`, appelé génériquement depuis
   * `WorkflowDetail`, no-op pour tout autre domaine/entityType.
   *
   * Vérifie le verrou optimiste (besoin §11) juste avant d'appliquer : si
   * `member.version` a changé depuis le snapshot pris à la création de la
   * demande, pose `versionConflict` et N'APPLIQUE RIEN — jamais d'écrasement
   * silencieux d'une modification concurrente. Réutilise `updateMember` pour
   * l'application elle-même (mêmes contraintes d'unicité, historisation du
   * statut, incrément de version) plutôt que de dupliquer cette logique ici.
   */
  applyMemberUpdateDecision: async (tenantId: string, request: WorkflowRequest): Promise<void> => {
    if (request.domain !== 'organization' || request.entityType !== 'member') return;
    if (request.status !== 'approved' || request.versionConflict) return;
    const member = getTenantScoped(members, (item) => item.id === request.entityId, tenantId);
    if (!member || !request.changeSet || request.changeSet.length === 0) return;
    if (request.entitySnapshotVersion !== undefined && member.version !== request.entitySnapshotVersion) {
      request.versionConflict = true;
      auditService.record({
        tenantId, actorId: '', actorName: 'system', module: 'organization', action: 'members.updateConflict',
        resourceType: 'member', resourceId: member.id, resourceLabel: `${member.firstName} ${member.lastName}`, sensitive: true,
        context: { requestId: request.id, snapshotVersion: request.entitySnapshotVersion, currentVersion: member.version },
      });
      return;
    }
    const patch: Partial<MemberInput> = {};
    const before: Record<string, string | number> = {};
    const after: Record<string, string | number> = {};
    for (const item of request.changeSet) {
      (patch as Record<string, unknown>)[item.field] = item.after;
      before[item.field] = item.before === null || item.before === undefined ? '' : String(item.before);
      after[item.field] = item.after === null || item.after === undefined ? '' : String(item.after);
    }
    const updated = await organizationService.updateMember(tenantId, member.id, patch);
    // Contrainte d'unicité violée entre la demande et son application (fenêtre rare mais possible) —
    // la demande reste 'approved' mais rien n'est appliqué, visible pour un suivi manuel plutôt qu'un échec silencieux.
    if (!updated) return;
    auditService.record({
      tenantId, actorId: '', actorName: 'system', module: 'organization', action: 'members.updateApplied',
      resourceType: 'member', resourceId: member.id, resourceLabel: `${updated.firstName} ${updated.lastName}`, sensitive: true,
      before, after, context: { requestId: request.id },
    });
    if (request.requestedByUserId) {
      notificationService.notify({ tenantId, userId: request.requestedByUserId, type: 'workflow', title: 'Modification appliquée', message: `Votre demande de modification pour ${updated.firstName} ${updated.lastName} a été approuvée et appliquée.`, source: 'organization', link: `/organization/members/${member.id}` });
    }
  },

  listMeetings: (tenantId: string) => mockRequest(() => meetings.filter((meeting) => meeting.tenantId === tenantId)),
  listBoardMembers: (tenantId: string) => mockRequest(() => boardMembers.filter((boardMember) => boardMember.tenantId === tenantId)),

  /** Ajouté pour porter Meeting.status (D-4C3-WEB-01) et servir de base à la page Attendance (D-4C3-WEB-02) — aucune page détail Meeting n'existait avant cette mission. */
  getMeeting: (tenantId: string, meetingId: string) => mockRequest(() => getTenantScoped(meetings, (item) => item.id === meetingId, tenantId)),

  /**
   * `status` n'est jamais accepté en entrée : une nouvelle réunion démarre
   * toujours à PLANNED (D-4C3-TECH-01). `type` par défaut REGULAR si omis
   * (D-4C4-WEB-02). Pour GENERAL_ASSEMBLY, la même contrainte d'unicité que
   * `generalAssemblyService.createGeneralAssembly` (titre+date uniques parmi
   * les Meeting(type=GENERAL_ASSEMBLY) du tenant) s'applique — refuse
   * (undefined) toute écriture qui la violerait, jamais un doublon silencieux.
   */
  createMeeting: (tenantId: string, input: MeetingInput) =>
    mockRequest(() => {
      const type: MeetingType = input.type ?? 'REGULAR';
      if (type === 'GENERAL_ASSEMBLY') {
        const duplicate = meetings.some((meeting) => meeting.tenantId === tenantId && meeting.type === 'GENERAL_ASSEMBLY' && meeting.title === input.title && meeting.date === input.date);
        if (duplicate) return undefined;
      }
      const meeting: Meeting = { id: `MT-${String(meetings.length + 1).padStart(3, '0')}`, tenantId, minutes: null, status: 'PLANNED', description: null, ...input, type };
      meetings.push(meeting);
      return meeting;
    }),
  updateMeetingMinutes: (tenantId: string, meetingId: string, minutes: string) =>
    mockRequest(() => {
      const meeting = getTenantScoped(meetings, (item) => item.id === meetingId, tenantId);
      if (!meeting) return undefined;
      meeting.minutes = minutes;
      return meeting;
    }),
  /**
   * Cycle de vie Meeting validé D-4C3-TECH-01 : PLANNED -> ONGOING -> COMPLETED,
   * PLANNED -> CANCELLED, ONGOING -> CANCELLED. COMPLETED/CANCELLED sont
   * terminaux (aucune transition sortante) — toute autre transition est
   * refusée (retourne undefined), jamais silencieusement acceptée.
   */
  startMeeting: (tenantId: string, meetingId: string) =>
    mockRequest(() => {
      const meeting = getTenantScoped(meetings, (item) => item.id === meetingId, tenantId);
      if (!meeting || meeting.status !== 'PLANNED') return undefined;
      meeting.status = 'ONGOING';
      return meeting;
    }),
  completeMeeting: (tenantId: string, meetingId: string) =>
    mockRequest(() => {
      const meeting = getTenantScoped(meetings, (item) => item.id === meetingId, tenantId);
      if (!meeting || meeting.status !== 'ONGOING') return undefined;
      meeting.status = 'COMPLETED';
      return meeting;
    }),
  cancelMeeting: (tenantId: string, meetingId: string) =>
    mockRequest(() => {
      const meeting = getTenantScoped(meetings, (item) => item.id === meetingId, tenantId);
      if (!meeting || (meeting.status !== 'PLANNED' && meeting.status !== 'ONGOING')) return undefined;
      meeting.status = 'CANCELLED';
      return meeting;
    }),
  createBoardMember: (tenantId: string, input: BoardMemberInput) =>
    mockRequest(() => {
      const boardMember: BoardMember = { id: `BM-${String(boardMembers.length + 1).padStart(3, '0')}`, tenantId, status: 'ongoing', ...input };
      boardMembers.push(boardMember);
      return boardMember;
    }),
  endBoardMandate: (tenantId: string, boardMemberId: string, mandateEnd: string) =>
    mockRequest(() => {
      const boardMember = getTenantScoped(boardMembers, (item) => item.id === boardMemberId, tenantId);
      if (!boardMember) return undefined;
      boardMember.mandateEnd = mandateEnd;
      boardMember.status = 'expired';
      return boardMember;
    }),

  /**
   * Référentiel des fonctions/mandats (mandat « Fonctions / mandats ») —
   * toutes les fonctions du tenant, actives ET inactives (alimente le
   * tableau de gestion ; le dropdown d'ajout de mandat filtre `.active`
   * côté appelant, comme les autres listes de ce service ne sont jamais
   * pré-filtrées par défaut — cf. `listMembers`).
   */
  listMandateFunctions: (tenantId: string) => mockRequest(() => mandateFunctions.filter((item) => item.tenantId === tenantId)),

  /**
   * Unicité `trim().toLowerCase()` au sein du tenant (besoin §10/§11 :
   * "Président" et " président " sont un doublon) — même convention que
   * l'unicité Membre (`findMemberDuplicate`/`createMember`), contrôlée ici
   * au niveau service, jamais laissée à la seule validation UI. Un même nom
   * est explicitement autorisé entre deux tenants différents (§9).
   */
  createMandateFunction: (tenantId: string, input: MandateFunctionInput) =>
    mockRequest(() => {
      const normalized = input.name.trim().toLowerCase();
      if (!normalized) return undefined;
      const tenantFunctions = mandateFunctions.filter((item) => item.tenantId === tenantId);
      if (tenantFunctions.some((item) => item.name.trim().toLowerCase() === normalized)) return undefined;
      const now = new Date().toISOString();
      const mandateFunction: MandateFunction = { id: `MF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tenantId, name: input.name.trim(), description: input.description.trim(), active: true, createdAt: now, updatedAt: now };
      mandateFunctions.push(mandateFunction);
      return mandateFunction;
    }),

  /**
   * Édite nom/description — ne touche JAMAIS `active` (dédié à
   * `setMandateFunctionActive`) ni les `BoardMember` déjà créés : leur champ
   * `position` reste le libellé capturé à leur création, jamais réécrit
   * rétroactivement (besoin §12/§13 — un renommage ici n'altère aucun
   * mandat déjà attribué, seuls les FUTURS mandats verront le nouveau nom).
   */
  updateMandateFunction: (tenantId: string, functionId: string, input: MandateFunctionInput) =>
    mockRequest(() => {
      const mandateFunction = getTenantScoped(mandateFunctions, (item) => item.id === functionId, tenantId);
      if (!mandateFunction) return undefined;
      const normalized = input.name.trim().toLowerCase();
      if (!normalized) return undefined;
      const tenantFunctions = mandateFunctions.filter((item) => item.tenantId === tenantId && item.id !== functionId);
      if (tenantFunctions.some((item) => item.name.trim().toLowerCase() === normalized)) return undefined;
      mandateFunction.name = input.name.trim();
      mandateFunction.description = input.description.trim();
      mandateFunction.updatedAt = new Date().toISOString();
      return mandateFunction;
    }),

  /**
   * Active/désactive uniquement — aucune suppression physique n'est exposée
   * nulle part dans ce service (besoin §8/§11 : ne jamais casser
   * l'historique d'une fonction déjà utilisée par des mandats). Une fonction
   * désactivée disparaît du dropdown d'ajout de mandat (filtré côté
   * appelant) mais reste lisible sur tous les mandats déjà attribués.
   */
  setMandateFunctionActive: (tenantId: string, functionId: string, active: boolean) =>
    mockRequest(() => {
      const mandateFunction = getTenantScoped(mandateFunctions, (item) => item.id === functionId, tenantId);
      if (!mandateFunction) return undefined;
      mandateFunction.active = active;
      mandateFunction.updatedAt = new Date().toISOString();
      return mandateFunction;
    }),
};
