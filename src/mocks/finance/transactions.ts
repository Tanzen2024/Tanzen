export type TransactionType = 'debit' | 'credit';
/**
 * Classification d'une transaction (mandat « CLASSIFICATION DES TRANSACTIONS ») —
 * hiérarchie stricte à deux niveaux : `category` ∈ {EPARGNE, AUTRES} ; `subcategory`
 * renseignée UNIQUEMENT quand `category === 'AUTRES'` (dont PRET / REMBOURSEMENT,
 * mandat 2026-09-25). Source unique de vérité : `./transaction-classification`.
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
   * « MODÈLE DE DONNÉES » : `subcategory IS NULL` pour EPARGNE).
   */
  subcategory?: TransactionSubcategory;
  status: TransactionStatus;
  source: string;
  destination: string;
  description: string;
  /**
   * Relation réelle vers `Member.id` (mandat « vue consolidée Finance →
   * Transactions ») — `undefined` pour un mouvement purement inter-comptes
   * (virement interne, frais bancaires...) qui n'appartient à aucun
   * adhérent. AVANT ce champ, `source`/`destination` étaient les seules
   * traces d'un « adhérent » sur une transaction, sous forme de texte libre
   * (parfois un nom de membre, parfois un numéro de compte) — jamais une
   * relation fiable. `memberId` reprend exactement l'identité déjà encodée
   * par ces noms dans le jeu de données existant (même tenant, même nom
   * complet qu'un `Member` réellement seedé), sans changer aucune valeur
   * `source`/`destination` déjà affichée ailleurs (CashboxDetail, etc.).
   */
  memberId?: string;
  /**
   * Rattachement à la SÉANCE (`FiscalSession.id`) à laquelle l'opération se
   * rapporte — source de vérité UNIQUE de la séance d'un prêt (transaction de
   * décaissement) ou d'un remboursement (transaction d'encaissement,
   * `repaymentId`) : jamais recopiée sur `Loan`/`Repayment`. La date de la séance se lit via
   * `FiscalSession.date` (`fiscalSessionService`), jamais dupliquée ici —
   * `Transaction.date` reste la date propre de la transaction. Optionnel :
   * une opération purement inter-comptes ou une écriture hors séance n'en a pas.
   */
  sessionId?: string;
  /**
   * Exercice fiscal de rattachement. Porte l'isolation : `sessionId` doit être
   * une séance de CET exercice (`fiscalSessionService.validateSessionBelongsToExercise`).
   * Le seed historique ne le renseigne pas (transactions d'avant la règle).
   */
  fiscalYearId?: string;
  /** Date/heure d'enregistrement de la transaction dans le système (ISO). Posé par `financeService.createTransaction`. Fallback d'affichage : `date`. */
  recordedAt?: string;
  /**
   * Relation vers `Loan.id` (mandat « Finalisation Finance/Tontines ») — posée
   * après coup par `creditService.createLoanTransaction`/`createRepaymentTransaction`
   * une fois le `Transaction` créé et le `Loan` réel connu, jamais au moment du
   * INSERT initial (`financeService.createTransaction` ignore ce champ : il ne
   * sait rien des prêts, aucune dépendance introduite dans l'autre sens).
   * `undefined` pour toute transaction sans rapport avec un prêt.
   */
  loanId?: string;
  /**
   * Relation vers `Repayment.id` (mandat « Séparation Caisses / Crédit ») — posée par
   * `creditService.createRepaymentTransaction` : l'ENCAISSEMENT (cette transaction, rattachée
   * à une caisse) référence l'ÉVÉNEMENT MÉTIER qui l'a produit (le remboursement), sans que
   * l'un soit l'autre. `undefined` pour tout mouvement qui n'est pas l'encaissement d'un remboursement.
   */
  repaymentId?: string;
  /**
   * Relation vers `OccurrenceBeneficiary.id` (mandat « Achat de tontine → crédit automatique
   * dans la caisse Achat tontine ») — posée UNIQUEMENT sur la transaction « Autres / Achat
   * tontine » générée par `tontineOperationsService` : l'achat d'un bénéficiaire (son
   * `amountPurchased`) a AU PLUS UNE transaction non annulée portant cette clé, jamais deux
   * (idempotence, cf. `syncTontinePurchaseTransaction`). `undefined` partout ailleurs,
   * y compris pour les achats historiques du seed, antérieurs à la règle.
   */
  tontineBeneficiaryId?: string;
};

/**
 * Seed migré vers la nomenclature `category` / `subcategory` (mandat
 * « CLASSIFICATION DES TRANSACTIONS »). Correspondance ancienne → nouvelle :
 *   contribution → EPARGNE · loanDisbursement → AUTRES/PRET ·
 *   loanRepayment → AUTRES/REMBOURSEMENT · fee → AUTRES/FRAIS ·
 *   transfer → AUTRES/TRANSFERT · distribution → AUTRES/DISTRIBUTION ·
 *   penalty → AUTRES/PENALITE.
 * `subcategory` n'est présente que sur les lignes `AUTRES`.
 *
 * Jeu de démonstration T-001 (nettoyage du 2026-09-27) : uniquement sur les caisses
 * conservées — Épargne (CX-001), Inscription (CX-002), Secours (CX-003), Transport (CX-004) —
 * toutes rattachées à la séance FS-001 de FY-T001-2026. Total T-001 : 1 219 000 FCFA.
 * Les ids restent CONTIGUS (TR-001…TR-nnn) : `insertTransaction` numérote `length + 1`.
 */
export const transactions: Transaction[] = [
  { id: 'TR-001', tenantId: 'T-001', reference: 'REF-2026-0001', date: '2026-08-11', amount: 50_000, type: 'credit', category: 'EPARGNE', status: 'completed', source: 'Fatou Ndiaye', destination: 'CS-001-CX-001', description: 'Épargne mensuelle', memberId: 'M-001', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-11T10:00:00' },
  { id: 'TR-002', tenantId: 'T-001', reference: 'REF-2026-0002', date: '2026-08-10', amount: 850_000, type: 'debit', category: 'AUTRES', subcategory: 'PRET', status: 'completed', source: 'CS-001-CX-001', destination: 'Fatou Ndiaye', description: 'Décaissement prêt L-001', memberId: 'M-001', loanId: 'L-001', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-10T10:00:00' },
  { id: 'TR-003', tenantId: 'T-002', reference: 'REF-2026-0003', date: '2026-08-10', amount: 75_000, type: 'credit', category: 'EPARGNE', status: 'completed', source: 'Mamadou Sow', destination: 'TH-002-ÉPG', description: 'Contribution cycle 3 - Tontine Horizon', memberId: 'M-002' },
  { id: 'TR-004', tenantId: 'T-001', reference: 'REF-2026-0004', date: '2026-08-09', amount: 120_000, type: 'credit', category: 'AUTRES', subcategory: 'REMBOURSEMENT', status: 'completed', source: 'Cheikh Diop', destination: 'CS-001-CX-001', description: 'Remboursement prêt L-004 - Mensualité 3', memberId: 'M-006', loanId: 'L-004', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-09T10:00:00' },
  { id: 'TR-005', tenantId: 'T-002', reference: 'REF-2026-0005', date: '2026-08-08', amount: 50_000, type: 'credit', category: 'EPARGNE', status: 'completed', source: 'Khadija Mbaye', destination: 'TH-002-ÉPG', description: 'Contribution cycle 4 - Tontine Horizon', memberId: 'M-007' },
  { id: 'TR-006', tenantId: 'T-001', reference: 'REF-2026-0006', date: '2026-08-07', amount: 5_000, type: 'credit', category: 'AUTRES', subcategory: 'COTISATION', status: 'completed', source: 'Fatou Ndiaye', destination: 'CS-001-CX-004', description: 'Cotisation transport', memberId: 'M-001', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-07T10:00:00' },
  { id: 'TR-007', tenantId: 'T-003', reference: 'REF-2026-0007', date: '2026-08-06', amount: 300_000, type: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', status: 'completed', source: 'MT-003-TRÉS', destination: 'Aïssatou Bâ', description: 'Distribution trimestrielle - Mutuelle Teranga', memberId: 'M-003' },
  { id: 'TR-008', tenantId: 'T-003', reference: 'REF-2026-0008', date: '2026-08-05', amount: 15_000, type: 'debit', category: 'AUTRES', subcategory: 'PENALITE', status: 'completed', source: 'Ibrahima Sarr', destination: 'MT-003-TRÉS', description: 'Pénalité retard remboursement L-005', memberId: 'M-008' },
  { id: 'TR-009', tenantId: 'T-005', reference: 'REF-2026-0009', date: '2026-08-04', amount: 60_000, type: 'credit', category: 'EPARGNE', status: 'pending', source: 'Awa Cissé', destination: 'TA-005-SAV', description: 'Contribution cycle 1 - Tontine Avenir', memberId: 'M-005' },
  { id: 'TR-010', tenantId: 'T-001', reference: 'REF-2026-0010', date: '2026-08-03', amount: 5_000, type: 'credit', category: 'AUTRES', subcategory: 'COTISATION', status: 'completed', source: 'Cheikh Diop', destination: 'CS-001-CX-004', description: 'Cotisation transport', memberId: 'M-006', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-03T10:00:00' },
  { id: 'TR-011', tenantId: 'T-005', reference: 'REF-2026-0011', date: '2026-08-02', amount: 95_000, type: 'credit', category: 'AUTRES', subcategory: 'REMBOURSEMENT', status: 'completed', source: 'Awa Cissé', destination: 'TA-005-SAV', description: 'Remboursement prêt L-003 - Mensualité 5', memberId: 'M-005', loanId: 'L-003' },
  { id: 'TR-012', tenantId: 'T-001', reference: 'REF-2026-0012', date: '2026-08-01', amount: 50_000, type: 'credit', category: 'EPARGNE', status: 'completed', source: 'Fatou Ndiaye', destination: 'CS-001-CX-001', description: 'Épargne mensuelle', memberId: 'M-001', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-01T10:00:00' },
  { id: 'TR-013', tenantId: 'T-002', reference: 'REF-2026-0013', date: '2026-07-30', amount: 1_200_000, type: 'debit', category: 'AUTRES', subcategory: 'PRET', status: 'completed', source: 'TH-002-TRÉS', destination: 'Mamadou Sow', description: 'Décaissement prêt L-002', memberId: 'M-002', loanId: 'L-002' },
  { id: 'TR-014', tenantId: 'T-003', reference: 'REF-2026-0014', date: '2026-07-28', amount: 45_000, type: 'debit', category: 'AUTRES', subcategory: 'PENALITE', status: 'failed', source: 'Ibrahima Sarr', destination: 'MT-003-TRÉS', description: 'Pénalité - échec prélèvement', memberId: 'M-008' },
  { id: 'TR-015', tenantId: 'T-002', reference: 'REF-2026-0015', date: '2026-07-25', amount: 200_000, type: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', status: 'completed', source: 'TH-002-TRÉS', destination: 'Tontine Horizon - Cycle 4', description: 'Distribution tirage cycle 4' },
  { id: 'TR-016', tenantId: 'T-001', reference: 'REF-2026-0016', date: '2026-08-12', amount: 40_000, type: 'credit', category: 'EPARGNE', status: 'completed', source: 'Cheikh Diop', destination: 'CS-001-CX-001', description: 'Épargne mensuelle', memberId: 'M-006', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-12T10:00:00' },
  { id: 'TR-017', tenantId: 'T-001', reference: 'REF-2026-0017', date: '2026-08-12', amount: 25_000, type: 'credit', category: 'EPARGNE', status: 'completed', source: 'Modou Faye', destination: 'CS-001-CX-001', description: 'Épargne mensuelle', memberId: 'M-016', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-12T10:00:00' },
  { id: 'TR-018', tenantId: 'T-001', reference: 'REF-2026-0018', date: '2026-08-12', amount: 5_000, type: 'credit', category: 'AUTRES', subcategory: 'COTISATION', status: 'completed', source: 'Coumba Thiam', destination: 'CS-001-CX-004', description: 'Cotisation transport', memberId: 'M-018', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-12T10:00:00' },
  { id: 'TR-019', tenantId: 'T-001', reference: 'REF-2026-0019', date: '2026-08-13', amount: 12_000, type: 'debit', category: 'AUTRES', subcategory: 'FRAIS', status: 'completed', source: 'CS-001-CX-004', destination: 'Frais de transport', description: 'Location véhicule - déplacement de la séance', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-13T10:00:00' },
  { id: 'TR-020', tenantId: 'T-001', reference: 'REF-2026-0020', date: '2026-08-05', amount: 12_000, type: 'credit', category: 'AUTRES', subcategory: 'SECOURS', status: 'completed', source: 'Cheikh Diop', destination: 'CS-001-CX-003', description: 'Cotisation secours', memberId: 'M-006', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-05T10:00:00' },
  { id: 'TR-021', tenantId: 'T-001', reference: 'REF-2026-0021', date: '2026-08-12', amount: 12_000, type: 'credit', category: 'AUTRES', subcategory: 'SECOURS', status: 'completed', source: 'Modou Faye', destination: 'CS-001-CX-003', description: 'Cotisation secours', memberId: 'M-016', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-12T10:00:00' },
  { id: 'TR-022', tenantId: 'T-001', reference: 'REF-2026-0022', date: '2026-08-12', amount: 12_000, type: 'credit', category: 'AUTRES', subcategory: 'SECOURS', status: 'completed', source: 'Coumba Thiam', destination: 'CS-001-CX-003', description: 'Cotisation secours', memberId: 'M-018', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-12T10:00:00' },
  { id: 'TR-023', tenantId: 'T-001', reference: 'REF-2026-0023', date: '2026-08-14', amount: 20_000, type: 'debit', category: 'AUTRES', subcategory: 'AUTRE', status: 'completed', source: 'CS-001-CX-003', destination: 'Modou Faye', description: 'Aide secours - hospitalisation', memberId: 'M-016', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-14T10:00:00' },
  { id: 'TR-024', tenantId: 'T-001', reference: 'REF-2026-0024', date: '2026-08-01', amount: 500, type: 'credit', category: 'AUTRES', subcategory: 'INSCRIPTION', status: 'completed', source: 'Modou Faye', destination: 'CS-001-CX-002', description: 'Frais d’inscription', memberId: 'M-016', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-01T10:00:00' },
  { id: 'TR-025', tenantId: 'T-001', reference: 'REF-2026-0025', date: '2026-08-01', amount: 500, type: 'credit', category: 'AUTRES', subcategory: 'INSCRIPTION', status: 'completed', source: 'Coumba Thiam', destination: 'CS-001-CX-002', description: 'Frais d’inscription', memberId: 'M-018', sessionId: 'FS-001', fiscalYearId: 'FY-T001-2026', recordedAt: '2026-08-01T10:00:00' },
];
