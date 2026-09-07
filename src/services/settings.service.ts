import { mockRequest } from './api-client';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';
import { localizationSettingsList } from '@/mocks/settings/localization-settings';
import { fiscalYears, type FiscalYear } from '@/mocks/settings/fiscal-years';
import { isValidMeetingScheduleConfig, type MeetingScheduleConfig } from '@/mocks/settings/meeting-schedule';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { currentUser } from '@/mocks/rbac.mocks';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { workflowService } from './workflow.service';
import { notificationChannels, notificationRules, notificationPreferences, type NotificationRuleTrigger } from '@/mocks/settings/notification-settings';
import { passwordPolicies, sessionPolicies, mfaPolicies, loginPolicies, type PasswordPolicy, type SessionPolicy, type MfaPolicy, type LoginPolicy } from '@/mocks/settings/security-policies';
import { moduleConfigs, type ModuleKey } from '@/mocks/settings/modules';
import { integrations } from '@/mocks/settings/integrations';

export type CreateFiscalYearInput = {
  label: string;
  startDate: string;
  endDate: string;
  /**
   * Ids des catégories de `fiscalYearTransferCategories` cochées par
   * l'utilisateur à l'étape 2/2 (mandat "REOPEN APPROVAL + TRANSFER
   * SELECTION CORRECTION"). Optionnel — aucune sélection n'est requise
   * (§7 du mandat : « aucune sélection implicite »). N'entraîne AUCUNE
   * mutation de données : les seules catégories aujourd'hui transférables
   * (`transferability: 'TRANSFERABLE'`) sont déjà permanentes/tenant-scopées
   * et n'ont donc rien à copier — cocher/décocher leur case ne fait que
   * tracer l'intention de l'utilisateur dans l'événement d'audit
   * `fiscalYears.create` (voir `recordFiscalYearAudit` ci-dessous), jamais
   * une opération de copie réelle. Documenté explicitement pour qu'aucun
   * développeur futur ne suppose un effet de bord inexistant.
   */
  transferSelections?: string[];
  /**
   * Calendrier des réunions de l'exercice (mandat « RÈGLE CENTRALE — DATES DE
   * RÉUNION » §2/§3). Optionnel à la création — un exercice peut être créé sans
   * calendrier puis configuré ensuite (`updateFiscalYearMeetingSchedule`).
   * Ignoré s'il est structurellement incomplet.
   */
  meetingSchedule?: MeetingScheduleConfig;
};

/**
 * D-FY-06 (VALIDÉE, Option C) : point d'entrée UNIQUE des écritures d'audit
 * Fiscal Year — pousse directement dans `auditEvents`
 * (`src/mocks/audit/audit-events.ts`), le tableau canonique déjà utilisé pour
 * tous les autres modules (cf. son commentaire d'en-tête : « Aucun autre
 * module ne doit créer son propre tableau d'événements d'audit »). Aucun
 * système d'audit parallèle n'est créé — même pattern de mutation en mémoire
 * que `fiscalYears`/`tontines`/etc. `performedBy`/`performedAt` (vocabulaire
 * du mandat) correspondent aux champs déjà existants `actorId`/`actorName`
 * et `timestamp` de `AuditEvent` ; `fromStatus`/`toStatus` correspondent à
 * `before.status`/`after.status`. Aucun champ n'est inventé sur `AuditEvent`
 * lui-même.
 */
function recordFiscalYearAudit(params: { tenantId: string; action: string; year: FiscalYear; before?: Record<string, string | number>; after?: Record<string, string | number>; context?: Record<string, string | number>; sensitive: boolean }) {
  const event: AuditEvent = {
    id: `AUD-FY-${Date.now()}`,
    tenantId: params.tenantId,
    timestamp: new Date().toISOString(),
    actorId: currentUser.id,
    actorName: currentUser.name,
    module: 'settings',
    action: params.action,
    eventType: 'action',
    resourceType: 'fiscalYear',
    resourceId: params.year.id,
    resourceLabel: params.year.label,
    status: 'success',
    sensitive: params.sensitive,
    correlationId: params.year.id,
    ...(params.before ? { before: params.before } : {}),
    ...(params.after ? { after: params.after } : {}),
    ...(params.context ? { context: params.context } : {}),
  };
  auditEvents.push(event);
}

export const settingsService = {
  getOrganizationSettings: (tenantId: string) => mockRequest(() => organizationSettingsList.find((item) => item.tenantId === tenantId)),
  updateOrganizationSettings: (tenantId: string, patch: { timezone: string; currency: string }) =>
    mockRequest(() => {
      const settings = organizationSettingsList.find((item) => item.tenantId === tenantId);
      if (!settings) return undefined;
      Object.assign(settings, patch);
      return settings;
    }),

  getLocalizationSettings: (tenantId: string) => mockRequest(() => localizationSettingsList.find((item) => item.tenantId === tenantId)),
  updateLocalizationSettings: (tenantId: string, patch: Partial<Omit<(typeof localizationSettingsList)[number], 'tenantId'>>) =>
    mockRequest(() => {
      const settings = localizationSettingsList.find((item) => item.tenantId === tenantId);
      if (!settings) return undefined;
      Object.assign(settings, patch);
      return settings;
    }),

  listFiscalYears: (tenantId: string) => mockRequest(() => fiscalYears.filter((year) => year.tenantId === tenantId).sort((a, b) => b.startDate.localeCompare(a.startDate))),
  getCurrentFiscalYear: (tenantId: string) => mockRequest(() => fiscalYears.find((year) => year.tenantId === tenantId && year.isCurrent)),

  /**
   * D-FY-01 (IMPLEMENTATION GO) : crée réellement un nouvel exercice, toujours
   * `status: 'upcoming'` — cohérent avec le cycle de vie déjà en place
   * (`openFiscalYear` n'active qu'un exercice `upcoming`, jamais changé ici).
   * CREATE ≠ CLOSE ≠ OPEN : ne touche à aucun autre exercice du tenant, ne
   * copie aucune donnée métier d'un exercice existant (D-FY-01, hors
   * périmètre — cf. mandat §24).
   *
   * Validations volontairement limitées aux incohérences temporelles
   * « évidentes » (mandat §11 point 4) — aucune règle de chevauchement
   * partiel n'est inventée (signalé TECHNICAL DETAIL REQUIRED par
   * `docs/P1_GLOBAL_FISCAL_YEAR_DECISION_GATE_CLOSURE.md` §5) :
   * - `endDate` doit être strictement postérieure à `startDate` ;
   * - pas de doublon exact (même `label`, ou même couple `startDate`/`endDate`) pour ce tenant.
   */
  createFiscalYear: (tenantId: string, input: CreateFiscalYearInput) =>
    mockRequest(() => {
      const label = input.label.trim();
      if (!label || !input.startDate || !input.endDate) return undefined;
      if (new Date(input.endDate) <= new Date(input.startDate)) return undefined;
      const tenantYears = fiscalYears.filter((item) => item.tenantId === tenantId);
      const duplicate = tenantYears.some((item) => item.label === label || (item.startDate === input.startDate && item.endDate === input.endDate));
      if (duplicate) return undefined;
      const meetingSchedule = isValidMeetingScheduleConfig(input.meetingSchedule) ? input.meetingSchedule : undefined;
      const year: FiscalYear = { id: `FY-${tenantId}-${Date.now()}`, tenantId, label, startDate: input.startDate, endDate: input.endDate, status: 'upcoming', isCurrent: false, createdAt: new Date().toISOString().slice(0, 10), meetingSchedule };
      fiscalYears.push(year);
      recordFiscalYearAudit({ tenantId, action: 'fiscalYears.create', year, after: { status: year.status }, context: { transferSelections: (input.transferSelections ?? []).join(','), meetingFrequency: meetingSchedule?.frequency ?? '' }, sensitive: false });
      return year;
    }),

  /**
   * Configure / met à jour le calendrier des réunions d'un exercice (mandat
   * « RÈGLE CENTRALE — DATES DE RÉUNION » §2). Autorisé tant que l'exercice
   * n'est pas `closed` (un exercice clôturé est verrouillé, cohérent avec le
   * cycle de vie). `config = null` retire le calendrier. Régénère implicitement
   * les occurrences (dérivées) — aucune donnée de réunion n'est stockée.
   */
  updateFiscalYearMeetingSchedule: (tenantId: string, fiscalYearId: string, config: MeetingScheduleConfig | null) =>
    mockRequest(() => {
      const year = fiscalYears.find((item) => item.id === fiscalYearId && item.tenantId === tenantId);
      if (!year || year.status === 'closed') return undefined;
      if (config !== null && !isValidMeetingScheduleConfig(config)) return undefined;
      const before = year.meetingSchedule?.frequency ?? '';
      year.meetingSchedule = config ?? undefined;
      recordFiscalYearAudit({ tenantId, action: 'fiscalYears.meetingScheduleUpdated', year, before: { meetingFrequency: before }, after: { meetingFrequency: year.meetingSchedule?.frequency ?? '' }, sensitive: false });
      return year;
    }),

  /** Clôture uniquement l'exercice courant (open, isCurrent) — n'ouvre jamais automatiquement le suivant, aucune règle de succession inventée. */
  closeCurrentFiscalYear: (tenantId: string) =>
    mockRequest(() => {
      const year = fiscalYears.find((item) => item.tenantId === tenantId && item.isCurrent);
      if (!year || year.status !== 'open') return undefined;
      const fromStatus = year.status;
      year.status = 'closed';
      year.isCurrent = false;
      recordFiscalYearAudit({ tenantId, action: 'fiscalYears.close', year, before: { status: fromStatus, isCurrent: 1 }, after: { status: year.status, isCurrent: 0 }, sensitive: true });
      return year;
    }),
  /** Ouvre un exercice `upcoming` explicitement choisi — l'administrateur décide, jamais une cascade automatique de statut. `isCurrent` reste néanmoins un invariant à un seul exercice par tenant (jamais deux exercices courants simultanés), donc l'ancien exercice courant perd `isCurrent` ici — son `status` n'est pas touché (D-FY-03, VALIDÉE). */
  openFiscalYear: (tenantId: string, fiscalYearId: string) =>
    mockRequest(() => {
      const year = fiscalYears.find((item) => item.id === fiscalYearId && item.tenantId === tenantId);
      if (!year || year.status !== 'upcoming') return undefined;
      const previousCurrent = fiscalYears.find((item) => item.tenantId === tenantId && item.isCurrent);
      if (previousCurrent) previousCurrent.isCurrent = false;
      const fromStatus = year.status;
      year.status = 'open';
      year.isCurrent = true;
      recordFiscalYearAudit({ tenantId, action: 'fiscalYears.open', year, before: { status: fromStatus, isCurrent: 0 }, after: { status: year.status, isCurrent: 1 }, sensitive: false });
      return year;
    }),

  /**
   * §24-BIS (évolution de gouvernance) : la réouverture n'est plus une action
   * directe — remplacé par un workflow demande → approbation, réutilisant le
   * moteur `workflowService`/`WorkflowRequest` déjà existant (`WD-005`), pas
   * un second système d'approbation. Crée une `WorkflowRequest` (statut
   * `pending`) ; ne modifie PAS `FiscalYear.status` — celui-ci ne change
   * qu'après approbation effective, via `applyFiscalYearReopenDecision`
   * (appelée depuis `WorkflowDetail`, `src/features/operations/operations-module.tsx`).
   * Un seul refus/doublon possible à la fois par exercice (garde `alreadyPending`).
   */
  requestFiscalYearReopen: async (tenantId: string, fiscalYearId: string, justification: string) => {
    const trimmed = justification.trim();
    if (!trimmed) return null;
    const year = fiscalYears.find((item) => item.id === fiscalYearId && item.tenantId === tenantId);
    if (!year || year.status !== 'closed') return null;
    const alreadyPending = workflowRequests.some((request) => request.tenantId === tenantId && request.domain === 'settings' && request.entityType === 'fiscalYear' && request.entityId === fiscalYearId && (request.status === 'pending' || request.status === 'inProgress'));
    if (alreadyPending) return null;
    const request = await workflowService.createRequest(tenantId, 'WD-005', { entityId: year.id, entityLabel: year.label, requestedBy: currentUser.name, requestedByUserId: currentUser.id, justification: trimmed });
    if (!request) return null;
    recordFiscalYearAudit({ tenantId, action: 'fiscalYears.reopenRequested', year, context: { requestId: request.id, justification: trimmed }, sensitive: true });
    return request;
  },

  /** Requêtes de réouverture (tous statuts) pour ce tenant — sert à afficher le badge « Réouverture en attente » sur l'historique des exercices (§15 du mandat). */
  listReopenRequests: (tenantId: string) => mockRequest(() => workflowRequests.filter((request) => request.tenantId === tenantId && request.domain === 'settings' && request.entityType === 'fiscalYear')),

  /**
   * D-FY-08 (VALIDÉE, Option B) : point d'entrée UNIQUE pour approuver/rejeter
   * une demande de réouverture d'exercice fiscal — appelé par `WorkflowDetail`
   * (`operations-module.tsx`) À LA PLACE de `workflowService.submitAction`
   * pour ce domaine précis, jamais l'inverse (le moteur workflow générique
   * reste agnostique). Contrôle l'auto-approbation AVANT toute mutation :
   * `requestedByUserId === actorId` bloque l'action et ne touche à rien —
   * ni la `WorkflowRequest`, ni le `FiscalYear`, ni l'audit. Ce contrôle est
   * indispensable ici précisément parce que role-admin détient à la fois
   * `fiscalYears.manage` et `fiscalYears.approve` (§7 du mandat) : le RBAC
   * seul ne peut pas empêcher un même utilisateur d'agir aux deux étapes,
   * donc la séparation demandeur/approbateur est appliquée par cette
   * fonction, pas par une permission.
   *
   * Scope volontairement restreint aux demandes `domain: 'settings'` +
   * `entityType: 'fiscalYear'` (retourne `null` sinon) — n'impose aucune
   * règle d'auto-approbation aux autres domaines (Credit/Tontines/
   * Governance/Finance), qui n'ont fait l'objet d'aucune décision PO en ce
   * sens et dont le comportement doit rester strictement inchangé.
   */
  decideFiscalYearReopen: async (tenantId: string, requestId: string, action: 'approve' | 'reject', actorId: string, actorName: string, comment?: string): Promise<WorkflowRequest | null> => {
    const request = await workflowService.getRequest(tenantId, requestId);
    if (!request || request.domain !== 'settings' || request.entityType !== 'fiscalYear') return null;
    if (request.requestedByUserId && request.requestedByUserId === actorId) return null;
    // Capturé AVANT submitAction : `submitAction` est déjà idempotent (ne mute rien si l'étape
    // n'est plus 'pending'), mais renvoie quand même la requête inchangée — sans ce drapeau, un
    // second appel sur une demande déjà tranchée réenregistrerait un événement d'audit en double.
    const wasActionable = request.status === 'pending' || request.status === 'inProgress';
    const result = await workflowService.submitAction(tenantId, requestId, action, actorName, comment, actorId);
    if (!result) return null;
    if (wasActionable) {
      const year = fiscalYears.find((item) => item.id === result.entityId && item.tenantId === tenantId);
      if (year) {
        if (action === 'approve' && result.status === 'approved') {
          recordFiscalYearAudit({ tenantId, action: 'fiscalYears.reopenApproved', year, context: { requestId: result.id }, sensitive: true });
        } else if (action === 'reject' && result.status === 'rejected') {
          recordFiscalYearAudit({ tenantId, action: 'fiscalYears.reopenRejected', year, context: { requestId: result.id, comment: comment ?? '' }, sensitive: true });
        }
      }
    }
    settingsService.applyFiscalYearReopenDecision(tenantId, result);
    return result;
  },

  /**
   * Point d'entrée du SEUL effet de bord propre à Fiscal Year après une
   * décision prise sur une `WorkflowRequest` via le moteur générique
   * (`workflowService.submitAction`, appelé depuis `WorkflowDetail`). Le
   * moteur workflow lui-même reste totalement agnostique du domaine — cette
   * fonction est appelée par l'écran d'approbation générique (Operations),
   * pas l'inverse, pour éviter toute dépendance de `workflow.service.ts` vers
   * `settings.service.ts`.
   *
   * Précision verrouillée (§8 mandat IMPLEMENTATION GO, réaffirmée §10 §24-BIS) :
   * `isCurrent` n'est JAMAIS modifié ici, dans aucun cas. Devenir `CURRENT`
   * reste une opération strictement distincte (`openFiscalYear`).
   */
  applyFiscalYearReopenDecision: (tenantId: string, request: WorkflowRequest) => {
    if (request.domain !== 'settings' || request.entityType !== 'fiscalYear') return;
    const year = fiscalYears.find((item) => item.id === request.entityId && item.tenantId === tenantId);
    if (!year) return;
    if (request.status === 'approved' && year.status === 'closed') {
      year.status = 'open';
      recordFiscalYearAudit({ tenantId, action: 'fiscalYears.reopened', year, before: { status: 'closed' }, after: { status: 'open' }, context: { requestId: request.id }, sensitive: true });
    }
    // 'rejected'/'returned'/'cancelled' : FiscalYear reste inchangé (toujours 'closed') — la décision elle-même
    // (qui, quand, commentaire) est déjà tracée génériquement par workflowService.listHistory (déjà réutilisé,
    // pas dupliqué ici).
  },

  listNotificationChannels: (tenantId: string) => mockRequest(() => notificationChannels.filter((channel) => channel.tenantId === tenantId)),
  updateNotificationChannel: (tenantId: string, channelId: string, enabled: boolean) =>
    mockRequest(() => {
      const channel = notificationChannels.find((item) => item.id === channelId && item.tenantId === tenantId);
      if (!channel) return undefined;
      channel.enabled = enabled;
      return channel;
    }),
  listNotificationRules: (tenantId: string) => mockRequest(() => notificationRules.filter((rule) => rule.tenantId === tenantId)),
  updateNotificationRule: (tenantId: string, ruleId: string, enabled: boolean) =>
    mockRequest(() => {
      const rule = notificationRules.find((item) => item.id === ruleId && item.tenantId === tenantId);
      if (!rule) return undefined;
      rule.enabled = enabled;
      return rule;
    }),
  listNotificationPreferences: (userId: string) => mockRequest(() => notificationPreferences.filter((preference) => preference.userId === userId)),
  getNotificationPreference: (userId: string, trigger: NotificationRuleTrigger) => mockRequest(() => notificationPreferences.find((preference) => preference.userId === userId && preference.trigger === trigger)),
  updateNotificationPreference: (userId: string, trigger: NotificationRuleTrigger, patch: Partial<Pick<(typeof notificationPreferences)[number], 'email' | 'push' | 'inApp'>>) =>
    mockRequest(() => {
      const preference = notificationPreferences.find((item) => item.userId === userId && item.trigger === trigger);
      if (!preference) return undefined;
      Object.assign(preference, patch);
      return preference;
    }),

  getPasswordPolicy: (tenantId: string) => mockRequest(() => passwordPolicies.find((policy) => policy.tenantId === tenantId)),
  getSessionPolicy: (tenantId: string) => mockRequest(() => sessionPolicies.find((policy) => policy.tenantId === tenantId)),
  getMfaPolicy: (tenantId: string) => mockRequest(() => mfaPolicies.find((policy) => policy.tenantId === tenantId)),
  getLoginPolicy: (tenantId: string) => mockRequest(() => loginPolicies.find((policy) => policy.tenantId === tenantId)),
  updateSecurityPolicies: (tenantId: string, patch: { password: Omit<PasswordPolicy, 'tenantId'>; session: Omit<SessionPolicy, 'tenantId'>; mfa: Omit<MfaPolicy, 'tenantId'>; login: Omit<LoginPolicy, 'tenantId'> }) =>
    mockRequest(() => {
      const password = passwordPolicies.find((item) => item.tenantId === tenantId);
      const session = sessionPolicies.find((item) => item.tenantId === tenantId);
      const mfa = mfaPolicies.find((item) => item.tenantId === tenantId);
      const login = loginPolicies.find((item) => item.tenantId === tenantId);
      if (!password || !session || !mfa || !login) return undefined;
      Object.assign(password, patch.password);
      Object.assign(session, patch.session);
      Object.assign(mfa, patch.mfa);
      Object.assign(login, patch.login);
      return { password, session, mfa, login };
    }),

  listModules: (tenantId: string) => mockRequest(() => moduleConfigs.filter((module_) => module_.tenantId === tenantId)),
  updateModule: (tenantId: string, key: ModuleKey, enabled: boolean) =>
    mockRequest(() => {
      const module_ = moduleConfigs.find((item) => item.key === key && item.tenantId === tenantId);
      if (!module_) return undefined;
      module_.enabled = enabled;
      return module_;
    }),
  listIntegrations: (tenantId: string) => mockRequest(() => integrations.filter((integration) => integration.tenantId === tenantId)),
};
