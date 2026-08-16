export type TontineCycleStatus = 'statusDraft' | 'statusOpen' | 'statusSuspended' | 'statusClosed';

export type CycleMember = {
  id: string;
  tontineCycleId: string;
  /** Référence additive vers Member.id (mocks/organization/members.ts), pour croiser un membre avec ses tontines sans dupliquer ses données. N'affecte pas la relation protégée tontineCycleId → TontineCycle. */
  memberId: string;
  memberName: string;
  position: number;
  expectedAmount: number;
  collectedAmount: number;
  payoutAmount: number;
  status: 'statusActive' | 'statusInactive';
  hasWon: boolean;
};

export type CycleContribution = {
  id: string;
  tontineCycleId: string;
  memberName: string;
  amount: number;
  date: string;
  status: 'statusCompleted' | 'statusPending';
};

export type DrawPhase = 'phaseConfiguration' | 'phaseVerification' | 'phaseExecution' | 'phaseResult' | 'phaseWinner' | 'phaseSettlement' | 'phaseHistory';
export type DrawSettlementStatus = 'settlementPending' | 'settlementProcessing' | 'settlementCompleted' | 'settlementFailed';

export type CycleDraw = {
  id: string;
  tontineCycleId: string;
  drawNumber: number;
  date: string;
  winnerName: string;
  winnerMemberId: string | null;
  contributionPool: number;
  amountReceived: number;
  bidAmount: number;
  status: 'statusCompleted' | 'statusScheduled';
  phase: DrawPhase;
  settlementStatus: DrawSettlementStatus;
  settlementDate: string | null;
};

export type CycleActivity = {
  id: string;
  type: string;
  description: string;
  date: string;
};

export type TontineCycle = {
  id: string;
  tenantId: string;
  tontineId: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  status: TontineCycleStatus;
  expectedTotal: number;
  totalCollected: number;
  totalPaidOut: number;
  members: CycleMember[];
  contributions: CycleContribution[];
  draws: CycleDraw[];
  activities: CycleActivity[];
};

export const tontineCycles: TontineCycle[] = [
  {
    id: 'CYC-001', tenantId: 'T-002', tontineId: 'TON-001', cycleNumber: 1, startDate: '2026-01-01', endDate: '2026-12-31', status: 'statusClosed', expectedTotal: 4_200_000, totalCollected: 4_200_000, totalPaidOut: 4_200_000,
    members: [
      { id: 'CM-001', tontineCycleId: 'CYC-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', position: 1, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 350_000, status: 'statusActive', hasWon: true },
      { id: 'CM-002', tontineCycleId: 'CYC-001', memberId: 'M-002', memberName: 'Mamadou Sow', position: 2, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 350_000, status: 'statusActive', hasWon: true },
      { id: 'CM-003', tontineCycleId: 'CYC-001', memberId: 'M-007', memberName: 'Khadija Mbaye', position: 3, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 350_000, status: 'statusActive', hasWon: true },
      { id: 'CM-004', tontineCycleId: 'CYC-001', memberId: 'M-006', memberName: 'Cheikh Diop', position: 4, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 350_000, status: 'statusActive', hasWon: true },
    ],
    contributions: [
      { id: 'CC-001', tontineCycleId: 'CYC-001', memberName: 'Fatou Ndiaye', amount: 350_000, date: '2026-01-15', status: 'statusCompleted' },
      { id: 'CC-002', tontineCycleId: 'CYC-001', memberName: 'Mamadou Sow', amount: 350_000, date: '2026-02-15', status: 'statusCompleted' },
      { id: 'CC-003', tontineCycleId: 'CYC-001', memberName: 'Khadija Mbaye', amount: 350_000, date: '2026-03-15', status: 'statusCompleted' },
      { id: 'CC-004', tontineCycleId: 'CYC-001', memberName: 'Cheikh Diop', amount: 350_000, date: '2026-04-15', status: 'statusCompleted' },
    ],
    draws: [
      { id: 'CD-001', tontineCycleId: 'CYC-001', drawNumber: 1, date: '2026-01-20', winnerName: 'Fatou Ndiaye', winnerMemberId: 'CM-001', contributionPool: 1_400_000, amountReceived: 1_400_000, bidAmount: 0, status: 'statusCompleted', phase: 'phaseHistory', settlementStatus: 'settlementCompleted', settlementDate: '2026-01-21' },
      { id: 'CD-002', tontineCycleId: 'CYC-001', drawNumber: 2, date: '2026-02-20', winnerName: 'Mamadou Sow', winnerMemberId: 'CM-002', contributionPool: 1_400_000, amountReceived: 1_400_000, bidAmount: 0, status: 'statusCompleted', phase: 'phaseHistory', settlementStatus: 'settlementCompleted', settlementDate: '2026-02-21' },
      { id: 'CD-003', tontineCycleId: 'CYC-001', drawNumber: 3, date: '2026-03-20', winnerName: 'Khadija Mbaye', winnerMemberId: 'CM-003', contributionPool: 1_400_000, amountReceived: 1_400_000, bidAmount: 0, status: 'statusCompleted', phase: 'phaseHistory', settlementStatus: 'settlementCompleted', settlementDate: '2026-03-21' },
      { id: 'CD-004', tontineCycleId: 'CYC-001', drawNumber: 4, date: '2026-04-20', winnerName: 'Cheikh Diop', winnerMemberId: 'CM-004', contributionPool: 1_400_000, amountReceived: 1_400_000, bidAmount: 0, status: 'statusCompleted', phase: 'phaseHistory', settlementStatus: 'settlementCompleted', settlementDate: '2026-04-21' },
    ],
    activities: [
      { id: 'CA-001', type: 'Create', description: 'Cycle créé', date: '2026-01-01' },
      { id: 'CA-002', type: 'Open', description: 'Cycle ouvert', date: '2026-01-05' },
      { id: 'CA-003', type: 'Draw', description: 'Tirage n°1 - Fatou Ndiaye', date: '2026-01-20' },
      { id: 'CA-004', type: 'Draw', description: 'Tirage n°2 - Mamadou Sow', date: '2026-02-20' },
      { id: 'CA-005', type: 'Close', description: 'Cycle clôturé', date: '2026-05-01' },
    ],
  },
  {
    id: 'CYC-002', tenantId: 'T-002', tontineId: 'TON-001', cycleNumber: 2, startDate: '2026-06-01', endDate: '2027-05-31', status: 'statusOpen', expectedTotal: 4_200_000, totalCollected: 1_400_000, totalPaidOut: 350_000,
    members: [
      { id: 'CM-005', tontineCycleId: 'CYC-002', memberId: 'M-001', memberName: 'Fatou Ndiaye', position: 1, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 350_000, status: 'statusActive', hasWon: true },
      { id: 'CM-006', tontineCycleId: 'CYC-002', memberId: 'M-002', memberName: 'Mamadou Sow', position: 2, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
      { id: 'CM-007', tontineCycleId: 'CYC-002', memberId: 'M-007', memberName: 'Khadija Mbaye', position: 3, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
      { id: 'CM-008', tontineCycleId: 'CYC-002', memberId: 'M-006', memberName: 'Cheikh Diop', position: 4, expectedAmount: 350_000, collectedAmount: 350_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
    ],
    contributions: [
      { id: 'CC-005', tontineCycleId: 'CYC-002', memberName: 'Fatou Ndiaye', amount: 350_000, date: '2026-06-15', status: 'statusCompleted' },
      { id: 'CC-006', tontineCycleId: 'CYC-002', memberName: 'Mamadou Sow', amount: 350_000, date: '2026-07-15', status: 'statusCompleted' },
      { id: 'CC-007', tontineCycleId: 'CYC-002', memberName: 'Khadija Mbaye', amount: 350_000, date: '2026-08-15', status: 'statusCompleted' },
      { id: 'CC-008', tontineCycleId: 'CYC-002', memberName: 'Cheikh Diop', amount: 350_000, date: '2026-09-15', status: 'statusPending' },
    ],
    draws: [
      { id: 'CD-005', tontineCycleId: 'CYC-002', drawNumber: 1, date: '2026-06-20', winnerName: 'Fatou Ndiaye', winnerMemberId: 'CM-005', contributionPool: 1_400_000, amountReceived: 1_400_000, bidAmount: 0, status: 'statusCompleted', phase: 'phaseHistory', settlementStatus: 'settlementCompleted', settlementDate: '2026-06-21' },
      { id: 'CD-006', tontineCycleId: 'CYC-002', drawNumber: 2, date: '2026-07-20', winnerName: '—', winnerMemberId: null, contributionPool: 1_400_000, amountReceived: 0, bidAmount: 0, status: 'statusScheduled', phase: 'phaseConfiguration', settlementStatus: 'settlementPending', settlementDate: null },
    ],
    activities: [
      { id: 'CA-006', type: 'Create', description: 'Cycle créé', date: '2026-06-01' },
      { id: 'CA-007', type: 'Open', description: 'Cycle ouvert', date: '2026-06-05' },
      { id: 'CA-008', type: 'Draw', description: 'Tirage n°1 - Fatou Ndiaye', date: '2026-06-20' },
    ],
  },
  {
    id: 'CYC-003', tenantId: 'T-005', tontineId: 'TON-002', cycleNumber: 1, startDate: '2026-07-01', endDate: '2027-02-28', status: 'statusOpen', expectedTotal: 1_440_000, totalCollected: 480_000, totalPaidOut: 180_000,
    members: [
      { id: 'CM-009', tontineCycleId: 'CYC-003', memberId: 'M-005', memberName: 'Awa Cissé', position: 1, expectedAmount: 180_000, collectedAmount: 180_000, payoutAmount: 180_000, status: 'statusActive', hasWon: true },
      { id: 'CM-010', tontineCycleId: 'CYC-003', memberId: 'M-008', memberName: 'Ibrahima Sarr', position: 2, expectedAmount: 180_000, collectedAmount: 180_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
      { id: 'CM-011', tontineCycleId: 'CYC-003', memberId: 'M-003', memberName: 'Aïssatou Bâ', position: 3, expectedAmount: 180_000, collectedAmount: 120_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
      { id: 'CM-012', tontineCycleId: 'CYC-003', memberId: 'M-004', memberName: 'Ousmane Fall', position: 4, expectedAmount: 180_000, collectedAmount: 0, payoutAmount: 0, status: 'statusInactive', hasWon: false },
    ],
    contributions: [
      { id: 'CC-009', tontineCycleId: 'CYC-003', memberName: 'Awa Cissé', amount: 180_000, date: '2026-07-10', status: 'statusCompleted' },
      { id: 'CC-010', tontineCycleId: 'CYC-003', memberName: 'Ibrahima Sarr', amount: 180_000, date: '2026-08-10', status: 'statusCompleted' },
      { id: 'CC-011', tontineCycleId: 'CYC-003', memberName: 'Aïssatou Bâ', amount: 120_000, date: '2026-08-12', status: 'statusCompleted' },
    ],
    draws: [
      { id: 'CD-007', tontineCycleId: 'CYC-003', drawNumber: 1, date: '2026-07-15', winnerName: 'Awa Cissé', winnerMemberId: 'CM-009', contributionPool: 720_000, amountReceived: 720_000, bidAmount: 0, status: 'statusCompleted', phase: 'phaseHistory', settlementStatus: 'settlementCompleted', settlementDate: '2026-07-16' },
    ],
    activities: [
      { id: 'CA-009', type: 'Create', description: 'Cycle créé', date: '2026-07-01' },
      { id: 'CA-010', type: 'Open', description: 'Cycle ouvert', date: '2026-07-03' },
      { id: 'CA-011', type: 'Draw', description: 'Tirage n°1 - Awa Cissé', date: '2026-07-15' },
    ],
  },
  {
    id: 'CYC-004', tenantId: 'T-003', tontineId: 'TON-003', cycleNumber: 1, startDate: '2026-05-01', endDate: '2027-04-30', status: 'statusSuspended', expectedTotal: 3_600_000, totalCollected: 900_000, totalPaidOut: 240_000,
    members: [
      { id: 'CM-013', tontineCycleId: 'CYC-004', memberId: 'M-003', memberName: 'Aïssatou Bâ', position: 1, expectedAmount: 240_000, collectedAmount: 240_000, payoutAmount: 240_000, status: 'statusActive', hasWon: true },
      { id: 'CM-014', tontineCycleId: 'CYC-004', memberId: 'M-004', memberName: 'Ousmane Fall', position: 2, expectedAmount: 240_000, collectedAmount: 240_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
      { id: 'CM-015', tontineCycleId: 'CYC-004', memberId: 'M-005', memberName: 'Awa Cissé', position: 3, expectedAmount: 240_000, collectedAmount: 240_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
      { id: 'CM-016', tontineCycleId: 'CYC-004', memberId: 'M-001', memberName: 'Fatou Ndiaye', position: 4, expectedAmount: 240_000, collectedAmount: 180_000, payoutAmount: 0, status: 'statusActive', hasWon: false },
    ],
    contributions: [
      { id: 'CC-012', tontineCycleId: 'CYC-004', memberName: 'Aïssatou Bâ', amount: 240_000, date: '2026-05-10', status: 'statusCompleted' },
      { id: 'CC-013', tontineCycleId: 'CYC-004', memberName: 'Ousmane Fall', amount: 240_000, date: '2026-06-10', status: 'statusCompleted' },
      { id: 'CC-014', tontineCycleId: 'CYC-004', memberName: 'Awa Cissé', amount: 240_000, date: '2026-07-10', status: 'statusCompleted' },
    ],
    draws: [
      { id: 'CD-008', tontineCycleId: 'CYC-004', drawNumber: 1, date: '2026-05-15', winnerName: 'Aïssatou Bâ', winnerMemberId: 'CM-013', contributionPool: 960_000, amountReceived: 960_000, bidAmount: 0, status: 'statusCompleted', phase: 'phaseHistory', settlementStatus: 'settlementCompleted', settlementDate: '2026-05-16' },
    ],
    activities: [
      { id: 'CA-012', type: 'Create', description: 'Cycle créé', date: '2026-05-01' },
      { id: 'CA-013', type: 'Open', description: 'Cycle ouvert', date: '2026-05-03' },
      { id: 'CA-014', type: 'Draw', description: 'Tirage n°1 - Aïssatou Bâ', date: '2026-05-15' },
      { id: 'CA-015', type: 'Suspend', description: 'Cycle suspendu', date: '2026-08-01' },
    ],
  },
  {
    id: 'CYC-005', tenantId: 'T-001', tontineId: 'TON-004', cycleNumber: 3, startDate: '2026-09-01', endDate: '2027-08-31', status: 'statusDraft', expectedTotal: 8_640_000, totalCollected: 0, totalPaidOut: 0,
    members: [],
    contributions: [],
    draws: [],
    activities: [
      { id: 'CA-016', type: 'Create', description: 'Cycle créé', date: '2026-08-10' },
    ],
  },
];
