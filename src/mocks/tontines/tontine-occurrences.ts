/**
 * Modèle cible Tontine — Tontine → Fréquence → Période → Occurrence →
 * Opérations/Contributions/Bénéficiaire (mandat « suppression complète de la
 * logique Cycle/Tour »). Un bénéficiaire est rattaché DIRECTEMENT à
 * l'Occurrence (`OccurrenceBeneficiary.tontineOccurrenceId`) — l'ancien
 * niveau intermédiaire `TontineTurn` a été retiré : il était en relation 1:1
 * stricte avec `TontineOccurrence` (jamais d'autre cardinalité observée dans
 * ce modèle) et ne portait donc aucune information que `TontineOccurrence`
 * ne porte pas déjà (son `status` fusionné dans `closeOccurrence`). Le
 * modèle legacy `Cycle` (`tontine-cycles.ts` : CycleMember/CycleContribution/
 * CycleDraw) a été supprimé du module Tontine (mandat « suppression complète
 * de la logique Cycle/Tour »).
 *
 * Forme technique de TontineAdhesion : lecture (B) — entité séparée à
 * identité stable, recommandée (pas formellement validée PO) par la
 * consolidation D-TON-04-07 de cette session, cf.
 * docs/P1_TONTINE_D-TON-04_REVISION_FINAL_DECISION_GATE.md §5.
 */

import type { UnitCode } from '@/constants/units';

export type ValueType = 'MONEY' | 'GOODS';
export type TontineOccurrenceStatus = 'OPEN' | 'CLOSED';
export type BeneficiaryReceptionStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED';
export type ContributionStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';
export type ReceptionOperationType = 'reception' | 'correction' | 'regularization' | 'cancellation';

export type TontineAdhesion = {
  id: string;
  tenantId: string;
  /** Parent direct — mandat « adhésions gérées au niveau de la Période » : une Adhésion appartient à UNE Période, jamais à la Tontine directement (le `tontineId` se retrouve via `period.tontineId` quand nécessaire). */
  periodId: string;
  memberId: string;
  memberName: string;
  /** Sert de date de début pour la règle d'éligibilité (§10 mandat refonte) — jamais renommée `startDate` pour ne pas casser l'existant, mais joue exactement ce rôle. */
  joinedAt: string;
  /** Renseignée uniquement quand `status` passe à `exited` (clôture logique, jamais de suppression) — sert de date de fin pour l'éligibilité. */
  endDate: string | null;
  status: 'active' | 'exited';
};

/** Un adhérent ne peut participer à une occurrence que si son adhésion est active à la date de celle-ci (§10, règle obligatoire) — `date` doit être `occurrence.actualDate ?? occurrence.plannedDate` (aucune notion de « date d'occurrence » unique canonique n'existe au-delà de ces deux champs). */
export function isAdhesionActiveAt(adhesion: TontineAdhesion, date: string): boolean {
  return adhesion.joinedAt <= date && (adhesion.endDate === null || adhesion.endDate >= date);
}

export type TontineOccurrence = {
  id: string;
  tenantId: string;
  /** Parent temporel — remplace l'ancien `tontineCycleId` (mandat refonte Tontine→Période→Occurrence). `TontineCycle` a été supprimé (mandat « suppression complète de la logique Cycle/Tour »). */
  periodId: string;
  occurrenceNumber: number;
  plannedDate: string;
  actualDate: string | null;
  status: TontineOccurrenceStatus;
};

/** Une opération n'écrase jamais la précédente — reconstitution chronologique via `operations[]`, jamais de mutation destructive d'une entrée existante. */
export type ReceptionOperation = {
  id: string;
  type: ReceptionOperationType;
  amount?: number;
  quantity?: number;
  /**
   * Montant d'achat lié à une réception (mandat « Gestion des opérations »)
   * — pertinent uniquement quand `Tontine.purchaseMode === 'WITH_PURCHASE'`.
   * Porté par l'opération plutôt que par un nouveau champ sur
   * `TontineTurnBeneficiary` : c'est la même ligne d'historique que la
   * réception qu'il accompagne, jamais une transaction séparée — aucune
   * nouvelle entité/relation créée pour ce mandat.
   */
  purchaseAmount?: number;
  date: string;
  actorId: string;
  actorName: string;
  reason: string | null;
  /** correction : référence l'opération dont elle redéfinit la valeur. */
  correctedOperationId?: string;
  /** annulation : référence l'opération qu'elle invalide (sans la supprimer). */
  cancelledOperationId?: string;
};

/** Rattaché directement à l'Occurrence (mandat « suppression complète de la logique Cycle/Tour » §7) — jamais un Turn intermédiaire. */
export type OccurrenceBeneficiary = {
  id: string;
  tenantId: string;
  tontineOccurrenceId: string;
  adhesionId: string;
  valueType: ValueType;
  expectedAmount?: number;
  expectedQuantity?: number;
  item?: string;
  operations: ReceptionOperation[];
};

/**
 * Contexte technique d'une demande de permutation entre deux bénéficiaires
 * d'Occurrences (mandat planification/permutation) — le moteur de workflow
 * générique (`workflowService`/`WorkflowRequest`) porte un seul
 * `entityId`/string ; une permutation référence DEUX `OccurrenceBeneficiary`
 * (mandat §9-13). Ce petit enregistrement de liaison est donc la seule
 * addition de modèle réellement nécessaire — il ne duplique ni Member, ni
 * TontineAdhesion, ni OccurrenceBeneficiary lui-même : il se contente de
 * faire le pont entre une `WorkflowRequest.entityId` et les deux
 * bénéficiaires concernés, exactement comme `FiscalYear.id` sert déjà
 * d'`entityId` pour WD-005 (sauf qu'ici un seul entityId ne suffit pas à
 * référencer les deux côtés d'un échange). Jamais modifié après création
 * (immuable, comme une demande) — seul `OccurrenceBeneficiary.adhesionId`
 * change, au moment de l'application (`applyBeneficiaryPermutationDecision`).
 */
export type OccurrenceBeneficiaryPermutation = {
  id: string;
  tenantId: string;
  workflowRequestId: string;
  beneficiaryAId: string;
  beneficiaryBId: string;
  /**
   * Renseignée UNE SEULE fois, au moment où l'échange est réellement appliqué —
   * garde d'idempotence. `workflowService.submitAction` tolère un second appel
   * `approve` sur une demande déjà `approved` (no-op, retourne la requête inchangée,
   * cf. son propre commentaire) ; sans cette marque, un second appel à
   * `applyBeneficiaryPermutationDecision` réappliquerait l'échange une seconde
   * fois et annulerait silencieusement la permutation (bug réel trouvé par
   * TEST15, corrigé ici plutôt que d'exiger que chaque appelant se souvienne
   * de ne jamais rappeler la fonction).
   */
  appliedAt: string | null;
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
  /** Devise préremplie depuis `Tontine.currency` à la création (mandat devise/unité) — jamais imposée après coup, l'utilisateur reste libre de la modifier faute de règle métier l'interdisant. */
  currency?: string;
  expectedQuantity?: number;
  item?: string;
  /** Unité préremplie depuis `Tontine.unit` à la création — même statut que `currency` ci-dessus. */
  unit?: UnitCode;
  paidAmount: number;
  paidQuantity: number;
  paidAt: string | null;
  status: ContributionStatus;
  payments: PaymentOperation[];
};

/** Contribution nette d'une opération au total reçu — jamais une simple somme brute, pour que correction/annulation restent des opérations distinctes de la réception qu'elles affectent (D-TON-04-14/-21, règles Réceptions/Corrections). Exportée (mandat « DataTable ledger ») pour que le tableau de séance puisse dériver Débit/Crédit par opération sans dupliquer cette logique de signe. */
export function operationContribution(op: ReceptionOperation, all: ReceptionOperation[]): number {
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

/**
 * Total des montants d'achat enregistrés pour un bénéficiaire (mandat
 * « Gestion des opérations », mode d'achat) — délibérément plus simple que
 * `computeReceivedTotal` : aucune règle de correction/annulation n'est
 * sourcée pour ce montant (seule la réception le porte), donc une simple
 * somme suffit, sans inventer une logique de reprise symétrique à celle du
 * bénéfice principal.
 */
export function computePurchaseTotal(operations: ReceptionOperation[]): number {
  return operations.reduce((sum, op) => sum + (op.purchaseAmount ?? 0), 0);
}

export function computeBeneficiaryStatus(beneficiary: OccurrenceBeneficiary): BeneficiaryReceptionStatus {
  const received = computeReceivedTotal(beneficiary.operations);
  const expected = beneficiary.expectedAmount ?? beneficiary.expectedQuantity ?? 0;
  if (received <= 0) return 'PENDING';
  if (received >= expected) return 'RECEIVED';
  return 'PARTIAL';
}

/**
 * Rattachement à PER-001 (TON-001/T-002) ou PER-002 (TON-002/T-005) — dérivé
 * sans ambiguïté des Contributions/Bénéficiaires déjà seedés qui référencent
 * ces adhésions (CTB-001/TB-001 → ADH-001 → OCC-001 → PER-001, etc., mandat
 * « adhésions au niveau de la période » §29 : ne pas réutiliser artificiellement
 * une adhésion entre deux périodes — chaque ADH-xxx garde ici l'unique période
 * à laquelle son historique la rattache déjà).
 */
export const tontineAdhesions: TontineAdhesion[] = [
  { id: 'ADH-001', tenantId: 'T-002', periodId: 'PER-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', joinedAt: '2026-01-01', endDate: null, status: 'active' },
  { id: 'ADH-002', tenantId: 'T-002', periodId: 'PER-001', memberId: 'M-002', memberName: 'Mamadou Sow', joinedAt: '2026-01-01', endDate: null, status: 'active' },
  { id: 'ADH-003', tenantId: 'T-002', periodId: 'PER-001', memberId: 'M-007', memberName: 'Khadija Mbaye', joinedAt: '2026-01-01', endDate: null, status: 'active' },
  { id: 'ADH-004', tenantId: 'T-002', periodId: 'PER-001', memberId: 'M-006', memberName: 'Cheikh Diop', joinedAt: '2026-01-01', endDate: null, status: 'active' },
  { id: 'ADH-005', tenantId: 'T-005', periodId: 'PER-002', memberId: 'M-005', memberName: 'Awa Cissé', joinedAt: '2026-07-01', endDate: null, status: 'active' },
  /** Illustre le cas « ancien adhérent » requis par le mandat refonte (§7-9, adhésion historisée, jamais supprimée) — un membre déjà présent dans les mocks (M-008, Ibrahima Sarr), rejoint PER-001 avant le cycle courant puis sorti. */
  { id: 'ADH-006', tenantId: 'T-002', periodId: 'PER-001', memberId: 'M-008', memberName: 'Ibrahima Sarr', joinedAt: '2025-06-01', endDate: '2026-05-01', status: 'exited' },
];

export const tontineOccurrences: TontineOccurrence[] = [
  { id: 'OCC-001', tenantId: 'T-002', periodId: 'PER-001', occurrenceNumber: 1, plannedDate: '2026-06-20', actualDate: '2026-06-20', status: 'CLOSED' },
  { id: 'OCC-002', tenantId: 'T-002', periodId: 'PER-001', occurrenceNumber: 2, plannedDate: '2026-07-20', actualDate: null, status: 'OPEN' },
  { id: 'OCC-003', tenantId: 'T-005', periodId: 'PER-002', occurrenceNumber: 1, plannedDate: '2026-08-15', actualDate: null, status: 'OPEN' },
];

export const occurrenceBeneficiaries: OccurrenceBeneficiary[] = [
  {
    id: 'TB-001', tenantId: 'T-002', tontineOccurrenceId: 'OCC-001', adhesionId: 'ADH-001', valueType: 'MONEY', expectedAmount: 1_400_000,
    operations: [
      { id: 'OP-001', type: 'reception', amount: 1_400_000, date: '2026-06-21', actorId: 'U-001', actorName: 'Amadou Mbaye', reason: null },
    ],
  },
  {
    id: 'TB-002', tenantId: 'T-002', tontineOccurrenceId: 'OCC-002', adhesionId: 'ADH-002', valueType: 'MONEY', expectedAmount: 1_400_000,
    operations: [
      { id: 'OP-002', type: 'reception', amount: 800_000, date: '2026-07-22', actorId: 'U-001', actorName: 'Amadou Mbaye', reason: null },
      { id: 'OP-003', type: 'correction', amount: 750_000, correctedOperationId: 'OP-002', date: '2026-07-23', actorId: 'U-001', actorName: 'Amadou Mbaye', reason: 'Erreur de saisie initiale : virement réel de 750 000, pas 800 000.' },
      { id: 'OP-004', type: 'regularization', amount: 200_000, date: '2026-07-28', actorId: 'U-002', actorName: 'Fatou Ndiaye', reason: 'Complément versé en espèces suite à la relance.' },
    ],
  },
  {
    id: 'TB-003', tenantId: 'T-002', tontineOccurrenceId: 'OCC-002', adhesionId: 'ADH-003', valueType: 'MONEY', expectedAmount: 1_400_000,
    operations: [],
  },
  {
    id: 'TB-004', tenantId: 'T-005', tontineOccurrenceId: 'OCC-003', adhesionId: 'ADH-005', valueType: 'GOODS', item: 'Bidon d’huile 5L', expectedQuantity: 2,
    operations: [
      { id: 'OP-005', type: 'reception', quantity: 1, date: '2026-08-16', actorId: 'U-009', actorName: 'Awa Cissé', reason: null },
    ],
  },
];

/** Aucune demande de permutation en seed (fonctionnalité nouvelle, non rétro-historisée) — peuplé uniquement à l'exécution par `tontineTurnsService.requestBeneficiaryPermutation`. */
export const occurrenceBeneficiaryPermutations: OccurrenceBeneficiaryPermutation[] = [];

export const tontineContributions: TontineContribution[] = [
  {
    id: 'CTB-001', tenantId: 'T-002', adhesionId: 'ADH-001', tontineOccurrenceId: 'OCC-001', valueType: 'MONEY', expectedAmount: 350_000, currency: 'XOF', paidAmount: 350_000, paidQuantity: 0, paidAt: '2026-06-15', status: 'PAID',
    payments: [{ id: 'PAY-001', amount: 350_000, date: '2026-06-15', actorId: 'U-001', actorName: 'Amadou Mbaye' }],
  },
  {
    id: 'CTB-002', tenantId: 'T-002', adhesionId: 'ADH-002', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 350_000, currency: 'XOF', paidAmount: 200_000, paidQuantity: 0, paidAt: '2026-07-15', status: 'PARTIAL',
    payments: [
      { id: 'PAY-002', amount: 150_000, date: '2026-07-05', actorId: 'U-001', actorName: 'Amadou Mbaye' },
      { id: 'PAY-003', amount: 50_000, date: '2026-07-15', actorId: 'U-001', actorName: 'Amadou Mbaye' },
    ],
  },
  { id: 'CTB-003', tenantId: 'T-002', adhesionId: 'ADH-003', tontineOccurrenceId: 'OCC-002', valueType: 'MONEY', expectedAmount: 350_000, currency: 'XOF', paidAmount: 0, paidQuantity: 0, paidAt: null, status: 'WAIVED', payments: [] },
  {
    id: 'CTB-004', tenantId: 'T-005', adhesionId: 'ADH-005', tontineOccurrenceId: 'OCC-003', valueType: 'GOODS', expectedQuantity: 2, item: 'Bidon d’huile 5L', unit: 'BIDON', paidAmount: 0, paidQuantity: 2, paidAt: '2026-08-10', status: 'PAID',
    payments: [{ id: 'PAY-004', quantity: 2, date: '2026-08-10', actorId: 'U-009', actorName: 'Awa Cissé' }],
  },
];
