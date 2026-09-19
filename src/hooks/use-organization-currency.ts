import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/contexts/tenant-context';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';

/**
 * SOURCE DE VÉRITÉ UNIQUE de la devise affichée : Paramètres > Organisation
 * (`organizationSettingsList`, `settingsService.getOrganizationSettings`),
 * jamais une seconde configuration. Réutilise la même `queryKey` que
 * `settings-module.tsx`/`tontines-module.tsx` : React Query dédoublonne
 * automatiquement la requête, aucun appel réseau supplémentaire par
 * composant (audit "normalisation devises" §29).
 *
 * Retourne le code ISO du tenant courant (`undefined` tant que le
 * paramètre n'est pas chargé) — jamais un libellé d'affichage, jamais une
 * devise par défaut devinée : `formatCurrency`/`MoneyDisplay` savent gérer
 * un code `undefined` sans fabriquer une devise arbitraire.
 */
export function useOrganizationCurrency(): string | undefined {
  const { currentTenant } = useTenant();
  const { data } = useQuery({
    queryKey: queryKeys.settings.organization(currentTenant.id),
    queryFn: () => settingsService.getOrganizationSettings(currentTenant.id),
  });
  return data?.currency;
}
