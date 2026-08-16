import { ShieldAlert } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/contexts/locale-context';

export function UnauthorizedPage({ permission: permissionProp }: { permission?: string }) {
  const navigate = useNavigate();
  const { t } = useLocale();
  const location = useLocation();
  const permission = permissionProp ?? (location.state as { permission?: string } | null)?.permission;
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><ShieldAlert size={28} /></span>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.15em] text-primary">{t('system', 'unauthorizedEyebrow')}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('system', 'unauthorizedTitle')}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('system', 'unauthorizedDescription')}</p>
        {permission && <p className="mt-3 text-xs text-muted-foreground">{t('system', 'missingPermission')}: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{permission}</code></p>}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>{t('system', 'goBack')}</Button>
        <Button onClick={() => navigate('/dashboard')}>{t('system', 'goDashboard')}</Button>
      </div>
    </div>
  );
}
