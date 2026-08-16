import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { useLocale } from '@/contexts/locale-context';

/**
 * Abstraction commune pour les mutations mock (create/update/delete/transition).
 * N'introduit aucun backend : `mutationFn` continue d'écrire dans les mocks en
 * mémoire via les `*.service.ts` existants — ce hook standardise seulement le
 * feedback (toast) et l'invalidation ciblée des query keys concernées.
 */
export function useMockMutation<TData, TVariables>({
  mutationFn,
  invalidateKeys = [],
  successMessage,
  errorMessage,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidateKeys?: QueryKey[];
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: TData, variables: TVariables) => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useLocale();
  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      if (successMessage) notify.success(successMessage);
      onSuccess?.(data, variables);
    },
    onError: () => {
      notify.error(errorMessage ?? t('system', 'errorTitle'));
    },
  });
}
