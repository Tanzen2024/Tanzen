import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Ban, BellRing, Check, CheckCircle2, ClipboardList, CreditCard, Download, Eye, FileText, Filter, Image, Inbox, Landmark, Megaphone, Paperclip, Plus, Repeat, RotateCcw, Scale, Settings as SettingsIcon, Sparkles, Trash2, Upload, UserCog, Users2, Workflow, X, XCircle } from 'lucide-react';
import { Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, FormSection, StatCard, MoneyDisplay, DateDisplay, PermissionGate, DetailPanel, ConfirmDialog, TableSkeleton, DetailSkeleton, ErrorState, MemberAvatar } from '@/components';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { workflowService, type ApprovalAction } from '@/services/workflow.service';
import { notificationService } from '@/services/notification.service';
import { documentService, type DocumentInput } from '@/services/document.service';
import { organizationService } from '@/services/organization.service';
import { creditService } from '@/services/credit.service';
import { financeService } from '@/services/finance.service';
import { loanRuleService } from '@/services/loan-rule.service';
import { fiscalSessionService } from '@/services/fiscal-session.service';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { ApprovalTimeline } from './components/approval-timeline';
import { useWorkflowDecision } from './use-workflow-decision';
import { sortRequestsNewestFirst } from './sort-workflow-requests';
import type { WorkflowDefinition, WorkflowDomain } from '@/mocks/operations/workflow-definitions';
import type { WorkflowRequest, WorkflowStatus } from '@/mocks/operations/workflow-requests';
import type { WorkflowDelegation } from '@/mocks/operations/delegations';
import type { Notification, NotificationPriority } from '@/mocks/operations/notifications';
import type { DocumentRecord, DocumentCategory, DocumentEntityType } from '@/mocks/operations/documents';
import type { TableColumn, StatusTone } from '@/types/ui';
import { formatDate, formatNumber } from '@/lib/utils';
import { INTEREST_PERIOD } from '@/lib/finance';
import { formatCurrency } from '@/constants/currencies';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';

type T = (section: 'operations' | 'nav' | 'finance', key: string, values?: Record<string, string>) => string;

const REQUEST_STATUS_TONE: Record<WorkflowStatus, StatusTone> = { pending: 'warning', inProgress: 'info', approved: 'success', rejected: 'error', returned: 'warning', cancelled: 'default' };
const REQUEST_STATUS_KEY: Record<WorkflowStatus, string> = { pending: 'statusPending', inProgress: 'statusInProgress', approved: 'statusApproved', rejected: 'statusRejected', returned: 'statusReturned', cancelled: 'statusCancelled' };
const DOMAIN_KEY: Record<WorkflowDomain, string> = { credit: 'domainCredit', tontines: 'domainTontines', governance: 'domainGovernance', finance: 'domainFinance', settings: 'domainSettings', organization: 'domainOrganization' };
const DOMAIN_ICON: Record<WorkflowDomain, typeof CreditCard> = { credit: CreditCard, tontines: Sparkles, governance: Scale, finance: Landmark, settings: SettingsIcon, organization: UserCog };
const ENTITY_KEY: Record<WorkflowRequest['entityType'], string> = { application: 'entityApplication', loan: 'entityLoan', assembly: 'entityAssembly', distribution: 'entityDistribution', fiscalYear: 'entityFiscalYear', beneficiaryPermutation: 'entityBeneficiaryPermutation', member: 'entityMember', creditRule: 'entityCreditRule' };
/** Libellés des champs d'un ChangeSet Membre (besoin §20, tableau avant/après) — réutilise le vocabulaire déjà établi par `organization-module.tsx` (`PersonalTab`) plutôt que d'en inventer un second, sous forme de clés `operations` locales (le `T` de ce module reste borné à `'operations' | 'nav'`, pas d'accès direct à la section `organization`). */
const MEMBER_CHANGE_FIELD_KEY: Record<string, string> = { firstName: 'changeFieldFirstName', lastName: 'changeFieldLastName', gender: 'changeFieldGender', email: 'changeFieldEmail', phone: 'changeFieldPhone', occupation: 'changeFieldOccupation', nationality: 'changeFieldNationality', address: 'changeFieldAddress', status: 'changeFieldStatus', matricule: 'changeFieldMatricule' };
/** Libellés des champs d'un ChangeSet de RÈGLE DE CRÉDIT (double approbation WD-009). */
const CREDIT_RULE_CHANGE_FIELD_KEY: Record<string, string> = { name: 'ruleFieldName', allowLoans: 'ruleFieldAllowLoans', loanMode: 'ruleFieldLoanMode', minAmount: 'ruleFieldMinAmount', maxAmount: 'ruleFieldMaxAmount', interestRate: 'ruleFieldInterestRate', interestPeriod: 'ruleFieldInterestPeriod', durationMonths: 'ruleFieldDurationMonths', penaltyEnabled: 'ruleFieldPenaltyEnabled', penaltyType: 'ruleFieldPenaltyType', penaltyValue: 'ruleFieldPenaltyValue', maxActiveLoans: 'ruleFieldMaxActiveLoans', maxLoanExposure: 'ruleFieldMaxLoanExposure', requiresGuarantor: 'ruleFieldRequiresGuarantor', minGuarantors: 'ruleFieldMinGuarantors', maxGuarantors: 'ruleFieldMaxGuarantors', guaranteeTypeRequired: 'ruleFieldGuaranteeType', guaranteeRatio: 'ruleFieldGuaranteeRatio', allowSelfGuarantee: 'ruleFieldAllowSelfGuarantee', requiresApproval: 'ruleFieldRequiresApproval', approvalLevel: 'ruleFieldApprovalLevel' };
const PRIORITY_TONE: Record<NotificationPriority, StatusTone> = { high: 'error', medium: 'warning', low: 'info' };
const PRIORITY_KEY: Record<NotificationPriority, string> = { high: 'priorityHigh', medium: 'priorityMedium', low: 'priorityLow' };
const CATEGORY_KEY: Record<DocumentCategory, string> = { idDocument: 'categoryIdDocument', contract: 'categoryContract', statement: 'categoryStatement', minutes: 'categoryMinutes', report: 'categoryReport', other: 'categoryOther' };
/** `cycle` (historique, mandat « suppression complète de la logique Cycle/Tour ») n'apparaît plus dans `CREATABLE_ENTITY_TYPES` — plus aucun nouveau document ne peut y être rattaché — mais reste ici pour libeller correctement les documents déjà existants qui le référencent (DOC-004/DOC-011/DOC-013). */
const ENTITY_TYPE_KEY: Record<DocumentEntityType, string> = { member: 'entityMember', loan: 'entityLoan', tontine: 'entityTontine', cycle: 'entityCycle', assembly: 'entityAssembly' };
const CREATABLE_ENTITY_TYPES: Exclude<DocumentEntityType, 'cycle'>[] = ['member', 'loan', 'tontine', 'assembly'];

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="OPERATIONS" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }
function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Landmark }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }
/** Mandat « Refonte module Finances » : les écrans Demandes/Prêts dédiés n'existent plus — toute opération financière (dont un prêt) vit dans le journal central. Une demande liée à une entité `application`/`loan` renvoie donc vers `/finance/transactions`. */
function entityLink(request: WorkflowRequest) { return request.entityType === 'application' || request.entityType === 'loan' ? '/finance/transactions' : null; }

// ----------------------------------------------------------------------- Workflows

function DefinitionsTab({ t, definitions }: { t: T; definitions: WorkflowDefinition[] }) {
  const columns: TableColumn<WorkflowDefinition>[] = [
    { key: 'name', header: t('operations', 'name'), render: (row) => { const Icon = DOMAIN_ICON[row.domain]; return <span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={16} /></span><span className="font-semibold">{row.name}</span></span>; } },
    { key: 'domain', header: t('operations', 'domain'), render: (row) => t('operations', DOMAIN_KEY[row.domain]) },
    { key: 'steps', header: t('operations', 'steps'), render: (row) => formatNumber(row.steps.length) },
    { key: 'active', header: t('operations', 'status'), render: (row) => <StatusBadge label={row.active ? t('operations', 'delegationActive') : t('operations', 'delegationInactive')} tone={row.active ? 'success' : 'default'} /> },
  ];
  return <DataTable columns={columns} rows={definitions} empty={<EmptyState icon={Workflow} title={t('operations', 'noDefinitions')} />} />;
}

type MyApprovalAction = 'reject' | 'return' | 'approve';
const MY_APPROVAL_CONFIRM: Record<MyApprovalAction, { title: string; message: string; confirm: string }> = {
  approve: { title: 'confirmApproveTitle', message: 'confirmApproveMessage', confirm: 'myApprovalApprove' },
  return: { title: 'confirmReturnTitle', message: 'confirmReturnMessage', confirm: 'myApprovalReturn' },
  reject: { title: 'confirmRejectTitle', message: 'confirmRejectMessage', confirm: 'myApprovalReject' },
};
const isLoanApplicationRequest = (request: WorkflowRequest) => request.domain === 'credit' && request.entityType === 'application';

/** `onDecide` (onglet « Mes approbations ») : Rejeter / Renvoyer / Approuver — chacun ouvre UNE confirmation simple, puis la décision est exécutée sur place (aucune page intermédiaire, aucun commentaire). */
function RequestsTable({ t, rows, onRowClick, empty, onDecide }: { t: T; rows: WorkflowRequest[]; onRowClick: (id: string) => void; empty: ReactNode; onDecide?: (request: WorkflowRequest, action: MyApprovalAction) => void }) {
  const columns: TableColumn<WorkflowRequest>[] = [
    { key: 'entity', header: t('operations', 'entity'), render: (row) => <button type="button" onClick={() => onRowClick(row.id)} className="text-left"><span className="block font-medium">{row.entityLabel}</span><span className="block text-xs text-muted-foreground">{t('operations', ENTITY_KEY[row.entityType])}</span></button> },
    { key: 'domain', header: t('operations', 'domain'), render: (row) => { const Icon = DOMAIN_ICON[row.domain]; return <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon size={13} />{t('operations', DOMAIN_KEY[row.domain])}</span>; } },
    { key: 'requestedBy', header: t('operations', 'requestedBy') },
    { key: 'amount', header: t('operations', 'amount'), render: (row) => row.amount ? <MoneyDisplay amount={row.amount} /> : '—' },
    { key: 'currentStep', header: t('operations', 'currentStep'), render: (row) => { const step = row.steps.find((s) => s.order === row.currentStepOrder); return step ? step.name : '—'; } },
    { key: 'status', header: t('operations', 'status'), render: (row) => <StatusBadge label={t('operations', REQUEST_STATUS_KEY[row.status])} tone={REQUEST_STATUS_TONE[row.status]} /> },
    { key: 'requestedAt', header: t('operations', 'requestedAt'), render: (row) => <DateDisplay value={row.requestedAt} /> },
    ...(onDecide ? [{ key: 'decide', header: '', render: (row: WorkflowRequest) => <span className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => onDecide(row, 'reject')} aria-label={t('operations', 'rejectRequestOf', { entity: row.entityLabel })}><XCircle size={14} />{t('operations', 'myApprovalReject')}</Button>
      {/* Demande de prêt : jamais renvoyée (règle existante, contrôlée aussi par le service) — bouton présent mais inactif. */}
      <Button size="sm" variant="secondary" disabled={isLoanApplicationRequest(row)} title={isLoanApplicationRequest(row) ? t('operations', 'loanRequestCannotBeReturned') : undefined} onClick={() => onDecide(row, 'return')} aria-label={t('operations', 'returnRequestOf', { entity: row.entityLabel })}><RotateCcw size={14} />{t('operations', 'myApprovalReturn')}</Button>
      <Button size="sm" onClick={() => onDecide(row, 'approve')} aria-label={t('operations', 'approveRequestOf', { entity: row.entityLabel })}><Check size={14} />{t('operations', 'myApprovalApprove')}</Button>
    </span> } satisfies TableColumn<WorkflowRequest>] : []),
  ];
  return <DataTable columns={columns} rows={rows} empty={empty} />;
}

function DelegationsTab({ t, delegations }: { t: T; delegations: WorkflowDelegation[] }) {
  const columns: TableColumn<WorkflowDelegation>[] = [
    { key: 'fromUserName', header: t('operations', 'delegationFrom'), render: (row) => <span className="flex items-center gap-2"><Users2 size={14} className="text-muted-foreground" />{row.fromUserName}</span> },
    { key: 'toUserName', header: t('operations', 'delegationTo'), render: (row) => row.toUserName },
    { key: 'domain', header: t('operations', 'delegationDomain'), render: (row) => row.domain === 'all' ? t('operations', 'allDomains') : t('operations', DOMAIN_KEY[row.domain]) },
    { key: 'period', header: t('operations', 'delegationPeriod'), render: (row) => <span className="text-xs"><DateDisplay value={row.startDate} /> → <DateDisplay value={row.endDate} /></span> },
    { key: 'reason', header: t('operations', 'delegationReason') },
    { key: 'status', header: t('operations', 'delegationStatus'), render: (row) => <StatusBadge label={row.active ? t('operations', 'delegationActive') : t('operations', 'delegationInactive')} tone={row.active ? 'success' : 'default'} /> },
  ];
  return <><div className="mb-4 flex justify-end"><PermissionGate permission="workflows.manage"><Button variant="outline" size="sm"><Plus size={15} />{t('operations', 'createDelegation')}</Button></PermissionGate></div><DataTable columns={columns} rows={delegations} empty={<EmptyState icon={Users2} title={t('operations', 'noDelegations')} />} /></>;
}

function HistoryTab({ t, actions }: { t: T; actions: ApprovalAction[] }) {
  const columns: TableColumn<ApprovalAction>[] = [
    { key: 'date', header: t('operations', 'historyDate'), render: (row) => <DateDisplay value={row.date} /> },
    { key: 'entityLabel', header: t('operations', 'entity'), render: (row) => <span><span className="block font-medium">{row.entityLabel}</span><span className="block text-xs text-muted-foreground">{t('operations', DOMAIN_KEY[row.domain])}</span></span> },
    { key: 'stepName', header: t('operations', 'historyStep') },
    { key: 'action', header: t('operations', 'historyAction'), render: (row) => <StatusBadge label={t('operations', row.action === 'approved' ? 'stepApproved' : row.action === 'rejected' ? 'stepRejected' : 'stepReturned')} tone={row.action === 'approved' ? 'success' : row.action === 'rejected' ? 'error' : 'warning'} /> },
    { key: 'actorName', header: t('operations', 'historyActor') },
    { key: 'comment', header: t('operations', 'comment'), render: (row) => <span className="text-xs text-muted-foreground">{row.comment ?? t('operations', 'noComment')}</span> },
  ];
  return <DataTable columns={columns} rows={actions} empty={<EmptyState icon={ClipboardList} title={t('operations', 'noHistory')} />} />;
}

function WorkflowsHub({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const [search, setSearch] = useState(''); const [domain, setDomain] = useState('all'); const [status, setStatus] = useState('all');
  /** « Mes approbations » : clic → confirmation simple → exécution (aucun commentaire, aucune page intermédiaire). */
  const [decision, setDecision] = useState<{ request: WorkflowRequest; action: MyApprovalAction } | null>(null);
  const submitting = useRef(false);
  const decide = useWorkflowDecision(t, () => { submitting.current = false; setDecision(null); });
  // Verrou synchrone : un double clic avant le re-rendu (`isPending`) ne déclenche qu'UNE action métier.
  const confirmDecision = () => { if (!decision || submitting.current) return; submitting.current = true; decide.mutate({ request: decision.request, action: decision.action }); };

  const definitionsQuery = useQuery({ queryKey: queryKeys.operations.workflowDefinitions(currentTenant.id), queryFn: () => workflowService.listDefinitions(currentTenant.id) });
  const requestsQuery = useQuery({ queryKey: queryKeys.operations.workflowRequests(currentTenant.id), queryFn: () => workflowService.listRequests(currentTenant.id) });
  const myApprovalsQuery = useQuery({ queryKey: queryKeys.operations.myApprovals(currentTenant.id, user.id), queryFn: () => workflowService.listMyApprovals(currentTenant.id, user.permissions, user.id) });
  const delegationsQuery = useQuery({ queryKey: queryKeys.operations.delegations(currentTenant.id), queryFn: () => workflowService.listDelegations(currentTenant.id) });
  const historyQuery = useQuery({ queryKey: queryKeys.operations.history(currentTenant.id), queryFn: () => workflowService.listHistory(currentTenant.id) });
  const definitions = definitionsQuery.data ?? []; const requests = requestsQuery.data ?? []; const myApprovals = myApprovalsQuery.data ?? []; const delegations = delegationsQuery.data ?? []; const history = historyQuery.data ?? [];

  // Tri global (plus récente en premier) puis filtres ; pas de pagination dans cet onglet.
  const filteredRequests = sortRequestsNewestFirst(requests).filter((request) => `${request.entityLabel} ${request.id} ${request.requestedBy}`.toLowerCase().includes(search.toLowerCase()) && (domain === 'all' || request.domain === domain) && (status === 'all' || request.status === status));

  // « Mes approbations » exclue : clé propre à l'utilisateur, son 1er chargement (changement d'identité) remplacerait toute la page et ramènerait l'onglet sur « Demandes » — squelette dans son onglet.
  if (definitionsQuery.isLoading || requestsQuery.isLoading || delegationsQuery.isLoading || historyQuery.isLoading) return <Page title={t('operations', 'workflowsTitle')} description={t('operations', 'workflowsDescription')}><TableSkeleton /></Page>;
  if (definitionsQuery.isError || requestsQuery.isError || myApprovalsQuery.isError || delegationsQuery.isError || historyQuery.isError) return <Page title={t('operations', 'workflowsTitle')} description={t('operations', 'workflowsDescription')}><ErrorState onRetry={() => { definitionsQuery.refetch(); requestsQuery.refetch(); myApprovalsQuery.refetch(); delegationsQuery.refetch(); historyQuery.refetch(); }} /></Page>;

  return <Page title={t('operations', 'workflowsTitle')} description={t('operations', 'workflowsDescription')}>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label={t('operations', 'activeWorkflows')} value={formatNumber(definitions.filter((d) => d.active).length)} icon={Workflow} tone="info" />
      <StatCard label={t('operations', 'totalRequests')} value={formatNumber(requests.length)} icon={ClipboardList} tone="neutral" />
      <StatCard label={t('operations', 'pendingApprovalsCount')} value={formatNumber(myApprovals.length)} icon={CheckCircle2} tone="warning" />
    </div>
    <Tabs defaultValue="requests" className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
        <TabsTrigger value="definitions">{t('operations', 'tabDefinitions')}</TabsTrigger>
        <TabsTrigger value="requests">{t('operations', 'tabRequests')}</TabsTrigger>
        <TabsTrigger value="myApprovals">{t('operations', 'tabMyApprovals')}{myApprovals.length > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{myApprovals.length}</span>}</TabsTrigger>
        <TabsTrigger value="delegations">{t('operations', 'tabDelegations')}</TabsTrigger>
        <TabsTrigger value="history">{t('operations', 'tabHistory')}</TabsTrigger>
      </TabsList>
      <TabsContent value="definitions"><DefinitionsTab t={t} definitions={definitions} /></TabsContent>
      <TabsContent value="requests" className="space-y-4">
        <FilterBar search={search} onSearchChange={setSearch} placeholder={t('operations', 'requestId')} filters={<><select aria-label={t('operations', 'filterByDomain')} value={domain} onChange={(e) => setDomain(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('operations', 'domain')}</option><option value="credit">{t('operations', 'domainCredit')}</option><option value="tontines">{t('operations', 'domainTontines')}</option><option value="governance">{t('operations', 'domainGovernance')}</option><option value="finance">{t('operations', 'domainFinance')}</option><option value="settings">{t('operations', 'domainSettings')}</option><option value="organization">{t('operations', 'domainOrganization')}</option></select><select aria-label={t('operations', 'filterByStatus')} value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('operations', 'status')}</option><option value="pending">{t('operations', 'statusPending')}</option><option value="inProgress">{t('operations', 'statusInProgress')}</option><option value="approved">{t('operations', 'statusApproved')}</option><option value="rejected">{t('operations', 'statusRejected')}</option><option value="returned">{t('operations', 'statusReturned')}</option></select></>} />
        <RequestsTable t={t} rows={filteredRequests} onRowClick={(id) => navigate(`/operations/workflows/${id}`)} empty={<EmptyState icon={ClipboardList} title={t('operations', 'noRequests')} />} />
      </TabsContent>
      <TabsContent value="myApprovals">{myApprovalsQuery.isLoading ? <TableSkeleton /> : <RequestsTable t={t} rows={myApprovals} onRowClick={(id) => navigate(`/operations/workflows/${id}`)} onDecide={(request, action) => setDecision({ request, action })} empty={<EmptyState icon={CheckCircle2} title={t('operations', 'noApprovals')} />} />}</TabsContent>
      <TabsContent value="delegations"><DelegationsTab t={t} delegations={delegations} /></TabsContent>
      <TabsContent value="history"><HistoryTab t={t} actions={history} /></TabsContent>
    </Tabs>
    {decision && <ConfirmDialog open title={t('operations', MY_APPROVAL_CONFIRM[decision.action].title)} description={t('operations', MY_APPROVAL_CONFIRM[decision.action].message)} confirmLabel={t('operations', MY_APPROVAL_CONFIRM[decision.action].confirm)} cancelLabel={t('operations', 'cancel')} confirmDisabled={decide.isPending} onConfirm={confirmDecision} onCancel={() => { if (!decide.isPending) setDecision(null); }} />}
  </Page>;
}

/**
 * Détail d'une DEMANDE DE PRÊT soumise au workflow (mandat « Workflow d'approbation des prêts »,
 * 2026-09-27) : ce que l'approbateur doit voir pour décider — membre, montant, financement,
 * conditions de la règle de crédit, garanties, séance. Aucune donnée technique interne.
 */
function LoanRequestDetails({ t, tenantId, applicationId, money }: { t: T; tenantId: string; applicationId: string; money: (value: number) => string }) {
  const { data: application } = useQuery({ queryKey: [...queryKeys.credit.application(applicationId), tenantId], queryFn: () => creditService.getApplication(tenantId, applicationId) });
  const { data: cashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(tenantId), queryFn: () => financeService.listCashboxes(tenantId) });
  const { data: rule } = useQuery({ queryKey: queryKeys.credit.loanRules(tenantId), queryFn: () => loanRuleService.getCreditRule(tenantId) });
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.finance.sessions.all(tenantId), queryFn: () => fiscalSessionService.listAllSessions(tenantId) });
  // Pièces justificatives : documents rattachés à l'adhérent demandeur (le modèle n'en rattache aucun à la demande elle-même).
  const { data: memberDocuments = [] } = useQuery({ queryKey: [...queryKeys.operations.documents(tenantId), 'member', application?.memberId ?? ''], queryFn: () => documentService.listByEntity(tenantId, 'member', application!.memberId!), enabled: Boolean(application?.memberId) });
  if (!application) return null;
  const titleOf = (cashboxId: string) => cashboxes.find((cashbox) => cashbox.id === cashboxId)?.title ?? cashboxId;
  const session = application.sessionId ? sessions.find((item) => item.id === application.sessionId) : undefined;
  const guarantors = application.pendingGuarantors ?? [];
  const rows: [string, ReactNode][] = [
    [t('operations', 'loanMember'), application.applicant],
    [t('operations', 'amount'), money(application.requestedAmount)],
    [t('operations', 'loanFundingCashbox'), application.cashboxId ? titleOf(application.cashboxId) : '—'],
    ...(application.complementaryFunding && application.complementaryFunding.length > 0 ? [[t('operations', 'loanComplementaryFunding'), application.complementaryFunding.map((part) => `${titleOf(part.cashboxId)} ${money(part.amount)}`).join(' · ')] as [string, ReactNode]] : []),
    ...(rule ? [
      [t('operations', 'loanTerms'), `${rule.interestRate} % · ${t('finance', 'loanMode' + rule.loanMode)} · ${t('finance', 'interestPeriod' + INTEREST_PERIOD)}`] as [string, ReactNode],
      [t('finance', 'latePenalty'), !rule.penaltyEnabled || !rule.penaltyType ? t('finance', 'penaltyDisabled') : t('finance', `penaltySummary${rule.penaltyType}`, { value: rule.penaltyType === 'FIXED' ? money(rule.penaltyValue) : String(rule.penaltyValue) })] as [string, ReactNode],
      [t('operations', 'loanDuration'), t('operations', 'loanDurationMonths', { count: String(rule.durationMonths) })] as [string, ReactNode],
      [t('operations', 'loanGuarantorRequired'), t('operations', rule.requiresGuarantor ? 'yes' : 'no')] as [string, ReactNode],
    ] : []),
    ...(guarantors.length > 0 ? [[t('operations', 'loanGuarantors'), guarantors.map((item) => `${item.guarantorName} (${money(item.guaranteedAmount)})`).join(' · ')] as [string, ReactNode]] : []),
    ...(session ? [[t('operations', 'loanSession'), `#${session.sessionNumber} — ${formatDate(session.date)}`] as [string, ReactNode]] : []),
    ...(application.description ? [[t('operations', 'comment'), application.description] as [string, ReactNode]] : []),
    [t('operations', 'loanSupportingDocuments'), memberDocuments.length > 0 ? memberDocuments.map((document) => document.name).join(' · ') : t('operations', 'loanNoSupportingDocument')],
  ];
  return <Card data-testid="loan-request-details"><CardHeader><CardTitle className="text-sm">{t('operations', 'loanRequestTitle')}</CardTitle></CardHeader><CardContent className="p-5">
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
    </dl>
  </CardContent></Card>;
}

function WorkflowDetail({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const { id: requestId = '' } = useParams(); const { currentTenant } = useTenant(); const { user } = usePermissions(); const queryClient = useQueryClient(); const navigate = useNavigate();
  const currency = useOrganizationCurrency();
  const { data: request, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.operations.workflowRequest(requestId), currentTenant.id], queryFn: () => workflowService.getRequest(currentTenant.id, requestId) });
  const [searchParams] = useSearchParams();
  const presetAction = searchParams.get('action');
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'return' | 'cancel' | null>(presetAction === 'approve' || presetAction === 'reject' ? presetAction : null);
  const [comment, setComment] = useState('');

  const isFiscalYearReopen = Boolean(request && request.domain === 'settings' && request.entityType === 'fiscalYear');
  /** Mandat « Moteur générique de workflow de validation » — même pattern que `isFiscalYearReopen` ci-dessus, second domaine à contrôler l'auto-approbation explicitement (`organizationService.decideMemberUpdate`). */
  const isMemberUpdate = Boolean(request && request.domain === 'organization' && request.entityType === 'member');
  /** Mandat « Finalisation Finance/Tontines » — une demande de crédit intégralement approuvée (WD-001, 2 étapes) peut être décaissée : action distincte, jamais automatique (§12 « le décaissement doit devenir une vraie opération métier »). */
  const isApprovedCreditApplication = Boolean(request && request.domain === 'credit' && request.entityType === 'application' && request.status === 'approved');
  /** Mandat « Workflow d'approbation des prêts » (2026-09-27) : Approuver / Refuser passent par `creditService.decideLoanApplication` (droits du niveau, auto-approbation interdite), jamais directement par le moteur. */
  const isCreditApplication = Boolean(request && request.domain === 'credit' && request.entityType === 'application');
  const { data: creditApplication } = useQuery({ queryKey: [...queryKeys.credit.application(request?.entityId ?? ''), currentTenant.id], queryFn: () => creditService.getApplication(currentTenant.id, request!.entityId), enabled: isCreditApplication });
  const { data: tenantLoans = [] } = useQuery({ queryKey: queryKeys.credit.loans(currentTenant.id), queryFn: () => creditService.listLoans(currentTenant.id), enabled: isCreditApplication && creditApplication?.stage === 'stageDisbursed' });
  const disbursedLoan = creditApplication?.stage === 'stageDisbursed' ? tenantLoans.find((loan) => loan.applicationId === creditApplication.id) : undefined;
  /** Modification de la règle de crédit (double approbation) : `loanRuleService.decideLoanRuleUpdate`. */
  const isCreditRuleChange = Boolean(request && request.domain === 'credit' && request.entityType === 'creditRule');
  const openedStep = request?.steps.find((step) => step.order === request.currentStepOrder);
  const canTakeCharge = Boolean(isCreditApplication && request?.status === 'pending' && openedStep && user.permissions.includes(openedStep.approverPermission) && request.requestedByUserId !== user.id);
  // Prise en charge : un approbateur habilité qui ouvre une demande EN ATTENTE la fait passer EN COURS (statut issu d'une action, jamais choisi à la main).
  useEffect(() => {
    if (!canTakeCharge) return;
    void workflowService.openRequest(currentTenant.id, requestId, user.permissions).then((opened) => {
      if (opened?.status !== 'inProgress') return;
      creditService.applyLoanApplicationDecision(currentTenant.id, opened);
      queryClient.invalidateQueries({ queryKey: ['operations'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.credit.applications(currentTenant.id) });
    });
  }, [canTakeCharge]); // eslint-disable-line react-hooks/exhaustive-deps
  const disburseMutation = useMutation({
    mutationFn: () => creditService.disburseLoan(currentTenant.id, request!.entityId),
    onSuccess: (result) => {
      if (!result) { notify.error(t('operations', 'disbursementFailed')); return; }
      notify.success(t('operations', 'loanDisbursed'));
      // Préfixes larges : liste ET fiche de la demande, module Workflow, suivi des prêts, transactions et soldes de caisse.
      queryClient.invalidateQueries({ queryKey: ['credit', 'applications'] });
      queryClient.invalidateQueries({ queryKey: ['operations'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.credit.loans(currentTenant.id) });
      queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'cashboxes'] });
    },
  });
  /** Mandat §9 « photos partout où l'identité du bénéficiaire est affichée, y compris en validation de permutation » — écran générique, donc lecture activée seulement pour ce domaine/entityType précis (même garde que `isFiscalYearReopen` ci-dessus). */
  const isBeneficiaryPermutation = Boolean(request && request.domain === 'tontines' && request.entityType === 'beneficiaryPermutation');
  const { data: permutationPreview } = useQuery({ queryKey: ['tontines', 'permutation-preview', requestId, currentTenant.id], queryFn: () => tontineOperationsService.getPlanPermutationPreview(currentTenant.id, requestId), enabled: isBeneficiaryPermutation });

  /** Qui peut traiter l'étape en cours (permission de l'étape + séparation des tâches) : rend visible à qui la demande est affectée, y compris au demandeur qui ne la voit pas dans « Mes approbations ». */
  const { data: eligibleApprovers } = useQuery({ queryKey: ['operations', 'workflow-requests', 'eligible-approvers', requestId, currentTenant.id, request?.currentStepOrder, request?.status], queryFn: () => workflowService.listEligibleApprovers(currentTenant.id, requestId), enabled: Boolean(request) });

  /** Exécution d'une décision : hook partagé avec « Mes approbations » (services métier par domaine). */
  const mutation = useWorkflowDecision(t, () => { setPendingAction(null); setComment(''); });

  if (isLoading) return <Page title={t('operations', 'requestDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('operations', 'requestDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!request) return <NotFoundPage />;

  const currentStep = request.steps.find((step) => step.order === request.currentStepOrder);
  const canAct = Boolean(currentStep && currentStep.status === 'pending' && (request.status === 'pending' || request.status === 'inProgress'));
  const link = entityLink(request);
  const DomainIcon = DOMAIN_ICON[request.domain];

  const confirmLabels: Record<'approve' | 'reject' | 'return' | 'cancel', { title: string; confirm: string }> = {
    approve: { title: t('operations', 'approve'), confirm: t('operations', 'approve') },
    reject: { title: t('operations', 'reject'), confirm: t('operations', 'reject') },
    return: { title: t('operations', 'returnAction'), confirm: t('operations', 'returnAction') },
    cancel: { title: t('operations', 'cancelRequest'), confirm: t('operations', 'cancelRequest') },
  };

  return <Page title={request.entityLabel} description={t('operations', DOMAIN_KEY[request.domain])} actions={<><Back label={t('operations', 'backToWorkflows')} />{link && <Button variant="outline" onClick={() => navigate(link)}><DomainIcon size={15} />{t('operations', 'viewDetail')}</Button>}</>}>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <Card><CardHeader><CardTitle className="text-sm">{t('operations', 'approvalTimeline')}</CardTitle></CardHeader><CardContent className="p-5"><ApprovalTimeline request={request} t={t} /></CardContent></Card>
      <div className="space-y-5">
        {isBeneficiaryPermutation && permutationPreview && (
          <Card><CardContent className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-5">
            <div className="space-y-2 text-center"><MemberAvatar member={{ firstName: permutationPreview.a.memberName, lastName: '', photoUrl: permutationPreview.a.photoUrl }} size="lg" className="mx-auto" /><p className="text-sm font-semibold">{permutationPreview.a.memberName}</p><p className="text-xs text-muted-foreground">{t('operations', 'entityBeneficiaryPermutation')} · #{permutationPreview.a.position}</p></div>
            <Repeat className="text-muted-foreground" size={18} />
            <div className="space-y-2 text-center"><MemberAvatar member={{ firstName: permutationPreview.b.memberName, lastName: '', photoUrl: permutationPreview.b.photoUrl }} size="lg" className="mx-auto" /><p className="text-sm font-semibold">{permutationPreview.b.memberName}</p><p className="text-xs text-muted-foreground">{t('operations', 'entityBeneficiaryPermutation')} · #{permutationPreview.b.position}</p></div>
          </CardContent></Card>
        )}
        {isCreditApplication && <LoanRequestDetails t={t} tenantId={currentTenant.id} applicationId={request.entityId} money={(value) => formatCurrency(value, currency, locale)} />}
        <Card><CardHeader><CardTitle className="text-sm">{t('operations', 'requestDetail')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
          <Info label={t('operations', 'entity')} value={`${request.entityLabel} (${t('operations', ENTITY_KEY[request.entityType])})`} icon={DomainIcon} />
          <Info label={t('operations', 'requestedBy')} value={request.requestedBy} icon={Users2} />
          <Info label={t('operations', 'requestedAt')} value={formatDate(request.requestedAt)} icon={ClipboardList} />
          {currentStep && <Info label={t('operations', 'currentStep')} value={currentStep.name} icon={Workflow} />}
          {request.amount !== undefined && <Info label={t('operations', 'amount')} value={formatCurrency(request.amount, currency, locale)} icon={Landmark} />}
          {request.justification && <Info label={t('operations', 'justification')} value={request.justification} icon={FileText} />}
          {request.warnings && request.warnings.length > 0 && <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <p className="mb-1 font-semibold">{t('operations', 'reopenWarningsLabel')}</p>
            <ul className="list-inside list-disc space-y-0.5">
              {request.warnings.map((code) => <li key={code}>{t('operations', code === 'CARRY_FORWARD_APPLIED' ? 'reopenWarningCarryForwardApplied' : 'reopenWarningNextYearActive')}</li>)}
            </ul>
          </div>}
          <StatusBadge label={t('operations', REQUEST_STATUS_KEY[request.status])} tone={REQUEST_STATUS_TONE[request.status]} />
        </CardContent></Card>
        {request.versionConflict && <div className="rounded-lg border border-dashed border-red-400/60 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">{t('operations', 'versionConflictWarning')}</div>}
        {/* ChangeSet avant/après (besoin §20) — générique, rendu pour toute demande qui en porte un (aujourd'hui uniquement `member`+`update`, WD-007). */}
        {request.changeSet && request.changeSet.length > 0 && (
          <Card><CardHeader><CardTitle className="text-sm">{t('operations', 'proposedChanges')}</CardTitle></CardHeader><CardContent className="p-5">
            <table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">{t('operations', 'changeField')}</th><th className="pb-2 font-medium">{t('operations', 'changeBefore')}</th><th className="pb-2 font-medium">{t('operations', 'changeAfter')}</th></tr></thead>
              <tbody>{request.changeSet.map((item) => <tr key={item.field} className="border-b border-border/50 last:border-0"><td className="py-2 pr-3 font-medium">{t('operations', (isCreditRuleChange ? CREDIT_RULE_CHANGE_FIELD_KEY : MEMBER_CHANGE_FIELD_KEY)[item.field] ?? item.field)}</td><td className="py-2 pr-3 text-muted-foreground">{String(item.before ?? '—') || '—'}</td><td className="py-2 font-medium text-foreground">{String(item.after ?? '—') || '—'}</td></tr>)}</tbody>
            </table>
          </CardContent></Card>
        )}
        {canAct && currentStep && (() => {
          /**
           * D-FY-08 (VALIDÉE, Option B) — indication UI, PAS le contrôle réel :
           * même détenteur de `fiscalYears.approve`, le demandeur ne doit pas
           * être présenté comme pouvant approuver/rejeter sa propre demande de
           * réouverture. Le vrai blocage a déjà lieu côté service
           * (`settingsService.decideFiscalYearReopen`) — masquer les boutons
           * ici n'est qu'un confort, jamais la seule protection.
           */
          const isSelfRequest = (isFiscalYearReopen || isMemberUpdate || isCreditApplication || isCreditRuleChange) && Boolean(request.requestedByUserId) && request.requestedByUserId === user.id;
          // Double approbation : le 2e approbateur doit être différent du 1er (contrôle réel côté service).
          const alreadyApproved = isCreditRuleChange && request.steps.some((step) => step.order < currentStep.order && step.actedBy === user.id);
          const blocked = isSelfRequest || alreadyApproved;
          return (
          <Card><CardHeader><CardTitle className="text-sm">{currentStep.name}</CardTitle></CardHeader><CardContent className="space-y-3 p-5">
            <p className="text-xs text-muted-foreground">{t('operations', 'requiredPermission')}: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{currentStep.approverPermission}</code></p>
            {eligibleApprovers && <div data-testid="eligible-approvers" className="text-xs">{eligibleApprovers.length > 0 ? <><p className="text-muted-foreground">{t('operations', 'eligibleApprovers')}</p><ul className="mt-1 flex flex-wrap gap-1.5">{eligibleApprovers.map((approver) => <li key={approver.id} className="rounded-full bg-muted px-2 py-0.5 font-medium">{approver.name}</li>)}</ul></> : <p className="rounded-lg border border-dashed border-amber-300 p-2 text-amber-700 dark:text-amber-300">{t('operations', 'noEligibleApprover')}</p>}</div>}
            <PermissionGate permission={currentStep.approverPermission} entityType={request.entityType} fallback={<p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{t('operations', 'noPermission')}</p>}>
              {isSelfRequest && <p data-testid="self-approval-notice" className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{t('operations', 'cannotActOwnRequest')}</p>}
              {alreadyApproved && <p data-testid="second-approver-notice" className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{t('operations', 'cannotApproveTwice')}</p>}
              <div className="flex flex-wrap gap-2">
                {!blocked && <Button onClick={() => setPendingAction('approve')}><Check size={15} />{t('operations', 'approve')}</Button>}
                {/* Demande de prêt : seules Refuser / Approuver (une demande renvoyée ou annulée laisserait le prêt sans issue). */}
                {!isCreditApplication && <Button variant="outline" onClick={() => setPendingAction('return')}><RotateCcw size={15} />{t('operations', 'returnAction')}</Button>}
                {!blocked && <Button variant="destructive" onClick={() => setPendingAction('reject')}><XCircle size={15} />{t('operations', 'reject')}</Button>}
                {!isCreditApplication && <Button variant="outline" onClick={() => setPendingAction('cancel')}><Ban size={15} />{t('operations', 'cancelRequest')}</Button>}
              </div>
            </PermissionGate>
          </CardContent></Card>
          );
        })()}
        {isApprovedCreditApplication && creditApplication?.stage === 'stageDisbursed' && (
          <Card data-testid="loan-disbursed"><CardHeader><CardTitle className="text-sm">{t('operations', 'disbursement')}</CardTitle></CardHeader><CardContent className="space-y-3 p-5">
            <p className="text-sm">{t('operations', 'loanAlreadyDisbursed', { loan: disbursedLoan?.id ?? '—' })}</p>
            {disbursedLoan && <Button variant="outline" onClick={() => navigate(`/finance/credit/loans/${disbursedLoan.id}`)}><CreditCard size={15} />{t('operations', 'viewLoan')}</Button>}
          </CardContent></Card>
        )}
        {isApprovedCreditApplication && creditApplication?.stage === 'stageApproved' && (
          <Card><CardHeader><CardTitle className="text-sm">{t('operations', 'disbursement')}</CardTitle></CardHeader><CardContent className="space-y-3 p-5">
            <p className="text-xs text-muted-foreground">{t('operations', 'requiredPermission')}: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">loans.create</code></p>
            <PermissionGate permission="loans.create" fallback={<p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{t('operations', 'noPermission')}</p>}>
              <Button onClick={() => disburseMutation.mutate()} disabled={disburseMutation.isPending}><CreditCard size={15} />{disburseMutation.isPending ? t('operations', 'saving') : t('operations', 'disburse')}</Button>
            </PermissionGate>
          </CardContent></Card>
        )}
      </div>
    </div>
    {pendingAction && canAct && <ConfirmDialog open title={confirmLabels[pendingAction].title} description={t('operations', 'commentPlaceholder')} confirmLabel={confirmLabels[pendingAction].confirm} cancelLabel={t('operations', 'cancel')} confirmDisabled={mutation.isPending} onConfirm={() => { if (!mutation.isPending) mutation.mutate({ request, action: pendingAction, comment }); }} onCancel={() => { setPendingAction(null); setComment(''); }}>
      <Textarea className="mt-4" aria-label={t('operations', 'comment')} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t('operations', 'commentPlaceholder')} />
    </ConfirmDialog>}
  </Page>;
}

// ----------------------------------------------------------------------- Notifications

function NotificationRow({ t, notification, onRead }: { t: T; notification: Notification; onRead: (id: string) => void }) {
  return <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${notification.read ? 'border-border/60' : 'border-primary/30 bg-primary/[0.03]'}`}>
    <span aria-hidden="true" className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${notification.read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{notification.read ? <CheckCircle2 size={14} /> : <BellRing size={14} />}</span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={`text-sm ${notification.read ? 'font-medium' : 'font-semibold'}`}>{notification.title}{!notification.read && <span className="ml-2 align-middle"><StatusBadge label={t('operations', 'unreadIndicator')} tone="info" /></span>}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge label={t('operations', PRIORITY_KEY[notification.priority])} tone={PRIORITY_TONE[notification.priority]} />
          <StatusBadge label={t('operations', notification.type === 'announcement' ? 'typeAnnouncement' : `type${notification.type[0].toUpperCase()}${notification.type.slice(1)}`)} tone="default" />
        </div>
      </div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.message}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(notification.createdAt)} · {t('operations', `source${notification.source[0].toUpperCase()}${notification.source.slice(1)}`)}</p>
    </div>
    {!notification.read && <Button variant="ghost" size="sm" onClick={() => onRead(notification.id)}><Check size={14} />{t('operations', 'markAsRead')}</Button>}
  </div>;
}

function NotificationsPage({ t }: { t: T }) {
  const { currentTenant } = useTenant(); const { user } = usePermissions(); const queryClient = useQueryClient();
  const queryKey = queryKeys.operations.notifications(currentTenant.id, user.id);
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey, queryFn: () => notificationService.list(currentTenant.id, user.id) });

  const markRead = useMutation({ mutationFn: (id: string) => notificationService.markAsRead(currentTenant.id, user.id, id), onSuccess: () => queryClient.invalidateQueries({ queryKey }) });
  const markAllRead = useMutation({ mutationFn: () => notificationService.markAllAsRead(currentTenant.id, user.id), onSuccess: () => queryClient.invalidateQueries({ queryKey }) });

  const unread = items.filter((item) => !item.read);
  const important = items.filter((item) => item.priority === 'high');
  const announcements = items.filter((item) => item.type === 'announcement');

  const list = (rows: Notification[], emptyKey: string, emptyIcon: typeof Inbox, emptyDescription?: string) => rows.length
    ? <div className="space-y-3">{rows.map((row) => <NotificationRow key={row.id} t={t} notification={row} onRead={(id) => markRead.mutate(id)} />)}</div>
    : <EmptyState icon={emptyIcon} title={t('operations', emptyKey)} description={emptyDescription} />;

  if (isLoading) return <Page title={t('operations', 'notificationsTitle')} description={t('operations', 'notificationsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('operations', 'notificationsTitle')} description={t('operations', 'notificationsDescription')}><ErrorState onRetry={refetch} /></Page>;

  return <Page title={t('operations', 'notificationsTitle')} description={t('operations', 'notificationsDescription')} actions={<PermissionGate permission="notifications.manage"><Button variant="outline" disabled={unread.length === 0} onClick={() => markAllRead.mutate()}><Check size={15} />{t('operations', 'markAllAsRead')}</Button></PermissionGate>}>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label={t('operations', 'inbox')} value={formatNumber(items.length)} icon={Inbox} tone="neutral" />
      <StatCard label={t('operations', 'unread')} value={formatNumber(unread.length)} icon={BellRing} tone="warning" />
      <StatCard label={t('operations', 'important')} value={formatNumber(important.length)} icon={AlertTriangle} tone="info" />
    </div>
    <Tabs defaultValue="inbox" className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
        <TabsTrigger value="inbox">{t('operations', 'inbox')}</TabsTrigger>
        <TabsTrigger value="unread">{t('operations', 'unread')}{unread.length > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{unread.length}</span>}</TabsTrigger>
        <TabsTrigger value="important">{t('operations', 'important')}</TabsTrigger>
        <TabsTrigger value="announcements">{t('operations', 'announcements')}</TabsTrigger>
      </TabsList>
      <TabsContent value="inbox">{list(items, 'noNotifications', Inbox)}</TabsContent>
      <TabsContent value="unread">{list(unread, 'noUnread', BellRing, t('operations', 'allCaughtUp'))}</TabsContent>
      <TabsContent value="important">{list(important, 'noImportant', AlertTriangle)}</TabsContent>
      <TabsContent value="announcements">{list(announcements, 'noAnnouncements', Megaphone)}</TabsContent>
    </Tabs>
  </Page>;
}

// ----------------------------------------------------------------------- Documents

function fileIconFor(mimeType: string) { return mimeType.startsWith('image/') ? Image : FileText; }
function formatSize(sizeKb: number) { return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} Mo` : `${sizeKb} Ko`; }

function downloadDocument(document: DocumentRecord) {
  const blob = new Blob([`TANZEN Enterprise\n${document.name}\n${document.entityLabel}\nCatégorie: ${document.category}\nAjouté le ${document.uploadedAt} par ${document.uploadedBy}`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url; link.download = document.name.replace(/\.[a-z0-9]+$/i, '.txt');
  link.click();
  URL.revokeObjectURL(url);
}

function EntityPicker({ t, tenantId, entityType, entityId, onSelect }: { t: T; tenantId: string; entityType: Exclude<DocumentEntityType, 'cycle'>; entityId: string; onSelect: (entityId: string, entityLabel: string) => void }) {
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(tenantId), queryFn: () => organizationService.listMembers(tenantId), enabled: entityType === 'member' });
  const { data: loans = [] } = useQuery({ queryKey: queryKeys.credit.loans(tenantId), queryFn: () => creditService.listLoans(tenantId), enabled: entityType === 'loan' });
  const { data: tontinesList = [] } = useQuery({ queryKey: queryKeys.tontines.list(tenantId), queryFn: () => tontinesService.listTontines(tenantId), enabled: entityType === 'tontine' });
  // `assembly` (DocumentEntityType) désigne désormais un Meeting — Assembly/GeneralAssembly ne sont plus des entités autonomes (correction post-implémentation Phase 4C-4).
  const { data: assemblies = [] } = useQuery({ queryKey: queryKeys.governance.meetings(tenantId), queryFn: () => organizationService.listMeetings(tenantId), enabled: entityType === 'assembly' });
  const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

  if (entityType === 'member') return <select id="doc-upload-entity" value={entityId} onChange={(e) => { const m = members.find((item) => item.id === e.target.value); onSelect(e.target.value, m ? `${m.firstName} ${m.lastName}` : ''); }} className={selectClass}><option value="">{t('operations', 'selectEntity')}</option>{members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</select>;
  if (entityType === 'loan') return <select id="doc-upload-entity" value={entityId} onChange={(e) => { const l = loans.find((item) => item.id === e.target.value); onSelect(e.target.value, l ? `${l.borrower} · ${formatDate(l.disbursementDate)}` : ''); }} className={selectClass}><option value="">{t('operations', 'selectEntity')}</option>{loans.map((l) => <option key={l.id} value={l.id}>{l.borrower} · {formatDate(l.disbursementDate)}</option>)}</select>;
  if (entityType === 'tontine') return <select id="doc-upload-entity" value={entityId} onChange={(e) => { const item = tontinesList.find((tt) => tt.id === e.target.value); onSelect(e.target.value, item?.name ?? ''); }} className={selectClass}><option value="">{t('operations', 'selectEntity')}</option>{tontinesList.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}</select>;
  return <select id="doc-upload-entity" value={entityId} onChange={(e) => { const a = assemblies.find((item) => item.id === e.target.value); onSelect(e.target.value, a?.title ?? ''); }} className={selectClass}><option value="">{t('operations', 'selectEntity')}</option>{assemblies.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>;
}

type DocumentUploadFormValues = { file: File | null; category: DocumentCategory; entityType: Exclude<DocumentEntityType, 'cycle'>; entityId: string; entityLabel: string };

function DocumentUploadForm({ t, tenantId, values, onChange, error }: { t: T; tenantId: string; values: DocumentUploadFormValues; onChange: (patch: Partial<DocumentUploadFormValues>) => void; error?: string }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2 sm:col-span-2"><Label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs text-muted-foreground hover:border-primary/50"><Upload size={20} aria-hidden="true" /><input type="file" className="hidden" onChange={(e) => onChange({ file: e.target.files?.[0] ?? null })} /><span>{values.file ? values.file.name : t('operations', 'selectFile')}</span></Label></div>
    <div className="space-y-2"><Label htmlFor="doc-upload-type">{t('operations', 'fileType')}</Label><select id="doc-upload-type" value={values.category} onChange={(e) => onChange({ category: e.target.value as DocumentCategory })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{(Object.keys(CATEGORY_KEY) as DocumentCategory[]).map((c) => <option key={c} value={c}>{t('operations', CATEGORY_KEY[c])}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="doc-upload-entity-type">{t('operations', 'linkedTo')}</Label><select id="doc-upload-entity-type" value={values.entityType} onChange={(e) => onChange({ entityType: e.target.value as Exclude<DocumentEntityType, 'cycle'>, entityId: '', entityLabel: '' })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{CREATABLE_ENTITY_TYPES.map((et) => <option key={et} value={et}>{t('operations', ENTITY_TYPE_KEY[et])}</option>)}</select></div>
    <div className="space-y-2 sm:col-span-2"><EntityPicker t={t} tenantId={tenantId} entityType={values.entityType} entityId={values.entityId} onSelect={(id, label) => onChange({ entityId: id, entityLabel: label })} /></div>
    {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
  </div>;
}

function DocumentsPage({ t }: { t: T }) {
  const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: documents = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.operations.documents(currentTenant.id), queryFn: () => documentService.list(currentTenant.id) });
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('all'); const [entityType, setEntityType] = useState('all');
  const [preview, setPreview] = useState<DocumentRecord | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadValues, setUploadValues] = useState<DocumentUploadFormValues>({ file: null, category: 'other', entityType: 'member', entityId: '', entityLabel: '' });
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [toDelete, setToDelete] = useState<DocumentRecord | null>(null);
  const createMutation = useMockMutation<DocumentRecord, DocumentInput>({
    mutationFn: (input) => documentService.create(currentTenant.id, input),
    invalidateKeys: [queryKeys.operations.documents(currentTenant.id)],
    onSuccess: () => { notify.success(t('operations', 'documentCreated')); setUploadOpen(false); setUploadValues({ file: null, category: 'other', entityType: 'member', entityId: '', entityLabel: '' }); },
  });
  const deleteMutation = useMockMutation<DocumentRecord | undefined, string>({
    mutationFn: (documentId) => documentService.remove(currentTenant.id, documentId),
    invalidateKeys: [queryKeys.operations.documents(currentTenant.id)],
    onSuccess: () => { notify.success(t('operations', 'documentDeleted')); setToDelete(null); setPreview(null); },
  });
  const handleUpload = () => {
    if (!uploadValues.file || !uploadValues.entityId) { setUploadError(t('operations', 'fieldRequired')); return; }
    setUploadError(undefined);
    createMutation.mutate({ name: uploadValues.file.name, category: uploadValues.category, mimeType: uploadValues.file.type || 'application/octet-stream', sizeKb: Math.max(1, Math.round(uploadValues.file.size / 1024)), uploadedBy: user.name, entityType: uploadValues.entityType, entityId: uploadValues.entityId, entityLabel: uploadValues.entityLabel });
  };

  const filtered = useMemo(() => documents.filter((document) => `${document.name} ${document.entityLabel} ${document.uploadedBy}`.toLowerCase().includes(search.toLowerCase()) && (category === 'all' || document.category === category) && (entityType === 'all' || document.entityType === entityType)), [documents, search, category, entityType]);
  const recent = useMemo(() => [...filtered].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()).slice(0, 8), [filtered]);
  const shared = useMemo(() => filtered.filter((document) => document.shared), [filtered]);
  const byType = useMemo(() => {
    const groups = new Map<DocumentCategory, DocumentRecord[]>();
    filtered.forEach((document) => { groups.set(document.category, [...(groups.get(document.category) ?? []), document]); });
    return [...groups.entries()];
  }, [filtered]);

  const columns: TableColumn<DocumentRecord>[] = [
    { key: 'name', header: t('operations', 'fileName'), render: (row) => { const Icon = fileIconFor(row.mimeType); return <button type="button" onClick={() => setPreview(row)} className="flex items-center gap-3 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={16} /></span><span className="min-w-0"><span title={row.name} className="block max-w-[220px] truncate font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{row.entityLabel}</span></span></button>; } },
    { key: 'category', header: t('operations', 'fileType'), render: (row) => <StatusBadge label={t('operations', CATEGORY_KEY[row.category])} tone="default" /> },
    { key: 'entityType', header: t('operations', 'linkedTo'), render: (row) => t('operations', ENTITY_TYPE_KEY[row.entityType]) },
    { key: 'sizeKb', header: t('operations', 'fileSize'), render: (row) => formatSize(row.sizeKb) },
    { key: 'uploadedAt', header: t('operations', 'uploadedAt'), render: (row) => <DateDisplay value={row.uploadedAt} /> },
    { key: 'shared', header: t('operations', 'shared'), render: (row) => row.shared ? <StatusBadge label={t('operations', 'shared')} tone="info" /> : <span className="text-muted-foreground">—</span> },
    { key: 'actions', header: '', className: 'w-28', render: (row) => <div className="flex gap-1"><button type="button" onClick={() => setPreview(row)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={t('operations', 'preview')}><Eye size={15} /></button><button type="button" onClick={() => downloadDocument(row)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={t('operations', 'download')}><Download size={15} /></button><PermissionGate permission="documents.delete"><button type="button" onClick={() => setToDelete(row)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t('operations', 'deleteDocument')}><Trash2 size={15} /></button></PermissionGate></div> },
  ];

  if (isLoading) return <Page title={t('operations', 'documentsTitle')} description={t('operations', 'documentsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('operations', 'documentsTitle')} description={t('operations', 'documentsDescription')}><ErrorState onRetry={refetch} /></Page>;

  return <Page title={t('operations', 'documentsTitle')} description={t('operations', 'documentsDescription')} actions={<PermissionGate permission="documents.create"><Button onClick={() => setUploadOpen(true)}><Upload size={15} />{t('operations', 'uploadDocument')}</Button></PermissionGate>}>
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('operations', 'searchDocument')} filters={<><select aria-label={t('operations', 'filterByCategory')} value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('operations', 'filterByCategory')}</option>{(Object.keys(CATEGORY_KEY) as DocumentCategory[]).map((c) => <option key={c} value={c}>{t('operations', CATEGORY_KEY[c])}</option>)}</select><select aria-label={t('operations', 'filterByEntity')} value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('operations', 'allEntities')}</option>{(Object.keys(ENTITY_TYPE_KEY) as DocumentEntityType[]).map((e2) => <option key={e2} value={e2}>{t('operations', ENTITY_TYPE_KEY[e2])}</option>)}</select></>} />
    <Tabs defaultValue="all" className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
        <TabsTrigger value="all">{t('operations', 'allDocuments')}</TabsTrigger>
        <TabsTrigger value="recent">{t('operations', 'recent')}</TabsTrigger>
        <TabsTrigger value="byType">{t('operations', 'byType')}</TabsTrigger>
        <TabsTrigger value="shared">{t('operations', 'shared')}</TabsTrigger>
      </TabsList>
      <TabsContent value="all"><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={FileText} title={t('operations', 'noDocuments')} />} /></TabsContent>
      <TabsContent value="recent"><DataTable columns={columns} rows={recent} empty={<EmptyState icon={FileText} title={t('operations', 'noDocuments')} />} /></TabsContent>
      <TabsContent value="byType" className="space-y-5">{byType.length === 0 && <EmptyState icon={Filter} title={t('operations', 'noDocuments')} />}{byType.map(([cat, rows]) => <Card key={cat}><CardHeader><CardTitle className="text-sm">{t('operations', CATEGORY_KEY[cat])} · {formatNumber(rows.length)}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={rows} /></CardContent></Card>)}</TabsContent>
      <TabsContent value="shared"><DataTable columns={columns} rows={shared} empty={<EmptyState icon={Paperclip} title={t('operations', 'noDocuments')} />} /></TabsContent>
    </Tabs>

    <DetailPanel open={Boolean(preview)} title={preview?.name ?? ''} description={preview ? t('operations', ENTITY_TYPE_KEY[preview.entityType]) : undefined} onClose={() => setPreview(null)}>
      {preview && <div className="space-y-5">
        <div className="grid h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground">{preview.mimeType.startsWith('image/') ? <Image size={28} aria-hidden="true" /> : <FileText size={28} aria-hidden="true" />}<p className="mt-2 text-xs">{t('operations', 'noPreview')}</p></div>
        <div className="space-y-3">
          <Info label={t('operations', 'fileType')} value={t('operations', CATEGORY_KEY[preview.category])} icon={FileText} />
          <Info label={t('operations', 'fileSize')} value={formatSize(preview.sizeKb)} icon={Paperclip} />
          <Info label={t('operations', 'uploadedBy')} value={preview.uploadedBy} icon={Users2} />
          <Info label={t('operations', 'uploadedAt')} value={formatDate(preview.uploadedAt)} icon={ClipboardList} />
          <Info label={t('operations', 'linkedTo')} value={`${preview.entityLabel} (${t('operations', ENTITY_TYPE_KEY[preview.entityType])})`} icon={UserCog} />
        </div>
        <div className="flex gap-2"><Button className="flex-1" onClick={() => downloadDocument(preview)}><Download size={15} />{t('operations', 'download')}</Button><PermissionGate permission="documents.delete"><Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setToDelete(preview)}><Trash2 size={15} />{t('operations', 'deleteDocument')}</Button></PermissionGate><Button variant="outline" onClick={() => setPreview(null)}><X size={15} />{t('operations', 'cancel')}</Button></div>
      </div>}
    </DetailPanel>

    {uploadOpen && <ConfirmDialog open title={t('operations', 'uploadDocument')} onConfirm={handleUpload} onCancel={() => setUploadOpen(false)} confirmLabel={t('operations', 'uploadDocument')} cancelLabel={t('operations', 'cancel')}>
      <div className="mt-4"><FormSection title={t('operations', 'uploadDocument')}><DocumentUploadForm t={t} tenantId={currentTenant.id} values={uploadValues} onChange={(patch) => setUploadValues((v) => ({ ...v, ...patch }))} error={uploadError} /></FormSection></div>
    </ConfirmDialog>}
    {toDelete && <ConfirmDialog open title={t('operations', 'deleteDocument')} description={t('operations', 'deleteDocumentConfirm')} confirmLabel={t('operations', 'deleteDocument')} cancelLabel={t('operations', 'cancel')} onConfirm={() => deleteMutation.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />}
  </Page>;
}

// ----------------------------------------------------------------------- Module entry

export function OperationsModule() {
  const { t, locale } = useLocale();
  const typedLocale = locale as 'fr' | 'en';
  return (
    <Routes>
      <Route index element={<WorkflowsHub t={t} />} />
      <Route path="workflows" element={<WorkflowsHub t={t} />} />
      <Route path="workflows/:id" element={<WorkflowDetail t={t} locale={typedLocale} />} />
      <Route path="notifications" element={<NotificationsPage t={t} />} />
      <Route path="documents" element={<DocumentsPage t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
