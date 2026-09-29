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
/** Caisse de l'adhérent (vue membre) — même notion métier que `Cashbox`, jamais un « compte ». */
export type MemberCashbox = { id: string; cashboxNumber: string; type: 'savings' | 'current' | 'loanCashbox'; balance: number };
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
  cashboxes: MemberCashbox[];
  documents: MemberDocument[];
  activities: MemberActivity[];
  governanceParticipation: { id: string; assemblyName: string; role: string; date: string }[];
};

export const members: Member[] = [
  {
    id: 'M-001', uuid: '8f14e45f-ceea-467e-bd42-8f57221b2400', tenantId: 'T-001', matricule: '', firstName: 'Fatou', lastName: 'Ndiaye', gender: 'female', birthDate: '1988-04-12', nationality: 'Camerounaise', idNumber: 'CM-884-12-1988', occupation: 'Commerçante', email: 'fatou.ndiaye@email.cm', phone: '+237 671 23 45 67', address: '12 Rue Joss, Bonanjo, Douala', photoUrl: '', joinedAt: '2021-03-20', status: 'active', statusHistory: [{ status: 'active', since: '2021-03-20' }], tenantName: 'Coopérative Sutura', syncStatus: 'synced', version: 1, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-1', role: 'president', tenantName: 'Coopérative Sutura', startDate: '2023-01-15', endDate: null }],
    cashboxes: [{ id: 'A-1', cashboxNumber: 'CS-001-SAV', type: 'savings', balance: 1250000 }, { id: 'A-2', cashboxNumber: 'CS-001-CUR', type: 'current', balance: 340000 }],
    documents: [{ id: 'D-1', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2021-03-20' }, { id: 'D-2', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-03-20' }],
    activities: [{ id: 'AC-1', type: 'Contribution', description: 'Contribution cycle 4 - Tontine Horizon', date: '2026-08-08' }, { id: 'AC-2', type: 'Assemblée', description: 'Participation AG 2026', date: '2026-06-15' }],
    governanceParticipation: [{ id: 'G-1', assemblyName: 'AG 2026', role: 'Présidente de séance', date: '2026-06-15' }],
  },
  {
    id: 'M-002', uuid: '3b1e6f2a-9c4d-4e6b-8a2f-1d5c7e9b0a11', tenantId: 'T-002', matricule: '', firstName: 'Mamadou', lastName: 'Sow', gender: 'male', birthDate: '1982-09-23', nationality: 'Camerounaise', idNumber: 'CM-283-09-1982', occupation: 'Artisan', email: 'mamadou.sow@email.cm', phone: '+237 662 34 56 78', address: '45 Av. Général de Gaulle, Thiès', photoUrl: '', joinedAt: '2022-01-25', status: 'active', statusHistory: [{ status: 'active', since: '2022-01-25' }], tenantName: 'Tontine Horizon', syncStatus: 'synced', version: 1, createdAt: '2022-01-25T00:00:00.000Z', updatedAt: '2022-01-25T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-2', role: 'treasurer', tenantName: 'Tontine Horizon', startDate: '2023-03-01', endDate: null }],
    cashboxes: [{ id: 'A-3', cashboxNumber: 'TH-002-SAV', type: 'savings', balance: 890000 }],
    documents: [{ id: 'D-3', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2022-01-25' }],
    activities: [{ id: 'AC-3', type: 'Prêt', description: 'Prêt approuvé - 1 200 000 FCFA', date: '2026-07-10' }],
    governanceParticipation: [],
  },
  {
    id: 'M-003', uuid: 'a7d2c8e1-4f6b-4a3d-9e1c-2b8f4d6a7c33', tenantId: 'T-003', matricule: '', firstName: 'Aïssatou', lastName: 'Bâ', gender: 'female', birthDate: '1990-12-05', nationality: 'Camerounaise', idNumber: 'CM-905-12-1990', occupation: 'Enseignante', email: 'aissatou.ba@email.cm', phone: '+237 683 45 67 89', address: '78 Route de Foumban, Bafoussam', photoUrl: '', joinedAt: '2021-11-12', status: 'active', statusHistory: [{ status: 'active', since: '2021-11-12' }], tenantName: 'Mutuelle Teranga', syncStatus: 'synced', version: 1, createdAt: '2021-11-12T00:00:00.000Z', updatedAt: '2021-11-12T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-3', role: 'secretary', tenantName: 'Mutuelle Teranga', startDate: '2024-01-10', endDate: null }],
    cashboxes: [{ id: 'A-4', cashboxNumber: 'MT-003-SAV', type: 'savings', balance: 2100000 }, { id: 'A-5', cashboxNumber: 'MT-003-CUR', type: 'current', balance: 180000 }],
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
    id: 'M-004', uuid: 'c5e9b3d7-6a1f-4c8e-8b2d-3a5f7c9e1b44', tenantId: 'T-004', matricule: '', firstName: 'Ousmane', lastName: 'Fall', gender: 'male', birthDate: '1995-06-18', nationality: 'Camerounaise', idNumber: 'CM-184-06-1995', occupation: 'Étudiant', email: 'ousmane.fall@email.cm', phone: '+237 674 56 78 90', address: '23 Grand Marché, Garoua', photoUrl: '', joinedAt: '2024-02-15', status: 'active', statusHistory: [{ status: 'active', since: '2024-02-15' }], tenantName: 'Association Jappo', syncStatus: 'synced', version: 2, createdAt: '2024-02-15T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    cashboxes: [],
    documents: [{ id: 'D-6', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2024-02-15' }],
    activities: [{ id: 'AC-5', type: 'Inscription', description: 'Demande d\'adhésion soumise', date: '2024-02-15' }],
    governanceParticipation: [],
  },
  {
    id: 'M-005', uuid: 'e1f4a6c8-2b5d-4e7a-9c3f-6d8a1b4e7c55', tenantId: 'T-005', matricule: '', firstName: 'Awa', lastName: 'Cissé', gender: 'female', birthDate: '1985-02-28', nationality: 'Camerounaise', idNumber: 'CM-285-02-1985', occupation: 'Commerçante', email: 'awa.cisse@email.cm', phone: '+237 665 67 89 01', address: '5 Commercial Avenue, Bamenda', photoUrl: '', joinedAt: '2023-06-12', status: 'inactive', statusHistory: [{ status: 'inactive', since: '2023-06-12' }], tenantName: 'Tontine Avenir', syncStatus: 'synced', version: 1, createdAt: '2023-06-12T00:00:00.000Z', updatedAt: '2023-06-12T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-4', role: 'member', tenantName: 'Tontine Avenir', startDate: '2023-06-12', endDate: '2024-06-12' }],
    cashboxes: [{ id: 'A-6', cashboxNumber: 'TA-005-SAV', type: 'savings', balance: 450000 }],
    documents: [{ id: 'D-7', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2023-06-12' }],
    activities: [{ id: 'AC-6', type: 'Désactivation', description: 'Compte désactivé - inactivité', date: '2024-06-15' }],
    governanceParticipation: [],
  },
  {
    id: 'M-006', uuid: '0a2c4e6f-8b1d-4a3c-9e5f-7c9b1d3e5f66', tenantId: 'T-001', matricule: '', firstName: 'Cheikh', lastName: 'Diop', gender: 'male', birthDate: '1979-11-30', nationality: 'Camerounaise', idNumber: 'CM-979-11-1979', occupation: 'Comptable', email: 'cheikh.diop@email.cm', phone: '+237 676 78 90 12', address: '12 Rue Joss, Bonanjo, Douala', photoUrl: DEMO_PHOTO_CHEIKH, joinedAt: '2021-04-01', status: 'active', statusHistory: [{ status: 'active', since: '2021-04-01' }], tenantName: 'Coopérative Sutura', syncStatus: 'synced', version: 1, createdAt: '2021-04-01T00:00:00.000Z', updatedAt: '2021-04-01T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-5', role: 'boardMember', tenantName: 'Coopérative Sutura', startDate: '2023-01-15', endDate: null }],
    cashboxes: [{ id: 'A-7', cashboxNumber: 'CS-001-SAV-2', type: 'savings', balance: 3200000 }],
    documents: [{ id: 'D-8', name: 'Relevé 2025', type: 'statement', uploadedAt: '2025-12-31' }],
    activities: [{ id: 'AC-7', type: 'Prêt', description: 'Prêt décaissé - 2 100 000 FCFA', date: '2026-07-20' }],
    governanceParticipation: [{ id: 'G-3', assemblyName: 'AG 2026', role: 'Membre du bureau', date: '2026-06-15' }],
  },
  {
    id: 'M-007', uuid: '4d6f8a1c-3e5b-4d7a-9f1c-2e4a6c8b0d77', tenantId: 'T-002', matricule: '', firstName: 'Khadija', lastName: 'Mbaye', gender: 'female', birthDate: '1992-07-14', nationality: 'Camerounaise', idNumber: 'CM-292-07-1992', occupation: 'Infirmière', email: 'khadija.mbaye@email.cm', phone: '+237 687 89 01 23', address: '45 Av. Général de Gaulle, Thiès', photoUrl: '', joinedAt: '2022-02-10', status: 'active', statusHistory: [{ status: 'active', since: '2022-02-10' }], tenantName: 'Tontine Horizon', syncStatus: 'synced', version: 1, createdAt: '2022-02-10T00:00:00.000Z', updatedAt: '2022-02-10T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    cashboxes: [{ id: 'A-8', cashboxNumber: 'TH-002-SAV-2', type: 'savings', balance: 670000 }],
    documents: [{ id: 'D-9', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2022-02-10' }],
    activities: [{ id: 'AC-8', type: 'Contribution', description: 'Contribution cycle 4 - Tontine Horizon', date: '2026-08-08' }],
    governanceParticipation: [],
  },
  {
    id: 'M-008', uuid: '6f8b0d2e-4c6a-4f8b-9d1e-3f5b7d9f1a88', tenantId: 'T-003', matricule: '', firstName: 'Ibrahima', lastName: 'Sarr', gender: 'male', birthDate: '1987-03-22', nationality: 'Camerounaise', idNumber: 'CM-387-03-1987', occupation: 'Chauffeur', email: 'ibrahima.sarr@email.cm', phone: '+237 678 90 12 34', address: '78 Route de Foumban, Bafoussam', photoUrl: '', joinedAt: '2021-12-01', status: 'suspended', statusHistory: [{ status: 'suspended', since: '2021-12-01' }], tenantName: 'Mutuelle Teranga', syncStatus: 'synced', version: 1, createdAt: '2021-12-01T00:00:00.000Z', updatedAt: '2021-12-01T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    cashboxes: [{ id: 'A-9', cashboxNumber: 'MT-003-CUR-2', type: 'current', balance: 120000 }],
    documents: [{ id: 'D-10', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-12-01' }],
    activities: [{ id: 'AC-9', type: 'Suspension', description: 'Membre suspendu - retard de remboursement', date: '2026-07-01' }],
    governanceParticipation: [],
  },
  // M-009..M-018 — 10 membres fictifs supplémentaires (mandat « Évolution du cycle de vie des
  // exercices fiscaux » §annexe), répartis sur les 5 tenants existants, couvrant les 4 valeurs de
  // `MemberStatus` (dont `exited`, absent du seed jusqu'ici). Même convention que M-001..M-008 :
  // `matricule`/`photoUrl` vides (non renseignés), `statusHistory` amorcée à une seule entrée
  // `{ status: <actuel>, since: joinedAt }` (bootstrap conservateur, cf. commentaire du type ci-dessus).
  {
    id: 'M-009', uuid: 'a1b2c3d4-1111-4a1b-9c2d-3e4f5a6b7c81', tenantId: 'T-002', matricule: '', firstName: 'Aminata', lastName: 'Diallo', gender: 'female', birthDate: '1990-05-14', nationality: 'Camerounaise', idNumber: 'CM-514-05-1990', occupation: 'Couturière', email: 'aminata.diallo@email.cm', phone: '+237 672 34 56 78', address: '9 Rue de la Paix, Thiès', photoUrl: '', joinedAt: '2022-02-10', status: 'active', statusHistory: [{ status: 'active', since: '2022-02-10' }], tenantName: 'Tontine Horizon', syncStatus: 'synced', version: 1, createdAt: '2022-02-10T00:00:00.000Z', updatedAt: '2022-02-10T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-6', role: 'member', tenantName: 'Tontine Horizon', startDate: '2022-02-10', endDate: null }],
    cashboxes: [{ id: 'A-10', cashboxNumber: 'TH-002-SAV-3', type: 'savings', balance: 275000 }],
    documents: [{ id: 'D-11', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2022-02-10' }],
    activities: [{ id: 'AC-10', type: 'Contribution', description: 'Contribution cycle 4 - Tontine Horizon', date: '2026-08-08' }],
    governanceParticipation: [],
  },
  {
    id: 'M-010', uuid: 'a1b2c3d4-2222-4a1b-9c2d-3e4f5a6b7c82', tenantId: 'T-002', matricule: '', firstName: 'Moussa', lastName: 'Fall', gender: 'male', birthDate: '1982-11-03', nationality: 'Camerounaise', idNumber: 'CM-113-11-1982', occupation: 'Menuisier', email: 'moussa.fall@email.cm', phone: '+237 663 45 67 89', address: '22 Avenue Léopold Sédar Senghor, Thiès', photoUrl: '', joinedAt: '2020-09-05', status: 'active', statusHistory: [{ status: 'active', since: '2020-09-05' }], tenantName: 'Tontine Horizon', syncStatus: 'synced', version: 1, createdAt: '2020-09-05T00:00:00.000Z', updatedAt: '2020-09-05T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-7', role: 'boardMember', tenantName: 'Tontine Horizon', startDate: '2024-01-10', endDate: null }],
    cashboxes: [{ id: 'A-11', cashboxNumber: 'TH-002-CUR-2', type: 'current', balance: 512000 }],
    documents: [{ id: 'D-12', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2020-09-05' }],
    activities: [{ id: 'AC-11', type: 'Prêt', description: 'Prêt approuvé - 900 000 FCFA', date: '2026-06-18' }],
    governanceParticipation: [{ id: 'G-4', assemblyName: 'AG 2026', role: 'Membre du bureau', date: '2026-06-15' }],
  },
  {
    id: 'M-011', uuid: 'a1b2c3d4-3333-4a1b-9c2d-3e4f5a6b7c83', tenantId: 'T-003', matricule: '', firstName: 'Bineta', lastName: 'Sow', gender: 'female', birthDate: '1993-07-22', nationality: 'Camerounaise', idNumber: 'CM-722-07-1993', occupation: 'Enseignante', email: 'bineta.sow@email.cm', phone: '+237 684 56 78 90', address: '4 Avenue Wanko, Bafoussam', photoUrl: '', joinedAt: '2023-04-18', status: 'active', statusHistory: [{ status: 'active', since: '2023-04-18' }], tenantName: 'Mutuelle Teranga', syncStatus: 'synced', version: 1, createdAt: '2023-04-18T00:00:00.000Z', updatedAt: '2023-04-18T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-8', role: 'secretary', tenantName: 'Mutuelle Teranga', startDate: '2024-01-10', endDate: null }],
    cashboxes: [{ id: 'A-12', cashboxNumber: 'MT-003-SAV-2', type: 'savings', balance: 640000 }],
    documents: [{ id: 'D-13', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2023-04-18' }],
    activities: [{ id: 'AC-12', type: 'Contribution', description: 'Contribution cycle 1 - Mutuelle Teranga', date: '2026-07-15' }],
    governanceParticipation: [],
  },
  {
    id: 'M-012', uuid: 'a1b2c3d4-4444-4a1b-9c2d-3e4f5a6b7c84', tenantId: 'T-004', matricule: '', firstName: 'Ousmane', lastName: 'Ba', gender: 'male', birthDate: '1979-01-30', nationality: 'Camerounaise', idNumber: 'CM-130-01-1979', occupation: 'Agriculteur', email: 'ousmane.ba@email.cm', phone: '+237 675 67 89 01', address: '15 Boulevard de la Liberté, Akwa, Douala', photoUrl: '', joinedAt: '2019-06-12', status: 'active', statusHistory: [{ status: 'active', since: '2019-06-12' }], tenantName: 'Association Jappo', syncStatus: 'synced', version: 1, createdAt: '2019-06-12T00:00:00.000Z', updatedAt: '2019-06-12T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-9', role: 'president', tenantName: 'Association Jappo', startDate: '2023-01-15', endDate: null }],
    cashboxes: [{ id: 'A-13', cashboxNumber: 'AJ-004-SAV', type: 'savings', balance: 980000 }],
    documents: [{ id: 'D-14', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2019-06-12' }],
    activities: [{ id: 'AC-13', type: 'Assemblée', description: 'Participation AG 2026', date: '2026-06-15' }],
    governanceParticipation: [{ id: 'G-5', assemblyName: 'AG 2026', role: 'Président de séance', date: '2026-06-15' }],
  },
  {
    id: 'M-013', uuid: 'a1b2c3d4-5555-4a1b-9c2d-3e4f5a6b7c85', tenantId: 'T-004', matricule: '', firstName: 'Khady', lastName: 'Sy', gender: 'female', birthDate: '1986-09-09', nationality: 'Camerounaise', idNumber: 'CM-909-09-1986', occupation: 'Commerçante', email: 'khady.sy@email.cm', phone: '+237 666 78 90 12', address: '31 Rue Njo-Njo, Bonapriso, Douala', photoUrl: '', joinedAt: '2021-10-01', status: 'inactive', statusHistory: [{ status: 'inactive', since: '2021-10-01' }], tenantName: 'Association Jappo', syncStatus: 'synced', version: 1, createdAt: '2021-10-01T00:00:00.000Z', updatedAt: '2021-10-01T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    cashboxes: [{ id: 'A-14', cashboxNumber: 'AJ-004-CUR', type: 'current', balance: 85000 }],
    documents: [{ id: 'D-15', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2021-10-01' }],
    activities: [{ id: 'AC-14', type: 'Désactivation', description: 'Compte désactivé - inactivité', date: '2025-03-01' }],
    governanceParticipation: [],
  },
  {
    id: 'M-014', uuid: 'a1b2c3d4-6666-4a1b-9c2d-3e4f5a6b7c86', tenantId: 'T-005', matricule: '', firstName: 'Alassane', lastName: 'Diouf', gender: 'male', birthDate: '1991-12-25', nationality: 'Camerounaise', idNumber: 'CM-1225-12-1991', occupation: 'Chauffeur', email: 'alassane.diouf@email.cm', phone: '+237 687 89 01 23', address: '6 Rue du Marché, Bamenda', photoUrl: '', joinedAt: '2024-03-08', status: 'active', statusHistory: [{ status: 'active', since: '2024-03-08' }], tenantName: 'Tontine Avenir', syncStatus: 'synced', version: 1, createdAt: '2024-03-08T00:00:00.000Z', updatedAt: '2024-03-08T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-10', role: 'treasurer', tenantName: 'Tontine Avenir', startDate: '2024-03-08', endDate: null }],
    cashboxes: [{ id: 'A-15', cashboxNumber: 'TA-005-SAV-2', type: 'savings', balance: 310000 }],
    documents: [{ id: 'D-16', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2024-03-08' }],
    activities: [{ id: 'AC-15', type: 'Contribution', description: 'Contribution mensuelle - Tontine Avenir', date: '2026-08-05' }],
    governanceParticipation: [],
  },
  {
    id: 'M-015', uuid: 'a1b2c3d4-7777-4a1b-9c2d-3e4f5a6b7c87', tenantId: 'T-005', matricule: '', firstName: 'Ndeye', lastName: 'Gueye', gender: 'female', birthDate: '1984-06-17', nationality: 'Camerounaise', idNumber: 'CM-617-06-1984', occupation: 'Commerçante', email: 'ndeye.gueye@email.cm', phone: '+237 678 90 23 45', address: '18 Hospital Roundabout, Bamenda', photoUrl: '', joinedAt: '2022-08-14', status: 'suspended', statusHistory: [{ status: 'suspended', since: '2022-08-14' }], tenantName: 'Tontine Avenir', syncStatus: 'synced', version: 1, createdAt: '2022-08-14T00:00:00.000Z', updatedAt: '2022-08-14T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [],
    cashboxes: [{ id: 'A-16', cashboxNumber: 'TA-005-CUR', type: 'current', balance: 42000 }],
    documents: [{ id: 'D-17', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2022-08-14' }],
    activities: [{ id: 'AC-16', type: 'Suspension', description: 'Membre suspendu - retard de remboursement', date: '2026-05-20' }],
    governanceParticipation: [],
  },
  {
    id: 'M-016', uuid: 'a1b2c3d4-8888-4a1b-9c2d-3e4f5a6b7c88', tenantId: 'T-001', matricule: '', firstName: 'Modou', lastName: 'Faye', gender: 'male', birthDate: '1989-02-11', nationality: 'Camerounaise', idNumber: 'CM-211-02-1989', occupation: 'Électricien', email: 'modou.faye@email.cm', phone: '+237 669 01 34 56', address: '27 Rue Tokoto, Bonapriso, Douala', photoUrl: '', joinedAt: '2023-11-02', status: 'active', statusHistory: [{ status: 'active', since: '2023-11-02' }], tenantName: 'Coopérative Sutura', syncStatus: 'synced', version: 1, createdAt: '2023-11-02T00:00:00.000Z', updatedAt: '2023-11-02T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-11', role: 'member', tenantName: 'Coopérative Sutura', startDate: '2023-11-02', endDate: null }],
    cashboxes: [{ id: 'A-17', cashboxNumber: 'CS-001-SAV-3', type: 'savings', balance: 155000 }],
    documents: [{ id: 'D-18', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2023-11-02' }],
    activities: [{ id: 'AC-17', type: 'Contribution', description: 'Contribution cycle 4 - Coopérative Sutura', date: '2026-08-08' }],
    governanceParticipation: [],
  },
  // Premier exemple de seed en statut `exited` (absent jusqu'ici) — `positions` porte une `endDate`
  // cohérente avec la sortie, `statusHistory` amorcée à `exited` (même hypothèse conservatrice que
  // les autres membres : aucune source ne fournit un historique différencié plus riche).
  {
    id: 'M-017', uuid: 'a1b2c3d4-9999-4a1b-9c2d-3e4f5a6b7c89', tenantId: 'T-003', matricule: '', firstName: 'Lamine', lastName: 'Diagne', gender: 'male', birthDate: '1980-04-05', nationality: 'Camerounaise', idNumber: 'CM-405-04-1980', occupation: 'Mécanicien', email: 'lamine.diagne@email.cm', phone: '+237 680 12 45 67', address: '11 Carrefour Tamdja, Bafoussam', photoUrl: '', joinedAt: '2018-05-20', status: 'exited', statusHistory: [{ status: 'exited', since: '2025-09-01' }], tenantName: 'Mutuelle Teranga', syncStatus: 'synced', version: 1, createdAt: '2018-05-20T00:00:00.000Z', updatedAt: '2025-09-01T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-12', role: 'member', tenantName: 'Mutuelle Teranga', startDate: '2018-05-20', endDate: '2025-09-01' }],
    cashboxes: [],
    documents: [{ id: 'D-19', name: 'Contrat d\'adhésion', type: 'contract', uploadedAt: '2018-05-20' }],
    activities: [{ id: 'AC-18', type: 'Sortie', description: 'Membre sorti - démission volontaire', date: '2025-09-01' }],
    governanceParticipation: [],
  },
  {
    id: 'M-018', uuid: 'a1b2c3d4-aaaa-4a1b-9c2d-3e4f5a6b7c90', tenantId: 'T-001', matricule: '', firstName: 'Coumba', lastName: 'Thiam', gender: 'female', birthDate: '1995-10-28', nationality: 'Camerounaise', idNumber: 'CM-1028-10-1995', occupation: 'Infirmière', email: 'coumba.thiam@email.cm', phone: '+237 671 23 56 78', address: '3 Rue Gallieni, Akwa, Douala', photoUrl: '', joinedAt: '2024-06-01', status: 'active', statusHistory: [{ status: 'active', since: '2024-06-01' }], tenantName: 'Coopérative Sutura', syncStatus: 'synced', version: 1, createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
    positions: [{ id: 'P-13', role: 'member', tenantName: 'Coopérative Sutura', startDate: '2024-06-01', endDate: null }],
    cashboxes: [{ id: 'A-18', cashboxNumber: 'CS-001-SAV-4', type: 'savings', balance: 92000 }],
    documents: [{ id: 'D-20', name: 'Carte d\'identité', type: 'idDocument', uploadedAt: '2024-06-01' }],
    activities: [{ id: 'AC-19', type: 'Contribution', description: 'Contribution cycle 4 - Coopérative Sutura', date: '2026-08-08' }],
    governanceParticipation: [],
  },
];
