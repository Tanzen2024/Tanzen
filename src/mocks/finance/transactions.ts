export type TransactionType = 'debit' | 'credit';
/**
 * Classification d'une transaction (mandat « CLASSIFICATION DES TRANSACTIONS ») —
 * hiérarchie stricte à deux niveaux : `category` ∈ {EPARGNE, PRET, REMBOURSEMENT,
 * AUTRES} ; `subcategory` renseignée UNIQUEMENT quand `category === 'AUTRES'`.
 * Source unique de vérité : `./transaction-classification`.
 */
import type { TransactionCategory, TransactionSubcategory } from './transaction-classification';
export type TransactionStatus = 'completed' | 'pending' | 'failed' | 'cancelled';

export type Transaction = {
  id: string;
  tenantId: string;
  reference: string;
  date: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  /**
   * Sous-catégorie — renseignée UNIQUEMENT si `category === 'AUTRES'` (mandat
   * « MODÈLE DE DONNÉES » : `subcategory IS NULL` pour EPARGNE/PRET/REMBOURSEMENT).
   */
  subcategory?: TransactionSubcategory;
  status: TransactionStatus;
  fromAccount: string;
  toAccount: string;
  description: string;
  /**
   * Relation réelle vers `Member.id` (mandat « vue consolidée Finance →
   * Transactions ») — `undefined` pour un mouvement purement inter-comptes
   * (virement interne, frais bancaires...) qui n'appartient à aucun
   * adhérent. AVANT ce champ, `fromAccount`/`toAccount` étaient les seules
   * traces d'un « adhérent » sur une transaction, sous forme de texte libre
   * (parfois un nom de membre, parfois un numéro de compte) — jamais une
   * relation fiable. `memberId` reprend exactement l'identité déjà encodée
   * par ces noms dans le jeu de données existant (même tenant, même nom
   * complet qu'un `Member` réellement seedé), sans changer aucune valeur
   * `fromAccount`/`toAccount` déjà affichée ailleurs (AccountDetail, etc.).
   */
  memberId?: string;
  /**
   * Rattachement à la réunion à laquelle l'opération se rapporte (mandat §10).
   * `meetingId` = relation vers `Meeting.id` ; `meetingDate` = date RÉELLE de
   * cette réunion (distincte de `recordedAt`, l'horodatage de SAISIE dans le
   * système). Optionnels : une opération purement inter-comptes ou une écriture
   * hors réunion n'en a pas. Le seed historique ne les renseigne pas.
   */
  meetingId?: string;
  meetingDate?: string;
  /**
   * Exercice fiscal de rattachement (mandat « RÈGLE CENTRALE — DATES DE RÉUNION »
   * §12). Porte l'isolation : `meetingId` doit être une réunion générée par CET
   * exercice (`meetingService.validateMeetingBelongsToExercise`). Le seed
   * historique ne le renseigne pas (réunions de gouvernance d'avant la règle).
   */
  fiscalYearId?: string;
  /** Date/heure d'enregistrement de la transaction dans le système (ISO). Posé par `financeService.createTransaction`. Fallback d'affichage : `date`. */
  recordedAt?: string;
};

/**
 * Seed migré vers la nomenclature `category` / `subcategory` (mandat
 * « CLASSIFICATION DES TRANSACTIONS »). Correspondance ancienne → nouvelle :
 *   contribution → EPARGNE · loanDisbursement → PRET ·
 *   loanRepayment → REMBOURSEMENT · fee → AUTRES/FRAIS ·
 *   transfer → AUTRES/TRANSFERT · distribution → AUTRES/DISTRIBUTION ·
 *   penalty → AUTRES/PENALITE.
 * `subcategory` n'est présente que sur les lignes `AUTRES`.
 */
export const transactions: Transaction[] = [
  { id: 'TR-001', tenantId: 'T-001', reference: 'REF-2026-0001', date: '2026-08-11', amount: 50_000, type: 'credit', category: 'EPARGNE', status: 'completed', fromAccount: 'Fatou Ndiaye', toAccount: 'CS-001-ÉPG', description: 'Contribution cycle 4 - Tontine Horizon', memberId: 'M-001' },
  { id: 'TR-002', tenantId: 'T-001', reference: 'REF-2026-0002', date: '2026-08-10', amount: 850_000, type: 'debit', category: 'PRET', status: 'completed', fromAccount: 'CS-001-TRÉS', toAccount: 'Fatou Ndiaye', description: 'Décaissement prêt L-001', memberId: 'M-001' },
  { id: 'TR-003', tenantId: 'T-002', reference: 'REF-2026-0003', date: '2026-08-10', amount: 75_000, type: 'credit', category: 'EPARGNE', status: 'completed', fromAccount: 'Mamadou Sow', toAccount: 'TH-002-ÉPG', description: 'Contribution cycle 3 - Tontine Horizon', memberId: 'M-002' },
  { id: 'TR-004', tenantId: 'T-001', reference: 'REF-2026-0004', date: '2026-08-09', amount: 120_000, type: 'credit', category: 'REMBOURSEMENT', status: 'completed', fromAccount: 'Cheikh Diop', toAccount: 'CS-001-TRÉS', description: 'Remboursement prêt L-004 - Mensualité 3', memberId: 'M-006' },
  { id: 'TR-005', tenantId: 'T-002', reference: 'REF-2026-0005', date: '2026-08-08', amount: 50_000, type: 'credit', category: 'EPARGNE', status: 'completed', fromAccount: 'Khadija Mbaye', toAccount: 'TH-002-ÉPG', description: 'Contribution cycle 4 - Tontine Horizon', memberId: 'M-007' },
  { id: 'TR-006', tenantId: 'T-001', reference: 'REF-2026-0006', date: '2026-08-07', amount: 25_000, type: 'debit', category: 'AUTRES', subcategory: 'FRAIS', status: 'completed', fromAccount: 'CS-001-COUR', toAccount: 'Frais bancaires', description: 'Frais de transfert Western Union' },
  { id: 'TR-007', tenantId: 'T-003', reference: 'REF-2026-0007', date: '2026-08-06', amount: 300_000, type: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', status: 'completed', fromAccount: 'MT-003-TRÉS', toAccount: 'Aïssatou Bâ', description: 'Distribution trimestrielle - Mutuelle Teranga', memberId: 'M-003' },
  { id: 'TR-008', tenantId: 'T-003', reference: 'REF-2026-0008', date: '2026-08-05', amount: 15_000, type: 'debit', category: 'AUTRES', subcategory: 'PENALITE', status: 'completed', fromAccount: 'Ibrahima Sarr', toAccount: 'MT-003-TRÉS', description: 'Pénalité retard remboursement L-005', memberId: 'M-008' },
  { id: 'TR-009', tenantId: 'T-005', reference: 'REF-2026-0009', date: '2026-08-04', amount: 60_000, type: 'credit', category: 'EPARGNE', status: 'pending', fromAccount: 'Awa Cissé', toAccount: 'TA-005-SAV', description: 'Contribution cycle 1 - Tontine Avenir', memberId: 'M-005' },
  { id: 'TR-010', tenantId: 'T-001', reference: 'REF-2026-0010', date: '2026-08-03', amount: 500_000, type: 'debit', category: 'AUTRES', subcategory: 'TRANSFERT', status: 'completed', fromAccount: 'CS-001-TRÉS', toAccount: 'CS-001-COUR', description: 'Virement interne trésorerie vers courant' },
  { id: 'TR-011', tenantId: 'T-005', reference: 'REF-2026-0011', date: '2026-08-02', amount: 95_000, type: 'credit', category: 'REMBOURSEMENT', status: 'completed', fromAccount: 'Awa Cissé', toAccount: 'TA-005-SAV', description: 'Remboursement prêt L-003 - Mensualité 5', memberId: 'M-005' },
  { id: 'TR-012', tenantId: 'T-001', reference: 'REF-2026-0012', date: '2026-08-01', amount: 50_000, type: 'credit', category: 'EPARGNE', status: 'completed', fromAccount: 'Fatou Ndiaye', toAccount: 'CS-001-ÉPG', description: 'Contribution cycle 3 - Tontine Horizon', memberId: 'M-001', meetingId: 'MTG-FY-T001-2026-20260714', meetingDate: '2026-07-14', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-01T10:12:00' },
  { id: 'TR-013', tenantId: 'T-002', reference: 'REF-2026-0013', date: '2026-07-30', amount: 1_200_000, type: 'debit', category: 'PRET', status: 'completed', fromAccount: 'TH-002-TRÉS', toAccount: 'Mamadou Sow', description: 'Décaissement prêt L-002', memberId: 'M-002' },
  { id: 'TR-014', tenantId: 'T-003', reference: 'REF-2026-0014', date: '2026-07-28', amount: 45_000, type: 'debit', category: 'AUTRES', subcategory: 'PENALITE', status: 'failed', fromAccount: 'Ibrahima Sarr', toAccount: 'MT-003-TRÉS', description: 'Pénalité - échec prélèvement', memberId: 'M-008' },
  { id: 'TR-015', tenantId: 'T-002', reference: 'REF-2026-0015', date: '2026-07-25', amount: 200_000, type: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', status: 'completed', fromAccount: 'TH-002-TRÉS', toAccount: 'Tontine Horizon - Cycle 4', description: 'Distribution tirage cycle 4' },
];
