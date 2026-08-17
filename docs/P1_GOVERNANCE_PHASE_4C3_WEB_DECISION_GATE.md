# TANZEN — P1 Governance — Phase 4C-3 — Web Decision Gate

**Statut : AUDIT DÉCISIONNEL READ-ONLY.** Aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `routes/`, `navigation/`, `locales/`, `config/` n'a été modifié, créé ou supprimé pour produire ce document. Ce rapport est le seul fichier créé par cette mission. `tanzen-mobile` et `tanzen-commercial` n'ont pas été touchés. Aucun commit, aucun push n'ont été effectués par cette mission.

---

## 1. Mandat

Réaliser un audit décisionnel READ-ONLY de la Phase 4C-3 Governance côté Web (`tanzen-frontend`) portant sur `Meeting` et `Attendance`, afin de :
- déterminer quel modèle `Meeting` fait foi ;
- déterminer le statut réel d'`Attendance` ;
- identifier les règles métier réellement validées et les permissions RBAC réellement utilisées ;
- déterminer quelles décisions sont suffisamment stabilisées pour envisager un futur portage vers `tanzen-mobile`.

Cette mission n'implémente rien, ne modifie rien, et ne donne pas le GO Mobile.

**Remarque préalable sur le vocabulaire du mandat** : les identifiants `Phase 4C`, `4C-3`, `D-4C3-01/02/03`, `R-2` cités dans le mandat n'existent dans **aucun** document ni fichier de `tanzen-frontend` (recherche exhaustive sur `docs/`, `src/`, zéro occurrence). Le corpus documentaire de ce dépôt utilise une numérotation `PHASE_01` à `PHASE_12` (et `P0_*`/`P1_*` pour les missions plus récentes), jamais de sous-numérotation « 4C ». Ces identifiants sont donc traités comme des labels **introduits par ce mandat**, sans antécédent projet — signalé conformément à la règle « ne pas inventer une convention non documentée » (§4 et §26 du mandat). Les décisions ci-dessous sont numérotées `D-4C3-WEB-0x` en reprenant le vocabulaire du mandat, sans supposer qu'il préexistait.

---

## 2. Sources

### 2.1 Documents effectivement inspectés (docs/)

| Fichier | Rôle pour cet audit |
|---|---|
| `docs/audit/excel_dictionary_dump.txt` | Dictionnaire de données — fiches #18 `meetings`, #19 `attendances` |
| `docs/AUDIT_PHASE_01.md` | Audit initial Use Cases/diagrammes vs code — **porte une note de périmètre critique (§4.1 ci-dessous)** |
| `docs/PHASE_02_DECISIONS_CANONIQUES.md` | Verrouillage sujets 18a (`Meeting.status`), 18b (`Attendance.status`), 18n (double classification Meetings) |
| `docs/PHASE_02_DECISIONS_A_VALIDER.md` | Sujets non tranchés en Phase 2 (aucun sur Meeting/Attendance) |
| `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` | Document de référence unique consolidant Phase 2 |
| `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` | Classification des 21 diagrammes de Use Cases — UC02-12/13/14, UCX1-13, UCX2-19, UCX5-02/05, UC70-17 |
| `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` | Analyse attribut-par-attribut du diagramme `DC_TANZEN_Réunions_et_présences.png` |
| `docs/PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` | Rapport d'implémentation Phase 6 (Meeting create + publish minutes livrés) |
| `docs/PHASE_06_DECISIONS_A_VALIDER.md` | **Source A de la contradiction Attendance** (§5 : BLOQUANT) |
| `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` | **Source B de la contradiction Attendance** (ligne 19 : PARTIALLY_IMPLEMENTED) ; contient aussi la règle de priorité des sources (§6) |
| `docs/COMPLETE_DATA_DICTIONARY_EXECUTIVE_SUMMARY.md` | Résumé exécutif du même audit |
| `docs/P1_GOVERNANCE_GENERAL_ASSEMBLY_IMPLEMENTATION_REPORT.md` | Mission P1 voisine (GeneralAssembly), référence RBAC governance.read/create |
| `docs/PHASE_12_INTEGRATION_TRANSVERSALE_TESTS.md` | Confirme non-réouverture du sujet Attendance en Phase 12 |

Documents cherchés mais **non trouvés** : aucun fichier nommé `PHASE_4C*`, `D-4C3*`. Aucun document `Use Case` détaillé (préconditions/scénarios/postconditions) au niveau bulle individuelle — confirmé absent par `PHASE_04_USE_CASE_CLASSIFICATION.md` lui-même (§9).

### 2.2 Code/fichiers effectivement inspectés (src/)

`src/mocks/organization/governance.ts` · `src/services/organization.service.ts` · `src/services/organization.service.test.ts` · `src/features/organization/organization-module.tsx` · `src/config/navigation.ts` · `src/mocks/rbac.mocks.ts` · `src/components/permission-gate.tsx` · `src/routes/permission-route.tsx` · `src/contexts/permission-context.tsx` · `src/mocks/organization/general-assemblies.ts` (pour contraste) · recherche exhaustive (grep) sur tout `src/`, `mocks/`, `services/`, `tests/` pour `Attendance|attendance|présence|Presence`.

---

## 3. Hiérarchie des sources

**Convention officielle trouvée** — `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` §6, *« Règles de priorité appliquées en cas de divergence »* (document le plus récent et le plus détaillé du corpus sur ce point, committé le 2026-08-16 dans le commit `3a702f0`) :

> 1. Décision explicitement validée par le PO.
> 2. `PHASE_02_MODELE_CANONIQUE_FINAL.md`.
> 3. Cas d'usage classifiés et validés (`PHASE_04_USE_CASE_CLASSIFICATION.md`).
> 4. Diagrammes de classes/séquences.
> 5. Implémentation actuelle (code).
> 6. Dictionnaire Excel — *« ne provoque jamais automatiquement une nouvelle implémentation ; il sert de référentiel de champs, pas d'ordre de développement »*.

Cette règle est explicitement appliquée par ce même document à ses propres constats (§12, ex. C1 : *« Le code (source 5) prévaut tant qu'aucune décision (source 1) ne tranche »*).

**Deuxième convention trouvée** (locale, portée plus étroite) — `PHASE_02_MODELE_CANONIQUE_FINAL.md` header : *« Il consolide `AUDIT_PHASE_01.md`, `PHASE_02_DECISIONS_CANONIQUES.md`, `PHASE_02_DECISIONS_A_VALIDER.md`... En cas de divergence future, ce document prévaut sur les trois précédents. »*

Ces deux règles sont cohérentes entre elles (`PHASE_02_MODELE_CANONIQUE_FINAL.md` occupe le rang 2 dans la règle générale). **Aucune règle officielle ne classe les documents d'audit ultérieurs entre eux** (ex. `PHASE_06_DECISIONS_A_VALIDER.md` vs `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md`, tous deux de facto rang 5 — « implémentation actuelle » constatée à des moments différents) : GAP signalé, traité en §17.

**IMPORTANT — limite de périmètre découverte sur la source rang 4/5** : `docs/AUDIT_PHASE_01.md` (base de `PHASE_02_DECISIONS_CANONIQUES.md`, donc indirectement de `PHASE_02_MODELE_CANONIQUE_FINAL.md`, rang 2) déclare explicitement en ligne 9 :

> « **Note sur le périmètre analysé** : les sources documentaires... proviennent de `tanzen-frontend-claude/docs`... **Le code frontend comparé (`src/`) est celui de `tanzen-frontend-claude/src`**, conformément au périmètre demandé pour cette mission. Ce rapport est déposé dans `tanzen-frontend/docs/` pour rester visible dans l'espace de travail ouvert. »

Autrement dit : le verrouillage canonique de `Meeting.status`/`Attendance.status` (sujets 18a/18b, rang 2 dans la hiérarchie) a été établi en comparant le dictionnaire à l'implémentation d'un **dépôt frère** (`tanzen-frontend-claude`), pas à celle de `tanzen-frontend` (ce dépôt, cible de la présente mission). Ceci a un impact direct et majeur sur la Décision D-4C3-WEB-01 (§8). Ce fait est traité comme un GAP de périmètre documentaire, pas comme une invalidation du verrouillage lui-même (le verrouillage dictionnaire reste correct rang 2 pour ce que le dictionnaire prescrit ; ce qui est erroné est l'affirmation annexe « correspondance exacte avec le frontend » **si on l'applique à `tanzen-frontend`**).

---

## 4. Meeting — état réel

**Existe dans `tanzen-frontend`** : type, mock data, service (list/create/update-minutes), route, UI liste, action « publier le PV ». Confirmé par lecture directe de `src/mocks/organization/governance.ts`, `src/services/organization.service.ts`, `src/features/organization/organization-module.tsx`, et testé (`src/services/organization.service.test.ts`).

**N'existe pas** : `status`, `uuid`, `sync_status`, `version`, `created_at`/`updated_at`/`deleted_at`, opération de clôture, opération de suppression, page de détail dédiée.

## 5. Attendance — état réel

**N'existe pas du tout dans `tanzen-frontend`** : aucun type, aucun service, aucune UI, aucune donnée mock, aucun test. Recherche exhaustive (grep insensible à la casse, `Attendance|attendance|Attendances|attendances|Presence|présence`) sur tout `src/` : zéro fichier, zéro symbole correspondant au domaine métier (le seul hit, `src/mocks/rbac.mocks.ts:100`, est un commentaire français sans rapport — *« aucune signification n'est attachée à la présence ou l'absence du suffixe »*, à propos d'un identifiant de rôle).

Le seul proxy existant est `Meeting.participants: number` — un compteur agrégé, sans structure par membre, sans lien `member_id`, sans `status` de présence individuel.

---

## 6. Modèle Meeting

### 6.1 Table de comparaison

| Champ | Dictionnaire (fiche #18) | Web actuel (`governance.ts:7`) | UML (`DC_Réunions_et_présences`) | Specs (UC02-12/13/14) | Tests | Décision |
|---|---|---|---|---|---|---|
| `id` | `BIGINT PK` | `id: string` (format `MT-xxx`) | `id PK` | — (non détaillé) | Couvert (list/create/scope) | CANONIQUE (type diffère : string vs bigint, non bloquant côté Web mock) |
| `uuid` | `CHAR(36) UNIQUE` | **ABSENT** | `uuid UQ` | — | — | MODEL-GAP |
| `tenant_id` | `BIGINT NOT NULL FK` | `tenantId: string` (présent, camelCase) | `tenant_id FK` | — | Couvert (ALLOW/DENY tenant scope, `organization.service.test.ts:55-84`) | CANONIQUE (naming convention Web = camelCase partout, non un écart réel) |
| `title` | `VARCHAR(150) NOT NULL` | `title: string` | `title VARCHAR(255)` | UC02-12 (label) | — | CANONIQUE |
| `meeting_date` | `DATE NOT NULL` | `date: string` (nommage différent) | `meeting_date DATE` | — | — | WEB-ONLY (naming) — champ présent, nom différent, DECISION_REQUIRED si alignement de nommage souhaité |
| `description` | absent de la fiche dictionnaire (le champ métier équivalent est `agenda`, non listé nommément dans la fiche extraite) | `agenda: string` | non listé dans l'extrait attribut du diagramme (§2.7 ne détaille que Meeting) | — | — | WEB-ONLY / MODEL-GAP selon lecture — voir §17 |
| `status` | `VARCHAR(20) DEFAULT 'PLANNED'`, `PLANNED/DONE/CANCELLED/POSTPONED` | **ABSENT** | `status VARCHAR(20) CHECK(planned,ongoing,completed,cancelled)` | UC02-14 « Clôturer une réunion » suppose un statut, mais aucune transition n'est détaillée | Aucun (rien à tester) | **DECISION_REQUIRED** (voir D-4C3-WEB-01) |
| `sync_status` | présent | **ABSENT** | présent | — | — | MODEL-GAP |
| `version` | présent | **ABSENT** | présent | — | — | MODEL-GAP |
| `created_at`/`updated_at` | présents | **ABSENT** | présents | — | — | MODEL-GAP |
| `deleted_at` | présent (soft delete) | **ABSENT** | présent | — | — | MODEL-GAP |
| `location`, `participants`, `minutes` | non couverts par la fiche extraite (`location`/`participants` sont probablement modélisés ailleurs ou implicites ; `minutes`/PV n'apparaît pas dans la fiche `meetings` elle-même) | présents, fonctionnels | non détaillés dans l'extrait §2.7 | UC02-12 (planifier), publication de PV mentionnée dans `PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` | Non testés spécifiquement | WEB-ONLY (fonctionnels, non contredits par une autre source, pas de conflit) |

### 6.2 Champ par champ — classement demandé (§6 du mandat)

- **CANONIQUE** : `id`, `tenant_id` (`tenantId`), `title`.
- **WEB-ONLY** : `location`, `participants`, `minutes` (fonctionnels, non repris nommément dans les fiches dictionnaire/diagramme inspectées, non contredits).
- **DIAGRAM-ONLY** : aucun champ trouvé qui soit *uniquement* dans le diagramme sans être aussi dans le dictionnaire (le diagramme est cohérent avec le dictionnaire à l'exception des valeurs de `status`, traité comme CONFLIT en §7).
- **LEGACY** : aucun.
- **MODEL-GAP** : `uuid`, `sync_status`, `version`, `created_at`, `updated_at`, `deleted_at` — présents dans dictionnaire et diagramme, absents du code Web.
- **DECISION_REQUIRED** : `status` (voir §7 et D-4C3-WEB-01), et le nommage `date`→`meeting_date` / `agenda`→`description` (alignement cosmétique ou fonctionnel, non tranché par aucune source).

---

## 7. Status de Meeting

**Vocabulaire canonique (dictionnaire, rang 6, et Phase 2 verrouillage, rang 2)** : `PLANNED, DONE, CANCELLED, POSTPONED` (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 18a, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §3).

**Vocabulaire diagramme UML** : `CHECK(planned, ongoing, completed, cancelled)` — 4 valeurs mais différentes (`ongoing`/`completed` au lieu de `DONE`/`POSTPONED`), déjà noté CONFLIT dans `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18a et tranché en faveur du dictionnaire.

**Vocabulaire Web réel** : **AUCUN** — le type `Meeting` n'a pas de champ `status` (`src/mocks/organization/governance.ts:7`). Aucune transition, aucune UI de clôture/annulation/report n'existe.

**Conséquence factuelle** : l'affirmation de `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18a — *« le champ `status` a pour description... correspondance exacte avec le frontend »* et *« Impact frontend : aucun »* — est exacte pour le dépôt qu'`AUDIT_PHASE_01.md` a réellement comparé (`tanzen-frontend-claude`), mais **ne décrit pas l'état réel de `tanzen-frontend`** (ce dépôt), où le champ est absent. Ce n'est pas une invention de règle par cette mission ; c'est un constat de désalignement entre le document canonique et le code de *ce* dépôt, dû au périmètre de l'audit source (§3).

**Transitions** : aucune source (dictionnaire, diagramme, UC) ne définit de règles de transition entre les 4 valeurs de statut (ex. peut-on repasser de `CANCELLED` à `PLANNED` ?). → **DECISION_REQUIRED**, indépendamment du sujet précédent.

---

## 8. Décision D-4C3-WEB-01 — Réconciliation du modèle Meeting

### Question
Quel modèle `Meeting` doit être considéré comme canonique pour la suite du projet et un futur portage Mobile ?

### Options

**Option A — Alignement strict sur le dictionnaire**
Ajouter à `Meeting` : `uuid`, `status` (`PLANNED/DONE/CANCELLED/POSTPONED`), `sync_status`, `version`, `created_at`/`updated_at`/`deleted_at` ; renommer `date`→`meeting_date`, envisager `agenda`→`description` (ou clarifier que ce sont deux champs distincts, voir §17).
- *Avantages* : conformité totale au rang-6 (dictionnaire) et au rang-2 (verrouillage Phase 2) ; prépare directement le portage Mobile (le modèle SQLite Mobile visera vraisemblablement les mêmes champs).
- *Inconvénients* : modification structurelle de `Meeting` (type + 4 mocks + service + UI liste/formulaire) alors que le mandat interdit toute implémentation dans cette mission ; introduit un champ `status` sans que ses transitions soient définies (§7) — risque de statut mort ou incohérent tant que la règle métier n'est pas tranchée séparément.
- *Impact Web* : modification de `src/mocks/organization/governance.ts`, `src/services/organization.service.ts`, `src/features/organization/organization-module.tsx`, tests.
- *Impact Mobile* : aligne directement le futur modèle SQLite `meetings` sur le dictionnaire, sans divergence Web/Mobile.
- *Impact Backend* : si un backend existe/est prévu, structure déjà spécifiée (dictionnaire) — pas de nouveau travail de spec.
- *Impact SQLite* : simplifie la synchronisation Mobile (champs `sync_status`/`version` déjà présents côté Web).
- *Impact offline* : `sync_status`/`version` sont des prérequis typiques d'un modèle offline-first ; leur absence Web actuelle n'empêche pas le Mobile de les avoir localement, mais complique la réconciliation Web↔Mobile si le Web ne les émule/n'échange jamais ces champs.
- *Impact tests* : `organization.service.test.ts` doit être étendu (nouveaux champs, nouvelles règles de scope si `status` conditionne des actions).
- *Migration nécessaire* : oui, migration de mock data (4 enregistrements existants) + tout backend réel si déjà écrit contre l'ancien schéma.

**Option B — Conservation du modèle Web actuel**
Ne rien changer ; documenter explicitement que `Meeting` Web reste un sous-ensemble volontairement simplifié (`id, tenantId, title, date, location, participants, agenda, minutes`), sans `status`/`uuid`/`sync_status`/`version`/timestamps.
- *Avantages* : zéro effort, zéro régression ; cohérent avec le principe déjà appliqué à `GeneralAssembly` (périmètre volontairement réduit, documenté explicitement — `organization-module.tsx:331-336`) et à d'autres sujets Phase 6 (ex. `Vote` sans `assemblyId`, sujet 1 de `PHASE_06_DECISIONS_A_VALIDER.md`).
- *Inconvénients* : le Web reste durablement non conforme au rang-2 (verrouillage canonique) et rang-6 (dictionnaire) ; aucune opération de clôture/annulation n'existe alors que UC02-14 (« Clôturer une réunion ») est un Use Case confirmé et classifié ; bloque de facto toute UI de gestion de cycle de vie de réunion.
- *Impact Web* : aucun changement.
- *Impact Mobile* : un futur modèle Mobile devrait soit reproduire le même sous-ensemble réduit (perte de conformité dictionnaire côté Mobile aussi), soit diverger du Web (deux modèles différents pour la même entité selon la plateforme — risque de synchronisation).
- *Impact Backend/SQLite/offline/tests* : aucun changement immédiat, mais reporte indéfiniment la question.
- *Migration nécessaire* : aucune immédiatement — mais dette explicite.

**Option C — Modèle hybride explicitement documenté**
Ajouter uniquement les champs strictement nécessaires à un besoin déjà identifié (ex. `status` pour couvrir UC02-14 « Clôturer une réunion »), sans ajouter `uuid`/`sync_status`/`version`/timestamps tant qu'aucun besoin offline/sync Mobile concret ne les motive ; documenter explicitement l'écart résiduel comme un choix assumé, pas un oubli.
- *Avantages* : débloque la fonctionnalité UC02-14 sans faire porter au Web des champs (`sync_status`, `version`) qui n'ont de sens que dans un contexte offline-first, contexte que le Web ne partage pas nécessairement.
- *Inconvénients* : nécessite quand même une décision produit sur les transitions de `status` (non définies par aucune source, §7) avant toute implémentation ; le modèle reste partiellement non conforme au dictionnaire, donc toujours en écart avec le rang-6.
- *Impact Web* : ajout ciblé (`status` + logique de transition) une fois les transitions décidées.
- *Impact Mobile* : le futur modèle SQLite peut ajouter `uuid`/`sync_status`/`version` localement sans dépendre du Web pour ces champs — c'est un choix cohérent avec la réalité qu'un client offline a des besoins de synchronisation que le Web (toujours connecté, aujourd'hui en mock) n'a pas.
- *Impact Backend/SQLite/offline/tests* : dépend du périmètre exact retenu.
- *Migration nécessaire* : oui, mais limitée au(x) champ(s) retenu(s).

### Analyse

Les faits établis, sans interprétation :
1. Le rang-2 (`PHASE_02_MODELE_CANONIQUE_FINAL.md`) verrouille `Meeting.status = PLANNED/DONE/CANCELLED/POSTPONED` comme CANONIQUE.
2. Ce verrouillage repose sur une comparaison dictionnaire ↔ code qui, par la propre déclaration de sa source (`AUDIT_PHASE_01.md` ligne 9), portait sur le code de `tanzen-frontend-claude`, **pas** sur celui de `tanzen-frontend`.
3. Le code réel de `tanzen-frontend` (ce dépôt, cible de la présente mission) n'a **aucun** champ `status` sur `Meeting`.
4. `PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` (implémentation Phase 6 dans **ce** dépôt) déclare explicitement n'avoir ajouté « aucun nouveau champ » à `Meeting` — la Phase 6 a donc travaillé sur le modèle réduit sans jamais chercher à le réconcilier avec le verrouillage Phase 2.
5. UC02-14 (« Clôturer une réunion ») est un Use Case confirmé et classifié (`PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 94) qui présuppose un statut, mais aucune source ne définit ses transitions.

Il en résulte que le choix entre A/B/C n'est **pas** un simple arbitrage stylistique : c'est une décision produit sur le périmètre fonctionnel réel de `Meeting` (faut-il pouvoir clôturer/annuler une réunion aujourd'hui non fermable ?) combinée à une décision d'architecture (le Web doit-il porter des champs de synchronisation `sync_status`/`version` qui n'ont de sens que pour un client offline ?).

### Recommandation

Recommandation motivée (non imposée) : **Option C**. Elle est la seule qui distingue explicitement (a) un besoin fonctionnel déjà prouvé par un Use Case confirmé (clôturer une réunion) de (b) des champs d'infrastructure offline (`uuid`, `sync_status`, `version`) dont la nécessité côté Web n'est établie par aucune source — les ajouter sans besoin identifié irait à l'encontre du principe « ne pas ajouter un champ uniquement parce qu'il existe dans une autre source » (§6 du mandat). Elle nécessite toutefois, avant toute implémentation, une décision produit séparée sur les transitions de `status` (non couverte par ce document, cf. §26 conditions d'arrêt : « règle métier absente »).

---

## 9. Modèle Attendance

Comme aucune structure `Attendance` n'existe côté Web, il n'y a **pas de champs à compléter par supposition**. Le tableau ci-dessous reporte uniquement ce qui est documenté ailleurs, marqué comme non implémenté côté Web.

| Champ | Dictionnaire (fiche #19) | Web actuel | Statut |
|---|---|---|---|
| `id` | `BIGINT PK` | **ABSENT** | MODEL-GAP (rien à comparer) |
| `uuid` | `CHAR(36) NOT NULL` | **ABSENT** | MODEL-GAP |
| `meeting_id` | `BIGINT NOT NULL FK→meetings.id` | **ABSENT** | MODEL-GAP |
| `member_id` | `BIGINT NOT NULL FK→members.id` | **ABSENT** | MODEL-GAP |
| `status` | `VARCHAR(20) NOT NULL`, `PRESENT/ABSENT/LATE/EXCUSED` | **ABSENT** | MODEL-GAP |
| `penalty_amount` | présent (diagramme uniquement, avec `CHECK(>=0)`) — **tension documentée avec le modèle transverse `Penalty`** (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` NC-03bis) | **ABSENT** | DIAGRAM-ONLY + DECISION_REQUIRED (coexistence non articulée avec `penalties`) |
| `sync_status`, `version` | présents | **ABSENT** | MODEL-GAP |
| `created_at`/`updated_at`/`deleted_at` | présents | **ABSENT** | MODEL-GAP |

### Contraintes identifiées

| Contrainte | Source | Portée | Statut |
|---|---|---|---|
| `uq_attendances_uuid UNIQUE(uuid)` | Dictionnaire fiche #19 | Backend uniquement | Non implémentée (rien côté Web) |
| `uq_attendances_meeting_member UNIQUE(meeting_id, member_id)` | Dictionnaire fiche #19 + confirmée sur diagramme (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §2.7) | Backend/schéma uniquement | Non traduite en règle applicative documentée (voir §11) |
| `ck_attendances_status CHECK(status IN (...))` | Dictionnaire | Backend | Non applicable (pas de champ côté Web) |
| `ck_attendances_penalty CHECK(penalty_amount >= 0)` | Dictionnaire | Backend | Non applicable |
| `meeting_id FK ON DELETE CASCADE`, `member_id FK ON DELETE CASCADE` | Diagramme `DC_Réunions_et_présences` | Backend | Non applicable |

---

## 10. Relation Meeting → Attendance / Member → Attendance

D'après le dictionnaire et le diagramme (aucune implémentation Web à vérifier) :
- `Meeting 1 —— * Attendance` (`meeting_id FK`, `ON DELETE CASCADE` au diagramme).
- `Member 1 —— * Attendance` (`member_id FK`, `ON DELETE CASCADE` au diagramme).

**`tenant_id` sur `Attendance`** : **absent**, confirmé explicitement par `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §2.7 — *« Aucun champ `tenant_id` direct »*. L'isolation tenant, si `Attendance` était implémenté, devrait donc être garantie **indirectement** via `Attendance.meeting_id → Meeting.tenant_id`.

**Mécanisme de garantie** : aucun code n'existe pour le vérifier (Attendance absent). Par analogie, le mécanisme d'isolation déjà en place pour `Meeting` lui-même (`getTenantScoped`, `src/services/tenant-scope.ts`, utilisé par `updateMeetingMinutes`) illustre le pattern que le projet utilise ailleurs pour ce cas — filtrer/rejeter par comparaison explicite du `tenantId` de la ressource parente, jamais par simple présence d'une FK. Conformément au mandat (§15), une FK seule (`meeting_id`) ne serait *pas* une preuve suffisante d'isolation tenant sans une vérification applicative équivalente à `getTenantScoped`. **DECISION_REQUIRED** avant toute implémentation Attendance : le mécanisme précis (service dédié avec double vérification `meeting.tenantId === tenantId`, ou tout autre) doit être spécifié.

---

## 11. Duplicate Attendance

Le dictionnaire porte `uq_attendances_meeting_member UNIQUE(meeting_id, member_id)` (fiche #19, confirmée diagramme). **Aucun document du corpus ne traduit cette contrainte DB en règle métier applicative documentée** : pas de comportement service décrit (rejet ? upsert ?), pas de comportement UI décrit, pas de test, pas de mention dans un Use Case ou une décision produit. La seule chose affirmée par une source est la contrainte de schéma elle-même.

Conformément au mandat (§11 : *« Ne pas transformer automatiquement UNIQUE en règle métier si aucune source ne le confirme »*) : **DECISION_REQUIRED**. Traité formellement en D-4C3-WEB-04 (§13).

---

## 12. Immutabilité après clôture

**NON DOCUMENTÉ.** Recherche dans le dictionnaire, `PHASE_02_MODELE_CANONIQUE_FINAL.md`, `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, les deux documents Phase 6, les Use Cases classifiés : aucune règle *« Meeting clôturé ⇒ Attendance immuable »* n'est énoncée nulle part. Ni le service, ni l'UI, ni les tests ne peuvent en porter trace puisque ni `Meeting.status` ni `Attendance` n'existent dans le code de ce dépôt. Classé **NON DOCUMENTÉ**, traité en D-4C3-WEB-03 (§12/§21 du mandat).

---

## 13. Saisie de présence

**NON DOCUMENTÉ / DOCUMENTATION_GAP.** Aucune source ne décrit de modalité de création des enregistrements `Attendance` (saisie individuelle, saisie en masse, import, automatique). La seule affirmation trouvée porte sur l'*absence* de mécanisme : `PHASE_06_DECISIONS_A_VALIDER.md` §5 — *« Le compteur `participants` existant reste modifiable uniquement via les formulaires de création livrés dans cette phase (valeur numérique globale), pas via une liste de présence nominative. »* L'identifiant « R-2 » cité dans le mandat n'apparaît dans aucune source du corpus (confirmé §1, remarque préalable).

---

## 14. RBAC

### 14.1 Catalogue réel (`src/mocks/rbac.mocks.ts:55`)

```
'governance.read', 'governance.create', 'governance.approve', 'governance.update', 'governance.delete'
```

Aucune permission `meeting.*`, `meetings.*`, `attendance.*` ou `attendances.*` n'existe dans le catalogue ni ailleurs dans `src/` (confirmé par grep exhaustif).

### 14.2 Usage réel par permission

| Permission | Existe ? | Utilisée ? | Où | Quelle action | Quel(s) rôle(s) |
|---|---|---|---|---|---|
| `governance.read` | Oui | Oui, mais **pas pour Meeting** | `PermissionRoute` sur `governance/general-assemblies` (liste+détail) uniquement | Garde de route (redirection si refusé) | `role-admin`, `role-manager`, `role-viewer` (tous — permission `.read`) |
| `governance.create` | Oui | Oui, pour Meeting **et** Assembly/Vote/BoardMember indifféremment | `PermissionGate` dans `GovernanceTableShell` (bouton « créer », partagé par les 4 `kind`) ; `PermissionRoute` sur `governance/general-assemblies/create` | Masquage UI (bouton) + garde de route (GeneralAssembly seulement) | `role-admin`, `role-manager` |
| `governance.approve` | Oui | Oui, pour Meeting (publier PV), Vote (publier résultat), BoardMember (clôturer mandat) — même permission pour 3 actions distinctes | `PermissionGate` (masquage bouton uniquement, `organization-module.tsx:271,289,307`) | Masquage UI uniquement, **pas de garde de route** (l'action passe par un `ConfirmDialog` dans la même page) | `role-admin` seulement (exclue de `role-manager`) |
| `governance.update` | Oui, déclarée | **Jamais référencée** ailleurs dans `src/` | — | — | Permission morte |
| `governance.delete` | Oui, déclarée | **Jamais référencée** ailleurs dans `src/` (cohérent : aucune opération de suppression Meeting/Assembly/Vote/BoardMember n'existe) | — | — | Permission morte |

### 14.3 Garde de route Meeting

La route `governance/meetings` (`organization-module.tsx:419`) **n'est pas enveloppée dans `PermissionRoute`**, contrairement à `governance/general-assemblies*` (lignes 422-424). Elle est donc accessible à tout utilisateur authentifié, indépendamment de `governance.read` — seuls les boutons « créer » et « publier le PV » sont masqués côté client selon la permission. `src/config/navigation.ts` ne porte par ailleurs aucun champ `permission` sur ses entrées : la navigation n'est jamais filtrée par RBAC dans ce fichier.

### 14.4 Cohérence documentaire

`PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` §8 décrit un mapping à **3** verbes (« `governance.read`/`create`/`approve`, sans `update`/`delete` séparés ») pour les actions livrées en Phase 6 — cohérent avec l'usage réel constaté (§14.2), `governance.update`/`governance.delete` n'étant effectivement jamais utilisés pour Meeting/Assembly/Vote/BoardMember. Le catalogue (`rbac.mocks.ts`) porte néanmoins bien 5 verbes déclarés — la Phase 6 décrit un sous-ensemble *utilisé*, pas le catalogue complet. Pas de contradiction réelle une fois la distinction faite entre « déclaré » et « utilisé ».

Aucune permission `meeting.*`/`attendance.*` distincte n'existe ni n'est recommandée par aucune source — traité en D-4C3-WEB-05 (§14).

---

## 15. Use Cases

Labels et acteurs confirmés (`PHASE_04_USE_CASE_CLASSIFICATION.md`), sans détail scénario/précondition/postcondition (absence systémique confirmée par le document lui-même, §9 : *« Aucun des 21 diagrammes ne porte, sur une bulle individuelle... préconditions... scénarios... exceptions... postconditions — absentes partout »*) :

| UC ID | Titre | Contexte | Acteur(s) | Ressource | Statut classification |
|---|---|---|---|---|---|
| UC02-12 | Planifier une réunion | TENANT / Operations | Administrateur Tenant | `Meeting` | Confirmé |
| UC02-13 | Gérer les présences | TENANT / Operations | Administrateur Tenant | `Attendance` | Confirmé |
| UC02-14 | Clôturer une réunion | TENANT / Operations | Administrateur Tenant | `Meeting` | Confirmé |
| UCX1-13 | Participer aux réunions | TENANT / Operations | Candidat/Membre, Trésorier, Secrétaire | `Attendance` | Confirmé |
| UCX2-19 | Organiser une réunion | TENANT / Operations | Membre, Secretary | `Meeting` (dépend Tontines) | Confirmé |
| UCX5-02 | Planifier une réunion ou une AG | TENANT | Admin Tenant (`«include»`→Ordre du jour) | `Meeting`, `GeneralAssembly` | Confirmé |
| UCX5-05 | Enregistrer les présences | TENANT | Admin Tenant, Membre (`«include»`×2→Votes) | `Attendance` | Confirmé |
| UC70-17 | Détecter une absence | Transversal | Planificateur | `Attendance` (dépendance Operations) | Confirmé |

**Constat de classification** (§16 du mandat — Meeting/Attendance sous « Operations » dans les UC, pas « Governance ») : cohérent avec `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18n (D-08), qui documente la même tension (Meetings classé « Organisation »/Member Core par les UC/nav vs « Governance Module » par le dictionnaire/Architecture_globale) et tranche explicitement en faveur du statu quo (« conserver Meetings/Attendances sous Member Core dans le frontend actuel »), qualifiée **NON BLOQUANT — à surveiller**.

Aucun des 8 UC ci-dessus ne définit formellement Create/Read/Update/Delete/Close pour Meeting ou Attendance au-delà du libellé de la bulle — les colonnes Create/Read/Update/Delete/Close demandées par le mandat (§16 in fine) ne peuvent donc être remplies que par déduction depuis le code réel (§16 ci-dessous), pas depuis les Use Cases eux-mêmes.

---

## 16. Implémentation Web

### 16.1 Meeting

| Fonctionnalité | Statut | Preuve |
|---|---|---|
| Create | IMPLEMENTED | `organizationService.createMeeting` (`organization.service.ts:74-79`), formulaire `ConfirmDialog` (`organization-module.tsx:274-281`) |
| Read (liste) | IMPLEMENTED | `listMeetings` + `GovernanceTablePage kind="meetings"` |
| Read (détail) | ABSENT | Aucune route `governance/meetings/:id`, aucun composant détail |
| Update | PARTIAL | Seul `updateMeetingMinutes` existe (met à jour le champ `minutes` uniquement) ; aucune modification des autres champs (titre, date, lieu, agenda) après création |
| Delete | ABSENT | Aucune méthode, aucune UI |
| Close | ABSENT | Pas de champ `status`, donc pas d'opération de clôture possible |
| Publish minutes | IMPLEMENTED | `updateMeetingMinutes` + UI dédiée, gardée par `governance.approve` |

### 16.2 Attendance

Toutes les fonctionnalités (Create/Read/Update/Delete/Close) : **ABSENT**, confirmé explicitement — aucune trace de code, aucun mock, aucun test (§5, §9).

---

## 17. Contradictions

| Sujet | Source A | Source B | Contradiction | Impact | Décision nécessaire |
|---|---|---|---|---|---|
| Statut Attendance | `PHASE_06_DECISIONS_A_VALIDER.md` §5 : **BLOQUANT — MOCK DATA REQUIRED** (2026-08-16, commit `36a6338`) | `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 88/294 : **PARTIALLY_IMPLEMENTED, COMPLÉTER, sans blocage** (2026-08-16, commit `3a702f0`, postérieur) | Même fait constaté (compteur agrégé, pas de structure par membre) mais **cadrage produit opposé** : « nécessite une décision préalable » vs « peut être complété sans décision préalable » | Détermine si Attendance peut démarrer en implémentation directement ou doit d'abord repasser par un arbitrage PO | **Oui** — voir D-4C3-WEB-02 |
| Modèle Meeting (`status`, `uuid`, etc.) | `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) : `Meeting.status` CANONIQUE, « Impact frontend : aucun » | Code réel `tanzen-frontend` (rang 5) : `Meeting` n'a pas de `status` | Le verrouillage rang-2 repose sur une comparaison faite contre un **autre** dépôt (`tanzen-frontend-claude`, cf. §3) ; il ne décrit pas l'état réel de ce dépôt | Bloque toute UI de clôture de réunion (UC02-14) tant que non résolu | **Oui** — voir D-4C3-WEB-01 |
| Classification Meetings/Attendances (domaine) | UC/`nav-items` : Organisation / Member Core | Dictionnaire (titre fiche #19 « Core Governance Module ») / Architecture_globale | Double rattachement documentaire, déjà noté et tranché **NON BLOQUANT** par `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18n | Risque de duplication d'écran si le domaine Gouvernance recrée Meetings/Attendances au lieu de réutiliser l'existant | Non — déjà arbitré (statu quo, vigilance requise) |
| Catalogue RBAC governance (nombre de verbes) | `PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` §8 : mapping à 3 verbes utilisés (`read/create/approve`) | Catalogue réel (`rbac.mocks.ts`) : 5 verbes déclarés (`read/create/approve/update/delete`) | Apparente mais non réelle — la Phase 6 décrit l'usage effectif, pas le catalogue déclaré ; `update`/`delete` sont déclarés mais jamais utilisés pour Governance (confirmé §14.2) | Aucun si la distinction déclaré/utilisé est actée explicitement | Non — clarification documentaire suffit |
| Immutabilité Attendance après clôture | Aucune source ne l'affirme | Aucune source ne l'infirme | Absence totale de règle, pas une contradiction entre deux affirmations | Bloque toute implémentation Attendance qui présupposerait un verrou | **Oui** — voir D-4C3-WEB-03 |
| Idempotence / duplicate Attendance | Contrainte DB documentée (dictionnaire) | Aucun comportement applicatif documenté | Écart entre contrainte de schéma et règle métier | Bloque le choix d'implémentation (rejet vs upsert) | **Oui** — voir D-4C3-WEB-04 |

---

## 18. D-4C3-WEB-01 — Meeting Model

*(Détail complet en §8 ci-dessus.)*

### Question
Quel modèle `Meeting` retenir pour la suite (Web) et un futur portage Mobile ?

### Options
A. Alignement strict dictionnaire · B. Conservation du modèle Web actuel · C. Hybride ciblé (ajout du strict nécessaire, ex. `status` pour UC02-14, sans champs offline non justifiés).

### Analyse
Le verrouillage canonique existant (rang 2) a été établi sur un autre dépôt ; le code réel de `tanzen-frontend` n'a pas les champs verrouillés ; un Use Case confirmé (UC02-14) présuppose un `status` sans que ses transitions soient définies.

### Recommandation
Option C, sous réserve d'une décision produit séparée sur les transitions de `Meeting.status` avant toute implémentation.

---

## 19. D-4C3-WEB-02 — Attendance Status

### Question
Attendance doit-il être considéré comme A. ABSENT/BLOQUANT, B. PARTIALLY_IMPLEMENTED/À COMPLÉTER, C. IMPLEMENTED, D. SPECIFICATION ONLY, ou E. AUTRE ?

### Options — analyse par source

| Source | Date/commit | Affirmation | Preuve | Portée |
|---|---|---|---|---|
| `PHASE_06_DECISIONS_A_VALIDER.md` §5 | 2026-08-16, commit `36a6338` (commit d'initialisation) | BLOQUANT — MOCK DATA REQUIRED | Constat : `Meeting`/`Assembly` n'ont qu'un compteur agrégé `participants`, aucune structure par membre ; UCX5-05 suppose une liste nominative | Scope explicite : la fonctionnalité UCX5-05 (liste de présence nominative) dans le cadre de la Phase 6 |
| `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 88 | 2026-08-16, commit `3a702f0` (postérieur, « version stable ») | PARTIALLY_IMPLEMENTED, COMPLÉTER, priorité HIGH, « sans blocage » | Même constat factuel (« Compteur agrégé | Pas de structure par membre »), explicitement rattaché : « Connu depuis Phase 6-8 » | Scope système entier, taxonomie à 6 valeurs (`IMPLEMENTED/PARTIALLY_IMPLEMENTED/MISSING/BACKEND_PENDING/DECISION_REQUIRED/...`), across 3 projets |

**Fait vérifié indépendamment (cette mission)** : le code réel confirme le constat factuel commun aux deux sources — `participants: number` agrégé, aucune structure `Attendance`. Ce point n'est **pas** en contradiction ; c'est le seul point que les deux documents affirment identiquement.

### Analyse
La divergence porte uniquement sur le **cadrage produit** : Phase 6 traite l'absence de structure nominative comme bloquant *la construction de cette fonctionnalité précise sans décision produit préalable* (cohérent avec la posture générale de Phase 6, qui refuse explicitement d'inventer un modèle de données non spécifié — même traitement appliqué à `Committee` et au catalogue de postes dans le même document). L'audit dictionnaire la traite comme un item « COMPLÉTER » ne nécessitant *pas* de décision préalable, dans une taxonomie où « DECISION_REQUIRED » est une catégorie séparée qu'il n'a pas retenue pour ce cas. Aucune des deux sources n'est rang 1-4 dans la hiérarchie (§3) ; les deux sont des constats d'implémentation (rang 5 de facto). La règle de priorité documentée ne fournit pas de départage explicite entre deux documents de même rang à des dates différentes.

### Recommandation
Ni « choisir » A, B, C, D ou E par extrapolation, ni trancher automatiquement en faveur du document le plus récent (ce serait une règle de gouvernance non documentée, proscrite par le mandat §4). Le **fait** est non ambigu et vérifié par le code : Attendance = **ABSENT** au sens strict (aucune structure par membre, aucune ligne de code). Le désaccord Phase 6 / audit dictionnaire porte sur un jugement produit (faut-il un arbitrage PO avant de coder, ou peut-on compléter directement ?) que ni l'un ni l'autre document n'a l'autorité de trancher seul (aucun n'est une « décision explicitement validée par le PO », rang 1). **DECISION_REQUIRED** : le PO doit choisir explicitement entre le cadrage Phase 6 (traiter Attendance comme nécessitant un arbitrage produit avant toute implémentation — un modèle de données par membre reste, par nature, un choix structurel comme `Committee` ou le catalogue de postes) et le cadrage de l'audit dictionnaire (le compléter directement comme un gap technique pur). Cette mission recommande, par cohérence avec le traitement déjà réservé à `Committee` et au catalogue de postes (mêmes critères : classe absente de tout le code et de tous les diagrammes, nécessitant une structure de données non spécifiée), de retenir le cadrage Phase 6 — Attendance touche directement au moins deux autres décisions non tranchées (D-4C3-WEB-03 immutabilité, D-4C3-WEB-04 idempotence) qui doivent de toute façon être arbitrées avant qu'un modèle de données complet puisse être écrit.

---

## 20. D-4C3-WEB-03 — Attendance Immutability

### Question
Un `Attendance` doit-il devenir immuable après clôture du `Meeting` associé ?

### Options
A. Immuable après clôture (aucune modification possible une fois `Meeting.status ∈ {DONE, CANCELLED, POSTPONED}`) · B. Modification autorisée avec permission spécifique (ex. `governance.approve` ou une permission dédiée) · C. Autre (ex. immuable seulement pour `status`, `penalty_amount` restant modifiable séparément pour corriger une pénalité).

### Analyse
Aucune source ne documente cette règle dans un sens ou dans l'autre (§12). Ce n'est donc pas une contradiction à arbitrer entre sources, mais un vide total. Une règle d'immutabilité est cependant une pratique courante pour ce type d'entité (traçabilité d'assiduité) et serait cohérente avec le fait que `Meeting.status` inclut déjà `CANCELLED`/`POSTPONED` (états définitifs) dans le verrouillage canonique — mais l'affirmer serait inventer une règle métier non documentée, proscrit explicitement par le mandat (§12, §21).

### Recommandation
Ne pas choisir automatiquement. **DECISION_REQUIRED**, à trancher par le PO en même temps que D-4C3-WEB-01 (puisque l'immutabilité présuppose l'existence de `Meeting.status`, lui-même non tranché).

---

## 21. D-4C3-WEB-04 — Attendance Idempotence

### Question
Comment traiter `UNIQUE(meeting_id, member_id)` au niveau applicatif ?

### Options
A. Duplicate explicite (rejet avec message d'erreur métier dédié « DUPLICATE_ATTENDANCE ») · B. Upsert (une nouvelle saisie pour le même couple `meeting_id`/`member_id` remplace silencieusement la précédente) · C. Rejet générique (erreur de contrainte DB non traduite en message métier).

### Analyse
- *UX* : Option A est la plus explicite pour l'utilisateur mais nécessite un code d'erreur métier qu'aucune source ne définit aujourd'hui. Option B est plus tolérante à la ressaisie (utile si la présence peut être corrigée par un secrétaire après coup) mais masque une éventuelle erreur de double-saisie. Option C est la plus pauvre en UX.
- *Offline* : si la saisie de présence doit un jour être faite hors-ligne (Mobile), l'idempotence (Option B, upsert basé sur `meeting_id`+`member_id`) est generalement préférable à un rejet strict (Option A/C), car elle tolère nativement les rejeux de synchronisation (une même saisie envoyée deux fois par erreur réseau ne doit pas produire une erreur visible).
- *Synchronisation/concurrence* : un modèle offline-first avec `sync_status`/`version` (déjà prévus au dictionnaire pour `Attendance`) suggère que le projet anticipe des écritures concurrentes/différées — cohérent avec un upsert idempotent plutôt qu'un rejet strict.
- *DB* : la contrainte `UNIQUE(meeting_id, member_id)` existe déjà au niveau schéma (dictionnaire) quelle que soit l'option applicative choisie — elle garantit qu'aucune des trois options ne peut produire deux lignes distinctes pour le même couple, seul le comportement en cas de tentative de doublon diffère.

### Recommandation
Aucune source ne permet de trancher entre A/B/C — **DECISION_REQUIRED**. Élément à considérer par le PO (constat, pas une recommandation) : le contexte offline/sync déjà prévu par le dictionnaire pour cette table (`sync_status`/`version`) rend l'option B (upsert idempotent) structurellement plus compatible avec un futur usage Mobile hors-ligne que les options A/C, mais ceci reste un facteur parmi d'autres (UX, traçabilité d'audit) que seul le PO peut arbitrer.

---

## 22. D-4C3-WEB-05 — Governance RBAC

### Question
Les permissions existantes (`governance.read`/`create`/`approve`, éventuellement `update`/`delete`) suffisent-elles, ou Attendance nécessite-t-il une distinction RBAC propre ?

### Analyse
Le catalogue actuel ne distingue déjà pas Meeting d'Assembly/Vote/BoardMember — les 5 verbes `governance.*` sont partagés indifféremment entre toutes les sous-entités de Governance (§14.2). Aucune source ne recommande ni ne justifie une permission `attendance.*` séparée. Introduire une permission dédiée à Attendance créerait une incohérence avec le pattern déjà en place (un seul groupe de permissions pour tout le domaine Governance) sans qu'aucun besoin métier documenté (ex. « seul le secrétaire peut saisir les présences, pas l'administrateur ») ne le justifie.

Point de vigilance factuel, non résolu ici : `governance.approve` gère aujourd'hui trois actions sans rapport fonctionnel entre elles (publier un PV, publier un résultat de vote, clôturer un mandat) sous un seul verbe — si la saisie de présence est un jour ajoutée, la question de savoir si elle relève de `governance.create` (nouvel enregistrement) ou nécessite un nouveau verbe (ex. une action répétée en masse, différente d'une création unitaire) n'est tranchée par aucune source.

### Recommandation
Ne rien créer (conforme au mandat §14, §22 : *« Ne rien créer. Produire uniquement une recommandation »*). Recommandation : si Attendance est implémenté, réutiliser `governance.create` pour la saisie (cohérent avec le pattern existant), sauf décision produit contraire explicite. Ce point reste **secondaire** tant que D-4C3-WEB-02 (statut réel d'Attendance) n'est pas tranché — inutile de statuer sur le RBAC d'une entité dont l'existence même est encore en question.

---

## 23. Impact Mobile

Pour rappel, `tanzen-mobile` n'a pas été inspecté ni modifié par cette mission (hors périmètre, lecture même non requise par le mandat). L'impact ci-dessous est déduit uniquement des décisions Web ci-dessus, sans supposer un état Mobile particulier.

| Décision | Impact futur Mobile (à anticiper, non à implémenter) |
|---|---|
| D-4C3-WEB-01 (Meeting model) | Si Option A/C retenue : le modèle SQLite Mobile `meetings` peut s'aligner directement sur les mêmes champs que le Web (`status`, éventuellement `uuid`/`sync_status`/`version` si ajoutés) — évite une divergence de schéma entre client Web (mock) et client Mobile (offline réel). Si Option B (statu quo) : le Mobile devra probablement porter `uuid`/`sync_status`/`version` localement même si le Web ne les a jamais (le Mobile a un besoin offline propre que le Web mock n'a pas) — schéma Mobile plus riche que le modèle Web, à documenter explicitement pour éviter toute confusion lors d'un futur audit croisé. |
| D-4C3-WEB-02 (Attendance status) | Détermine si le portage Mobile de Attendance peut démarrer directement (si jugé simple « COMPLÉTER ») ou doit attendre un arbitrage produit (si jugé « BLOQUANT »). Le mandat interdit de préparer du code Mobile dans cette mission — cette décision conditionne seulement la mise à l'agenda d'une future mission Mobile, pas son contenu. |
| D-4C3-WEB-03 (Immutabilité) | Si « immuable après clôture » est retenu : le repository/service Mobile offline doit refuser (ou mettre en file d'attente hors-ligne différemment) toute modification locale d'un `Attendance` dont le `Meeting` parent est déjà `DONE`/`CANCELLED`/`POSTPONED` — implique une logique de validation locale avant écriture en outbox, pas seulement une validation serveur. |
| D-4C3-WEB-04 (Idempotence) | Détermine le comportement de l'outbox Mobile en cas de rejeu réseau : upsert (Option B) est nettement plus simple à implémenter offline-first qu'un rejet applicatif (Option A/C), qui nécessiterait une résolution de conflit explicite côté Mobile lors de la synchronisation. |
| D-4C3-WEB-05 (RBAC) | Si aucune permission dédiée n'est créée (recommandation actuelle), le Mobile réutilise directement le même catalogue `governance.*` déjà répliqué (à vérifier côté Mobile, hors périmètre ici) — pas de nouveau concept RBAC à porter. |
| Tenant isolation (§10) | Le Mobile devra implémenter, dans son repository local, le même principe d'isolation indirecte (`attendance.meeting_id → meeting.tenant_id`) que celui recommandé côté Web — non trivial en offline pur si le Meeting parent n'est pas garanti présent en cache local au moment de la saisie. |

---

## 24. Conditions Implementation GO Mobile

Ces conditions ne sont **pas** validées par cette mission (aucun GO Mobile n'est donné ici) — elles listent ce qui resterait à faire côté Web/produit avant qu'une mission Mobile Phase 4C-3 puisse démarrer :

- [ ] D-4C3-WEB-01 (modèle Meeting) tranché par le PO
- [ ] D-4C3-WEB-02 (statut réel Attendance) tranché par le PO
- [ ] Modèle Attendance complet spécifié (si D-4C3-WEB-02 conclut à une implémentation)
- [ ] Relation Meeting/Attendance confirmée en code (actuellement seulement documentaire)
- [ ] Isolation tenant d'Attendance confirmée par un mécanisme applicatif (pas seulement une FK)
- [ ] D-4C3-WEB-03 (immutabilité) tranché
- [ ] D-4C3-WEB-04 (idempotence) tranché
- [ ] D-4C3-WEB-05 (RBAC) confirmé (recommandation actuelle : pas de nouvelle permission)
- [ ] Tests de référence Web disponibles pour Meeting/Attendance (aujourd'hui : seuls les tests d'isolation tenant de `Meeting` existent, aucun pour un futur `Attendance`)
- [ ] Modèle offline (sync_status/version/outbox) défini pour Attendance, cohérent avec D-4C3-WEB-04

Aucune de ces cases n'est cochée à l'issue de cette mission.

---

## 25. Matrice GO / NO-GO (finale, §29 du mandat)

| Domaine | État | Bloquant | Décision requise | Recommandation |
|---|---|---|---|---|
| Meeting model | Implémenté (sous-ensemble), non conforme au verrouillage canonique | Non (fonctionnel tel quel) | D-4C3-WEB-01 | Option C (hybride ciblé) |
| Meeting status | Absent en code, verrouillé en dictionnaire (mais verrouillage basé sur un autre dépôt) | Oui, pour UC02-14 (clôture) | D-4C3-WEB-01 | Ajouter uniquement si transitions définies par le PO |
| Attendance model | Absent (aucun code) | Oui, pour toute fonctionnalité de présence nominative | D-4C3-WEB-02 puis modélisation complète | Ne pas construire avant arbitrage D-4C3-WEB-02 |
| Attendance status | Contradiction de cadrage (BLOQUANT vs COMPLÉTER), fait sous-jacent non contradictoire | Oui (nature du blocage à trancher) | D-4C3-WEB-02 | Traiter comme nécessitant arbitrage PO (cohérence avec `Committee`/catalogue de postes) |
| Meeting→Attendance | Documentaire seulement (dictionnaire/diagramme), rien en code | Oui | — (découle de D-4C3-WEB-02) | Implémenter seulement après arbitrage Attendance |
| Member→Attendance | Documentaire seulement | Oui | — (idem) | Idem |
| Tenant isolation | Confirmée et testée pour Meeting ; indéterminée pour Attendance (n'existe pas) | Oui pour Attendance | Mécanisme d'isolation indirecte à spécifier | Réutiliser le pattern `getTenantScoped` existant |
| RBAC | Catalogue générique `governance.*`, cohérent, 2 verbes morts (`update`/`delete`), route liste Meeting non gardée | Non bloquant en soi | D-4C3-WEB-05 (mineure) | Ne rien créer ; combler la garde de route manquante est un choix d'implémentation hors périmètre de cet audit |
| Immutabilité | Non documentée | Oui, pour toute implémentation Attendance | D-4C3-WEB-03 | Trancher avant modélisation complète |
| Idempotence | Contrainte DB documentée, comportement applicatif non défini | Oui, pour toute implémentation Attendance | D-4C3-WEB-04 | Upsert recommandé si contexte offline confirmé |
| Web implementation | Meeting : PARTIAL (pas de close/delete/detail) ; Attendance : ABSENT | Oui pour Attendance | — | Cf. ci-dessus |
| Mobile readiness | **NO-GO** — 10/10 conditions de la checklist §24 non remplies | Oui | Toutes les décisions ci-dessus | Ne pas démarrer de mission Mobile Phase 4C-3 avant arbitrage PO complet |

---

## 26. Recommandation finale

**Aucune implémentation Mobile ne doit démarrer avant que le PO ait tranché explicitement D-4C3-WEB-01 à 05.** Le fait le plus important établi par cet audit, non résolu par une simple lecture rapide des documents existants, est que le verrouillage canonique de `Meeting.status` (rang 2 de la hiérarchie documentaire) repose sur une comparaison de code faite contre un dépôt différent (`tanzen-frontend-claude`) — ce verrouillage ne peut donc pas être appliqué tel quel à `tanzen-frontend` sans revalidation. La contradiction de statut Attendance (BLOQUANT vs PARTIALLY_IMPLEMENTED) porte, une fois analysée, sur un désaccord de cadrage produit et non sur un désaccord de fait — les deux documents s'accordent sur l'état réel du code. Attendance reste, au sens strict et vérifié directement dans le code, **entièrement absent** de `tanzen-frontend`.

---

## 27. Fichiers inspectés

Voir §2.1 et §2.2 pour la liste complète. Recherches complémentaires exhaustives (grep) menées sur l'ensemble de `src/`, `mocks/`, `services/`, `tests/`, `docs/` pour les motifs : `Meeting`, `Attendance`, `Governance`, `présence`, `réunion`, `Phase 4C`, `4C-3`, `D-4C3`, `R-2`, `governance.read/create/update/delete/approve`, `UNIQUE(meeting_id`.

## 28. Fichiers modifiés

    AUCUNE MODIFICATION DE CODE

Seul fichier créé par cette mission : `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md`.

## 29. tanzen-mobile

    NON MODIFIÉ (non inspecté — hors périmètre du mandat)

## 30. tanzen-commercial

    NON MODIFIÉ (non inspecté — hors périmètre du mandat)

## 31. Git

`git status --short` avant et après cette mission : identique à l'exception de la création de ce rapport. Les fichiers déjà modifiés/non suivis avant la mission (listés ci-dessous) ont été signalés et laissés strictement intacts par cette mission :

```
 M src/config/navigation.ts
 M src/features/access/access-module.tsx
 M src/features/auth/login-page.tsx
 M src/features/finance/finance-module.tsx
 M src/features/organization/organization-module.tsx
 M src/features/settings/settings-module.tsx
 M src/features/tontines/tontines-module.tsx
 M src/locales/en/index.ts
 M src/locales/fr/index.ts
 M src/mocks/access/users.ts
 M src/mocks/finance/index.ts
 M src/mocks/organization/index.ts
 M src/mocks/rbac.mocks.ts
 M src/services/auth.service.test.ts
 M src/services/auth.service.ts
 M src/services/query-keys.ts
 M src/services/role.service.test.ts
 M src/services/role.service.ts
 M src/services/session.service.test.ts
 M src/services/user.service.test.ts
 M src/services/user.service.ts
 M tsconfig.app.tsbuildinfo
?? docs/LOAN_POLICY_MIGRATION_REPORT.md
?? docs/LOAN_RULES_NORMALIZATION_REPORT.md
?? docs/P0_RBAC_AUDIT.md
?? docs/P0_RBAC_DECISIONS_A_VALIDER.md
?? docs/P0_RBAC_DECISION_ANALYSIS.md
?? docs/P0_RBAC_DECISION_OPTIONS.md
?? docs/P0_RBAC_IMPLEMENTATION_REPORT.md
?? docs/P0_RBAC_REMAINING_AUDIT.md
?? docs/P0_RBAC_REMAINING_DECISIONS_A_VALIDER.md
?? docs/P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md
?? docs/P0_TENANTS_AUDIT.md
?? docs/P0_TENANTS_FINAL_REPORT.md
?? docs/P0_USERS_AUDIT.md
?? docs/P0_USERS_DECISIONS_A_VALIDER.md
?? docs/P0_USERS_IMPLEMENTATION_REPORT.md
?? docs/P1_CREDIT_LOAN_RULES_AUDIT.md
?? docs/P1_CREDIT_LOAN_RULES_DECISION_ANALYSIS.md
?? docs/P1_CREDIT_LOAN_RULES_IMPLEMENTATION_REPORT.md
?? docs/P1_GOVERNANCE_GENERAL_ASSEMBLY_IMPLEMENTATION_REPORT.md
?? src/mocks/finance/loan-rules.ts
?? src/mocks/organization/general-assemblies.ts
?? src/services/general-assembly.service.test.ts
?? src/services/general-assembly.service.ts
?? src/services/loan-rule.service.test.ts
?? src/services/loan-rule.service.ts
```

Aucun commit, aucun push effectués par cette mission.
