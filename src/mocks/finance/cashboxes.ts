/**
 * Cashbox = « Caisse » (mandat CAISSE, reconstruction « Module Caisse »).
 * `type` porte la nature de la cotisation — LIBRE (montant variable) ou
 * TAUX_FIXE (montant fixé) — jamais une nature comptable
 * (ASSET/LIABILITY/...), jamais réutilisé pour autre chose que ça (il ne
 * conditionne que le caractère obligatoire du montant).
 *
 * Le sens comptable (débit/crédit) est porté exclusivement par la transaction
 * (`Transaction.type`), jamais par la caisse : l'ancien champ de sens
 * financier de la caisse et les caisses spécialisées associées ont été
 * supprimés, sans mécanisme de remplacement.
 *
 * Les caisses sont référencées par id (`AC-xxx`, préfixe technique conservé
 * tel quel — IMMUABLE, jamais affiché à l'utilisateur).
 * `memberIds` réutilise directement `Cashbox` pour porter la relation
 * Caisse ↔ Membre (adhérents affectés à la caisse) plutôt que d'introduire
 * une entité de jointure séparée, qui n'existe nulle part ailleurs dans le modèle.
 */
export type CashboxType = 'LIBRE' | 'TAUX_FIXE';
/**
 * Cycle de vie d'une caisse (mandat « Évolution globale du module Finance ») :
 * `active` (opérationnelle) → `inactive` (« Désactivée », réversible) →
 * `archived` (« Archivée », sortie de la gestion courante). Aucun statut ne
 * supprime quoi que ce soit : l'historique reste consultable. Seule une caisse
 * `active` reçoit de nouvelles transactions (`isCashboxOperational`).
 */
export type CashboxStatus = 'active' | 'inactive' | 'archived';

/** Seule une caisse ACTIVE peut recevoir une nouvelle transaction — règle appliquée par `insertTransaction`, jamais seulement par l'UI. */
export function isCashboxOperational(cashbox: Pick<CashboxRecord, 'status'>): boolean {
  return cashbox.status === 'active';
}

/**
 * Code technique d'une caisse SYSTÈME (mandat « robustifier Achat tontine »,
 * étendu par le mandat « centre financier — caisses système Épargne /
 * Inscription / Secours »). Résolu et protégé par `financeService`
 * (`ensureSystemCashbox`/`resolveSystemCashbox`, `updateCashbox`,
 * `deleteCashbox`) — jamais choisi/modifié par l'utilisateur.
 */
export type SystemCashboxCode = 'TONTINE_PURCHASE' | 'SAVINGS' | 'REGISTRATION' | 'EMERGENCY_FUND';

export type Cashbox = {
  id: string;
  tenantId: string;
  /** Généré par le système (`financeService.createCashbox`), jamais saisi manuellement. */
  cashboxNumber: string;
  /** Titre métier de la caisse (« Epargne », « Inscription »...). */
  title: string;
  type: CashboxType;
  /**
   * Identité TECHNIQUE d'une caisse système — `undefined` pour une caisse
   * ordinaire. Source de vérité unique de « ceci est la caisse système
   * TONTINE_PURCHASE de ce tenant », JAMAIS son libellé (`title`, une simple
   * donnée d'affichage) : ne plus dépendre de `normalizeCashboxLabel(title)
   * === "achat tontine"` pour l'identification (mandat « ne pas identifier la
   * caisse uniquement par son libellé »). Voir `isSystemCashbox`.
   */
  systemCode?: SystemCashboxCode;
  /** Montant de cotisation fixe si TAUX_FIXE ; toujours `null` si LIBRE. */
  amount: number | null;
  description: string;
  /**
   * Report d'ouverture : situation de la caisse ANTÉRIEURE au journal des
   * transactions (historique non détaillé ligne à ligne). C'est la seule
   * composante stockée du solde ; toute écriture postérieure passe par une
   * `Transaction`. `financeService.recordCashboxMovement` est le seul point
   * d'ajustement manuel de ce report.
   */
  openingBalance: number;
  /**
   * Solde courant — JAMAIS stocké : calculé par `resolveCashbox()` à chaque
   * lecture comme `openingBalance + Σ(crédits comptabilisés) − Σ(débits
   * comptabilisés)` sur les transactions `status === 'completed'` de CETTE
   * caisse (même tenant, `cashboxNumber` du côté non-adhérent de l'écriture).
   * Les transactions `pending`/`failed`/`cancelled` n'entrent pas dans le solde.
   */
  balance: number;
  /** Adhérents affectés à cette caisse. */
  memberIds: string[];
  tenantName: string;
  status: CashboxStatus;
  /** Date d'ouverture de la caisse — sert de « dernier mouvement » tant qu'aucune transaction n'est comptabilisée. */
  openedOn: string;
  /**
   * Dernier mouvement — JAMAIS stocké : calculé par `resolveCashbox()` comme la
   * date (`transaction_at` = `recordedAt`, à défaut `date`) de la transaction
   * comptabilisée la plus récente de la caisse, sinon `openedOn`. Jamais la
   * date de la séance rattachée (`Transaction.sessionId` → `FiscalSession.date`),
   * distincte de la date de transaction.
   */
  lastMovement: string;
};

/**
 * Forme réellement stockée d'une caisse : `balance` et `lastMovement` sont des
 * champs calculés (voir `resolveCashbox`) et n'existent donc pas dans le seed
 * ni dans le tableau `cashboxes` mutable.
 */
export type CashboxRecord = Omit<Cashbox, 'balance' | 'lastMovement'>;

// Jeu de démonstration T-001 (nettoyage du 2026-09-27) : seules les caisses SYSTÈME (`systemCode`) et
// « Transport » sont conservées. Les caisses historiques Trésorerie (AC-001), Épargne (AC-002), Compte
// courant (AC-003), Achat argent (AC-013) et Fond de solidarité (AC-014) ont été retirées du seed, avec
// leurs transactions et adhésions. Leurs identifiants ne sont jamais réutilisés.
export const cashboxes: CashboxRecord[] = [
  { id: 'AC-004', tenantId: 'T-002', cashboxNumber: 'TH-002-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', openingBalance: 6_200_000, tenantName: 'Tontine Horizon', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-005', tenantId: 'T-002', cashboxNumber: 'TH-002-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', openingBalance: 1_975_000, tenantName: 'Tontine Horizon', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-006', tenantId: 'T-003', cashboxNumber: 'MT-003-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', openingBalance: 6_600_000, tenantName: 'Mutuelle Teranga', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-007', tenantId: 'T-003', cashboxNumber: 'MT-003-COUR', title: 'Compte courant', type: 'LIBRE', amount: null, description: '', openingBalance: 1_450_000, tenantName: 'Mutuelle Teranga', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-008', tenantId: 'T-004', cashboxNumber: 'AJ-004-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', openingBalance: 320_000, tenantName: 'Association Jappo', status: 'inactive', openedOn: '2026-01-01', memberIds: [] },

  // Caisses de cotisation (mandat CAISSE, §15 — reproduit l'écran historique).
  // AC-009/AC-010/AC-011 sont les caisses système SAVINGS/REGISTRATION/
  // EMERGENCY_FUND historiques de T-001, ADOPTÉES par `systemCode` via
  // `ensureSystemCashbox` (mandat « centre financier ») — jamais dupliquées,
  // même mécanisme que « Achat tontine » (AC-015/AC-016).
  { id: 'AC-009', tenantId: 'T-001', cashboxNumber: 'CS-001-CX-001', title: 'Épargne', type: 'LIBRE', amount: null, description: 'Epargne volontaire des adhérents', openingBalance: 8_650_000, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [], systemCode: 'SAVINGS' },
  { id: 'AC-010', tenantId: 'T-001', cashboxNumber: 'CS-001-CX-002', title: 'Inscription', type: 'TAUX_FIXE', amount: 500, description: "Cotisation d'inscription", openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [], systemCode: 'REGISTRATION' },
  { id: 'AC-011', tenantId: 'T-001', cashboxNumber: 'CS-001-CX-003', title: 'Secours', type: 'TAUX_FIXE', amount: 12_000, description: '', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [], systemCode: 'EMERGENCY_FUND' },
  { id: 'AC-012', tenantId: 'T-001', cashboxNumber: 'CS-001-CX-004', title: 'Transport', type: 'TAUX_FIXE', amount: 5_000, description: '', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [] },

  // Caisses système « Achat tontine » (TONTINE_PURCHASE, mandat « robustifier
  // Achat tontine ») — une par tenant, identifiée par `systemCode`, jamais par
  // son libellé. Seule la caisse marquée `systemCode: 'TONTINE_PURCHASE'` du
  // tenant courant reçoit les montants d'achat — jamais les cotisations (cf.
  // doc du champ `Tontine.purchaseCashboxId`). T-003/T-004/T-005 n'ont pas
  // besoin d'être seedés ici : `financeService` les garantit automatiquement
  // (`ensureSystemCashbox`), idempotent, pour tout tenant présent dans
  // `mocks/organization/tenants.ts`.
  { id: 'AC-015', tenantId: 'T-001', cashboxNumber: 'CS-001-CX-008', title: 'Achat tontine', type: 'LIBRE', amount: null, description: 'Caisse dédiée aux achats de tontines de ce tenant.', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [], systemCode: 'TONTINE_PURCHASE' },
  { id: 'AC-016', tenantId: 'T-002', cashboxNumber: 'TH-002-CX-001', title: 'Achat tontine', type: 'LIBRE', amount: null, description: 'Caisse dédiée aux achats de tontines de ce tenant.', openingBalance: 0, tenantName: 'Tontine Horizon', status: 'active', openedOn: '2026-08-01', memberIds: [], systemCode: 'TONTINE_PURCHASE' },
];

/**
 * `true` si CETTE caisse est une caisse SYSTÈME (identifiée par `systemCode`,
 * jamais par son libellé) — protégée contre le renommage, la suppression et la
 * désactivation, cf. `financeService.updateCashbox`/`deleteCashbox`.
 */
export function isSystemCashbox(cashbox: Pick<CashboxRecord, 'systemCode'>): boolean {
  return Boolean(cashbox.systemCode);
}

/**
 * RÈGLE MÉTIER PERMANENTE TANZEN — UNICITÉ DU LIBELLÉ DE CAISSE.
 * Deux caisses d'un même tenant ne peuvent pas porter le même libellé.
 * L'unicité porte sur le couple (`tenantId` + libellé NORMALISÉ), jamais
 * globalement à la plateforme : « Épargne » chez le tenant A et « Épargne »
 * chez le tenant B sont autorisés ; « Épargne » et « epargne » chez le même
 * tenant sont un conflit.
 *
 * `normalizeCashboxLabel` ne sert QU'AU CONTRÔLE D'UNICITÉ — le libellé
 * original correctement saisi (`Cashbox.title`) est conservé tel quel pour
 * l'affichage. Normalisation : suppression des espaces de bord, réduction des
 * espaces multiples, insensible à la casse, insensible aux accents.
 *   «  ÉPARGNE  » ≡ « Épargne » ≡ « epargne » ≡ « Epargne »  → « epargne »
 *
 * Toute fonctionnalité qui crée / modifie / importe / synchronise une caisse
 * doit passer par ce contrôle (`hasCashboxLabelConflict`).
 */
export function normalizeCashboxLabel(label: string): string {
  return label
    .normalize('NFD')
    // Retire les marques diacritiques combinantes (é→e, ç→c, à→a, …).
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * `true` si `title` entre en collision de libellé normalisé avec une AUTRE
 * caisse du même tenant. `excludeCashboxId` exclut la caisse en cours de
 * modification — elle a toujours le droit de conserver son propre libellé.
 */
export function hasCashboxLabelConflict(
  existing: Pick<CashboxRecord, 'id' | 'tenantId' | 'title'>[],
  tenantId: string,
  title: string,
  excludeCashboxId?: string,
): boolean {
  const normalized = normalizeCashboxLabel(title);
  return existing.some(
    (cashbox) => cashbox.tenantId === tenantId && cashbox.id !== excludeCashboxId && normalizeCashboxLabel(cashbox.title) === normalized,
  );
}

type LedgerEntry = { type: 'debit' | 'credit'; amount: number; status: string; tenantId: string; source: string; destination: string; date: string; recordedAt?: string };

/**
 * Transactions COMPTABILISÉES (`completed`) réellement rattachées à cette caisse
 * — même tenant, et la caisse figure sur l'une des deux extrémités de l'écriture
 * (`source` OU `destination`). C'est EXACTEMENT le prédicat du panneau
 * « Transactions » de la fiche caisse : toute ligne visible dans ce panneau
 * entre donc dans le solde, et réciproquement (mandat « cohérence solde ↔
 * journal »). Un virement inter-caisses (`source` et `destination` tous deux
 * des caisses) est ainsi compté des deux côtés.
 */
export function cashboxLedgerEntries<T extends LedgerEntry>(cashbox: CashboxRecord, transactions: T[]): T[] {
  return transactions.filter(
    (transaction) =>
      transaction.tenantId === cashbox.tenantId &&
      transaction.status === 'completed' &&
      (transaction.source === cashbox.cashboxNumber || transaction.destination === cashbox.cashboxNumber),
  );
}

/**
 * Effet signé d'une écriture sur CETTE caisse : `+montant` si les fonds y
 * entrent (la caisse est `destination`), `−montant` s'ils en sortent (la caisse
 * est `source`). Le sens `Transaction.type` (perspective JOURNAL du tenant)
 * n'intervient pas dans ce calcul par caisse — aucune notion de « sens de la
 * caisse ».
 */
export function cashboxEntryEffect(cashboxNumber: string, entry: LedgerEntry): number {
  const isFrom = entry.source === cashboxNumber;
  const isTo = entry.destination === cashboxNumber;
  // Écriture interne à la caisse (frais, pénalité, ajustement sans contrepartie
  // adhérent : `source === destination === cashboxNumber`) → le sens du
  // JOURNAL (`entry.type`) tranche : crédit = +, débit = −.
  if (isFrom && isTo) return entry.type === 'credit' ? entry.amount : -entry.amount;
  if (isTo) return entry.amount;
  if (isFrom) return -entry.amount;
  return 0;
}

/**
 * Projette la forme stockée (`CashboxRecord`) vers la `Cashbox` complète en
 * calculant `balance` et `lastMovement` depuis le journal — source unique pour
 * la fiche caisse, la liste des caisses et le KPI Trésorerie du dashboard.
 * `balance = openingBalance + Σ(entrées) − Σ(sorties)` sur les seules
 * transactions comptabilisées de la caisse ; `lastMovement` = date de saisie
 * (`recordedAt`, à défaut `date` — jamais la date de la séance rattachée) la plus récente.
 */
export function resolveCashbox<T extends LedgerEntry>(cashbox: CashboxRecord, transactions: T[]): Cashbox {
  const ledger = cashboxLedgerEntries(cashbox, transactions);
  const movement = ledger.reduce((sum, entry) => sum + cashboxEntryEffect(cashbox.cashboxNumber, entry), 0);
  const lastMovement = ledger.reduce<string | null>((latest, entry) => {
    const at = (entry.recordedAt ?? entry.date).slice(0, 10);
    return latest === null || at > latest ? at : latest;
  }, null);
  return { ...cashbox, balance: cashbox.openingBalance + movement, lastMovement: lastMovement ?? cashbox.openedOn };
}
