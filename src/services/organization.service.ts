import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tenants } from '@/mocks/organization/tenants';
import { members, type Member } from '@/mocks/organization/members';
import { assemblies, meetings, votes, boardMembers, type Assembly, type Meeting, type Vote, type BoardMember } from '@/mocks/organization/governance';
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
export type AssemblyInput = Pick<Assembly, 'name' | 'type' | 'date' | 'location' | 'participants' | 'agenda'>;
export type MeetingInput = Pick<Meeting, 'title' | 'date' | 'location' | 'participants' | 'agenda'>;
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
      const member: Member = { id: `M-${String(members.length + 1).padStart(3, '0')}`, joinedAt: new Date().toISOString().slice(0, 10), birthDate: '', idNumber: '', gender: 'female', positions: [], accounts: [], documents: [], activities: [], governanceParticipation: [], ...input };
      members.push(member);
      return member;
    }),
  updateMember: (tenantId: string, memberId: string, patch: Partial<MemberInput>) =>
    mockRequest(() => {
      const member = getTenantScoped(members, (item) => item.id === memberId, tenantId);
      if (!member) return undefined;
      Object.assign(member, patch);
      return member;
    }),

  listAssemblies: (tenantId: string) => mockRequest(() => assemblies.filter((assembly) => assembly.tenantId === tenantId)),
  listMeetings: (tenantId: string) => mockRequest(() => meetings.filter((meeting) => meeting.tenantId === tenantId)),
  listVotes: (tenantId: string) => mockRequest(() => votes.filter((vote) => vote.tenantId === tenantId)),
  listBoardMembers: (tenantId: string) => mockRequest(() => boardMembers.filter((boardMember) => boardMember.tenantId === tenantId)),

  createAssembly: (tenantId: string, input: AssemblyInput) =>
    mockRequest(() => {
      const assembly: Assembly = { id: `A-${String(assemblies.length + 1).padStart(3, '0')}`, tenantId, status: 'upcoming', ...input };
      assemblies.push(assembly);
      return assembly;
    }),
  createMeeting: (tenantId: string, input: MeetingInput) =>
    mockRequest(() => {
      const meeting: Meeting = { id: `MT-${String(meetings.length + 1).padStart(3, '0')}`, tenantId, minutes: null, ...input };
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
  createVote: (tenantId: string, input: VoteInput) =>
    mockRequest(() => {
      const vote: Vote = { id: `V-${String(votes.length + 1).padStart(3, '0')}`, tenantId, yes: 0, no: 0, abstain: 0, result: 'pending', ...input };
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
