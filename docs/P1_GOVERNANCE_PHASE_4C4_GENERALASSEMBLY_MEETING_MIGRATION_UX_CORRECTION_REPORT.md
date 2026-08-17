# P1 GOVERNANCE — PHASE 4C-4 / GENERALASSEMBLY → MEETING / MIGRATION / UX CORRECTION REPORT

## 1. Problème constaté

Après la mission "IMPLEMENTATION GO" de la Phase 4C-4 (les 10 décisions D-4C4-WEB-01..10), l'utilisateur a inspecté visuellement l'application et constaté que le menu Governance affichait toujours **"Assemblées Générales"** et **"Assemblées"** comme entrées de navigation autonomes, à côté de "Réunions" — alors que l'objectif validé de la Phase 4C-4 était de faire de `Meeting` le seul point d'entrée métier pour les réunions et assemblées générales.

L'audit de code réel (pas seulement les rapports précédents) a confirmé deux problèmes distincts, imbriqués :

1. **`GeneralAssembly` (entité plus récente)** : l'implémentation Phase 4C-4 avait bien migré ses données dans `Meeting(type=GENERAL_ASSEMBLY)` (`MT-005/006/007`) et repointé `general-assembly.service.ts` pour lire ce sous-ensemble — mais **l'ancienne UI** (`GeneralAssemblyList`/`GeneralAssemblyCreate`/`GeneralAssemblyDetail`, 3 routes `governance/general-assemblies*`, entrée de menu) **n'avait jamais été retirée**. Seule la couche donnée/service avait été migrée, jamais la couche navigation/UI.
2. **`Assembly` (entité plus ancienne, jamais couverte par les 10 décisions D-4C4-WEB)** : un type et un tableau `assemblies` (`AS-001..004`) totalement autonomes, avec son propre service (`organizationService.listAssemblies`/`createAssembly`), sa propre page (`GovernanceTablePage kind="assemblies"`) et sa propre entrée de menu, existaient toujours en parallèle — sans avoir jamais été audités ni migrés par aucune mission précédente.

## 2. Architecture avant

- Menu Governance : General Assemblies, Assemblies, Meetings, Votes, Board & Mandates (5 entrées autonomes).
- 3 entités métier distinctes en parallèle pour un même concept réel ("réunion/assemblée") : `Assembly` (type+tableau propres), `GeneralAssembly` (vue de lecture sur `Meeting`, mais UI/routes autonomes), `Meeting` (le modèle cible).
- Routes : `governance/assemblies`, `governance/general-assemblies`, `governance/general-assemblies/create`, `governance/general-assemblies/:id`, `governance/general-assemblies/:meetingId/decisions/:decisionId/votes`, en plus de `governance/meetings*`.
- `organizationService.createMeeting` forçait `type: 'REGULAR'` — aucune création de `Meeting(type=GENERAL_ASSEMBLY)` n'était possible depuis le formulaire générique.
- Aucune page détail `Meeting` générique n'existait — `GeneralAssemblyDetail` était le seul endroit affichant Quorum/Décisions.

## 3. Architecture après

- Menu Governance : Meetings, Votes, Board & Mandates (3 entrées). "Assemblées Générales"/"Assemblées" ne sont plus des entrées de menu.
- Une seule entité métier autonome : `Meeting` (`type: 'REGULAR' | 'GENERAL_ASSEMBLY'`). `Assembly` (type, tableau, service `listAssemblies`/`createAssembly`) a été entièrement retiré du code. `GeneralAssembly` reste disponible en interne comme vue de lecture (`general-assembly.service.ts`, inchangé, toujours utilisé par les tests des services Decision/Vote/Quorum comme fixture pratique) mais n'a plus aucune route ni composant UI dédié.
- Le formulaire "Créer une réunion" (unifié) impose un sélecteur `Type de réunion` (REGULAR / GENERAL_ASSEMBLY) obligatoire ; pour GENERAL_ASSEMBLY un champ `Description` additionnel apparaît.
- La liste Meetings devient la liste centrale : colonne "Type" (badge), filtre par type, action "Voir le détail" par ligne.
- Une page `MeetingDetail` unique (`/organization/governance/meetings/:id`) affiche : Informations de la réunion (toujours), Présences (lien, toujours), Quorum + Décisions (uniquement si `type === 'GENERAL_ASSEMBLY'`, composants réutilisés tels quels).
- Les anciennes routes `governance/assemblies`, `governance/general-assemblies`, `governance/general-assemblies/create` redirigent (`<Navigate replace>`) vers `/organization/governance/meetings`. `governance/general-assemblies/:id` et `governance/general-assemblies/:meetingId/decisions/:decisionId/votes` redirigent vers l'équivalent `governance/meetings/...` **en préservant les identifiants** (aucun lien profond cassé).

## 4. Mapping GeneralAssembly → Meeting

*(Rappel — déjà migré par la mission IMPLEMENTATION GO Phase 4C-4, non remis en cause ici ; les 3 enregistrements `GA-001/002/003` avaient été vérifiés migrés vers `MT-005/006/007`, cf. §9 pour la re-vérification effectuée dans cette mission.)*

| Champ `GeneralAssembly` (vue) | Destination `Meeting` | Classe |
|---|---|---|
| `id` | `id` (même id, ex. `MT-005`) | A |
| `tenantId` | `tenantId` | A |
| `title` | `title` | A |
| `assemblyDate` | `date` | A |
| `description` | `description` | A |
| `status` | `status` (MeetingStatus complet, cycle de vie hérité) | A |
| — | `type` (fixé à `GENERAL_ASSEMBLY`) | B |
| — | `location`, `participants`, `agenda`, `minutes` | G (aucune source `GeneralAssembly` pour ces champs — restent vides/0/null tant qu'aucune saisie réelle n'existe) |

## 5. Mapping Assembly → Meeting / AssemblyDecision / Vote

| Champ `Assembly` | Destination | Classe | Notes |
|---|---|---|---|
| `id` (`AS-00x`) | Nouveau `Meeting.id` (`MT-008/009/010`), sauf `AS-001` fusionné dans `MT-005` existant | A | Pas de préservation littérale de l'ancien id — nouvelle séquence `MT-`, cohérente avec la migration GeneralAssembly précédente |
| `tenantId` | `Meeting.tenantId` | A | Direct |
| `name` | `Meeting.title` | A | Renommage de champ uniquement |
| `type` (`generalAssembly`/`extraordinaryAssembly`/`boardAssembly`) | `Meeting.type` (REGULAR/GENERAL_ASSEMBLY) | B | `generalAssembly`→GENERAL_ASSEMBLY, `extraordinaryAssembly`→GENERAL_ASSEMBLY, `boardAssembly`→REGULAR |
| `date` | `Meeting.date` | A | Direct |
| `location` | `Meeting.location` | A | Direct |
| `participants` | `Meeting.participants` | A | Direct |
| `status` (`ongoing`/`expired`/`upcoming`) | `Meeting.status` (PLANNED/ONGOING/COMPLETED/CANCELLED) | A | `upcoming`→PLANNED, `ongoing`→ONGOING, `expired`→COMPLETED (aucune source CANCELLED) |
| `agenda` | `Meeting.agenda` | A | Direct (même nom de champ) |
| — | `Meeting.description` | F | Non dupliqué avec `agenda` — laissé `null` pour éviter une redondance artificielle |
| — | `Meeting.minutes` | G | Aucun équivalent `Assembly` — laissé `null` |
| — | `AssemblyDecision`/`Vote`/`VoteOption`/`MemberVote` | G | Aucune source (`Assembly.agenda` est un texte libre, jamais structuré en décisions/options) — aucune fabrication |

### Découverte non anticipée par le mandat : doublons entre `Assembly` et `Meeting`/`GeneralAssembly` préexistants

En comparant champ par champ (date + tenant + agenda/sujet), deux cas de figure réels ont été identifiés :

- **`AS-001` (« AG 2026 », 2026-06-15, T-001, agenda "Bilan annuel, élection du bureau, vote du budget 2026") et `MT-005` (« Assemblée Générale Ordinaire 2026 », même date, même tenant, description quasi identique)** décrivent manifestement le **même événement réel**, saisi deux fois dans deux anciennes entités distinctes. Décision : **fusion** — `AS-001` n'est pas devenu un nouveau `Meeting`, ses champs `location`/`participants` (absents de `MT-005`) ont été reportés sur `MT-005` existant. Aucune duplication d'un même événement métier n'a été introduite.
- **`AS-003` (« Conseil Q3 », 2026-08-25, T-001, 9 participants, lieu "En ligne") et `MT-001` (« Réunion bureau - Août », même date, même tenant, mêmes 9 participants, lieu "Salle de conférence - Dakar")** partagent date/tenant/effectif mais **pas** le lieu ni l'agenda — preuve insuffisante pour une fusion sans risque de perte de contenu réel de l'un ou l'autre. Décision : **pas de fusion**, `AS-003` devient `MT-009` distinct. Signalé comme observation (GAP-01, cf. §13) pour arbitrage PO si nécessaire — aucune fusion n'a été devinée.

Aucune autre correspondance n'a été trouvée pour `AS-002`/`AS-004`.

## 6. Champs du formulaire Meeting (unifié)

Le formulaire "Créer une réunion" (`GovernanceTablePage`, dialogue de création) est désormais unique pour les deux types :

- **Type de réunion** (obligatoire, select REGULAR/GENERAL_ASSEMBLY) — premier champ, pilote l'affichage du reste.
- Titre, Date, Participants, Lieu, Ordre du jour — communs aux deux types (champs déjà présents pour REGULAR, repris tels quels).
- **Description** — affiché uniquement si `type === GENERAL_ASSEMBLY` (c'était le seul champ propre à `GeneralAssembly` sans équivalent direct sur `Meeting`, cf. §4). Aucun champ propre à `Assembly` n'a nécessité d'ajout supplémentaire : tous ses champs distinctifs (`name`, `date`, `location`, `participants`, `agenda`) avaient déjà un homologue direct sur `Meeting`.
- Aucun champ n'a été inventé (pas de nouveau critère métier, pas de nouvelle liste d'options).

## 7. Navigation (avant/après)

**Avant** : Governance > General Assemblies, Assemblies, Meetings, Votes, Board & Mandates.

**Après** : Governance > Meetings, Votes, Board & Mandates.

"Réunions" est la seule entrée de menu couvrant les réunions et assemblées générales. La visibilité du sous-ensemble "Assemblées Générales" n'est pas perdue : la page d'accueil Governance (`GovernanceOverview`) affiche une carte "Assemblées Générales" dont le compteur reflète `meetings.filter(type === GENERAL_ASSEMBLY).length` et qui navigue vers `/organization/governance/meetings?type=GENERAL_ASSEMBLY` (liste Meetings pré-filtrée) — ce n'est pas une route/structure autonome, seulement un filtre sur la liste unique.

## 8. Routes

| Route | Avant | Après |
|---|---|---|
| `governance/meetings` | Liste Meetings (REGULAR only, implicite) | Liste Meetings unifiée, avec colonne/filtre Type |
| `governance/meetings/:id` | N'existait pas | **Nouveau** — `MeetingDetail`, Quorum/Décisions si GENERAL_ASSEMBLY |
| `governance/meetings/:meetingId/attendances` | Existant | Inchangé |
| `governance/meetings/:meetingId/decisions/:decisionId/votes` | N'existait pas à ce chemin | **Nouveau** — déplacé depuis `governance/general-assemblies/:meetingId/decisions/:decisionId/votes` |
| `governance/assemblies` | Page CRUD-lite Assembly autonome | **Redirection** → `/organization/governance/meetings` |
| `governance/general-assemblies` | Liste GeneralAssembly autonome | **Redirection** → `/organization/governance/meetings` |
| `governance/general-assemblies/create` | Formulaire GeneralAssembly autonome | **Redirection** → `/organization/governance/meetings` |
| `governance/general-assemblies/:id` | `GeneralAssemblyDetail` autonome | **Redirection avec id préservé** → `/organization/governance/meetings/:id` (`RedirectToMeeting`) |
| `governance/general-assemblies/:meetingId/decisions/:decisionId/votes` | `DecisionVotesPage` | **Redirection avec ids préservés** → `/organization/governance/meetings/:meetingId/decisions/:decisionId/votes` (`RedirectToDecisionVotes`) |

Aucune route supprimée brutalement : les 5 anciennes routes restent déclarées, mais uniquement comme redirections — aucun lien/marque-page existant ne peut atterrir sur un 404.

## 9. Données migrées

- **Vérification de la migration GA-001/002/003 → MT-005/006/007** (rapportée "complète" par la mission précédente) : re-vérifiée par lecture directe de `governance.ts` — titres, dates, statuts, descriptions confirmés corrects et cohérents avec les décisions D-4C4-WEB-01/02. Aucune perte constatée sur ce périmètre.
- **`Assembly` → `Meeting`** : `AS-001` fusionné dans `MT-005` existant (location/participants reportés) ; `AS-002` → `MT-008` ; `AS-003` → `MT-009` ; `AS-004` → `MT-010`. Le tableau `assemblies` et le type `Assembly` ont été supprimés de `src/mocks/organization/governance.ts` une fois la migration effectuée.
- **`Vote.meetingId`** : les 5 votes préexistants (`V-001..005`), jusqu'ici tous `meetingId: null` (faute de preuve), ont pu être rattachés grâce à l'évidence croisée exposée par l'examen d'`Assembly` (non fait par la mission précédente, qui n'avait croisé que `GeneralAssembly`) :
  - `V-001/002/003` (2026-06-15, T-001 — budget/président/cotisations) → `MT-005` (correspond à l'agenda fusionné d'`AS-001`/`GA-001`).
  - `V-004` (2026-08-25, T-001, « Validation des tirages Q3 ») → `MT-001` (correspondance littérale avec l'agenda de `MT-001` : « … validation tirages »).
  - `V-005` (2025-06-20, T-001, « Renouvellement du bureau ») → `MT-010` (ex-`AS-004`, agenda identique).
  - Aucun `assemblyDecisionId` n'a été fabriqué pour ces 5 votes : aucune source ne démontre à quelle `AssemblyDecision` ils correspondraient.
- **Cross-références Operations/Audit** (hors périmètre Governance mais dépendance technique directe démontrée — `entityId`/`resourceId` pointant vers des ids `AS-00x` qui n'existent plus) : `src/mocks/operations/documents.ts` (`DOC-005`, `AS-001`→`MT-005`), `src/mocks/operations/workflow-requests.ts` (`WR-006`, `AS-002`→`MT-008`), `src/mocks/audit/audit-events.ts` (`AUD-006`, `AS-001`→`MT-005`) — remappés vers les nouveaux ids `Meeting`, labels mis à jour en cohérence. `src/features/operations/operations-module.tsx` (`EntityPicker`, sélection de document pour l'entité `assembly`) repointé sur `organizationService.listMeetings`/`queryKeys.governance.meetings` (`.title` au lieu de `.name`).
- **Aucune donnée métier n'a été supprimée** : chaque champ `Assembly` a soit une destination directe (§5), soit est explicitement documenté comme absent de source (`minutes`, décisions/votes structurés).

## 10. Tests (résultats exacts)

- Suite complète : **271 tests passés / 271** (28 fichiers), contre 261/261 avant cette mission (+10 nouveaux tests).
- Nouveaux fichiers de test :
  - `src/config/navigation.test.ts` (4 tests) : absence de "General Assemblies"/"Assemblies" dans le menu Governance, présence de "Meetings", aucun nœud de navigation ne pointe vers les anciens chemins.
  - `src/features/organization/organization-module.test.tsx` (6 tests) : liste Meetings unifiée affiche REGULAR et GENERAL_ASSEMBLY ; `governance/assemblies` et `governance/general-assemblies` redirigent vers Meetings ; `governance/general-assemblies/:id` redirige vers le même id Meeting (pas de perte de lien profond) ; page détail GENERAL_ASSEMBLY expose Quorum/Décisions ; page détail REGULAR ne les expose pas.
- `src/services/organization.service.test.ts` : tests `listAssemblies`/`createAssembly` retirés (entité supprimée) ; tests `createMeeting` mis à jour (défaut REGULAR, création GENERAL_ASSEMBLY avec description, refus de doublon titre+date pour GENERAL_ASSEMBLY).
- Régression Attendance/Quorum/AssemblyDecision/Vote/VoteOption/MemberVote : aucun de ces fichiers de test n'a été modifié — tous passent toujours à l'identique, confirmant qu'aucune fonctionnalité Phase 4C-3/4C-4 n'a régressé.

## 11. Typecheck / Lint / Build (résultats exacts)

- `npm run typecheck` : **0 erreur**.
- `npm run lint` : **0 erreur, 14 warnings** (avertissements `react-refresh/only-export-components` préexistants, sans rapport avec cette mission, non générés par les fichiers modifiés).
- `npm run i18n:check` : **2/2 tests passés** (parité de clés fr/en maintenue).
- `npm run build` : **succès** (avertissement préexistant sur la taille d'un chunk, sans rapport avec cette mission).

## 12. Fichiers modifiés (exhaustif)

**Modifiés :**
- `src/config/navigation.ts` (menu Governance)
- `src/mocks/organization/governance.ts` (suppression `Assembly`, migration `AS-00x`, liens `Vote.meetingId`)
- `src/services/organization.service.ts` (`createMeeting` unifié, suppression `AssemblyInput`/`listAssemblies`/`createAssembly`)
- `src/services/organization.service.test.ts`
- `src/services/query-keys.ts` (suppression `governance.assemblies`/`generalAssemblies`/`generalAssembly`)
- `src/features/organization/organization-module.tsx` (refonte Governance : overview, liste Meetings, `MeetingDetail`, suppression UI Assembly/GeneralAssembly, routes/redirections)
- `src/features/operations/operations-module.tsx` (`EntityPicker` repointé sur `listMeetings`)
- `src/mocks/operations/documents.ts`, `src/mocks/operations/workflow-requests.ts`, `src/mocks/audit/audit-events.ts` (remap ids)
- `src/locales/fr/index.ts`, `src/locales/en/index.ts` (clés Assembly/GeneralAssembly orphelines retirées, nouvelles clés `meetingType*`/`meetingDetail`/`meetingInfo`/`meetingRejected` ajoutées)

**Créés :**
- `src/config/navigation.test.ts`
- `src/features/organization/organization-module.test.tsx`
- `docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md` (ce document)

**Non modifiés (décision explicite)** : `src/services/general-assembly.service.ts` et son test — conservés tels quels comme aide interne (fixture de test pour `assembly-decision.service.test.ts`/`decision-vote.service.test.ts`/`quorum.service.test.ts`), n'ayant plus aucune route ni composant UI qui l'expose comme entité autonome. `tanzen-mobile` et `tanzen-commercial` : non touchés.

## 13. Données potentiellement non migrées (GAP)

- **GAP-01** : `AS-003` (« Conseil Q3 », 2026-08-25) et `MT-001` (« Réunion bureau - Août », même date/tenant/effectif) pourraient décrire le même événement réel, mais leurs champs `location`/`agenda` diffèrent réellement — aucune fusion n'a été effectuée par prudence (éviter de perdre le contenu réel de l'un des deux). `AS-003` a été migrée en tant que `Meeting` distinct (`MT-009`). Nécessite un arbitrage PO si une fusion est finalement souhaitée.
- **GAP-02** : aucun `AssemblyDecision`/`Vote` structuré n'a pu être reconstruit à partir du texte libre `Assembly.agenda` — les 4 anciens enregistrements `Assembly` n'avaient jamais de décisions/votes structurés dans le modèle source, donc rien n'a été perdu, mais rien n'a pu être enrichi non plus.
- **GAP-03** (hérité, non résolu par cette mission) : `Meeting.minutes`/`location`/`participants`/`agenda` de `MT-005`/`MT-006`/`MT-007` (ex-`GeneralAssembly`, hors la fusion `AS-001`→`MT-005`) restent vides — `GeneralAssembly` n'a jamais eu ces champs en source, aucune fabrication n'a été faite.

## 14. Git

- `git status --short` avant et après cette mission : mêmes fichiers pré-existants modifiés/untracked (aucune dérive), plus les fichiers listés au §12.
- **Aucun commit effectué.**
- **Aucun push effectué.**
- `tanzen-mobile`, `tanzen-commercial` : non touchés (hors du dossier de travail de cette mission).
