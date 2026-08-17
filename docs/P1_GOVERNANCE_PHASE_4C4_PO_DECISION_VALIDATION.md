# P1 GOVERNANCE — PHASE 4C-4
# GENERAL ASSEMBLY
# PO DECISION VALIDATION PACK

**Statut : DOSSIER DE DÉCISION — 🟢 LES 10 DÉCISIONS SONT VALIDÉES.** Validation formalisée par `docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md`. Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/`. Aucune migration, service, repository, route, écran, permission, table, colonne, relation n'a été créée. `tanzen-mobile` et `tanzen-commercial` n'ont pas été touchés. La mise à jour ci-dessous formalise les décisions déjà prises par le Product Owner ; elle ne les tranche pas et ne donne aucun GO d'implémentation — celui-ci fait l'objet d'un mandat séparé « IMPLEMENTATION GO — PHASE 4C-4 ». Aucun commit, aucun push.

---

## 1. Objet

Transformer les 10 décisions `DECISION_REQUIRED` du Decision Gate `docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md` en un pack de validation directement actionnable par le Product Owner — chaque décision porte des options tracées à leurs sources, une recommandation explicitement non contraignante, et un bloc de validation à cocher. Ce document ne rouvre pas `Meeting.status` ni `Attendance` (Phase 4C-3, déjà validés et clos) : il n'en analyse que l'impact.

## 2. Contexte

`docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md` a établi, en lecture seule, que l'architecture cible (`GeneralAssembly` devenant `Meeting(type=GENERAL_ASSEMBLY)`, avec `Attendance`/`QuorumSnapshot`/`AssemblyDecision`/`Vote`/`VoteOption`/`MemberVote` tous rattachés à `Meeting.id`) entre en conflit avec :
- l'implémentation actuelle de `GeneralAssembly`, une entité autonome pleinement construite ;
- le document canonique verrouillé `PHASE_02_MODELE_CANONIQUE_FINAL.md`, qui rattache `Vote` à `general_assemblies`, pas à `Meeting` ;
- le dictionnaire de données, qui rattache `Vote` à une table `assemblies` distincte de `general_assemblies`.

`QuorumSnapshot` et `AssemblyDecision` n'existent ni en code ni dans les 59 fiches du dictionnaire canonique — leur schéma reste entièrement à spécifier. `VoteOption`/`MemberVote` existent au dictionnaire mais sont absents du code, malgré deux affirmations contraires dans `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` (« IMPLEMENTED »/« PARTIALLY_IMPLEMENTED ») qui ne sont corroborées par aucune preuve de code.

Ce dossier ne rouvre aucun de ces constats — il les reformule pour validation.

## 3. Sources utilisées

Source principale : `docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md` (intégralement).

Sources secondaires effectivement référencées et reprises ici pour la traçabilité de chaque option :
- `docs/audit/excel_dictionary_dump.txt` (fiches #18 `meetings`, #19 `attendances`, #39 `general_assemblies`, #40 `votes`, #41 `vote_options`, #42 `member_votes`, #56-57 `workflow_requests`/`workflow_actions`)
- `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (§ Entités, lignes 100-106, 227-231, 313-317)
- `docs/PHASE_02_DECISIONS_CANONIQUES.md` (sujet 18n)
- `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (UCX5-01 à 08)
- `docs/PHASE_06_DECISIONS_A_VALIDER.md` (§1, `Vote.assemblyId`, jamais tranché)
- `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` (lignes 108-111)
- `docs/PHASE_4C4_GENERAL_ASSEMBLY_MEETING_TYPE_IMPACT_AUDIT.md`, `docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md`
- `docs/P1_GOVERNANCE_GENERAL_ASSEMBLY_IMPLEMENTATION_REPORT.md`, `docs/P1_GOVERNANCE_PHASE_4C3_IMPLEMENTATION_REPORT.md`
- Code : `src/mocks/organization/governance.ts`, `attendances.ts`, `general-assemblies.ts`, `members.ts`, `src/services/organization.service.ts`, `attendance.service.ts`, `general-assembly.service.ts`, `src/mocks/rbac.mocks.ts`

**Conformément au mandat** : aucune affirmation d'un audit antérieur n'est reprise sans corroboration par le dépôt réel (voir en particulier §11 et §14, où deux affirmations de `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` sont explicitement écartées faute de preuve de code). Aucune information de `tanzen-frontend-claude` n'est utilisée.

## 4. Hiérarchie des sources

Reprise sans modification depuis `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` §3 / `docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md` §2 :

1. Décision explicitement validée par le PO.
2. `PHASE_02_MODELE_CANONIQUE_FINAL.md`.
3. Cas d'usage classifiés et validés.
4. Diagrammes de classes/séquences.
5. Implémentation actuelle (code de `tanzen-frontend`, jamais de `tanzen-frontend-claude`).
6. Dictionnaire Excel.

**Note propre à ce Pack** : l'« architecture cible » présentée par les mandats Phase 4C-4 n'est, à ce stade, formellement rang 1 d'aucun document antérieur — elle devient rang 1 seulement au fur et à mesure que le PO coche les décisions ci-dessous. Tant qu'une décision reste `🟠 EN ATTENTE DE VALIDATION PO`, les rangs 2 et 6 (qui la contredisent parfois, ex. D-4C4-WEB-07) restent la référence documentée.

## 5. Fondations déjà validées (non rouvertes)

**Meeting.status** — `PLANNED → ONGOING → COMPLETED` (terminal), annulation possible depuis `PLANNED` ou `ONGOING` vers `CANCELLED` (terminal). Implémenté et testé (`src/services/organization.service.ts`, `organization.service.test.ts`). **Aucun impact identifié de General Assembly sur ce cycle.**

**Attendance** — `meeting_id`/`member_id`, `UNIQUE(meeting_id, member_id)` en upsert idempotent (`operationId`), immutabilité dès que `Meeting.status ∉ {PLANNED, ONGOING}`, isolation tenant indirecte via `Meeting`. Implémenté et testé (`src/mocks/organization/attendances.ts`, `attendance.service.ts`). **Aucun changement de modèle requis pour supporter `Meeting(type=GENERAL_ASSEMBLY)`** — `attendanceService` ne lit ni n'écrit `Meeting.type`. Seul lien fonctionnel nouveau, non structurel : `QuorumSnapshot.present_member_count` (si retenu, D-4C4-WEB-05) serait dérivé d'un comptage `Attendance.status='PRESENT'` par `meetingId`, déjà techniquement possible sans modification.

## 6. Architecture cible à analyser

```
Meeting
   │
   ├── type
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

`Meeting.type ∈ {REGULAR, GENERAL_ASSEMBLY}`. **Cette architecture est une cible à analyser, pas une décision déjà validée** — chacune des 10 décisions ci-dessous peut l'accepter, l'amender ou la rejeter.

---

## D-4C4-WEB-01 — Stratégie de migration GeneralAssembly

### Question PO

Que devient l'actuelle entité `GeneralAssembly` si `Meeting(type=GENERAL_ASSEMBLY)` devient l'architecture cible ?

### Faits établis

`GeneralAssembly` existe réellement dans `tanzen-frontend` (pas seulement documenté) : `src/mocks/organization/general-assemblies.ts` (`GeneralAssemblyStatus = 'PLANNED'|'ONGOING'|'COMPLETED'|'CANCELLED'`, `GeneralAssembly = {id, tenantId, title, assemblyDate, description, status}`, 3 enregistrements mock `GA-001..003`), `src/services/general-assembly.service.ts` (Create+Read seulement, périmètre déjà volontairement limité), `src/features/organization/organization-module.tsx` (`GeneralAssemblyList`/`Create`/`Detail`, 3 routes gardées `PermissionRoute`), 12 tests (`general-assembly.service.test.ts`), 8 clés i18n (en/fr), une entrée navigation. Un commentaire du code (`organization-module.tsx:365-367`) affirme explicitement : *« décision produit validée : GeneralAssembly n'est jamais un Meeting(type=...) »* — vrai au moment où il a été écrit, contredit par l'architecture désormais proposée.

### Sources d'autorité

Code réel (rang 5) pour l'état actuel ; `docs/P1_GOVERNANCE_GENERAL_ASSEMBLY_IMPLEMENTATION_REPORT.md` pour l'historique de construction de `GeneralAssembly`.

### Sources en conflit

Le commentaire code cité ci-dessus contredit littéralement l'architecture cible de ce mandat. `docs/PHASE_02_DECISIONS_CANONIQUES.md` sujet 18n avait déjà recommandé, avant même Phase 4C, de « réutiliser `Meetings`/`Attendances` existants plutôt que d'en recréer une variante sous Governance » — un précédent documentaire qui va dans le sens de la fusion, sans jamais mentionner `GeneralAssembly` spécifiquement (`GeneralAssembly` n'existait pas encore à cette date).

### Option A — Conserver GeneralAssembly autonome

Abandonner la fusion pour cette mission. `GeneralAssembly` reste une table/entité séparée.

- **Avantages** : zéro changement de code, zéro risque de régression sur les 3 AG existantes, zéro migration de données.
- **Inconvénients** : contredit directement l'architecture cible communiquée par les mandats Phase 4C-4 ; laisse `Vote`/`QuorumSnapshot`/`AssemblyDecision` sans parent défini de façon cohérente (rattachés à `GeneralAssembly` ou à `Meeting` ? La question resterait ouverte indéfiniment).
- **Cohérence architecture** : rompt avec l'intention explicite du mandat (« GeneralAssembly n'est PLUS une entité autonome »).
- **Impact Meeting** : aucun.
- **Impact Attendance** : aucun (déjà indépendant de `GeneralAssembly`).
- **Impact Quorum** : `QuorumSnapshot` devrait alors référencer `GeneralAssembly.id`, pas `Meeting.id` — cohérent en soi, mais divergent de l'architecture cible.
- **Impact Vote** : permettrait l'Option B de D-4C4-WEB-07 (`assembly_id → general_assemblies.id`), seule cohérente avec `PHASE_02_MODELE_CANONIQUE_FINAL.md`.
- **Impact Mobile** : aucun (rien n'existe côté Mobile).
- **Migration** : aucune.
- **Dette technique** : le conflit avec l'architecture cible reste ouvert indéfiniment ; deux concepts d'« assemblée » coexistent durablement (`GeneralAssembly` et l'éventuel futur `Meeting.type`, si D-4C4-WEB-02 est validé indépendamment).

### Option B — Remplacer GeneralAssembly par Meeting.type

`GeneralAssembly` devient une simple qualification de `Meeting` (`type = GENERAL_ASSEMBLY`), plus une entité séparée.

- **Migration** : les 3 enregistrements mock (`GA-001..003`) deviendraient 3 `Meeting` avec `type='GENERAL_ASSEMBLY'` ; `title`←`title`, `date`←`assemblyDate`, `status` déjà compatible (vocabulaire strictement identique) ; `description` n'a pas d'équivalent direct sur `Meeting` (le champ le plus proche, `agenda`, a une sémantique différente) — point à trancher séparément si cette option est retenue.
- **Compatibilité** : rompt les 3 routes `governance/general-assemblies*` existantes (à rediriger ou supprimer explicitement).
- **Données existantes** : migration bornée et petite (3 enregistrements aujourd'hui), mais non triviale sur le plan du code (retrait coordonné d'environ 8 fichiers/sections).
- **Routes** : `governance/general-assemblies`, `.../create`, `.../:id` — à retirer ou rediriger.
- **Services** : `general-assembly.service.ts` à retirer ; `organization.service.ts` à étendre pour couvrir la création/consultation d'un `Meeting(type=GENERAL_ASSEMBLY)`.
- **UI** : `GeneralAssemblyList`/`Create`/`Detail` à retirer ; `GovernanceTablePage kind="meetings"` à étendre (filtre/affichage par type).
- **Tests** : 12 tests `general-assembly.service.test.ts` à retirer/réécrire comme tests `Meeting(type=GENERAL_ASSEMBLY)`.
- **Mobile** : aucun impact immédiat ; simplifie le futur modèle Mobile cible (un seul concept à porter au lieu de deux).

### Option C — Migration progressive

Coexistence temporaire : `GeneralAssembly` reste en service (au moins en lecture) pendant que `Meeting.type` est introduit et validé, avant coupure différée.

- **Double modèle** : deux chemins de code pour un même concept fonctionnel pendant la période de transition.
- **Compatibilité** : préservée pendant la transition, rompue à la coupure finale.
- **Stratégie de migration** : à définir (bascule progressive des créations vers `Meeting.type`, `GeneralAssembly` gelé en lecture seule ?).
- **Période de coexistence** : durée non définie par aucune source — décision produit pure.
- **Risques** : divergence entre les deux modèles si mal synchronisés ; double maintenance prolongée sans critère de sortie explicite.
- **Coût** : le plus élevé des trois (construit B, puis retire A plus tard).
- **Critères de sortie** : à définir explicitement par le PO si cette option est retenue (aucune source ne les propose).

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Conformité à l'architecture cible du mandat | Non | Oui | Oui, différée |
| Risque de régression | Nul | Modéré (migration + retrait coordonné) | Faible à court terme, reporté |
| Effort | Nul | Borné, ponctuel | Le plus élevé (double travail) |
| Résout le couplage avec D-4C4-WEB-07 (Vote FK) | Non — laisse `assembly_id→general_assemblies.id` viable | Oui — ouvre la voie à `meeting_id→Meeting.id` | Oui, mais différé |
| Dette laissée | Conflit non résolu indéfiniment | Aucune après migration | Double modèle jusqu'à coupure |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Aucune option n'est validée par ce document. Élément de cohérence à signaler, non une décision : Option A contredit frontalement la prémisse même du mandat Phase 4C-4 ; la retenir reviendrait à annuler l'objet de cette série d'audits, ce qu'un document d'analyse n'a pas mandat de faire à la place du PO.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option B — Remplacer GeneralAssembly par Meeting.type**. `GeneralAssembly` cesse d'être le modèle métier cible autonome ; une Assemblée Générale est représentée par un `Meeting` dont `type = GENERAL_ASSEMBLY`. **Précision de périmètre (rappelée explicitement par le mandat de clôture)** : cette validation formalise l'architecture cible — elle **n'implique pas** que le code doit être modifié dans le cadre de cette mission de clôture, qui reste documentaire. Le retrait effectif de `general-assemblies.ts`/`general-assembly.service.ts`/des 3 routes/de l'UI/des 12 tests/des clés i18n relève exclusivement du futur mandat IMPLEMENTATION GO.

### Décision PO

```text
[☑] OPTION B — Remplacer GeneralAssembly par Meeting.type
[ ] OPTION A — Conserver GeneralAssembly autonome
[ ] OPTION C — Migration progressive
[ ] AUTRE / À PRÉCISER

Décision PO :
Option B — GeneralAssembly cesse d'être une entité autonome ;
une AG est représentée par Meeting(type=GENERAL_ASSEMBLY).

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Formalise
l'architecture cible uniquement — la migration effective du code
(retrait de GeneralAssembly, extension de Meeting) reste à réaliser
au mandat IMPLEMENTATION GO, non par cette clôture elle-même.
```

---

## D-4C4-WEB-02 — Meeting.type

### Question PO

Faut-il introduire `Meeting.type` pour distinguer les `Meeting` `REGULAR` et `GENERAL_ASSEMBLY` ?

### Faits établis

`Meeting` (`src/mocks/organization/governance.ts`) compte aujourd'hui 9 champs (`id, tenantId, title, date, location, participants, agenda, minutes, status`), aucun `type`. Les 4 enregistrements mock existants (`MT-001..004`) sont tous, de facto, des réunions ordinaires. Aucune fiche du dictionnaire canonique (`meetings`, fiche #18) ne porte de champ `type` — cette extension n'est confirmée par aucune source rang 6 non plus.

### Sources d'autorité

Code réel (rang 5) pour l'état actuel (absence confirmée). Aucune source de rang 1 à 4 ne mentionne `Meeting.type`.

### Sources en conflit

Aucune — il n'existe pas de source qui interdise ou contredise l'ajout, seulement une absence totale de spécification préexistante.

### Option A — Ajouter type = REGULAR | GENERAL_ASSEMBLY (défaut REGULAR)

- **Avantages** : extension additive, aucune rupture de compatibilité (rien ne lit ce champ aujourd'hui) ; migration triviale des 4 enregistrements existants (`type: 'REGULAR'` par défaut, sans ambiguïté puisqu'aucun n'est aujourd'hui une AG) ; préalable structurel nécessaire à D-4C4-WEB-01 Option B/C.
- **Inconvénients** : engage le vocabulaire `REGULAR`/`GENERAL_ASSEMBLY` sans confirmation dictionnaire.
- **Migration** : triviale, 4 enregistrements, valeur par défaut sans équivoque.
- **Compatibilité** : totale.
- **Web** : type TypeScript + 4 mocks + éventuel filtre UI par type.
- **Mobile** : le futur modèle SQLite `meetings` (aujourd'hui inexistant, cf. audit d'impact) pourrait inclure `type` dès sa première migration si construite après cette décision.
- **Backend** : aucune spécification canonique n'existe pour ce champ — à faire spécifier également côté dictionnaire si retenu (GAP documentaire à combler séparément).
- **Tests** : extension ciblée d'`organization.service.test.ts`.
- **Risques** : aucun identifié à ce stade (champ additionnel pur).

### Option B — Conserver Meeting sans type, maintenir GeneralAssembly autonome

- Statu quo strict. Rendrait D-4C4-WEB-01 Option B/C impossible (aucun moyen de distinguer un `Meeting(GENERAL_ASSEMBLY)` d'un `Meeting(REGULAR)` sans ce champ).
- **Avantages** : aucun changement.
- **Inconvénients** : bloque structurellement toute la chaîne D-4C4-WEB-01/05/06/07 si l'une d'elles retient une option qui suppose `Meeting.type`.

### Option C — Autre stratégie

Non documentée par aucune source consultée — à ne renseigner que si le PO en propose une (ex. un champ `category` plus large que `REGULAR`/`GENERAL_ASSEMBLY`, non demandé par le mandat).

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Débloque D-4C4-WEB-01 Option B/C | Oui | Non | Selon définition |
| Risque de régression | Nul | Nul | Indéterminé |
| Effort | Minimal | Nul | Indéterminé |
| Source canonique | Aucune (ni pour ni contre) | — | — |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Élément factuel à signaler : cette décision est un préalable technique à faible risque pour la plupart des autres décisions de ce pack ; elle n'engage en elle-même aucun choix produit contesté par une source.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option A — ajouter `Meeting.type ∈ {REGULAR, GENERAL_ASSEMBLY}`, valeur par défaut `REGULAR`**. Extension additive du modèle `Meeting`, non implémentée par cette clôture elle-même.

### Décision PO

```text
[☑] OPTION A — Ajouter Meeting.type (REGULAR / GENERAL_ASSEMBLY, défaut REGULAR)
[ ] OPTION B — Ne pas ajouter, maintenir GeneralAssembly autonome
[ ] OPTION C — Autre / à préciser

Décision PO :
Option A — Meeting.type = REGULAR | GENERAL_ASSEMBLY, défaut REGULAR.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Préalable
technique aux décisions D-4C4-WEB-01/05/06/07. Non implémentée par
cette clôture — relève du mandat IMPLEMENTATION GO.
```

---

## D-4C4-WEB-03 — Éligibilité des membres à une General Assembly

### Question PO

Comment TANZEN détermine-t-il les membres éligibles à une General Assembly à une date donnée ?

### Faits établis

`Member` (`src/mocks/organization/members.ts`) : `{id, tenantId, firstName, lastName, gender, birthDate, nationality, idNumber, occupation, email, phone, address, joinedAt, status: 'active'|'inactive'|'suspended'|'pending', tenantName, positions[], accounts[], documents[], activities[], governanceParticipation[]}`. `status` est un champ mutable **unique**, sans historique : `organizationService.updateMember` applique `Object.assign(member, patch)` (`organization.service.ts`), qui écrase l'état précédent sans laisser de trace. `joinedAt` capture l'adhésion initiale, pas les réactivations. Aucun champ « date de fin d'activité », aucun champ « droit de participer aux AG » distinct du statut général.

### Sources d'autorité

Code réel (rang 5) pour l'état actuel — confirmé absent d'historisation.

### Sources en conflit

Aucune source (dictionnaire, PHASE_02, UC) ne définit de mécanisme d'éligibilité AG — il ne s'agit pas d'un conflit entre sources mais d'une absence totale de spécification, cohérente avec le classement MODEL_GAP du Decision Gate.

### Option A — État actuel du Member

Éligibilité calculée à partir de `Member.status` au moment du calcul (à la clôture), sans reconstruction historique.

- **Avantages** : simple, immédiatement implémentable avec le modèle existant, aucune migration.
- **Risques** : un membre suspendu puis réactivé juste avant la clôture serait compté éligible même s'il ne l'était pas à la date de l'AG ; un membre actif à la date de l'AG mais suspendu depuis serait exclu à tort. L'historique ne peut jamais être reconstitué fidèlement pour une AG passée.

### Option B — Historisation Member

Ajouter une capacité de reconstruire `Member.status` à une date passée (table d'audit des transitions, ou champs `activeSince`/`inactiveSince`).

- **Modèle** : nouveaux champs ou table associée à `Member`, non spécifiés par aucune source — à concevoir.
- **Migration** : ne peut pas reconstruire rétroactivement l'historique déjà perdu pour les membres existants (les transitions passées n'ont jamais été enregistrées) ; ne s'applique qu'aux transitions futures à partir de sa mise en place.
- **Complexité** : modérée à élevée — modifie le service `updateMember`, potentiellement chaque écran qui affiche le statut.
- **Historique** : correct uniquement à partir de la date de mise en place.
- **Mobile** : le futur modèle offline devrait répliquer l'historique, complexifiant la synchronisation.
- **Backend** : nécessite une table d'audit ou des colonnes de date supplémentaires.

### Option C — Règle explicite d'éligibilité AG

Ajouter un champ dédié (ex. `Member.eligibleForGeneralAssembly: boolean`), distinct du statut général.

- **Modèle** : un nouveau champ sur `Member`.
- **Règles** : qui peut le modifier, à quel moment — non défini par aucune source.
- **Maintenance** : un champ de plus à synchroniser manuellement avec le statut réel du membre, risque de désynchronisation.
- **Audit** : ne résout pas le problème temporel (§ci-dessus) — seulement l'autorisation, pas la date.
- **Mobile/Backend** : impact mineur, un champ supplémentaire à répliquer.

### Option D — Historisation + règle d'éligibilité

Combiner B et C.

- **Robustesse** : la plus complète — couvre à la fois la dimension temporelle (B) et la dimension d'autorisation (C).
- **Complexité** : la plus élevée des quatre options ; cumul des coûts de B et C.

### Analyse comparative

| Critère | Option A | Option B | Option C | Option D |
|---|---|---|---|---|
| Couvre l'état au moment du calcul | Oui | Oui | Oui | Oui |
| Couvre l'état à la date historique de l'AG | Non | Oui (à partir de sa mise en place) | Non | Oui (à partir de sa mise en place) |
| Couvre un droit de participation distinct du statut | Non | Non | Oui | Oui |
| Migration des AG déjà passées | N/A | Impossible rétroactivement | N/A | Impossible rétroactivement pour le volet historisation |
| Effort | Nul | Modéré-élevé | Faible-modéré | Le plus élevé |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Élément factuel, pas un choix imposé : sans une forme d'historisation (B ou D), l'état d'un membre à la date exacte d'une AG passée n'est structurellement pas reconstituible avec le modèle `Member` actuel.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option D — Historisation Member + règle explicite d'éligibilité AG**, conforme à la recommandation implicite (seule option couvrant l'ensemble des règles D-4C4-03 du mandat). **Précision de périmètre explicitement rappelée par le mandat de clôture** : les critères métier détaillés de la règle d'éligibilité (quels champs exacts, quelles transitions historisées, quel mécanisme précis) **ne sont pas inventés ici** — ils restent à préciser lors d'une phase d'implémentation ou d'une décision métier complémentaire. Ce point ne bloque pas la fermeture du Decision Gate — voir `docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md` §Points restant à préciser.

### Décision PO

```text
[☑] OPTION D — Historisation + règle d'éligibilité
[ ] OPTION A — État actuel du Member uniquement
[ ] OPTION B — Historisation Member
[ ] OPTION C — Règle explicite d'éligibilité AG
[ ] AUTRE / À PRÉCISER

Décision PO :
Option D — Historique du membre + règle d'éligibilité AG.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Les critères
métier détaillés de la règle d'éligibilité ne sont PAS définis par
cette décision — signalés comme point à préciser au mandat
IMPLEMENTATION GO, pas inventés ici.
```

---

## D-4C4-WEB-04 — Quorum

### Question PO

Comment TANZEN détermine-t-il si le quorum d'une General Assembly est atteint ?

### Faits établis

Aucun champ, aucune règle de seuil n'existe dans le code ni dans le dictionnaire (fiche #39 `general_assemblies` ne porte aucun champ `quorum_threshold` ni équivalent). `Attendance.status='PRESENT'` est **techniquement dérivable** dès aujourd'hui par `meetingId` (`attendanceService.listAttendancesByMeeting`, déjà implémenté et testé) — c'est la seule brique de la chaîne déjà disponible.

Chaîne à décomposer explicitement :

| Maillon | Disponible aujourd'hui ? |
|---|---|
| `eligible_member_count` | Non — dépend de D-4C4-WEB-03 |
| `present_member_count` | Oui — dérivable d'`Attendance` |
| `quorum_threshold` | Non — aucune source ne le définit |
| `quorum_reached` | Non |
| Moment du figeage | Non — dépend de D-4C4-WEB-05 |

### Sources d'autorité

Aucune. Absence totale confirmée par recherche exhaustive dans le code et les 59 fiches du dictionnaire.

### Sources en conflit

Aucune — absence, pas contradiction.

**Aucun pourcentage, fraction, nombre minimum ou règle de majorité n'est inventé ci-dessous — les options suivantes sont des structures d'arbitrage, pas des valeurs.**

### Option A — Seuil fixe en nombre de membres

Un nombre absolu de membres présents requis (ex. « N membres »), sans référence au nombre d'éligibles.

- Simple à vérifier une fois calculé, mais insensible à la taille du tenant (un tenant de 10 membres et un tenant de 500 membres appliqueraient la même règle si le seuil n'est pas configurable).

### Option B — Seuil en pourcentage des membres éligibles

Un pourcentage des membres éligibles (ex. « X% »).

- S'adapte à la taille du tenant, mais dépend entièrement de `eligible_member_count` (D-4C4-WEB-03) pour être calculable.

### Option C — Règle configurable par type d'Assemblée / tenant

Le seuil (fixe ou pourcentage) est paramétrable, pas figé dans le code.

- Plus flexible, mais nécessite un mécanisme de configuration (par tenant ? par type d'AG — ordinaire vs extraordinaire ?) non spécifié par aucune source, et une UI d'administration correspondante.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| S'adapte à la taille du tenant | Non | Oui | Oui |
| Dépend de D-4C4-WEB-03 (éligibilité) | Non | Oui | Selon la variante |
| Complexité d'implémentation | Faible | Faible-modérée | Élevée (configuration) |
| Source canonique | Aucune | Aucune | Aucune |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Aucune source ne permet de recommander une option plutôt qu'une autre — signalé explicitement comme un vide complet, pas une préférence.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option C — seuil de quorum configurable**, non figé en dur dans le code. Le modèle doit permettre de représenter un seuil configurable, exprimé au minimum sous deux formes : `PERCENTAGE` ou `COUNT`. Champs validés pour porter cette configuration (rattachés à `QuorumSnapshot`, cf. D-4C4-WEB-05) :

| Champ | Rôle |
|---|---|
| `quorum_threshold_type` | `PERCENTAGE` \| `COUNT` |
| `quorum_threshold_value` | Valeur numérique du seuil, interprétée selon `quorum_threshold_type` |

**Aucune valeur numérique de seuil n'est décidée ici** — ni pourcentage, ni fraction, ni nombre minimum, ni règle de majorité. Le mécanisme est validé ; la ou les valeurs concrètes restent un point à préciser au mandat IMPLEMENTATION GO (cf. `docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md` §Points restant à préciser).

### Décision PO

```text
[☑] OPTION C — Règle configurable par type d'Assemblée / tenant
[ ] OPTION A — Seuil fixe en nombre de membres
[ ] OPTION B — Seuil en pourcentage des membres éligibles
[ ] AUTRE / À PRÉCISER

Décision PO :
Option C — seuil de quorum configurable, représenté par
quorum_threshold_type (PERCENTAGE | COUNT) + quorum_threshold_value.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Aucune
valeur numérique de seuil n'est décidée par cette validation — le
mécanisme de représentation est validé, pas une valeur concrète.
```

---

## D-4C4-WEB-05 — QuorumSnapshot

### Question PO

Faut-il introduire une entité `QuorumSnapshot` pour figer le résultat du quorum à la clôture ?

### Faits établis

Recherche exhaustive : `QuorumSnapshot` est absent du code (`src/`, zéro occurrence) et absent des 59 fiches du dictionnaire canonique (table des matières relue intégralement, `#01` à `#59`). Aucun diagramme de classes, aucun Use Case classifié ne le nomme.

### Sources d'autorité

Aucune — MODEL_GAP au niveau spécification, pas seulement implémentation.

### Sources en conflit

Aucune — absence totale, pas de contradiction entre sources existantes.

### Option A — QuorumSnapshot persistant

Une entité séparée, liée à `Meeting`.

**Structure candidate — proposition d'analyse uniquement, non validée** :

| Champ proposé | Rôle |
|---|---|
| `id` | Identifiant |
| `meeting_id` | Relation vers `Meeting` |
| `eligible_member_count` | Nombre de membres éligibles au moment du calcul |
| `present_member_count` | Nombre de membres présents (dérivable d'`Attendance`) |
| `quorum_threshold` | Seuil requis (dépend de D-4C4-WEB-04) |
| `quorum_reached` | Résultat (booléen) |
| `frozen_at` | Horodatage du figeage |

### Option B — Snapshot intégré au Meeting

Les mêmes valeurs (`eligible_member_count`, `present_member_count`, `quorum_threshold`, `quorum_reached`, `frozen_at`) seraient des champs directement sur `Meeting`, sans entité séparée.

- **Simplicité** : pas de nouvelle entité, pas de nouvelle relation à isoler par tenant (héritée directement de `Meeting.tenantId`).
- **Historique** : fonctionne pour un `Meeting` = une AG = un quorum ; ne fonctionnerait pas si un même `Meeting` devait un jour porter plusieurs calculs de quorum successifs (ex. recalcul après contestation) — cas non documenté par aucune source, à signaler si pertinent pour le PO.
- **Responsabilité du modèle** : mélange les informations propres à la réunion (`title`, `status`...) et les informations propres au résultat de gouvernance (`quorum_reached`...) sur une même entité, alors que `Meeting(type=REGULAR)` n'aurait jamais besoin de ces champs (toujours `null`/non pertinents pour un `REGULAR`).
- **Évolution future** : moins extensible si d'autres métriques de gouvernance devaient être ajoutées plus tard.

### Option C — Calcul sans snapshot persistant

Recalculer `eligible_member_count`/`present_member_count`/`quorum_reached` à la demande, à partir des données disponibles (`Attendance`, et l'état courant de `Member` si D-4C4-WEB-03 retient l'Option A).

- **Risque historique** : si l'éligibilité ou le statut des membres change après la clôture, un recalcul ultérieur donnerait un résultat différent de celui annoncé à la clôture — contredit directement la règle « résultat figé à la clôture » du mandat Phase 4C-4 (§8), à moins que D-4C4-WEB-03 ne retienne une historisation complète (Option B/D) qui rendrait le recalcul stable dans le temps.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Conforme à « résultat figé à la clôture » (mandat) | Oui, explicitement | Oui, si les champs ne sont plus modifiés après figeage | Non, sauf si D-4C4-WEB-03 retient une historisation complète |
| Nouvelle entité | Oui | Non | Non |
| Isolation tenant | Indirecte via `meeting_id` | Héritée de `Meeting` directement | N/A (pas de persistance) |
| Extensibilité future | Élevée | Faible | N/A |
| Dépendance | D-4C4-WEB-03, D-4C4-WEB-04 | Idem | D-4C4-WEB-03 (fortement) |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Élément factuel : l'Option C est structurellement en tension avec l'exigence de figeage énoncée par le mandat Phase 4C-4 lui-même, sauf si D-4C4-WEB-03 est tranchée en faveur d'une historisation complète — signalé comme dépendance, pas comme argument contre.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option A — QuorumSnapshot persistant**, une entité séparée rattachée à `Meeting`, conforme à la recommandation (le résultat doit rester figé indépendamment de toute évolution ultérieure de `Member`). **Modèle définitif validé** (remplace la structure candidate précédemment marquée « proposition d'analyse, non validée ») :

| Champ | Rôle |
|---|---|
| `id` | Identifiant |
| `meeting_id` | Relation vers `Meeting` |
| `eligible_member_count` | Nombre de membres éligibles au moment du calcul |
| `present_member_count` | Nombre de membres présents (dérivable d'`Attendance`) |
| `quorum_threshold_type` | `PERCENTAGE` \| `COUNT` (D-4C4-WEB-04) |
| `quorum_threshold_value` | Valeur du seuil (D-4C4-WEB-04) |
| `quorum_reached` | Résultat (booléen) |
| `frozen_at` | Horodatage du figeage |
| `created_at` | Horodatage de création de l'enregistrement |

Contrainte validée : `UNIQUE(meeting_id)` — un `Meeting` ne porte qu'un seul `QuorumSnapshot`. Non implémentée par cette clôture.

### Décision PO

```text
[☑] OPTION A — QuorumSnapshot persistant (entité séparée)
[ ] OPTION B — Snapshot intégré au Meeting (champs directs)
[ ] OPTION C — Calcul sans snapshot persistant
[ ] AUTRE / À PRÉCISER

Décision PO :
Option A — QuorumSnapshot persistant, rattaché à Meeting via
meeting_id, UNIQUE(meeting_id). Champs : id, meeting_id,
eligible_member_count, present_member_count, quorum_threshold_type,
quorum_threshold_value, quorum_reached, frozen_at, created_at.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Modèle de
champs désormais définitif (plus une simple proposition d'analyse).
Non implémentée par cette clôture — relève du mandat IMPLEMENTATION GO.
```

---

## D-4C4-WEB-06 — AssemblyDecision

### Question PO

Comment représenter une décision prise pendant une General Assembly ?

### Faits établis

`AssemblyDecision` est absent du code physique confirmé (`src/`, zéro occurrence) et absent des 59 fiches du dictionnaire canonique. Seul rapprochement identifié : `UCX5-01 — « Exécuter les décisions »` (`PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 574, acteur Admin Tenant, `«extend»` depuis « Planifier une réunion », ressource notée `GeneralAssembly (décision)`) — confirme la **notion** fonctionnelle, sans schéma de champs (aucun Use Case de ce corpus n'en porte, déjà établi en Phase 4C-3 §15 de son Decision Gate).

**Vérification demandée par le mandat** : existe-t-il une entité `Decision` générique réutilisable ailleurs dans les sources ? Recherche exhaustive du dictionnaire : **NOT FOUND**. Le seul champ portant le mot « decision » dans tout le dictionnaire est `workflow_actions.decision` (fiche #57, `VARCHAR(20) CHECK IN ('APPROVED','REJECTED','RETURNED','CANCELLED')`) — un champ d'**issue d'une action d'approbation de workflow**, pas une entité de résolution d'assemblée. Sémantique et domaine différents (Operations/Workflow, pas Governance) ; **aucune entité générique `Decision` n'existe à réutiliser**.

### Sources d'autorité

`PHASE_04_USE_CASE_CLASSIFICATION.md` (UCX5-01, rang 3) pour la notion fonctionnelle uniquement. Aucune source de rang 1, 2, 4, 5 ou 6 ne fournit de schéma.

### Sources en conflit

Aucune — absence totale de spécification physique, pas de contradiction entre sources.

### Option A — AssemblyDecision lié directement à Meeting

`Meeting → AssemblyDecision`, cohérent avec l'architecture cible (§6).

Champs à arbitrer (aucun n'est validé) : `title`, `description`, `decision_number` (génération automatique séquentielle, ou saisie manuelle — non défini), `status` (vocabulaire non défini, aucune source ne propose d'énumération contrairement à `Meeting.status`/`Attendance.status`), `decided_at` (distinct de `created_at` ? non défini), `created_by` (cohérent par analogie avec `documents.uploaded_by` au dictionnaire, mais non confirmé pour cette entité spécifiquement), lifecycle (immuable après clôture du `Meeting`, par analogie avec `Attendance` D-4C3-WEB-03 ? aucune source ne l'affirme ni ne l'infirme pour `AssemblyDecision` — **ne pas étendre automatiquement**), relation avec `Meeting` (`meeting_id`).

### Option B — Decision générique réutilisable

**NOT FOUND — aucune entité de ce type n'existe dans les sources.** Cette option ne peut être présentée qu'à titre hypothétique : elle consisterait à construire une entité `Decision` transverse (potentiellement partagée avec d'autres domaines, comme `workflow_actions.decision` s'en rapproche par le nom sans en partager le sens). Aucune source ne la réclame, ne la spécifie, ni ne suggère qu'elle devrait exister — présentée uniquement parce que le mandat demande explicitement de vérifier son existence, pas parce qu'elle est recommandable.

### Option C — Autre structure

Non documentée — à ne renseigner que si le PO impose une source non consultée par cette mission.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Cohérence avec l'architecture cible (§6) | Oui | Non (nécessiterait de repenser toute l'architecture) | Indéterminé |
| Source existante | Notion seule (UCX5-01) | Aucune (NOT FOUND) | Aucune |
| Effort de spécification | Élevé (rien n'est défini) | Le plus élevé (entité entièrement nouvelle, plus large) | Indéterminé |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Élément factuel : l'Option B n'a aucune assise documentaire — sa présence ici répond à l'exigence du mandat de vérifier son existence avant de l'écarter, pas à une préférence.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option A — `AssemblyDecision` liée directement à `Meeting`** (`Option B — Decision générique réutilisable` écartée, cohérent avec le constat NOT FOUND). Une General Assembly peut comporter plusieurs décisions (`Meeting(type=GENERAL_ASSEMBLY)` → `1..N AssemblyDecision`).

**Champs définitifs validés** (remplace la liste « à arbitrer » précédente) :

```
id
meeting_id
decision_number
title
description
status
created_by
created_at
updated_at
submitted_at
decided_at
```

**`tenant_id` explicitement exclu** — voir D-4C4-WEB-09 (Option B validée : le tenant est dérivé de `Meeting`).

**Cycle de vie validé** :

```
DRAFT → SUBMITTED → VOTING → DECIDED
```

Annulation : `DRAFT → CANCELLED`, `SUBMITTED → CANCELLED`. États terminaux : `DECIDED`, `CANCELLED` (aucune transition sortante). Aucun autre état n'est ajouté. Ce cycle de vie n'était pas envisagé par le Decision Gate initial (qui signalait « aucune source ne propose d'énumération » pour `status`) — il est désormais explicitement fourni et validé par le PO, résolvant ce point resté ouvert.

Non implémentée par cette clôture.

### Décision PO

```text
[☑] OPTION A — AssemblyDecision lié directement à Meeting
[ ] OPTION B — Decision générique réutilisable (NOT FOUND dans les sources)
[ ] OPTION C — Autre structure
[ ] AUTRE / À PRÉCISER

Décision PO :
Option A. Champs : id, meeting_id, decision_number, title,
description, status, created_by, created_at, updated_at,
submitted_at, decided_at (pas de tenant_id, cf. D-4C4-WEB-09).
Lifecycle : DRAFT → SUBMITTED → VOTING → DECIDED ; annulation
DRAFT/SUBMITTED → CANCELLED ; DECIDED et CANCELLED terminaux.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Modèle de
champs et lifecycle désormais définitifs. Non implémentée par cette
clôture — relève du mandat IMPLEMENTATION GO.
```

---

## D-4C4-WEB-07 — Vote FK (DÉCISION CRITIQUE)

### Question PO

Quelle est la clé étrangère cible de `Vote` : `assembly_id → assemblies.id`, `assembly_id → general_assemblies.id`, ou `meeting_id → meetings.id` ?

### Faits établis

Code actuel (`src/mocks/organization/governance.ts`) : `Vote = {id, tenantId, subject, date, yes, no, abstain, result: 'adopted'|'rejected'|'pending'}` — **autonome**, `tenantId` direct, aucune FK vers une assemblée ou une réunion. Ce rattachement était déjà identifié comme sujet ouvert et jamais tranché : `docs/PHASE_06_DECISIONS_A_VALIDER.md` §1 (« `Vote.assemblyId`... Question à trancher »).

### Sources d'autorité

Trois sources distinctes, à des rangs différents, en désaccord :
- Dictionnaire (rang 6), fiche #40, `docs/audit/excel_dictionary_dump.txt:1062` : `assembly_id BIGINT FK → assemblies.id`.
- `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2), ligne 102 : `VOTES: FK_assembly_id → general_assemblies(id)`.
- Architecture cible du mandat Phase 4C-4 (rang non encore formalisé, cf. §4 de ce document) : `meeting_id → Meeting.id`.

### Sources en conflit

**Toutes les trois sont en conflit les unes avec les autres**, et aucune ne coïncide avec le code actuel (autonome, sans FK du tout). Ce n'est pas un conflit à deux mais à trois voies.

### Option A — assembly_id → assemblies.id

| | Détail |
|---|---|
| Source | Dictionnaire (rang 6), fiche #40 |
| Cohérence architecture | La table `assemblies` du dictionnaire ne correspond à aucune entité clairement identifiée dans le code actuel — le code a un type `Assembly` générique dans `governance.ts` (`type: 'generalAssembly'|'extraordinaryAssembly'|'boardAssembly'`), distinct de `GeneralAssembly` (fiche #39) ; le dictionnaire ne clarifie pas lequel des deux il visait |
| Migration | Nécessiterait de construire `assemblies` comme table physique, aujourd'hui inexistante en tant que telle |
| Web | Nouveau champ + réécriture de `createVote`/`updateVoteResult` |
| Mobile | Aucun impact immédiat (`Vote` inexistant côté Mobile) |
| Backend | Nécessiterait une table `assemblies` physique, dont l'identité exacte reste ambiguë |
| Tenant isolation | Indirecte, via une table dont l'existence physique n'est pas confirmée |
| Cohérence avec GeneralAssembly (D-4C4-WEB-01) | Indépendante — n'implique ni ne contredit le sort de `GeneralAssembly` |
| Risques | Ambiguïté non résolue sur ce qu'est réellement `assemblies.id` |

### Option B — assembly_id → general_assemblies.id

| | Détail |
|---|---|
| Source | `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) — le document que ce projet a lui-même désigné comme référence unique en cas de divergence (en-tête du document) |
| Cohérence architecture | Respecte le document canonique verrouillé tel qu'il existe **aujourd'hui**, sans modification |
| Migration | Aucune migration de `Vote` nécessaire au-delà de l'ajout du champ, si `GeneralAssembly` reste une table physique |
| Web | Nouveau champ + réécriture du service `Vote`, en gardant `general-assembly.service.ts` |
| Mobile | Aucun impact immédiat |
| Backend | Nécessite que `general_assemblies` (fiche #39) reste physiquement construite |
| Tenant isolation | Indirecte, confirmée par le rang 2 (`assembly_id→General_assemblies.tenant_id`) |
| Cohérence avec GeneralAssembly (D-4C4-WEB-01) | **Incompatible avec toute option de D-4C4-WEB-01 qui supprime `general_assemblies` comme table physique** (c.-à-d. incompatible avec D-4C4-WEB-01 Option B) |
| Risques | Verrouille `GeneralAssembly` comme table permanente, à l'encontre de l'intention explicite du mandat Phase 4C-4 |

### Option C — meeting_id → meetings.id

| | Détail |
|---|---|
| Source | Architecture cible des mandats Phase 4C-4 — pas encore un document verrouillé au même titre que les deux précédents |
| Cohérence architecture | Cohérente avec l'architecture cible §6 et avec D-4C4-WEB-01 si celui-ci retient l'Option B/C |
| Migration | Nécessite d'ajouter `meeting_id` à `Vote`, de migrer les 5 votes mock existants — **aucun mapping actuel n'existe** pour rattacher sans ambiguïté un `Vote` existant à un `Meeting` (les votes actuels ne référencent ni assemblée ni réunion) |
| Web | Nouveau champ + réécriture du service `Vote` |
| Mobile | Aucun impact immédiat, mais seule option qui permettrait au futur modèle Mobile de ne construire qu'un seul concept (`Meeting`) au lieu de deux |
| Backend | Nécessite l'ajout de `meeting_id` à `votes`, absent du dictionnaire actuel — GAP documentaire supplémentaire si retenue |
| Tenant isolation | Indirecte, via `Meeting.tenantId` — mécanisme déjà prouvé et testé pour `Attendance`, directement réutilisable |
| Cohérence avec GeneralAssembly (D-4C4-WEB-01) | **Requiert que D-4C4-WEB-01 retienne une option qui élimine ou rend secondaire `general_assemblies`** — les deux décisions sont couplées |
| Risques | Nécessite une mise à jour formelle de `PHASE_02_MODELE_CANONIQUE_FINAL.md`, sans quoi ce document et le code resteraient durablement contradictoires |

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Respecte le dictionnaire (rang 6) | Oui | Non | Non |
| Respecte `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) | Non | Oui | Non |
| Cohérent avec l'architecture cible du mandat | Non | Non | Oui |
| Couplé à D-4C4-WEB-01 | Non | Oui (requiert GeneralAssembly conservé) | Oui (requiert GeneralAssembly migré) |
| Migration des 5 votes existants | Ambiguë | Ambiguë | Ambiguë (aucune option n'a de mapping évident) |
| Nécessite une mise à jour d'un document verrouillé | Non | Non | Oui (`PHASE_02_MODELE_CANONIQUE_FINAL.md`) |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

**Le PO n'est pas invité à choisir cette décision indépendamment de D-4C4-WEB-01** : Option B de D-4C4-WEB-07 n'a de sens que si `GeneralAssembly` est conservée (D-4C4-WEB-01 Option A) ; Option C n'a de sens que si `GeneralAssembly` est migrée (D-4C4-WEB-01 Option B/C). Ce couplage est un fait structurel, pas une recommandation.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option C — `Vote.meeting_id → Meeting.id`**, cohérente avec D-4C4-WEB-01 (Option B, migration de `GeneralAssembly` vers `Meeting.type`) — le couplage signalé par ce Decision Gate est ainsi résolu de façon cohérente, pas contradictoire. Les propositions `assembly_id → assemblies.id` (Option A) et `assembly_id → general_assemblies.id` (Option B) **ne sont pas retenues** comme modèle cible.

**Conséquence documentaire explicite** : cette décision met `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2, ligne 102 : `FK_assembly_id → general_assemblies(id)`) et le dictionnaire (rang 6, fiche #40 : `assembly_id → assemblies.id`) en décalage avec le modèle désormais validé — une mise à jour de ces documents reste recommandée (non réalisée par cette clôture, qui reste documentaire au sens strict de ce pack, pas une modification des sources canoniques elles-mêmes). Non implémentée en code par cette clôture.

### Décision PO

```text
[☑] OPTION C — meeting_id → meetings.id
[ ] OPTION A — assembly_id → assemblies.id
[ ] OPTION B — assembly_id → general_assemblies.id
[ ] AUTRE / À PRÉCISER

Décision PO :
Option C — Vote.meeting_id → Meeting.id. Options A et B écartées.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Cohérente
avec D-4C4-WEB-01 (Option B). Met PHASE_02_MODELE_CANONIQUE_FINAL.md
et le dictionnaire en décalage — mise à jour de ces documents
recommandée séparément, non faite par cette clôture. Non implémentée
en code — relève du mandat IMPLEMENTATION GO.
```

---

## D-4C4-WEB-08 — Relation Decision → Vote

### Question PO

Un `Vote` appartient-il directement à une `AssemblyDecision` ?

### Faits établis

Ni `AssemblyDecision` ni la relation `Decision → Vote` n'existent en code. Le dictionnaire (rang 6) et `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) ne connaissent pas `AssemblyDecision` du tout — ils font de `Vote` un enfant **direct** de l'assemblée elle-même (`assemblies`/`general_assemblies` selon la source, jamais d'une entité « décision » intermédiaire). Le mandat rappelle explicitement la règle métier : *« Decision peut exister sans Vote »* et *« Vote peut éventuellement contribuer à une Decision »* — ce qui exclut par construction une FK obligatoire de `Vote` vers `AssemblyDecision`.

### Sources d'autorité

Aucune source ne confirme une structure à trois niveaux (`Meeting → AssemblyDecision → Vote`). Le dictionnaire et le rang 2 confirment plutôt une structure à deux niveaux (`assemblies`/`general_assemblies` → `Vote` directement).

### Sources en conflit

L'architecture cible du mandat (`Meeting → AssemblyDecision → Vote`) contredit la structure observée dans le dictionnaire et `PHASE_02_MODELE_CANONIQUE_FINAL.md` (assemblée → Vote directement, sans décision intermédiaire).

### Option A — AssemblyDecision → Vote

```
AssemblyDecision
      │
      └── Vote
```

Un `Vote` référence toujours une `AssemblyDecision` (FK obligatoire ou nullable — à préciser si retenue).

- Cohérent avec l'architecture cible §6 du mandat.
- Non corroboré par le dictionnaire ni par le rang 2, qui n'ont jamais connu `AssemblyDecision`.
- Contredit potentiellement la règle rappelée par le mandat lui-même (« Vote peut éventuellement contribuer à une Decision ») si la FK est rendue obligatoire — devrait alors être nullable pour rester cohérent.

### Option B — Vote appartient directement au Meeting, référence éventuellement Decision

```
Meeting
   ├── AssemblyDecision (FK meeting_id nullable vers Vote, ou l'inverse)
   └── Vote (FK meeting_id, FK decision_id nullable)
```

`Vote` et `AssemblyDecision` sont tous deux des enfants directs de `Meeting`, avec un lien optionnel entre eux.

- **Plus proche du modèle observé dans les sources rang 2/6** : ces documents rattachent `Vote` directement à l'entité d'assemblée (pas à une décision intermédiaire) — remplacer « assemblée » par « Meeting » (cohérent avec D-4C4-WEB-07 Option C) donne exactement cette structure.
- Respecte littéralement la règle « Decision peut exister sans Vote » et « Vote peut éventuellement contribuer à une Decision » sans avoir besoin de rendre une FK nullable de façon artificielle — les deux entités sont indépendantes par construction, reliées optionnellement.
- Nécessite deux FK sur `Vote` potentiellement (`meeting_id` + `decision_id` nullable) ou une table de jonction, selon le choix de modélisation — non tranché par cette option elle-même.

### Option C — Autre relation si une source l'établit

Non trouvée dans les sources consultées.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Cohérence avec l'architecture cible du mandat (§6) | Oui, littéralement | Partielle (Vote et Decision tous deux sous Meeting, mais pas Vote sous Decision) | Indéterminé |
| Cohérence avec dictionnaire/rang 2 (assemblée → Vote direct) | Non | Oui (en substituant Meeting à l'assemblée) | Indéterminé |
| Respecte « Decision peut exister sans Vote » sans artifice | Nécessite FK nullable | Oui, nativement | Indéterminé |
| Lifecycle | Vote dépendrait du lifecycle de Decision (à définir, §D-4C4-WEB-06) | Vote et Decision ont des lifecycles indépendants, chacun rattaché à celui de Meeting | Indéterminé |
| Audit | Un Vote sans Decision serait une exception à gérer explicitement dans le code si A | Aucune exception à gérer, cas normal si B | Indéterminé |
| Mobile/Backend | Pas de différence significative identifiée | Pas de différence significative identifiée | Indéterminé |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Élément factuel à signaler, pas un arbitrage : l'Option B est la seule qui prolonge directement le modèle déjà observé dans le dictionnaire et dans `PHASE_02_MODELE_CANONIQUE_FINAL.md` (où `Vote` n'a jamais eu de parent « décision », seulement un parent « assemblée ») ; l'Option A correspond littéralement à l'architecture cible telle que dessinée dans les mandats Phase 4C-4, sans confirmation par une source antérieure.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option A — `Vote` directement rattaché à `AssemblyDecision`**, avec une précision qui va au-delà du libellé initial de l'Option A : `Vote` **conserve également** `Vote.meeting_id` (hérité de D-4C4-WEB-07), pas seulement `Vote.assembly_decision_id`. C'est donc une variante d'Option A qui emprunte à Option B le maintien d'un lien direct au `Meeting` :

```
Vote.assembly_decision_id → AssemblyDecision.id
Vote.meeting_id           → Meeting.id
```

**Règle d'intégrité validée** : `Vote.meeting_id = AssemblyDecision.meeting_id` — un `Vote` ne peut pas être rattaché à une `AssemblyDecision` appartenant à un autre `Meeting`. Cette règle devra être appliquée applicativement (par analogie avec le pattern déjà en place pour `createMeeting` forçant `tenantId`, cf. Phase 4C-3) ; non implémentée par cette clôture. Non implémentée en code.

### Décision PO

```text
[☑] OPTION A — AssemblyDecision → Vote (FK sur Vote vers Decision), variante
     avec Vote.meeting_id conservé en parallèle
[ ] OPTION B — Vote appartient au Meeting, référence éventuellement Decision
[ ] OPTION C — Autre relation
[ ] AUTRE / À PRÉCISER

Décision PO :
Option A (variante) — Vote.assembly_decision_id → AssemblyDecision.id
ET Vote.meeting_id → Meeting.id conservés simultanément. Règle
d'intégrité : Vote.meeting_id = AssemblyDecision.meeting_id.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Cette
variante diffère du libellé strict de l'Option A analysée (qui
n'envisageait pas explicitement le maintien de meeting_id) — signalé
pour traçabilité, pas silencieusement fondu dans l'option d'origine.
Non implémentée par cette clôture — relève du mandat IMPLEMENTATION GO.
```

---

## D-4C4-WEB-09 — tenant_id sur AssemblyDecision

### Question PO

Faut-il conserver `tenant_id` directement sur `AssemblyDecision`, ou le dériver uniquement de `Meeting` ?

### Faits établis

La structure candidate d'`AssemblyDecision` proposée par les mandats Phase 4C-4 porte à la fois `tenant_id` et `meeting_id` (§D-4C4-WEB-06). C'est une exception au sein du modèle Governance : `Attendance` (déjà validée, Phase 4C-3) n'a **pas** de `tenant_id` direct, isolation garantie uniquement via `meetingId → Meeting.tenantId`. `Meeting`/`GeneralAssembly` (aujourd'hui)/`Vote` (code actuel) ont, eux, tous un `tenant_id` direct.

### Sources d'autorité

Aucune source canonique ne spécifie `AssemblyDecision` (§D-4C4-WEB-06) — cette question n'a donc pas de source d'autorité au sens strict, seulement un précédent de cohérence interne au projet (`Attendance`, Phase 4C-3, la décision la plus récente et structurellement la plus proche).

### Sources en conflit

Aucune, faute de source définissant `AssemblyDecision`.

### Option A — Conserver tenant_id + meeting_id

- **Isolation** : redondante mais directe — une requête peut filtrer par `tenant_id` sans jointure.
- **Intégrité** : un `tenant_id` et un `meeting_id` incohérents entre eux (`tenant_id` du tenant A, `meeting_id` pointant vers un `Meeting` du tenant B) deviennent possibles si le service ne les valide pas l'un contre l'autre à chaque écriture — un risque de bug de cohérence, pas seulement de style.
- **Contraintes** : nécessiterait une validation applicative supplémentaire (comme `createMeeting` force déjà `tenantId` en ignorant toute valeur d'entrée, cf. Phase 4C-3) pour empêcher la divergence.
- **Performance** : légèrement meilleure pour les requêtes filtrant uniquement par tenant sans besoin du détail du Meeting.
- **Risque de divergence** : réel si non validé applicativement.

### Option B — Supprimer tenant_id, dériver depuis Meeting

- **Isolation** : indirecte, via `meeting_id → Meeting.tenantId` — mécanisme déjà prouvé et testé pour `Attendance` (Phase 4C-3).
- **Intégrité** : une seule source de vérité, aucune divergence possible par construction.
- **Contraintes** : aucune validation croisée nécessaire.
- **Performance** : légèrement moindre (jointure/lookup nécessaire), non chiffrée par aucune source, jugée négligeable par analogie avec `Attendance` (déjà en production logique avec ce pattern).
- **Risque de divergence** : nul.

### Option C — Autre stratégie

Non documentée par aucune source.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Risque d'incohérence tenant_id/meeting_id | Réel si non validé | Nul | Indéterminé |
| Cohérence avec `Attendance` (précédent le plus récent) | Non | Oui | Indéterminé |
| Cohérence avec `Meeting`/`GeneralAssembly`/`Vote` (pattern historique) | Oui | Non | Indéterminé |
| Performance | Légèrement meilleure | Légèrement moindre (non chiffré) | Indéterminé |
| Effort d'implémentation | Nécessite une validation croisée supplémentaire | Aucune validation croisée nécessaire | Indéterminé |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Élément de cohérence à signaler : le précédent le plus récent et structurellement le plus proche (`Attendance`, une entité rattachée à `Meeting` et créée après une réunion, exactement comme le serait `AssemblyDecision`) a retenu l'absence de `tenant_id` direct — un argument en faveur de l'Option B, sans valeur de règle générale automatiquement transposable.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option B — ne pas stocker `tenant_id` sur `AssemblyDecision`**, conforme à la recommandation implicite et cohérente avec le précédent `Attendance` (Phase 4C-3). Le tenant est exclusivement dérivé de `AssemblyDecision → Meeting → Meeting.tenant_id`. `AssemblyDecision.tenant_id` **n'existe pas** dans le modèle cible (cohérent avec les champs définitifs validés en D-4C4-WEB-06, qui n'incluent pas `tenant_id`). Toute future opération sur `AssemblyDecision` devra respecter l'isolation tenant via `Meeting`, par le même mécanisme déjà prouvé et testé pour `Attendance`. Non implémentée par cette clôture.

### Décision PO

```text
[☑] OPTION B — Supprimer tenant_id, dériver depuis Meeting
[ ] OPTION A — Conserver tenant_id + meeting_id
[ ] OPTION C — Autre stratégie
[ ] AUTRE / À PRÉCISER

Décision PO :
Option B — AssemblyDecision.tenant_id n'existe pas ; isolation
exclusivement via AssemblyDecision.meeting_id → Meeting.tenant_id.

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). Cohérente
avec le modèle de champs D-4C4-WEB-06 et avec le précédent Attendance
(Phase 4C-3). Non implémentée — relève du mandat IMPLEMENTATION GO.
```

---

## D-4C4-WEB-10 — VoteOption / MemberVote

### Question PO

Comment représenter les options de vote et le vote individuel d'un membre ?

### Faits établis

Les deux entités sont **absentes du code réel** (`src/`, recherche exhaustive, zéro occurrence pour chacune). Le dictionnaire canonique les spécifie :
- Fiche #41 `vote_options` (`docs/audit/excel_dictionary_dump.txt:1078-1089`) : `{id, vote_id FK, label}`, contrainte `UNIQUE(vote_id, label)`.
- Fiche #42 `member_votes` (`:1091-1111`) : `{id, vote_id FK, member_id FK, option_id FK NOT NULL, voted_at}`, `UNIQUE(vote_id, member_id)`, `UNIQUE(vote_id, member_id, option_id)`.

**Affirmations historiques à ne pas accepter sans preuve** : `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` ligne 110 affirme `VoteOption` « IMPLEMENTED » ; ligne 111 affirme `MemberVote` « PARTIALLY_IMPLEMENTED ». **Ces deux affirmations sont directement contredites par l'inspection du code de tanzen-frontend** (absence totale, pas une implémentation partielle) — écartées comme preuves, conformément à la règle absolue #16 de ne pas considérer un ancien audit comme preuve suffisante.

### Sources d'autorité

Dictionnaire (rang 6) pour le schéma proposé — c'est la seule source qui spécifie réellement des champs pour ces deux entités, à reprendre fidèlement si retenue (le mandat demande explicitement de citer une source canonique si elle existe, plutôt que d'inventer). `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) confirme la structure `MEMBER_VOTES: FK_vote_id, FK_member_id, FK_option_id→vote_options(id), voted_at, UQ(vote_id, member_id)` (ligne 105) — cohérente avec le dictionnaire sur ces deux entités spécifiquement (contrairement au désaccord sur la FK de `Vote` lui-même, §D-4C4-WEB-07).

### Sources en conflit

Aucune entre le dictionnaire et le rang 2 pour `VoteOption`/`MemberVote` eux-mêmes — le désaccord porte uniquement sur la FK parente de `Vote` (D-4C4-WEB-07), qui détermine indirectement la chaîne d'isolation tenant de ces deux entités (§16), pas leur structure propre.

### VoteOption — éléments à valider

| Champ | Source | Statut |
|---|---|---|
| `vote_id` (relation Vote) | Dictionnaire fiche #41, confirmé rang 2 | STRUCTURE À VALIDER (dépend de D-4C4-WEB-07 pour la chaîne complète) |
| `label` (libellé) | Dictionnaire fiche #41 | STRUCTURE À VALIDER |
| Ordre éventuel | **NOT FOUND** — aucune source ne mentionne d'ordre d'affichage | Non spécifié, à arbitrer si jugé nécessaire |
| Statut éventuel | **NOT FOUND** — aucune source ne mentionne un statut sur `VoteOption` | Non spécifié |
| Contrainte d'unicité | `UNIQUE(vote_id, label)`, dictionnaire fiche #41 | STRUCTURE À VALIDER |

### MemberVote — éléments à valider

| Champ | Source | Statut |
|---|---|---|
| `vote_id` (relation Vote) | Dictionnaire fiche #42, rang 2 ligne 105 | STRUCTURE À VALIDER |
| `member_id` (relation Member) | Dictionnaire fiche #42, rang 2 | STRUCTURE À VALIDER |
| `option_id` (option sélectionnée) | Dictionnaire fiche #42 : `NOT NULL` — chaque `MemberVote` suppose que le vote concerné a au moins une option | STRUCTURE À VALIDER |
| `voted_at` (timestamp) | Dictionnaire fiche #42, rang 2 | STRUCTURE À VALIDER |
| Statut éventuel | **NOT FOUND** — aucune source ne mentionne un statut sur `MemberVote` | Non spécifié |
| Unicité Member/Vote | `UNIQUE(vote_id, member_id)` **et** `UNIQUE(vote_id, member_id, option_id)`, dictionnaire fiche #42 | STRUCTURE À VALIDER — un membre ne peut voter qu'une fois par `Vote` (première contrainte), la seconde est redondante avec la première si `option_id` est toujours renseigné pour un même `(vote_id, member_id)` |

### Analyse comparative

Cette décision n'oppose pas plusieurs options concurrentes (contrairement aux autres) : la seule structure disponible provient du dictionnaire, cohérente entre rang 6 et rang 2. La décision porte sur **l'adoption ou non de cette structure telle quelle**, et sur sa dépendance à D-4C4-WEB-07 pour la chaîne complète d'isolation tenant.

| Critère | Adopter la structure dictionnaire telle quelle | Modifier/compléter (ordre, statut) | Ne pas construire pour l'instant |
|---|---|---|---|
| Source | Rang 6 + rang 2, cohérents entre eux | Aucune source pour les champs additionnels — à arbitrer sans base documentaire | N/A |
| Effort | Standard, deux entités à créer | Standard + champs non spécifiés à concevoir | Nul |
| Dépendance | D-4C4-WEB-07 (FK parente de Vote) | Idem | Aucune |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO (historique)

Élément factuel : contrairement à `QuorumSnapshot`/`AssemblyDecision` (aucune fiche dictionnaire), `VoteOption`/`MemberVote` disposent d'un schéma canonique cohérent entre deux sources indépendantes (rang 6 et rang 2) — la décision porte donc principalement sur le calendrier de construction et la résolution préalable de D-4C4-WEB-07, pas sur l'invention d'un schéma.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé le modèle **VoteOption + MemberVote** — une extension du schéma dictionnaire (rang 6/rang 2) plutôt qu'une adoption strictement littérale (ajout de `code`, `display_order`, `updated_at` non prévus par la fiche #41/#42).

**VoteOption — champs validés** :

```
id
vote_id
code
label
display_order
created_at
```

**MemberVote — champs validés** :

```
id
vote_id
member_id
vote_option_id
voted_at
created_at
updated_at
```

**Contrainte validée** : `UNIQUE(vote_id, member_id)` — un membre ne peut enregistrer qu'un seul vote pour un même `Vote` (la seconde contrainte dictionnaire, `UNIQUE(vote_id, member_id, option_id)`, redondante avec la première dans ce modèle, n'est pas reprise séparément).

**Précision explicite rappelée par le mandat de clôture** : les valeurs `POUR`/`CONTRE`/`ABSTENTION` **ne sont pas déclarées comme liste universelle obligatoire** en l'absence de décision complémentaire — les options concrètes de chaque `Vote` sont représentées par des enregistrements `VoteOption`, pas par une énumération figée dans le code. Non implémenté par cette clôture.

### Décision PO

```text
[☑] ADOPTER + compléter (code, display_order, updated_at ajoutés au schéma dictionnaire)
[ ] ADOPTER la structure dictionnaire telle quelle (vote_options, member_votes)
[ ] NE PAS CONSTRUIRE pour l'instant
[ ] AUTRE / À PRÉCISER

Décision PO :
VoteOption {id, vote_id, code, label, display_order, created_at}.
MemberVote {id, vote_id, member_id, vote_option_id, voted_at,
created_at, updated_at}. UNIQUE(vote_id, member_id).

Commentaire :
Validée dans le cadre de la clôture du Decision Gate Phase 4C-4
(docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md). POUR/CONTRE/
ABSTENTION ne sont pas une liste universelle obligatoire — représentées
par VoteOption au cas par cas. Non implémenté — relève du mandat
IMPLEMENTATION GO.
```

---

## 15. RBAC

**Fondation existante, pas une décision Phase 4C-4** : `governance.read`, `governance.create`, `governance.update`, `governance.approve`, `governance.delete` (`src/mocks/rbac.mocks.ts:55`).

### Question

Les permissions Governance existantes couvrent-elles suffisamment les opérations General Assembly / Decision / Vote ?

Couverture actuelle observée : un seul groupe `governance.*` partagé entre `Meeting`, `Attendance`, `GeneralAssembly` et `Vote` (code actuel) — jamais de permission par sous-entité, y compris pour les 4 entités déjà construites. Par cohérence de pattern, ce même catalogue **semble** suffisant pour `QuorumSnapshot`/`AssemblyDecision`/`VoteOption`/`MemberVote` — observation, pas une validation.

**Option recommandée à analyser (non tranchée par ce document)** : conserver le catalogue existant, sans créer `assembly.*`, `vote.*`, `decision.*`. Toute lacune constatée lors d'une future implémentation reste `DECISION_REQUIRED`, à traiter à ce moment-là — **aucune permission n'est créée par ce pack**.

## 16. Tenant isolation

| Relation | Mécanisme | Statut |
|---|---|---|
| `Meeting → tenant` | `tenantId` direct, testé | GO |
| `Attendance → Meeting → tenant` | Indirect, testé | GO |
| `QuorumSnapshot → Meeting → tenant` | Proposé (indirect), dépend de D-4C4-WEB-05 | MODEL_GAP |
| `AssemblyDecision → Meeting → tenant` | Dépend de D-4C4-WEB-09 (redondance `tenant_id`+`meeting_id` à trancher) | DECISION_REQUIRED |
| `Vote → Decision/Meeting → tenant` | Dépend de D-4C4-WEB-07 (aujourd'hui : `tenantId` direct, code) | DECISION_REQUIRED |
| `VoteOption → Vote → tenant` | Indirect via `vote_id`, dépend de D-4C4-WEB-07/10 | MODEL_GAP |
| `MemberVote → Vote + Member → tenant` | Indirect via `vote_id`/`member_id`, dépend de D-4C4-WEB-07/10 | MODEL_GAP |

**Redondance identifiée** : `AssemblyDecision` serait la seule entité de toute la chaîne à porter potentiellement un `tenant_id` direct en plus d'une relation parente suffisante à elle seule — objet de D-4C4-WEB-09. Rien n'est modifié ici.

## 17. Offline / Mobile

Aucun code Governance concret n'existe dans `tanzen-mobile` (confirmé par l'audit d'impact précédent, recherche exhaustive dans `src/`, `app/`, `tests/`). Impact futur documenté (non actionné) :
- L'infrastructure offline générique de `tanzen-mobile` (`sync_outbox` à colonne `entity` libre, `TenantScopedRepository<T>`, `sync_status`/`version` déjà en place pour `Member`/`Organization`) est explicitement conçue pour être réutilisée sans modification par de futures entités métier.
- `QuorumSnapshot` poserait une question de synchronisation spécifique (calcul serveur unique vs calculable localement hors-ligne) — non tranchée ici, à statuer lors d'une future mission Mobile.
- Le pattern d'idempotence déjà validé en Phase 4C-3 (`operationId` + `UNIQUE`) est directement transposable à `MemberVote` (`UNIQUE(vote_id, member_id)`) si D-4C4-WEB-10 retient la structure dictionnaire.

**Aucune décision Mobile n'est créée dans ce pack** — le Mobile sera traité après stabilisation du modèle Web, conformément à la méthodologie déjà appliquée en Phase 4C-3.

## Synthèse PO

| ID | Sujet | Choix retenu | Statut |
|---|---|---|---|
| D-4C4-WEB-01 | Migration GeneralAssembly | Option B — Meeting.type remplace GeneralAssembly | 🟢 VALIDÉE |
| D-4C4-WEB-02 | Meeting.type | Option A — REGULAR / GENERAL_ASSEMBLY, défaut REGULAR | 🟢 VALIDÉE |
| D-4C4-WEB-03 | Eligibility | Option D — Historisation + règle d'éligibilité AG | 🟢 VALIDÉE |
| D-4C4-WEB-04 | Quorum | Option C — Seuil configurable (quorum_threshold_type/value) | 🟢 VALIDÉE |
| D-4C4-WEB-05 | QuorumSnapshot | Option A — Entité persistante, UNIQUE(meeting_id) | 🟢 VALIDÉE |
| D-4C4-WEB-06 | AssemblyDecision | Option A — Liée à Meeting, lifecycle DRAFT→SUBMITTED→VOTING→DECIDED | 🟢 VALIDÉE |
| D-4C4-WEB-07 | Vote FK | Option C — Vote.meeting_id → Meeting.id | 🟢 VALIDÉE |
| D-4C4-WEB-08 | Decision → Vote | Option A (variante) — Vote.assembly_decision_id + Vote.meeting_id | 🟢 VALIDÉE |
| D-4C4-WEB-09 | tenant_id AssemblyDecision | Option B — Pas de tenant_id, dérivé de Meeting | 🟢 VALIDÉE |
| D-4C4-WEB-10 | VoteOption / MemberVote | Modèle étendu validé (code, display_order, updated_at ajoutés) | 🟢 VALIDÉE |

**10/10 décisions validées.** Voir `docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md` pour le rapport de clôture formel.

## Ordre de validation

```
D-4C4-WEB-02 (Meeting.type)
        │  préalable technique, faible risque
        ▼
D-4C4-WEB-01 (GeneralAssembly migration) ◄──┐
        │                                    │ couplées
        ▼                                    │
D-4C4-WEB-07 (Vote FK) ──────────────────────┘
        │
        ▼
D-4C4-WEB-08 (Decision → Vote)
        │
        ▼
D-4C4-WEB-03 (Eligibility)
        │
        ▼
D-4C4-WEB-04 (Quorum) ──► D-4C4-WEB-05 (QuorumSnapshot)
        
D-4C4-WEB-06 (AssemblyDecision) ──► D-4C4-WEB-09 (tenant_id) ──► D-4C4-WEB-08
        
D-4C4-WEB-10 (VoteOption/MemberVote) — après D-4C4-WEB-07
```

D-4C4-WEB-02 en premier (débloque presque tout sans engager de choix contesté). D-4C4-WEB-01 et D-4C4-WEB-07 doivent être validées ensemble ou en séquence immédiate, étant structurellement couplées. D-4C4-WEB-06 doit précéder D-4C4-WEB-08 et D-4C4-WEB-09 (on ne peut pas décider du `tenant_id` ni de la relation au `Vote` d'une entité dont le schéma n'est pas arbitré).

## Impact Web

Aucune implémentation n'est déclenchée par ce pack. Une fois les 10 décisions validées, le travail Web (si commandé séparément) porterait sur : extension `Meeting` (`type`), migration/retrait de `GeneralAssembly` selon D-4C4-WEB-01, réécriture du service `Vote` selon D-4C4-WEB-07, création de `QuorumSnapshot`/`AssemblyDecision`/`VoteOption`/`MemberVote` selon les schémas arbitrés.

## Impact Mobile

`tanzen-mobile` = **NON MODIFIÉ**. Aucune implémentation Mobile ne doit démarrer avant fermeture de ce Decision Gate **et** du Decision Gate Web lui-même (`docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md`).

## Critères de fermeture

    [x] D-4C4-WEB-01 validée — Option B
    [x] D-4C4-WEB-02 validée — Option A
    [x] D-4C4-WEB-03 validée — Option D
    [x] D-4C4-WEB-04 validée — Option C
    [x] D-4C4-WEB-05 validée — Option A
    [x] D-4C4-WEB-06 validée — Option A
    [x] D-4C4-WEB-07 validée — Option C
    [x] D-4C4-WEB-08 validée — Option A (variante)
    [x] D-4C4-WEB-09 validée — Option B
    [x] D-4C4-WEB-10 validée — Modèle étendu

## Statut du Decision Gate

**DECISION GATE = CLOSED.** 10/10 décisions validées par le PO, formalisées dans `docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md`. Conformément au mandat de clôture : cette fermeture ne constitue **pas** une Implementation GO — celle-ci fait l'objet d'un mandat séparé et distinct, « IMPLEMENTATION GO — PHASE 4C-4 », non couvert par ce dossier.

## Recommandation finale

Les 10 décisions sont validées ; le Decision Gate est fermé. Le couplage D-4C4-WEB-01 ↔ D-4C4-WEB-07 signalé par ce pack a été résolu de façon cohérente (Option B + Option C, `GeneralAssembly` migrée vers `Meeting.type` et `Vote` rattaché via `meeting_id`). Trois points restent explicitement non couverts par ces validations et doivent être précisés avant le mandat IMPLEMENTATION GO — voir `docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md` §Points restant à préciser : les critères métier détaillés de l'éligibilité AG (D-4C4-WEB-03), la valeur numérique du seuil de quorum (D-4C4-WEB-04), les valeurs concrètes des `VoteOption` (D-4C4-WEB-10). Ces points ne bloquent pas la fermeture du Decision Gate mais devront être tranchés avant que l'implémentation correspondante puisse être écrite.

## Fichiers inspectés

`docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md` (intégralement) et, par sa référence, les sources listées en §3. Vérification complémentaire ciblée effectuée pour ce pack : recherche exhaustive d'une entité `Decision` générique dans le dictionnaire (§D-4C4-WEB-06, NOT FOUND, seul `workflow_actions.decision` trouvé, domaine différent).

## Fichiers modifiés

    AUCUNE MODIFICATION DE CODE

Seul fichier créé par cette mission : `docs/P1_GOVERNANCE_PHASE_4C4_PO_DECISION_VALIDATION.md`.

## Git

    Aucun commit
    Aucun push
