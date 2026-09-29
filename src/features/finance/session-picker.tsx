import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/tenant-context';
import { useFiscalYear } from '@/contexts/fiscal-year-context';
import { usePermissions } from '@/contexts/permission-context';
import { fiscalSessionService } from '@/services/fiscal-session.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { formatDate } from '@/lib/utils';
import { ALL_SESSIONS, useFinanceSession } from './finance-session-context';
import type { T } from './finance-module';

/** Valeur technique de l'option « + Ajouter une séance » — une action, jamais une séance sélectionnable. */
const ADD_SESSION = '__add_session__';

/** `YYYY-MM-DD` + 1 jour (UTC, sans dérive de fuseau). */
function dayAfter(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * « + Ajouter une séance » (mandat §10/§11) — même moteur que Paramètres →
 * Exercices : date préremplie par `suggestNextSessionDate` (simple prévision,
 * rien n'est créé à l'ouverture), création par `createSession` qui applique
 * TOUTES les règles (exercice du tenant, non clôturé, date dans l'exercice,
 * strictement après la dernière séance, numérotation propre à l'exercice).
 * La séance créée devient la séance courante du contexte Finance.
 */
export function AddSessionDialog({ t, open, onClose }: { t: T; open: boolean; onClose: () => void }) {
  const { currentTenant } = useTenant();
  const { currentFiscalYear } = useFiscalYear();
  const { sessions, selectSession } = useFinanceSession();
  const fiscalYearId = currentFiscalYear?.id;
  const { data: suggested } = useQuery({
    queryKey: queryKeys.finance.sessions.next(currentTenant.id, fiscalYearId),
    queryFn: () => fiscalSessionService.suggestNextSessionDate(currentTenant.id, fiscalYearId!),
    enabled: open && Boolean(fiscalYearId),
  });
  const [date, setDate] = useState('');
  const effectiveDate = date || suggested || '';
  const lastDate = sessions.length > 0 ? sessions[sessions.length - 1].date : undefined;
  const closed = Boolean(currentFiscalYear?.isClosed);
  const minDate = currentFiscalYear ? (lastDate && dayAfter(lastDate) > currentFiscalYear.startDate ? dayAfter(lastDate) : currentFiscalYear.startDate) : undefined;
  const mutation = useMockMutation<Awaited<ReturnType<typeof fiscalSessionService.createSession>>, void>({
    mutationFn: () => fiscalSessionService.createSession(currentTenant.id, fiscalYearId!, effectiveDate),
    invalidateKeys: [queryKeys.finance.sessions.list(currentTenant.id, fiscalYearId), queryKeys.finance.sessions.next(currentTenant.id, fiscalYearId), queryKeys.finance.sessions.all(currentTenant.id)],
    onSuccess: (session) => {
      if (!session) { notify.error(t('finance', lastDate && effectiveDate <= lastDate ? 'sessionDateNotAfterLast' : 'sessionAddFailed', { date: lastDate ? formatDate(lastDate) : '' })); return; }
      notify.success(t('finance', 'sessionAdded'));
      selectSession(session.id);
      setDate('');
      onClose();
    },
  });
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{t('finance', 'addSession')}</DialogTitle>
        <DialogDescription>{t('finance', 'addSessionDialogDescription')}</DialogDescription>
      </DialogHeader>
      {closed ? <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{t('finance', 'sessionFiscalYearClosed')}</p> : <div className="space-y-2">
        <Label htmlFor="finance-new-session-date">{t('finance', 'sessionDateLabel')}</Label>
        <Input id="finance-new-session-date" type="date" min={minDate} max={currentFiscalYear?.endDate} value={effectiveDate} onChange={(event) => setDate(event.target.value)} />
        {suggested && <p className="text-[11px] text-muted-foreground">{t('finance', 'nextSessionProvisionalLabel')}</p>}
      </div>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t('finance', 'cancel')}</Button>
        <Button disabled={closed || !effectiveDate || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'addSession')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/**
 * Sélecteur « Date de séance » du contexte Finance (mandat §6-§8) — le MÊME
 * contexte dans l'onglet Transactions et dans la fiche caisse : changer de
 * séance ici recalcule toute la page et reste sélectionné ailleurs. Options :
 * « Toutes les séances », les séances de l'exercice courant (plus récente en
 * premier), puis l'action « + Ajouter une séance ».
 */
export function SessionPicker({ t, id = 'finance-session' }: { t: T; id?: string }) {
  const { sessions, selection, selectSession } = useFinanceSession();
  const { can } = usePermissions();
  const [adding, setAdding] = useState(false);
  const canAdd = can('fiscalYears.manage');
  return <div className="flex flex-col items-center gap-1">
    <Label htmlFor={id} className="text-xs text-muted-foreground">{t('finance', 'sessionDatePicker')}</Label>
    <select id={id} value={selection} onChange={(event) => { if (event.target.value === ADD_SESSION) { setAdding(true); return; } selectSession(event.target.value); }} className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-center text-sm font-semibold">
      <option value={ALL_SESSIONS}>{t('finance', 'allSessions')}</option>
      {[...sessions].reverse().map((session) => <option key={session.id} value={session.id}>{formatDate(session.date)}</option>)}
      {canAdd && <option disabled value="__separator__">──────────</option>}
      {canAdd && <option value={ADD_SESSION}>{t('finance', 'addSessionOption')}</option>}
    </select>
    {adding && <AddSessionDialog t={t} open onClose={() => setAdding(false)} />}
  </div>;
}

