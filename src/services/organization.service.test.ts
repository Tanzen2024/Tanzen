import { describe, it, expect } from 'vitest';
import { organizationService } from './organization.service';
import { userService } from './user.service';
import { currentUser } from '@/mocks/rbac.mocks';

describe('organizationService — Tenants (special case: scope-gated repository)', () => {
  it('ALLOW: tenant scope sees only its own tenant in listTenants', async () => {
    const result = await organizationService.listTenants('T-001', 'tenant');
    expect(result.every((tenant) => tenant.id === 'T-001')).toBe(true);
    expect(result.length).toBe(1);
  });

  it('DENY: tenant scope getTenant cannot fetch a different tenant', async () => {
    const result = await organizationService.getTenant('T-001', 'T-002', 'tenant');
    expect(result).toBeNull();
  });

  it('PLATFORM BYPASS: platform scope sees all tenants in listTenants', async () => {
    const result = await organizationService.listTenants('T-001', 'platform');
    expect(result.length).toBeGreaterThan(1);
    expect(result.some((tenant) => tenant.id === 'T-002')).toBe(true);
  });

  it('PLATFORM BYPASS: platform scope getTenant can fetch any tenant', async () => {
    const result = await organizationService.getTenant('T-001', 'T-002', 'platform');
    expect(result?.id).toBe('T-002');
  });
});

describe('organizationService — Members (business data: never scope-bypassed)', () => {
  it('ALLOW: listMembers returns only members of the requesting tenant', async () => {
    const result = await organizationService.listMembers('T-001');
    expect(result.every((member) => member.tenantId === 'T-001')).toBe(true);
    expect(result.some((member) => member.id === 'M-001')).toBe(true);
  });

  it('ALLOW: getMember returns a member belonging to the requesting tenant', async () => {
    const result = await organizationService.getMember('T-001', 'M-001');
    expect(result?.id).toBe('M-001');
  });

  it('DENY: getMember returns undefined for a member of another tenant', async () => {
    const result = await organizationService.getMember('T-001', 'M-002');
    expect(result).toBeNull();
  });

  it('DENY: updateMember cannot mutate a member of another tenant', async () => {
    const before = await organizationService.getMember('T-002', 'M-002');
    const result = await organizationService.updateMember('T-001', 'M-002', { status: 'suspended' });
    expect(result).toBeNull();
    const after = await organizationService.getMember('T-002', 'M-002');
    expect(after?.status).toBe(before?.status);
  });
});

describe('organizationService — createMember (P1 MEMBERS: alignement du modèle canonique)', () => {
  it('ALLOW: creates a member with a generated uuid, tenant-derived identity, and technical defaults', async () => {
    const member = await organizationService.createMember({ firstName: 'Nouveau', lastName: 'Membre', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-001', tenantName: 'Coopérative Sutura' });
    expect(member).not.toBeNull();
    expect(member?.uuid).toBeTruthy();
    expect(member?.uuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(member?.tenantId).toBe('T-001');
    expect(member?.syncStatus).toBe('synced');
    expect(member?.version).toBe(1);
    expect(member?.createdBy).toBe(currentUser.id);
    expect(member?.updatedBy).toBe(currentUser.id);
    expect(member?.deletedAt).toBeNull();
  });

  it('ALLOW: two members can be created with the same uuid-independent identity as long as no unique constraint collides', async () => {
    const first = await organizationService.createMember({ firstName: 'Distinct1', lastName: 'Testeur', matricule: '', gender: 'female', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-002', tenantName: 'Tontine Horizon' });
    const second = await organizationService.createMember({ firstName: 'Distinct2', lastName: 'Testeur', matricule: '', gender: 'female', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-002', tenantName: 'Tontine Horizon' });
    expect(first?.uuid).not.toBe(second?.uuid);
  });

  it('ALLOW: joinedAt defaults to today when omitted, but accepts an explicit historical date', async () => {
    const member = await organizationService.createMember({ firstName: 'Historique', lastName: 'Adhesion', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', joinedAt: '2019-05-01' });
    expect(member?.joinedAt).toBe('2019-05-01');
  });

  it('ALLOW: matricule uniqueness is scoped to the tenant (D-MEM-03, Option B — UNIQUE(tenant_id, matricule)) — same matricule allowed across different tenants', async () => {
    const t001 = await organizationService.createMember({ firstName: 'Mat1', lastName: 'Un', matricule: 'MAT-UNIQUE-01', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-001', tenantName: 'Coopérative Sutura' });
    expect(t001).not.toBeNull();
    const otherTenantAllowed = await organizationService.createMember({ firstName: 'Mat2', lastName: 'Deux', matricule: 'MAT-UNIQUE-01', gender: 'female', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-002', tenantName: 'Tontine Horizon' });
    expect(otherTenantAllowed).not.toBeNull();
    expect(otherTenantAllowed?.matricule).toBe('MAT-UNIQUE-01');
  });

  it('DENY: matricule uniqueness is enforced within the SAME tenant (D-MEM-03)', async () => {
    const first = await organizationService.createMember({ firstName: 'Mat3', lastName: 'Trois', matricule: 'MAT-UNIQUE-02', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-003', tenantName: 'Mutuelle Teranga' });
    expect(first).not.toBeNull();
    const sameTenantCollision = await organizationService.createMember({ firstName: 'Mat4', lastName: 'Quatre', matricule: 'MAT-UNIQUE-02', gender: 'female', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-003', tenantName: 'Mutuelle Teranga' });
    expect(sameTenantCollision).toBeNull();
  });

  it('DENY: phone uniqueness is scoped to the tenant (UNIQUE(tenant_id, phone)) — same phone allowed across different tenants', async () => {
    const t001 = await organizationService.createMember({ firstName: 'Phone1', lastName: 'T001', matricule: '', gender: 'male', email: '', phone: '+221 70 000 00 01', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-001', tenantName: 'Coopérative Sutura' });
    expect(t001).not.toBeNull();
    const sameTenantCollision = await organizationService.createMember({ firstName: 'Phone2', lastName: 'T001bis', matricule: '', gender: 'male', email: '', phone: '+221 70 000 00 01', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-001', tenantName: 'Coopérative Sutura' });
    expect(sameTenantCollision).toBeNull();
    const otherTenantAllowed = await organizationService.createMember({ firstName: 'Phone3', lastName: 'T002', matricule: '', gender: 'male', email: '', phone: '+221 70 000 00 01', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-002', tenantName: 'Tontine Horizon' });
    expect(otherTenantAllowed).not.toBeNull();
  });

  it('DENY: email uniqueness is scoped to the tenant (UNIQUE(tenant_id, email))', async () => {
    const first = await organizationService.createMember({ firstName: 'Mail1', lastName: 'Un', matricule: '', gender: 'female', email: 'doublon@example.sn', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-003', tenantName: 'Mutuelle Teranga' });
    expect(first).not.toBeNull();
    const collision = await organizationService.createMember({ firstName: 'Mail2', lastName: 'Deux', matricule: '', gender: 'female', email: 'doublon@example.sn', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-003', tenantName: 'Mutuelle Teranga' });
    expect(collision).toBeNull();
  });

  it('DENY: identity uniqueness — same (tenant_id, first_name, last_name, join_date) is refused', async () => {
    const first = await organizationService.createMember({ firstName: 'Identite', lastName: 'Doublon', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-004', tenantName: 'Association Jappo', joinedAt: '2026-01-15' });
    expect(first).not.toBeNull();
    const collision = await organizationService.createMember({ firstName: 'Identite', lastName: 'Doublon', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-004', tenantName: 'Association Jappo', joinedAt: '2026-01-15' });
    expect(collision).toBeNull();
    const differentDateAllowed = await organizationService.createMember({ firstName: 'Identite', lastName: 'Doublon', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-004', tenantName: 'Association Jappo', joinedAt: '2026-02-20' });
    expect(differentDateAllowed).not.toBeNull();
  });

  it('ALLOW: empty matricule/phone/email never collide with each other (SQL NULL semantics, not empty-string equality)', async () => {
    const first = await organizationService.createMember({ firstName: 'Vide1', lastName: 'Un', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-005', tenantName: 'Tontine Avenir', joinedAt: '2026-03-01' });
    const second = await organizationService.createMember({ firstName: 'Vide2', lastName: 'Deux', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-005', tenantName: 'Tontine Avenir', joinedAt: '2026-03-02' });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });

  it('findMemberDuplicate reports the specific reason (matricule/phone/email/identity), matching what createMember enforces — tenant-scoped for matricule (D-MEM-03)', async () => {
    const matricule = await organizationService.findMemberDuplicate('T-001', { matricule: 'MAT-UNIQUE-01', firstName: 'X', lastName: 'Y', joinedAt: '2026-01-01' });
    expect(matricule).toBe('matricule');
    const crossTenantAllowed = await organizationService.findMemberDuplicate('T-999-INEXISTANT', { matricule: 'MAT-UNIQUE-01', firstName: 'X', lastName: 'Y', joinedAt: '2026-01-01' });
    expect(crossTenantAllowed).toBeNull();
    const none = await organizationService.findMemberDuplicate('T-001', { firstName: 'Inexistant', lastName: 'Personne', joinedAt: '2026-01-01' });
    expect(none).toBeNull();
  });
});

describe('organizationService — updateMember technical fields (P1 MEMBERS)', () => {
  it('ALLOW: updateMember increments version and stamps updatedAt/updatedBy', async () => {
    // `getMember` renvoie une référence mutable directe (pattern déjà utilisé partout dans ce
    // fichier mock) — on capture les valeurs primitives AVANT la mutation, pas l'objet lui-même.
    const before = await organizationService.getMember('T-001', 'M-001');
    const versionBefore = before?.version ?? 0;
    const updatedAtBefore = before?.updatedAt;
    const result = await organizationService.updateMember('T-001', 'M-001', { occupation: 'Nouvelle profession' });
    expect(result?.version).toBe(versionBefore + 1);
    expect(result?.updatedBy).toBe(currentUser.id);
    expect(result?.updatedAt).not.toBe(updatedAtBefore);
  });

  it('ALLOW: updateMember accepts the same matricule across two different tenants (D-MEM-03, tenant-scoped)', async () => {
    const a = await organizationService.createMember({ firstName: 'UpdA', lastName: 'Tenant1', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-001', tenantName: 'Coopérative Sutura' });
    const b = await organizationService.createMember({ firstName: 'UpdB', lastName: 'Tenant2', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-002', tenantName: 'Tontine Horizon' });
    await organizationService.updateMember('T-001', a!.id, { matricule: 'MAT-CROSS-UPD' });
    const result = await organizationService.updateMember('T-002', b!.id, { matricule: 'MAT-CROSS-UPD' });
    expect(result).not.toBeNull();
    expect(result?.matricule).toBe('MAT-CROSS-UPD');
  });

  it('DENY: updateMember refuses a matricule collision with another member of the SAME tenant (excluding itself)', async () => {
    const a = await organizationService.createMember({ firstName: 'UpdC', lastName: 'SameTenant1', matricule: 'MAT-SAME-UPD', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-003', tenantName: 'Mutuelle Teranga' });
    const b = await organizationService.createMember({ firstName: 'UpdD', lastName: 'SameTenant2', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-003', tenantName: 'Mutuelle Teranga' });
    expect(a).not.toBeNull(); expect(b).not.toBeNull();
    const result = await organizationService.updateMember('T-003', b!.id, { matricule: 'MAT-SAME-UPD' });
    expect(result).toBeNull();
  });

  it('ALLOW: updateMember does not flag a member against its own unchanged matricule/phone/email/identity', async () => {
    const a = await organizationService.createMember({ firstName: 'UpdE', lastName: 'Self', matricule: 'MAT-SELF-UPD', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-004', tenantName: 'Association Jappo' });
    const result = await organizationService.updateMember('T-004', a!.id, { matricule: 'MAT-SELF-UPD', occupation: 'Toujours la même' });
    expect(result).not.toBeNull();
    expect(result?.matricule).toBe('MAT-SELF-UPD');
  });
});

describe('organizationService — Member.status (D-MEM-04, définitive — vocabulaire limité à ACTIVE/INACTIVE/SUSPENDED/EXITED, PENDING supprimé)', () => {
  it('ALLOW: the 4 canonical values all function correctly', async () => {
    const active = await organizationService.createMember({ firstName: 'StatusActive', lastName: 'Test', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-001', tenantName: 'Coopérative Sutura' });
    expect(active?.status).toBe('active');
    const inactive = await organizationService.updateMember('T-001', active!.id, { status: 'inactive' });
    expect(inactive?.status).toBe('inactive');
    const suspended = await organizationService.updateMember('T-001', active!.id, { status: 'suspended' });
    expect(suspended?.status).toBe('suspended');
    const exited = await organizationService.updateMember('T-001', active!.id, { status: 'exited' });
    expect(exited?.status).toBe('exited');
    expect(exited?.statusHistory.at(-1)?.status).toBe('exited');
    expect(exited?.statusHistory.length).toBe(4); // active (création) + inactive + suspended + exited
  });

  it('MIGRATION (D-MEM-04): M-004, anciennement "pending", est désormais "active" — historique recoloré, aucune trace fonctionnelle de "pending" ne subsiste', async () => {
    const member = await organizationService.getMember('T-004', 'M-004');
    expect(member?.status).toBe('active');
    expect(member?.statusHistory.every((entry) => (entry.status as string) !== 'pending')).toBe(true);
  });

});

/**
 * Aucune valeur `pending` ne peut plus être créée pour `Member` — garanti au niveau du
 * système de types (`MemberStatus`, `src/mocks/organization/members.ts`, n'inclut plus
 * `'pending'` dans son union), pas par un contrôle runtime : toute tentative de
 * `status: 'pending'` sur `Member` échoue à la compilation (`npm run typecheck`), avant même
 * d'atteindre l'exécution des tests.
 */

describe('organizationService — Vote.result REGRESSION (D-MEM-04 scope: Member.status only, never Vote.result)', () => {
  it('ALLOW: a newly created Vote still defaults to result="pending" — unaffected by the Member status migration', async () => {
    const vote = await organizationService.createVote('T-001', { subject: 'Vote régression D-MEM-04', date: '2026-12-15' });
    expect(vote?.result).toBe('pending');
  });
});

describe('USER vs MEMBER — no automatic relation, no cross-creation (mandat P1 MEMBERS/USERS)', () => {
  it('creating a Member never creates a SystemUser', async () => {
    const usersBefore = (await userService.list('T-001', 'platform')).length;
    await organizationService.createMember({ firstName: 'SansUser', lastName: 'Membre', matricule: '', gender: 'male', email: '', phone: '', occupation: '', nationality: '', address: '', status: 'active', tenantId: 'T-001', tenantName: 'Coopérative Sutura' });
    const usersAfter = (await userService.list('T-001', 'platform')).length;
    expect(usersAfter).toBe(usersBefore);
  });

  it('creating a SystemUser never creates a Member', async () => {
    const membersBefore = (await organizationService.listMembers('T-001')).length;
    await userService.create({ name: 'Sans Membre', email: 'sans.membre@sutura.sn', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-viewer'] });
    const membersAfter = (await organizationService.listMembers('T-001')).length;
    expect(membersAfter).toBe(membersBefore);
  });

  it('Member has no userId field and SystemUser has no memberId field — no implicit relation exists', async () => {
    const member = await organizationService.getMember('T-001', 'M-001');
    const user = await userService.get('T-001', currentUser.id);
    expect(member && 'userId' in member).toBe(false);
    expect(user && 'memberId' in user).toBe(false);
  });
});

describe('organizationService — Governance (Meetings/Votes/BoardMembers)', () => {
  it('ALLOW: listMeetings/listVotes/listBoardMembers scoped to the requesting tenant', async () => {
    const [meetings, votes, boardMembers] = await Promise.all([
      organizationService.listMeetings('T-001'),
      organizationService.listVotes('T-001'),
      organizationService.listBoardMembers('T-001'),
    ]);
    expect(meetings.every((item) => item.tenantId === 'T-001')).toBe(true);
    expect(votes.every((item) => item.tenantId === 'T-001')).toBe(true);
    expect(boardMembers.every((item) => item.tenantId === 'T-001')).toBe(true);
  });

  it('DENY: T-002 sees no T-001 governance records in any list', async () => {
    const [meetings, votes, boardMembers] = await Promise.all([
      organizationService.listMeetings('T-002'),
      organizationService.listVotes('T-002'),
      organizationService.listBoardMembers('T-002'),
    ]);
    expect(meetings.some((item) => item.id === 'MT-001')).toBe(false);
    expect(votes.some((item) => item.id === 'V-001')).toBe(false);
    expect(boardMembers.some((item) => item.id === 'BM-001')).toBe(false);
  });

  it('DENY: updateMeetingMinutes cannot mutate a meeting of another tenant', async () => {
    const result = await organizationService.updateMeetingMinutes('T-002', 'MT-001', 'Injected minutes');
    expect(result).toBeNull();
  });

  it('DENY: endBoardMandate cannot mutate a board member of another tenant', async () => {
    const result = await organizationService.endBoardMandate('T-002', 'BM-001', '2026-01-01');
    expect(result).toBeNull();
  });

  it('DENY: updateVoteResult cannot mutate a vote of another tenant', async () => {
    const result = await organizationService.updateVoteResult('T-002', 'V-001', { yes: 999, no: 0, abstain: 0, result: 'adopted' });
    expect(result).toBeNull();
  });

  it('ALLOW: createMeeting always starts at PLANNED regardless of input', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion test', date: '2026-12-01', location: 'Test', participants: 5, agenda: 'Test' }))!;
    expect(meeting?.status).toBe('PLANNED');
  });

  it('ALLOW: createMeeting defaults to type=REGULAR when type is omitted (D-4C4-WEB-02)', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion REGULAR', date: '2026-12-02', location: 'Test', participants: 5, agenda: 'Test' }))!;
    expect(meeting?.type).toBe('REGULAR');
    expect(meeting?.description).toBeNull();
  });

  it('ALLOW: createMeeting accepts type=GENERAL_ASSEMBLY with a description — the unified entry point for both meeting kinds (correction post-implémentation Phase 4C-4)', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'AG créée via le formulaire unifié', date: '2026-12-03', location: 'Siège', participants: 40, agenda: '', type: 'GENERAL_ASSEMBLY', description: 'Bilan de fin d\'année' }))!;
    expect(meeting?.type).toBe('GENERAL_ASSEMBLY');
    expect(meeting?.description).toBe('Bilan de fin d\'année');
  });

  it('DENY: createMeeting refuses a GENERAL_ASSEMBLY with the same title+date as an existing one for the tenant', async () => {
    const first = (await organizationService.createMeeting('T-001', { title: 'AG Doublon', date: '2026-12-04', location: 'Siège', participants: 10, agenda: '', type: 'GENERAL_ASSEMBLY', description: null }))!;
    expect(first).not.toBeNull();
    const second = (await organizationService.createMeeting('T-001', { title: 'AG Doublon', date: '2026-12-04', location: 'Ailleurs', participants: 99, agenda: '', type: 'GENERAL_ASSEMBLY', description: null }))!;
    expect(second).toBeNull();
  });
});

describe('organizationService — Meeting lifecycle (D-4C3-TECH-01)', () => {
  it('ALLOW: PLANNED -> ONGOING -> COMPLETED', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Cycle complet', date: '2026-12-05', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const started = await organizationService.startMeeting('T-001', created.id);
    expect(started?.status).toBe('ONGOING');
    const completed = await organizationService.completeMeeting('T-001', created.id);
    expect(completed?.status).toBe('COMPLETED');
  });

  it('ALLOW: PLANNED -> CANCELLED', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Annulée direct', date: '2026-12-06', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const cancelled = await organizationService.cancelMeeting('T-001', created.id);
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('ALLOW: ONGOING -> CANCELLED', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Annulée en cours', date: '2026-12-07', location: 'Test', participants: 5, agenda: 'Test' }))!;
    await organizationService.startMeeting('T-001', created.id);
    const cancelled = await organizationService.cancelMeeting('T-001', created.id);
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('DENY: COMPLETED is terminal — no outgoing transition is accepted', async () => {
    const result = await organizationService.startMeeting('T-001', 'MT-004'); // MT-004 seeded as COMPLETED
    expect(result).toBeNull();
    const resultCancel = await organizationService.cancelMeeting('T-001', 'MT-004');
    expect(resultCancel).toBeNull();
    const resultComplete = await organizationService.completeMeeting('T-001', 'MT-004');
    expect(resultComplete).toBeNull();
  });

  it('DENY: CANCELLED is terminal — no outgoing transition is accepted', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Terminal cancelled', date: '2026-12-08', location: 'Test', participants: 5, agenda: 'Test' }))!;
    await organizationService.cancelMeeting('T-001', created.id);
    expect((await organizationService.startMeeting('T-001', created.id))).toBeNull();
    expect((await organizationService.completeMeeting('T-001', created.id))).toBeNull();
    expect((await organizationService.cancelMeeting('T-001', created.id))).toBeNull();
  });

  it('DENY: PLANNED -> COMPLETED is not a valid direct transition (must pass through ONGOING)', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Pas de saut', date: '2026-12-09', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const result = await organizationService.completeMeeting('T-001', created.id);
    expect(result).toBeNull();
  });

  it('DENY: startMeeting/completeMeeting/cancelMeeting cannot mutate a meeting of another tenant', async () => {
    expect((await organizationService.startMeeting('T-002', 'MT-001'))).toBeNull();
    expect((await organizationService.completeMeeting('T-002', 'MT-001'))).toBeNull();
    expect((await organizationService.cancelMeeting('T-002', 'MT-001'))).toBeNull();
  });

  it('ALLOW: getMeeting returns a meeting belonging to the requesting tenant', async () => {
    const result = await organizationService.getMeeting('T-001', 'MT-001');
    expect(result?.id).toBe('MT-001');
  });

  it('DENY: getMeeting returns null for a meeting of another tenant', async () => {
    const result = await organizationService.getMeeting('T-002', 'MT-001');
    expect(result).toBeNull();
  });
});
