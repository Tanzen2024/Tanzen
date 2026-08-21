import type { ValueType } from './tontine-occurrences';
import type { UnitCode } from '@/constants/units';
import type { FrequencyConfig } from './tontine-frequency';

export type TontineStatus = 'statusActive' | 'statusInactive';
/** Convention du codebase : préférer un type littéral descriptif à un booléen brut pour un état métier (cf. ValueType, TontineOccurrenceStatus, etc.) — appliqué ici au « Mode d'achat » (mandat refonte §13-15). */
export type PurchaseMode = 'WITH_PURCHASE' | 'WITHOUT_PURCHASE';

export type Tontine = {
  id: string;
  tenantId: string;
  name: string;
  /** Seule notion de classification de la nature de la Tontine (décision métier explicite). Le champ historique `type` (cooperative/tontine/association/mutuelle) a été supprimé — il n'exprimait pas une notion de valeur, seulement une structure organisationnelle dupliquant déjà Tenant.type, jamais utilisée métier au-delà d'un affichage. */
  valueType: ValueType;
  /** Devise de référence, pertinente uniquement pour MONEY (code ISO 4217, cf. `constants/currencies.ts`). Même statut déclaratif que `item`/`quantity` ci-dessous : jamais imposée aux Contributions créées ultérieurement, seulement préremplie. */
  currency?: string;
  /** Mode d'achat, pertinent uniquement pour MONEY (§13-15 mandat refonte) — configuration pure, ne déclenche aucune transaction/contribution/paiement automatique (aucun workflow d'achat n'est sourcé, volontairement non inventé). Défaut WITHOUT_PURCHASE. */
  purchaseMode?: PurchaseMode;
  /** Référence déclarative du bien pour une tontine GOODS (ex. « Bidon d'huile 5L »), au même titre que `valueType` : jamais synchronisée ni validée automatiquement avec `TontineContribution.item`/`TontineTurnBeneficiary.item` (chaque Contribution/Bénéfice reste saisi indépendamment) — cohérence attendue par convention, pas imposée par le code, comme déjà documenté pour valueType vs Contribution.valueType. Absent/non pertinent pour une tontine MONEY. */
  item?: string;
  /** Quantité de référence associée à `item` (ex. 2 bidons) — même statut déclaratif, jamais propagé automatiquement vers les Contributions/Bénéfices créés ultérieurement. */
  quantity?: number;
  /** Unité associée à `quantity`, pertinente uniquement pour GOODS (cf. `constants/units.ts`). */
  unit?: UnitCode;
  status: TontineStatus;
  memberCount: number;
  activeCycles: number;
  totalContributions: number;
  createdAt: string;
} & Partial<FrequencyConfig>;

export const tontines: Tontine[] = [
  /** frequency MONTHLY/DAY_OF_MONTH=20 déduit des occurrences déjà seedées (OCC-001 : 2026-06-20, OCC-002 : 2026-07-20 — même jour du mois, un mois d'écart), pas inventé (mandat §32). */
  { id: 'TON-001', tenantId: 'T-002', name: 'Tontine Horizon', valueType: 'MONEY', currency: 'XOF', purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 20, status: 'statusActive', memberCount: 12, activeCycles: 2, totalContributions: 4_200_000, createdAt: '2025-01-15' },
  { id: 'TON-002', tenantId: 'T-005', name: 'Tontine Avenir', valueType: 'GOODS', item: 'Bidon d’huile 5L', quantity: 2, unit: 'BIDON', status: 'statusActive', memberCount: 8, activeCycles: 1, totalContributions: 1_440_000, createdAt: '2025-03-20' },
  { id: 'TON-003', tenantId: 'T-003', name: 'Mutuelle Teranga', valueType: 'MONEY', currency: 'XOF', purchaseMode: 'WITHOUT_PURCHASE', status: 'statusActive', memberCount: 15, activeCycles: 1, totalContributions: 3_600_000, createdAt: '2024-11-10' },
  { id: 'TON-004', tenantId: 'T-001', name: 'Coopérative Sutura', valueType: 'MONEY', currency: 'XOF', purchaseMode: 'WITHOUT_PURCHASE', status: 'statusActive', memberCount: 24, activeCycles: 3, totalContributions: 8_640_000, createdAt: '2024-06-01' },
  { id: 'TON-005', tenantId: 'T-004', name: 'Association Jappo', valueType: 'MONEY', currency: 'XOF', purchaseMode: 'WITHOUT_PURCHASE', status: 'statusInactive', memberCount: 6, activeCycles: 0, totalContributions: 720_000, createdAt: '2025-05-05' },
];
