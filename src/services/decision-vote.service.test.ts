import { describe, it, expect } from 'vitest';
import { decisionVoteService } from './decision-vote.service';
import { assemblyDecisionService } from './assembly-decision.service';
import { generalAssemblyService } from './general-assembly.service';
import { organizationService } from './organization.service';

async function createGA(tenantId: string, title: string, date = '2026-12-25') {
  const ga = await generalAssemblyService.createGeneralAssembly(tenantId, { title, assemblyDate: date, description: null });
  return ga!;
}
async function createDecision(tenantId: string, meetingId: string, title: string) {
  const decision = await assemblyDecisionService.createAssemblyDecision(tenantId, meetingId, { title, description: '', createdBy: 'U-001' });
  return decision!;
}

describe('decisionVoteService — createVoteForDecision (D-4C4-WEB-07/08)', () => {
  it('ALLOW: creates a Vote with meetingId derived from the Decision, plus its VoteOption records', async () => {
    const ga = await createGA('T-001', 'AG Vote A');
    const decision = await createDecision('T-001', ga.id, 'Decision Vote A');
    const vote = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Adopter le rapport', optionLabels: ['Pour', 'Contre', 'Abstention'] });
    expect(vote).not.toBeNull();
    expect(vote?.meetingId).toBe(ga.id); // dérivé de la Decision, jamais fourni par l'appelant
    expect(vote?.assemblyDecisionId).toBe(decision.id);
    const options = await decisionVoteService.listVoteOptions('T-001', vote!.id);
    expect(options.map((option) => option.label)).toEqual(['Pour', 'Contre', 'Abstention']);
  });

  it('ALLOW: option labels are not restricted to POUR/CONTRE/ABSTENTION (mandat §17)', async () => {
    const ga = await createGA('T-001', 'AG Vote Options Libres');
    const decision = await createDecision('T-001', ga.id, 'Decision Options Libres');
    const vote = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Choisir le prestataire', optionLabels: ['Prestataire A', 'Prestataire B', 'Prestataire C'] });
    const options = await decisionVoteService.listVoteOptions('T-001', vote!.id);
    expect(options.map((option) => option.label)).toEqual(['Prestataire A', 'Prestataire B', 'Prestataire C']);
  });

  it('DENY: refuses without any option', async () => {
    const ga = await createGA('T-001', 'AG Vote B');
    const decision = await createDecision('T-001', ga.id, 'Decision Vote B');
    const result = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Sujet', optionLabels: [] });
    expect(result).toBeNull();
  });

  it('DENY: refuses an empty subject', async () => {
    const ga = await createGA('T-001', 'AG Vote C');
    const decision = await createDecision('T-001', ga.id, 'Decision Vote C');
    const result = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: '   ', optionLabels: ['A', 'B'] });
    expect(result).toBeNull();
  });

  it('DENY (règle d\'intégrité §16 du mandat) : impossible de créer un Vote sur une Decision d\'un autre tenant — Vote(Meeting A) + Decision(Meeting B) structurellement exclu', async () => {
    const ga = await createGA('T-001', 'AG Vote Integrity A');
    const decision = await createDecision('T-001', ga.id, 'Decision Integrity A');
    const result = await decisionVoteService.createVoteForDecision('T-002', decision.id, { subject: 'Cross tenant', optionLabels: ['A', 'B'] });
    expect(result).toBeNull();
  });
});

describe('decisionVoteService — castMemberVote (D-4C4-WEB-10)', () => {
  it('ALLOW: a member casts a vote for a valid option', async () => {
    const ga = await createGA('T-001', 'AG Cast A');
    const decision = await createDecision('T-001', ga.id, 'Decision Cast A');
    const vote = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Sujet', optionLabels: ['Pour', 'Contre'] });
    const options = await decisionVoteService.listVoteOptions('T-001', vote!.id);
    const record = await decisionVoteService.castMemberVote('T-001', vote!.id, 'M-001', options[0].id);
    expect(record).not.toBeNull();
    expect(record?.memberId).toBe('M-001');
    expect(record?.voteOptionId).toBe(options[0].id);
  });

  it('DENY: UNIQUE(vote_id, member_id) — a member cannot vote twice on the same Vote (rejet explicite, pas d\'upsert)', async () => {
    const ga = await createGA('T-001', 'AG Cast B');
    const decision = await createDecision('T-001', ga.id, 'Decision Cast B');
    const vote = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Sujet', optionLabels: ['Pour', 'Contre'] });
    const options = await decisionVoteService.listVoteOptions('T-001', vote!.id);
    const first = await decisionVoteService.castMemberVote('T-001', vote!.id, 'M-001', options[0].id);
    expect(first).not.toBeNull();
    const second = await decisionVoteService.castMemberVote('T-001', vote!.id, 'M-001', options[1].id);
    expect(second).toBeNull();
    const all = await decisionVoteService.listMemberVotes('T-001', vote!.id);
    expect(all.filter((item) => item.memberId === 'M-001').length).toBe(1);
    expect(all.find((item) => item.memberId === 'M-001')?.voteOptionId).toBe(options[0].id); // le premier vote n'a pas été écrasé
  });

  it('DENY: refuses a memberId belonging to another tenant', async () => {
    const ga = await createGA('T-001', 'AG Cast C');
    const decision = await createDecision('T-001', ga.id, 'Decision Cast C');
    const vote = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Sujet', optionLabels: ['Pour', 'Contre'] });
    const options = await decisionVoteService.listVoteOptions('T-001', vote!.id);
    const result = await decisionVoteService.castMemberVote('T-001', vote!.id, 'M-002', options[0].id); // M-002 est T-002
    expect(result).toBeNull();
  });

  it('DENY: refuses a voteOptionId that does not belong to the vote', async () => {
    const ga = await createGA('T-001', 'AG Cast D');
    const decisionA = await createDecision('T-001', ga.id, 'Decision Cast D-1');
    const decisionB = await createDecision('T-001', ga.id, 'Decision Cast D-2');
    const voteA = await decisionVoteService.createVoteForDecision('T-001', decisionA.id, { subject: 'Sujet A', optionLabels: ['Oui'] });
    const voteB = await decisionVoteService.createVoteForDecision('T-001', decisionB.id, { subject: 'Sujet B', optionLabels: ['Non'] });
    const optionsB = await decisionVoteService.listVoteOptions('T-001', voteB!.id);
    const result = await decisionVoteService.castMemberVote('T-001', voteA!.id, 'M-001', optionsB[0].id);
    expect(result).toBeNull();
  });

  it('DENY: cannot cast on a Vote belonging to another tenant', async () => {
    const ga = await createGA('T-001', 'AG Cast E');
    const decision = await createDecision('T-001', ga.id, 'Decision Cast E');
    const vote = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Sujet', optionLabels: ['Pour', 'Contre'] });
    const options = await decisionVoteService.listVoteOptions('T-001', vote!.id);
    const result = await decisionVoteService.castMemberVote('T-002', vote!.id, 'M-002', options[0].id);
    expect(result).toBeNull();
  });

  it('ALLOW: no attendance-presence rule is enforced on voting, since none is documented (mandat §20)', async () => {
    const ga = await createGA('T-001', 'AG Cast Sans Presence');
    const decision = await createDecision('T-001', ga.id, 'Decision Cast Sans Presence');
    const vote = await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Sujet', optionLabels: ['Oui', 'Non'] });
    const options = await decisionVoteService.listVoteOptions('T-001', vote!.id);
    // M-006 has no Attendance record for this meeting at all — vote must still succeed.
    const result = await decisionVoteService.castMemberVote('T-001', vote!.id, 'M-006', options[0].id);
    expect(result).not.toBeNull();
  });
});

describe('decisionVoteService — LIST — tenant isolation', () => {
  it('DENY: listVotesByDecision returns empty for a decision of another tenant', async () => {
    const ga = await createGA('T-001', 'AG List Votes A');
    const decision = await createDecision('T-001', ga.id, 'Decision List Votes A');
    await decisionVoteService.createVoteForDecision('T-001', decision.id, { subject: 'Sujet', optionLabels: ['A', 'B'] });
    const result = await decisionVoteService.listVotesByDecision('T-002', decision.id);
    expect(result).toEqual([]);
  });

  it('ALLOW: createMeeting/createGeneralAssembly cross-check — a Vote created under T-001 never leaks into T-002 listings', async () => {
    const gaT1 = await createGA('T-001', 'AG Isolation T1');
    const decisionT1 = await createDecision('T-001', gaT1.id, 'Decision Isolation T1');
    const voteT1 = await decisionVoteService.createVoteForDecision('T-001', decisionT1.id, { subject: 'Sujet T1', optionLabels: ['A', 'B'] });
    const gaT2 = await createGA('T-002', 'AG Isolation T2');
    const decisionT2 = await createDecision('T-002', gaT2.id, 'Decision Isolation T2');
    const votesT2 = await decisionVoteService.listVotesByDecision('T-002', decisionT2.id);
    expect(votesT2.find((vote) => vote.id === voteT1!.id)).toBeUndefined();
  });
});

describe('Meeting.type — no impact on standalone Governance > Votes feature (organizationService.createVote)', () => {
  it('ALLOW: the pre-existing standalone Vote feature is untouched by D-4C4-WEB-07/08 — meetingId stays null', async () => {
    const vote = await organizationService.createVote('T-001', { subject: 'Vote autonome', date: '2026-12-01' });
    expect(vote.meetingId).toBeNull();
    expect(vote.assemblyDecisionId).toBeNull();
  });
});
