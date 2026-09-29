import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/contexts/tenant-context';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import { resolveRegionalFormat, setActiveRegionalFormat } from '@/lib/number-format';

/**
 * Active le FORMAT RÉGIONAL de l'association courante (Paramètres → Organisation) pour tout
 * l'affichage (`formatNumber` / `formatCurrency`). Même `queryKey` que `useOrganizationCurrency`
 * et la page Organisation : React Query dédoublonne la requête. Sans configuration → défaut
 * (espace, virgule). Retourne une clé stable par format, que le shell utilise pour redessiner
 * le contenu quand l'association change de format.
 */
export function useRegionalFormatSync(): string {
  const { currentTenant } = useTenant();
  const { data } = useQuery({
    queryKey: queryKeys.settings.organization(currentTenant.id),
    queryFn: () => settingsService.getOrganizationSettings(currentTenant.id),
  });
  const format = resolveRegionalFormat(data);
  // Idempotent et synchrone : le format est posé AVANT le rendu des pages enfants.
  setActiveRegionalFormat(format);
  return `${format.thousandsSeparator}-${format.decimalSeparator}`;
}
