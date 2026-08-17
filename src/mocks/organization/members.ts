export type MemberStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type MemberGender = 'male' | 'female';
export type PositionRole = 'president' | 'treasurer' | 'secretary' | 'member' | 'boardMember';

export type Position = { id: string; role: PositionRole; tenantName: string; startDate: string; endDate: string | null };
export type MemberAccount = { id: string; accountNumber: string; type: 'savings' | 'current' | 'loanAccount'; balance: number };
export type MemberDocument = { id: string; name: string; type: 'idDocument' | 'contract' | 'statement' | 'other'; uploadedAt: string };
export type MemberActivity = { id: string; type: string; description: string; date: string };
/**
 * Historisation minimale ajoutée par D-4C4-WEB-03 (Option D — historisation
 * + règle d'éligibilité AG), cf. mandat IMPLEMENTATION GO §9 : "créer
 * uniquement les éléments nécessaires à : historique, date de validité,
 * détermination de l'état à une date donnée". `since` = date à partir de
 * laquelle `status` s'applique. Trié implicitement par insertion (toujours
 * ajouté en fin de tableau par `organizationService.updateMember`) — voir
 * `src/services/eligibility.service.ts` pour la reconstruction de l'état à
 * une date donnée.
 *
 * Amorçage des 8 membres existants : chaque membre reçoit une unique entrée
 * `{ status: <statut actuel>, since: joinedAt }` — hypothèse conservatrice
 * documentée (« actif depuis l'adhésion » n'est pas nécessairement vrai
 * historiquement pour M-005/M-008, dont les `activities` mentionnent une
 * désactivation/suspension à une date précise, mais aucune source ne fournit
 * un historique complet et fiable pour les 8 membres de façon uniforme —
 * inventer une historisation différenciée pour 2 membres seulement aurait
 * été arbitraire). Voir docs/P1_GOVERNANCE_PHASE_4C4_IMPLEMENTATION_REPORT.md.
 */
export type MemberStatusHistoryEntry = { status: MemberStatus; since: string };

export type Member = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  gender: MemberGender;
  birthDate: string;
  nationality: string;
  idNumber: string;
  occupation: string;
  email: string;
  phone: string;
  address: string;
  joinedAt: string;
  status: MemberStatus;
  statusHistory: MemberStatusHistoryEntry[];
  tenantName: string;
  positions: Position[];
  accounts: MemberAccount[];
  documents: MemberDocument[];
  activities: MemberActivity[];
  governanceParticipation: { id: string; assemblyName: string; role: string; date: string }[];
};

export const members: Member[] = [
  {
    id: 'M-001', tenantId: 'T-001', firstName: 'Fatou', lastName: 'Ndiaye', gender: 'female', birthDate: '1988-04-12', nationality: 'Sénégalaise', idNumber: 'SN-884-12-1988', occupation: 'Commerçante', email: 'fatou.ndiaye@email.sn', phone: '+221 77 123 45 67', address: '12 Rue Sandiniéry, Dakar', joinedAt: '2021-03-20', status: 'active', statusHistory: [{ status: 'active', since: '2021-03-20' }], tenantName: 'Coopérative Sutura',
    positions: [{ id: 'P-1', role: 'president', tenantName: 'Coopérative Sutura', startDate: '2023-01-15', endDate: null }],
    accounts: [{ id: 'A-1', accountNumber: 'CS-001-SAV', type: 'savings', balance: 1250000 }, { id: 'A-2', accountNumber: 'CS-001-CUR', type: 'current', balance: 340000 }],
    documents: [{ id: 'D-1', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2021-03-20' }, { id: 'D-2', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-03-20' }],
    activities: [{ id: 'AC-1', type: 'Contribution', description: 'Contribution cycle 4 - Tontine Horizon', date: '2026-08-08' }, { id: 'AC-2', type: 'Assemblée', description: 'Participation AG 2026', date: '2026-06-15' }],
    governanceParticipation: [{ id: 'G-1', assemblyName: 'AG 2026', role: 'Présidente de séance', date: '2026-06-15' }],
  },
  {
    id: 'M-002', tenantId: 'T-002', firstName: 'Mamadou', lastName: 'Sow', gender: 'male', birthDate: '1982-09-23', nationality: 'Sénégalaise', idNumber: 'SN-283-09-1982', occupation: 'Artisan', email: 'mamadou.sow@email.sn', phone: '+221 76 234 56 78', address: '45 Av. Général de Gaulle, Thiès', joinedAt: '2022-01-25', status: 'active', statusHistory: [{ status: 'active', since: '2022-01-25' }], tenantName: 'Tontine Horizon',
    positions: [{ id: 'P-2', role: 'treasurer', tenantName: 'Tontine Horizon', startDate: '2023-03-01', endDate: null }],
    accounts: [{ id: 'A-3', accountNumber: 'TH-002-SAV', type: 'savings', balance: 890000 }],
    documents: [{ id: 'D-3', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2022-01-25' }],
    activities: [{ id: 'AC-3', type: 'Prêt', description: 'Prêt approuvé - 1 200 000 FCFA', date: '2026-07-10' }],
    governanceParticipation: [],
  },
  {
    id: 'M-003', tenantId: 'T-003', firstName: 'Aïssatou', lastName: 'Bâ', gender: 'female', birthDate: '1990-12-05', nationality: 'Sénégalaise', idNumber: 'SN-905-12-1990', occupation: 'Enseignante', email: 'aissatou.ba@email.sn', phone: '+221 78 345 67 89', address: '78 Quai Louis Faidherbe, Saint-Louis', joinedAt: '2021-11-12', status: 'active', statusHistory: [{ status: 'active', since: '2021-11-12' }], tenantName: 'Mutuelle Teranga',
    positions: [{ id: 'P-3', role: 'secretary', tenantName: 'Mutuelle Teranga', startDate: '2024-01-10', endDate: null }],
    accounts: [{ id: 'A-4', accountNumber: 'MT-003-SAV', type: 'savings', balance: 2100000 }, { id: 'A-5', accountNumber: 'MT-003-CUR', type: 'current', balance: 180000 }],
    documents: [{ id: 'D-4', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-11-12' }, { id: 'D-5', name: 'Relevé 2025', type: 'statement', uploadedAt: '2025-12-31' }],
    activities: [{ id: 'AC-4', type: 'Contribution', description: 'Contribution cycle 1 - Mutuelle Teranga', date: '2026-07-15' }],
    governanceParticipation: [{ id: 'G-2', assemblyName: 'AG 2025', role: 'Secrétaire', date: '2025-06-20' }],
  },
  {
    id: 'M-004', tenantId: 'T-004', firstName: 'Ousmane', lastName: 'Fall', gender: 'male', birthDate: '1995-06-18', nationality: 'Sénégalaise', idNumber: 'SN-184-06-1995', occupation: 'Étudiant', email: 'ousmane.fall@email.sn', phone: '+221 77 456 78 90', address: '23 Marché Sandaga, Kaolack', joinedAt: '2024-02-15', status: 'pending', statusHistory: [{ status: 'pending', since: '2024-02-15' }], tenantName: 'Association Jappo',
    positions: [],
    accounts: [],
    documents: [{ id: 'D-6', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2024-02-15' }],
    activities: [{ id: 'AC-5', type: 'Inscription', description: 'Demande d\'adhésion soumise', date: '2024-02-15' }],
    governanceParticipation: [],
  },
  {
    id: 'M-005', tenantId: 'T-005', firstName: 'Awa', lastName: 'Cissé', gender: 'female', birthDate: '1985-02-28', nationality: 'Sénégalaise', idNumber: 'SN-285-02-1985', occupation: 'Commerçante', email: 'awa.cisse@email.sn', phone: '+221 76 567 89 01', address: '5 Rue Touba Mosquée, Touba', joinedAt: '2023-06-12', status: 'inactive', statusHistory: [{ status: 'inactive', since: '2023-06-12' }], tenantName: 'Tontine Avenir',
    positions: [{ id: 'P-4', role: 'member', tenantName: 'Tontine Avenir', startDate: '2023-06-12', endDate: '2024-06-12' }],
    accounts: [{ id: 'A-6', accountNumber: 'TA-005-SAV', type: 'savings', balance: 450000 }],
    documents: [{ id: 'D-7', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2023-06-12' }],
    activities: [{ id: 'AC-6', type: 'Désactivation', description: 'Compte désactivé - inactivité', date: '2024-06-15' }],
    governanceParticipation: [],
  },
  {
    id: 'M-006', tenantId: 'T-001', firstName: 'Cheikh', lastName: 'Diop', gender: 'male', birthDate: '1979-11-30', nationality: 'Sénégalaise', idNumber: 'SN-979-11-1979', occupation: 'Comptable', email: 'cheikh.diop@email.sn', phone: '+221 77 678 90 12', address: '12 Rue Sandiniéry, Dakar', joinedAt: '2021-04-01', status: 'active', statusHistory: [{ status: 'active', since: '2021-04-01' }], tenantName: 'Coopérative Sutura',
    positions: [{ id: 'P-5', role: 'boardMember', tenantName: 'Coopérative Sutura', startDate: '2023-01-15', endDate: null }],
    accounts: [{ id: 'A-7', accountNumber: 'CS-001-SAV-2', type: 'savings', balance: 3200000 }],
    documents: [{ id: 'D-8', name: 'Relevé 2025', type: 'statement', uploadedAt: '2025-12-31' }],
    activities: [{ id: 'AC-7', type: 'Prêt', description: 'Prêt décaissé - 2 100 000 FCFA', date: '2026-07-20' }],
    governanceParticipation: [{ id: 'G-3', assemblyName: 'AG 2026', role: 'Membre du bureau', date: '2026-06-15' }],
  },
  {
    id: 'M-007', tenantId: 'T-002', firstName: 'Khadija', lastName: 'Mbaye', gender: 'female', birthDate: '1992-07-14', nationality: 'Sénégalaise', idNumber: 'SN-292-07-1992', occupation: 'Infirmière', email: 'khadija.mbaye@email.sn', phone: '+221 78 789 01 23', address: '45 Av. Général de Gaulle, Thiès', joinedAt: '2022-02-10', status: 'active', statusHistory: [{ status: 'active', since: '2022-02-10' }], tenantName: 'Tontine Horizon',
    positions: [],
    accounts: [{ id: 'A-8', accountNumber: 'TH-002-SAV-2', type: 'savings', balance: 670000 }],
    documents: [{ id: 'D-9', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2022-02-10' }],
    activities: [{ id: 'AC-8', type: 'Contribution', description: 'Contribution cycle 4 - Tontine Horizon', date: '2026-08-08' }],
    governanceParticipation: [],
  },
  {
    id: 'M-008', tenantId: 'T-003', firstName: 'Ibrahima', lastName: 'Sarr', gender: 'male', birthDate: '1987-03-22', nationality: 'Sénégalaise', idNumber: 'SN-387-03-1987', occupation: 'Chauffeur', email: 'ibrahima.sarr@email.sn', phone: '+221 77 890 12 34', address: '78 Quai Louis Faidherbe, Saint-Louis', joinedAt: '2021-12-01', status: 'suspended', statusHistory: [{ status: 'suspended', since: '2021-12-01' }], tenantName: 'Mutuelle Teranga',
    positions: [],
    accounts: [{ id: 'A-9', accountNumber: 'MT-003-CUR-2', type: 'current', balance: 120000 }],
    documents: [{ id: 'D-10', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-12-01' }],
    activities: [{ id: 'AC-9', type: 'Suspension', description: 'Membre suspendu - retard de remboursement', date: '2026-07-01' }],
    governanceParticipation: [],
  },
];
