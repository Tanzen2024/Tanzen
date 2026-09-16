import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, History, Plus, Trash2, Workflow, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, FormSection, PermissionGate, ConfirmDialog, FieldError, TableSkeleton, DetailSkeleton, ErrorState } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { NotFoundPage } from '@/routes';
import { workflowService, type WorkflowDefinitionInput } from '@/services/workflow.service';
import { auditService } from '@/services/audit.service';
import { queryKeys } from '@/services/query-keys';
import { permissionCatalog } from '@/mocks/rbac.mocks';
import { WORKFLOW_ENTITY_TYPES, WORKFLOW_ACTION_TYPES, WORKFLOW_DOMAINS, type WorkflowDefinition, type WorkflowDomain, type WorkflowActionType } from '@/mocks/operations/workflow-definitions';
import type { TableColumn } from '@/types/ui';
import { formatDate } from '@/lib/utils';

type T = (section: 'settings' | 'nav' | 'system', key: string, values?: Record<string, string>) => string;

/**
 * Libellés Domaine/Entité/Action pour cet écran — mêmes valeurs que les maps
 * équivalentes d'`operations-module.tsx` (`DOMAIN_KEY`/`ENTITY_KEY`), mais
 * redéfinies ici plutôt qu'importées : `T` reste borné à la section
 * `'settings'` (même convention que le reste du projet — chaque module
 * possède ses propres clés de section, cf. `organization`/`operations`).
 */
const DOMAIN_KEY: Record<WorkflowDomain, string> = { credit: 'wfDomainCredit', tontines: 'wfDomainTontines', governance: 'wfDomainGovernance', finance: 'wfDomainFinance', settings: 'wfDomainSettings', organization: 'wfDomainOrganization' };
const ENTITY_KEY: Record<WorkflowDefinition['entityType'], string> = { application: 'wfEntityApplication', loan: 'wfEntityLoan', assembly: 'wfEntityAssembly', distribution: 'wfEntityDistribution', fiscalYear: 'wfEntityFiscalYear', beneficiaryPermutation: 'wfEntityBeneficiaryPermutation', member: 'wfEntityMember' };
const ACTION_KEY: Record<WorkflowActionType, string> = { create: 'wfActionCreate', update: 'wfActionUpdate', close: 'wfActionClose', reopen: 'wfActionReopen', delete: 'wfActionDelete' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="SETTINGS" title={title} description={description} actions={actions} />{children}</div>;
}
function BackButton({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate('/settings/validation-workflows')}><ArrowLeft size={15} />{label}</Button>; }

// ----------------------------------------------------------------------- Liste

export function ValidationWorkflowsList({ t }: { t: T }) {
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { user } = usePermissions();
  const { data: definitions = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.settings.validationWorkflows(currentTenant.id), queryFn: () => workflowService.listDefinitions(currentTenant.id) });
  const [confirmTarget, setConfirmTarget] = useState<WorkflowDefinition | null>(null);

  const toggleMutation = useMockMutation<Awaited<ReturnType<typeof workflowService.setDefinitionActive>>, { definition: WorkflowDefinition; active: boolean }>({
    mutationFn: ({ definition, active }) => workflowService.setDefinitionActive(currentTenant.id, definition.id, active),
    invalidateKeys: [queryKeys.settings.validationWorkflows(currentTenant.id)],
    onSuccess: (result, { definition, active }) => {
      if (!result) return;
      auditService.record({ tenantId: currentTenant.id, actorId: user.id, actorName: user.name, module: 'settings', action: active ? 'workflow.activated' : 'workflow.deactivated', resourceType: 'workflowDefinition', resourceId: definition.id, resourceLabel: definition.name, context: { code: definition.code, version: String(definition.version) } });
      notify.success(t('settings', active ? 'wfActivated' : 'wfDeactivated'));
    },
  });

  // Une seule ligne par `code` (la version la plus récente) dans la liste — l'historique complet des versions reste consultable sur la page de détail (besoin §17), pas dupliqué ici.
  const latestPerCode = Object.values(
    definitions.reduce<Record<string, WorkflowDefinition>>((acc, definition) => {
      const current = acc[definition.code];
      if (!current || definition.version > current.version) acc[definition.code] = definition;
      return acc;
    }, {}),
  );
  const versionCountByCode = definitions.reduce<Record<string, number>>((acc, definition) => { acc[definition.code] = (acc[definition.code] ?? 0) + 1; return acc; }, {});

  const columns: TableColumn<WorkflowDefinition>[] = [
    { key: 'name', header: t('settings', 'wfName'), render: (row) => <button type="button" onClick={() => navigate(`/settings/validation-workflows/${row.id}`)} className="text-left font-medium text-primary">{row.name}</button> },
    { key: 'code', header: t('settings', 'wfCode'), render: (row) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.code}</code> },
    { key: 'domain', header: t('settings', 'wfModule'), render: (row) => t('settings', DOMAIN_KEY[row.domain]) },
    { key: 'entityType', header: t('settings', 'wfEntity'), render: (row) => t('settings', ENTITY_KEY[row.entityType]) },
    { key: 'action', header: t('settings', 'wfAction'), render: (row) => t('settings', ACTION_KEY[row.action]) },
    { key: 'version', header: t('settings', 'wfVersion'), render: (row) => `V${row.version}${(versionCountByCode[row.code] ?? 1) > 1 ? ` (${versionCountByCode[row.code]})` : ''}` },
    { key: 'steps', header: t('settings', 'wfSteps'), render: (row) => t('settings', 'wfStepsCount', { count: String(row.steps.length) }) },
    { key: 'active', header: t('settings', 'wfStatus'), render: (row) => <PermissionGate permission="workflows.manage" fallback={<StatusBadge label={t('settings', row.active ? 'wfStatusActive' : 'wfStatusInactive')} tone={row.active ? 'success' : 'default'} />}><Switch checked={row.active} aria-label={`${t('settings', 'wfStatus')} — ${row.name}`} onCheckedChange={(checked) => (row.active ? setConfirmTarget(row) : toggleMutation.mutate({ definition: row, active: checked }))} /></PermissionGate> },
    { key: 'updatedAt', header: t('settings', 'wfLastModified'), render: (row) => row.updatedAt ? formatDate(row.updatedAt.slice(0, 10)) : '—' },
  ];

  if (isLoading) return <Page title={t('settings', 'validationWorkflowsTitle')} description={t('settings', 'validationWorkflowsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('settings', 'validationWorkflowsTitle')} description={t('settings', 'validationWorkflowsDescription')}><ErrorState onRetry={refetch} /></Page>;

  return <Page
    title={t('settings', 'validationWorkflowsTitle')}
    description={t('settings', 'validationWorkflowsDescription')}
    actions={<PermissionGate permission="workflows.create"><Button onClick={() => navigate('/settings/validation-workflows/new')}><Plus size={15} />{t('settings', 'wfNewWorkflow')}</Button></PermissionGate>}
  >
    <DataTable
      columns={columns}
      rows={latestPerCode}
      empty={<EmptyState icon={Workflow} title={t('settings', 'wfNoWorkflows')} description={t('settings', 'wfNoWorkflowsDescription')} action={<PermissionGate permission="workflows.create"><Button onClick={() => navigate('/settings/validation-workflows/new')}><Plus size={15} />{t('settings', 'wfNewWorkflow')}</Button></PermissionGate>} />}
    />
    {confirmTarget && <ConfirmDialog
      open
      title={t('settings', 'wfDeactivateTitle')}
      description={t('settings', 'wfDeactivateDescription', { name: confirmTarget.name })}
      confirmLabel={t('settings', 'wfDeactivate')}
      cancelLabel={t('settings', 'cancel')}
      onConfirm={() => { toggleMutation.mutate({ definition: confirmTarget, active: false }); setConfirmTarget(null); }}
      onCancel={() => setConfirmTarget(null)}
    />}
  </Page>;
}

// ----------------------------------------------------------------------- Formulaire (créer/éditer/nouvelle version)

type StepFormValue = { name: string; approverPermission: string };
type WorkflowFormValues = { code: string; name: string; domain: WorkflowDomain; description: string; entityType: WorkflowDefinition['entityType']; action: WorkflowActionType; active: boolean; steps: StepFormValue[] };
type WorkflowFormErrors = Partial<Record<'code' | 'name' | 'steps' | 'general', string>>;

const EMPTY_FORM: WorkflowFormValues = { code: '', name: '', domain: 'organization', description: '', entityType: 'member', action: 'update', active: false, steps: [{ name: '', approverPermission: permissionCatalog[0] ?? '' }] };

function validateWorkflowForm(values: WorkflowFormValues, t: T): WorkflowFormErrors {
  const errors: WorkflowFormErrors = {};
  if (!values.code.trim()) errors.code = t('settings', 'wfFieldRequired');
  else if (!/^[A-Z][A-Z0-9_]*$/.test(values.code.trim())) errors.code = t('settings', 'wfInvalidCode');
  if (!values.name.trim()) errors.name = t('settings', 'wfFieldRequired');
  if (values.steps.length === 0) errors.steps = t('settings', 'wfAtLeastOneStep');
  else if (values.steps.some((step) => !step.name.trim() || !step.approverPermission)) errors.steps = t('settings', 'wfIncompleteStep');
  return errors;
}

function selectClass(hasError?: boolean) {
  return `flex h-9 w-full rounded-md border ${hasError ? 'border-destructive' : 'border-input'} bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`;
}

function StepsBuilder({ t, steps, onChange, error }: { t: T; steps: StepFormValue[]; onChange: (steps: StepFormValue[]) => void; error?: string }) {
  const update = (index: number, patch: Partial<StepFormValue>) => onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  const remove = (index: number) => onChange(steps.filter((_, i) => i !== index));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => onChange([...steps, { name: '', approverPermission: permissionCatalog[0] ?? '' }]);
  return <FormSection title={t('settings', 'wfStepsTitle')} description={t('settings', 'wfStepsDescription')}>
    <div className="space-y-3">
      {steps.map((step, index) => <Card key={index}><CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{t('settings', 'wfStepOrder', { order: String(index + 1) })}</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('settings', 'wfMoveUp')}><ArrowUp size={14} /></Button>
            <Button type="button" variant="ghost" size="sm" disabled={index === steps.length - 1} onClick={() => move(index, 1)} aria-label={t('settings', 'wfMoveDown')}><ArrowDown size={14} /></Button>
            <Button type="button" variant="ghost" size="sm" disabled={steps.length <= 1} onClick={() => remove(index)} aria-label={t('settings', 'wfRemoveStep')}><Trash2 size={14} /></Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`wf-step-name-${index}`}>{t('settings', 'wfStepName')}</Label><Input id={`wf-step-name-${index}`} value={step.name} onChange={(event) => update(index, { name: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`wf-step-permission-${index}`}>{t('settings', 'wfStepPermission')}</Label>
            <select id={`wf-step-permission-${index}`} className={selectClass()} value={step.approverPermission} onChange={(event) => update(index, { approverPermission: event.target.value })}>
              {permissionCatalog.map((permission) => <option key={permission} value={permission}>{permission}</option>)}
            </select>
          </div>
        </div>
      </CardContent></Card>)}
      {error && <FieldError message={error} />}
      <Button type="button" variant="outline" onClick={add}><Plus size={15} />{t('settings', 'wfAddStep')}</Button>
    </div>
  </FormSection>;
}

function WorkflowGeneralFields({ t, values, onChange, errors, codeReadOnly }: { t: T; values: WorkflowFormValues; onChange: (patch: Partial<WorkflowFormValues>) => void; errors: WorkflowFormErrors; codeReadOnly: boolean }) {
  return <FormSection title={t('settings', 'wfGeneralInfo')}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="wf-name">{t('settings', 'wfName')} *</Label><Input id="wf-name" value={values.name} onChange={(event) => onChange({ name: event.target.value })} aria-invalid={Boolean(errors.name)} /><FieldError message={errors.name} /></div>
      <div className="space-y-1.5"><Label htmlFor="wf-code">{t('settings', 'wfCode')} *</Label><Input id="wf-code" value={values.code} disabled={codeReadOnly} placeholder="MEMBER_UPDATE" onChange={(event) => onChange({ code: event.target.value.toUpperCase() })} aria-invalid={Boolean(errors.code)} /><FieldError message={errors.code} /></div>
      <div className="space-y-1.5"><Label htmlFor="wf-domain">{t('settings', 'wfModule')}</Label>
        <select id="wf-domain" className={selectClass()} value={values.domain} onChange={(event) => onChange({ domain: event.target.value as WorkflowDomain })}>
          {WORKFLOW_DOMAINS.map((domain) => <option key={domain} value={domain}>{t('settings', DOMAIN_KEY[domain])}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="wf-entity">{t('settings', 'wfEntity')}</Label>
        <select id="wf-entity" className={selectClass()} value={values.entityType} onChange={(event) => onChange({ entityType: event.target.value as WorkflowDefinition['entityType'] })}>
          {WORKFLOW_ENTITY_TYPES.map((entityType) => <option key={entityType} value={entityType}>{t('settings', ENTITY_KEY[entityType])}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="wf-action">{t('settings', 'wfAction')}</Label>
        <select id="wf-action" className={selectClass()} value={values.action} onChange={(event) => onChange({ action: event.target.value as WorkflowActionType })}>
          {WORKFLOW_ACTION_TYPES.map((action) => <option key={action} value={action}>{t('settings', ACTION_KEY[action])}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3 pt-6"><Switch checked={values.active} onCheckedChange={(checked) => onChange({ active: checked })} aria-label={t('settings', 'wfActiveToggle')} /><Label>{t('settings', 'wfActiveToggle')}</Label></div>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="wf-description">{t('settings', 'wfDescription')}</Label><Textarea id="wf-description" value={values.description} onChange={(event) => onChange({ description: event.target.value })} rows={2} /></div>
    </div>
  </FormSection>;
}

export function ValidationWorkflowCreate({ t }: { t: T }) {
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { user } = usePermissions();
  const [values, setValues] = useState<WorkflowFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<WorkflowFormErrors>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof workflowService.createDefinition>>, WorkflowDefinitionInput>({
    mutationFn: (input) => workflowService.createDefinition(currentTenant.id, input),
    invalidateKeys: [queryKeys.settings.validationWorkflows(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { setErrors({ general: t('settings', 'wfDuplicateCode') }); return; }
      auditService.record({ tenantId: currentTenant.id, actorId: user.id, actorName: user.name, module: 'settings', action: 'workflow.definitionCreated', resourceType: 'workflowDefinition', resourceId: result.id, resourceLabel: result.name, context: { code: result.code } });
      notify.success(t('settings', 'wfWorkflowCreated'));
      navigate(`/settings/validation-workflows/${result.id}`);
    },
  });
  const handleSave = () => {
    const nextErrors = validateWorkflowForm(values, t);
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    setErrors({});
    mutation.mutate({ code: values.code.trim(), name: values.name.trim(), domain: values.domain, description: values.description.trim(), entityType: values.entityType, action: values.action, active: values.active, steps: values.steps.map((step) => ({ name: step.name.trim(), approverPermission: step.approverPermission })) });
  };
  return <Page title={t('settings', 'wfNewWorkflow')} description={t('settings', 'validationWorkflowsDescription')} actions={<BackButton label={t('settings', 'wfBackToWorkflows')} />}>
    <div className="space-y-5">
      <WorkflowGeneralFields t={t} values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} codeReadOnly={false} />
      <StepsBuilder t={t} steps={values.steps} onChange={(steps) => setValues((current) => ({ ...current, steps }))} error={errors.steps} />
      {errors.general && <p className="text-sm text-destructive" role="alert">{errors.general}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/settings/validation-workflows')}>{t('settings', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('settings', 'saving') : t('settings', 'wfSaveWorkflow')}</Button></div>
    </div>
  </Page>;
}

function definitionToFormValues(definition: WorkflowDefinition): WorkflowFormValues {
  return { code: definition.code, name: definition.name, domain: definition.domain, description: definition.description, entityType: definition.entityType, action: definition.action, active: definition.active, steps: definition.steps.map((step) => ({ name: step.name, approverPermission: step.approverPermission })) };
}

export function ValidationWorkflowEdit({ t }: { t: T }) {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { currentTenant } = useTenant();
  const { user } = usePermissions();
  const { data: definition, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.settings.validationWorkflow(id), currentTenant.id], queryFn: () => workflowService.getDefinition(currentTenant.id, id) });
  const { data: used } = useQuery({ queryKey: ['settings', 'validation-workflow-used', id], queryFn: () => workflowService.isDefinitionUsed(id), enabled: Boolean(definition) });
  const [values, setValues] = useState<WorkflowFormValues | null>(null);
  const [errors, setErrors] = useState<WorkflowFormErrors>({});
  const current = values ?? (definition ? definitionToFormValues(definition) : null);

  const mutation = useMockMutation<Awaited<ReturnType<typeof workflowService.updateDefinition>>, WorkflowDefinitionInput>({
    mutationFn: (input) => workflowService.updateDefinition(currentTenant.id, id, input),
    invalidateKeys: [queryKeys.settings.validationWorkflows(currentTenant.id), queryKeys.settings.validationWorkflow(id)],
    onSuccess: (result) => {
      if (!result) { setErrors({ general: t('settings', used ? 'wfAlreadyUsedWarning' : 'wfDuplicateCode') }); return; }
      auditService.record({ tenantId: currentTenant.id, actorId: user.id, actorName: user.name, module: 'settings', action: 'workflow.definitionUpdated', resourceType: 'workflowDefinition', resourceId: result.id, resourceLabel: result.name, context: { code: result.code } });
      notify.success(t('settings', 'wfWorkflowUpdated'));
      navigate(`/settings/validation-workflows/${result.id}`);
    },
  });

  if (isLoading) return <Page title={t('settings', 'wfEditWorkflow')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('settings', 'wfEditWorkflow')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!definition || !current) return <NotFoundPage />;

  const handleSave = () => {
    const nextErrors = validateWorkflowForm(current, t);
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    setErrors({});
    mutation.mutate({ code: current.code.trim(), name: current.name.trim(), domain: current.domain, description: current.description.trim(), entityType: current.entityType, action: current.action, active: current.active, steps: current.steps.map((step) => ({ name: step.name.trim(), approverPermission: step.approverPermission })) });
  };

  return <Page title={t('settings', 'wfEditWorkflow')} description={`${definition.name} · V${definition.version}`} actions={<BackButton label={t('settings', 'wfBackToWorkflows')} />}>
    <div className="space-y-5">
      {used && <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
        <p className="font-semibold">{t('settings', 'wfAlreadyUsedTitle')}</p>
        <p className="mt-1">{t('settings', 'wfAlreadyUsedWarning')}</p>
        <Button className="mt-3" onClick={() => navigate(`/settings/validation-workflows/${id}`)}>{t('settings', 'wfCreateNewVersion')}</Button>
      </div>}
      <fieldset disabled={Boolean(used)} className="space-y-5 disabled:opacity-60">
        <WorkflowGeneralFields t={t} values={current} onChange={(patch) => setValues({ ...current, ...patch })} errors={errors} codeReadOnly />
        <StepsBuilder t={t} steps={current.steps} onChange={(steps) => setValues({ ...current, steps })} error={errors.steps} />
      </fieldset>
      {errors.general && <p className="text-sm text-destructive" role="alert">{errors.general}</p>}
      {!used && <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/settings/validation-workflows/${id}`)}>{t('settings', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('settings', 'saving') : t('settings', 'wfSaveWorkflow')}</Button></div>}
    </div>
  </Page>;
}

// ----------------------------------------------------------------------- Détail / aperçu / nouvelle version

export function ValidationWorkflowDetail({ t }: { t: T }) {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { currentTenant } = useTenant();
  const { user } = usePermissions();
  const { data: definition, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.settings.validationWorkflow(id), currentTenant.id], queryFn: () => workflowService.getDefinition(currentTenant.id, id) });
  const { data: versions = [] } = useQuery({ queryKey: queryKeys.settings.validationWorkflowVersions(currentTenant.id, definition?.code ?? ''), queryFn: () => workflowService.listDefinitionVersions(currentTenant.id, definition!.code), enabled: Boolean(definition) });
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [newVersionValues, setNewVersionValues] = useState<WorkflowFormValues | null>(null);
  const [newVersionErrors, setNewVersionErrors] = useState<WorkflowFormErrors>({});

  const toggleMutation = useMockMutation<Awaited<ReturnType<typeof workflowService.setDefinitionActive>>, boolean>({
    mutationFn: (active) => workflowService.setDefinitionActive(currentTenant.id, id, active),
    invalidateKeys: [queryKeys.settings.validationWorkflows(currentTenant.id), queryKeys.settings.validationWorkflow(id), queryKeys.settings.validationWorkflowVersions(currentTenant.id, definition?.code ?? '')],
    onSuccess: (result, active) => {
      if (!result || !definition) return;
      auditService.record({ tenantId: currentTenant.id, actorId: user.id, actorName: user.name, module: 'settings', action: active ? 'workflow.activated' : 'workflow.deactivated', resourceType: 'workflowDefinition', resourceId: definition.id, resourceLabel: definition.name, context: { code: definition.code, version: String(definition.version) } });
      notify.success(t('settings', active ? 'wfActivated' : 'wfDeactivated'));
    },
  });

  const newVersionMutation = useMockMutation<Awaited<ReturnType<typeof workflowService.createNewVersionOfDefinition>>, WorkflowDefinitionInput>({
    mutationFn: (input) => workflowService.createNewVersionOfDefinition(currentTenant.id, id, input),
    invalidateKeys: [queryKeys.settings.validationWorkflows(currentTenant.id), queryKeys.settings.validationWorkflowVersions(currentTenant.id, definition?.code ?? '')],
    onSuccess: (result) => {
      if (!result) return;
      auditService.record({ tenantId: currentTenant.id, actorId: user.id, actorName: user.name, module: 'settings', action: 'workflow.versionCreated', resourceType: 'workflowDefinition', resourceId: result.id, resourceLabel: result.name, context: { code: result.code, version: String(result.version) } });
      notify.success(t('settings', 'wfVersionCreated'));
      setNewVersionOpen(false);
      navigate(`/settings/validation-workflows/${result.id}`);
    },
  });

  if (isLoading) return <Page title={t('settings', 'wfWorkflowDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('settings', 'wfWorkflowDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!definition) return <NotFoundPage />;

  const openNewVersion = () => { setNewVersionValues(definitionToFormValues(definition)); setNewVersionErrors({}); setNewVersionOpen(true); };
  const submitNewVersion = () => {
    if (!newVersionValues) return;
    const nextErrors = validateWorkflowForm(newVersionValues, t);
    if (Object.keys(nextErrors).length > 0) { setNewVersionErrors(nextErrors); return; }
    newVersionMutation.mutate({ code: newVersionValues.code.trim(), name: newVersionValues.name.trim(), domain: newVersionValues.domain, description: newVersionValues.description.trim(), entityType: newVersionValues.entityType, action: newVersionValues.action, active: true, steps: newVersionValues.steps.map((step) => ({ name: step.name.trim(), approverPermission: step.approverPermission })) });
  };

  return <Page
    title={`${definition.name} · V${definition.version}`}
    description={t('settings', DOMAIN_KEY[definition.domain])}
    actions={<><BackButton label={t('settings', 'wfBackToWorkflows')} />
      <PermissionGate permission="workflows.manage"><Button variant="outline" onClick={() => navigate(`/settings/validation-workflows/${id}/edit`)}>{t('settings', 'wfEditWorkflow')}</Button></PermissionGate>
      <PermissionGate permission="workflows.manage">{definition.active ? <Button variant="outline" onClick={() => setConfirmDeactivate(true)}><XCircle size={15} />{t('settings', 'wfDeactivate')}</Button> : <Button variant="outline" onClick={() => toggleMutation.mutate(true)}><CheckCircle2 size={15} />{t('settings', 'wfActivate')}</Button>}</PermissionGate>
      <PermissionGate permission="workflows.create"><Button onClick={openNewVersion}><History size={15} />{t('settings', 'wfCreateNewVersion')}</Button></PermissionGate>
    </>}
  >
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <Card><CardHeader><CardTitle className="text-sm">{t('settings', 'wfCircuitPreview')}</CardTitle></CardHeader><CardContent className="p-5">
        <ol className="space-y-3">
          <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{t('settings', ENTITY_KEY[definition.entityType]).slice(0, 2).toUpperCase()}</span><span className="text-sm font-medium">{t('settings', ENTITY_KEY[definition.entityType])} · {t('settings', ACTION_KEY[definition.action])}</span></li>
          {definition.steps.map((step) => <li key={step.order} className="ml-4 flex items-center gap-3 border-l-2 border-dashed border-border pl-4"><span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold">{step.order}</span><div><p className="text-sm font-medium">{step.name}</p><p className="text-xs text-muted-foreground">{step.approverPermission}</p></div></li>)}
          <li className="ml-4 flex items-center gap-3 border-l-2 border-dashed border-border pl-4"><span className="grid size-7 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 size={14} /></span><span className="text-sm font-medium">{t('settings', 'wfApplied')}</span></li>
        </ol>
      </CardContent></Card>
      <div className="space-y-5">
        <Card><CardHeader><CardTitle className="text-sm">{t('settings', 'wfWorkflowDetail')}</CardTitle></CardHeader><CardContent className="space-y-3 p-5 text-sm">
          <p><span className="text-muted-foreground">{t('settings', 'wfCode')}:</span> <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{definition.code}</code></p>
          <p><span className="text-muted-foreground">{t('settings', 'wfDescription')}:</span> {definition.description || '—'}</p>
          <StatusBadge label={t('settings', definition.active ? 'wfStatusActive' : 'wfStatusInactive')} tone={definition.active ? 'success' : 'default'} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t('settings', 'wfVersionHistory')}</CardTitle></CardHeader><CardContent className="space-y-2 p-5">
          {versions.map((version) => <button key={version.id} type="button" onClick={() => navigate(`/settings/validation-workflows/${version.id}`)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${version.id === definition.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
            <span>V{version.version}{version.updatedAt ? ` · ${formatDate(version.updatedAt.slice(0, 10))}` : ''}</span>
            <StatusBadge label={t('settings', version.active ? 'wfStatusActive' : 'wfStatusInactive')} tone={version.active ? 'success' : 'default'} />
          </button>)}
        </CardContent></Card>
      </div>
    </div>
    {confirmDeactivate && <ConfirmDialog open title={t('settings', 'wfDeactivateTitle')} description={t('settings', 'wfDeactivateDescription', { name: definition.name })} confirmLabel={t('settings', 'wfDeactivate')} cancelLabel={t('settings', 'cancel')} onConfirm={() => { toggleMutation.mutate(false); setConfirmDeactivate(false); }} onCancel={() => setConfirmDeactivate(false)} />}
    {newVersionOpen && newVersionValues && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" role="presentation" onMouseDown={() => setNewVersionOpen(false)}>
      <div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold">{t('settings', 'wfCreateNewVersion')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings', 'wfNewVersionDescription', { version: String(definition.version + 1) })}</p>
        <div className="mt-4 space-y-4">
          <WorkflowGeneralFields t={t} values={newVersionValues} onChange={(patch) => setNewVersionValues({ ...newVersionValues, ...patch })} errors={newVersionErrors} codeReadOnly />
          <StepsBuilder t={t} steps={newVersionValues.steps} onChange={(steps) => setNewVersionValues({ ...newVersionValues, steps })} error={newVersionErrors.steps} />
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setNewVersionOpen(false)}>{t('settings', 'cancel')}</Button><Button disabled={newVersionMutation.isPending} onClick={submitNewVersion}>{newVersionMutation.isPending ? t('settings', 'saving') : t('settings', 'wfSaveWorkflow')}</Button></div>
      </div>
    </div>}
  </Page>;
}
