import { CheckCircle2, Clock, MinusCircle, RotateCcw, XCircle } from 'lucide-react';
import { Timeline } from '@/components';
import type { WorkflowRequest, WorkflowStepStatus } from '@/mocks/operations/workflow-requests';
import { formatDate } from '@/lib/utils';

type T = (section: 'operations', key: string, values?: Record<string, string>) => string;

const STEP_TONE: Record<WorkflowStepStatus, 'default' | 'success' | 'warning' | 'error'> = {
  pending: 'default', approved: 'success', rejected: 'error', returned: 'warning', skipped: 'default',
};
const STEP_LABEL_KEY: Record<WorkflowStepStatus, string> = {
  pending: 'stepPending', approved: 'stepApproved', rejected: 'stepRejected', returned: 'stepReturned', skipped: 'stepSkipped',
};
const STEP_ICON: Record<WorkflowStepStatus, typeof CheckCircle2> = {
  pending: Clock, approved: CheckCircle2, rejected: XCircle, returned: RotateCcw, skipped: MinusCircle,
};

/** Vue générique de la progression d'une demande d'approbation — utilisée par tous les domaines (Crédit, Tontines, Gouvernance, Finance) via WorkflowRequest, sans moteur dédié par domaine. */
export function ApprovalTimeline({ request, t }: { request: WorkflowRequest; t: T }) {
  const items = request.steps.map((step) => {
    const Icon = STEP_ICON[step.status];
    const isCurrent = step.order === request.currentStepOrder && step.status === 'pending';
    return {
      id: step.order,
      title: `${step.order}. ${step.name}`,
      description: <>
        <span className="inline-flex items-center gap-1 font-medium"><Icon size={13} aria-hidden="true" />{t('operations', STEP_LABEL_KEY[step.status])}</span>
        {isCurrent && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">({t('operations', 'currentStep')})</span>}
        {step.actedByName && <span> · {step.actedByName}</span>}
        {step.comment && <span> — {step.comment}</span>}
      </>,
      date: step.actedAt ? formatDate(step.actedAt) : undefined,
      tone: STEP_TONE[step.status],
    };
  });
  return <Timeline items={items} />;
}
