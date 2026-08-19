/**
 * Modèle cible Tontine (Occurrence → Turn → TurnBeneficiary → Adhesion, +
 * Contribution) issu de la consolidation D-TON-04-01→31 de cette session.
 * Additif au modèle legacy (`tontine-cycles.ts` : CycleMember/CycleContribution/
 * CycleDraw) — celui-ci n'est ni modifié ni remplacé, conformément à la
 * recommandation de tous les audits précédents (ne jamais réutiliser
 * `declareWinner`/`CycleDraw.amountReceived` pour porter cette mécanique).
 *
 * Forme technique de TontineAdhesion : lecture (B) — entité séparée à
 * identité stable, recommandée (pas formellement validée PO) par la
 * consolidation D-TON-04-07 de cette session, cf.
 * docs/P1_TONTINE_D-TON-04_REVISION_FINAL_DECISION_GATE.md §5.
 */

export type ValueType = 'MONEY' | 'GOODS';
export type TontineOccurrenceStatus = 'OPEN' | 'CLOSED';
export type TontineTurnStatus = 'OPEN' | 'CLOSED';
export type BeneficiaryReceptionStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED';
export type ContributionStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';
export type ReceptionOperationType = 'reception' | 'correction' | 'regularization' | 'cancellation';

export type TontineAdhesion = {
  id: string;
  tenantId: string;
  tontineId: string;
  memberId: string;
  memberName: string;
  joinedAt: string;
  status: 'active' | 'exited';
};

export type TontineOccurrence = {
  id: string;
  tenantId: string;
  tontineCycleId: string;
  occurrenceNumber: number;
  plannedDate: string;
  actualDate: string | null;
  status: TontineOccurrenceStatus;
};

export type TontineTurn = {
  id: string;
  tenantId: string;
  tontineOccurrenceId: string;
  turnNumber: number;
  status: TontineTurnStatus;
};

/** Une opération n'écrase jamais la précédente — reconstitution chronologique via `operations[]`, jamais de mutation destructive d'une entrée existante. */
export type ReceptionOperation = {
  id: string;
  type: ReceptionOperationType;
  amount?: number;
  quantity?: number;
  date: string;
  actorId: string;
  actorName: string;
  reason: string | null;
  /** correction : référence l'opération dont elle redéfinit la valeur. */
  correctedOperationId?: string;
  /** annulation : référence l'opération qu'elle invalide (sans la supprimer). */
  cancelledOperationId?: string;
};

export type TontineTurnBeneficiary = {
  id: string;
  tenantId: string;
  tontineTurnId: string;
  adhesionId: string;
  valueType: ValueType;
  expectedAmount?: number;
  expectedQuantity?: number;
  item?: string;
  operations: ReceptionOperation[];
};

/**
 * Paiement de contribution — modèle délibérément plus simple que
 * `ReceptionOperation` (§7/§9 du mandat de cette étape : ne pas copier
 * aveuglément le modèle Réception). Seul « les paiements successifs
 * doivent rester traçables » est explicitement sourcé pour Contribution
 * (règle « Contributions », section H des consolidations D-TON de cette
 * session) — correction/régularisation/annulation n'y sont PAS spécifiées
 * (elles ne le sont que pour la réception du bénéfice, section K/I) et ne
 * sont donc volontairement pas implémentées ici.
 */
export type PaymentOperation = {
  id: string;
  amount?: number;
  quantity?: number;
  date: string;
  actorId: string;
  actorName: string;
};

export type TontineContribution = {
  id: string;
  tenantId: string;
  adhesionId: string;
  tontineOccurrenceId: string;
  valueType: ValueType;
  expectedAmount?: number;
  expectedQuantity?: number;
  item?: string;
  paidAmount: number;
  paidQuantity: number;
  paidAt: string | null;
  status: ContributionStatus;
  payments: PaymentOperation[];
};

/** Contribution nette d'une opération au total reçu — jamais une simple somme brute, pour que correction/annulation restent des opérations distinctes de la réception qu'elles affectent (D-TON-04-14/-21, règles Réceptions/Corrections). */
function operationContribution(op: ReceptionOperation, all: ReceptionOperation[]): number {
  switch (op.type) {
    case 'reception':
    case 'regularization':
      return op.amount ?? op.quantity ?? 0;
    case 'correction': {
      const original = all.find((item) => item.id === op.correctedOperationId);
      const originalValue = original ? operationContribution(original, all) : 0;
      return (op.amount ?? op.quantity ?? 0) - originalValue;
    }
    case 'cancellation': {
      const cancelled = all.find((item) => item.id === op.cancelledOperationId);
      return cancelled ? -operationContribution(cancelled, all) : 0;
    }
  }
}

export function computeReceivedTotal(operations: ReceptionOperation[]): number {
  return operations.reduce((sum, op) => sum + operationContribution(op, operations), 0);
}

export function computeBeneficiaryStatus(beneficiary: TontineTurnBeneficiary): BeneficiaryReceptionStatus {
  const received = computeReceivedTotal(beneficiary.operations);
  const expected = beneficiary.expectedAmount ?? beneficiary.expectedQuantity ?? 0;
  if (received <= 0) return 'PENDING';
  if (received >= expected) return 'RECEIVED';
  return 'PARTIAL';
}

export const tontineAdhesions: TontineAdhesion[] = [
  { id: 'ADH-001', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', joinedAt: '2026-01-01', status: 'active' },
  { id: 'ADH-002', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-002', memberName: 'Mamadou Sow', joinedAt: '2026-01-01', status: 'active' },
  { id: 'ADH-003', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-007', memberName: 'Khadija Mbaye', joinedAt: '2026-01-01', status: 'active' },
  { id: 'ADH-004', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-006', memberName: 'Cheikh Diop', joinedAt: '2026-01-01', status: 'active' },
  { id: 'ADH-005', tenantId: 'T-005', tontineId: 'TON-002', memberId: 'M-005', memberName: 'Awa Cissé', joinedAt: '2026-07-01', status: 'active' },
];

export const tontineOccurrences: TontineOccurrence[] = [
  { id: 'OCC-001', tenantId: 'T-002', tontineCycleId: 'CYC-002', occurrenceNumber: 1, plannedDate: '2026-06-20', actualDate: '2026-06-20', status: 'CLOSED' },
  { id: 'OCC-002', tenantId: 'T-002', tontineCycleId: 'CYC-002', occurrenceNumber: 2, plannedDate: '2026-07-20', actualDate: null, status: 'OPEN' },
  { id: 'OCC-003', tenantId: 'T-005', tontineCycleId: 'CYC-003', occurrenceNumber: 1, plannedDate: '2026-08-15', actualDate: null, status: 'OPEN' },
];

export const tontineTurns: TontineTurn[] = [
  { id: 'TURN-001', tenantId: 'T-002', tontineOccurrenceId: 'OCC-001', turnNumber: 1, status: 'CLOSED' },
  { id: 'TURN-002', tenantId: 'T-002', tontineOccurrenceId: 'OCC-002', turnNumber: 2, status: 'OPEN' },
  { id: 'TURN-003', tenantId: 'T-005', tontineOccurrenceId: 'OCC-003', turnNumber: 1, status: 'OPEN' },
];

export const tontineTurnBeneficiaries: TontineTurnBeneficiary[] = [
  {
    id: 'TB-001', tenantId: 'T-002', tontineTurnId: 'TURN-001', adhesionId: 'ADH-001', valueType: 'MONEY', expectedAmount: 1_400_000,
    operations: [
      { id: 'OP-001', type: 'reception', amount: 1_400_000, date: '2026-06-21', actorId: 'U-001', actorName: 'Amadou Mbaye', reason: null },
    ],
  },
  {
    id: 'TB-002', tenantId: 'T-002', tontineTurnId: 'TURN-002', adhesionId: 'ADH-002', valueType: 'MONEY', expectedAmount: 1_400_000,
    operations: [
      { id: 'OP-002', type: 'reception', amount: 800_000, date: '2026-07-22', actorId: 'U-001', actorName: 'Amadou Mbaye', reason: null },
      { id: 'OP-003', type: 'correction', amount: 750_000, correctedOperationId: 'OP-002', date: '2026-07-23', actorId: 'U-001', actorName: 'Amadou Mbaye', reason: 'Erreur de saisie initiale : virement réel de 750 000, pas 800 000.' },
      { id: 'OP-004', type: 'regularization', amount: 200_000, date: '2026-07-28', actorId: 'U-002', actorName: 'Fatou Ndiaye', reason: 'Complément versé en espèces suite à la relance.' },
    ],
  },
  {
    id: 'TB-003', tenantId: 'T-002', tontineTurnId: 'TURN-002', adhesionId: 'ADH-003', valueType: 'MONEY', expectedAmount: 1_400_000,
    operations: [],
  },
  {
    id: 'TB-004', tenantId: 'T-005', tontineTurnId: 'TURN-003', adhesionId: 'ADH-005', valueType: 'GOODS', item: 'Bidon d’huile 5L', expectedQuantity: 2,
    operations: [
      { id: 'OP-005', type: 'reception', quantity: 1, date: '2026-08-16', actorId: 'U-009', actorName: 'Awa Cissé', reason: null },
    ],
  },
];

export const tontineContributions: TontineContribution[] = [
  {
    id: 'CTB-001', tenantId: 'T-002', adhesionId: 'ADH-001', tontineOccurrenceId: 'OCC-001', valueType: 'MONEY', expectedAmount: 350_000, paidAmount: 350_000, paidQuantity: 0, paidAt: '2026-06-15', status: 'PAID',
    payments: [{ id: 'PAY-001', amount: 350_000, date: '2026-06-15', actorId: 'U-001', actorName: 'Amadou Mbaye' }],
  },
  {
    id: 'CTB-002', tenantId: 'T-002', adhesionId: 'ADH-002', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 350_000, paidAmount: 200_000, paidQuantity: 0, paidAt: '2026-07-15', status: 'PARTIAL',
    payments: [
      { id: 'PAY-002', amount: 150_000, date: '2026-07-05', actorId: 'U-001', actorName: 'Amadou Mbaye' },
      { id: 'PAY-003', amount: 50_000, date: '2026-07-15', actorId: 'U-001', actorName: 'Amadou Mbaye' },
    ],
  },
  { id: 'CTB-003', tenantId: 'T-002', adhesionId: 'ADH-003', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 350_000, paidAmount: 0, paidQuantity: 0, paidAt: null, status: 'WAIVED', payments: [] },
  {
    id: 'CTB-004', tenantId: 'T-005', adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'GOODS', expectedQuantity: 2, item: 'Bidon d’huile 5L', paidAmount: 0, paidQuantity: 2, paidAt: '2026-08-10', status: 'PAID',
    payments: [{ id: 'PAY-004', quantity: 2, date: '2026-08-10', actorId: 'U-009', actorName: 'Awa Cissé' }],
  },
];
