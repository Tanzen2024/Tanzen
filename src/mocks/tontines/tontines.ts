import type { ValueType } from './tontine-occurrences';

export type TontineStatus = 'statusActive' | 'statusInactive';

export type Tontine = {
  id: string;
  tenantId: string;
  name: string;
  /** Seule notion de classification de la nature de la Tontine (décision métier explicite). Le champ historique `type` (cooperative/tontine/association/mutuelle) a été supprimé — il n'exprimait pas une notion de valeur, seulement une structure organisationnelle dupliquant déjà Tenant.type, jamais utilisée métier au-delà d'un affichage. */
  valueType: ValueType;
  status: TontineStatus;
  memberCount: number;
  activeCycles: number;
  totalContributions: number;
  createdAt: string;
};

export const tontines: Tontine[] = [
  { id: 'TON-001', tenantId: 'T-002', name: 'Tontine Horizon', valueType: 'MONEY', status: 'statusActive', memberCount: 12, activeCycles: 2, totalContributions: 4_200_000, createdAt: '2025-01-15' },
  { id: 'TON-002', tenantId: 'T-005', name: 'Tontine Avenir', valueType: 'GOODS', status: 'statusActive', memberCount: 8, activeCycles: 1, totalContributions: 1_440_000, createdAt: '2025-03-20' },
  { id: 'TON-003', tenantId: 'T-003', name: 'Mutuelle Teranga', valueType: 'MONEY', status: 'statusActive', memberCount: 15, activeCycles: 1, totalContributions: 3_600_000, createdAt: '2024-11-10' },
  { id: 'TON-004', tenantId: 'T-001', name: 'Coopérative Sutura', valueType: 'MONEY', status: 'statusActive', memberCount: 24, activeCycles: 3, totalContributions: 8_640_000, createdAt: '2024-06-01' },
  { id: 'TON-005', tenantId: 'T-004', name: 'Association Jappo', valueType: 'MONEY', status: 'statusInactive', memberCount: 6, activeCycles: 0, totalContributions: 720_000, createdAt: '2025-05-05' },
];
