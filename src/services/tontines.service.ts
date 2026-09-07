import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tontines, type Tontine } from '@/mocks/tontines/tontines';
import { isValidFrequencyConfig } from '@/mocks/tontines/tontine-frequency';

export type TontineInput = Pick<Tontine, 'name' | 'valueType' | 'tenantId' | 'currency' | 'purchaseMode' | 'contributionAmount' | 'item' | 'quantity' | 'unit'
  | 'frequency' | 'weekday' | 'monthlyRule' | 'monthlyDayOfMonth' | 'monthlyOrdinal' | 'monthlyWeekday'
  | 'quarterlyRule' | 'quarterlyMonth' | 'quarterlyDayOfMonth' | 'quarterlyOrdinal' | 'quarterlyWeekday'>;
export type TontineUpdateInput = Partial<Omit<TontineInput, 'tenantId'>>;

/**
 * MONEY exige un montant de cotisation strictement positif (mandat « montant de cotisation »,
 * §1/§5) ; GOODS n'en a pas besoin, quelle que soit la valeur passée (jamais utilisée pour une
 * tontine non financière, même si une ancienne valeur traîne après un changement de valueType).
 */
function isNonBlankString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStrictlyPositiveNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Valide la configuration métier complète, y compris pour les appels directs au service. */
function isValidTontineConfiguration(input: Pick<Tontine, 'name' | 'valueType' | 'contributionAmount' | 'item' | 'quantity' | 'unit'>): boolean {
  if (!isNonBlankString(input.name)) return false;
  if (input.valueType === 'MONEY') return isStrictlyPositiveNumber(input.contributionAmount);
  return isNonBlankString(input.item) && isStrictlyPositiveNumber(input.quantity) && isNonBlankString(input.unit);
}

/** Un patch ne touchant à aucun champ de fréquence n'a pas à revalider une configuration déjà complète (ex. tontines pré-migration, cf. tontines.ts) — évite de bloquer une modification portant sur un champ non lié (mandat « Fréquence obligatoire », exigence de compatibilité avec les tontines existantes). */
function patchTouchesFrequency(patch: TontineUpdateInput): boolean {
  return 'frequency' in patch || 'weekday' in patch || 'monthlyRule' in patch || 'monthlyDayOfMonth' in patch || 'monthlyOrdinal' in patch || 'monthlyWeekday' in patch
    || 'quarterlyRule' in patch || 'quarterlyMonth' in patch || 'quarterlyDayOfMonth' in patch || 'quarterlyOrdinal' in patch || 'quarterlyWeekday' in patch;
}

/** Les attributs propres à un type ne sont jamais conservés lors d'un changement de type. */
function keepOnlyFieldsForValueType(tontine: Tontine): void {
  if (tontine.valueType === 'MONEY') {
    delete tontine.item;
    delete tontine.quantity;
    delete tontine.unit;
    return;
  }
  delete tontine.currency;
  delete tontine.purchaseMode;
  delete tontine.contributionAmount;
}

export const tontinesService = {
  listTontines: (tenantId: string) => mockRequest(() => tontines.filter((tontine) => tontine.tenantId === tenantId)),
  getTontine: (tenantId: string, tontineId: string) => mockRequest(() => getTenantScoped(tontines, (tontine) => tontine.id === tontineId, tenantId)),
  createTontine: (input: TontineInput) =>
    mockRequest(() => {
      if (!isValidTontineConfiguration(input)) return undefined;
      if (!isValidFrequencyConfig(input)) return undefined;
      const tontine: Tontine = { id: `TON-${String(tontines.length + 1).padStart(3, '0')}`, status: 'statusActive', memberCount: 0, totalContributions: 0, createdAt: new Date().toISOString().slice(0, 10), ...input };
      keepOnlyFieldsForValueType(tontine);
      tontines.push(tontine);
      return tontine;
    }),

  /** Aucun champ technique (id/tenantId/status/memberCount/totalContributions/createdAt) n'est jamais accepté en entrée — seule la configuration métier peut être modifiée. */
  updateTontine: (tenantId: string, tontineId: string, patch: TontineUpdateInput) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      const nextValueType = patch.valueType ?? tontine.valueType;
      const nextConfiguration = {
        name: patch.name ?? tontine.name,
        valueType: nextValueType,
        contributionAmount: patch.contributionAmount ?? tontine.contributionAmount,
        item: patch.item ?? tontine.item,
        quantity: patch.quantity ?? tontine.quantity,
        unit: patch.unit ?? tontine.unit,
      };
      if (!isValidTontineConfiguration(nextConfiguration)) return undefined;
      if (patchTouchesFrequency(patch)) {
        /** `'x' in patch`, jamais `patch.x ?? tontine.x` : un patch avec `frequency: undefined` explicite doit être traité comme une tentative de vider le champ, pas comme une absence de changement (sinon la validation retomberait silencieusement sur l'ancienne valeur alors qu'Object.assign, lui, écrase bien tontine.frequency avec `undefined`). */
        const nextFrequencyConfig = {
          frequency: 'frequency' in patch ? patch.frequency : tontine.frequency,
          weekday: 'weekday' in patch ? patch.weekday : tontine.weekday,
          monthlyRule: 'monthlyRule' in patch ? patch.monthlyRule : tontine.monthlyRule,
          monthlyDayOfMonth: 'monthlyDayOfMonth' in patch ? patch.monthlyDayOfMonth : tontine.monthlyDayOfMonth,
          monthlyOrdinal: 'monthlyOrdinal' in patch ? patch.monthlyOrdinal : tontine.monthlyOrdinal,
          monthlyWeekday: 'monthlyWeekday' in patch ? patch.monthlyWeekday : tontine.monthlyWeekday,
          quarterlyRule: 'quarterlyRule' in patch ? patch.quarterlyRule : tontine.quarterlyRule,
          quarterlyMonth: 'quarterlyMonth' in patch ? patch.quarterlyMonth : tontine.quarterlyMonth,
          quarterlyDayOfMonth: 'quarterlyDayOfMonth' in patch ? patch.quarterlyDayOfMonth : tontine.quarterlyDayOfMonth,
          quarterlyOrdinal: 'quarterlyOrdinal' in patch ? patch.quarterlyOrdinal : tontine.quarterlyOrdinal,
          quarterlyWeekday: 'quarterlyWeekday' in patch ? patch.quarterlyWeekday : tontine.quarterlyWeekday,
        };
        if (!isValidFrequencyConfig(nextFrequencyConfig)) return undefined;
      }
      Object.assign(tontine, patch);
      keepOnlyFieldsForValueType(tontine);
      return tontine;
    }),
};
