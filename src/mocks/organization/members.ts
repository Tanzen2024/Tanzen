/**
 * Vocabulaire officiel closé par D-MEM-04 (Option A, définitive — voir
 * `docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md`) : `ACTIVE`/`INACTIVE`/
 * `SUSPENDED`/`EXITED`, conforme au dictionnaire canonique `members`.
 * `pending` (ancien statut, workflow de demande d'adhésion) a été
 * **retiré** — migration obligatoire `PENDING → ACTIVE` déjà appliquée aux
 * données de seed (`M-004`, seul enregistrement concerné). Aucune nouvelle
 * valeur `pending` ne peut plus être créée pour `Member` : le type
 * lui-même ne l'admet plus.
 */
export type MemberStatus = 'active' | 'inactive' | 'suspended' | 'exited';
export type MemberGender = 'male' | 'female';

/**
 * Photo de démonstration pour `photoUrl` (voir ce champ sur `Member`) — data URI SVG
 * autonome, sans dépendance réseau ni asset binaire ajouté au dépôt. Utilisée par un seul
 * des 8 membres de seed (M-006) pour prouver le rendu réel d'une photo ; les 7 autres,
 * y compris M-001 (seul autre membre du tenant T-001, le tenant courant — aucun
 * sélecteur de tenant n'existe dans cette build), restent volontairement en fallback
 * initiales, ce qui permet de prouver les DEUX cas dans le seul tenant réellement
 * accessible sans naviguer entre tenants.
 */
const DEMO_PHOTO_CHEIKH = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='%230EA5E9'/><circle cx='48' cy='38' r='18' fill='%23FFFFFF'/><rect x='18' y='60' width='60' height='40' rx='28' fill='%23FFFFFF'/></svg>";
/** `''` = non renseigné (dictionnaire : `gender` nullable) — même convention que `phone`/`email` (chaîne vide, jamais `null`), pour ne pas introduire une seconde convention d'absence de valeur dans ce type. Avant ce mandat, un membre sans genre saisi était silencieusement forcé à `'female'` par `createMember` (bug réel, corrigé — voir `docs/P1_MEMBERS_USERS_AUDIT_IMPLEMENTATION_REPORT.md`). */
export type MemberGenderValue = MemberGender | '';
/**
 * `sync_status`/`version`/`uuid`/timestamps techniques, closés par D-MEM-02
 * (Option C, définitive — `docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md`
 * §7) : convention project-wide explicite — le modèle canonique (destiné à
 * un futur backend) et le modèle frontend actuel (mocks, sans backend réel)
 * divergent sciemment sur ces champs pour les entités qui, comme `Member`,
 * en portent une exigence explicite dans le dictionnaire ; c'est une
 * dérogation documentée à la convention par défaut du projet (cf.
 * `governance.ts`, qui exclut ces mêmes champs faute de besoin Web
 * démontré pour les entités qui n'en ont pas de demande explicite).
 */
export type MemberSyncStatus = 'synced' | 'pending' | 'failed';
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
  /** Identifiant global du membre (dictionnaire `members.uuid`) — généré via `crypto.randomUUID()` à la création (`organizationService.createMember`), aucun mécanisme uuid préexistant dans le projet à réutiliser (vérifié, aucune occurrence ailleurs). */
  uuid: string;
  tenantId: string;
  /** Code métier optionnel (dictionnaire `members.matricule`, `UNIQUE(matricule)` global) — aucune génération automatique préexistante à réutiliser ; laissé à la saisie manuelle, chaîne vide = non renseigné (même convention que `phone`/`email`). */
  matricule: string;
  firstName: string;
  lastName: string;
  gender: MemberGenderValue;
  birthDate: string;
  nationality: string;
  idNumber: string;
  occupation: string;
  email: string;
  phone: string;
  address: string;
  /**
   * Ajout additif (mandat AVATAR PHOTO) : le dictionnaire canonique `members` ne prévoyait
   * jusqu'ici aucun champ photo, et `MemberPhotoField` (formulaire création/modification)
   * n'était qu'un aperçu local jamais persisté (`URL.createObjectURL`, révoqué au
   * démontage) — la photo choisie disparaissait donc toujours après enregistrement.
   * `photoUrl` complète ce champ déjà prévu par l'UI plutôt que d'inventer un concept
   * nouveau : chaîne vide = absente (même convention que `phone`/`email`/`matricule`),
   * stocke un data URI (`data:image/...;base64,...`) puisqu'aucune architecture de
   * stockage de fichiers n'existe dans ce projet mock — pas de nouvelle dépendance, pas
   * de faux endpoint. Deux membres de seed (M-001, M-006) en portent un pour démontrer le
   * rendu réel ; les six autres restent en fallback initiales, comportement inchangé.
   */
  photoUrl: string;
  joinedAt: string;
  status: MemberStatus;
  statusHistory: MemberStatusHistoryEntry[];
  /** Champs techniques ajoutés par le dictionnaire canonique `members` (mandat P1 MEMBERS) — jamais affichés ni saisis dans le formulaire, gérés exclusivement par `organizationService`. */
  syncStatus: MemberSyncStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Référence à `SystemUser.id` (acteur ayant créé/modifié la fiche) — une donnée d'audit, pas une relation Member↔User d'identité (celle-ci reste explicitement non créée, cf. rapport). */
  createdBy: string | null;
  updatedBy: string | null;
  tenantName: string;
  positions: Position[];
  accounts: MemberAccount[];
  documents: MemberDocument[];
  activities: MemberActivity[];
  governanceParticipation: { id: string; assemblyName: string; role: string; date: string }[];
};

export const members: Member[] = [
  {
    id: 'M-001', uuid: '8f14e45f-ceea-467e-bd42-8f57221b2400', tenantId: 'T-001', matricule: '', firstName: 'Fatou', lastName: 'Ndiaye', gender: 'female', birthDate: '1988-04-12', nationality: 'Sénégalaise', idNumber: 'SN-884-12-1988', occupation: 'Commerçante', email: 'fatou.ndiaye@email.sn', phone: '+221 77 123 45 67', address: '12 Rue Sandiniéry, Dakar', photoUrl: '', joinedAt: '2021-03-20', status: 'active', statusHistory: [{ status: 'active', since: '2021-03-20' }], tenantName: 'Coopérative Sutura', syncStatus: 'synced', version: 1, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-1', role: 'president', tenantName: 'Coopérative Sutura', startDate: '2023-01-15', endDate: null }],
    accounts: [{ id: 'A-1', accountNumber: 'CS-001-SAV', type: 'savings', balance: 1250000 }, { id: 'A-2', accountNumber: 'CS-001-CUR', type: 'current', balance: 340000 }],
    documents: [{ id: 'D-1', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2021-03-20' }, { id: 'D-2', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-03-20' }],
    activities: [{ id: 'AC-1', type: 'Contribution', description: 'Contribution cycle 4 - Tontine Horizon', date: '2026-08-08' }, { id: 'AC-2', type: 'Assemblée', description: 'Participation AG 2026', date: '2026-06-15' }],
    governanceParticipation: [{ id: 'G-1', assemblyName: 'AG 2026', role: 'Présidente de séance', date: '2026-06-15' }],
  },
  {
    id: 'M-002', uuid: '3b1e6f2a-9c4d-4e6b-8a2f-1d5c7e9b0a11', tenantId: 'T-002', matricule: '', firstName: 'Mamadou', lastName: 'Sow', gender: 'male', birthDate: '1982-09-23', nationality: 'Sénégalaise', idNumber: 'SN-283-09-1982', occupation: 'Artisan', email: 'mamadou.sow@email.sn', phone: '+221 76 234 56 78', address: '45 Av. Général de Gaulle, Thiès', photoUrl: '', joinedAt: '2022-01-25', status: 'active', statusHistory: [{ status: 'active', since: '2022-01-25' }], tenantName: 'Tontine Horizon', syncStatus: 'synced', version: 1, createdAt: '2022-01-25T00:00:00.000Z', updatedAt: '2022-01-25T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-2', role: 'treasurer', tenantName: 'Tontine Horizon', startDate: '2023-03-01', endDate: null }],
    accounts: [{ id: 'A-3', accountNumber: 'TH-002-SAV', type: 'savings', balance: 890000 }],
    documents: [{ id: 'D-3', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2022-01-25' }],
    activities: [{ id: 'AC-3', type: 'Prêt', description: 'Prêt approuvé - 1 200 000 FCFA', date: '2026-07-10' }],
    governanceParticipation: [],
  },
  {
    id: 'M-003', uuid: 'a7d2c8e1-4f6b-4a3d-9e1c-2b8f4d6a7c33', tenantId: 'T-003', matricule: '', firstName: 'Aïssatou', lastName: 'Bâ', gender: 'female', birthDate: '1990-12-05', nationality: 'Sénégalaise', idNumber: 'SN-905-12-1990', occupation: 'Enseignante', email: 'aissatou.ba@email.sn', phone: '+221 78 345 67 89', address: '78 Quai Louis Faidherbe, Saint-Louis', photoUrl: '', joinedAt: '2021-11-12', status: 'active', statusHistory: [{ status: 'active', since: '2021-11-12' }], tenantName: 'Mutuelle Teranga', syncStatus: 'synced', version: 1, createdAt: '2021-11-12T00:00:00.000Z', updatedAt: '2021-11-12T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-3', role: 'secretary', tenantName: 'Mutuelle Teranga', startDate: '2024-01-10', endDate: null }],
    accounts: [{ id: 'A-4', accountNumber: 'MT-003-SAV', type: 'savings', balance: 2100000 }, { id: 'A-5', accountNumber: 'MT-003-CUR', type: 'current', balance: 180000 }],
    documents: [{ id: 'D-4', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-11-12' }, { id: 'D-5', name: 'Relevé 2025', type: 'statement', uploadedAt: '2025-12-31' }],
    activities: [{ id: 'AC-4', type: 'Contribution', description: 'Contribution cycle 1 - Mutuelle Teranga', date: '2026-07-15' }],
    governanceParticipation: [{ id: 'G-2', assemblyName: 'AG 2025', role: 'Secrétaire', date: '2025-06-20' }],
  },
  {
    // D-MEM-04 (2026-08-18) : migration obligatoire PENDING → ACTIVE — seul enregistrement de seed concerné.
    // `status`/`statusHistory` recolorés en 'active' (le type MemberStatus n'admet plus 'pending' du tout,
    // y compris rétroactivement dans l'historique) ; `since` de l'entrée d'historique inchangé (2024-02-15,
    // date d'adhésion réelle) — ce n'est pas un nouvel événement de changement de statut métier, seulement
    // une migration du vocabulaire. `version`/`updatedAt` incrémentés pour refléter la migration elle-même.
    id: 'M-004', uuid: 'c5e9b3d7-6a1f-4c8e-8b2d-3a5f7c9e1b44', tenantId: 'T-004', matricule: '', firstName: 'Ousmane', lastName: 'Fall', gender: 'male', birthDate: '1995-06-18', nationality: 'Sénégalaise', idNumber: 'SN-184-06-1995', occupation: 'Étudiant', email: 'ousmane.fall@email.sn', phone: '+221 77 456 78 90', address: '23 Marché Sandaga, Kaolack', photoUrl: '', joinedAt: '2024-02-15', status: 'active', statusHistory: [{ status: 'active', since: '2024-02-15' }], tenantName: 'Association Jappo', syncStatus: 'synced', version: 2, createdAt: '2024-02-15T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    accounts: [],
    documents: [{ id: 'D-6', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2024-02-15' }],
    activities: [{ id: 'AC-5', type: 'Inscription', description: 'Demande d\'adhésion soumise', date: '2024-02-15' }],
    governanceParticipation: [],
  },
  {
    id: 'M-005', uuid: 'e1f4a6c8-2b5d-4e7a-9c3f-6d8a1b4e7c55', tenantId: 'T-005', matricule: '', firstName: 'Awa', lastName: 'Cissé', gender: 'female', birthDate: '1985-02-28', nationality: 'Sénégalaise', idNumber: 'SN-285-02-1985', occupation: 'Commerçante', email: 'awa.cisse@email.sn', phone: '+221 76 567 89 01', address: '5 Rue Touba Mosquée, Touba', photoUrl: '', joinedAt: '2023-06-12', status: 'inactive', statusHistory: [{ status: 'inactive', since: '2023-06-12' }], tenantName: 'Tontine Avenir', syncStatus: 'synced', version: 1, createdAt: '2023-06-12T00:00:00.000Z', updatedAt: '2023-06-12T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-4', role: 'member', tenantName: 'Tontine Avenir', startDate: '2023-06-12', endDate: '2024-06-12' }],
    accounts: [{ id: 'A-6', accountNumber: 'TA-005-SAV', type: 'savings', balance: 450000 }],
    documents: [{ id: 'D-7', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2023-06-12' }],
    activities: [{ id: 'AC-6', type: 'Désactivation', description: 'Compte désactivé - inactivité', date: '2024-06-15' }],
    governanceParticipation: [],
  },
  {
    id: 'M-006', uuid: '0a2c4e6f-8b1d-4a3c-9e5f-7c9b1d3e5f66', tenantId: 'T-001', matricule: '', firstName: 'Cheikh', lastName: 'Diop', gender: 'male', birthDate: '1979-11-30', nationality: 'Sénégalaise', idNumber: 'SN-979-11-1979', occupation: 'Comptable', email: 'cheikh.diop@email.sn', phone: '+221 77 678 90 12', address: '12 Rue Sandiniéry, Dakar', photoUrl: DEMO_PHOTO_CHEIKH, joinedAt: '2021-04-01', status: 'active', statusHistory: [{ status: 'active', since: '2021-04-01' }], tenantName: 'Coopérative Sutura', syncStatus: 'synced', version: 1, createdAt: '2021-04-01T00:00:00.000Z', updatedAt: '2021-04-01T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-5', role: 'boardMember', tenantName: 'Coopérative Sutura', startDate: '2023-01-15', endDate: null }],
    accounts: [{ id: 'A-7', accountNumber: 'CS-001-SAV-2', type: 'savings', balance: 3200000 }],
    documents: [{ id: 'D-8', name: 'Relevé 2025', type: 'statement', uploadedAt: '2025-12-31' }],
    activities: [{ id: 'AC-7', type: 'Prêt', description: 'Prêt décaissé - 2 100 000 FCFA', date: '2026-07-20' }],
    governanceParticipation: [{ id: 'G-3', assemblyName: 'AG 2026', role: 'Membre du bureau', date: '2026-06-15' }],
  },
  {
    id: 'M-007', uuid: '4d6f8a1c-3e5b-4d7a-9f1c-2e4a6c8b0d77', tenantId: 'T-002', matricule: '', firstName: 'Khadija', lastName: 'Mbaye', gender: 'female', birthDate: '1992-07-14', nationality: 'Sénégalaise', idNumber: 'SN-292-07-1992', occupation: 'Infirmière', email: 'khadija.mbaye@email.sn', phone: '+221 78 789 01 23', address: '45 Av. Général de Gaulle, Thiès', photoUrl: '', joinedAt: '2022-02-10', status: 'active', statusHistory: [{ status: 'active', since: '2022-02-10' }], tenantName: 'Tontine Horizon', syncStatus: 'synced', version: 1, createdAt: '2022-02-10T00:00:00.000Z', updatedAt: '2022-02-10T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    accounts: [{ id: 'A-8', accountNumber: 'TH-002-SAV-2', type: 'savings', balance: 670000 }],
    documents: [{ id: 'D-9', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2022-02-10' }],
    activities: [{ id: 'AC-8', type: 'Contribution', description: 'Contribution cycle 4 - Tontine Horizon', date: '2026-08-08' }],
    governanceParticipation: [],
  },
  {
    id: 'M-008', uuid: '6f8b0d2e-4c6a-4f8b-9d1e-3f5b7d9f1a88', tenantId: 'T-003', matricule: '', firstName: 'Ibrahima', lastName: 'Sarr', gender: 'male', birthDate: '1987-03-22', nationality: 'Sénégalaise', idNumber: 'SN-387-03-1987', occupation: 'Chauffeur', email: 'ibrahima.sarr@email.sn', phone: '+221 77 890 12 34', address: '78 Quai Louis Faidherbe, Saint-Louis', photoUrl: '', joinedAt: '2021-12-01', status: 'suspended', statusHistory: [{ status: 'suspended', since: '2021-12-01' }], tenantName: 'Mutuelle Teranga', syncStatus: 'synced', version: 1, createdAt: '2021-12-01T00:00:00.000Z', updatedAt: '2021-12-01T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    accounts: [{ id: 'A-9', accountNumber: 'MT-003-CUR-2', type: 'current', balance: 120000 }],
    documents: [{ id: 'D-10', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-12-01' }],
    activities: [{ id: 'AC-9', type: 'Suspension', description: 'Membre suspendu - retard de remboursement', date: '2026-07-01' }],
    governanceParticipation: [],
  },
];
