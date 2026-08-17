import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tenants } from '@/mocks/organization/tenants';
import { members, type Member } from '@/mocks/organization/members';
import { meetings, votes, boardMembers, type Meeting, type MeetingType, type Vote, type BoardMember } from '@/mocks/organization/governance';
import type { PlatformScope } from '@/mocks/rbac.mocks';

/**
 * Séparation Commercial/Tenant (2026-08-16) : `createTenant`/`updateTenant`
 * (écriture du registre des tenants) n'existent plus ici — exclusifs à
 * tanzen-commercial (Platform Administration). `listTenants`/`getTenant`
 * (lecture seule) restent dupliquées à l'identique côté tenant : le
 * sélecteur "Tenant" du formulaire Membre en dépend encore, même s'il ne
 * contient jamais qu'un seul élément en pratique (scope toujours
 * `'tenant'` ici). Voir docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md §21.
 */
export type MemberInput = Pick<Member, 'firstName' | 'lastName' | 'email' | 'phone' | 'occupation' | 'nationality' | 'address' | 'status'> & { tenantId: string; tenantName: string };
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
export type BoardMemberInput = Pick<BoardMember, 'memberId' | 'memberName' | 'position' | 'mandateStart' | 'mandateEnd'>;
export type VoteInput = Pick<Vote, 'subject' | 'date'>;

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
  createMember: (input: MemberInput) =>
    mockRequest(() => {
      const joinedAt = new Date().toISOString().slice(0, 10);
      const member: Member = { id: `M-${String(members.length + 1).padStart(3, '0')}`, joinedAt, birthDate: '', idNumber: '', gender: 'female', positions: [], accounts: [], documents: [], activities: [], governanceParticipation: [], statusHistory: [{ status: input.status, since: joinedAt }], ...input };
      members.push(member);
      return member;
    }),
  /** D-4C4-WEB-03 : tout changement de `status` est historisé (append-only) pour permettre la reconstruction de l'état à une date donnée — voir `eligibility.service.ts`. */
  updateMember: (tenantId: string, memberId: string, patch: Partial<MemberInput>) =>
    mockRequest(() => {
      const member = getTenantScoped(members, (item) => item.id === memberId, tenantId);
      if (!member) return undefined;
      if (patch.status && patch.status !== member.status) {
        member.statusHistory.push({ status: patch.status, since: new Date().toISOString().slice(0, 10) });
      }
      Object.assign(member, patch);
      return member;
    }),

  listMeetings: (tenantId: string) => mockRequest(() => meetings.filter((meeting) => meeting.tenantId === tenantId)),
  listVotes: (tenantId: string) => mockRequest(() => votes.filter((vote) => vote.tenantId === tenantId)),
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
  /** Vote générique autonome (onglet Governance > Votes), jamais concerné par D-4C4-WEB-07/08 — `meetingId`/`assemblyDecisionId` toujours `null` ici. Le flux Meeting→AssemblyDecision→Vote passe par `decision-vote.service.ts`. */
  createVote: (tenantId: string, input: VoteInput) =>
    mockRequest(() => {
      const vote: Vote = { id: `V-${String(votes.length + 1).padStart(3, '0')}`, tenantId, yes: 0, no: 0, abstain: 0, result: 'pending', meetingId: null, assemblyDecisionId: null, ...input };
      votes.push(vote);
      return vote;
    }),
  updateVoteResult: (tenantId: string, voteId: string, patch: Pick<Vote, 'yes' | 'no' | 'abstain' | 'result'>) =>
    mockRequest(() => {
      const vote = getTenantScoped(votes, (item) => item.id === voteId, tenantId);
      if (!vote) return undefined;
      Object.assign(vote, patch);
      return vote;
    }),
};
