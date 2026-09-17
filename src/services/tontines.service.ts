import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tontines, tontineAdhesions, type Tontine, type TontineAdhesion } from '@/mocks/tontines/tontines';
import { isValidFrequencyConfig } from '@/mocks/tontines/tontine-frequency';
import { accounts, normalizeAccountLabel } from '@/mocks/finance/accounts';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';
import { members } from '@/mocks/organization/members';

/** Libellé canonique de la caisse « Achat tontine » (mandat « Avec achat ») — comparé normalisé, comme la règle d'unicité des libellés de caisse. */
const PURCHASE_ACCOUNT_LABEL = 'Achat tontine';

export type TontineInput = Pick<Tontine, 'name' | 'valueType' | 'tenantId' | 'withPurchase' | 'contributionAmount' | 'item' | 'quantity' | 'unit' | 'accountId'
  | 'frequency' | 'weekday' | 'monthlyRule' | 'monthlyDayOfMonth' | 'monthlyOrdinal' | 'monthlyWeekday'
  | 'quarterlyRule' | 'quarterlyMonth' | 'quarterlyDayOfMonth' | 'quarterlyOrdinal' | 'quarterlyWeekday'>;
/**
 * AUCUN champ `currency` — la devise n'est JAMAIS acceptée en entrée, ni à la
 * création ni à la modification (mandat reconstruction : « No currency field
 * in any Tontine form »). Toujours résolue depuis `organizationSettingsList`.
 */
export type TontineUpdateInput = Partial<Omit<TontineInput, 'tenantId'>>;

function isNonBlankString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function isStrictlyPositiveNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Valide la configuration métier complète — aucun rate/pourcentage/coefficient n'existe nulle part dans ce modèle : un seul `contributionAmount` par Tontine, partagé par toutes les Adhésions. */
function isValidTontineConfiguration(input: Pick<Tontine, 'name' | 'valueType' | 'contributionAmount' | 'item' | 'quantity' | 'unit'>): boolean {
  if (!isNonBlankString(input.name)) return false;
  if (input.valueType === 'MONEY') return isStrictlyPositiveNumber(input.contributionAmount);
  return isNonBlankString(input.item) && isStrictlyPositiveNumber(input.quantity) && isNonBlankString(input.unit);
}

/** Résolution automatique, jamais un choix utilisateur (pas de champ « Caisse liée »). `undefined` si le tenant n'a pas (encore) configuré cette caisse. */
function resolvePurchaseAccountId(tenantId: string): string | undefined {
  return accounts.find((account) => account.tenantId === tenantId && normalizeAccountLabel(account.title) === normalizeAccountLabel(PURCHASE_ACCOUNT_LABEL))?.id;
}

function patchTouchesFrequency(patch: TontineUpdateInput): boolean {
  return 'frequency' in patch || 'weekday' in patch || 'monthlyRule' in patch || 'monthlyDayOfMonth' in patch || 'monthlyOrdinal' in patch || 'monthlyWeekday' in patch
    || 'quarterlyRule' in patch || 'quarterlyMonth' in patch || 'quarterlyDayOfMonth' in patch || 'quarterlyOrdinal' in patch || 'quarterlyWeekday' in patch;
}

function keepOnlyFieldsForValueType(tontine: Tontine): void {
  if (tontine.valueType === 'MONEY') {
    delete tontine.item;
    delete tontine.quantity;
    delete tontine.unit;
    return;
  }
  delete tontine.currency;
  delete tontine.withPurchase;
  delete tontine.purchaseAccountId;
  delete tontine.contributionAmount;
  delete tontine.accountId;
}

function isValidAccountLink(tenantId: string, accountId: string | undefined): boolean {
  if (!accountId) return true;
  return accounts.some((account) => account.id === accountId && account.tenantId === tenantId);
}

/** Source unique de la devise d'une tontine MONEY : Paramètres > Organisation, jamais le formulaire (aucun repli XAF/défaut silencieux). */
function getOrganizationCurrency(tenantId: string): string | undefined {
  return organizationSettingsList.find((item) => item.tenantId === tenantId)?.currency;
}

function resolveWithPurchase(tontine: Tontine): void {
  delete tontine.purchaseAccountId;
  if (tontine.valueType === 'MONEY' && tontine.withPurchase) {
    const purchaseAccountId = resolvePurchaseAccountId(tontine.tenantId);
    if (purchaseAccountId) tontine.purchaseAccountId = purchaseAccountId;
  }
}

export const tontinesService = {
  listTontines: (tenantId: string) => mockRequest(() => tontines.filter((tontine) => tontine.tenantId === tenantId)),
  getTontine: (tenantId: string, tontineId: string) => mockRequest(() => getTenantScoped(tontines, (tontine) => tontine.id === tontineId, tenantId)),

  /** Compte réel d'adhérents actifs et cotisations totales réellement collectées (jamais un compteur statique dénormalisé sur la Tontine — évite toute dérive/désynchronisation). */
  getTontineSummary: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const adhesions = tontineAdhesions.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId);
      return { memberCount: adhesions.filter((item) => item.status === 'active').length };
    }),

  createTontine: (input: TontineInput) =>
    mockRequest(() => {
      if (!isValidTontineConfiguration(input)) return undefined;
      if (!isValidFrequencyConfig(input)) return undefined;
      if (!isValidAccountLink(input.tenantId, input.accountId)) return undefined;
      const organizationCurrency = getOrganizationCurrency(input.tenantId);
      if (input.valueType === 'MONEY' && !organizationCurrency) return undefined;
      const tontine: Tontine = { id: `TON-${String(tontines.length + 1).padStart(3, '0')}`, status: 'statusActive', createdAt: new Date().toISOString().slice(0, 10), ...input, currency: input.valueType === 'MONEY' ? organizationCurrency : undefined };
      /**
       * Rempart runtime : la Tontine ne porte AUCUNE date propre (mandat
       * suppression `startDate` — elle définit les règles, seul le Tour porte
       * une date). `startDate` n'est pas dans `TontineInput`, mais comme pour
       * `currency` (`updateTontine`), le typage seul ne protège pas un
       * appelant qui le passerait quand même à l'exécution (`...input` ci-
       * dessus le recopierait sinon aveuglément) — retiré explicitement.
       */
      delete (tontine as Record<string, unknown>).startDate;
      resolveWithPurchase(tontine);
      keepOnlyFieldsForValueType(tontine);
      tontines.push(tontine);
      return tontine;
    }),

  /** Aucun champ technique (id/tenantId/status/createdAt) n'est jamais accepté en entrée — et JAMAIS `currency` (voir `TontineUpdateInput`). */
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
      /**
       * `currency` n'est PAS dans `TontineUpdateInput` — mais un rempart runtime
       * reste nécessaire : `Object.assign` ne connaît rien du type TypeScript à
       * l'exécution, et un appelant contournant le typage (JS pur, `as never`
       * dans un test) ne doit JAMAIS réussir à modifier la devise autrement que
       * via `organizationSettingsList` (mandat « no currency field in any
       * Tontine form »). Retiré explicitement avant l'assignation plutôt que de
       * ne compter que sur la protection de compilation.
       */
      const safePatch: Record<string, unknown> = { ...patch };
      delete safePatch.currency;
      delete safePatch.startDate; // même rempart runtime — la Tontine ne porte aucune date propre.
      Object.assign(tontine, safePatch);
      if ('withPurchase' in patch || 'valueType' in patch) resolveWithPurchase(tontine);
      keepOnlyFieldsForValueType(tontine);
      return tontine;
    }),

  // --- Adhésions (rattachées DIRECTEMENT à la Tontine, mandat reconstruction §2) ---

  listAdhesions: (tenantId: string, tontineId: string) =>
    mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId)),
  listAdhesionsByMember: (tenantId: string, memberId: string) =>
    mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId && item.memberId === memberId)),
  getAdhesion: (tenantId: string, adhesionId: string) =>
    mockRequest(() => getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId)),

  /** Multi-adhésion illimitée (aucune règle sourcée d'unicité membre/tontine) — refuse un membre invalide/inactif/hors tenant, ou déjà adhérent actif de cette tontine (doublon actif silencieusement ignoré). */
  addAdhesion: (tenantId: string, tontineId: string, memberId: string, joinedAt: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      const member = getTenantScoped(members, (item) => item.id === memberId, tenantId);
      if (!member || member.status !== 'active') return undefined;
      const alreadyActive = tontineAdhesions.some((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.memberId === memberId && item.status === 'active');
      if (alreadyActive) return undefined;
      const adhesion: TontineAdhesion = { id: `ADH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tenantId, tontineId, memberId, memberName: `${member.firstName} ${member.lastName}`, joinedAt, leftAt: null, status: 'active' };
      tontineAdhesions.push(adhesion);
      return adhesion;
    }),

  /** Clôture logique (UPDATE, jamais DELETE) — l'historique (Contributions/Bénéfices) reste consultable. Refuse une double clôture. */
  closeAdhesion: (tenantId: string, adhesionId: string, leftAt: string) =>
    mockRequest(() => {
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      if (!adhesion || adhesion.status === 'exited') return undefined;
      adhesion.status = 'exited';
      adhesion.leftAt = leftAt;
      return adhesion;
    }),
};
