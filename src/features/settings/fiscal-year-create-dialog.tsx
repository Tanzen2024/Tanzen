import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { ConfirmDialog, FieldError, StatusBadge } from '@/components';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocale } from '@/contexts/locale-context';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { settingsService, type CreateFiscalYearInput } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import { suggestNextFiscalYear, type FiscalYear } from '@/mocks/settings/fiscal-years';
import { isValidMeetingScheduleConfig, type MeetingScheduleConfig } from '@/mocks/settings/meeting-schedule';
import { fiscalYearTransferCategories, type TransferabilityDecision } from '@/mocks/settings/fiscal-year-transfer-categories';
import { MeetingScheduleFields } from './meeting-schedule-fields';
import type { StatusTone } from '@/types/ui';

const TRANSFERABILITY_TONE: Record<TransferabilityDecision, StatusTone> = { TRANSFERABLE: 'success', NOT_TRANSFERABLE: 'default', PARTIAL: 'info', UNDETERMINED: 'warning' };
const TRANSFERABILITY_KEY: Record<TransferabilityDecision, string> = { TRANSFERABLE: 'transferabilityTransferable', NOT_TRANSFERABLE: 'transferabilityNotTransferable', PARTIAL: 'transferabilityPartial', UNDETERMINED: 'transferabilityUndetermined' };

/**
 * Assistant de création d'un exercice fiscal (2 étapes), extrait de
 * `SettingsFiscalYears` pour être réutilisable depuis un second point d'entrée
 * (le raccourci « + Nouvel exercice fiscal » du sélecteur de la barre
 * supérieure, `FiscalYearSelector`) SANS dupliquer la logique métier :
 * même `settingsService.createFiscalYear`, mêmes catégories de transfert,
 * même calendrier de réunions optionnel, mêmes clés i18n.
 *
 * Préremplit `label`/`startDate`/`endDate` via `suggestNextFiscalYear` — champs
 * restant modifiables, comme avant l'ajout de cette suggestion.
 */
export function FiscalYearCreateDialog({ open, onOpenChange, tenantId, years }: { open: boolean; onOpenChange: (open: boolean) => void; tenantId: string; years: FiscalYear[] }) {
  const { t, locale } = useLocale();
  const current = years.find((year) => year.isCurrent);
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState(() => suggestNextFiscalYear(years));
  const [error, setError] = useState<string | undefined>();
  const [transferSelections, setTransferSelections] = useState<Set<string>>(new Set());
  const [meetingSchedule, setMeetingSchedule] = useState<Partial<MeetingScheduleConfig>>({});

  // Réinitialise l'assistant à chaque ouverture — pas seulement au montage — pour
  // toujours repartir d'une suggestion fraîche (le tenant/la liste peuvent avoir changé).
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setForm(suggestNextFiscalYear(years));
    setError(undefined);
    setTransferSelections(new Set());
    setMeetingSchedule({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleTransferCategory = (categoryId: string) => setTransferSelections((current) => {
    const next = new Set(current);
    if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
    return next;
  });

  const createMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.createFiscalYear>>, CreateFiscalYearInput>({
    mutationFn: (input) => settingsService.createFiscalYear(tenantId, input),
    invalidateKeys: [queryKeys.settings.fiscalYears(tenantId)],
    onSuccess: (year) => {
      if (!year) { setError(t('settings', 'fiscalYearInvalid')); setStep(1); return; }
      notify.success(t('settings', 'fiscalYearCreated', { label: year.label }));
      onOpenChange(false);
    },
  });

  const handleContinueToTransferStep = () => {
    if (!form.label.trim() || !form.startDate || !form.endDate) { setError(t('settings', 'fieldRequired')); return; }
    if (new Date(form.endDate) <= new Date(form.startDate)) { setError(t('settings', 'fiscalYearInvalidPeriod')); return; }
    setError(undefined);
    setStep(2);
  };
  const handleCreate = () => {
    if (createMutation.isPending) return;
    createMutation.mutate({
      ...form,
      transferSelections: Array.from(transferSelections),
      meetingSchedule: isValidMeetingScheduleConfig(meetingSchedule) ? meetingSchedule : undefined,
    });
  };

  if (!open) return null;

  return <>
    {step === 1 && <ConfirmDialog open title={t('settings', 'createFiscalYearStep1Title')} description={t('settings', 'createFiscalYearDescription')} confirmLabel={t('settings', 'continueAction')} cancelLabel={t('settings', 'cancel')} onConfirm={handleContinueToTransferStep} onCancel={() => onOpenChange(false)}>
      <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-left">
        {current && <p className="text-xs text-muted-foreground">{t('settings', 'previousFiscalYear', { label: current.label })}</p>}
        <div className="space-y-1"><Label htmlFor="fy-create-label">{t('settings', 'fiscalYear')}</Label><Input id="fy-create-label" value={form.label} onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))} aria-invalid={Boolean(error)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="fy-create-start">{t('settings', 'startDate')}</Label><Input id="fy-create-start" type="date" value={form.startDate} onChange={(event) => setForm((value) => ({ ...value, startDate: event.target.value }))} aria-invalid={Boolean(error)} /></div>
          <div className="space-y-1"><Label htmlFor="fy-create-end">{t('settings', 'endDate')}</Label><Input id="fy-create-end" type="date" value={form.endDate} onChange={(event) => setForm((value) => ({ ...value, endDate: event.target.value }))} aria-invalid={Boolean(error)} /></div>
        </div>
        <FieldError message={error} />
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium">{t('settings', 'meetingScheduleOptional')}</p>
          <p className="text-[11px] text-muted-foreground">{t('settings', 'meetingScheduleCreateHint')}</p>
          <MeetingScheduleFields locale={locale} value={meetingSchedule} onChange={setMeetingSchedule} idPrefix="fy-create-meeting" />
        </div>
      </div>
    </ConfirmDialog>}
    {step === 2 && <ConfirmDialog open title={t('settings', 'createFiscalYearStep2Title')} description={t('settings', 'transferStepDescription', { source: current?.label ?? '—', target: form.label })} confirmLabel={createMutation.isPending ? t('settings', 'saving') : t('settings', 'createFiscalYearAction')} confirmDisabled={createMutation.isPending} cancelLabel={t('settings', 'back')} onConfirm={handleCreate} onCancel={() => setStep(1)}>
      <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1 text-left">
        {fiscalYearTransferCategories.map((category) => {
          const checked = transferSelections.has(category.id);
          return (
            <div key={category.id} className={`flex items-start gap-3 rounded-lg border p-3 ${category.transferable ? 'border-border' : 'border-dashed border-border/70 bg-muted/30'}`}>
              {category.transferable
                ? <Checkbox id={`transfer-${category.id}`} checked={checked} onCheckedChange={() => toggleTransferCategory(category.id)} className="mt-0.5" />
                : <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Lock size={12} /></span>}
              <label htmlFor={category.transferable ? `transfer-${category.id}` : undefined} className={`min-w-0 flex-1 ${category.transferable ? 'cursor-pointer' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{t('settings', category.labelKey)}</p>
                  <StatusBadge label={t('settings', TRANSFERABILITY_KEY[category.transferability])} tone={TRANSFERABILITY_TONE[category.transferability]} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('settings', category.transferabilityReasonKey)}</p>
              </label>
            </div>
          );
        })}
        <div data-testid="transfer-summary" className="space-y-1.5 rounded-lg border border-dashed border-border p-3 text-xs leading-5">
          <p className="font-semibold text-foreground">{t('settings', 'transferSummarySelected')}</p>
          {fiscalYearTransferCategories.filter((category) => category.transferable && transferSelections.has(category.id)).length === 0
            ? <p className="text-muted-foreground">{t('settings', 'transferSummaryNone')}</p>
            : fiscalYearTransferCategories.filter((category) => category.transferable && transferSelections.has(category.id)).map((category) => <p key={category.id} className="text-emerald-600">✓ {t('settings', category.labelKey)}</p>)}
          <p className="mt-2 font-semibold text-foreground">{t('settings', 'transferSummaryNotSelected')}</p>
          {fiscalYearTransferCategories.filter((category) => !category.transferable || !transferSelections.has(category.id)).map((category) => <p key={category.id} className="text-muted-foreground">— {t('settings', category.labelKey)}</p>)}
        </div>
      </div>
      <FieldError message={error} />
    </ConfirmDialog>}
  </>;
}
