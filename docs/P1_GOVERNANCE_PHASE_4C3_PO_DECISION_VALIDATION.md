# P1 GOVERNANCE — PHASE 4C-3
# PO DECISION VALIDATION PACK

**Statut : DOSSIER DE DÉCISION — 🟢 LES 5 DÉCISIONS SONT VALIDÉES.** Validation formalisée par `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md`. Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/`. La mise à jour ci-dessous formalise les décisions déjà prises par le Product Owner ; elle ne les tranche pas et ne donne aucun GO d'implémentation, Web ou Mobile — celui-ci fait l'objet d'un mandat séparé « P1 GOVERNANCE — PHASE 4C-3 — IMPLEMENTATION GO ». `tanzen-mobile` et `tanzen-commercial` n'ont pas été touchés. Aucun commit, aucun push.

---

## 1. Objet

Formaliser, à partir du rapport `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md`, les 5 décisions encore ouvertes de la Phase 4C-3 (Meeting/Attendance/Governance) sous une forme que le Product Owner peut valider directement, sans avoir à relire le code ou les 12+ documents sources. Ce document est un **dossier de décision**, pas une nouvelle analyse : aucun fait nouveau n'y est introduit au-delà de ce que le Decision Gate a déjà établi.

## 2. Contexte

Le Decision Gate (`docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md`) a établi, en lecture seule :
- `Meeting` existe côté Web (liste, création, publication du PV) mais sans `status`/`uuid`/`sync_status`/`version`/timestamps — champs pourtant verrouillés « canoniques » par un audit qui, en réalité, comparait le dictionnaire de données au code d'un **autre** dépôt (`tanzen-frontend-claude`), pas à `tanzen-frontend` (Decision Gate §3, §8).
- `Attendance` est **entièrement absent** du code de `tanzen-frontend` (aucun type, service, UI, mock, test) — confirmé par recherche exhaustive (Decision Gate §5, §9).
- Deux documents donnent un statut contradictoire à Attendance : `PHASE_06_DECISIONS_A_VALIDER.md` (« BLOQUANT ») vs `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` (« PARTIALLY_IMPLEMENTED »). Le Decision Gate a établi que les deux documents s'accordent sur le **fait** (compteur agrégé seulement, aucune structure par membre) et divergent uniquement sur le **cadrage produit** (Decision Gate §17, §19).
- Trois autres sujets (immutabilité, idempotence, granularité RBAC) sont **non documentés** ou **non tranchés** par aucune source du projet.

Ce dossier ne rouvre aucun de ces constats. Il les reformule pour validation.

## 3. Sources utilisées

Source principale : `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` (intégralement, §1 à §31).

Sources secondaires effectivement référencées par le Decision Gate et reprises ici pour la traçabilité de chaque recommandation :
- `docs/audit/excel_dictionary_dump.txt` (fiches #18 `meetings`, #19 `attendances`)
- `docs/AUDIT_PHASE_01.md` (ligne 9 — note de périmètre `tanzen-frontend-claude`)
- `docs/PHASE_02_DECISIONS_CANONIQUES.md` (sujets 18a, 18b, 18n)
- `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (§3)
- `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (UC02-12/13/14, UCX1-13, UCX2-19, UCX5-02/05, UC70-17)
- `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (§2.7, NC-03bis)
- `docs/PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` (§8 RBAC)
- `docs/PHASE_06_DECISIONS_A_VALIDER.md` (§5)
- `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` (§6, ligne 88)
- `src/mocks/organization/governance.ts`, `src/services/organization.service.ts`, `src/features/organization/organization-module.tsx`, `src/mocks/rbac.mocks.ts`, `src/services/organization.service.test.ts` (code réel, cité comme rang 5 de la hiérarchie)

**Conformément au mandat** : aucune information de `tanzen-frontend-claude` n'est réutilisée comme source de décision ici — ce dépôt n'apparaît que comme fait historique expliquant pourquoi le verrouillage canonique de `Meeting.status` ne s'applique pas automatiquement à `tanzen-frontend` (voir §5 ci-dessous). Aucune conversation antérieure non tracée dans les documents ci-dessus n'a été utilisée comme source.

## 4. Hiérarchie des sources

Reprise telle qu'établie par le Decision Gate (§3), elle-même sourcée depuis `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` §6 :

1. Décision explicitement validée par le PO.
2. `PHASE_02_MODELE_CANONIQUE_FINAL.md`.
3. Cas d'usage classifiés et validés (`PHASE_04_USE_CASE_CLASSIFICATION.md`).
4. Diagrammes de classes/séquences.
5. Implémentation actuelle (code).
6. Dictionnaire Excel (référentiel de champs, ne déclenche jamais seul une implémentation).

**Limite déjà signalée par le Decision Gate, rappelée ici** : le rang 2 (`PHASE_02_MODELE_CANONIQUE_FINAL.md`) repose, pour `Meeting.status` spécifiquement, sur un audit (`AUDIT_PHASE_01.md`) qui comparait le dictionnaire au code de `tanzen-frontend-claude`, pas à celui de `tanzen-frontend` — donc le rang 2 ne peut pas être appliqué ici sans revalidation explicite. C'est précisément l'objet de D-4C3-WEB-01.

---

## 5. D-4C3-WEB-01 — Meeting Model

### Question

Quel modèle de `Meeting` doit être retenu comme modèle de référence pour `tanzen-frontend` (et, à terme, pour un futur portage Mobile) ?

### Faits établis

- Le modèle Web actuel (`src/mocks/organization/governance.ts:7`) est : `id, tenantId, title, date, location, participants, agenda, minutes`. Aucun `status`, `uuid`, `sync_status`, `version`, `created_at`/`updated_at`/`deleted_at`.
- Le dictionnaire de données (`docs/audit/excel_dictionary_dump.txt`, fiche #18) et le diagramme de classes `DC_TANZEN_Réunions_et_présences.png` (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §2.7) portent tous les deux ces champs supplémentaires, avec `status` = `PLANNED, DONE, CANCELLED, POSTPONED`.
- Ce vocabulaire de `status` a été verrouillé « CANONIQUE » par `PHASE_02_DECISIONS_CANONIQUES.md` (sujet 18a) et `PHASE_02_MODELE_CANONIQUE_FINAL.md` (§3), avec la mention « Impact frontend : aucun » — **mais cette conclusion a été établie en comparant le dictionnaire au code de `tanzen-frontend-claude`, pas à celui de `tanzen-frontend`** (`AUDIT_PHASE_01.md`, ligne 9 : *« Le code frontend comparé (`src/`) est celui de `tanzen-frontend-claude/src` »*). **Cette découverte doit être prise en compte explicitement, sans en déduire automatiquement que l'écart Web est une erreur** — elle signifie seulement que le verrouillage n'a jamais été validé contre ce dépôt-ci.
- Un Use Case confirmé et classifié, UC02-14 « Clôturer une réunion » (`PHASE_04_USE_CASE_CLASSIFICATION.md`, ligne 94), présuppose l'existence d'un statut de `Meeting` — mais aucune source ne définit ses règles de transition.
- `PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` (implémentation réelle dans ce dépôt) confirme n'avoir ajouté « aucun nouveau champ » à `Meeting` lors de la Phase 6.

### Options

**Option A — Alignement strict sur le dictionnaire**

| | |
|---|---|
| Description | Ajouter à `Meeting` : `uuid`, `status` (`PLANNED/DONE/CANCELLED/POSTPONED`), `sync_status`, `version`, `created_at`/`updated_at`/`deleted_at` ; renommer `date`→`meeting_date`. |
| Champs concernés | `uuid`, `status`, `sync_status`, `version`, `created_at`, `updated_at`, `deleted_at`, `date`→`meeting_date` |
| Impact Web | Modification du type `Meeting`, des 4 enregistrements mock, du service (`organization.service.ts`), de l'UI liste/formulaire (`organization-module.tsx`) |
| Impact Backend | Structure déjà spécifiée par le dictionnaire — pas de nouveau travail de spécification |
| Impact Mobile | Le futur modèle SQLite `meetings` peut s'aligner directement sur le même schéma que le Web — pas de divergence Web/Mobile à gérer |
| Impact SQLite | Simplifie la synchronisation (les champs `sync_status`/`version` existeraient déjà côté Web) |
| Impact Offline | Introduit des champs typiques d'un modèle offline-first côté Web, alors que le Web n'est aujourd'hui pas offline |
| Impact Tests | `organization.service.test.ts` à étendre (nouveaux champs, nouvelles règles de scope si `status` conditionne des actions) |
| Migration éventuelle | Oui — migration des 4 enregistrements mock existants, et de tout backend réel déjà écrit contre l'ancien schéma |
| Avantages | Conformité totale au rang 2 (verrouillage) et au rang 6 (dictionnaire) ; prépare directement le portage Mobile |
| Inconvénients | Modification structurelle non couverte par le périmètre de cette mission (READ-ONLY) ; introduit un `status` sans que ses transitions soient définies — risque de champ mort ou incohérent |
| Risques | Ajouter un champ « parce qu'il existe dans une autre source » sans besoin fonctionnel démontré pour tous les champs (ex. `sync_status`/`version` côté Web non offline) |

**Option B — Conservation du modèle Web actuel**

| | |
|---|---|
| Description | Ne rien changer ; documenter explicitement que `Meeting` reste un sous-ensemble volontairement réduit. |
| Champs concernés | Aucun changement |
| Impact Web | Aucun |
| Impact Backend | Aucun changement immédiat |
| Impact Mobile | Le Mobile devra probablement porter `uuid`/`sync_status`/`version` localement même si le Web ne les a jamais — schéma Mobile plus riche que le modèle Web, à documenter pour éviter toute confusion lors d'un futur audit croisé |
| Impact SQLite | Idem — schéma local Mobile divergent du Web |
| Impact Offline | Aucun changement Web ; le besoin offline resterait entièrement porté par le Mobile |
| Impact Tests | Aucun changement |
| Migration éventuelle | Aucune |
| Avantages | Zéro effort, zéro régression ; cohérent avec le traitement déjà appliqué à `GeneralAssembly` et à `Vote` (périmètre volontairement réduit et documenté, cf. Phase 6) |
| Inconvénients | Le Web reste durablement non conforme aux rangs 2 et 6 ; aucune opération de clôture/annulation de réunion n'est possible alors qu'UC02-14 est un Use Case confirmé ; bloque de facto toute UI de cycle de vie de réunion |
| Risques | Dette documentaire non résolue reportée indéfiniment |

**Option C — Modèle hybride explicitement documenté**

| | |
|---|---|
| Description | Ajouter uniquement les champs strictement nécessaires à un besoin déjà identifié (ex. `status`, pour couvrir UC02-14), sans ajouter `uuid`/`sync_status`/`version`/timestamps tant qu'aucun besoin offline/sync Mobile concret ne les motive côté Web ; documenter l'écart résiduel comme un choix assumé. |
| Champs concernés | `status` uniquement (a minima) |
| Impact Web | Ajout ciblé, une fois les transitions de `status` décidées séparément |
| Impact Backend | Dépend du périmètre exact retenu |
| Impact Mobile | Le futur modèle SQLite peut ajouter `uuid`/`sync_status`/`version` localement sans dépendre du Web pour ces champs — cohérent avec le fait qu'un client offline a des besoins de synchronisation que le Web (aujourd'hui en mock, toujours connecté) n'a pas |
| Impact SQLite | Idem |
| Impact Offline | Le Web ne porte pas de champs offline sans besoin Web démontré ; le Mobile gère ses propres champs de synchronisation localement |
| Impact Tests | Extension ciblée de `organization.service.test.ts` pour `status` uniquement |
| Migration éventuelle | Oui, mais limitée au(x) champ(s) retenu(s) |
| Avantages | Débloque UC02-14 sans imposer au Web des champs d'infrastructure offline non justifiés ; respecte le principe « ne pas ajouter un champ uniquement parce qu'il existe dans une autre source » |
| Inconvénients | Nécessite quand même une décision produit séparée sur les transitions de `status` avant toute implémentation ; le modèle reste partiellement non conforme au dictionnaire |
| Risques | Reporte une partie de la dette (conformité dictionnaire complète) sans la documenter aussi explicitement que l'Option B le ferait pour l'ensemble du modèle |

### Analyse comparative

Le choix n'est pas un simple arbitrage de style : il combine (a) une décision produit sur le périmètre fonctionnel réel de `Meeting` (faut-il pouvoir clôturer/annuler une réunion aujourd'hui non fermable, conformément à UC02-14 ?) et (b) une décision d'architecture (le Web doit-il porter des champs de synchronisation qui n'ont de sens que pour un client offline, alors que le Web est aujourd'hui un client toujours connecté en mock ?). L'Option A résout tout d'un coup mais au prix d'un effort disproportionné par rapport aux besoins démontrés. L'Option B ne résout rien et bloque UC02-14. L'Option C isole le seul besoin fonctionnel prouvé (`status` pour la clôture) du reste (infrastructure offline), sans pour autant trancher elle-même les transitions de `status`, qui restent un sujet distinct.

### Recommandation

```
RECOMMANDATION
──────────────
Option C — modèle hybride ciblé

JUSTIFICATION
─────────────
Seule option qui distingue un besoin fonctionnel déjà prouvé par un Use Case
confirmé (UC02-14, clôturer une réunion) de champs d'infrastructure offline
(uuid, sync_status, version) dont la nécessité côté Web n'est établie par
aucune source. Source : Decision Gate §8 (« Analyse » et « Recommandation »).

STATUT
──────
🟢 VALIDÉE — DÉCISION PO
```

**Périmètre de la décision validée, pour éviter toute extension non demandée** : `Meeting` reçoit uniquement l'ajout ciblé nécessaire à UC02-14 (un champ `status`) ; ceci n'est **pas** un alignement strict sur le dictionnaire, **pas** un ajout automatique de `uuid`/`sync_status`/`version`/timestamps, et **pas** un refactoring global du modèle `Meeting`. Le vocabulaire exact de `status` et ses règles de transition ne sont pas fixés par cette validation — ils restent à spécifier lors du mandat d'implémentation. Voir `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md` §3.1.

### Décision PO

    ☑ Option C
    ☐ Option A
    ☐ Option B
    ☐ Autre / à préciser

    Décision PO :
    Option C — modèle hybride ciblé (ajout ciblé de Meeting.status pour UC02-14
    uniquement, sans alignement complet sur le dictionnaire)

    Commentaire :
    Validée dans le cadre de la clôture du Decision Gate Phase 4C-3
    (docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md). Le détail des
    transitions de status et des champs exacts sera précisé au mandat
    IMPLEMENTATION GO — non implémenté par cette validation elle-même.

---

## 6. D-4C3-WEB-02 — Attendance Status

### Question

Quel doit être le statut métier d'`Attendance` dans le périmètre actuel de TANZEN ?

### Faits établis

- `Attendance` est **absent du code Web** au sens strict : aucun type, service, UI, mock, ou test (vérifié par recherche exhaustive, Decision Gate §5, §9). Le seul proxy existant est `Meeting.participants: number`, un compteur agrégé sans structure par membre.
- `PHASE_06_DECISIONS_A_VALIDER.md` §5 (2026-08-16, commit `36a6338`) qualifie ce sujet **« BLOQUANT — MOCK DATA REQUIRED »**, au motif qu'UCX5-05 (« Enregistrer les présences ») suppose une liste de présence nominative qu'aucune source ne spécifie.
- `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 88 (2026-08-16, commit `3a702f0`, postérieur) qualifie le même fait **« PARTIALLY_IMPLEMENTED »**, priorité HIGH, **« COMPLÉTER, sans blocage »**, en le rattachant explicitement (« Connu depuis Phase 6-8 ») au même constat que Phase 6.
- Le Decision Gate a établi que **les deux documents s'accordent sur le fait** (compteur agrégé, pas de structure par membre) et ne divergent que sur le **cadrage produit** : « nécessite un arbitrage produit avant toute implémentation » (Phase 6) vs « peut être complété directement, sans décision préalable » (audit dictionnaire).
- Aucun des deux documents n'est rang 1 (décision PO) ni rang 2-4 dans la hiérarchie des sources — les deux sont des constats d'implémentation de rang 5 de facto, à des dates différentes, sans règle de départage documentée entre eux.

### Options

Le Decision Gate ne présente pas une liste d'options A/B/C toute faite pour ce sujet précis (il constate une contradiction de cadrage, pas un choix de modèle) — les options ci-dessous reformulent fidèlement, sans en ajouter, les deux cadrages effectivement documentés plus une troisième option de statu quo implicite déjà couverte par le Decision Gate :

**Option A — Attendance à implémenter maintenant (cadrage « COMPLÉTER, sans blocage » de l'audit dictionnaire)**

| | |
|---|---|
| Portée | Démarrer directement la structuration d'`Attendance` par membre, sans arbitrage produit préalable |
| Impact fonctionnel | Débloque UCX5-05, UC02-13, UCX1-13 |
| Impact Meeting | Nécessite que `Meeting` soit adressable par `id` de façon stable (déjà le cas) ; n'exige pas en soi `Meeting.status` |
| Impact Web | Création d'un type, d'un service, d'une UI, de mocks, de tests — travail significatif non couvert par cette mission |
| Impact Mobile | Peut démarrer une conception Mobile en parallèle une fois le modèle Web stabilisé |
| Impact Backend | Structure déjà spécifiée par le dictionnaire (fiche #19) |
| Impact SQLite | Le modèle offline devra reprendre `sync_status`/`version`, déjà prévus au dictionnaire |
| Impact Offline | Nécessite de trancher aussi D-4C3-WEB-03 (immutabilité) et D-4C3-WEB-04 (idempotence) avant d'écrire un modèle complet |
| Risques | Reproduit, pour `Attendance`, le même traitement que Phase 6 a explicitement refusé pour `Committee` et le catalogue de postes (classes/structures absentes de tout le code et de tous les diagrammes, nécessitant une structure de données non spécifiée) — Phase 6 avait alors choisi de ne PAS inventer la structure sans arbitrage |

**Option B — Attendance hors périmètre actuel (statu quo)**

| | |
|---|---|
| Portée | Ne rien construire ; documenter explicitement que le compteur agrégé `Meeting.participants` reste le seul mécanisme de suivi de présence tant qu'aucune décision produit n'intervient |
| Impact fonctionnel | UCX5-05, UC02-13, UCX1-13 restent non couverts |
| Impact Meeting | Aucun |
| Impact Web | Aucun |
| Impact Mobile | Aucun portage possible tant que le modèle Web n'existe pas |
| Impact Backend | Aucun |
| Impact SQLite | Aucun |
| Impact Offline | Aucun |
| Risques | Reporte indéfiniment un besoin fonctionnel documenté (3 Use Cases confirmés) |

**Option C — Attendance à compléter après décision produit explicite (cadrage « BLOQUANT » de Phase 6, retenu comme recommandation par le Decision Gate)**

| | |
|---|---|
| Portée | Ne pas construire `Attendance` avant qu'une décision PO explicite tranche au minimum D-4C3-WEB-03 (immutabilité) et D-4C3-WEB-04 (idempotence), puisque ces règles conditionnent la forme même du modèle de données |
| Impact fonctionnel | UCX5-05, UC02-13, UCX1-13 restent non couverts jusqu'à la décision, puis débloqués ensemble une fois le modèle spécifié complètement |
| Impact Meeting | Si D-4C3-WEB-01 retient un `Meeting.status`, l'articulation Attendance/clôture doit être conçue en même temps |
| Impact Web | Aucun changement immédiat ; travail de conception (pas de code) à prévoir après validation |
| Impact Mobile | Aucun changement immédiat ; évite de concevoir un modèle Mobile sur une base Web encore instable |
| Impact Backend | Aucun changement immédiat |
| Impact SQLite | Aucun changement immédiat |
| Impact Offline | Le modèle offline (upsert vs rejet, cf. D-4C3-WEB-04) est décidé avant d'écrire le schéma, plutôt qu'après — évite une reprise de modèle |
| Risques | Retarde une fonctionnalité déjà demandée par 3 Use Cases confirmés, le temps de l'arbitrage PO |

### Analyse comparative

Le fait sous-jacent (aucune structure par membre, seulement un compteur agrégé) n'est pas contesté par aucune des deux sources contradictoires — la contradiction porte uniquement sur la question de savoir si ce vide peut être comblé directement (Option A) ou nécessite d'abord un arbitrage produit (Option C), l'Option B étant le statu quo pur. Le Decision Gate note que Phase 6 a déjà appliqué, pour deux autres classes absentes du code et des diagrammes (`Committee`, catalogue de postes), le même critère que celui invoqué pour `Attendance` : une structure de données non spécifiée par aucune source ne doit pas être inventée sans validation. Ce parallèle est un argument de cohérence interne au projet, pas une preuve indépendante.

### Recommandation

```
RECOMMANDATION
──────────────
Option C — traiter Attendance comme nécessitant un arbitrage produit
avant toute implémentation

JUSTIFICATION
─────────────
Cohérence avec le traitement déjà appliqué par Phase 6 aux classes
absentes de tout le code et de tous les diagrammes nécessitant une
structure de données non spécifiée (Committee, catalogue de postes).
Attendance touche en outre directement deux autres décisions non
tranchées (D-4C3-WEB-03, D-4C3-WEB-04) qui conditionnent la forme
même du modèle de données. Source : Decision Gate §19 (« Analyse » et
« Recommandation »).

STATUT
──────
🟢 VALIDÉE — DÉCISION PO (Option A retenue, distincte de la recommandation)
```

**Décision effective — distincte de la recommandation du Decision Gate** : le PO a validé **Option A — construire Attendance maintenant**, pas l'Option C recommandée. Cette décision fait explicitement entrer Attendance dans le périmètre d'implémentation de Phase 4C-3. Conformément à la hiérarchie des sources (§4 ci-dessus), une décision PO explicitement validée est rang 1 — elle **résout** la contradiction de cadrage entre `PHASE_06_DECISIONS_A_VALIDER.md` (BLOQUANT) et `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` (PARTIALLY_IMPLEMENTED, COMPLÉTER) sans que ni l'un ni l'autre document n'ait eu besoin d'être corrigé rétroactivement : les deux restent des constats historiques valides pour leur date, la décision PO les surclasse pour la suite du projet. Voir `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md` §3.2 et §5.

**Précision de périmètre** : la validation d'Option A signifie qu'Attendance **doit être conçu et implémenté**, pas que son implémentation démarre dans cette mission de clôture — celle-ci reste READ-ONLY / documentation. Le développement relève du mandat séparé « IMPLEMENTATION GO ».

### Décision PO

    ☑ Option A
    ☐ Option B
    ☐ Option C
    ☐ Autre / à préciser

    Décision PO :
    Option A — construire Attendance maintenant (entre dans le périmètre
    d'implémentation de Phase 4C-3)

    Commentaire :
    Décision distincte de la recommandation du Decision Gate (qui penchait
    pour l'Option C). Le PO a tranché explicitement l'arbitrage de cadrage
    produit en faveur d'une implémentation directe. Validée dans le cadre de
    la clôture du Decision Gate (docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md).
    Le modèle complet d'Attendance (champs exacts au-delà de ceux déjà
    fixés par D-4C3-WEB-03/04) reste à spécifier au mandat IMPLEMENTATION GO.

---

## 7. D-4C3-WEB-03 — Attendance Immutability

### Question

Un enregistrement `Attendance` peut-il être modifié après la clôture du `Meeting` associé ?

### Faits établis

- **Non documenté.** Recherche menée par le Decision Gate dans le dictionnaire, `PHASE_02_MODELE_CANONIQUE_FINAL.md`, `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, les deux documents Phase 6, les Use Cases classifiés : aucune règle « Meeting clôturé ⇒ Attendance immuable » n'apparaît nulle part (Decision Gate §12).
- Ni le service, ni l'UI, ni les tests ne peuvent en porter trace puisque ni `Meeting.status` ni `Attendance` n'existent dans le code de ce dépôt.
- Ce n'est **pas une contradiction entre deux sources** — c'est une absence totale de règle. **NON CONFIRMÉE** au sens du présent mandat.

### Options

Le Decision Gate présente ces options à titre d'exemple structurant (il ne les affirme pas comme extraites d'une source documentée, puisqu'aucune ne l'est) :

**Option A — Attendance immuable après clôture**

| | |
|---|---|
| Intégrité historique | Forte — un enregistrement figé constitue une preuve stable de ce qui a été constaté lors de la réunion |
| Audit | Facilite l'audit (aucune modification a posteriori possible) |
| UX | Contraignant si une erreur de saisie est découverte après clôture (aucun mécanisme de correction prévu par aucune source) |
| Offline | Nécessite que le client Mobile applique la même règle de verrouillage localement avant même la synchronisation |
| Synchronisation | Un `Attendance` créé hors-ligne avant la clôture, mais synchronisé après, pose la question du moment où la règle s'applique — non tranchée par aucune source |
| Conflits | Réduit le risque de conflit de synchronisation sur les enregistrements clôturés (plus aucune écriture possible) |
| Sécurité | Renforce la non-répudiation |
| Tests | Nécessite un test dédié « refus de modification après clôture » |

**Option B — Modification autorisée avec permission**

| | |
|---|---|
| Intégrité historique | Plus faible — une correction reste possible, avec traçabilité à définir séparément (non couverte par aucune source) |
| Audit | Nécessite un mécanisme de traçabilité des corrections (non spécifié) pour rester auditable |
| UX | Plus souple — permet de corriger une erreur de saisie |
| Offline | Complexifie le modèle offline (une correction après clôture doit aussi transiter par l'outbox) |
| Synchronisation | Risque de conflit si la correction et une autre écriture se chevauchent |
| Conflits | Plus élevé qu'en Option A |
| Sécurité | Dépend entièrement de la permission utilisée — à définir (aucune source ne propose de permission dédiée, cf. D-4C3-WEB-05) |
| Tests | Nécessite un test « modification autorisée avec permission X », permission non définie aujourd'hui |

**Option C — Autre mécanisme documenté**

| | |
|---|---|
| Intégrité historique | Dépend du mécanisme retenu (ex. immuable pour `status`, modifiable pour `penalty_amount` afin de corriger une pénalité) |
| Audit | Dépend du mécanisme retenu |
| UX | Potentiellement le meilleur compromis, mais nécessite une spécification complète avant toute implémentation |
| Offline / Synchronisation / Conflits / Sécurité / Tests | Non déterminables sans que le mécanisme exact soit d'abord spécifié par le PO |

### Analyse comparative

Une règle d'immutabilité serait cohérente avec le fait que le verrouillage canonique de `Meeting.status` inclut déjà des états définitifs (`CANCELLED`, `POSTPONED`, `DONE`) — mais l'affirmer sans source reviendrait à inventer une règle métier, ce que le mandat interdit explicitement. Cette décision dépend en partie de D-4C3-WEB-01 : sans `Meeting.status`, la notion même de « clôture » n'a pas de traduction technique dans le modèle Web actuel.

### Recommandation

```
RECOMMANDATION
──────────────
Aucune — le Decision Gate ne recommande explicitement aucune des trois
options, faute de toute source documentée dans un sens ou dans l'autre.

JUSTIFICATION
─────────────
Absence totale de règle dans le corpus documentaire (dictionnaire,
modèle canonique, diagrammes, Phase 6, Use Cases). Trancher sans
source reviendrait à inventer une règle métier, proscrit par le
mandat. Source : Decision Gate §12, §20.

STATUT
──────
🟢 VALIDÉE — DÉCISION PO (aucune recommandation préexistante — décision
produit pure tranchée directement par le PO)
```

**Décision effective** : le PO a validé **Option A — Attendance immuable après clôture**. Règle métier désormais approuvée :

```
Meeting ouvert
      ↓
Attendance modifiable selon les règles du cycle
      ↓
clôture du Meeting
      ↓
Attendance figées (immuables)
```

Cette décision est cohérente avec, et dépend de, D-4C3-WEB-01 (§5 ci-dessus) : la notion de « clôture » suppose l'existence du champ `Meeting.status` validé dans le cadre de l'Option C de D-4C3-WEB-01. Le détail opérationnel (quels champs exacts sont couverts par le verrou — `status` seul, ou aussi `penalty_amount` — et le mécanisme technique de verrouillage) **n'est pas fixé par cette validation** et reste à spécifier au mandat IMPLEMENTATION GO. Voir `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md` §3.3.

### Décision PO

    ☑ Option A
    ☐ Option B
    ☐ Option C
    ☐ Autre / à préciser

    Décision PO :
    Option A — Attendance immuable après clôture du Meeting

    Commentaire :
    Aucune recommandation du Decision Gate n'existait pour ce sujet (absence
    totale de source) — décision produit tranchée directement par le PO.
    Validée dans le cadre de la clôture du Decision Gate
    (docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md). Le mécanisme
    technique exact de verrouillage reste à spécifier au mandat
    IMPLEMENTATION GO.

---

## 8. D-4C3-WEB-04 — Attendance Idempotence

### Question

Que doit faire TANZEN lorsqu'une même présence est enregistrée deux fois pour le même `Meeting` et le même `Member` ?

### Faits établis

- Le dictionnaire de données porte la contrainte physique `uq_attendances_meeting_member UNIQUE(meeting_id, member_id)` (fiche #19), confirmée sur le diagramme de classes (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §2.7).
- **Aucun document du corpus ne traduit cette contrainte de schéma en règle métier applicative** : pas de comportement service décrit, pas de comportement UI décrit, pas de test, pas de mention dans un Use Case ou une décision produit. Conformément au mandat : `UNIQUE = DUPLICATE_ATTENDANCE` **n'est pas déduit automatiquement**, faute de confirmation par une source (Decision Gate §11).
- Puisqu'`Attendance` n'existe pas en code, il n'existe aujourd'hui ni service, ni UI, ni comportement offline/synchronisation à observer.

### Options

**Option A — Rejet explicite du doublon**

| | |
|---|---|
| UX | Message d'erreur métier explicite (« présence déjà enregistrée pour ce membre à cette réunion ») — nécessite un code d'erreur dédié, non défini par aucune source aujourd'hui |
| DB | Cohérent avec la contrainte `UNIQUE` déjà documentée au dictionnaire |
| Offline | Un rejeu réseau (même saisie envoyée deux fois par erreur) produirait une erreur visible côté utilisateur, à moins d'une logique de déduplication cliente supplémentaire |
| Outbox | Nécessite que l'outbox Mobile distingue une vraie tentative de doublon d'un simple rejeu de synchronisation — logique supplémentaire non spécifiée |
| Sync | Risque de faux positifs lors de la resynchronisation après une coupure réseau |
| Concurrence | Le premier arrivé gagne ; le second échoue explicitement |
| Audit | Traçabilité claire de chaque tentative, y compris les rejets |
| Complexité | Moyenne — nécessite un code d'erreur métier et une gestion différenciée rejeu/doublon réel côté Mobile |

**Option B — Idempotence / upsert**

| | |
|---|---|
| UX | Silencieuse — une nouvelle saisie pour le même couple `meeting_id`/`member_id` remplace la précédente sans erreur visible |
| DB | La contrainte `UNIQUE` garantit qu'une seule ligne existe par couple, quel que soit le nombre d'écritures |
| Offline | Tolère nativement les rejeux de synchronisation (une même saisie envoyée deux fois n'est jamais bloquante) |
| Outbox | Simplifie la logique outbox Mobile — pas besoin de distinguer rejeu et nouvelle saisie |
| Sync | Comportement prévisible en cas d'écritures concurrentes différées (dernier écrit gagne) |
| Concurrence | Peut masquer une correction accidentelle si deux utilisateurs différents saisissent pour le même membre sans le savoir |
| Audit | Traçabilité plus faible — l'historique des tentatives précédentes n'est pas conservé sauf mécanisme supplémentaire |
| Complexité | Faible à modérée — pattern courant pour les modèles offline-first, cohérent avec les champs `sync_status`/`version` déjà prévus au dictionnaire pour `Attendance` |

**Option C — Rejet générique (erreur de contrainte DB non traduite en message métier)**

| | |
|---|---|
| UX | La plus pauvre des trois — erreur technique brute exposée à l'utilisateur |
| DB | Comportement par défaut d'une contrainte `UNIQUE` non gérée applicativement |
| Offline | Idem Option A mais sans même le confort d'un message métier clair |
| Outbox | Idem Option A |
| Sync | Idem Option A |
| Concurrence | Idem Option A |
| Audit | Traçabilité technique uniquement (logs d'erreur), pas de traçabilité métier |
| Complexité | La plus faible à implémenter, la plus coûteuse en expérience utilisateur |

### Analyse comparative

Les trois options respectent également la contrainte de schéma `UNIQUE(meeting_id, member_id)` — elles ne diffèrent que par le comportement applicatif en cas de tentative de doublon. Le contexte offline/synchronisation déjà anticipé par le dictionnaire pour cette table (présence de `sync_status`/`version` dans la fiche canonique) est un facteur factuel qui favorise structurellement l'Option B, sans que cela constitue une preuve suffisante pour trancher à la place du PO — d'autres facteurs (UX de correction d'erreur, exigences d'audit) peuvent peser dans l'autre sens.

### Recommandation

```
RECOMMANDATION
──────────────
Aucune option n'est validée par le Decision Gate. Un élément factuel
est signalé pour éclairer la décision : l'Option B (upsert) est
structurellement plus compatible avec le contexte offline déjà
anticipé par le dictionnaire pour cette table (sync_status/version).

JUSTIFICATION
─────────────
Aucune source ne permet de trancher entre A/B/C. Le facteur offline
est un élément parmi d'autres (UX, traçabilité d'audit) que seul le
PO peut arbitrer. Source : Decision Gate §21.

STATUT
──────
🟢 VALIDÉE — DÉCISION PO
```

**Décision effective** : le PO a validé **Option B — Idempotence (upsert)**, conforme à l'élément factuel signalé par le Decision Gate. Règle associée confirmée : `UNIQUE(meeting_id, member_id)` — une nouvelle saisie de présence pour le même couple `meeting_id`/`member_id` met à jour l'enregistrement existant plutôt que de créer un doublon ou de produire une erreur.

**GAP signalé, à ne pas combler par supposition** : le mandat de clôture demandait un « comportement explicitement défini pour les retransmissions Offline/Outbox », mais le texte du mandat reçu par cette mission s'est interrompu avant de préciser ce comportement exact (ex. politique de résolution en cas d'écritures concurrentes différées, fenêtre de tolérance, marquage `sync_status`). **NON CONFIRMÉ** — ce détail n'est pas inventé ici et doit être explicitement spécifié au mandat IMPLEMENTATION GO avant toute implémentation de l'outbox Mobile. Voir `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md` §3.4 et §7.

### Décision PO

    ☑ Option B
    ☐ Option A
    ☐ Option C
    ☐ Autre / à préciser

    Décision PO :
    Option B — Idempotence / upsert sur UNIQUE(meeting_id, member_id)

    Commentaire :
    Validée dans le cadre de la clôture du Decision Gate
    (docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md). Le détail exact
    du comportement de retransmission Offline/Outbox n'a pas été précisé
    dans le mandat reçu par cette mission — signalé NON CONFIRMÉ, à
    spécifier explicitement au mandat IMPLEMENTATION GO, pas à déduire par
    défaut.

---

## 9. D-4C3-WEB-05 — Governance RBAC

### Question

Les permissions Governance existantes suffisent-elles pour `Meeting` et `Attendance`, ou une granularité propre est-elle nécessaire ?

### Faits établis — permissions réellement trouvées

Catalogue réel (`src/mocks/rbac.mocks.ts:55`) : `governance.read`, `governance.create`, `governance.approve`, `governance.update`, `governance.delete`. Aucune permission `meeting.*` ou `attendance.*` n'existe nulle part dans le code (confirmé par recherche exhaustive).

Usage réel (Decision Gate §14) :

| Action | Meeting | Attendance |
|---|---|---|
| Consultation | `governance.read` **déclaré** mais **route liste Meeting non gardée** (`governance/meetings` n'utilise pas `PermissionRoute`, contrairement à `governance/general-assemblies`) | N/A — n'existe pas |
| Création | `governance.create` — bouton masqué via `PermissionGate`, partagé indifféremment entre Meeting/Assembly/Vote/BoardMember | N/A |
| Modification | Aucune permission utilisée — aucune opération de modification (hors PV) n'existe pour Meeting | N/A |
| Publication (PV) | `governance.approve` — masquage bouton uniquement, pas de garde de route ; la même permission gère aussi « publier résultat de vote » et « clôturer un mandat » | N/A |

`governance.update` et `governance.delete` sont déclarés dans le catalogue mais **jamais référencés ailleurs** dans le code — permissions mortes, cohérent avec l'absence de toute opération de suppression Governance.

### Options

**Option A — Conserver les permissions existantes**

| | |
|---|---|
| Description | Réutiliser `governance.read/create/approve` tel quel pour toute future action Attendance (ex. saisie de présence via `governance.create`) |
| Avantages | Cohérent avec le pattern déjà en place — le catalogue actuel ne distingue déjà pas Meeting d'Assembly/Vote/BoardMember |
| Inconvénients | Aucune granularité si un besoin métier futur exige, par ex., que seul un secrétaire puisse saisir les présences sans pouvoir créer une réunion |
| Risques | Aucun signalé par les sources actuelles |

**Option B — Ajouter une granularité Attendance**

| | |
|---|---|
| Description | Créer des permissions dédiées (ex. `attendance.create`, `attendance.read`) |
| Avantages | Permettrait une séparation fine des rôles si un besoin métier l'exige |
| Inconvénients | Aucune source ne documente ni ne justifie un tel besoin aujourd'hui ; introduirait une incohérence avec le pattern actuel (un seul groupe de permissions pour tout Governance) |
| Risques | Créer une permission sans justification documentée est explicitement proscrit par le mandat de cette mission et par celui du Decision Gate |

**Option C — Autre modèle**

| | |
|---|---|
| Description | Non spécifié par aucune source — à documenter si le PO identifie un besoin non couvert par A ou B |
| Avantages / Inconvénients / Risques | Indéterminables sans spécification |

### Analyse comparative

Le catalogue actuel applique déjà un seul groupe de permissions à toutes les sous-entités de Governance (Assembly, Meeting, Vote, BoardMember) — introduire une distinction uniquement pour Attendance créerait une incohérence de conception sans qu'aucun besoin métier documenté ne le justifie. Point de vigilance non résolu : `governance.approve` gère aujourd'hui trois actions sans rapport fonctionnel entre elles (PV, résultat de vote, clôture de mandat) sous un seul verbe — si la saisie de présence est un jour ajoutée, son rattachement à `governance.create` (création unitaire) reste à confirmer, une saisie de présence pouvant être une opération répétée en masse, différente d'une création simple.

### Recommandation

```
RECOMMANDATION
──────────────
Option A — ne rien créer, réutiliser governance.create pour une
éventuelle saisie d'Attendance

JUSTIFICATION
─────────────
Cohérent avec le pattern actuel (un seul groupe de permissions pour
tout le domaine Governance). Aucun besoin métier documenté ne
justifie une permission Attendance dédiée. Ce point reste secondaire
tant que D-4C3-WEB-02 (existence même d'Attendance) n'est pas
tranché. Source : Decision Gate §22.

STATUT
──────
🟢 VALIDÉE — DÉCISION PO
```

**Décision effective** : le PO a validé **Option A — conserver les permissions Governance existantes** (`governance.read/create/approve/update/delete`), conformément à la recommandation. Aucune permission `meeting.*` ou `attendance.*` n'est créée. La future saisie d'Attendance (D-4C3-WEB-02, Option A) réutilisera `governance.create` sans nouvelle permission.

### Décision PO

    ☑ Option A
    ☐ Option B
    ☐ Option C
    ☐ Autre / à préciser

    Décision PO :
    Option A — conserver les permissions Governance existantes, aucune
    permission dédiée Attendance créée

    Commentaire :
    Validée conformément à la recommandation du Decision Gate. Validée dans
    le cadre de la clôture du Decision Gate
    (docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md).

---

## 10. Synthèse PO

| ID | Sujet | Recommandation | Décision PO | Bloquant Mobile |
|---|---|---|---|---|
| D-4C3-WEB-01 | Meeting model | Option C (hybride ciblé) | 🟢 **Option C** | **Oui** — le schéma SQLite Mobile `meetings` dépend directement du champ set retenu (Decision Gate §23) |
| D-4C3-WEB-02 | Attendance status | Aucune (cadrage à arbitrer ; Option C esquissée) | 🟢 **Option A** (distincte de la recommandation) | **Oui** — Attendance entre au périmètre ; conditionne directement la conception Mobile |
| D-4C3-WEB-03 | Immutabilité Attendance | Aucune (absence totale de règle) | 🟢 **Option A** | **Oui** — la règle de verrouillage doit être répliquée dans l'outbox/repository Mobile |
| D-4C3-WEB-04 | Idempotence Attendance | Aucune validée (upsert signalé comme facteur favorable si offline confirmé) | 🟢 **Option B** | **Oui** — détermine directement la logique d'outbox Mobile ; détail des retransmissions NON CONFIRMÉ, à spécifier au mandat IMPLEMENTATION GO |
| D-4C3-WEB-05 | RBAC Governance | Option A (ne rien créer) | 🟢 **Option A** | **Non, mineure** — le Decision Gate classe ce sujet « non bloquant en soi » (Decision Gate §25) ; confirmé sans changement |

**5/5 décisions validées.** Voir `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md` pour le rapport de clôture formel.

## 11. Ordre de validation

Le mandat propose l'ordre séquentiel `D-01 → D-02 → D-03 → D-04 → D-05`. L'analyse des dépendances réelles (établies par le Decision Gate) affine cet ordre sans le contredire :

```
D-4C3-WEB-01 (Meeting model)      D-4C3-WEB-02 (Attendance status)
        │  indépendantes,                │
        │  peuvent être validées         │
        │  en parallèle                  │
        └───────────────┬────────────────┘
                         ▼
              D-4C3-WEB-03 (Immutabilité)
        (dépend de D-01 — l'immutabilité présuppose
         Meeting.status — ET de D-02 — non pertinente
         si Attendance reste hors périmètre)
                         │
                         ▼
              D-4C3-WEB-04 (Idempotence)
        (dépend de D-02 — non pertinente si Attendance
         reste hors périmètre ; indépendante de D-01)
                         │
                         ▼
              D-4C3-WEB-05 (RBAC)
        (dépend du résultat de D-02/03/04 pour savoir
         si un besoin de granularité RBAC émerge réellement)
```

**Explication de l'écart avec l'ordre strictement séquentiel proposé par le mandat** : D-4C3-WEB-01 et D-4C3-WEB-02 ne dépendent pas l'une de l'autre (l'une porte sur Meeting, l'autre sur l'existence même d'Attendance) et peuvent donc être validées dans n'importe quel ordre ou simultanément. En revanche, D-4C3-WEB-03 dépend explicitement de D-4C3-WEB-01 (Decision Gate §20 : « l'immutabilité présuppose l'existence de `Meeting.status`, lui-même non tranché ») et, comme D-4C3-WEB-04, n'a de sens que si D-4C3-WEB-02 ne conclut pas à l'Option B (Attendance hors périmètre). D-4C3-WEB-05 est correctement placée en dernier, son enjeu dépendant du résultat des quatre décisions précédentes.

## 12. Impact Web

```
Décisions validées par le PO
          ↓
Modèle Meeting stabilisé (D-01) et périmètre Attendance clarifié (D-02)
          ↓
Implémentation Web éventuelle (hors périmètre de ce dossier — nécessite
une mission distincte, avec son propre mandat d'implémentation)
```

Ce dossier ne déclenche aucune implémentation Web. Une fois les 5 décisions validées, le travail Web restant (s'il est commandé séparément) porterait sur :
- **D-01** : éventuel ajout de `Meeting.status` (et transitions associées, à spécifier séparément) — type, mocks, service, UI, tests.
- **D-02 à D-04** : si le PO choisit de construire Attendance, spécification complète du modèle (champs, contraintes, comportement service/UI) intégrant les règles d'immutabilité et d'idempotence tranchées.
- **D-05** : aucun changement RBAC prévu selon la recommandation actuelle ; réévaluation possible seulement si D-02/03/04 font émerger un besoin non couvert.
- Rappel : aucun de ces travaux n'est autorisé, ni implicitement approuvé, par la validation de ce dossier de décision.

## 13. Impact Mobile

`tanzen-mobile` = **NON MODIFIÉ**. Aucune implémentation Phase 4C-3 Mobile ne doit démarrer avant la fermeture du Decision Gate (§14 ci-dessous) — et la fermeture du Decision Gate ne constitue pas, à elle seule, un GO Mobile (voir §15).

```
Décisions validées (D-01 à D-05)
          ↓
modèle Web stabilisé (si travail Web commandé séparément)
          ↓
implémentation Web éventuelle
          ↓
Architecture Mobile (conception, hors périmètre de ce dossier)
          ↓
SQLite Mobile → Repository → Service → Screens → Navigation
          ↓
Offline / Outbox (dépend directement de D-4C3-WEB-04)
          ↓
Tests
          ↓
Implementation GO Mobile (étape distincte, non couverte ici)
```

La validation PO des 5 décisions ne déclenche **pas automatiquement** l'implémentation Web ni Mobile — chaque étape de la chaîne ci-dessus nécessite son propre mandat.

## 14. Critères de fermeture

Le Decision Gate ne peut être considéré comme fermé que lorsque :

    [x] D-4C3-WEB-01 validée — Option C
    [x] D-4C3-WEB-02 validée — Option A
    [x] D-4C3-WEB-03 validée — Option A
    [x] D-4C3-WEB-04 validée — Option B
    [x] D-4C3-WEB-05 validée — Option A

ET :

    [x] aucune contradiction bloquante — la contradiction de cadrage D-4C3-WEB-02 est résolue : la décision PO (rang 1 de la hiérarchie des sources, §4) surclasse le désaccord de cadrage entre PHASE_06_DECISIONS_A_VALIDER.md et COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md sans qu'aucun des deux documents historiques n'ait besoin d'être corrigé
    [x] modèle Meeting stabilisé — Option C validée (ajout ciblé de status pour UC02-14 uniquement ; détail des transitions non fixé, voir §5)
    [x] modèle Attendance stabilisé au niveau des règles — Option A (construire maintenant), Option A (immuable après clôture), Option B (idempotent/upsert) ; le schéma de champs complet reste à spécifier au mandat IMPLEMENTATION GO
    [x] règles métier Attendance stabilisées — immutabilité et idempotence tranchées (§7, §8) ; détail des retransmissions Offline/Outbox NON CONFIRMÉ, signalé comme gap explicite pour le prochain mandat
    [x] RBAC stabilisé — Option A validée, aucun changement au catalogue
    [x] impacts Mobile documentés (fait — Decision Gate §23, repris ici §13)

## 15. Statut du Decision Gate

**DECISION GATE = CLOSED**

Les 5 décisions sont validées par le PO (5/5, formalisées ci-dessus et dans `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md`). Conformément au mandat : cette fermeture ne constitue **pas** une **IMPLEMENTATION GO MOBILE**, ni même un GO d'implémentation Web — celle-ci fait l'objet d'un mandat séparé et distinct, « P1 GOVERNANCE — PHASE 4C-3 — IMPLEMENTATION GO », non couvert par ce dossier ni par cette mission de clôture.

## 16. Recommandation finale

Les 5 décisions sont validées ; le Decision Gate est fermé. Deux points doivent être traités explicitement **avant** que le mandat IMPLEMENTATION GO ne soit lancé, faute de quoi ils resteraient des angles morts : (1) les transitions exactes de `Meeting.status` (D-4C3-WEB-01) ne sont pas définies par cette validation — seul le principe d'ajouter le champ est acté ; (2) le comportement exact des retransmissions Offline/Outbox pour `Attendance` (D-4C3-WEB-04) n'a pas été précisé dans le mandat de clôture reçu par cette mission — signalé NON CONFIRMÉ plutôt que déduit. Ces deux points sont à trancher explicitement au lancement du mandat IMPLEMENTATION GO, pas à supposer implicitement validés par la fermeture de ce Decision Gate.

## 17. Fichiers inspectés

`docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` (intégralement) et, par sa référence, les sources listées en §3 ci-dessus. Aucune nouvelle recherche dans `src/`, `mocks/`, `services/` n'a été effectuée pour ce dossier — toutes les preuves techniques citées proviennent du Decision Gate déjà produit, lui-même basé sur une inspection directe du code au moment de sa rédaction.

## 18. Fichiers modifiés

    AUCUNE MODIFICATION DE CODE

Seul fichier créé par cette mission : `docs/P1_GOVERNANCE_PHASE_4C3_PO_DECISION_VALIDATION.md`.

## 19. Git

    Aucun commit
    Aucun push
