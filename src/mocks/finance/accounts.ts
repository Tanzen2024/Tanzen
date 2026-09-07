/**
 * Account = « Caisse » de l'ancien système (mandat CAISSE). `type` porte la
 * nature de la cotisation — LIBRE (montant variable) ou TAUX_FIXE (montant
 * fixé) — jamais une nature comptable (ASSET/LIABILITY/...), jamais réutilisé
 * pour autre chose que ça (il ne conditionne que le caractère obligatoire du
 * montant).
 *
 * Le sens comptable (débit/crédit) est porté exclusivement par la transaction
 * (`Transaction.type`), jamais par le compte : l'ancien champ de sens financier
 * du compte et les caisses spécialisées associées ont été supprimés, sans
 * mécanisme de remplacement.
 *
 * Les 8 comptes historiques (trésorerie/épargne/courant) sont référencés par
 * id dans loan-rules.ts/loan-rule.service.test.ts et restent IMMUABLES.
 * `memberIds` réutilise directement `Account` pour porter la relation
 * Account ↔ Membre (adhérents affectés à la caisse) plutôt que d'introduire
 * une entité de jointure séparée (AccountMember/CashBox...), qui n'existe
 * nulle part ailleurs dans le modèle.
 */
export type AccountType = 'LIBRE' | 'TAUX_FIXE';
export type AccountStatus = 'active' | 'inactive';

export type Account = {
  id: string;
  tenantId: string;
  /** Généré par le système (`financeService.createAccount`), jamais saisi manuellement. */
  accountNumber: string;
  /** Titre métier de la caisse (« Epargne », « Inscription »...). */
  title: string;
  type: AccountType;
  /** Montant de cotisation fixe si TAUX_FIXE ; toujours `null` si LIBRE. */
  amount: number | null;
  description: string;
  /**
   * Report d'ouverture : situation de la caisse ANTÉRIEURE au journal des
   * transactions (historique non détaillé ligne à ligne). C'est la seule
   * composante stockée du solde ; toute écriture postérieure passe par une
   * `Transaction`. `financeService.recordAccountMovement` est le seul point
   * d'ajustement manuel de ce report.
   */
  openingBalance: number;
  /**
   * Solde courant — JAMAIS stocké : calculé par `resolveAccount()` à chaque
   * lecture comme `openingBalance + Σ(crédits comptabilisés) − Σ(débits
   * comptabilisés)` sur les transactions `status === 'completed'` de CETTE
   * caisse (même tenant, `accountNumber` du côté non-adhérent de l'écriture).
   * Les transactions `pending`/`failed`/`cancelled` n'entrent pas dans le solde.
   */
  balance: number;
  /** Adhérents affectés à cette caisse. */
  memberIds: string[];
  tenantName: string;
  status: AccountStatus;
  /** Date d'ouverture de la caisse — sert de « dernier mouvement » tant qu'aucune transaction n'est comptabilisée. */
  openedOn: string;
  /**
   * Dernier mouvement — JAMAIS stocké : calculé par `resolveAccount()` comme la
   * date (`transaction_at` = `recordedAt`, à défaut `date`) de la transaction
   * comptabilisée la plus récente de la caisse, sinon `openedOn`. Jamais
   * `meetingDate` (date de réunion, distincte de la date de transaction).
   */
  lastMovement: string;
};

/**
 * Forme réellement stockée d'une caisse : `balance` et `lastMovement` sont des
 * champs calculés (voir `resolveAccount`) et n'existent donc pas dans le seed
 * ni dans le tableau `accounts` mutable.
 */
export type AccountRecord = Omit<Account, 'balance' | 'lastMovement'>;

export const accounts: AccountRecord[] = [
  { id: 'AC-001', tenantId: 'T-001', accountNumber: 'CS-001-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', openingBalance: 13_730_000, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-002', tenantId: 'T-001', accountNumber: 'CS-001-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', openingBalance: 8_650_000, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-003', tenantId: 'T-001', accountNumber: 'CS-001-COUR', title: 'Compte courant', type: 'LIBRE', amount: null, description: '', openingBalance: 2_725_000, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-004', tenantId: 'T-002', accountNumber: 'TH-002-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', openingBalance: 6_200_000, tenantName: 'Tontine Horizon', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-005', tenantId: 'T-002', accountNumber: 'TH-002-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', openingBalance: 1_975_000, tenantName: 'Tontine Horizon', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-006', tenantId: 'T-003', accountNumber: 'MT-003-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', openingBalance: 6_600_000, tenantName: 'Mutuelle Teranga', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-007', tenantId: 'T-003', accountNumber: 'MT-003-COUR', title: 'Compte courant', type: 'LIBRE', amount: null, description: '', openingBalance: 1_450_000, tenantName: 'Mutuelle Teranga', status: 'active', openedOn: '2026-01-01', memberIds: [] },
  { id: 'AC-008', tenantId: 'T-004', accountNumber: 'AJ-004-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', openingBalance: 320_000, tenantName: 'Association Jappo', status: 'inactive', openedOn: '2026-01-01', memberIds: [] },

  // Caisses de cotisation (mandat CAISSE, §15 — reproduit l'écran historique).
  { id: 'AC-009', tenantId: 'T-001', accountNumber: 'CS-001-CX-001', title: 'Epargne', type: 'LIBRE', amount: null, description: 'Epargne volontaire des adhérents', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [] },
  { id: 'AC-010', tenantId: 'T-001', accountNumber: 'CS-001-CX-002', title: 'Inscription', type: 'TAUX_FIXE', amount: 500, description: "Cotisation d'inscription", openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [] },
  { id: 'AC-011', tenantId: 'T-001', accountNumber: 'CS-001-CX-003', title: 'Secours', type: 'TAUX_FIXE', amount: 12_000, description: '', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [] },
  { id: 'AC-012', tenantId: 'T-001', accountNumber: 'CS-001-CX-004', title: 'Transport', type: 'TAUX_FIXE', amount: 5_000, description: '', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [] },
  { id: 'AC-013', tenantId: 'T-001', accountNumber: 'CS-001-CX-005', title: 'Achat argent', type: 'LIBRE', amount: null, description: '', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [] },
  { id: 'AC-014', tenantId: 'T-001', accountNumber: 'CS-001-CX-006', title: 'Fond de solidarité', type: 'TAUX_FIXE', amount: 40_000, description: '', openingBalance: 0, tenantName: 'Coopérative Sutura', status: 'active', openedOn: '2026-08-01', memberIds: [] },
];

type LedgerEntry = { type: 'debit' | 'credit'; amount: number; status: string; tenantId: string; fromAccount: string; toAccount: string; date: string; recordedAt?: string };

/**
 * Transactions COMPTABILISÉES (`completed`) réellement rattachées à cette caisse
 * — même tenant, et la caisse figure sur l'une des deux extrémités de l'écriture
 * (`fromAccount` OU `toAccount`). C'est EXACTEMENT le prédicat du panneau
 * « Transactions » de la fiche caisse : toute ligne visible dans ce panneau
 * entre donc dans le solde, et réciproquement (mandat « cohérence solde ↔
 * journal »). Un virement inter-caisses (`fromAccount` et `toAccount` tous deux
 * des caisses) est ainsi compté des deux côtés.
 */
export function accountLedgerEntries<T extends LedgerEntry>(account: AccountRecord, transactions: T[]): T[] {
  return transactions.filter(
    (transaction) =>
      transaction.tenantId === account.tenantId &&
      transaction.status === 'completed' &&
      (transaction.fromAccount === account.accountNumber || transaction.toAccount === account.accountNumber),
  );
}

/**
 * Effet signé d'une écriture sur CETTE caisse : `+montant` si les fonds y
 * entrent (la caisse est `toAccount`), `−montant` s'ils en sortent (la caisse
 * est `fromAccount`). Le sens `Transaction.type` (perspective JOURNAL du tenant)
 * n'intervient pas dans ce calcul par compte — aucune notion de « sens de la
 * caisse ».
 */
export function accountEntryEffect(accountNumber: string, entry: LedgerEntry): number {
  const isFrom = entry.fromAccount === accountNumber;
  const isTo = entry.toAccount === accountNumber;
  // Écriture interne à la caisse (frais, pénalité, ajustement sans contrepartie
  // adhérent : `fromAccount === toAccount === accountNumber`) → le sens du
  // JOURNAL (`entry.type`) tranche : crédit = +, débit = −.
  if (isFrom && isTo) return entry.type === 'credit' ? entry.amount : -entry.amount;
  if (isTo) return entry.amount;
  if (isFrom) return -entry.amount;
  return 0;
}

/**
 * Projette la forme stockée (`AccountRecord`) vers l'`Account` complet en
 * calculant `balance` et `lastMovement` depuis le journal — source unique pour
 * la fiche caisse, la liste des caisses et le KPI Trésorerie du dashboard.
 * `balance = openingBalance + Σ(entrées) − Σ(sorties)` sur les seules
 * transactions comptabilisées de la caisse ; `lastMovement` = date de saisie
 * (`recordedAt`, à défaut `date` — jamais `meetingDate`) la plus récente.
 */
export function resolveAccount<T extends LedgerEntry>(account: AccountRecord, transactions: T[]): Account {
  const ledger = accountLedgerEntries(account, transactions);
  const movement = ledger.reduce((sum, entry) => sum + accountEntryEffect(account.accountNumber, entry), 0);
  const lastMovement = ledger.reduce<string | null>((latest, entry) => {
    const at = (entry.recordedAt ?? entry.date).slice(0, 10);
    return latest === null || at > latest ? at : latest;
  }, null);
  return { ...account, balance: account.openingBalance + movement, lastMovement: lastMovement ?? account.openedOn };
}
