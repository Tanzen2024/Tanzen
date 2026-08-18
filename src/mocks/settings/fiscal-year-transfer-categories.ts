/**
 * Catalogue des catégories présentées à l'étape "Données transférables" de
 * l'assistant de création d'exercice (mandat "UX CONTEXT + FISCAL YEAR
 * OPENING / TRANSFER", puis correction "REOPEN APPROVAL + TRANSFER
 * SELECTION CORRECTION"). Chaque entrée porte DEUX classifications
 * distinctes, volontairement séparées :
 *
 * - `classification` (vocabulaire D-FY-02, inchangé) : répond à « cette
 *   entité devrait-elle un jour porter un fiscalYearId ? » — question de
 *   modélisation de données, encore ouverte pour 5 catégories.
 * - `transferability` (ce mandat) : répond à une question plus étroite et
 *   déjà tranchable techniquement : « lors de la création d'un nouvel
 *   exercice, cette catégorie doit-elle être proposée au transfert ? ».
 *   Le fait que D-FY-02 reste ouvert pour une catégorie NE bloque PAS la
 *   détermination de sa transférabilité — voir chaque `evidence` ci-dessous.
 *
 * Voir docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE.md §11 pour
 * le raisonnement complet catégorie par catégorie.
 */
export type TransferClassification = 'PERMANENT' | 'TENANT-SCOPED' | 'FY-SCOPED' | 'FY-DERIVED' | 'DECISION_REQUIRED';

/** A/B/C/D du mandat de correction, nommés explicitement plutôt que par lettre. */
export type TransferabilityDecision = 'TRANSFERABLE' | 'NOT_TRANSFERABLE' | 'PARTIAL' | 'UNDETERMINED';

export type FiscalYearTransferCategory = {
  id: string;
  /** Clé i18n (section `settings`) du libellé affiché. */
  labelKey: string;
  /** Clé i18n de l'explication D-FY-02 affichée sous le libellé (inchangée). */
  descriptionKey: string;
  classification: TransferClassification;
  transferability: TransferabilityDecision;
  /** Dérivé de `transferability` (TRANSFERABLE ou PARTIAL) — case à cocher active. */
  transferable: boolean;
  /** Clé i18n de la raison de transférabilité affichée à l'utilisateur (distincte de `descriptionKey`). */
  transferabilityReasonKey: string;
  /** Preuve : fichier(s) réellement inspecté(s) pour établir cette classification. */
  evidence: string;
};

export const fiscalYearTransferCategories: FiscalYearTransferCategory[] = [
  { id: 'tontineConfig', labelKey: 'transferCategoryTontineConfig', descriptionKey: 'transferReasonPermanent', classification: 'TENANT-SCOPED', transferability: 'TRANSFERABLE', transferable: true, transferabilityReasonKey: 'transferabilityReasonPermanentConfig', evidence: 'src/mocks/tontines/tontines.ts — Tontine{id,tenantId,name,type,status,...}, aucun fiscalYearId, jamais lié à un exercice' },
  { id: 'activeMembers', labelKey: 'transferCategoryActiveMembers', descriptionKey: 'transferReasonPermanent', classification: 'TENANT-SCOPED', transferability: 'TRANSFERABLE', transferable: true, transferabilityReasonKey: 'transferabilityReasonPermanentConfig', evidence: 'src/mocks/organization/members.ts — Member{id,tenantId,...}, aucun fiscalYearId' },
  { id: 'loanRules', labelKey: 'transferCategoryLoanRules', descriptionKey: 'transferReasonPermanent', classification: 'TENANT-SCOPED', transferability: 'TRANSFERABLE', transferable: true, transferabilityReasonKey: 'transferabilityReasonPermanentConfig', evidence: 'src/mocks/finance/loan-rules.ts — LoanPolicy{tenantId,...}, aucun fiscalYearId' },
  { id: 'accountsConfig', labelKey: 'transferCategoryAccountsConfig', descriptionKey: 'transferReasonPermanent', classification: 'TENANT-SCOPED', transferability: 'TRANSFERABLE', transferable: true, transferabilityReasonKey: 'transferabilityReasonPermanentConfig', evidence: 'src/mocks/finance/accounts.ts — Account{id,tenantId,balance,...}, solde courant unique non partitionné par exercice, aucun fiscalYearId' },
  { id: 'contributions', labelKey: 'transferCategoryContributions', descriptionKey: 'transferReasonDecisionRequired', classification: 'DECISION_REQUIRED', transferability: 'NOT_TRANSFERABLE', transferable: false, transferabilityReasonKey: 'transferabilityReasonHistorical', evidence: 'src/mocks/finance/contributions.ts + CycleContribution — datées (contribution_date/date), appartiennent par nature à leur période, indépendamment de D-FY-02' },
  { id: 'transactions', labelKey: 'transferCategoryTransactions', descriptionKey: 'transferReasonDecisionRequired', classification: 'DECISION_REQUIRED', transferability: 'NOT_TRANSFERABLE', transferable: false, transferabilityReasonKey: 'transferabilityReasonHistorical', evidence: 'src/mocks/finance/transactions.ts — Transaction{tenantId,date,...}, datée' },
  { id: 'draws', labelKey: 'transferCategoryDraws', descriptionKey: 'transferReasonDecisionRequired', classification: 'DECISION_REQUIRED', transferability: 'NOT_TRANSFERABLE', transferable: false, transferabilityReasonKey: 'transferabilityReasonHistorical', evidence: 'CycleDraw (src/mocks/tontines/tontine-cycles.ts) — rattaché à un Cycle daté, jamais à un exercice fiscal' },
  { id: 'attendance', labelKey: 'transferCategoryAttendance', descriptionKey: 'transferReasonDecisionRequired', classification: 'DECISION_REQUIRED', transferability: 'NOT_TRANSFERABLE', transferable: false, transferabilityReasonKey: 'transferabilityReasonHistorical', evidence: 'src/mocks/organization/attendances.ts — Attendance{meetingId,...}, datée à une réunion précise' },
  { id: 'votes', labelKey: 'transferCategoryVotes', descriptionKey: 'transferReasonDecisionRequired', classification: 'DECISION_REQUIRED', transferability: 'NOT_TRANSFERABLE', transferable: false, transferabilityReasonKey: 'transferabilityReasonHistorical', evidence: 'src/mocks/organization/member-votes.ts + governance.ts (Vote) — daté' },
];
