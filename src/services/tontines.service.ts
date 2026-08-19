import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tontines, type Tontine } from '@/mocks/tontines/tontines';
import { tontineCycles, type TontineCycleStatus, type TontineCycle, type CycleMember, type CycleDraw } from '@/mocks/tontines/tontine-cycles';

export type TontineInput = Pick<Tontine, 'name' | 'valueType' | 'tenantId'>;
export type CycleInput = { tontineId: string; cycleNumber: number; startDate: string; endDate: string; expectedTotal: number };
export type CycleMemberInput = { memberId: string; memberName: string; position: number; expectedAmount: number };
export type DrawInput = { cycleId: string; drawNumber: number; date: string; contributionPool: number };
export type WinnerInput = { drawId: string; winnerMemberId: string; amountReceived: number };

/** Seules les transitions sourcées (UCX2-14 Ouvrir, UC40-04/UCX2-04 Clôturer) sont autorisées, plus SUSPENDED→OPEN (reprise, nécessaire pour que le statut validé SUSPENDED ne soit pas un cul-de-sac). CLOSED n'a aucune transition sortante : aucune source ne documente de réouverture d'un cycle clôturé (cf. docs/PHASE_08_DECISIONS_A_VALIDER.md). */
const VALID_CYCLE_TRANSITIONS: Record<TontineCycleStatus, TontineCycleStatus[]> = {
  statusDraft: ['statusOpen'],
  statusOpen: ['statusSuspended', 'statusClosed'],
  statusSuspended: ['statusOpen'],
  statusClosed: [],
};

export const tontinesService = {
  listTontines: (tenantId: string) => mockRequest(() => tontines.filter((tontine) => tontine.tenantId === tenantId)),
  getTontine: (tenantId: string, tontineId: string) => mockRequest(() => getTenantScoped(tontines, (tontine) => tontine.id === tontineId, tenantId)),
  createTontine: (input: TontineInput) =>
    mockRequest(() => {
      const tontine: Tontine = { id: `TON-${String(tontines.length + 1).padStart(3, '0')}`, status: 'statusActive', memberCount: 0, activeCycles: 0, totalContributions: 0, createdAt: new Date().toISOString().slice(0, 10), ...input };
      tontines.push(tontine);
      return tontine;
    }),

  /** Tenant-scoped en deux temps (voir tenant-scope.ts) : la tontine parente doit d'abord appartenir au tenant courant, sinon aucune donnée de cycle n'est retournée — ne jamais faire confiance au seul `tontineId` de l'URL. */
  listCyclesByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return [];
      return tontineCycles.filter((cycle) => cycle.tontineId === tontine.id);
    }),
  getCycle: (tenantId: string, cycleId: string) => mockRequest(() => getTenantScoped(tontineCycles, (cycle) => cycle.id === cycleId, tenantId)),
  listCyclesByMember: (tenantId: string, memberId: string) => mockRequest(() => tontineCycles.filter((cycle) => cycle.tenantId === tenantId && cycle.members.some((member) => member.memberId === memberId))),

  /** cycle_number unique par tontine (UNIQUE(tenant_id, tontine_id, cycle_number)) — valide la tontine parente tenant-scope avant toute écriture. */
  createCycle: (tenantId: string, input: CycleInput) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === input.tontineId, tenantId);
      if (!tontine) return undefined;
      const duplicate = tontineCycles.some((c) => c.tontineId === input.tontineId && c.cycleNumber === input.cycleNumber);
      if (duplicate) return undefined;
      const cycle: TontineCycle = { id: `CYC-${String(tontineCycles.length + 1).padStart(3, '0')}`, tenantId, status: 'statusDraft', totalCollected: 0, totalPaidOut: 0, members: [], contributions: [], draws: [], activities: [{ id: `CA-${Date.now()}`, type: 'Create', description: 'Cycle créé', date: new Date().toISOString().slice(0, 10) }], ...input };
      tontineCycles.push(cycle);
      return cycle;
    }),

  /** Persiste la transition dans la source mock canonique (même pattern que workflowService.submitAction), après validation de la garde de transition ci-dessus — un statut cible non autorisé depuis le statut courant est rejeté (retourne undefined), jamais appliqué silencieusement. */
  updateCycleStatus: (tenantId: string, cycleId: string, nextStatus: TontineCycleStatus) =>
    mockRequest(() => {
      const cycle = getTenantScoped(tontineCycles, (item) => item.id === cycleId, tenantId);
      if (!cycle) return undefined;
      if (!VALID_CYCLE_TRANSITIONS[cycle.status].includes(nextStatus)) return undefined;
      cycle.status = nextStatus;
      return cycle;
    }),

  /** Valide le TontineCycle parent tenant-scope avant toute écriture — même exigence que Phase 7 (jamais d'écriture sur un cycleId non vérifié). */
  addCycleMember: (tenantId: string, cycleId: string, input: CycleMemberInput) =>
    mockRequest(() => {
      const cycle = getTenantScoped(tontineCycles, (item) => item.id === cycleId, tenantId);
      if (!cycle) return undefined;
      const member: CycleMember = { id: `CM-${Date.now()}`, tontineCycleId: cycle.id, collectedAmount: 0, payoutAmount: 0, status: 'statusActive', hasWon: false, ...input };
      cycle.members.push(member);
      return member;
    }),

  createDraw: (tenantId: string, input: DrawInput) =>
    mockRequest(() => {
      const cycle = getTenantScoped(tontineCycles, (item) => item.id === input.cycleId, tenantId);
      if (!cycle) return undefined;
      const draw: CycleDraw = { id: `CD-${Date.now()}`, tontineCycleId: cycle.id, drawNumber: input.drawNumber, date: input.date, contributionPool: input.contributionPool, winnerName: '', winnerMemberId: null, amountReceived: 0, bidAmount: 0, status: 'statusScheduled', phase: 'phaseConfiguration', settlementStatus: 'settlementPending', settlementDate: null };
      cycle.draws.push(draw);
      return draw;
    }),

  /** UCX2-16 « Valider le bénéficiaire » : sélection manuelle du gagnant parmi les membres éligibles, jamais un algorithme — cohérent avec « le tirage est manuel ». Valide le Cycle parent tenant-scope, puis le Draw et le CycleMember à l'intérieur de ce même cycle (jamais par id global non vérifié). */
  declareWinner: (tenantId: string, cycleId: string, input: WinnerInput) =>
    mockRequest(() => {
      const cycle = getTenantScoped(tontineCycles, (item) => item.id === cycleId, tenantId);
      if (!cycle) return undefined;
      const draw = cycle.draws.find((item) => item.id === input.drawId);
      const member = cycle.members.find((item) => item.id === input.winnerMemberId);
      if (!draw || !member || draw.winnerMemberId) return undefined;
      draw.winnerMemberId = member.id;
      draw.winnerName = member.memberName;
      draw.amountReceived = input.amountReceived;
      draw.status = 'statusCompleted';
      draw.phase = 'phaseHistory';
      draw.settlementStatus = 'settlementCompleted';
      draw.settlementDate = new Date().toISOString().slice(0, 10);
      member.hasWon = true;
      return draw;
    }),
};
