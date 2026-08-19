/**
 * Gestion des adhésions Tontine — additif, ne modifie aucun mécanisme
 * legacy. Forme technique de TontineAdhesion : lecture (B), recommandée
 * mais NON verrouillée officiellement (D-TON-04-07 reste `DECISION
 * REQUIRED`, cf. docs/P1_TONTINE_D-TON-04_REVISION_FINAL_DECISION_GATE.md
 * §5). L'accès passe exclusivement par `tontineTurnsService` pour que toute
 * évolution future de la forme technique (A/C) reste isolée à ce seul
 * service, sans toucher aux composants ci-dessous.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, TicketCheck, UserRound, UsersRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, DateDisplay, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, ConfirmDialog, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineTurnsService, type AdhesionInput } from '@/services/tontine-turns.service';
import { tontinesService } from '@/services/tontines.service';
import { organizationService } from '@/services/organization.service';
import { ContributionTable } from './contributions-module';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { TableColumn } from '@/types/ui';
import { formatValue } from './value-format';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const ADHESION_STATUS_TONE: Record<'active' | 'exited', 'success' | 'default'> = { active: 'success', exited: 'default' };
const ADHESION_STATUS_LABEL_KEY: Record<'active' | 'exited', string> = { active: 'statusActive', exited: 'statusExited' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, onClick }: { label: string; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{label}</Button>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>; }

export function AdhesionList({ t }: { t: T }) {
  const { tontineId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tontine, isLoading: isTontineLoading, isError: isTontineError, refetch: refetchTontine } = useQuery({ queryKey: ['tontines', 'detail', tontineId, currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: adhesions = [], isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'adhesions', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  const { data: members = [] } = useQuery({ queryKey: ['members', 'list', currentTenant.id], queryFn: () => organizationService.listMembers(currentTenant.id) });

  const [memberId, setMemberId] = useState('');
  const [joinedAt, setJoinedAt] = useState(new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState<string | undefined>();
  const createMutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.createAdhesion>>, AdhesionInput>({
    mutationFn: (input) => tontineTurnsService.createAdhesion(currentTenant.id, input),
    invalidateKeys: [['tontines', 'adhesions', tontineId, currentTenant.id]],
    onSuccess: () => { notify.success(t('tontines', 'adhesionCreated')); setCreateOpen(false); setMemberId(''); setJoinedAt(new Date().toISOString().slice(0, 10)); },
  });

  if (isTontineLoading) return <Page title={t('tontines', 'adhesionsTitle')}><TableSkeleton /></Page>;
  if (isTontineError) return <Page title={t('tontines', 'adhesionsTitle')}><ErrorState onRetry={refetchTontine} /></Page>;
  if (!tontine) return <NotFoundPage />;
  if (isLoading) return <Page title={t('tontines', 'adhesionsTitle')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'adhesionsTitle')}><ErrorState onRetry={refetch} /></Page>;

  const rows = adhesions.filter((item) => item.memberName.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || item.status === status));
  const columns: TableColumn<(typeof adhesions)[number]>[] = [
    { key: 'memberName', header: t('tontines', 'adhesionMember'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/adhesions/${row.id}`)} className="flex items-center gap-3 text-left"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UserRound size={17} /></span><span><span className="block font-semibold">{row.memberName}</span><span className="block font-mono text-xs text-muted-foreground">{row.id}</span></span></button> },
    { key: 'joinedAt', header: t('tontines', 'joinedAt'), render: (row) => <DateDisplay value={row.joinedAt} /> },
    { key: 'status', header: t('tontines', 'adhesionStatus'), render: (row) => <StatusBadge label={t('tontines', ADHESION_STATUS_LABEL_KEY[row.status])} tone={ADHESION_STATUS_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/adhesions/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];

  return <Page title={t('tontines', 'adhesionsTitle')} description={`${tontine.name} · ${t('tontines', 'adhesionsDescription')}`} actions={<><Back label={t('tontines', 'backToTontines')} onClick={() => navigate(`/tontines/${tontineId}`)} /><PermissionGate permission="adhesions.manage"><Button onClick={() => setCreateOpen(true)}><Plus size={16} />{t('tontines', 'addAdhesion')}</Button></PermissionGate></>}>
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'adhesionMember')} filters={<select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'adhesionStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'adhesionStatus')}</option><option value="active">{t('tontines', 'statusActive')}</option><option value="exited">{t('tontines', 'statusExited')}</option></select>} />
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noAdhesions')} />} />
    {createOpen && <ConfirmDialog open title={t('tontines', 'addAdhesion')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={() => setCreateOpen(false)} onConfirm={() => {
      const member = members.find((item) => item.id === memberId);
      if (!member) { setFormError(t('tontines', 'fieldRequired')); return; }
      setFormError(undefined);
      createMutation.mutate({ tontineId, memberId: member.id, memberName: `${member.firstName} ${member.lastName}`, joinedAt });
    }}>
      <div className="mt-4 space-y-3 text-left">
        <div className="space-y-1"><Label htmlFor="adhesion-member">{t('tontines', 'selectMember')}</Label><select id="adhesion-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('tontines', 'selectMember')}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</select><FieldError message={formError} /></div>
        <div className="space-y-1"><Label htmlFor="adhesion-joined">{t('tontines', 'joinedAt')}</Label><Input id="adhesion-joined" type="date" value={joinedAt} onChange={(event) => setJoinedAt(event.target.value)} /></div>
      </div>
    </ConfirmDialog>}
  </Page>;
}

export function AdhesionDetail({ t }: { t: T }) {
  const { tontineId = '', adhesionId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: adhesion, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'adhesion', adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.getAdhesion(currentTenant.id, adhesionId) });
  const { data: contributions = [] } = useQuery({ queryKey: ['tontines', 'adhesion-contributions', adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.listContributionsByAdhesion(currentTenant.id, adhesionId), enabled: Boolean(adhesion) });
  const { data: beneficiaries = [] } = useQuery({ queryKey: ['tontines', 'adhesion-beneficiaries', adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.listBeneficiariesByAdhesion(currentTenant.id, adhesionId), enabled: Boolean(adhesion) });

  if (isLoading) return <Page title={t('tontines', 'adhesionDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'adhesionDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!adhesion) return <NotFoundPage />;

  const beneficiaryColumns: TableColumn<(typeof beneficiaries)[number]>[] = [
    { key: 'id', header: 'ID', render: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: 'valueType', header: t('tontines', 'valueType'), render: (row) => t('tontines', row.valueType === 'MONEY' ? 'valueTypeMoney' : 'valueTypeGoods') },
    { key: 'expected', header: t('tontines', 'expectedAmount'), render: (row) => formatValue(row.valueType, row.expectedAmount, row.expectedQuantity) },
    { key: 'received', header: t('tontines', 'receivedTotal'), render: (row) => formatValue(row.valueType, row.receivedTotal, row.receivedTotal) },
    { key: 'status', header: t('tontines', 'beneficiaryStatus'), render: (row) => <StatusBadge label={t('tontines', row.status === 'PENDING' ? 'statusReceptionPending' : row.status === 'PARTIAL' ? 'statusReceptionPartial' : 'statusReceptionReceived')} tone={row.status === 'RECEIVED' ? 'success' : row.status === 'PARTIAL' ? 'warning' : 'default'} /> },
  ];

  return <Page title={adhesion.memberName} description={`${adhesion.id} · ${t('tontines', 'adhesion')}`} actions={<Back label={t('tontines', 'backToAdhesions')} onClick={() => navigate(`/tontines/${tontineId}/adhesions`)} />}>
    <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3">
      <Info label={t('tontines', 'adhesionMember')} value={adhesion.memberName} />
      <Info label={t('tontines', 'joinedAt')} value={new Date(adhesion.joinedAt).toLocaleDateString('fr-FR')} />
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'adhesionStatus')}</p><StatusBadge label={t('tontines', ADHESION_STATUS_LABEL_KEY[adhesion.status])} tone={ADHESION_STATUS_TONE[adhesion.status]} /></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'linkedContributions')}</CardTitle></CardHeader><CardContent className="p-0"><ContributionTable t={t} rows={contributions} /></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'linkedBeneficiaries')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={beneficiaryColumns} rows={beneficiaries} empty={<EmptyState icon={TicketCheck} title={t('tontines', 'noLinkedBeneficiaries')} />} /></CardContent></Card>
  </Page>;
}
