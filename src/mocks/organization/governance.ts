export type VoteResult = 'adopted' | 'rejected' | 'pending';
export type MandateStatus = 'ongoing' | 'expired' | 'upcoming';

/**
 * Validé D-4C3-WEB-01 (Option C, modèle hybride ciblé) + D-4C3-TECH-01 (cycle
 * de vie), cf. docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md §3.1 et
 * mandat IMPLEMENTATION GO §6. Même vocabulaire que `GeneralAssemblyStatus`
 * (déjà en place dans ce projet) — pas un nouveau choix de nommage. PLANNED
 * et CANCELLED sont les seuls états atteignables sans être passé par ONGOING ;
 * COMPLETED et CANCELLED sont terminaux (aucune transition sortante).
 */
export type MeetingStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

/** Validé D-4C4-WEB-02 : REGULAR par défaut, GENERAL_ASSEMBLY pour une AG (cf. D-4C4-WEB-01, `GeneralAssembly` n'est plus une entité autonome). */
export type MeetingType = 'REGULAR' | 'GENERAL_ASSEMBLY';

/**
 * `status` ajouté par D-4C3-WEB-01 (Option C). `type`/`description` ajoutés
 * par D-4C4-WEB-01/02 (cf. docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md) :
 * `type` distingue REGULAR de GENERAL_ASSEMBLY ; `description` résout le
 * point explicitement laissé ouvert par le PO Decision Pack Phase 4C-4
 * (« description n'a pas d'équivalent direct sur Meeting, agenda a une
 * sémantique différente ») — ajouté plutôt que de perdre la donnée
 * `GeneralAssembly.description` lors de la migration (aucune perte de
 * donnée existante, cf. mandat IMPLEMENTATION GO §25), null/non pertinent
 * pour un Meeting REGULAR. `uuid`/`sync_status`/`version`/timestamps
 * restent volontairement exclus (aucun besoin Web démontré) — convention
 * par défaut du projet, à laquelle `Member` (`mocks/organization/members.ts`)
 * déroge explicitement pour ces mêmes champs, décision fermée par D-MEM-02
 * (Option C, `docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md` §7) : le
 * dictionnaire canonique les exige nommément pour `Member`, contrairement à
 * `Meeting` et aux autres entités de ce fichier.
 *
 * L'ancienne entité autonome `Assembly` (`AS-001..004`) a été repliée ici par
 * la correction post-implémentation Phase 4C-4 (cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md
 * §4/§5) : `name`→`title`, `generalAssembly`/`extraordinaryAssembly`→
 * GENERAL_ASSEMBLY, `boardAssembly`→REGULAR, `upcoming`/`ongoing`/`expired`→
 * PLANNED/ONGOING/COMPLETED. AS-001 (2026-06-15, T-001, agenda quasi
 * identique) désignait le même événement réel que MT-005 (déjà migrée
 * depuis GeneralAssembly) : fusionnée dans MT-005 plutôt que dupliquée en
 * nouvelle ligne — `location`/`participants` de MT-005 en proviennent.
 * AS-002/003/004 n'ont aucune correspondance démontrable et sont devenues
 * MT-008/009/010.
 */
export type Meeting = { id: string; tenantId: string; title: string; date: string; location: string; participants: number; agenda: string; minutes: string | null; status: MeetingStatus; type: MeetingType; description: string | null };
/**
 * `meetingId` ajouté par D-4C4-WEB-07 (Vote.meeting_id → Meeting.id) ;
 * `assemblyDecisionId` ajouté par D-4C4-WEB-08 (Vote.assembly_decision_id →
 * AssemblyDecision.id, conservé en parallèle de meetingId). `V-001/002/003`
 * (2026-06-15, T-001) et `V-005` (2025-06-20, T-001) ont été rattachées à
 * MT-005/MT-010 par la correction post-implémentation Phase 4C-4, sur la base
 * d'une correspondance exacte date+tenant+sujet mise au jour en croisant
 * l'ancienne entité `Assembly` (non examinée par l'implémentation Phase 4C-4
 * initiale, qui n'avait croisé que `GeneralAssembly`) — cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md
 * §9. `V-004` (2026-08-25) rattachée à MT-001 : son sujet (« Validation des
 * tirages Q3 ») correspond littéralement à l'agenda de MT-001 (« … validation
 * tirages »), pas à AS-003/MT-009 (agenda sans rapport). Aucun
 * `assemblyDecisionId` n'est fabriqué pour ces 4 votes : aucune source ne
 * démontre à quelle AssemblyDecision ils correspondraient. Toute nouvelle
 * création via le flux AssemblyDecision→Vote (`decision-vote.service.ts`)
 * renseigne systématiquement `meetingId`. L'ancien onglet autonome "Governance >
 * Votes" (`organizationService.createVote`/`updateVoteResult`, votes avec
 * `meetingId: null`) a été supprimé — voir suppression ciblée du menu
 * Gouvernance/Votes. `Vote`/`votes` restent utilisés par le flux
 * AssemblyDecision→Vote ci-dessus, seule source de nouveaux `Vote` désormais.
 */
export type Vote = { id: string; tenantId: string; subject: string; date: string; yes: number; no: number; abstain: number; result: VoteResult; meetingId: string | null; assemblyDecisionId: string | null };
/**
 * `position` (déjà `string` libre avant le mandat « Fonctions / mandats ») :
 * le seed historique y stocke une clé i18n (`'president'`, etc., résolue par
 * `t('organization', row.position)` à l'affichage) — inchangé, ne pas
 * migrer, `t()` retourne la clé telle quelle si elle n'existe pas (fallback
 * documenté dans `locale-context.tsx`). Les NOUVEAUX mandats (créés via le
 * référentiel `MandateFunction`) y stockent désormais le NOM littéral de la
 * fonction (ex. "Président") plutôt qu'une clé — le même `t()` l'affiche tel
 * quel puisqu'aucune clé de ce nom n'existe, sans changement de rendu
 * nécessaire. Dans les deux cas, `position` reste le libellé CAPTURÉ à la
 * création du mandat, jamais réécrit rétroactivement si la fonction est
 * renommée dans le référentiel ensuite (besoin §12/§13).
 *
 * `positionFunctionId` (nouveau, optionnel) : référence VIVANTE vers
 * `MandateFunction` (`mocks/organization/mandate-functions.ts`), utilisée
 * uniquement pour résoudre l'usage réel d'une fonction — jamais pour
 * réafficher/reconstruire `position`, qui reste la seule source d'affichage
 * historique.
 */
export type BoardMember = { id: string; tenantId: string; memberId: string; memberName: string; position: string; positionFunctionId?: string; mandateStart: string; mandateEnd: string; status: MandateStatus };

export const meetings: Meeting[] = [
  // MT-001 (2026-08-25, T-001) est possiblement le même événement réel que l'ex-AS-003 « Conseil Q3 » (même date/tenant/participants=9) mais location et agenda diffèrent réellement entre les deux sources — fusion non effectuée (aucune preuve suffisante, cf. rapport de correction §13 GAP-01) ; les deux réunions restent distinctes pour ne perdre le contenu réel d'aucune des deux.
  { id: 'MT-001', tenantId: 'T-001', title: 'Réunion bureau - Août', date: '2026-08-25', location: 'Salle de conférence - Dakar', participants: 9, agenda: 'Préparation AG Q3, validation tirages', minutes: 'PV-2026-08', status: 'PLANNED', type: 'REGULAR', description: null },
  { id: 'MT-002', tenantId: 'T-001', title: 'Réunion trésorerie', date: '2026-08-18', location: 'En ligne', participants: 4, agenda: 'Suivi trésorerie, étude des demandes de prêt', minutes: 'PV-2026-08-02', status: 'PLANNED', type: 'REGULAR', description: null },
  { id: 'MT-003', tenantId: 'T-001', title: 'Réunion bureau - Septembre', date: '2026-09-15', location: 'Salle de conférence - Dakar', participants: 9, agenda: 'Préparation budget Q4', minutes: null, status: 'PLANNED', type: 'REGULAR', description: null },
  { id: 'MT-004', tenantId: 'T-001', title: 'Réunion audit', date: '2026-07-30', location: 'Siège - Dakar', participants: 6, agenda: 'Revue des procédures, plan d\'audit 2026', minutes: 'PV-2026-07', status: 'COMPLETED', type: 'REGULAR', description: null },
  // Migrées depuis l'ancienne entité autonome GeneralAssembly (D-4C4-WEB-01, Option B) — cf. docs/P1_GOVERNANCE_PHASE_4C4_IMPLEMENTATION_REPORT.md §Migration des données pour la table de correspondance GA-00x → MT-00x.
  // MT-005 : location/participants proviennent de l'ex-AS-001 « AG 2026 », fusionnée ici (même date/tenant/agenda que la GeneralAssembly GA-001 déjà migrée — un seul événement réel décrit deux fois dans les deux anciennes entités).
  { id: 'MT-005', tenantId: 'T-001', title: 'Assemblée Générale Ordinaire 2026', date: '2026-06-15', location: 'Siège - Dakar', participants: 124, agenda: '', minutes: null, status: 'COMPLETED', type: 'GENERAL_ASSEMBLY', description: 'Bilan annuel, élection du bureau, vote du budget 2026.' },
  { id: 'MT-006', tenantId: 'T-001', title: 'Assemblée Générale Extraordinaire — Budget Q4', date: '2026-11-20', location: '', participants: 0, agenda: '', minutes: null, status: 'PLANNED', type: 'GENERAL_ASSEMBLY', description: 'Révision du budget du quatrième trimestre.' },
  { id: 'MT-007', tenantId: 'T-002', title: 'Assemblée Générale Horizon 2026', date: '2026-07-10', location: '', participants: 0, agenda: '', minutes: null, status: 'ONGOING', type: 'GENERAL_ASSEMBLY', description: null },
  // Migrées depuis l'ancienne entité autonome Assembly (AS-002/003/004) par la correction post-implémentation Phase 4C-4 — aucune correspondance avec un Meeting/GeneralAssembly préexistant démontrée pour ces 3 lignes.
  { id: 'MT-008', tenantId: 'T-001', title: 'AGE Budget Q3', date: '2026-09-20', location: 'Siège - Dakar', participants: 86, agenda: 'Révision du budget Q3, validation des nouveaux prêts', minutes: null, status: 'PLANNED', type: 'GENERAL_ASSEMBLY', description: null },
  { id: 'MT-009', tenantId: 'T-001', title: 'Conseil Q3', date: '2026-08-25', location: 'En ligne', participants: 9, agenda: 'Suivi des tontines, point sur les remboursements', minutes: null, status: 'PLANNED', type: 'REGULAR', description: null },
  { id: 'MT-010', tenantId: 'T-001', title: 'AG 2025', date: '2025-06-20', location: 'Siège - Dakar', participants: 110, agenda: 'Bilan 2025, renouvellement du bureau', minutes: null, status: 'COMPLETED', type: 'GENERAL_ASSEMBLY', description: null },
];

export const votes: Vote[] = [
  { id: 'V-001', tenantId: 'T-001', subject: 'Adoption du budget 2026', date: '2026-06-15', yes: 118, no: 4, abstain: 2, result: 'adopted', meetingId: 'MT-005', assemblyDecisionId: null },
  { id: 'V-002', tenantId: 'T-001', subject: 'Élection du président', date: '2026-06-15', yes: 112, no: 8, abstain: 4, result: 'adopted', meetingId: 'MT-005', assemblyDecisionId: null },
  { id: 'V-003', tenantId: 'T-001', subject: 'Augmentation des cotisations', date: '2026-06-15', yes: 45, no: 72, abstain: 7, result: 'rejected', meetingId: 'MT-005', assemblyDecisionId: null },
  { id: 'V-004', tenantId: 'T-001', subject: 'Validation des tirages Q3', date: '2026-08-25', yes: 0, no: 0, abstain: 0, result: 'pending', meetingId: 'MT-001', assemblyDecisionId: null },
  { id: 'V-005', tenantId: 'T-001', subject: 'Renouvellement du bureau', date: '2025-06-20', yes: 105, no: 3, abstain: 2, result: 'adopted', meetingId: 'MT-010', assemblyDecisionId: null },
];

// `positionFunctionId` rétro-lié aux `MandateFunction` migrées (mandat « Fonctions / mandats », MF-001..004) — lien
// additif seul, `position` (clé i18n historique) reste inchangé, aucun mandat existant n'est altéré.
export const boardMembers: BoardMember[] = [
  { id: 'BM-001', tenantId: 'T-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', position: 'president', positionFunctionId: 'MF-001', mandateStart: '2023-01-15', mandateEnd: '2027-01-15', status: 'ongoing' },
  { id: 'BM-002', tenantId: 'T-001', memberId: 'M-002', memberName: 'Mamadou Sow', position: 'treasurer', positionFunctionId: 'MF-002', mandateStart: '2023-03-01', mandateEnd: '2027-03-01', status: 'ongoing' },
  { id: 'BM-003', tenantId: 'T-001', memberId: 'M-003', memberName: 'Aïssatou Bâ', position: 'secretary', positionFunctionId: 'MF-003', mandateStart: '2024-01-10', mandateEnd: '2026-01-10', status: 'expired' },
  { id: 'BM-004', tenantId: 'T-001', memberId: 'M-006', memberName: 'Cheikh Diop', position: 'boardMember', positionFunctionId: 'MF-004', mandateStart: '2023-01-15', mandateEnd: '2027-01-15', status: 'ongoing' },
  { id: 'BM-005', tenantId: 'T-001', memberId: 'M-007', memberName: 'Khadija Mbaye', position: 'boardMember', positionFunctionId: 'MF-004', mandateStart: '2026-09-01', mandateEnd: '2028-09-01', status: 'upcoming' },
];
