# P1 GOVERNANCE — PHASE 4C-4
# GENERAL ASSEMBLY
# WEB DECISION GATE

**Statut : AUDIT DÉCISIONNEL READ-ONLY.** Aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `routes/`, `config/`, `locales/` n'a été modifié, créé ou supprimé. Aucune migration, service, repository, route, écran, permission n'a été créé. Ce rapport est le seul fichier créé par cette mission. `tanzen-mobile` et `tanzen-commercial` n'ont pas été touchés. Aucun commit, aucun push.

---

## 1. Mandat

Transformer l'audit d'impact `docs/PHASE_4C4_GENERAL_ASSEMBLY_MEETING_TYPE_IMPACT_AUDIT.md` en un Decision Gate formel — 10 décisions numérotées (`D-4C4-WEB-01` à `10`), chacune avec options, avantages/inconvénients, impacts (Web/Mobile/Backend/tenant isolation), source d'autorité et source en conflit le cas échéant — permettant au Product Owner de trancher avant tout Implementation GO. Ce document ne tranche aucune décision : il les prépare pour validation, à la manière de `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` en Phase 4C-3.

`Meeting.status` (PLANNED/ONGOING/COMPLETED/CANCELLED) et `Attendance` sont traités comme déjà validés et implémentés (Phase 4C-3, Decision Gate CLOSED) — non rouverts ici, uniquement vérifiés pour impact.

## 2. Sources

Sources effectivement inspectées pour ce document, avec leur rang dans la hiérarchie déjà établie par `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` §3 (reprise ici sans modification, source : `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` §6) :

1. Décision explicitement validée par le PO.
2. `PHASE_02_MODELE_CANONIQUE_FINAL.md`.
3. Cas d'usage classifiés et validés (`PHASE_04_USE_CASE_CLASSIFICATION.md`).
4. Diagrammes de classes/séquences.
5. Implémentation actuelle (code de **tanzen-frontend**, jamais de tanzen-frontend-claude).
6. Dictionnaire Excel (`docs/audit/excel_dictionary_dump.txt`).

Documents relus intégralement ou par grep exhaustif pour ce Decision Gate : `docs/PHASE_4C4_GENERAL_ASSEMBLY_MEETING_TYPE_IMPACT_AUDIT.md` (source primaire), `docs/audit/excel_dictionary_dump.txt` (fiches #18-19, #39-42), `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `docs/PHASE_02_DECISIONS_CANONIQUES.md`, `docs/PHASE_04_USE_CASE_CLASSIFICATION.md`, `docs/PHASE_06_DECISIONS_A_VALIDER.md`, `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md`, `docs/P1_GOVERNANCE_GENERAL_ASSEMBLY_IMPLEMENTATION_REPORT.md`, `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md`, `docs/P1_GOVERNANCE_PHASE_4C3_IMPLEMENTATION_REPORT.md` ; code : `src/mocks/organization/governance.ts`, `attendances.ts`, `general-assemblies.ts`, `members.ts`, `src/services/organization.service.ts`, `attendance.service.ts`, `general-assembly.service.ts`, `src/mocks/rbac.mocks.ts`, `src/features/organization/organization-module.tsx`.

**Rappel de discipline de source (règle absolue #16-17)** : `AUDIT_PHASE_01.md` — dont dérive une partie de `PHASE_02_MODELE_CANONIQUE_FINAL.md` — déclare explicitement en ligne 9 avoir comparé le dictionnaire au code de `tanzen-frontend-claude/src`, pas à `tanzen-frontend/src` (déjà signalé par le Decision Gate Phase 4C-3 §3). Aucune affirmation de ce document n'est donc traitée ici comme preuve directe de l'état de `tanzen-frontend` — seule une inspection directe du code de ce dépôt (rang 5) fait foi pour « implémenté / non implémenté ». De même, `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` est traité comme une affirmation à vérifier, pas comme une preuve — voir §13 où deux de ses affirmations sont directement contredites par une inspection du code.

## 3. Architecture cible

```
Meeting
   │
   ├── Attendance
   │
   ├── QuorumSnapshot
   │
   ├── AssemblyDecision
   │       │
   │       └── Vote
   │              ├── VoteOption
   │              └── MemberVote
   │
   └── type = GENERAL_ASSEMBLY
```

`GeneralAssembly` n'est pas une entité autonome dans cette cible. Tous les enfants de Governance pour une AG sont rattachés à `Meeting.id`, jamais à un `assembly_id` distinct.

## 4. État réel tanzen-frontend

| Composant | État réel | Preuve |
|---|---|---|
| `Meeting.status` | **IMPLÉMENTÉ**, validé Phase 4C-3 | `src/mocks/organization/governance.ts` (`MeetingStatus`), `organization.service.ts` (`startMeeting`/`completeMeeting`/`cancelMeeting`), 39 tests |
| `Meeting.type` | **MODEL_GAP** — champ absent | `Meeting` = 9 champs, aucun `type` (`governance.ts`) |
| `Attendance` | **IMPLÉMENTÉ**, validé Phase 4C-3 | `src/mocks/organization/attendances.ts`, `attendance.service.ts`, 15 tests |
| `GeneralAssembly` | **IMPLÉMENTÉ**, entité autonome — en conflit avec la cible | `general-assemblies.ts`, `general-assembly.service.ts`, 3 routes, 3 composants UI, 12 tests |
| `QuorumSnapshot` | **MODEL_GAP** — absent code et dictionnaire (59 fiches) | Recherche exhaustive, zéro occurrence |
| `AssemblyDecision` | **MODEL_GAP** — absent code et dictionnaire | Idem ; seul rapprochement UCX5-01 (label seul) |
| `Vote` | **IMPLÉMENTÉ**, mais autonome (ni `assemblyId` ni `meetingId`) | `governance.ts` : `{id, tenantId, subject, date, yes, no, abstain, result}` |
| `VoteOption` | **MODEL_GAP** — absent du code | Zéro occurrence, malgré fiche dictionnaire #41 |
| `MemberVote` | **MODEL_GAP** — absent du code | Zéro occurrence, malgré fiche dictionnaire #42 |

## 5. Meeting.type

**État établi** : champ absent. **Décision à préparer** : D-4C4-WEB-02 (§ci-dessous).

## 6. Meeting.status

**DÉJÀ VALIDÉ ET IMPLÉMENTÉ — non rouvert.** `PLANNED → ONGOING → COMPLETED` (terminal), annulation possible depuis `PLANNED` ou `ONGOING` vers `CANCELLED` (terminal). Transitions protégées en service (`startMeeting`/`completeMeeting`/`cancelMeeting`, chacune vérifiant l'état courant), testées exhaustivement (`organization.service.test.ts`). **Aucun impact identifié** de l'architecture General Assembly sur ce cycle — `Meeting.status` reste indépendant de `Meeting.type`.

## 7. Attendance

**DÉJÀ VALIDÉ ET IMPLÉMENTÉ — non rouvert.** Clé `meetingId`/`memberId`, `UNIQUE(meeting_id, member_id)` appliquée en upsert idempotent (`operationId`), immutabilité dès que `Meeting.status ∉ {PLANNED, ONGOING}`, isolation tenant indirecte (`meetingId → Meeting.tenantId`, `memberId` vérifié séparément). **Impact de General Assembly** : aucun changement de modèle requis — `attendanceService` ne lit ni n'écrit `Meeting.type`. Un `Attendance` sur un futur `Meeting(type=GENERAL_ASSEMBLY)` fonctionnerait tel quel. Seul lien fonctionnel nouveau : `QuorumSnapshot.present_member_count` (§9) serait dérivé d'un comptage de `Attendance.status = 'PRESENT'` par `meetingId` — une lecture, pas une modification du modèle `Attendance`.

## 8. Eligibility

**GAP CRITIQUE, confirmé par inspection directe de `src/mocks/organization/members.ts`.**

`Member = {id, tenantId, firstName, lastName, gender, birthDate, nationality, idNumber, occupation, email, phone, address, joinedAt, status: 'active'|'inactive'|'suspended'|'pending', tenantName, positions[], accounts[], documents[], activities[], governanceParticipation[]}`.

Ce qui existe réellement :
- `status` : instantané **courant** uniquement — un seul champ, réécrit sans trace par `organizationService.updateMember` (`Object.assign(member, patch)`, `organization.service.ts`). Aucune date de transition n'est conservée.
- `joinedAt` : date d'adhésion initiale — ne capture pas une réactivation après suspension, ni une sortie.
- Aucun champ « date de fin d'activité » / « date de sortie ».
- Aucun champ « droit de participer à une AG » ou « droit de vote » distinct du `status` général.
- `governanceParticipation[]` : historique de participation **passée** (assemblyName, role, date) — c'est un journal d'événements déjà survenus, pas un mécanisme de calcul d'éligibilité **future/à une date donnée**.

**Question PO** : comment déterminer les membres éligibles à une AG à une date donnée ?

**Options** (reprises telles que formulées par le mandat) :

| | Option A — état actuel uniquement | Option B — historisation des statuts | Option C — mécanisme explicite d'éligibilité AG | Option D — historisation + règle d'éligibilité |
|---|---|---|---|---|
| Description | Éligibilité = `Member.status === 'active'` au moment du calcul (à la clôture), sans reconstruction historique | Ajouter la capacité de reconstruire `Member.status` à une date passée (ex. table d'audit des transitions, ou champs `activeSince`/`inactiveSince`) | Ajouter un champ dédié (ex. `Member.eligibleForGeneralAssembly: boolean`) distinct du statut général | Combiner B et C — historiser les transitions **et** disposer d'un droit de participation distinct |
| Modèle requis | Aucun changement | Nouveaux champs/table sur `Member` | Nouveau champ sur `Member` | Les deux |
| Conforme aux règles D-4C4-03 (mandat Phase 4C-4 §6) | Partielle — seule la règle 1 (tenant) et une version dégradée de 2/4/5 (état au moment du calcul, pas à la date de l'AG) sont couvertes | Couvre les règles 2, 4, 5 (état à une date donnée) | Couvre la règle 3 (droit distinct du statut) | Couvre 1 à 5 |
| Migration | Aucune | Nécessite un mécanisme de capture des transitions futures ; ne peut pas reconstruire rétroactivement l'historique déjà perdu pour les membres existants | Nécessite de peupler le nouveau champ pour tous les membres existants (valeur par défaut à définir) | Cumul des deux migrations |
| Web | Aucun changement service/UI immédiat | `updateMember` devrait écrire un enregistrement d'historique à chaque changement de `status`, pas seulement `Object.assign` | Formulaire membre doit exposer un nouveau champ | Les deux |
| Mobile | Aucun impact (rien n'existe) | Le futur modèle offline devrait répliquer l'historique | Le futur modèle offline devrait répliquer le champ | Les deux |
| Risques | Un membre suspendu puis réactivé juste avant la clôture serait compté éligible même s'il ne l'était pas à la date de l'AG — contredit explicitement la règle 4/5 du mandat | Aucune donnée historique pour les AG déjà tenues avant la mise en place — le figeage rétroactif (règles 6-7) resterait impossible pour l'historique antérieur | Ne résout pas le problème temporel (2, 4, 5) — seulement l'autorisation (3) | Le plus complet, mais le plus coûteux à construire ; aucune source ne le réclame explicitement au-delà du mandat lui-même |

**Recommandation** : aucune n'est validée par ce Decision Gate — la question est produit, pas technique. Élément factuel à considérer : sans au moins une forme de B (historisation), les règles 4 et 5 du mandat Phase 4C-4 (« membre devenu actif/inactif après/avant l'Assemblée ») ne sont **structurellement pas vérifiables**, quelle que soit l'option choisie par ailleurs pour C. **DECISION_REQUIRED — D-4C4-WEB-03.**

## 9. Quorum

Chaîne demandée par le mandat, chaque maillon vérifié séparément contre le code/dictionnaire actuel :

| Maillon | Défini quelque part ? | Preuve |
|---|---|---|
| Nombre éligible | Non — dépend de §8, non résolu | — |
| Nombre présent | **Dérivable** de `Attendance.status = 'PRESENT'` par `meetingId` | `attendanceService.listAttendancesByMeeting` (déjà implémenté, Phase 4C-3) |
| Seuil de quorum | **Absent** — aucun champ, aucune règle, dans le code ou le dictionnaire (fiche #39 `general_assemblies` ne porte aucun champ `quorum_threshold` ni équivalent) | Recherche exhaustive |
| Règle de calcul (ex. % des éligibles, ou nombre fixe) | **Absente** | — |
| Résultat (atteint/non atteint) | **Absent** | — |
| Moment du figeage | **Absent** (dépend de `QuorumSnapshot`, §10, lui-même absent) | — |

**Aucun seuil n'est inventé ici.** Seul le mandat Phase 4C-4 mentionne le concept — sans valeur, sans règle de calcul, sans source. **DECISION_REQUIRED — D-4C4-WEB-04**, dépendante de D-4C4-WEB-03 (§8) et D-4C4-WEB-05 (§10).

## 10. QuorumSnapshot

**Question obligatoire du mandat** : quelle est la source d'autorité permettant de définir `QuorumSnapshot` ?

**Réponse factuelle** : aucune. Recherche exhaustive dans `src/` (zéro occurrence) et dans les 59 fiches du dictionnaire canonique (`docs/audit/excel_dictionary_dump.txt`, table des matières relue intégralement — aucune fiche `quorum_snapshots` ni équivalente). `PHASE_02_MODELE_CANONIQUE_FINAL.md` ne le mentionne pas. Aucun diagramme de classes ne le montre. Aucun Use Case classifié ne le nomme.

**Classement : MODEL_GAP / DECISION_REQUIRED**, au niveau de la **spécification**, pas seulement de l'implémentation — comparable au traitement déjà réservé à `TontinePosition`/`PositionPayment` dans `PHASE_02_MODELE_CANONIQUE_FINAL.md` §1.2 (entités verrouillées comme indépendantes mais sans fiche dictionnaire, « à spécifier avant implémentation »).

**Éléments minimaux à arbitrer** (proposition d'analyse issue de l'audit d'impact précédent et du mandat lui-même — **explicitement pas une décision déjà validée**) :

| Champ proposé | Rôle | Statut |
|---|---|---|
| clé (`id`) | Identifiant | À arbitrer |
| `meeting_id` | Relation vers `Meeting` | À arbitrer (cohérent avec l'architecture cible §3) |
| `eligible_member_count` | Nombre de membres éligibles au moment du calcul | À arbitrer — dépend de D-4C4-WEB-03 |
| `present_member_count` | Nombre de membres présents | Dérivable d'`Attendance`, déjà possible techniquement |
| `quorum_threshold` | Seuil requis | À arbitrer — dépend de D-4C4-WEB-04 |
| `quorum_reached` | Résultat (booléen) | À arbitrer |
| `frozen_at` | Horodatage du figeage | À arbitrer |

**D-4C4-WEB-05.**

## 11. GeneralAssembly migration

Voir D-4C4-WEB-01 ci-dessous (§ Décisions formalisées).

## 12. AssemblyDecision

**État actuel** : absent du modèle physique confirmé (code et dictionnaire, recherche exhaustive). **Seul rapprochement identifié** : `UCX5-01 — « Exécuter les décisions »` (`PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 574, Admin Tenant, `«extend»` depuis « Planifier une réunion », ressource notée `GeneralAssembly (décision)`). **Aucun schéma physique n'est déduit de ce seul Use Case** — UCX5-01 confirme l'existence fonctionnelle de la notion de « décision d'assemblée », rien de plus (les Use Cases de ce corpus ne portent aucun schéma de champs, cf. `PHASE_04_USE_CASE_CLASSIFICATION.md` §9, déjà établi en Phase 4C-3).

Décisions nécessaires identifiées, aucune tranchée ici :
- Relation avec `Meeting` : `meeting_id` (cohérent avec l'architecture cible §3), non confirmé par une source canonique.
- `title`/`description` : plausibles par analogie avec `GeneralAssembly`/`Meeting` existants, non spécifiés par une source.
- `decision_number` : génération automatique (séquentielle par tenant/meeting ?) ou saisie manuelle — non défini.
- `status` : vocabulaire non défini (aucune source ne propose d'énumération, contrairement à `Meeting.status` ou `Attendance.status`).
- `decided_at` : horodatage de la décision — non défini si distinct de `created_at`.
- `created_by` : cohérent avec le pattern déjà utilisé ailleurs (`documents.uploaded_by`, fiche dictionnaire) mais non confirmé pour cette entité spécifiquement.
- Lifecycle : immuable après clôture du Meeting, par analogie avec `Attendance` (D-4C3-WEB-03) ? Aucune source ne l'affirme ni ne l'infirme pour `AssemblyDecision` spécifiquement — **ne pas supposer par extension automatique**.
- Lien avec `Vote` : traité séparément, D-4C4-WEB-08 (§ci-dessous).

**D-4C4-WEB-06.**

## 13. Vote

**Code actuel** (`src/mocks/organization/governance.ts`) : `Vote = {id, tenantId, subject, date, yes, no, abstain, result: 'adopted'|'rejected'|'pending'}` — enregistrement autonome, `tenantId` direct, aucune FK vers une assemblée ou une réunion. Ce rattachement était déjà un sujet explicitement « À VALIDER » et jamais tranché : `PHASE_06_DECISIONS_A_VALIDER.md` §1 (« `Vote.assemblyId`... Question à trancher : un `Vote` doit-il obligatoirement être rattaché à une `Assembly` ou un `Meeting` ? »).

Traité en détail comme conflit formel — voir D-4C4-WEB-07 (§16).

## 14. VoteOption

**État actuel : absent du code**, malgré une fiche dictionnaire complète (#41, `docs/audit/excel_dictionary_dump.txt:1078-1089` : `{id, vote_id FK, label}`, `UNIQUE(vote_id, label)`). Recherche exhaustive dans `src/` : zéro occurrence (la seule mention est un commentaire de `general-assemblies.ts:13` listant `VoteOption` comme explicitement hors périmètre de la mission précédente).

**Affirmation historique à ne pas accepter sans preuve** : `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 110 affirme « `VoteOption` | Implémenté | ... | IMPLEMENTED ». **Cette affirmation est directement contredite par l'inspection du code de tanzen-frontend** — aucune preuve de code ne la corrobore. Traitée comme fausse pour ce Decision Gate, pas comme une source fiable.

Modèle/relations/contraintes : dépendent entièrement de D-4C4-WEB-07 (FK de `Vote`, dont `VoteOption` hérite via `vote_id`). Non spécifiables indépendamment.

## 15. MemberVote

**État actuel : absent du code**, même constat que §14. Fiche dictionnaire #42 (`docs/audit/excel_dictionary_dump.txt:1091-1111`) : `{id, vote_id FK, member_id FK, option_id FK NOT NULL, voted_at}`, `UNIQUE(vote_id, member_id)`, `UNIQUE(vote_id, member_id, option_id)`.

**Affirmation historique à ne pas accepter sans preuve** : `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 111 affirme « PARTIALLY_IMPLEMENTED » — également non corroborée par le code (absence totale, pas une implémentation partielle). Traitée comme inexacte pour ce Decision Gate.

Dépendance directe à `Vote` (via `vote_id`) et à `VoteOption` (via `option_id`, `NOT NULL` au dictionnaire — chaque `MemberVote` suppose donc que le vote concerné a au moins une option). Isolation tenant : dictionnaire/rang 2 confirment aucun `tenant_id` direct, remontée indirecte via `vote_id` — deux à trois sauts selon la FK finalement retenue pour `Vote` (D-4C4-WEB-07). **Regroupée avec VoteOption sous D-4C4-WEB-10** (le mandat les traite comme un bloc, cohérent avec leur dépendance mutuelle totale).

## 16. Vote FK conflict

**Trois sources, en désaccord direct, aucune ne coïncidant avec le code actuel (autonome).**

| Source | Rang | FK proposée | Cible |
|---|---|---|---|
| Dictionnaire (`docs/audit/excel_dictionary_dump.txt:1062`) | 6 | `assembly_id` | `assemblies.id` |
| `PHASE_02_MODELE_CANONIQUE_FINAL.md:102` | 2 | `assembly_id` | `general_assemblies(id)` |
| Mandat Phase 4C-4 (architecture cible §3) | *(à qualifier — voir note ci-dessous)* | `meeting_id` | `Meeting.id` |
| Code actuel (`governance.ts`) | 5 | *(aucune)* | *(autonome)* |

**Note sur le rang de l'architecture cible** : elle n'est ni une décision PO déjà tracée dans un document existant (rang 1 au sens strict — aucun document antérieur à la Phase 4C-4 ne la formule), ni `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2, qui dit le contraire). Elle est présentée par les mandats Phase 4C-4 successifs comme « architecture validée » — traitée ici comme une **décision produit en cours de formalisation par ce Decision Gate lui-même**, pas encore comme un fait acquis au même titre qu'une décision déjà écrite dans un document verrouillé. C'est précisément l'objet de cette décision : la formaliser, ou l'amender, avant qu'elle ne devienne rang 1 de fait.

Aucun document canonique (rang 2, 6) n'a été mis à jour pour refléter `Vote.meeting_id` — un décalage qui doit être résolu explicitement, pas silencieusement.

### D-4C4-WEB-07 — Vote parent relation

| | Option A — `assembly_id → assemblies.id` | Option B — `assembly_id → general_assemblies.id` | Option C — `meeting_id → meetings.id` |
|---|---|---|---|
| Source d'autorité | Dictionnaire (rang 6), fiche #40 | `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) | Mandat Phase 4C-4 (architecture proposée, non encore rang 1 formalisé — voir note ci-dessus) |
| Avantages | Respecte littéralement le dictionnaire tel qu'il existe aujourd'hui | Respecte le document que le projet a lui-même désigné comme référence unique en cas de divergence (`PHASE_02_MODELE_CANONIQUE_FINAL.md`, en-tête) | Cohérent avec l'architecture cible Phase 4C-4 (§3) et avec la décision déjà prise sur `GeneralAssembly` (D-4C4-WEB-01) si celle-ci retient l'Option B/C (fusion dans `Meeting`) ; évite une double référence (`Meeting` ET `assemblies`/`general_assemblies`) pour la même AG |
| Inconvénients | La table `assemblies` du dictionnaire ne correspond à aucune entité clairement identifiée dans le code actuel (le code a un type `Assembly` générique dans `governance.ts`, distinct de `GeneralAssembly` fiche #39 — lequel des deux le dictionnaire visait-il n'est pas clarifié par le dictionnaire lui-même) ; contredit le rang 2 | Contredit le dictionnaire (rang 6) ; suppose que `GeneralAssembly` reste une table physique distincte, ce qui contredit l'architecture cible Phase 4C-4 elle-même si D-4C4-WEB-01 retient sa suppression | Contredit à la fois le dictionnaire ET le document canonique verrouillé — nécessite une mise à jour formelle de `PHASE_02_MODELE_CANONIQUE_FINAL.md`, qui ne peut pas être faite silencieusement par ce Decision Gate |
| Migration | Aucune si le code reste autonome comme aujourd'hui ; sinon, ajouter `assembly_id` et peupler à partir d'une table `assemblies` qui n'existe pas encore comme entité physique dans le code | Nécessite que `general_assemblies` reste une table physique — contradictoire avec une migration D-4C4-WEB-01 vers Option B/C | Nécessite d'ajouter `meeting_id` à `Vote`, de migrer les 5 votes mock existants (tous liés à des `Assembly`/dates, jamais à un `Meeting` aujourd'hui) vers un `meetingId`, ce qui suppose que chaque `Vote` existant soit d'abord rattaché à un `Meeting` — aucun mapping actuel n'existe pour le faire sans ambiguïté |
| Web | Nécessiterait un nouveau champ + service à réécrire (`createVote`, `updateVoteResult`) | Idem, sur `general_assemblies` | Nécessiterait un nouveau champ + service à réécrire, mais s'aligne avec l'infrastructure `Meeting`/`Attendance` déjà construite (réutilisation directe de `getTenantScoped(meetings, ...)` pour l'isolation, cf. pattern déjà utilisé par `attendance.service.ts`) |
| Mobile | Aucun impact immédiat (`Vote` n'existe pas côté Mobile) | Idem | Idem — mais si retenue, c'est la seule option qui permettrait au futur modèle Mobile de ne construire qu'un seul concept (`Meeting`) plutôt que deux (`Meeting` + `assemblies`/`general_assemblies`) |
| Backend | Nécessite une table `assemblies` physique, absente de toute évidence dans le dictionnaire au-delà de la mention `FK → assemblies.id` elle-même | Nécessite que `general_assemblies` (fiche #39) reste physiquement construite | Nécessite l'ajout de `meeting_id` à `votes`, absent du dictionnaire actuel |
| Tenant isolation | Indirecte, via une table `assemblies` non confirmée | Indirecte, via `general_assemblies.tenant_id` (confirmé rang 2) | Indirecte, via `Meeting.tenantId` (mécanisme déjà prouvé et testé pour `Attendance`, réutilisable tel quel) |
| Cohérence avec GeneralAssembly (D-4C4-WEB-01) | Indépendante de D-4C4-WEB-01 | **Incompatible** avec toute option de D-4C4-WEB-01 qui supprime `general_assemblies` comme table physique | **Requiert** que D-4C4-WEB-01 retienne une option qui élimine (ou rend secondaire) `general_assemblies` — les deux décisions sont couplées |
| Risques | Ambiguïté non résolue sur ce qu'est réellement `assemblies.id` dans le dictionnaire | Verrouille `GeneralAssembly` comme table permanente, à l'encontre de l'intention explicite du mandat Phase 4C-4 (§2 : « GeneralAssembly n'est PLUS une entité autonome ») | Nécessite une mise à jour formelle de `PHASE_02_MODELE_CANONIQUE_FINAL.md`, sans quoi ce document et le code resteraient durablement contradictoires |

**Aucune option n'est arbitrée par ce Decision Gate.** Le couplage avec D-4C4-WEB-01 est le point le plus important à ne pas manquer : choisir l'Option C sans que D-4C4-WEB-01 élimine `general_assemblies` créerait un système à deux têtes (une AG identifiable à la fois par `general_assemblies.id` et par `Meeting.id`).

## 17. Decision → Vote

**Question du mandat** : un `Vote` appartient-il directement à une `AssemblyDecision` ?

**Sources vérifiées** : le dictionnaire (rang 6) et `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) ne connaissent pas `AssemblyDecision` du tout (§10/§12 de l'audit d'impact précédent, confirmé de nouveau ici) — ils font de `Vote` un enfant direct de `assemblies`/`general_assemblies`, jamais d'une entité « décision ». Le mandat Phase 4C-4 propose une architecture où `Vote` est enfant d'`AssemblyDecision`, elle-même enfant de `Meeting` (§3 de ce document). **Aucune source canonique ne confirme cette structure à trois niveaux (`Meeting → AssemblyDecision → Vote`)** — c'est une proposition de l'architecture cible elle-même, pas un fait déjà établi ailleurs.

Le mandat rappelle explicitement (règle métier déjà citée en Phase 4C-4) : *« Decision peut exister sans Vote »* et *« Vote peut éventuellement contribuer à une Decision »* — ce qui exclut par construction une FK obligatoire de `Vote` vers `AssemblyDecision`. **Ne pas inventer une relation simplement parce qu'elle paraît logique** (règle absolue #15 rappelée pour ce point précis).

**D-4C4-WEB-08** : la structure `Meeting → AssemblyDecision → Vote` (nullable) est présentée comme option unique cohérente avec l'énoncé du mandat, mais **aucune alternative n'a été explorée par une source canonique** — il n'existe littéralement aucune autre proposition documentée. Ce Decision Gate ne peut donc pas présenter d'options concurrentes crédibles issues des sources ; il signale que la structure proposée par le mandat lui-même reste, à ce stade, **non corroborée par le dictionnaire ni par `PHASE_02_MODELE_CANONIQUE_FINAL.md`**, qui rattachent plutôt `Vote` directement à l'assemblée (pas à une « décision »). **DECISION_REQUIRED**, avec un GAP de rechange documentaire : si le PO valide `Meeting → AssemblyDecision → Vote`, cela doit être explicitement acté comme une extension du modèle canonique, pas une simple confirmation d'un fait déjà écrit ailleurs.

## 18. RBAC

Catalogue actuel (`src/mocks/rbac.mocks.ts:55`) : `governance.read`, `governance.create`, `governance.approve`, `governance.update`, `governance.delete` — fondation considérée comme validée, non modifiée.

Couverture actuelle par entité :

| Entité | `read` | `create` | `update` | `approve` | `delete` |
|---|---|---|---|---|---|
| `Meeting` | Route gardée | Bouton gardé | `startMeeting` | `completeMeeting`/`cancelMeeting`/publier PV | *(aucune opération delete)* |
| `Attendance` | Route gardée | Saisie | Modification | *(non utilisé)* | Suppression |
| `GeneralAssembly` | Route gardée | Bouton gardé | *(aucune opération update)* | *(non utilisé)* | *(aucune opération delete)* |
| `QuorumSnapshot` | — | — | — | — | — |
| `AssemblyDecision` | — | — | — | — | — |
| `Vote` (actuel) | *(aucune route dédiée)* | Bouton gardé | *(non utilisé)* | Publier résultat | *(aucune)* |
| `VoteOption`/`MemberVote` | — | — | — | — | — |

Pour les entités absentes du code (`QuorumSnapshot`, `AssemblyDecision`, `VoteOption`, `MemberVote`), il n'y a rien à « couvrir » aujourd'hui — la question est prospective. Sur la base du pattern déjà appliqué de façon homogène à `Meeting`/`Attendance`/`GeneralAssembly`/`Vote` (un seul groupe `governance.*` partagé, jamais de permission par sous-entité), le catalogue existant **semble** suffisant par cohérence interne — mais ceci reste une observation, pas une validation. **Toute lacune reste classée DECISION_REQUIRED, pas corrigée** : aucune permission n'est créée par cette mission.

## 19. Tenant isolation

| Relation | Mécanisme | Statut |
|---|---|---|
| `Meeting → tenant` | `tenantId` direct, `getTenantScoped` | Structurel, testé — GO |
| `Attendance → Meeting → tenant` | Indirect, testé (`meetingId`, `memberId` vérifiés séparément) | Structurel, testé — GO |
| `GeneralAssembly → Meeting → tenant` | **N/A aujourd'hui** — `GeneralAssembly` a son propre `tenantId` direct, pas de relation à `Meeting` | Dépend de D-4C4-WEB-01 |
| `QuorumSnapshot → Meeting → tenant` | Proposée (indirecte, par analogie avec `Attendance`) | MODEL_GAP — entité absente |
| `AssemblyDecision → Meeting → tenant` | La structure cible du mandat porte à la fois `tenant_id` **et** `meeting_id` — **redondance à examiner**, voir D-4C4-WEB-09 | MODEL_GAP — entité absente |
| `Vote → Decision/Meeting → tenant` | Aujourd'hui `tenantId` direct (code) ; cible indirecte (dictionnaire/rang 2) ; dépend de D-4C4-WEB-07 | Conflit non résolu |
| `VoteOption → tenant` | Indirecte via `vote_id` (rang 2) — dépend de D-4C4-WEB-07/10 | MODEL_GAP |
| `MemberVote → Member/Meeting/Vote → tenant` | Indirecte via `vote_id` ou `member_id` (rang 2) — dépend de D-4C4-WEB-07/10 | MODEL_GAP |

**Redondance identifiée** : `AssemblyDecision` serait la seule entité de toute la chaîne Governance à porter un `tenant_id` **direct** en plus d'une relation parent (`meeting_id`) qui suffirait déjà, par elle-même, à garantir l'isolation (comme c'est le cas pour `Attendance`, `QuorumSnapshot` proposé, `Vote`/`VoteOption`/`MemberVote` selon le rang 2). Traité formellement en D-4C4-WEB-09.

## 20. Offline / Mobile impact

**Rappel : `tanzen-mobile` n'a pas été modifié et ne porte aucun code Meeting/Attendance/Governance** (confirmé par l'audit d'impact précédent, recherche exhaustive). Cette section n'analyse que l'impact **futur**, sans inventer d'architecture offline supplémentaire.

Données qui seraient nécessaires offline, si/quand une implémentation Mobile est engagée :
- `Meeting` (avec `type` si D-4C4-WEB-02 le valide) — déjà anticipable via le pattern `TenantScopedRepository`/migration numérotée déjà en place pour `Member`/`Organization`.
- `Attendance` — idem, déjà anticipé par l'audit d'impact précédent (§7 de ce document, aucun changement requis par rapport à Phase 4C-3).
- `QuorumSnapshot` : si retenu, poserait une question de synchronisation spécifique — un snapshot figé à la clôture doit-il être calculé côté serveur uniquement (source de vérité unique) ou être calculable localement hors-ligne (risque de divergence entre le calcul local et le calcul serveur si la liste d'éligibles change entre-temps) ? **Non tranché, ne pas inventer de réponse.**
- `AssemblyDecision`/`Vote`/`VoteOption`/`MemberVote` : l'infrastructure `sync_outbox`/`operation_id` déjà prouvée pour `Member` côté Mobile (colonne `entity` libre, agnostique) serait réutilisable sans modification d'architecture — mais aucune de ces tables n'existe encore, ni côté Web ni côté Mobile.
- Idempotence : le pattern déjà validé en Phase 4C-3 (`operationId` + contrainte `UNIQUE`) est directement transposable à `MemberVote` (`UNIQUE(vote_id, member_id)` au dictionnaire) et à `AssemblyDecision` si une contrainte d'unicité y est définie — mais aucune contrainte de ce type n'a été validée pour `AssemblyDecision` (§12).
- Conflits : non analysables tant que le modèle de synchronisation reste MODEL_GAP au niveau serveur/Backend — hors périmètre de ce document.

**Aucune conclusion Mobile n'est actionnable avant que le modèle Web (D-4C4-WEB-01 à 10) soit stabilisé** — cohérent avec la méthodologie déjà appliquée en Phase 4C-3 (Web d'abord).

---

## Décisions formalisées

### D-4C4-WEB-01 — Migration GeneralAssembly

**Question** : que devient l'implémentation actuelle `GeneralAssembly` (type, mock, service, 3 routes, UI, 12 tests, i18n, navigation — cf. `docs/PHASE_4C4_GENERAL_ASSEMBLY_MEETING_TYPE_IMPACT_AUDIT.md` §6) si `Meeting(type=GENERAL_ASSEMBLY)` devient l'architecture cible ?

**Source en conflit** : le code actuel affirme littéralement le contraire de la cible (`organization-module.tsx:365-367` : *« décision produit validée : GeneralAssembly n'est jamais un Meeting(type=...) »*), une affirmation vraie au moment où elle a été écrite (Phase antérieure à 4C-4), désormais périmée par le mandat Phase 4C-4.

| | Option A — conserver GeneralAssembly comme entité autonome | Option B — supprimer/remplacer par Meeting.type | Option C — migration progressive / compatibilité temporaire |
|---|---|---|---|
| Description | Abandonner l'architecture cible Phase 4C-4 pour `GeneralAssembly` ; les deux mandats Phase 4C-4 successifs deviendraient sans objet sur ce point | Retirer `general-assemblies.ts`/`general-assembly.service.ts`/les 3 routes/l'UI/les clés i18n/l'entrée navigation ; migrer les 3 enregistrements mock existants (`GA-001..003`) vers `Meeting(type=GENERAL_ASSEMBLY)` | Garder `GeneralAssembly` en lecture seule (dépréciée) le temps que `Meeting(type=GENERAL_ASSEMBLY)` couvre toutes ses fonctionnalités, avec une période de coexistence explicite |
| Avantages | Aucun changement de code, aucun risque de régression, aucune migration de données | Une seule source de vérité pour les AG ; résout directement le conflit Vote FK côté Meeting (D-4C4-WEB-07 Option C) ; cohérent avec la recommandation déjà existante (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 18n : « réutiliser Meetings/Attendances existants plutôt que d'en recréer une variante sous Governance ») | Réduit le risque d'un « big bang » ; permet de valider `Meeting.type` en production avant de couper `GeneralAssembly` |
| Inconvénients | Contredit directement l'architecture cible validée par ce mandat ; laisse `Vote`/`QuorumSnapshot`/`AssemblyDecision` sans parent cohérent (rattachés à quoi ?) | Nécessite une migration de données (même limitée à 3 enregistrements aujourd'hui) et la suppression coordonnée de ~8 fichiers/sections de code ; aucun mécanisme de retour arrière une fois les routes retirées | Complexité transitoire (deux chemins de code pour un même concept fonctionnel) ; risque de divergence si les deux modèles ne restent pas strictement synchronisés pendant la coexistence |
| Impacts | Aucun sur le code existant ; bloque toute la chaîne Vote/Quorum/Decision (§D-4C4-WEB-07/05/06) qui suppose `Meeting` comme parent unique | Impact large mais borné (fichiers déjà inventoriés) ; UC couverts par `GeneralAssembly` (create+read) devraient être reproduits sous `Meeting(type=GENERAL_ASSEMBLY)` avant suppression, sans quoi une régression fonctionnelle apparaît | Impact double pendant la période de transition ; nécessite un critère de sortie explicite (quand couper `GeneralAssembly` ?) |
| Migration | Aucune | 3 enregistrements mock (`GA-001..003`) → 3 nouveaux `Meeting` avec `type='GENERAL_ASSEMBLY'`, `title`←`title`, `date`←`assemblyDate`, `status` déjà compatible (vocabulaire identique) ; `description` n'a pas d'équivalent direct sur `Meeting` (le champ le plus proche est `agenda`, sémantiquement différent) — à arbitrer | Migration progressive équivalente, mais réalisée en deux temps | 
| Rétrocompatibilité | Totale (rien ne change) | Rompt les 3 routes `governance/general-assemblies*` existantes — à rediriger ou supprimer explicitement | Préservée pendant la transition, rompue à la coupure finale |
| Web | Aucun | Réécriture ciblée de `organization-module.tsx` (retrait de 3 composants, ~70 lignes), `general-assembly.service.ts` (suppression), `query-keys.ts`, locales, navigation | Ajout temporaire d'une redirection/bandeau de dépréciation, puis retrait différé |
| Mobile | Aucun (rien n'existe côté Mobile) | Aucun impact immédiat (rien à migrer côté Mobile) ; simplifie le futur modèle cible Mobile (un seul concept à porter) | Idem Option B, différé |
| Backend | Aucun (mock uniquement) | Si un Backend réel existait, nécessiterait une migration de table `general_assemblies` vers `meetings` — hors périmètre de ce dépôt, à anticiper | Idem, mais en deux étapes |
| Risques | Le conflit avec l'architecture cible reste ouvert indéfiniment ; toute la chaîne Quorum/Decision/Vote reste bloquée | Risque de perte fonctionnelle si la migration de données est mal conduite (silencieuse) ; nécessite des tests de non-régression sur les 3 AG existantes | Risque de double maintenance prolongée si aucun critère de sortie n'est fixé |

**Recommandation** : aucune n'est validée ici. Élément de cohérence à signaler : Option A contredit frontalement le mandat qui commande ce document (« GeneralAssembly n'est PLUS une entité autonome ») — la retenir reviendrait à annuler la prémisse même de la Phase 4C-4, ce que ce Decision Gate n'a pas mandat de faire. Entre B et C, le choix dépend d'un facteur non documenté ici (le rythme de mise en production souhaité par le PO), hors de portée d'une analyse purement technique.

### D-4C4-WEB-02 — Meeting.type

**Question** : faut-il ajouter `Meeting.type` et considérer `GENERAL_ASSEMBLY` comme la qualification d'un `Meeting` ?

| | Ajouter `Meeting.type` maintenant | Ne pas ajouter |
|---|---|---|
| Modèle | `type: 'REGULAR' \| 'GENERAL_ASSEMBLY'`, extension additive du type TypeScript | Aucun changement |
| Migration | Triviale — les 4 `Meeting` mock existants reçoivent `type: 'REGULAR'` par défaut (aucun n'est aujourd'hui une AG) | Aucune, mais bloque structurellement D-4C4-WEB-01 Option B/C |
| Données existantes | Aucune perte, aucune ambiguïté (les 4 enregistrements actuels sont sans équivoque des réunions ordinaires) | — |
| Compatibilité | Rétrocompatible (champ additionnel, aucun code existant ne le lit) | — |
| Web | `Meeting` type + 4 mocks + éventuellement filtre UI par type | Aucun |
| Mobile futur | Le futur modèle SQLite `meetings` peut inclure `type` dès sa première migration, évitant une migration ultérieure | Le futur modèle Mobile devra ajouter `type` plus tard, une fois construit |
| Backend | Aucune spécification canonique n'existe pour ce champ (absent du dictionnaire fiche #18 `meetings`) — à faire spécifier également côté dictionnaire si retenu | Aucun changement |
| Tests | Extension ciblée d'`organization.service.test.ts` | Aucun |

**Dépendance** : cette décision est un préalable structurel à D-4C4-WEB-01 (Option B/C) — sans `Meeting.type`, il n'existe aucun moyen de distinguer un `Meeting(GENERAL_ASSEMBLY)` d'un `Meeting(REGULAR)`, donc aucune migration de `GeneralAssembly` n'est possible.

### D-4C4-WEB-03 — Eligibility

Voir §8 ci-dessus pour l'analyse complète (Options A/B/C/D). **Rappel de la conclusion factuelle** : sans une forme d'historisation (Option B ou D), les règles 4 et 5 du mandat Phase 4C-4 ne sont pas vérifiables avec le modèle `Member` actuel.

### D-4C4-WEB-04 — Quorum

Voir §9. Aucune règle de seuil n'existe dans aucune source — décision produit pure, à formuler explicitement par le PO (valeur fixe ? pourcentage ? configurable par tenant ou par assemblée ?). Dépend de D-4C4-WEB-03 (le nombre éligible) et de D-4C4-WEB-05 (où le résultat serait stocké).

### D-4C4-WEB-05 — QuorumSnapshot

Voir §10. MODEL_GAP au niveau spécification — aucune source ne définit ses champs. Liste proposée à arbitrer, pas à implémenter telle quelle.

### D-4C4-WEB-06 — AssemblyDecision

Voir §12. MODEL_GAP au niveau spécification. Seul rapprochement : UCX5-01 (label seul, sans schéma).

### D-4C4-WEB-07 — Vote parent relation

Voir §16 (tableau complet Options A/B/C). Couplée à D-4C4-WEB-01.

### D-4C4-WEB-08 — Decision → Vote

Voir §17. Aucune alternative documentée à la structure proposée par le mandat lui-même (`Meeting → AssemblyDecision → Vote`, nullable) — signalé comme non corroboré par le rang 2/6, pas comme validé.

### D-4C4-WEB-09 — tenant_id sur AssemblyDecision

**Question** : si `AssemblyDecision` appartient à `Meeting`, et que `Meeting` est déjà tenant-scoped, faut-il conserver un `tenant_id` direct sur `AssemblyDecision` ?

| | Conservation | Suppression |
|---|---|---|
| Justification | Cohérent avec le pattern dictionnaire général (la plupart des tables métier du dictionnaire portent un `tenant_id` direct même quand une FK parente existe, ex. `meetings`, `members`) ; permet des requêtes directes sans jointure | Cohérent avec le pattern déjà retenu pour `Attendance` (Phase 4C-3, D-4C3-WEB-… tenant isolation) — aucun `tenant_id` propre, isolation garantie uniquement via `meeting_id → Meeting.tenantId`, jamais par une FK seule considérée comme suffisante mais toujours vérifiée applicativement |
| Risque si conservé | Un `tenant_id` et un `meeting_id` incohérents entre eux (ex. `tenant_id` du tenant A mais `meeting_id` pointant vers un `Meeting` du tenant B) deviennent possibles si le service ne les valide pas l'un contre l'autre à chaque écriture — un bug de cohérence, pas seulement de style | Aucun risque de ce type (une seule source de vérité) |
| Risque si supprimé | Aucun identifié | Toute requête doit passer par une jointure/lookup sur `Meeting` — légèrement plus coûteux, sans risque de sécurité si le pattern `getTenantScoped`-like est correctement appliqué (déjà prouvé pour `Attendance`) |
| Cohérence avec le reste du modèle Governance | `Meeting`/`GeneralAssembly` (aujourd'hui)/`Vote` (code actuel) ont tous un `tenant_id` direct — `AssemblyDecision` avec `tenant_id`+`meeting_id` serait cohérent avec ce pattern historique | `Attendance` (Phase 4C-3, déjà validé) n'a **pas** de `tenant_id` direct — `AssemblyDecision` sans `tenant_id` serait cohérent avec la décision la plus récente du projet sur une entité du même type (rattachée à `Meeting`, créée après une réunion) |

**Non tranché.** Élément à signaler : la décision la plus récente et la plus proche structurellement (`Attendance`, Phase 4C-3) a retenu l'absence de `tenant_id` direct — un argument de cohérence en faveur de la suppression, mais qui n'a pas valeur de règle générale automatiquement transposable.

### D-4C4-WEB-10 — VoteOption / MemberVote

Voir §14-§15. Modèle/relations/contraintes entièrement dépendants de D-4C4-WEB-07 (FK de `Vote`) — ne peuvent pas être spécifiés indépendamment. Les deux affirmations « IMPLEMENTED »/« PARTIALLY_IMPLEMENTED » de `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` sont explicitement écartées comme preuves (contredites par le code).

---

## 21. GO / NO-GO matrix

| Élément | État actuel | Source | Décision | GO/NO-GO | Justification |
|---|---|---|---|---|---|
| `Meeting.type` | Absent | Code (rang 5) | D-4C4-WEB-02 | 🟡 DECISION_REQUIRED | Extension additive simple, mais préalable structurel à tout le reste |
| `Meeting.status` | Implémenté, validé | Code + mandat Phase 4C-3 | — (non rouvert) | 🟢 GO | Déjà en production logique, testé |
| `Attendance` | Implémenté, validé | Code + mandat Phase 4C-3 | — (non rouvert) | 🟢 GO | Déjà compatible avec les deux types de Meeting |
| `GeneralAssembly` migration | Entité autonome construite, en conflit avec la cible | Code (rang 5) vs mandat Phase 4C-4 | D-4C4-WEB-01 | 🔴 NO-GO (en l'état) | Contredit directement l'architecture cible ; aucune stratégie de migration choisie |
| Eligibility | `Member` sans historisation ni champ AG dédié | Code (rang 5) | D-4C4-WEB-03 | 🟣 MODEL_GAP | Règles 4/5 du mandat non vérifiables avec le modèle actuel |
| Quorum | Aucun seuil/règle défini | Aucune source | D-4C4-WEB-04 | 🟡 DECISION_REQUIRED | Dépend de D-4C4-WEB-03/05 |
| `QuorumSnapshot` | Absent code + dictionnaire | Recherche exhaustive | D-4C4-WEB-05 | 🟣 MODEL_GAP | Aucune fiche canonique — spécification à produire |
| `AssemblyDecision` | Absent code + dictionnaire | Recherche exhaustive | D-4C4-WEB-06 | 🟣 MODEL_GAP | Seul rapprochement : UC label seul (UCX5-01) |
| `Vote` | Implémenté, mais autonome | Code (rang 5) | D-4C4-WEB-07 | 🟡 DECISION_REQUIRED | SOURCE_CONFLICT à 3 voies sur la FK cible |
| `VoteOption` | Absent | Recherche exhaustive | D-4C4-WEB-10 | 🟣 MODEL_GAP | Dépend de D-4C4-WEB-07 |
| `MemberVote` | Absent | Recherche exhaustive | D-4C4-WEB-10 | 🟣 MODEL_GAP | Dépend de D-4C4-WEB-07 |
| Vote FK | Aucune (code autonome) | Dictionnaire vs rang 2 vs mandat | D-4C4-WEB-07 | 🟡 DECISION_REQUIRED | Couplé à D-4C4-WEB-01 |
| Decision → Vote | Aucune relation physique (les deux entités absentes) | Mandat seul, non corroboré | D-4C4-WEB-08 | 🟡 DECISION_REQUIRED | Aucune alternative documentée existante |
| tenant_id AssemblyDecision | N/A (entité absente) | Mandat (structure cible) | D-4C4-WEB-09 | 🟡 DECISION_REQUIRED | Redondance potentielle avec `meeting_id` |
| RBAC | Catalogue existant, jamais étendu par sous-entité | Code (rang 5) | D-4C4-WEB-… (aucune numérotée séparément, cf. §18) | 🟢 GO (sous réserve) | Cohérent par pattern, non confirmé formellement pour les entités absentes |
| Tenant isolation (Meeting/Attendance) | Structurelle, testée | Code (rang 5) | — | 🟢 GO | Prouvé |
| Tenant isolation (reste) | N/A | — | Dépend de D-4C4-WEB-05/06/07/09/10 | 🟣 MODEL_GAP | Rien à isoler, rien n'existe |
| Offline / Mobile | Aucun code Governance côté Mobile | Recherche exhaustive (audit précédent) | — | ⚪ OUT_OF_SCOPE (pour l'instant) | Infrastructure générique prouvée réutilisable, mais rien à migrer aujourd'hui |

## 22. Decision Required

`D-4C4-WEB-01` (migration GeneralAssembly), `D-4C4-WEB-02` (Meeting.type), `D-4C4-WEB-03` (eligibility), `D-4C4-WEB-04` (quorum), `D-4C4-WEB-05` (QuorumSnapshot), `D-4C4-WEB-06` (AssemblyDecision), `D-4C4-WEB-07` (Vote FK), `D-4C4-WEB-08` (Decision → Vote), `D-4C4-WEB-09` (tenant_id AssemblyDecision), `D-4C4-WEB-10` (VoteOption/MemberVote). **10/10 décisions ouvertes.**

## 23. Recommendations

Aucune décision n'est arbitrée par ce document — seules des observations de cohérence interne sont signalées pour éclairer, jamais pour trancher :
- D-4C4-WEB-02 (Meeting.type) est un préalable technique simple et à faible risque à quasiment toutes les autres décisions — il n'engage aucun choix produit contesté.
- D-4C4-WEB-01 et D-4C4-WEB-07 sont couplées : le choix de FK pour `Vote` dépend directement du sort réservé à `GeneralAssembly`.
- D-4C4-WEB-03 (eligibility) est la décision au plus grand impact de modélisation (`Member`) et devrait être tranchée tôt, car elle conditionne D-4C4-WEB-04 et donc D-4C4-WEB-05.
- D-4C4-WEB-05 et D-4C4-WEB-06 nécessitent une spécification de champs (pas seulement une validation d'option) avant de pouvoir être closes — contrairement aux autres décisions, il n'y a pas d'options A/B/C prêtes à choisir, il y a un schéma à produire.

## 24. Conditions for Implementation GO

    [ ] D-4C4-WEB-01 (GeneralAssembly migration) validée
    [ ] D-4C4-WEB-02 (Meeting.type) validée
    [ ] D-4C4-WEB-03 (Eligibility) validée
    [ ] D-4C4-WEB-04 (Quorum) validée
    [ ] D-4C4-WEB-05 (QuorumSnapshot — modèle) validée
    [ ] D-4C4-WEB-06 (AssemblyDecision — modèle) validée
    [ ] D-4C4-WEB-07 (Vote FK) validée
    [ ] D-4C4-WEB-08 (Decision → Vote) validée
    [ ] D-4C4-WEB-09 (tenant_id AssemblyDecision) validée
    [ ] D-4C4-WEB-10 (VoteOption/MemberVote) validée

Déjà GO, non conditionnées :

    [x] Meeting.status
    [x] Attendance

Aucune de ces 10 décisions n'est validée à l'issue de ce document.

## 25. Files inspected

Voir §2. Aucune nouvelle recherche de code au-delà de ce qui avait déjà été établi par `docs/PHASE_4C4_GENERAL_ASSEMBLY_MEETING_TYPE_IMPACT_AUDIT.md` — ce Decision Gate reformule et formalise, il ne réaudite pas depuis zéro (conformément à son mandat).

## 26. Files modified

    AUCUNE MODIFICATION DE CODE

Seul fichier créé par cette mission : `docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md`.

## 27. Git

`git status --short` avant/après identique à l'exception de la création de ce rapport.

    Aucun commit
    Aucun push
