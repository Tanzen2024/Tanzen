# PHASE 4C-4 — General Assembly → Meeting(type) — Impact Audit (READ-ONLY)

**Statut : AUDIT D'IMPACT READ-ONLY.** Aucun fichier de `tanzen-frontend`, `tanzen-mobile` ou `tanzen-commercial` n'a été modifié, créé ou supprimé. Aucune migration, table, colonne, relation, permission n'a été créée. Ce rapport est le seul fichier créé par cette mission. Aucun commit, aucun push.

---

## 1. Executive Summary

L'architecture cible `GeneralAssembly → Meeting(type=GENERAL_ASSEMBLY)` est cohérente avec `Meeting`/`Attendance` tels qu'implémentés en Phase 4C-3 (Decision Gate CLOSED, IMPLEMENTATION GO exécuté) : `Meeting.status` est **déjà** exactement `PLANNED/ONGOING/COMPLETED/CANCELLED` et `Attendance` est **déjà** structuré autour de `meetingId` (pas `assemblyId`) — ces deux points sont directement réutilisables sans changement. En revanche, quatre écarts significatifs bloquent une implémentation immédiate :

1. **`Meeting.type` n'existe pas du tout** dans le code actuel — ni `REGULAR` ni `GENERAL_ASSEMBLY` (MODEL_GAP).
2. **`GeneralAssembly` est une entité autonome pleinement construite** (Phase 1 de la mission P1 GOVERNANCE GENERAL ASSEMBLY) — type, mock, service, 3 routes, UI, tests — qui contredit directement la nouvelle architecture validée. Aucune stratégie de migration/dépréciation n'existe.
3. **`QuorumSnapshot` et `AssemblyDecision` n'existent nulle part** — ni en code, ni au dictionnaire canonique (59 fiches inspectées, aucune ne les couvre). Ce sont des entités entièrement nouvelles, sans fiche de référence.
4. **La FK cible `Vote.meeting_id`** contredit à la fois le dictionnaire (rank 6 : `votes.assembly_id → assemblies.id`) et le document canonique verrouillé (rank 2 : `PHASE_02_MODELE_CANONIQUE_FINAL.md`, `FK_assembly_id → general_assemblies(id)`) — un SOURCE_CONFLICT non trivial, à documenter avant toute implémentation.

`tanzen-mobile` n'a aucun code Meeting/Attendance/Governance (confirmé, cohérent avec l'audit Phase 4C-3) — aucun impact de migration à gérer côté Mobile, mais son infrastructure offline générique (outbox/sync entity-agnostic) est directement réutilisable le jour venu. `tanzen-commercial` n'a aucune dépendance fonctionnelle sur ce domaine (confirmé).

## 2. Décision d'architecture validée

Telle que communiquée par le mandat (traitée comme une décision PO — rang 1 de la hiérarchie des sources déjà établie par `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` §3) :

- `GeneralAssembly` cesse d'être une entité autonome ; une Assemblée Générale est identifiée par `Meeting.type = GENERAL_ASSEMBLY`.
- `Meeting.type ∈ {REGULAR, GENERAL_ASSEMBLY}` — exactement deux valeurs, aucune autre (`COMMITTEE` explicitement exclu).
- `Meeting.status ∈ {PLANNED, ONGOING, COMPLETED, CANCELLED}` — déjà le vocabulaire en place depuis Phase 4C-3.
- `Attendance` reste commun aux deux types de `Meeting`.
- `Meeting(type=GENERAL_ASSEMBLY)` gagne des enfants additionnels : `QuorumSnapshot`, `AssemblyDecision`, `Vote` (lui-même parent de `VoteOption`/`MemberVote`), tous rattachés à `Meeting.id` (pas à un `assembly_id`).

**Note de traçabilité** : comme pour « Phase 4C-3 » avant elle, aucune source du corpus documentaire (`docs/`) ne mentionne « Phase 4C-4 » ou « D-4C4 » avant ce mandat — recherche exhaustive, zéro occurrence. C'est un identifiant introduit par ce mandat, sans antécédent projet, traité ici comme une décision produit explicite et non comme une convention préexistante. De même, aucune source du corpus ne mentionne jamais `Meeting.type = COMMITTEE` — les seules occurrences de « Committee » trouvées concernent un sujet entièrement différent et déjà connu (`PHASE_06_DECISIONS_A_VALIDER.md` §4, l'entité `Committee`/« comités », classée BLOQUANT, sans rapport avec un type de réunion). Il n'y a donc pas de « décision précédente incluant COMMITTEE » retrouvable dans les sources inspectées — signalé pour éviter toute confusion, sans remettre en cause l'exclusion demandée.

## 3. Périmètre exact — REGULAR / GENERAL_ASSEMBLY

**`Meeting.type` n'existe pas dans le code actuel.** `src/mocks/organization/governance.ts` (relu intégralement) définit `Meeting = { id, tenantId, title, date, location, participants, agenda, minutes, status }` — huit champs, aucun `type`. Les 4 enregistrements mock (`MT-001` à `MT-004`) représentent aujourd'hui, de facto, des réunions « ordinaires » (créées via `GovernanceTablePage kind="meetings"`) mais sans discriminateur explicite. **MODEL_GAP.**

## 4. Statuts — PLANNED / ONGOING / COMPLETED / CANCELLED

**Déjà conforme, sans écart.** `MeetingStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'` (`src/mocks/organization/governance.ts`), verrouillé par le mandat IMPLEMENTATION GO Phase 4C-3 (D-4C3-TECH-01) et implémenté dans `src/services/organization.service.ts` (`startMeeting`/`completeMeeting`/`cancelMeeting`, transitions protégées, testées dans `organization.service.test.ts`). Aucune autre valeur (`DONE`, `POSTPONED`, `ACTIVE`, `CLOSED`) n'existe dans le code. **GO — rien à changer.**

## 5. Modèle Meeting

Champ par champ, code actuel vs architecture cible :

| Champ | Code actuel | Cible Phase 4C-4 | Statut |
|---|---|---|---|
| `id`, `tenantId`, `title`, `date`, `location`, `participants`, `agenda`, `minutes` | Présents | Inchangés | GO |
| `status` | `PLANNED\|ONGOING\|COMPLETED\|CANCELLED` | Identique | GO |
| `type` | **Absent** | `REGULAR\|GENERAL_ASSEMBLY` | MODEL_GAP |

Services : `listMeetings`, `getMeeting`, `createMeeting` (force `status=PLANNED`), `updateMeetingMinutes`, `startMeeting`, `completeMeeting`, `cancelMeeting` — tous déjà tenant-scoped via `getTenantScoped`, tous fonctionnellement indépendants de `type` (aucun ne suppose un type particulier). Routes : `governance/meetings` (gardée `governance.read`), `governance/meetings/:meetingId/attendances`. RBAC : `governance.read/create/update/approve`. Tests : isolation tenant + cycle de vie complet, 39 tests.

**Conséquence pour Phase 4C-4** : ajouter `type` ne nécessite aucune réécriture du service Meeting existant — c'est une extension additive du type TypeScript + des 4 enregistrements mock (`type: 'REGULAR'` par défaut, migration triviale des données existantes). Le risque n'est pas dans `Meeting` lui-même mais dans ce qui doit désormais s'y rattacher pour `GENERAL_ASSEMBLY` (§7-§13).

## 6. Impact GeneralAssembly

**`GeneralAssembly` est une entité autonome pleinement construite**, en contradiction directe avec l'architecture désormais validée (§2 : « GeneralAssembly n'est PLUS une entité autonome »). Inventaire exhaustif (grep confirmé sur tout `src/`) :

| Fichier | Contenu |
|---|---|
| `src/mocks/organization/general-assemblies.ts` | `GeneralAssemblyStatus`, `GeneralAssembly = {id, tenantId, title, assemblyDate, description, status}`, 3 enregistrements mock (`GA-001..003`) |
| `src/services/general-assembly.service.ts` | `listGeneralAssemblies`, `getGeneralAssembly`, `createGeneralAssembly` (Create+Read seulement, périmètre déjà volontairement limité) |
| `src/services/general-assembly.service.test.ts` | 12 tests (création, unicité `(tenant_id, title, assembly_date)`, isolation tenant) |
| `src/features/organization/organization-module.tsx` | `GeneralAssemblyList`, `GeneralAssemblyCreate`, `GeneralAssemblyDetail`, fonctions `generalAssemblyStatusTone`/`generalAssemblyStatusKey`, import de `generalAssemblyService` dans `GovernanceOverview` |
| Routes | `governance/general-assemblies`, `governance/general-assemblies/create`, `governance/general-assemblies/:id` (les 3 gardées `PermissionRoute`) |
| `src/services/query-keys.ts` | `governance.generalAssemblies`, `governance.generalAssembly` |
| `src/locales/{en,fr}/index.ts` | 8 clés (`generalAssemblies*`, `createGeneralAssembly`, `assemblyDate`, `statusOngoingGA/statusCompletedGA/statusCancelledGA`, etc.) |
| `src/config/navigation.ts` | Entrée « General Assemblies » sous Governance |

Cette entité a été construite avec un commentaire explicite dans le code (`organization-module.tsx:365-367`) affirmant : *« décision produit validée : GeneralAssembly n'est jamais un Meeting(type=...) »* — **cette affirmation, vraie au moment où elle a été écrite, est désormais contredite par la décision d'architecture communiquée à cette mission**. C'est le cœur de l'impact de migration : aucune stratégie n'existe aujourd'hui pour (a) convertir les 3 `GeneralAssembly` mock existantes en `Meeting(type=GENERAL_ASSEMBLY)`, (b) déprécier `general-assembly.service.ts`/les 3 routes/les clés i18n, (c) traiter `AssemblyType` (`'generalAssembly'|'extraordinaryAssembly'|'boardAssembly'`, l'ancien type générique `Assembly` de `governance.ts`, distinct de `GeneralAssembly`) qui reste un **troisième** concept d'assemblée, jamais concerné par cette mission mais qui coexistera avec les deux autres tant qu'il n'est pas lui-même statué. **DECISION_REQUIRED** (stratégie de migration, pas seulement une décision de modèle).

## 7. Impact Attendance

**Aucun impact — déjà compatible.** `src/mocks/organization/attendances.ts` : `Attendance = {id, meetingId, memberId, status, operationId}` — la clé est `meetingId`, jamais `assemblyId`. Un `Attendance` créé sur un `Meeting(type=GENERAL_ASSEMBLY)` fonctionnerait avec le service actuel (`src/services/attendance.service.ts`) sans aucune modification : `createAttendance`/`updateAttendance`/`deleteAttendance` ne lisent ni n'écrivent `Meeting.type`, seulement `Meeting.status` (pour l'immutabilité, §D-4C3-WEB-03) et `Meeting.tenantId` (isolation). Testé (15 tests, `attendance.service.test.ts`). Isolation tenant indirecte déjà en place (`meetingId → Meeting.tenantId`, `memberId` vérifié séparément). Cycle de vie (immuable dès que le Meeting n'est plus `PLANNED`/`ONGOING`) et idempotence (`operationId` + `UNIQUE(meeting_id, member_id)`) : cohérents, aucune divergence identifiée avec Phase 4C-3. **Écrans existants** (`MeetingAttendancePage`) : fonctionnent déjà indépendamment du type de Meeting, aucun changement requis pour le périmètre REGULAR. **GO.**

## 8. Détermination des membres éligibles (D-4C4-03)

**MODEL_GAP critique.** `src/mocks/organization/members.ts` — `Member = {id, tenantId, firstName, lastName, gender, birthDate, nationality, idNumber, occupation, email, phone, address, joinedAt, status: 'active'|'inactive'|'suspended'|'pending', tenantName, positions[], accounts[], documents[], activities[], governanceParticipation[]}`.

Vérification des règles D-4C4-03 (§6 du mandat) contre ce modèle :

| Règle | Donnée physique requise | Existe ? |
|---|---|---|
| 1. Même `tenant_id` que l'Assemblée | `Member.tenantId` | ✅ Présent |
| 2. Membre actif **à la date de l'Assemblée** (état historique, pas courant) | Historisation des transitions de `status` (dates de changement) | ❌ **Absente** — `Member.status` est un champ mutable unique, sans historique ; `updateMember` fait un `Object.assign(member, patch)` qui écrase l'état précédent sans laisser de trace (`organization.service.ts`) |
| 3. Membre autorisé à participer aux AG | Un champ d'éligibilité AG distinct du statut général | ❌ **Absent** — aucun champ de ce type sur `Member` |
| 4. Membre devenu actif après l'Assemblée = non éligible | Date de début d'activité (`activeSince`) | ❌ **Absente** — `joinedAt` existe (date d'adhésion) mais ne capture pas les réactivations après suspension/inactivité |
| 5. Membre devenu inactif avant l'Assemblée = non éligible | Date de fin d'activité (`inactiveSince`/`leftAt`) | ❌ **Absente** — aucun champ de ce type |
| 6. Résultat du quorum figé à la clôture | Mécanisme de snapshot | ❌ **Absent** — pas de `QuorumSnapshot` (§10) |
| 7. Aucune modification ultérieure du membre ne modifie l'historique | Snapshot immuable | ❌ **Absent** — même dépendance que la règle 6 |

**Conclusion factuelle, sans invention** : seule la règle 1 est applicable avec les données actuelles. Les règles 2, 4, 5 nécessitent une capacité de reconstruction d'état historique que le modèle `Member` ne fournit pas — `Member.status` est un instantané du présent, pas un journal. La règle 3 nécessite un champ qui n'existe pas. Les règles 6-7 dépendent de `QuorumSnapshot`, absent. **DECISION_REQUIRED** avant toute implémentation : soit (a) étendre `Member` avec une historisation explicite (nouveaux champs/table d'audit), soit (b) accepter une éligibilité calculée uniquement sur l'état courant au moment de la clôture (dégradation assumée de la règle D-4C4-03, à valider explicitement par le PO — ce document ne tranche pas ce choix).

## 9. Quorum

**MODEL_GAP.** Le modèle métier (`Membres éligibles → Membres présents → Seuil → Atteint ? → Clôture → Résultat figé`) n'a aucune trace dans le code : pas de champ `quorum_threshold` sur `Meeting` ni `GeneralAssembly`, pas de logique de calcul de seuil. Le compte des « membres présents » pourrait techniquement être dérivé de `Attendance` (`status = 'PRESENT'` par `meetingId`, déjà interrogeable via `attendanceService.listAttendancesByMeeting`) — c'est la seule brique déjà disponible. Le reste (seuil, éligibilité, figeage) est entièrement à construire. **DECISION_REQUIRED** (dépend directement de §8).

## 10. QuorumSnapshot

**MODEL_GAP — n'existe ni en code ni au dictionnaire.** Recherche exhaustive : zéro occurrence de « QuorumSnapshot » ou « quorum » (hors une mention dans `docs/P1_GOVERNANCE_GENERAL_ASSEMBLY_IMPLEMENTATION_REPORT.md`, qui le liste déjà comme explicitement hors périmètre de la mission précédente — cohérent, pas une contradiction). Les 59 fiches du dictionnaire canonique (`docs/audit/excel_dictionary_dump.txt`, table des matières relue intégralement, `#01` à `#59`) ne contiennent **aucune** fiche `quorum_snapshots` ou équivalente. Contrairement à `AssemblyDecision` (§11), qui a au moins une architecture cible détaillée fournie par ce mandat, `QuorumSnapshot` n'a **aucune** définition de champs canonique nulle part dans le corpus — le mandat ne fournit lui-même que la liste conceptuelle (`eligible_member_count`, `present_member_count`, `quorum_threshold`, `quorum_reached`, `meeting_id`), pas un schéma complet (types, contraintes). **MODEL_GAP au niveau spécification, pas seulement implémentation** — comparable au traitement déjà réservé à `TontinePosition`/`PositionPayment` dans `PHASE_02_MODELE_CANONIQUE_FINAL.md` §1.2 (« verrouillées comme entités indépendantes mais SANS fiche dans le dictionnaire, à spécifier avant implémentation »).

## 11. AssemblyDecision

**MODEL_GAP — n'existe ni en code ni au dictionnaire.** Recherche exhaustive (`grep -i "AssemblyDecision"` sur tout `src/`) : zéro occurrence en code. Les 59 fiches du dictionnaire ne contiennent aucune fiche `assembly_decisions`. La structure cible fournie par le mandat (`id, uuid, tenant_id, meeting_id, title, description, decision_number, status, decided_at, created_by, created_at, updated_at, deleted_at`) n'est donc **vérifiable contre aucune source canonique** — elle est présentée par le mandat comme une architecture à auditer, mais aucune source du projet ne la confirme ni ne l'infirme champ par champ. Seul point de rapprochement trouvé dans les Use Cases classifiés : `UCX5-01 — « Exécuter les décisions »` (`PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 574), acteur Admin Tenant, `«extend»` depuis « Planifier une réunion », ressource notée `GeneralAssembly (décision)` — un Use Case confirmé existe donc pour la **notion** de décision d'assemblée, mais sans détail de structure (aucun UC de ce corpus ne porte de schéma de champs, cf. audit Phase 4C-3 §15). **MODEL_GAP au niveau spécification.**

## 12. Vote

Deux couches à distinguer clairement — **le modèle actuel et la cible sont en conflit avec les sources canoniques, pas seulement absents** :

**Code actuel** (`src/mocks/organization/governance.ts`) : `Vote = {id, tenantId, subject, date, yes, no, abstain, result: 'adopted'|'rejected'|'pending'}` — enregistrement **autonome**, avec son propre `tenantId` direct, sans `assemblyId` ni `meetingId`. Ceci était déjà un sujet explicitement « À VALIDER » et jamais tranché : `PHASE_06_DECISIONS_A_VALIDER.md` §1 (« `Vote.assemblyId` — rattachement d'un vote à une assemblée précise... Question à trancher... »).

**Dictionnaire canonique** (rang 6, fiche #40, `docs/audit/excel_dictionary_dump.txt:1062`) : `assembly_id BIGINT FK → assemblies.id` — référence une table `assemblies`, ni `general_assemblies` (fiche #39) ni `meetings` (fiche #18). `votes.status` y est `'OPEN'|'CLOSED'|'APPROVED'|'REJECTED'` — vocabulaire entièrement différent du `result` actuel du code (`adopted/rejected/pending`).

**Document canonique verrouillé** (rang 2, `PHASE_02_MODELE_CANONIQUE_FINAL.md:102`) : `VOTES: FK_assembly_id → general_assemblies(id)` — cette fois la cible est `general_assemblies`, pas `assemblies`. Isolation tenant confirmée **indirecte** (`:229` : « Aucun `tenant_id` direct ; remonte via `assembly_id→General_assemblies.tenant_id` »).

**Architecture cible de ce mandat** : `Vote.meeting_id → Meeting.id`, explicitement « et NON `Vote.assembly_id` ».

**SOURCE_CONFLICT à trois voies**, non résolu par aucun document existant :

| Source | Rang | FK de `Vote` | Cible de la FK |
|---|---|---|---|
| Dictionnaire (`docs/audit/excel_dictionary_dump.txt`) | 6 | `assembly_id` | `assemblies.id` |
| `PHASE_02_MODELE_CANONIQUE_FINAL.md` | 2 | `assembly_id` | `general_assemblies.id` |
| Code actuel (`governance.ts`) | 5 | *(aucune)* | *(autonome, `tenantId` direct)* |
| Mandat Phase 4C-4 (traité rang 1) | 1 | `meeting_id` | `Meeting.id` |

Conformément à la hiérarchie des sources déjà établie (rang 1 > rang 2 > ... > rang 6), la décision de ce mandat prévaudrait **si** elle constitue effectivement une décision PO explicitement validée au même titre que celles de Phase 4C-3 — mais **aucun document canonique (rang 2, `PHASE_02_MODELE_CANONIQUE_FINAL.md`) n'a été mis à jour pour refléter ce changement**, alors que ce document se déclare lui-même comme la référence unique en cas de divergence future. **DECISION_REQUIRED** : soit acter formellement `Vote.meeting_id` et planifier la mise à jour de `PHASE_02_MODELE_CANONIQUE_FINAL.md` en conséquence, soit clarifier que la mise à jour canonique est un prérequis avant implémentation. Ce rapport ne tranche pas ce point — il le signale.

## 13. VoteOption

**MODEL_GAP en code, mais contredit une affirmation documentaire existante.** Recherche exhaustive : zéro occurrence de « VoteOption » dans tout `src/` (seule mention : un commentaire de `general-assemblies.ts:13` listant `VoteOption` comme explicitement hors périmètre de la mission précédente). Fiche dictionnaire #41 `vote_options` : `{id, vote_id FK, label}`, contrainte `UNIQUE(vote_id, label)`.

**SOURCE_CONFLICT documentaire** : `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 110 affirme *« 41 | vote_options | TENANT | Gouvernance | `VoteOption` | Implémenté | Frontend | UCX5-* | IMPLEMENTED »* — cette affirmation est **factuellement contredite** par une inspection directe du code, qui ne montre strictement aucune trace de `VoteOption`. Signalé comme contradiction documentaire, pas corrigé (mandat READ-ONLY).

## 14. MemberVote

Même constat que VoteOption. Recherche exhaustive : zéro occurrence de « MemberVote » dans `src/`. Fiche dictionnaire #42 `member_votes` : `{id, vote_id FK, member_id FK, option_id FK NOT NULL, voted_at}`, `UNIQUE(vote_id, member_id)`, `UNIQUE(vote_id, member_id, option_id)`.

**SOURCE_CONFLICT documentaire** (même nature qu'au §13) : `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 111 affirme *« 42 | member_votes | ... | PARTIALLY_IMPLEMENTED »* — également contredit par l'absence totale de code. Isolation tenant (rang 2, `PHASE_02_MODELE_CANONIQUE_FINAL.md:230-231,316-317`) confirmée indirecte à deux sauts (`vote_id→Votes→General_assemblies.tenant_id`), elle-même dépendante du SOURCE_CONFLICT du §12 non résolu.

## 15. Relation Decision ↔ Vote

**Aucune relation physique n'existe — les deux entités elles-mêmes sont absentes (§10-§11).** La structure cible d'`AssemblyDecision` fournie par ce mandat (§11) ne porte aucun champ `vote_id`/`voteId`. Aucune source ne définit de FK dans un sens ou dans l'autre. Conformément à la règle métier rappelée par le mandat (« Decision peut exister sans Vote » / « Vote peut éventuellement contribuer à une Decision »), il ne s'agit pas d'une simple absence à combler automatiquement par une FK obligatoire — le mandat lui-même écarte cette lecture. **MODEL_GAP** (les deux entités n'existent pas) **combiné à un DECISION_REQUIRED** sur le mécanisme exact de rattachement optionnel (FK nullable sur `AssemblyDecision` ? table de jonction ? autre ?) — aucune source ne permet de trancher, et ce rapport n'invente pas de réponse.

## 16. RBAC

Catalogue actuel (`src/mocks/rbac.mocks.ts:55`) : `governance.read`, `governance.create`, `governance.approve`, `governance.update`, `governance.delete` — inchangé depuis Phase 4C-3. Couverture actuelle :

- **`Meeting`** : `governance.read` (liste, désormais gardée par `PermissionRoute`), `governance.create` (création), `governance.update` (`startMeeting`), `governance.approve` (`completeMeeting`, `cancelMeeting`, publier PV).
- **`GeneralAssembly`** : `governance.read` (liste+détail, routes gardées), `governance.create` (création).
- **`Attendance`** : `governance.read` (route), `governance.create`/`governance.update`/`governance.delete` (saisie/modif/suppression, cf. Phase 4C-3 §9).
- **`QuorumSnapshot`/`AssemblyDecision`/`Vote`/`VoteOption`/`MemberVote`** : aucune permission dédiée n'existe, et aucune source (ni la Phase 4C-3, ni ce mandat) n'en réclame. Le pattern déjà établi (un seul groupe `governance.*` pour toutes les sous-entités de Governance, y compris entre Meeting/Attendance/GeneralAssembly aujourd'hui) suggère par cohérence interne que le même catalogue suffirait pour les nouvelles entités — mais ceci est une observation de cohérence, pas une décision : **aucune permission n'est créée ni recommandée comme nécessaire par cette mission**. Sur la base des preuves actuelles, le catalogue existant paraît suffisant (**GO**), sous réserve d'une confirmation explicite du PO au moment de l'implémentation réelle.

## 17. Tenant isolation

| Entité | Mécanisme actuel/cible | Preuve | Statut |
|---|---|---|---|
| `Meeting` | `tenantId` direct, `getTenantScoped` sur toutes les méthodes | `organization.service.ts` | Structurel, testé — GO |
| `Attendance` | Indirect via `meetingId → Meeting.tenantId` (pas de `tenantId` propre, conforme au dictionnaire) ; `memberId` vérifié séparément | `attendance.service.ts` | Structurel, testé — GO |
| `GeneralAssembly` (actuel) | `tenantId` direct | `general-assembly.service.ts` | Structurel, testé — deviendra obsolète si migré vers Meeting |
| `Vote` (actuel, code) | `tenantId` direct | `governance.ts` | Diverge du modèle canonique (indirect, §12) — écart déjà toléré, pas nouveau |
| `QuorumSnapshot` (cible) | Indirect via `meeting_id → Meeting.tenant_id` (mécanisme demandé implicitement par le mandat §5) | Aucune, entité inexistante | MODEL_GAP — mécanisme non encore implémentable |
| `AssemblyDecision` (cible) | La structure cible du mandat porte **à la fois** `tenant_id` direct **et** `meeting_id` — contrairement à `Attendance`/`Vote` (indirect seul) | Structure du mandat §7 | À noter : redondance à valider — si `tenant_id` est renseigné indépendamment de `meeting_id`, une incohérence entre les deux devient possible et devrait être empêchée applicativement (comme `createMeeting` force `tenantId` en ignorant l'entrée, cf. Phase 4C-3) |
| `Vote`/`VoteOption`/`MemberVote` (cible) | Indirect, ultimately via `meeting_id → Meeting.tenant_id` (2-3 sauts) | Aucune, entités inexistantes | MODEL_GAP |

Aucun risque d'accès cross-tenant démontré sur ce qui existe déjà (`Meeting`, `Attendance`, `GeneralAssembly` — tous testés explicitement). Pour ce qui n'existe pas encore, l'isolation n'est **ni structurelle ni applicative ni même théorique** — elle est simplement non applicable, faute d'entité.

## 18. Offline / SQLite / Outbox

**`tanzen-mobile` ne porte aucun code Meeting/Attendance/Governance** — confirmé par recherche exhaustive (`Meeting`, `Attendance`, `GeneralAssembly`, `Vote`, `VoteOption`, `MemberVote`, `QuorumSnapshot`, `AssemblyDecision`, `Governance` : zéro occurrence de code dans `src/`, `app/`, `tests/`, hors une chaîne d'affichage statique `app/(tenant)/index.tsx:41` — *« Autres modules métier (Finance, Tontines, Governance...) : phases suivantes »*). Deux audits Mobile préexistants (`docs/MOBILE_GOVERNANCE_NAVIGATION_AUDIT.md`, `docs/PHASE_4C3_WEB_TO_MOBILE_TRANSFER_AUDIT.md`) documentent déjà ce même constat.

**Correction à noter pour ces deux documents Mobile préexistants** (non modifiés par cette mission, signalé pour information) : ils font référence à un `Meeting` Web *« sans `status` ni `sync_status`/`version` »* — cette description est **désormais obsolète** : `Meeting.status` existe depuis l'IMPLEMENTATION GO Phase 4C-3 (`docs/P1_GOVERNANCE_PHASE_4C3_IMPLEMENTATION_REPORT.md`). `sync_status`/`version` restent en revanche toujours absents de `Meeting` côté Web (décision explicite D-4C3-WEB-01, non remise en cause ici).

**Infrastructure offline générique Mobile** (pour ce qui existe déjà : `Member`, `Organization`) :
- SQLite via `expo-sqlite`, migrations numérotées additive-only (`src/database/migrations/all.ts`, 4 migrations livrées).
- Pattern repository formalisé : `TenantScopedRepository<T extends TenantScoped>` (`src/repositories/tenant-scoped-repository.ts`), `findById/findAll/create/update/delete`, tous `tenantId`-scopés par contrat.
- Outbox générique, agnostique de l'entité : `sync_outbox(id, operation_id UNIQUE, tenant_id, entity, entity_id, operation, payload, ...)` — la colonne `entity` est une chaîne libre, aucune table métier n'y est câblée en dur.
- `sync_status`/`version` déjà en place sur `members`/`organization` (`PENDING`/`SYNCED`, incrémenté à chaque écriture locale).
- Isolation tenant : `tenant_id NOT NULL` sur chaque table + `assertTenantMatch()` (`src/sync/tenant-guard.ts`) rejetant tout payload dont le `tenantId` diverge.

**Évaluation** : cette infrastructure est explicitement conçue pour être réutilisée par de futures entités métier sans modification (« aucune table métier n'est référencée » dans l'outbox) — un futur `Meeting`/`Attendance`/`QuorumSnapshot`/`AssemblyDecision`/`Vote` Mobile suivrait le même schéma que `Member` (migration + repository + entrée dans `sync-engine`). **GO pour l'abstraction offline elle-même** ; **MODEL_GAP pour les tables/repositories concrets**, qui n'existent pas.

## 19. tanzen-frontend

**Ce qui fonctionne déjà** : `Meeting` (liste/création/cycle de vie complet/PV), `Attendance` (CRUD/immutabilité/idempotence/isolation tenant) — hérités intacts de Phase 4C-3, aucun des deux ne nécessite de changement pour continuer à fonctionner en tant que `Meeting(type=REGULAR)` implicite.

**Ce qui doit évoluer** : ajout de `Meeting.type` (extension additive, faible risque) ; UI liste Meetings (filtrage/affichage par type une fois le champ ajouté).

**Ce qui devient obsolète** : `GeneralAssembly` en tant qu'entité autonome — type, mock, service (`general-assembly.service.ts`), 3 routes, 3 composants UI, 8 clés i18n, 12 tests, entrée navigation — dans son intégralité si la migration est menée à son terme (§6).

**Ce qui doit être créé ultérieurement** : `QuorumSnapshot`, `AssemblyDecision`, `Vote.meeting_id` (remplaçant l'actuel `Vote` autonome), `VoteOption`, `MemberVote` — aucun n'existe, deux (`QuorumSnapshot`, `AssemblyDecision`) sans fiche dictionnaire, un (`Vote`) avec FK contradictoire entre sources (§12).

**Ce qui est bloqué** : le calcul de quorum/éligibilité (§8-§9) tant que `Member` ne porte pas d'historisation, ou tant qu'une dégradation de règle n'est pas explicitement validée.

## 20. tanzen-mobile

Aucun impact de migration au sens strict — rien n'y a jamais été construit pour `Meeting`/`GeneralAssembly`/`Attendance`/`Governance` (confirmé §18). Le passage `GeneralAssembly → Meeting(type=GENERAL_ASSEMBLY)` change uniquement le modèle cible qu'une future mission Mobile devra porter — pas un modèle Mobile existant à corriger. Aucune action requise avant que `tanzen-frontend` ne stabilise son propre modèle (§19), conformément à la méthodologie déjà appliquée en Phase 4C-3 (Web d'abord, Mobile ensuite).

## 21. tanzen-commercial

**OUT_OF_SCOPE / NO IMPACT — confirmé.** Recherche exhaustive sur `src/services`, `src/layouts`, `src/routes`, `src/mocks/organization` (et le reste de l'arborescence accessible) : aucune trace fonctionnelle de `Meeting`/`GeneralAssembly`/`Attendance`/`Vote`/`VoteOption`/`MemberVote`/`QuorumSnapshot`/`AssemblyDecision`. Seuls artefacts trouvés : 3 clés `query-keys.ts` inutilisées (`governance.assemblies/meetings/votes`), 3 chaînes de permission `governance.read/create/approve` dans le catalogue RBAC générique (jamais vérifiées par aucune route/composant), et des libellés d'UI génériques (« Meetings », « Governance », « Assembly ») utilisés comme texte d'affichage pour une carte de module payant et des filtres d'audit — aucun ne pointe vers un modèle de données réel. Le code de `tanzen-commercial` affirme lui-même explicitement, à plusieurs endroits, que Governance/Members/Meetings restent hors périmètre et appartiennent exclusivement à `tanzen-frontend`. **Aucun changement requis.**

## 22. Contradictions documentaires

| # | Sujet | Source A | Source B | Impact | Décision nécessaire |
|---|---|---|---|---|---|
| 1 | FK de `Vote` | Dictionnaire (rang 6) : `assembly_id → assemblies.id` | `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) : `assembly_id → general_assemblies.id` | Pré-existant, non lié à cette mission | Oui, indépendamment de Phase 4C-4 |
| 2 | FK de `Vote` (cible Phase 4C-4) | Sources ci-dessus (rangs 2 et 6) | Mandat Phase 4C-4 (traité rang 1) : `meeting_id → Meeting.id` | Bloque toute implémentation de `Vote.meeting_id` sans mise à jour du rang 2 | **Oui — voir §12** |
| 3 | Statut d'implémentation `vote_options` | `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md:110` : IMPLEMENTED | Code réel (`src/`) : absent, zéro occurrence | Le document d'audit est factuellement inexact sur ce point | Non bloquant pour Phase 4C-4, mais à corriger dans le document source |
| 4 | Statut d'implémentation `member_votes` | `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md:111` : PARTIALLY_IMPLEMENTED | Code réel : absent | Même nature que #3 | Idem |
| 5 | `GeneralAssembly` = Meeting ou entité distincte | Commentaire code (`organization-module.tsx:365-367`) : « GeneralAssembly n'est jamais un Meeting » | Mandat Phase 4C-4 : GeneralAssembly devient `Meeting(type=GENERAL_ASSEMBLY)` | Le commentaire code reflète une décision désormais périmée | **Oui — voir §6** |
| 6 | `Meeting`/`sync_status` côté Web | `docs/MOBILE_GOVERNANCE_NAVIGATION_AUDIT.md`/`docs/PHASE_4C3_WEB_TO_MOBILE_TRANSFER_AUDIT.md` : Meeting sans `status` | État réel actuel : `Meeting.status` existe depuis Phase 4C-3 | Ces deux documents Mobile sont partiellement obsolètes | Non bloquant, mise à jour recommandée |

## 23. Model gaps

- `Meeting.type` (aucune valeur, champ absent).
- `QuorumSnapshot` (absent du code **et** du dictionnaire — spécification à produire, pas seulement implémentation).
- `AssemblyDecision` (absent du code **et** du dictionnaire — idem).
- `VoteOption`, `MemberVote` (absents du code ; existent au dictionnaire mais celui-ci n'a pas autorité pour déclencher une implémentation, rang 6).
- Historisation de `Member.status` (nécessaire pour l'éligibilité point-in-time, §8).
- Champ d'autorisation de participation aux AG sur `Member` (règle 3, §8).

## 24. Décisions restantes

1. Stratégie de migration `GeneralAssembly → Meeting(type=GENERAL_ASSEMBLY)` : conversion des données existantes, dépréciation du service/routes/UI/i18n actuels (§6).
2. FK canonique de `Vote` : `meeting_id` (cible) vs `assembly_id`/`general_assemblies.id` (rang 2/6 actuels) — mise à jour de `PHASE_02_MODELE_CANONIQUE_FINAL.md` requise pour lever le SOURCE_CONFLICT (§12).
3. Éligibilité des membres : historiser `Member`, ou accepter une dégradation vers un calcul sur l'état courant uniquement (§8).
4. Spécification complète de `QuorumSnapshot` et `AssemblyDecision` (champs, types, contraintes) — actuellement sans fiche dictionnaire (§10-§11).
5. Mécanisme exact de rattachement optionnel `AssemblyDecision ↔ Vote` (§15).
6. Cohérence `tenant_id`/`meeting_id` sur `AssemblyDecision` (redondance à encadrer, §17).

## 25. Matrice GO / NO-GO

| Domaine | Statut |
|---|---|
| Meeting REGULAR | 🟣 MODEL_GAP (champ `type` manquant, migration triviale) |
| Meeting GENERAL_ASSEMBLY | 🟣 MODEL_GAP (champ `type` manquant + dépendances §7-§15 non résolues) |
| Meeting status | 🟢 GO (déjà conforme, testé) |
| Attendance | 🟢 GO (déjà compatible avec les deux types, aucun changement requis) |
| Éligibilité membres | 🟣 MODEL_GAP (historisation absente, critique) |
| Quorum | 🟡 DECISION_REQUIRED (dépend de l'éligibilité) |
| QuorumSnapshot | 🟣 MODEL_GAP (absent code + dictionnaire) |
| AssemblyDecision | 🟣 MODEL_GAP (absent code + dictionnaire) |
| Vote | 🟡 DECISION_REQUIRED (SOURCE_CONFLICT sur la FK cible, 3 sources en désaccord) |
| VoteOption | 🟣 MODEL_GAP (absent code ; audit doc erroné) |
| MemberVote | 🟣 MODEL_GAP (absent code ; audit doc erroné) |
| Decision ↔ Vote | 🟡 DECISION_REQUIRED (mécanisme de rattachement non défini par aucune source) |
| RBAC | 🟢 GO (catalogue existant suffisant par cohérence avec le pattern déjà établi) |
| Tenant isolation | 🟢 GO pour Meeting/Attendance (structurel, testé) / 🟣 MODEL_GAP pour le reste (rien à isoler, rien n'existe) |
| Offline | 🟢 GO pour l'infrastructure Mobile générique (prouvée, réutilisable telle quelle) / 🟣 MODEL_GAP pour les tables concrètes |
| tanzen-frontend | 🟡 DECISION_REQUIRED (dépend de toutes les décisions ci-dessus avant toute implémentation) |
| tanzen-mobile | ⚪ OUT_OF_SCOPE (rien à migrer, à ne pas commencer avant stabilisation Web) |
| tanzen-commercial | ⚪ OUT_OF_SCOPE / NO IMPACT (confirmé) |

## 26. Recommandation finale

Aucune implémentation ne devrait démarrer avant que les 6 décisions du §24 soient explicitement tranchées — en particulier la stratégie de migration de `GeneralAssembly` (§6, le plus gros volume de code à traiter) et la réconciliation de la FK `Vote` avec `PHASE_02_MODELE_CANONIQUE_FINAL.md` (§12, sans quoi toute implémentation de `Vote.meeting_id` contredirait le document que ce projet a lui-même désigné comme référence unique). `Meeting.status` et `Attendance` n'ont besoin d'aucun changement et peuvent servir de fondation stable. `QuorumSnapshot` et `AssemblyDecision` nécessitent une spécification de champs avant tout travail de modélisation, faute de fiche dictionnaire. `tanzen-mobile` et `tanzen-commercial` ne sont pas des facteurs bloquants pour la suite de ce travail côté Web.

## 27. Aucun changement de code

    AUCUNE MODIFICATION DE CODE — tanzen-frontend, tanzen-mobile, tanzen-commercial tous intacts.

---

## Fichiers inspectés (échantillon significatif, non exhaustif)

`src/mocks/organization/governance.ts`, `attendances.ts`, `general-assemblies.ts`, `members.ts` ; `src/services/organization.service.ts`, `attendance.service.ts`, `general-assembly.service.ts`, `query-keys.ts`, `rbac.mocks.ts` ; `src/features/organization/organization-module.tsx` ; `src/config/navigation.ts` ; `docs/audit/excel_dictionary_dump.txt` (fiches #01-#59, table des matières relue intégralement) ; `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `PHASE_02_DECISIONS_CANONIQUES.md`, `PHASE_04_USE_CASE_CLASSIFICATION.md`, `PHASE_06_DECISIONS_A_VALIDER.md`, `PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md`, `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md`, `P1_GOVERNANCE_GENERAL_ASSEMBLY_IMPLEMENTATION_REPORT.md`, `P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md`, `P1_GOVERNANCE_PHASE_4C3_IMPLEMENTATION_REPORT.md` ; recherche exhaustive dans `tanzen-mobile` (`src/`, `app/`, `tests/`) et `tanzen-commercial` (`src/services`, `src/layouts`, `src/routes`, `src/mocks/organization`).

## Git

`git status --short` avant et après cette mission (tanzen-frontend) : identique, à l'exception de la création de ce rapport. Aucune modification dans `tanzen-mobile` ni `tanzen-commercial`.

    Aucun commit
    Aucun push
