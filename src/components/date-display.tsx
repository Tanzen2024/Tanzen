import { formatDate } from '@/lib/utils';

/**
 * Affichage de date global de l'application — toujours JJ/MM/AAAA (mandat
 * « normalisation de l'affichage des dates »), jamais dépendant de la locale
 * (voir `formatDate`). `withTime` ajoute `HH:mm` sans rien retirer.
 */
export function DateDisplay({ value, withTime = false }: { value: string | Date | null | undefined; withTime?: boolean }) {
  if (value === null || value === undefined || value === '') return <span>—</span>;
  const isoValue = value instanceof Date ? value.toISOString() : value;
  return <time dateTime={isoValue}>{formatDate(value, withTime)}</time>;
}

/**
 * Alias historique pour les dates de Tour (Occurrence) — `DateDisplay` et
 * `TourDateDisplay` partagent désormais exactement le même format JJ/MM/AAAA
 * (`formatDate`) ; conservé pour ne pas devoir renommer tous les call sites.
 */
export function TourDateDisplay({ value }: { value: string }) {
  return <time dateTime={value}>{formatDate(value)}</time>;
}
