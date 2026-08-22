import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/locale-context';

/** Une seule logique d'initiales, réutilisée (jamais dupliquée) partout où l'identité d'un membre est affichée. */
export function getInitials(name: string): string {
  return name.split(' ').map((word) => word[0]).join('').slice(0, 2);
}

const SIZE_CLASSES = { sm: 'size-9 text-xs', lg: 'size-14 text-lg' } as const;

/**
 * Représentation visuelle centralisée d'un membre : photo réelle si disponible et
 * chargeable, sinon initiales — même logique de fallback partout (module Membres :
 * liste, fiche détail, impression, bureau/gouvernance ; module Tontines : adhésions,
 * cotisations, opérations). `photoUrl` vide (`''`, convention déjà utilisée par
 * `phone`/`email`/`matricule` sur `Member`) ou en échec de chargement (`onError`)
 * retombent tous les deux sur les initiales, sans jamais afficher une image cassée.
 *
 * Vit dans `@/components` (partagé) plutôt que dans `features/organization/` : dès
 * qu'un deuxième domaine (Tontines) en a eu besoin, le garder local à Membres aurait
 * forcé soit une duplication de cette logique, soit un import inter-features — les
 * deux proscrits par l'architecture de ce projet (chaque `features/<domaine>` reste
 * autonome, ne dépend que de `@/components`/`@/services`/`@/mocks`/`@/contexts`).
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
