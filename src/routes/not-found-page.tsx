import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/contexts/locale-context';

/**
 * Utilisée à la fois comme route de secours (`*` → `/404`) et, rendue en
 * place, comme réponse neutre d'une fiche de détail dont la ressource est
 * introuvable OU appartient à un autre tenant (voir services/tenant-scope.ts)
 * — les deux cas produisent volontairement le même écran, pour ne jamais
 * révéler qu'une ressource existe ailleurs.
 */
export function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground"><Compass size={28} /></span>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.15em] text-primary">{t('system', 'notFoundEyebrow')}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('system', 'notFoundTitle')}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('system', 'notFoundDescription')}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>{t('system', 'goBack')}</Button>
        <Button onClick={() => navigate('/dashboard')}>{t('system', 'goDashboard')}</Button>
      </div>
    </div>
  );
}
