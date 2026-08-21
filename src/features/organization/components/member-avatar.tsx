import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/locale-context';

/** Même algorithme que l'ancien `Avatar(name)` local à `organization-module.tsx` — une seule logique d'initiales, réutilisée (pas dupliquée) par les deux composants. */
export function getInitials(name: string): string {
  return name.split(' ').map((word) => word[0]).join('').slice(0, 2);
}

const SIZE_CLASSES = { sm: 'size-9 text-xs', lg: 'size-14 text-lg' } as const;

/**
 * Représentation visuelle centralisée d'un membre : photo réelle si disponible et
 * chargeable, sinon initiales — même logique de fallback partout (liste, fiche détail,
 * impression, bureau/gouvernance). `photoUrl` vide (`''`, convention déjà utilisée par
 * `phone`/`email`/`matricule` sur `Member`) ou en échec de chargement (`onError`)
 * retombent tous les deux sur les initiales, sans jamais afficher une image cassée.
 */
export function MemberAvatar({ member, size = 'sm', className = '' }: { member: { firstName: string; lastName: string; photoUrl?: string }; size?: keyof typeof SIZE_CLASSES; className?: string }) {
  const { t } = useLocale();
  const fullName = `${member.firstName} ${member.lastName}`;
  const [failed, setFailed] = useState(false);
  // Une nouvelle photo (changement de membre, ou remplacement en édition) mérite une nouvelle chance — sinon un ancien échec resterait figé pour toujours.
  useEffect(() => { setFailed(false); }, [member.photoUrl]);
  const sizeClass = SIZE_CLASSES[size];

  if (member.photoUrl && !failed) {
    return <span className={`block shrink-0 overflow-hidden rounded-xl ${sizeClass} ${className}`}>
      <img src={member.photoUrl} alt={t('organization', 'memberPhotoAlt', { name: fullName })} className="size-full object-cover" onError={() => setFailed(true)} />
    </span>;
  }
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary ${sizeClass} ${className}`}>{getInitials(fullName)}</span>;
}
