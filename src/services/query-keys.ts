import type { PlatformScope } from '@/mocks/rbac.mocks';

export const queryKeys = {
  dashboard: {
    overview: (tenantId: string) => ['dashboard', 'overview', tenantId] as const,
    financialOverviewTrend: ['dashboard', 'financial-overview-trend'] as const,
    contributionsTrend: ['dashboard', 'contributions-trend'] as const,
    repaymentsTrend: ['dashboard', 'repayments-trend'] as const,
    tontineActivityTrend: ['dashboard', 'tontine-activity-trend'] as const,
  },
  tenants: {
    list: (tenantId: string, scope: PlatformScope) => ['tenants', 'list', tenantId, scope] as const,
    detail: (id: string) => ['tenants', 'detail', id] as const,
  },
  platformCommercial: {
    dashboard: (scope: PlatformScope) => ['platform-commercial', 'dashboard', scope] as const,
    plans: ['platform-commercial', 'plans'] as const,
    subscriptions: (scope: PlatformScope) => ['platform-commercial', 'subscriptions', scope] as const,
    subscriptionsByTenant: (scope: PlatformScope, tenantId: string) => ['platform-commercial', 'subscriptions', 'tenant', scope, tenantId] as const,
    payments: (scope: PlatformScope) => ['platform-commercial', 'payments', scope] as const,
    paymentsByTenant: (scope: PlatformScope, tenantId: string) => ['platform-commercial', 'payments', 'tenant', scope, tenantId] as const,
    invoices: (scope: PlatformScope) => ['platform-commercial', 'invoices', scope] as const,
    invoicesByTenant: (scope: PlatformScope, tenantId: string) => ['platform-commercial', 'invoices', 'tenant', scope, tenantId] as const,
    auditEvents: (scope: PlatformScope) => ['platform-commercial', 'audit-events', scope] as const,
  },
  members: {
    list: (tenantId: string) => ['members', 'list', tenantId] as const,
    detail: (id: string) => ['members', 'detail', id] as const,
  },
  governance: {
    meetings: (tenantId: string) => ['governance', 'meetings', tenantId] as const,
    meeting: (id: string) => ['governance', 'meetings', 'detail', id] as const,
    board: (tenantId: string) => ['governance', 'board', tenantId] as const,
    mandateFunctions: (tenantId: string) => ['governance', 'mandate-functions', tenantId] as const,
    attendances: (meetingId: string) => ['governance', 'attendances', meetingId] as const,
    quorumSnapshot: (meetingId: string) => ['governance', 'quorum-snapshot', meetingId] as const,
    assemblyDecisions: (meetingId: string) => ['governance', 'assembly-decisions', meetingId] as const,
    assemblyDecision: (id: string) => ['governance', 'assembly-decisions', 'detail', id] as const,
    decisionVotes: (decisionId: string) => ['governance', 'decision-votes', decisionId] as const,
    voteOptions: (voteId: string) => ['governance', 'vote-options', voteId] as const,
    memberVotes: (voteId: string) => ['governance', 'member-votes', voteId] as const,
  },
  finance: {
    /** Séances d'un exercice fiscal — reconstruction complète, remplace l'ancien `meetings` (réunions virtuelles). */
    sessions: {
      list: (tenantId: string, fiscalYearId: string | undefined) => ['finance', 'sessions', 'list', tenantId, fiscalYearId] as const,
      next: (tenantId: string, fiscalYearId: string | undefined) => ['finance', 'sessions', 'next', tenantId, fiscalYearId] as const,
      /** Préfixe de TOUTES les suggestions de prochaine séance du tenant — à invalider quand la fréquence d'un exercice change (`next(tenantId, undefined)` ne correspond à aucun exercice). */
      nextAll: (tenantId: string) => ['finance', 'sessions', 'next', tenantId] as const,
      /** Une séance, résolue DANS le tenant courant (`fiscalSessionService.getSession`). */
      detail: (tenantId: string, sessionId: string) => ['finance', 'sessions', 'detail', tenantId, sessionId] as const,
      /** Toutes les séances du tenant, tous exercices confondus — journal consolidé. */
      all: (tenantId: string) => ['finance', 'sessions', 'all', tenantId] as const,
    },
    cashboxes: (tenantId: string) => ['finance', 'cashboxes', tenantId] as const,
    /** Caisses vues dans le contexte d'UN exercice (solde/mouvements de l'exercice) — préfixée par `cashboxes(tenantId)`, donc couverte par ses invalidations. */
    cashboxesByFiscalYear: (tenantId: string, fiscalYearId: string | undefined) => ['finance', 'cashboxes', tenantId, 'fiscal-year', fiscalYearId] as const,
    /** Récapitulatif par caisse d'une séance (`'all'` = toutes les séances de l'exercice) — préfixée par `cashboxes(tenantId)`, donc invalidée avec elle après toute écriture. */
    cashboxesBySession: (tenantId: string, fiscalYearId: string | undefined, sessionId: string) => ['finance', 'cashboxes', tenantId, 'fiscal-year', fiscalYearId, 'session', sessionId] as const,
    cashbox: (id: string) => ['finance', 'cashboxes', 'detail', id] as const,
    /** Détail d'une caisse dans le contexte d'un exercice — préfixée par `cashbox(id)`. */
    cashboxByFiscalYear: (id: string, tenantId: string, fiscalYearId: string | undefined) => ['finance', 'cashboxes', 'detail', id, tenantId, 'fiscal-year', fiscalYearId] as const,
    cashboxMemberships: (tenantId: string) => ['finance', 'cashbox-memberships', tenantId] as const,
    /** Moteur de position — `scopeKey` provient de `@/lib/finance`. */
    position: {
      balance: (tenantId: string, scopeKey: string, asOfDate: string) => ['finance', 'position', 'balance', tenantId, scopeKey, asOfDate] as const,
      flows: (tenantId: string, scopeKey: string, from: string, to: string) => ['finance', 'position', 'flows', tenantId, scopeKey, from, to] as const,
      /** Bilan financier des adhérents sur une période — `selectionKey` = ids triés ou `ALL`. */
      memberPeriodStatements: (tenantId: string, selectionKey: string, from: string, to: string, cashboxId: string, withOperations: boolean, variant = '') => ['finance', 'position', 'member-period-statements', tenantId, selectionKey, from, to, cashboxId, withOperations, variant] as const,
      /** Bilan financier des adhérents — `selectionKey` = ids triés ou `ALL`. */
      memberBalanceSheets: (tenantId: string, selectionKey: string, asOfDate: string, cashboxId: string, historyFrom: string, withOperations: boolean) => ['finance', 'position', 'member-balance-sheets', tenantId, selectionKey, asOfDate, cashboxId, historyFrom, withOperations] as const,
      /** Étape 6 — clôtures/reports d'un exercice, pour invalidation après `closeFiscalYear`/`carryForward`. */
      closingEntries: (tenantId: string, fiscalYearId: string) => ['finance', 'position', 'closing-entries', tenantId, fiscalYearId] as const,
      openingEntries: (tenantId: string, fiscalYearId: string) => ['finance', 'position', 'opening-entries', tenantId, fiscalYearId] as const,
      carryForwardIntegrity: (tenantId: string, fromFiscalYearId: string, toFiscalYearId: string) =>
        ['finance', 'position', 'carry-forward-integrity', tenantId, fromFiscalYearId, toFiscalYearId] as const,
      /** Étape 7 — position d'un membre (`scopeKey` = `member:<id>` ou `member:<id>:cashbox:<id>`). */
      memberPosition: (tenantId: string, scopeKey: string, asOfDate: string) => ['finance', 'position', 'member', tenantId, scopeKey, asOfDate] as const,
    },
    transactions: (tenantId: string) => ['finance', 'transactions', tenantId] as const,
    transactionsByFiscalYear: (tenantId: string, fiscalYearId: string | undefined) => ['finance', 'transactions', 'by-fiscal-year', tenantId, fiscalYearId] as const,
    transaction: (id: string) => ['finance', 'transactions', 'detail', id] as const,
    contributions: (tenantId: string) => ['finance', 'contributions', tenantId] as const,
    contributionsByMember: (memberId: string) => ['finance', 'contributions', 'member', memberId] as const,
    contributionsTrend: ['finance', 'contributions', 'trend'] as const,
    distributions: (tenantId: string) => ['finance', 'distributions', tenantId] as const,
  },
  credit: {
    applications: (tenantId: string) => ['credit', 'applications', tenantId] as const,
    application: (id: string) => ['credit', 'applications', 'detail', id] as const,
    loans: (tenantId: string) => ['credit', 'loans', tenantId] as const,
    loan: (id: string) => ['credit', 'loans', 'detail', id] as const,
    loansByMember: (memberId: string) => ['credit', 'loans', 'member', memberId] as const,
    repaymentsByLoan: (loanId: string) => ['credit', 'repayments', 'loan', loanId] as const,
    guarantorsByLoan: (loanId: string) => ['credit', 'guarantors', 'loan', loanId] as const,
    repayments: (tenantId: string) => ['credit', 'repayments', tenantId] as const,
    guarantors: (tenantId: string) => ['credit', 'guarantors', tenantId] as const,
    loanRules: (tenantId: string) => ['credit', 'loan-rules', tenantId] as const,
    loanRule: (id: string) => ['credit', 'loan-rules', 'detail', id] as const,
  },
  tontines: {
    list: (tenantId: string) => ['tontines', 'list', tenantId] as const,
    detail: (id: string) => ['tontines', 'detail', id] as const,
    summary: (id: string) => ['tontines', 'summary', id] as const,
    adhesions: (tontineId: string) => ['tontines', 'adhesions', tontineId] as const,
    adhesionsByMember: (memberId: string) => ['tontines', 'adhesions-by-member', memberId] as const,
    plans: (tontineId: string) => ['tontines', 'plans', tontineId] as const,
    occurrences: (tontineId: string) => ['tontines', 'occurrences', tontineId] as const,
    occurrence: (occurrenceId: string) => ['tontines', 'occurrence', occurrenceId] as const,
    beneficiaries: (occurrenceId: string) => ['tontines', 'beneficiaries', occurrenceId] as const,
    /** Bénéficiaires de TOUS les Tours du cycle courant (historique), jamais un seul Tour : sert à verrouiller les participations déjà « passées » dans les Tours suivants (sans achat ET avec achat). */
    cycleBeneficiaries: (tontineId: string) => ['tontines', 'cycle-beneficiaries', tontineId] as const,
    /** AVEC ACHAT — ordre chronologique global des bénéficiaires du cycle : sert à numéroter le panneau « Bénéficiaires du Tour » en continu, jamais réinitialisé à 1 à chaque Tour. */
    cycleBeneficiaryOrder: (tontineId: string) => ['tontines', 'cycle-beneficiary-order', tontineId] as const,
    contributions: (occurrenceId: string) => ['tontines', 'contributions', occurrenceId] as const,
    contributionStatuses: (occurrenceId: string) => ['tontines', 'contribution-statuses', occurrenceId] as const,
    /** Préfixe d'invalidation : un ajout/une sortie d'adhésion rafraîchit les Tours déjà ouverts. */
    allContributionStatuses: () => ['tontines', 'contribution-statuses'] as const,
    remainders: (tontineId: string) => ['tontines', 'remainders', tontineId] as const,
    distributions: (tontineId: string) => ['tontines', 'distributions', tontineId] as const,
    contributionsByTontine: (tontineId: string) => ['tontines', 'contributions-by-tontine', tontineId] as const,
    allAdhesions: (tenantId: string) => ['tontines', 'all-adhesions', tenantId] as const,
    allOccurrences: (tenantId: string) => ['tontines', 'all-occurrences', tenantId] as const,
    allContributions: (tenantId: string) => ['tontines', 'all-contributions', tenantId] as const,
    allBeneficiaries: (tenantId: string) => ['tontines', 'all-beneficiaries', tenantId] as const,
    allRemainders: (tenantId: string) => ['tontines', 'all-remainders', tenantId] as const,
    cycleStatus: (tontineId: string) => ['tontines', 'cycle-status', tontineId] as const,
    planningStatus: (tontineId: string) => ['tontines', 'planning-status', tontineId] as const,
  },
  operations: {
    workflowDefinitions: (tenantId: string) => ['operations', 'workflow-definitions', tenantId] as const,
    workflowRequests: (tenantId: string) => ['operations', 'workflow-requests', tenantId] as const,
    workflowRequest: (id: string) => ['operations', 'workflow-requests', 'detail', id] as const,
    /** Dépend de l'utilisateur (permissions + séparation des tâches) : `userId` dans la clé, sinon la liste d'un autre utilisateur reste servie par le cache. */
    myApprovals: (tenantId: string, userId: string) => ['operations', 'my-approvals', tenantId, userId] as const,
    delegations: (tenantId: string) => ['operations', 'delegations', tenantId] as const,
    history: (tenantId: string) => ['operations', 'history', tenantId] as const,
    notifications: (tenantId: string, userId: string) => ['operations', 'notifications', tenantId, userId] as const,
    documents: (tenantId: string) => ['operations', 'documents', tenantId] as const,
    document: (id: string) => ['operations', 'documents', 'detail', id] as const,
  },
  access: {
    users: ['access', 'users'] as const,
    user: (id: string) => ['access', 'users', 'detail', id] as const,
    usersByRole: (roleId: string) => ['access', 'users', 'role', roleId] as const,
    roles: ['access', 'roles'] as const,
    role: (id: string) => ['access', 'roles', 'detail', id] as const,
    permissions: ['access', 'permissions'] as const,
    sessions: ['access', 'sessions'] as const,
    sessionsByUser: (userId: string) => ['access', 'sessions', 'user', userId] as const,
  },
  audit: {
    events: (tenantId: string) => ['audit', 'events', tenantId] as const,
    event: (tenantId: string, id: string) => ['audit', 'events', 'detail', tenantId, id] as const,
  },
  settings: {
    organization: (tenantId: string) => ['settings', 'organization', tenantId] as const,
    fiscalYears: (tenantId: string) => ['settings', 'fiscal-years', tenantId] as const,
    currentFiscalYear: (tenantId: string) => ['settings', 'fiscal-years', 'current', tenantId] as const,
    reopenRequests: (tenantId: string) => ['settings', 'fiscal-years', 'reopen-requests', tenantId] as const,
    notificationChannels: (tenantId: string) => ['settings', 'notification-channels', tenantId] as const,
    notificationRules: (tenantId: string) => ['settings', 'notification-rules', tenantId] as const,
    notificationPreferences: (userId: string) => ['settings', 'notification-preferences', userId] as const,
    passwordPolicy: (tenantId: string) => ['settings', 'password-policy', tenantId] as const,
    sessionPolicy: (tenantId: string) => ['settings', 'session-policy', tenantId] as const,
    mfaPolicy: (tenantId: string) => ['settings', 'mfa-policy', tenantId] as const,
    loginPolicy: (tenantId: string) => ['settings', 'login-policy', tenantId] as const,
    modules: (tenantId: string) => ['settings', 'modules', tenantId] as const,
    integrations: (tenantId: string) => ['settings', 'integrations', tenantId] as const,
    validationWorkflows: (tenantId: string) => ['settings', 'validation-workflows', tenantId] as const,
    validationWorkflow: (id: string) => ['settings', 'validation-workflows', 'detail', id] as const,
    validationWorkflowVersions: (tenantId: string, code: string) => ['settings', 'validation-workflows', 'versions', tenantId, code] as const,
  },
} as const;
