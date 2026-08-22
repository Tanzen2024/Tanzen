/**
 * Account = « Caisse » de l'ancien système (mandat CAISSE). `type` porte
 * exclusivement la logique métier de cotisation — LIBRE (montant variable)
 * ou TAUX_FIXE (montant fixé pour la caisse) — jamais une nature comptable
 * (ASSET/LIABILITY/...) : les 8 comptes historiques (trésorerie/épargne/
 * courant, seedés avant ce mandat et référencés par id dans
 * loan-rules.ts/loan-rule.service.test.ts, IMMUABLES) portent donc
 * désormais `type: 'LIBRE'` par défaut — ce champ ne pilotait déjà aucune
 * règle de prêt (`loanRuleService` ne lit que `accountId`/`accountNumber`).
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
  /** Matérialisé par les transactions (`financeService.listTransactions`), jamais saisi à la création. */
  balance: number;
  /** Adhérents affectés à cette caisse. */
  memberIds: string[];
  tenantName: string;
  status: AccountStatus;
  lastMovement: string;
};

export const accounts: Account[] = [
  { id: 'AC-001', tenantId: 'T-001', accountNumber: 'CS-001-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', balance: 12_500_000, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-10', memberIds: [] },
  { id: 'AC-002', tenantId: 'T-001', accountNumber: 'CS-001-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', balance: 8_750_000, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-09', memberIds: [] },
  { id: 'AC-003', tenantId: 'T-001', accountNumber: 'CS-001-COUR', title: 'Compte courant', type: 'LIBRE', amount: null, description: '', balance: 3_200_000, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-11', memberIds: [] },
  { id: 'AC-004', tenantId: 'T-002', accountNumber: 'TH-002-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', balance: 4_800_000, tenantName: 'Tontine Horizon', status: 'active', lastMovement: '2026-08-08', memberIds: [] },
  { id: 'AC-005', tenantId: 'T-002', accountNumber: 'TH-002-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', balance: 2_100_000, tenantName: 'Tontine Horizon', status: 'active', lastMovement: '2026-08-07', memberIds: [] },
  { id: 'AC-006', tenantId: 'T-003', accountNumber: 'MT-003-TRÉS', title: 'Trésorerie', type: 'LIBRE', amount: null, description: '', balance: 6_300_000, tenantName: 'Mutuelle Teranga', status: 'active', lastMovement: '2026-08-10', memberIds: [] },
  { id: 'AC-007', tenantId: 'T-003', accountNumber: 'MT-003-COUR', title: 'Compte courant', type: 'LIBRE', amount: null, description: '', balance: 1_450_000, tenantName: 'Mutuelle Teranga', status: 'active', lastMovement: '2026-08-06', memberIds: [] },
  { id: 'AC-008', tenantId: 'T-004', accountNumber: 'AJ-004-ÉPG', title: 'Épargne', type: 'LIBRE', amount: null, description: '', balance: 320_000, tenantName: 'Association Jappo', status: 'inactive', lastMovement: '2026-05-15', memberIds: [] },

  // Caisses de cotisation (mandat CAISSE, §15 — reproduit l'écran historique).
  { id: 'AC-009', tenantId: 'T-001', accountNumber: 'CS-001-CX-001', title: 'Epargne', type: 'LIBRE', amount: null, description: 'Epargne volontaire des adhérents', balance: 0, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-01', memberIds: [] },
  { id: 'AC-010', tenantId: 'T-001', accountNumber: 'CS-001-CX-002', title: 'Inscription', type: 'TAUX_FIXE', amount: 500, description: "Cotisation d'inscription", balance: 0, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-01', memberIds: [] },
  { id: 'AC-011', tenantId: 'T-001', accountNumber: 'CS-001-CX-003', title: 'Secours', type: 'TAUX_FIXE', amount: 12_000, description: '', balance: 0, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-01', memberIds: [] },
  { id: 'AC-012', tenantId: 'T-001', accountNumber: 'CS-001-CX-004', title: 'Transport', type: 'TAUX_FIXE', amount: 5_000, description: '', balance: 0, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-01', memberIds: [] },
  { id: 'AC-013', tenantId: 'T-001', accountNumber: 'CS-001-CX-005', title: 'Achat argent', type: 'LIBRE', amount: null, description: '', balance: 0, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-01', memberIds: [] },
  { id: 'AC-014', tenantId: 'T-001', accountNumber: 'CS-001-CX-006', title: 'Fond de solidarité', type: 'TAUX_FIXE', amount: 40_000, description: '', balance: 0, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-01', memberIds: [] },
];
