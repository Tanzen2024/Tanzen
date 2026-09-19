import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { tontines, tontineAdhesions, tontineCycles, type Tontine, type TontineAdhesion, type TontineCycle } from '@/mocks/tontines/tontines';
import { isValidFrequencyConfig } from '@/mocks/tontines/tontine-frequency';
import { accounts } from '@/mocks/finance/accounts';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';
import { members } from '@/mocks/organization/members';
import { resolveSystemAccount } from './finance.service';

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

/**
 * Résolution automatique de la caisse système TONTINE_PURCHASE — jamais un
 * choix utilisateur (pas de champ « Caisse liée »), et jamais par le libellé
 * (`financeService.resolveSystemAccount` identifie par `systemCode`,
 * garantit/adopte le compte au passage, ne le laisse jamais absent).
 */
function resolveWithPurchase(tontine: Tontine): void {
  delete tontine.purchaseAccountId;
  if (tontine.valueType === 'MONEY' && tontine.withPurchase) {
    tontine.purchaseAccountId = resolveSystemAccount(tontine.tenantId, 'TONTINE_PURCHASE').id;
  }
}

/**
 * Tentative de création d'une adhésion pour UN membre — logique partagée par
 * `addAdhesion` (unitaire) et `addAdhesions` (batch), jamais dupliquée. Ne
 * vérifie PAS l'existence de la Tontine (déjà fait par l'appelant, une seule
 * fois, avant la boucle pour `addAdhesions`). `undefined` si le membre est
 * introuvable/hors tenant/inactif.
 *
 * PAS de contrôle « déjà adhérent actif de cette Tontine » (mandat
 * « finalisation ajout multiple d'adhérents » §1/§2/§19) : un membre peut
 * avoir PLUSIEURS représentations/participations distinctes dans une même
 * Tontine (ex. Jean Dupont détient 3 positions dans la même tontine), chacune
 * étant une `TontineAdhesion` à part entière, avec son propre `id` — c'est CET
 * `id` qui identifie sans ambiguïté une représentation (jamais
 * `memberId + tontineId`, qui n'a jamais été une clé d'unicité sourcée). Les
 * Tours/Plans (`TontineBeneficiaryPlan.adhesionId`, `OccurrenceBeneficiary.
 * adhesionId`) référencent déjà cet `id`, jamais `memberId` — chaque
 * représentation peut donc déjà, sans aucun changement de modèle, être
 * planifiée/bénéficier d'un Tour indépendamment des autres représentations du
 * même membre.
 */
function createAdhesionIfEligible(tenantId: string, tontineId: string, memberId: string, joinedAt: string): TontineAdhesion | undefined {
  const member = getTenantScoped(members, (item) => item.id === memberId, tenantId);
  if (!member || member.status !== 'active') return undefined;
  const adhesion: TontineAdhesion = { id: `ADH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tenantId, tontineId, memberId, memberName: `${member.firstName} ${member.lastName}`, joinedAt, leftAt: null, status: 'active' };
  tontineAdhesions.push(adhesion);
  return adhesion;
}

/** Résultat structuré d'un ajout groupé — jamais un simple compteur déduit de `memberIds.length` côté UI : `created.length`/`skipped` reflètent EXACTEMENT ce que le service a réellement fait (mandat §12-§17, « ne jamais afficher un succès trompeur »). */
export type AddAdhesionsResult = { created: TontineAdhesion[]; skipped: number };

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
      /**
       * Cycle système 1 — créé automatiquement, jamais choisi/saisi par
       * l'utilisateur (mandat « recommencement automatique de la Tontine »).
       * Chaque Tontine possède TOUJOURS un cycle `OPEN` dès sa création :
       * `tontine-operations.service.ts` (`getCurrentCycle`) n'a donc jamais
       * à en créer un implicitement.
       */
      const cycle: TontineCycle = { id: `CYC-${String(tontineCycles.length + 1).padStart(3, '0')}-${Date.now()}`, tenantId: tontine.tenantId, tontineId: tontine.id, cycleNumber: 1, status: 'OPEN', startedAt: new Date().toISOString(), closedAt: null };
      tontineCycles.push(cycle);
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

  /**
   * Multi-adhésion illimitée — CROSS-tontine (un membre peut adhérer à
   * autant de Tontines qu'il veut) ET INTRA-tontine (mandat « finalisation
   * ajout multiple d'adhérents » §1/§2 : un membre peut détenir plusieurs
   * représentations distinctes dans la MÊME Tontine — chaque appel crée une
   * nouvelle représentation, jamais bloqué par une adhésion déjà active du
   * même membre). Refuse uniquement un membre invalide/inactif/hors tenant.
   */
  addAdhesion: (tenantId: string, tontineId: string, memberId: string, joinedAt: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      return createAdhesionIfEligible(tenantId, tontineId, memberId, joinedAt);
    }),

  /**
   * Ajout groupé (mandat « ajout multiple d'adhérents ») — un seul aller-
   * retour au lieu d'un appel par membre sélectionné dans le Dialog. Réutilise
   * exactement la même logique d'éligibilité que `addAdhesion` (jamais
   * dupliquée). Ne déduplique PAS `memberIds` : si le même id apparaît
   * plusieurs fois (jamais le cas depuis le Dialog actuel, dont la sélection
   * est un `Set`, mais un appelant futur — ex. « ajouter plusieurs
   * représentations d'un coup » — doit pouvoir en dépendre), chaque occurrence
   * crée sa PROPRE représentation, cohérent avec §1/§2 ci-dessus. Retourne un
   * résultat structuré (`created`/`skipped`), jamais un simple tableau : l'UI
   * ne doit jamais déduire un compte de succès de `memberIds.length`, mais du
   * nombre RÉELLEMENT créé (mandat §12-§17).
   */
  addAdhesions: (tenantId: string, tontineId: string, memberIds: string[], joinedAt: string): Promise<AddAdhesionsResult> =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return { created: [], skipped: memberIds.length };
      const created: TontineAdhesion[] = [];
      let skipped = 0;
      for (const memberId of memberIds) {
        const adhesion = createAdhesionIfEligible(tenantId, tontineId, memberId, joinedAt);
        if (adhesion) created.push(adhesion); else skipped += 1;
      }
      return { created, skipped };
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
