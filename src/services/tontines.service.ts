import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tontines, type Tontine } from '@/mocks/tontines/tontines';
import { isValidFrequencyConfig } from '@/mocks/tontines/tontine-frequency';
import { accounts, normalizeAccountLabel } from '@/mocks/finance/accounts';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';

/** Libellé canonique de la caisse « Achat tontine » (mandat « Avec achat ») — comparé de façon normalisée (cf. `normalizeAccountLabel`), comme la règle d'unicité des libellés de caisse. */
const PURCHASE_ACCOUNT_LABEL = 'Achat tontine';

export type TontineInput = Pick<Tontine, 'name' | 'valueType' | 'tenantId' | 'currency' | 'purchaseMode' | 'contributionAmount' | 'item' | 'quantity' | 'unit' | 'accountId'
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

/**
 * Résout la caisse « Achat tontine » du tenant courant (mandat « Avec achat »)
 * — jamais choisie par l'utilisateur, uniquement par correspondance de
 * libellé normalisé, comme la règle d'unicité des libellés de caisse
 * (`hasAccountLabelConflict`). `undefined` si ce tenant n'a pas (encore)
 * configuré cette caisse — la tontine est alors créée/modifiée sans
 * association plutôt que de bloquer l'utilisateur (aucune règle de blocage
 * n'est sourcée pour ce cas).
 */
function resolvePurchaseAccountId(tenantId: string): string | undefined {
  return accounts.find((account) => account.tenantId === tenantId && normalizeAccountLabel(account.title) === normalizeAccountLabel(PURCHASE_ACCOUNT_LABEL))?.id;
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
  delete tontine.purchaseAccountId;
  delete tontine.contributionAmount;
  // Mandat « intégration Tontine ↔ Finance » : le rattachement à une caisse n'a de sens
  // que pour un flux monétaire — une tontine GOODS n'a pas de compte financier.
  delete tontine.accountId;
}

/**
 * `accountId` (mandat « intégration Tontine ↔ Finance ») doit référencer une
 * caisse du MÊME tenant, sinon la tontine pourrait poster ses transactions
 * dans le compte d'une autre organisation — même règle d'isolation que
 * partout ailleurs dans le projet, appliquée ici avant toute écriture.
 * `undefined`/absent reste toujours valide (rétrocompatibilité totale).
 */
function isValidAccountLink(tenantId: string, accountId: string | undefined): boolean {
  if (!accountId) return true;
  return accounts.some((account) => account.id === accountId && account.tenantId === tenantId);
}

/**
 * Source unique de la devise d'une tontine MONEY : Paramètres > Organisation
 * (`organizationSettingsList`), jamais le formulaire de création (mandat
 * « devise automatique »). Lue directement depuis le mock au même titre que
 * `accounts` ci-dessus, pas via `settingsService`, pour rester synchrone dans
 * ce `mockRequest`. Pas de repli XAF/défaut silencieux : un tenant sans
 * devise configurée ne peut pas voir sa demande de création satisfaite.
 */
function getOrganizationCurrency(tenantId: string): string | undefined {
  return organizationSettingsList.find((item) => item.tenantId === tenantId)?.currency;
}

export const tontinesService = {
  listTontines: (tenantId: string) => mockRequest(() => tontines.filter((tontine) => tontine.tenantId === tenantId)),
  getTontine: (tenantId: string, tontineId: string) => mockRequest(() => getTenantScoped(tontines, (tontine) => tontine.id === tontineId, tenantId)),
  createTontine: (input: TontineInput) =>
    mockRequest(() => {
      if (!isValidTontineConfiguration(input)) return undefined;
      if (!isValidFrequencyConfig(input)) return undefined;
      if (!isValidAccountLink(input.tenantId, input.accountId)) return undefined;
      /** Toute `currency` envoyée par l'appelant est ignorée pour MONEY — la devise de l'organisation fait foi, le client ne peut pas la contourner (§6 mandat « devise automatique », même logique de protection que `isValidAccountLink`). */
      const organizationCurrency = getOrganizationCurrency(input.tenantId);
      if (input.valueType === 'MONEY' && !organizationCurrency) return undefined;
      const tontine: Tontine = { id: `TON-${String(tontines.length + 1).padStart(3, '0')}`, status: 'statusActive', memberCount: 0, totalContributions: 0, createdAt: new Date().toISOString().slice(0, 10), ...input, currency: input.valueType === 'MONEY' ? organizationCurrency : input.currency };
      /**
       * « Avec achat » (mandat « Avec achat ») : association PURE à la caisse « Achat tontine »
       * du tenant — jamais choisie par l'utilisateur, jamais de transaction créée ici (cf. doc
       * `Tontine.purchaseAccountId`). N'affecte la propriété QUE si une caisse est réellement
       * résolue — jamais `purchaseAccountId: undefined` explicite, pour ne pas faire apparaître
       * une clé vide sur une tontine "Sans achat"/sans caisse configurée (comme `contributionAmount`,
       * `accountId`, etc., simplement absents quand non pertinents).
       */
      if (tontine.valueType === 'MONEY' && tontine.purchaseMode === 'WITH_PURCHASE') {
        const purchaseAccountId = resolvePurchaseAccountId(tontine.tenantId);
        if (purchaseAccountId) tontine.purchaseAccountId = purchaseAccountId;
      }
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
      if ('accountId' in patch && !isValidAccountLink(tenantId, patch.accountId)) return undefined;
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
      /** « Avec achat » : recalculée uniquement si la modification touche réellement `purchaseMode` ou `valueType` — pas de re-résolution intempestive à chaque modification non liée (ex. changement de nom), la caisse déjà associée reste valide tant que ces deux champs ne bougent pas. `delete` (jamais `= undefined`) pour retirer proprement l'association quand elle ne s'applique plus, cohérent avec `keepOnlyFieldsForValueType` ci-dessous. */
      if ('purchaseMode' in patch || 'valueType' in patch) {
        delete tontine.purchaseAccountId;
        if (tontine.valueType === 'MONEY' && tontine.purchaseMode === 'WITH_PURCHASE') {
          const purchaseAccountId = resolvePurchaseAccountId(tontine.tenantId);
          if (purchaseAccountId) tontine.purchaseAccountId = purchaseAccountId;
        }
      }
      keepOnlyFieldsForValueType(tontine);
      return tontine;
    }),
};
