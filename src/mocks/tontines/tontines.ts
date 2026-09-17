/**
 * Modèle Tontines — reconstruction complète, PUIS restructuration (décision
 * utilisateur ultérieure : suppression totale de la notion de Période).
 * Modèle cible strict, désormais PLAT :
 *
 *   Tontine → Adhesion (direct)
 *           → TontineOccurrence [« Tour »] (direct, plus de Période intermédiaire)
 *                               → OccurrenceBeneficiary[]
 *                               → TontineRemainder? (reliquat, un par Tour sous-distribué)
 *           → TontineBeneficiaryPlan[] (direct, sans-achat uniquement)
 *           → TontineContribution (occurrenceId, adhesionId, amount — journal-lié)
 *
 * AUCUNE notion de Période/Cycle n'existe plus entre Tontine et Tour — ni
 * sous ce nom, ni sous un synonyme (Cycle/Session/Campagne/Séquence/
 * Exercice) : la relation est directement Tontine → Tour et Tontine → Plan.
 * La Tontine ne porte AUCUNE date propre (ni `startDate` ni équivalent) :
 * elle définit les RÈGLES (fréquence, montant, avec-achat...), jamais un
 * événement daté — seul le Tour (`TontineOccurrence.date`, obligatoire)
 * porte une date, décision explicite du mandat de suppression de
 * `Tontine.startDate`.
 */

import type { UnitCode } from '@/constants/units';
import type { FrequencyConfig } from './tontine-frequency';

export type ValueType = 'MONEY' | 'GOODS';
export type TontineStatus = 'statusActive' | 'statusInactive';

/**
 * Tontine — configuration permanente, jamais recréée. `currency` (MONEY
 * uniquement) est TOUJOURS héritée de Paramètres > Organisation à la
 * création, jamais saisie ni modifiable dans aucun formulaire (Créer/
 * Modifier) — aucun champ Devise n'existe donc dans `TontineInput`/
 * `TontineUpdateInput` (`tontines.service.ts`). `withPurchase` porte
 * exactement le libellé UI « Avec achat » (jamais « Mode achat ») — un
 * booléen, jamais un type littéral à deux valeurs, pour que le nom du champ
 * lui-même n'introduise plus jamais l'ambiguïté « Mode ».
 */
export type Tontine = {
  id: string;
  tenantId: string;
  name: string;
  valueType: ValueType;
  /** MONEY uniquement — code ISO 4217, résolu automatiquement depuis `organizationSettingsList` à la création, jamais choisi ni modifié ensuite (même si la devise de l'organisation change plus tard). */
  currency?: string;
  /** MONEY uniquement — « Avec achat » dans l'UI. `false` par défaut. ON déclenche la résolution automatique de `purchaseAccountId` (caisse « Achat tontine » du tenant) — une pure association, jamais une transaction créée à ce moment. */
  withPurchase?: boolean;
  /** Montant de cotisation, MONEY uniquement — obligatoire et strictement positif. Partagé par toutes les Adhésions (aucun taux/pourcentage/coefficient nulle part dans le modèle). */
  contributionAmount?: number;
  /** GOODS uniquement — référence déclarative du bien (ex. « Bidon d'huile 5L »). */
  item?: string;
  /** GOODS uniquement — quantité de référence associée à `item`. */
  quantity?: number;
  /** GOODS uniquement. */
  unit?: UnitCode;
  status: TontineStatus;
  createdAt: string;
  /** Caisse Finance recevant les cotisations et finançant les réceptions (MONEY uniquement) — intégration Tontine ↔ Finance, optionnelle et rétrocompatible. */
  accountId?: string;
  /** Caisse « Achat tontine » du tenant — auto-résolue par le service, JAMAIS choisie manuellement (pas de champ « Caisse liée » dans l'UI). `undefined` si `withPurchase` est faux ou si le tenant n'a pas cette caisse. */
  purchaseAccountId?: string;
} & { frequency: FrequencyConfig['frequency'] } & Partial<Omit<FrequencyConfig, 'frequency'>>;

export type AdhesionStatus = 'active' | 'exited';

/** Adhesion — rattachée DIRECTEMENT à la Tontine. `leftAt` (pas `endDate`). */
export type TontineAdhesion = {
  id: string;
  tenantId: string;
  tontineId: string;
  memberId: string;
  memberName: string;
  joinedAt: string;
  leftAt: string | null;
  status: AdhesionStatus;
};

/** Une adhésion ne participe à un Tour/un Plan que si elle est active à la date de référence. */
export function isAdhesionActiveAt(adhesion: TontineAdhesion, date: string): boolean {
  return adhesion.joinedAt <= date && (adhesion.leftAt === null || adhesion.leftAt >= date);
}

/** PLANNED = tour créé, pas encore réalisé. REALIZED = tous les bénéficiaires ont reçu l'intégralité de leur dû (clôture, immuable). */
export type OccurrenceStatus = 'PLANNED' | 'REALIZED';

/**
 * Tour — l'unité opérationnelle de la Tontine, rattachée DIRECTEMENT à elle
 * (plus de Période intermédiaire). `occurrenceNumber` reste l'ordre
 * chronologique des tours de CETTE Tontine (jamais réinitialisé).
 */
export type TontineOccurrence = {
  id: string;
  tenantId: string;
  tontineId: string;
  occurrenceNumber: number;
  date: string;
  status: OccurrenceStatus;
  createdAt: string;
};

/**
 * Une ligne PAR bénéficiaire — jamais une chaîne concaténée de plusieurs
 * noms. `amountDue`/`amountPaid` individuellement stockés (pas de champ
 * « montant total » partagé).
 */
export type OccurrenceBeneficiary = {
  id: string;
  tenantId: string;
  occurrenceId: string;
  adhesionId: string;
  amountDue: number;
  amountPaid: number;
  paidAt: string | null;
};

/**
 * Planification à l'avance des bénéficiaires — SANS-ACHAT UNIQUEMENT,
 * rattachée DIRECTEMENT à la Tontine (plus de Période) : `position`
 * (1, 2, 3…) fixe l'ordre de passage indépendamment de la création des
 * Tours ; une tontine « Avec achat » ne possède jamais de Plan (les
 * bénéficiaires y sont choisis directement à la création du Tour, cf.
 * `tontine-operations.service.ts`). `consumedByOccurrenceId` est renseigné
 * dès qu'un Tour a consommé cette position — une position déjà consommée
 * par un Tour RÉALISÉ devient IMMUABLE : la permutation ne porte jamais que
 * sur des positions futures/non consommées.
 */
export type TontineBeneficiaryPlan = {
  id: string;
  tenantId: string;
  tontineId: string;
  position: number;
  adhesionId: string;
  consumedByOccurrenceId: string | null;
};

export type RemainderOrigin = 'UNDERDISTRIBUTED_POOL';
export type RemainderStatus = 'OPEN' | 'CONSUMED' | 'WRITTEN_OFF';

/**
 * Reliquat — nouveau, traçabilité réelle. Calculé automatiquement à la
 * clôture d'un Tour dont les paiements aux bénéficiaires n'épuisent pas la
 * cagnotte attendue — jamais silencieusement perdu. `frequency` est une
 * copie dénormalisée de `Tontine.frequency` au moment du calcul
 * (traçabilité autonome, lisible même si la Tontine change de fréquence
 * ensuite). `status` : `OPEN` à la création, `CONSUMED` (affecté
 * explicitement au Tour suivant, action manuelle) ou `WRITTEN_OFF`
 * (abandon explicite, motivé). Toute transition est tracée par un
 * `AuditEvent` dédié — pas de second mécanisme d'audit.
 */
export type TontineRemainder = {
  id: string;
  tenantId: string;
  tontineId: string;
  occurrenceId: string;
  frequency: FrequencyConfig['frequency'];
  amount: number;
  date: string;
  origin: RemainderOrigin;
  status: RemainderStatus;
  createdBy: string;
};

/**
 * Contribution — journal-liée. Une Contribution ICI représente directement
 * un versement réel déjà effectué : sa création poste immédiatement la
 * Transaction Finance correspondante (`insertTransaction`), exactement
 * comme la réception d'un bénéficiaire.
 */
export type TontineContribution = {
  id: string;
  tenantId: string;
  occurrenceId: string;
  adhesionId: string;
  amount: number;
  date: string;
  createdBy: string;
};

export const tontines: Tontine[] = [
  { id: 'TON-001', tenantId: 'T-002', name: 'Tontine Horizon', valueType: 'MONEY', currency: 'XOF', withPurchase: false, contributionAmount: 50_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 20, status: 'statusActive', createdAt: '2025-01-15' },
  { id: 'TON-002', tenantId: 'T-005', name: 'Tontine Avenir', valueType: 'GOODS', item: 'Bidon d’huile 5L', quantity: 2, unit: 'BIDON', frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15, status: 'statusActive', createdAt: '2025-03-20' },
  { id: 'TON-003', tenantId: 'T-003', name: 'Mutuelle Teranga', valueType: 'MONEY', currency: 'XOF', withPurchase: false, contributionAmount: 30_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, status: 'statusActive', createdAt: '2024-11-10' },
  { id: 'TON-004', tenantId: 'T-001', name: 'Coopérative Sutura', valueType: 'MONEY', currency: 'XOF', withPurchase: true, contributionAmount: 25_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, status: 'statusActive', createdAt: '2024-06-01' },
  { id: 'TON-005', tenantId: 'T-004', name: 'Association Jappo', valueType: 'MONEY', currency: 'XOF', withPurchase: false, contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, status: 'statusInactive', createdAt: '2025-05-05' },
];

export const tontineAdhesions: TontineAdhesion[] = [
  { id: 'ADH-001', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', joinedAt: '2026-01-01', leftAt: null, status: 'active' },
  { id: 'ADH-002', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-002', memberName: 'Mamadou Sow', joinedAt: '2026-01-01', leftAt: null, status: 'active' },
  { id: 'ADH-003', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-007', memberName: 'Khadija Mbaye', joinedAt: '2026-01-01', leftAt: null, status: 'active' },
  { id: 'ADH-004', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-006', memberName: 'Cheikh Diop', joinedAt: '2026-01-01', leftAt: null, status: 'active' },
  { id: 'ADH-005', tenantId: 'T-005', tontineId: 'TON-002', memberId: 'M-005', memberName: 'Awa Cissé', joinedAt: '2026-07-01', leftAt: null, status: 'active' },
  { id: 'ADH-006', tenantId: 'T-002', tontineId: 'TON-001', memberId: 'M-008', memberName: 'Ibrahima Sarr', joinedAt: '2025-06-01', leftAt: '2026-05-01', status: 'exited' },
  { id: 'ADH-007', tenantId: 'T-001', tontineId: 'TON-004', memberId: 'M-016', memberName: 'Modou Faye', joinedAt: '2026-01-01', leftAt: null, status: 'active' },
  { id: 'ADH-008', tenantId: 'T-001', tontineId: 'TON-004', memberId: 'M-018', memberName: 'Coumba Thiam', joinedAt: '2026-01-01', leftAt: null, status: 'active' },
];

export const tontineOccurrences: TontineOccurrence[] = [
  { id: 'OCC-001', tenantId: 'T-002', tontineId: 'TON-001', occurrenceNumber: 1, date: '2026-06-20', status: 'REALIZED', createdAt: '2026-06-15' },
  { id: 'OCC-002', tenantId: 'T-002', tontineId: 'TON-001', occurrenceNumber: 2, date: '2026-07-20', status: 'PLANNED', createdAt: '2026-07-01' },
  { id: 'OCC-003', tenantId: 'T-005', tontineId: 'TON-002', occurrenceNumber: 1, date: '2026-08-15', status: 'PLANNED', createdAt: '2026-08-01' },
  { id: 'OCC-004', tenantId: 'T-001', tontineId: 'TON-004', occurrenceNumber: 1, date: '2026-06-01', status: 'PLANNED', createdAt: '2026-06-01' },
];

export const occurrenceBeneficiaries: OccurrenceBeneficiary[] = [
  { id: 'TB-001', tenantId: 'T-002', occurrenceId: 'OCC-001', adhesionId: 'ADH-001', amountDue: 200_000, amountPaid: 200_000, paidAt: '2026-06-21' },
  { id: 'TB-002', tenantId: 'T-002', occurrenceId: 'OCC-002', adhesionId: 'ADH-002', amountDue: 200_000, amountPaid: 0, paidAt: null },
];

/** Plan illustrant une tontine SANS-ACHAT (TON-001) : ADH-003/ADH-004 planifiées pour les positions 1/2, aucune encore consommée. TON-004 (avec-achat) n'a volontairement aucun Plan. */
export const tontineBeneficiaryPlans: TontineBeneficiaryPlan[] = [
  { id: 'PLN-001', tenantId: 'T-002', tontineId: 'TON-001', position: 1, adhesionId: 'ADH-003', consumedByOccurrenceId: null },
  { id: 'PLN-002', tenantId: 'T-002', tontineId: 'TON-001', position: 2, adhesionId: 'ADH-004', consumedByOccurrenceId: null },
];

export const tontineRemainders: TontineRemainder[] = [];

export const tontineContributions: TontineContribution[] = [
  { id: 'CTB-001', tenantId: 'T-002', occurrenceId: 'OCC-001', adhesionId: 'ADH-001', amount: 50_000, date: '2026-06-18', createdBy: 'Amadou Mbaye' },
];
