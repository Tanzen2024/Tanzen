# P1 TONTINE — D-TON-04 — RÉVISION FINALE DU MODÈLE DE CYCLE, TOUR, OCCURRENCE ET ADHÉSION

**Version : 3 (ACTIVE)** · **Date : 2026-08-18** · **Statut : voir §33 — 🟡 DECISION GATE = OPEN**

Aucun fichier de `src/`, `app/`, `mocks/`, `services/`, `tests/`, `config/`, `locales/` n'a
été créé, modifié ou supprimé. Aucun champ ajouté au code. Aucune permission modifiée.
`tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non touchés. Aucune migration SQL.
Aucun refactoring. Aucun commit, aucun push. Aucune décision ci-dessous n'est validée sans
validation PO explicite — y compris celles où le texte des mandats reçus est suffisamment
directif pour être traité comme un fait établi (signalé explicitement à chaque fois, jamais
deviné).

## Historique des versions de ce document

- **v1** — `docs/P1_TONTINE_D-TON-04_REVISION_TONTINE_CYCLES_DECISION_GATE.md` (fichier séparé,
  conservé, non supprimé) : identification initiale de la collision terminologique « cycle »
  entre `TontineCycle` et `CycleDraw`, options A/B/C, décisions D-TON-04-A à J.
- **v2** — contenu précédent de *ce* fichier (`P1_TONTINE_D-TON-04_REVISION_FINAL_DECISION_GATE.md`),
  remplacé ci-dessous : introduction du modèle Member/Adhesion, du couplage Fiscal Year, de la
  matrice de couverture, des décisions D-TON-04-ADHESION/MULTI-ADHESION/TOUR-UNIT/
  TOUR-VS-OCCURRENCE/FY-COUPLING/L/M/N/O. Son contenu factuel est repris et non contredit —
  voir la table de correspondance §31.
- **v3 (ce document, ACTIVE)** — reformule l'ensemble en 31 décisions numérotées
  (D-TON-04-01 à 31), avec mapping explicite vers les décisions des versions précédentes,
  intègre les règles métier supplémentaires reçues (bénéficiaires multiples par tour,
  interdiction d'auto-approbation, montants attendu/réel, vues de consultation, tontine
  achetable, chevauchement Fiscal Year approfondi).

---

## 1. Mandat et objectif

Définir le modèle métier canonique d'une Tontine, de ses adhésions, de son cycle, de ses tours
de bénéficiaires et de ses occurrences planifiées/exécutées, **avant** toute implémentation de
`cycle_members`, `tontine_contributions`, `tontine_draws`, `draw_winners` — mission
d'analyse et de décision, aucune implémentation.

## 2. Périmètre absolu

`tanzen-frontend` uniquement. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non
touchés, non analysés pour implémentation. Aucun code, mock, service, composant, route, test,
permission ou configuration modifié.

---

## 3. État réel du code (§28 du mandat — recherche exhaustive, avant toute proposition)

Recherche menée sur les termes demandés par le mandat, avec correction factuelle où le
vocabulaire du mandat ne correspond pas au nommage réel du code :

| Terme recherché (mandat) | Existe dans le code sous quel nom réel | État |
|---|---|---|
| `Tontine` | `Tontine` (`src/mocks/tontines/tontines.ts:3-13`) | 🟢 EXISTE |
| `TontineCycle` | `TontineCycle` (`src/mocks/tontines/tontine-cycles.ts:52-67`) | 🟢 EXISTE |
| `CycleMember` | `CycleMember` (`tontine-cycles.ts:3-15`) | 🟢 EXISTE |
| `CycleDraw` | `CycleDraw` (`tontine-cycles.ts:29-43`) | 🟢 EXISTE |
| `TontineContribution` | **N'existe pas sous ce nom.** Le nom réel est `CycleContribution` (`tontine-cycles.ts:17-24`, imbriqué) — coexistant avec un second modèle séparé `Contribution` (`src/mocks/finance/contributions.ts:14-23`, domaine Finance), non réconcilié (déjà signalé D-TON-07 de l'audit d'origine) | 🟠 EXISTE, sous un autre nom, en double |
| `TontineDraw` | **N'existe pas sous ce nom** — le nom réel est `CycleDraw` (déjà listé) | 🟠 Nom du mandat ≠ nom réel |
| `DrawWinner` | **N'existe pas** — fusionné dans `CycleDraw` (`winnerMemberId`, `amountReceived`, `contributionPool`, `bidAmount` portés directement par le tirage) | 🔴 ABSENT comme entité séparée |
| `frequency` | Absent de `Tontine` (`tontines.ts:3-13`, aucun champ de ce nom) | 🔴 ABSENT |
| `cycle_number` | `TontineCycle.cycleNumber` (`tontine-cycles.ts:56`), obligatoire, unique par tontine (`createCycle`, `tontines.service.ts:45-46`) | 🟢 EXISTE, réellement implémenté |
| `plannedDate` / `actualDate` | Absents partout — `TontineCycle.startDate/endDate` et `CycleDraw.date` sont chacun un champ unique | 🔴 ABSENT |
| `reschedule` / `postponed` | Absents partout, recherche exhaustive sans résultat | 🔴 ABSENT |
| `membership` | Absent comme nom d'entité — le concept le plus proche est `CycleMember` | 🔴 ABSENT nommément |
| `memberId` | Présent sur `CycleMember.memberId` (`tontine-cycles.ts:7`) ; **absent** sur `CycleContribution` (seul `memberName` texte libre existe, `tontine-cycles.ts:20`) ; présent sur `Contribution` (Finance, FK réelle) | 🟠 PARTIEL, incohérent selon l'entité |
| `fiscalYearId` | Une seule occurrence dans tout `src/mocks/`, dans `src/mocks/settings/fiscal-year-transfer-categories.ts` — une table de configuration décrivant quelles catégories d'autres domaines sont transférables lors d'une réouverture d'exercice, **pas** un champ porté par de vrais enregistrements Tontine/Finance/Credit | 🔴 ABSENT comme FK réelle sur toute entité métier |
| `workflowService` / `WorkflowRequest` / `WorkflowStep` | `src/services/workflow.service.ts`, `src/mocks/operations/workflow-requests.ts` — moteur générique déjà utilisé par 5 domaines (`credit`, `tontines`, `governance`, `finance`, `settings`) | 🟢 EXISTE, réutilisable, déjà utilisé pour une approbation avec blocage d'auto-approbation (Fiscal Year, `WD-005`) |
| `AuditEvent` | `src/mocks/audit/audit-events.ts` — mécanisme générique `before`/`after`/`context`/`actorId`/`actorName`/`timestamp`, `AuditModule` inclut déjà `'tontines'` (via `WorkflowDomain`) | 🟢 EXISTE, techniquement disponible pour Tontine, jamais utilisé en pratique pour ce domaine (aucun événement de seed `module:'tontines'`) |
| `statusHistory` | `Member.statusHistory: MemberStatusHistoryEntry[]` (`src/mocks/organization/members.ts:28,45`) — historique embarqué `{ status, since }` | 🟢 EXISTE, précédent réel pour un historique léger embarqué sur une entité |

**Constat additionnel, déjà établi en v2, reconfirmé** : `WD-002` (« Ouverture de cycle de
tontine », `workflow-definitions.ts`) existe dans le catalogue de workflows mais n'est jamais
consulté par `tontinesService.updateCycleStatus`, le vrai code de transition de cycle
(`tontines.service.ts:53-60`, aucun import de `workflowService`).

**Champs morts confirmés** (déjà identifiés en v2, revérifiés) : `CycleMember.collectedAmount`
et `CycleMember.payoutAmount` sont initialisés à `0` par `addCycleMember` et ne sont plus
jamais modifiés par aucune fonction de service, y compris `declareWinner`
(`tontines.service.ts:82-98`, qui ne touche que `CycleDraw` et `CycleMember.hasWon`).

## 4. Modèles existants — synthèse

Non reproduite intégralement (déjà couverte en détail par `docs/P1_TONTINE_FRONTEND_READ_ONLY_AUDIT.md`
§5-10 et par ce document §3) : `tontines`, `tontine_cycles` (imbriquant `cycle_members`,
`tontine_contributions` sous le nom `CycleContribution`, `tontine_draws`), `draw_winners`
(inexistant, fusionné). Aucun changement constaté depuis la dernière relecture.

## 5. Member vs Adhesion

**Confirmé par le contenu explicite des mandats reçus** (celui-ci §9, et le mandat précédent
§6 : *« Un membre représente une personne/membre du TENANT. Une ADHESION représente une
participation autonome de ce membre à une tontine »*) : Member et Adhesion sont deux concepts
distincts, la distinction elle-même n'est plus une question ouverte — **c'est un fait
métier donné par le mandat, pas une supposition de ce document.**

Ce qui reste `DECISION REQUIRED` : la **forme technique** de cette distinction.
`CycleMember` (§3) est aujourd'hui structurellement proche d'une Adhesion (attributs
indépendants par ligne : position, montants, statut, gain) mais **sans identité stable** au-delà
d'un seul cycle — condition nécessaire pour répondre à « quelles sont les adhésions actuelles/
passées d'un membre, toutes tontines confondues » (§21-22 du mandat). Trois lectures possibles,
aucune tranchée :
- (A) `CycleMember` est renommé/étendu avec une identité stable ajoutée (id d'adhésion
  persistant à travers les cycles) ;
- (B) une entité `Adhesion` distincte de `CycleMember` est introduite, ce dernier devenant une
  simple relation d'occurrence/tour ;
- (C) `CycleMember` reste tel quel, et la stabilité d'identité est reconstruite a posteriori
  par une clé métier (ex. `tontineId`+`memberId`+séquence), sans nouvel identifiant stocké.

## 6. Multi-adhésion

**Confirmé par le contenu explicite des mandats reçus** (celui-ci §8 : *« Un même membre peut
avoir plusieurs adhésions dans une même Tontine »* — énoncé comme fait, pas comme question ;
le mandat précédent §1 : exemple filé A1/A2/A3 avec `cycle_id` identique) : le multi-adhésion,
y compris au sein d'une même tontine, **est la règle métier donnée**, pas une hypothèse à
valider par ce document.

**Nuance à ne pas deviner** : la formulation « même cycle » est explicite dans le mandat
précédent (`cycle_id` partagé pour A1/A2/A3) mais moins insistée dans celui-ci, qui reste
centré sur « même Tontine ». Les deux mandats sont cohérents entre eux (aucune contradiction
trouvée), mais aucune limite de cardinalité (nombre maximal d'adhésions par membre/tontine/
cycle) n'est donnée par aucune source — **`DECISION REQUIRED`** sur ce point précis
uniquement (pas sur le principe du multi-adhésion lui-même, déjà confirmé).

**État du code, fait objectif** (§3) : aucune contrainte d'unicité `(cycle_id, member_id)`
n'est appliquée par `addCycleMember` — le code ne bloque donc pas aujourd'hui le
multi-adhésion, sans avoir jamais été conçu pour. C'est une compatibilité accidentelle, pas
une preuve d'implémentation.

## 7. Indépendance des adhésions

`CycleMember` porte déjà, par ligne, `position`/`expectedAmount`/`collectedAmount`/
`payoutAmount`/`status`/`hasWon` — l'indépendance des **attributs** entre plusieurs
adhésions du même membre est donc déjà structurellement respectée si plusieurs `CycleMember`
sont créés pour ce membre (aucune fusion automatique constatée). Ce qui manque, ce n'est pas
l'indépendance des attributs, mais l'identité stable (§5) et la consolidation de reporting
(§22-23) — cette dernière n'existe nulle part aujourd'hui (aucune vue n'agrège
`expectedAmount` par membre à travers ses adhésions).

## 8. Rattachement adhésion → membre

`CycleMember.memberId → Member.id` existe déjà comme référence (non validée service-side,
déjà signalé par l'audit d'origine, D-TON-06). Navigation Membre→adhésions : **partiellement**
déjà possible via `tontinesService.listCyclesByMember(tenantId, memberId)`
(`tontines.service.ts:38`), qui renvoie les `TontineCycle` où ce membre a une entrée, mais pas
les `CycleMember` eux-mêmes nommément, et ne distingue pas plusieurs adhésions du même membre
dans le même cycle (déjà signalé v2 §8). La navigation bidirectionnelle complète demandée par
le mandat (§9, §21-22) n'existe pas encore sous cette forme.

## 9. Tontine

Le mandat (§2, §5-A) donne la liste d'attributs cible : identité, description, fréquence,
montant par défaut, période de validité, possibilité d'achat, statut, configuration. État
réel : `Tontine` (`tontines.ts:3-13`) porte `id`, `tenantId`, `name`, `type`
(hors dictionnaire d'origine, déjà signalé D-TON-12 de l'audit), `status` (2 valeurs vs 3
attendues), `memberCount`/`activeCycles`/`totalContributions` (agrégats). **Absents** :
`description`, `frequency`, `default_contribution_amount`, `is_purchasable`. La liste cible
donnée par le mandat est prise comme telle, pas inventée — mais son ajout au code n'est pas
réalisé ici.

## 10. Cycle

Le mandat (§5-B) est directif : *« Un cycle représente une période complète d'activité de la
Tontine [...] NE PAS considérer automatiquement chaque mois comme un nouveau `TontineCycle`
si cela entre en conflit avec le concept de cycle actuellement présent dans le code. »* Ceci
oriente fortement — sans la clore formellement — la question laissée ouverte par la v1/v2
(Option A vs Option B, §5/§11 du document v2) : le mandat demande explicitly de **vérifier la
compatibilité avec l'existant avant de redéfinir** `TontineCycle`, ce qui pèse en faveur du
maintien de `TontineCycle` comme tour de rotation complet (Option A, v2) plutôt que sa
redéfinition en occurrence unitaire (Option B, v2) — signalé comme une orientation donnée par
le mandat, pas une décision prise unilatéralement par ce document. `DECISION REQUIRED`
formellement, orientation notée.

## 11. Tour

Concept central confirmé par les deux mandats (§6, ce document ; §10 du mandat précédent) :
le tour détermine qui bénéficie, dans quel ordre, à quelle occurrence, avec quelle(s)
adhésion(s), pour quel montant. **Confirmé explicitement par ce mandat (§6)** : un tour peut
avoir un seul OU plusieurs bénéficiaires — *« NE PAS imposer artificiellement : 1 tour = 1
membre »*. Ce n'est pas une hypothèse de ce document, c'est une contrainte de modélisation
donnée. État du code : le concept le plus proche est `CycleMember.position` (rang simple,
entier, sans notion de bénéficiaires multiples ni de date associée) — pas d'entité « Tour »
distincte aujourd'hui.

## 12. Occurrence

Distincte du Tour (§13). Représente le conteneur calendaire (date prévue/date réelle,
historique de report). Le concept le plus proche dans le code aujourd'hui est `CycleDraw`
(déjà daté individuellement) ou `TontineCycle` selon la lecture retenue en §10 — toujours
`DECISION REQUIRED` (D-TON-04-05, mapping D-TON-04-A de la v1/v2).

## 13. Tour ≠ Occurrence

**Confirmé explicitement par ce mandat**, de façon plus directive que la v2 (qui ne faisait
que le déduire par cohérence interne) : §16 *« Cette distinction est essentielle »*, §18
*« Une permutation de tour ne doit pas automatiquement modifier la date de l'occurrence [...]
Les occurrences peuvent rester : Occurrence 1, Occurrence 2 »*. **La séparation conceptuelle
Tour/Occurrence est donc un fait donné par le mandat, pas une supposition de ce document.** Ce
qui reste `DECISION REQUIRED` : la représentation technique exacte (deux entités stockées
séparément, ou une seule entité avec deux sous-structures — la mandat ne tranche que le
comportement observable, pas le schéma).

## 14. Contribution

Recoupe D-TON-07 de l'audit d'origine (deux modèles non réconciliés, `CycleContribution` sans
`memberId`, `Contribution` Finance avec `memberId` mais rattachement indirect). Nouvelle
question posée par ce mandat (§20 implicitement, via la distinction montant attendu/réel) :
la cotisation doit-elle être rattachée à l'**adhésion** plutôt qu'au seul membre ? Réponse
factuelle : aucune des deux entités de cotisation existantes ne porte aujourd'hui de référence
à une adhésion (puisque l'adhésion elle-même n'existe pas encore comme entité stable, §5) —
`DECISION REQUIRED`, dépendante de D-TON-04-07 (§5).

## 15. Bénéfice

`CycleDraw.winnerMemberId` référence déjà `CycleMember.id` (donc déjà scopé adhésion, pas
membre directement) — cohérent avec la demande du mandat (§7-8) sans avoir été conçu pour.
`CycleMember.hasWon` déjà mis à jour par `declareWinner`. **Mais** `CycleMember.payoutAmount`
n'est jamais synchronisé avec `CycleDraw.amountReceived` (§3, champ mort) — donc le modèle
« TOUR → ADHÉSION → MEMBRE → MONTANT PRÉVU → MONTANT REÇU » demandé (mandat précédent §8)
n'est aujourd'hui satisfait qu'en partie, et uniquement en traversant `CycleDraw`.

## 16. Tirage

Aucun changement depuis l'audit d'origine et la v2 : tirage 100% manuel, `draw_type`
(ROTATION/AUCTION/RANDOM) absent, confirmé par le commentaire du code lui-même
(`declareWinner`, `tontines.service.ts:81`). Le mandat introduit une nuance utile (§12) :
certaines tontines ont un tour **préétabli** (le bénéficiaire est connu à l'avance, le
« tirage » n'est qu'un enregistrement a posteriori du résultat effectif) — ceci est cohérent
avec le comportement actuel (`declareWinner` = sélection manuelle, jamais un algorithme), sans
qu'aucune source ne confirme si c'est le SEUL mode voulu ou un mode parmi d'autres
(cf. D-TON-08 de la v2/v1, toujours ouverte).

## 17. Tontine achetable

`is_purchasable` totalement absent du code (confirmé à trois reprises maintenant — audit
d'origine, v2, ce document). Le mandat (§13, §7 du mandat précédent) est explicite : ne pas
inventer la mécanique financière, documenter uniquement l'existence du flag et ses
dépendances. Aucune mécanique d'achat n'existe nulle part ailleurs dans `tanzen-frontend`
pour aucun domaine analysé jusqu'ici (Credit/Finance compris) — `DECISION REQUIRED`, hors
périmètre d'une résolution dans ce seul document.

## 18. Reports

Structure complète donnée par le mandat (§17, ce document ; §4/§15/§18 du mandat précédent) :
`plannedDate`, `actualDate`, motif, acteur, date de modification, référence, historique
avant/après — **liste de champs confirmée par le mandat**, pas inventée par ce document. Ce
qui reste ouvert : la persistance technique (champs directs + `AuditEvent`, cf. §3 — mécanisme
déjà existant identifié comme réutilisable) et le caractère obligatoire ou non du motif
(non tranché par aucune source, y compris celle-ci).

## 19. Permutations

Structure complète donnée par le mandat (§10-11, ce document) : demandeur, date, ancienne
affectation, nouvelle affectation, motif, référence de validation, approbateur, date
d'approbation, statut de la demande — **confirmée comme exigence**, pas inventée. Aucune
fonction de service ne mute `position` après création aujourd'hui (§3) — capacité à
construire intégralement.

## 20. Approbations

**Confirmé explicitement par le mandat (§11 de ce document, §17 du mandat précédent)** :
*« réutiliser autant que possible workflowService/WorkflowRequest/WorkflowStep/AuditEvent [...]
NE PAS créer un deuxième système de workflow si l'existant est réutilisable »* — instruction
directive, pas une simple recommandation de ce document. Le mécanisme générique existe déjà
(§3) et porte un précédent direct pour le blocage d'auto-approbation (`WD-005`,
`settingsService.decideFiscalYearReopen`, construit dans ce même projet pour Fiscal Year).
Ce qui reste `DECISION REQUIRED` : réutiliser `WD-002` (déjà existant, domaine `tontines`,
aujourd'hui inerte) ou créer une nouvelle `WorkflowDefinition` dédiée aux permutations —
aucune source ne tranche entre les deux (mapping D-TON-04-M/N de la v2).

## 21. Historisation

Voir §3 (`AuditEvent`, `MemberStatusHistoryEntry`) et §30 du mandat, qui **confirme
explicitement** de réutiliser `AuditEvent` en priorité et interdit un second mécanisme
d'audit parallèle — cohérent avec le constat déjà fait en v2 que `AuditModule` inclut déjà
`'tontines'` sans extension de type nécessaire.

## 22. Vue « adhésions ayant déjà bénéficié »

**Confirmé explicitement par le mandat (§23)** : le raisonnement doit être fait au niveau de
l'ADHÉSION, pas du membre — *« il ne faut donc pas considérer que "A a bénéficié" signifie
automatiquement que toutes ses adhésions ont bénéficié »*. Aucune vue de ce type n'existe
aujourd'hui ; elle serait calculable depuis `CycleMember.hasWon` une fois l'identité
d'adhésion stabilisée (§5).

## 23. Vue « adhésions restant à bénéficier »

Symétrique de §22, même conclusion : calculable depuis l'inverse de `hasWon`, dépendante de
§5.

## 24. Vue « tontines d'un membre »

Le mandat (§21-22, ce document ; §11/§15 du mandat précédent) décrit une vue consolidée par
membre (tontines, adhésions, période, statut, fréquence, montant, tour, historique,
bénéficiaire, montant perçu). Embryon partiel existant : `listCyclesByMember` (§8) — retourne
des cycles, pas une vue consolidée par tontine/adhésion. À construire intégralement,
dépendant de §5.

## 25. RBAC

Catalogue inchangé depuis l'audit d'origine : `tontines.read/create`, `cycles.read/create/manage`,
`draws.read/manage` (`src/mocks/rbac.mocks.ts:65-67`). Aucune permission pour adhésion,
permutation, ou approbation spécifique au domaine Tontine. Aucune permission créée ou modifiée
par ce document (interdiction explicite du mandat, §1).

## 26. Audit

Voir §3, §21. `AuditModule` inclut déjà `'tontines'`, capacité technique disponible, jamais
exercée pour ce domaine à ce jour (aucun événement de seed).

## 27. Tenant isolation

Inchangé depuis l'audit d'origine : `Tontine`/`TontineCycle` tenant-scopés directement
(`getTenantScoped`, testé) ; `CycleMember`/`CycleContribution`/`CycleDraw` tenant-scopés
structurellement (imbrication dans un `TontineCycle` déjà vérifié). Aucune régression
constatée, aucun changement proposé.

## 28. UX cible

Reprise et complétée depuis la v2 (§16), avec les précisions supplémentaires de ce mandat
(§21, §23 : panel de sélection multiple de membres avec cases à cocher, vue par
adhésion explicite plutôt que par membre pour les statuts de bénéfice). Conceptuel uniquement,
aucun écran implémenté — cf. mandat §21-23, §5-K/L/M (mandat précédent).

## 29. Matrice de compatibilité / couverture (§20 du mandat précédent, actualisée)

| Besoin | Existe | Partiel | Absent | Conflit | Décision requise |
|---|---|---|---|---|---|
| Fréquence (DAILY/WEEKLY/MONTHLY/QUARTERLY) | | | ✅ | 🟠 `CUSTOM` mentionné par une source antérieure, absent de ce mandat | D-TON-04-11 |
| Règle de périodicité | | | ✅ | | D-TON-04-12 |
| Date planifiée / date réelle | | | ✅ | | D-TON-04-05, -13 |
| Report + historique | | | ✅ | | D-TON-04-13, -14 |
| Tontine achetable | | | ✅ | | D-TON-04-24 |
| Adhésion (concept) | | ✅ (`CycleMember` proche) | | | D-TON-04-07 |
| Multi-adhésion même tontine | ✅ (confirmé par mandat, non bloqué techniquement) | | | | Cardinalité max uniquement |
| Multi-adhésion même cycle | | ✅ (non bloqué, moins explicite) | | | D-TON-04-09 |
| Rattachement adhésion → membre | ✅ (FK représentationnelle) | | | | D-TON-04-10 (identité stable) |
| Indépendance des adhésions (attributs) | ✅ (déjà le cas sur `CycleMember`) | | | | — |
| Historique des adhésions | | | ✅ | | D-TON-04-07 |
| Montant par adhésion | ✅ (`expectedAmount`) | | | | Validation contre une règle Tontine, D-TON-04-20 |
| Contribution par adhésion | | | ✅ (pas de FK adhésion sur les cotisations) | | D-TON-04-29 |
| Tour par adhésion | ✅ (`position` déjà sur `CycleMember`) | | | | D-TON-04-04, -15 |
| Bénéficiaire par adhésion | ✅ (`winnerMemberId→CycleMember.id`) | | | | — |
| Plusieurs bénéficiaires par tour | | | ✅ | | D-TON-04-19 |
| Permutation de tours | | | ✅ | | D-TON-04-16 |
| Historique de permutation | | | ✅ | | D-TON-04-14 |
| Approbation de permutation | | ✅ (moteur générique disponible, `WD-002` inerte) | | | D-TON-04-17 |
| Interdiction d'auto-approbation | | ✅ (précédent `WD-005` réutilisable) | | | D-TON-04-18 |
| Montant reçu par adhésion | | ✅ (sur `CycleDraw`, pas synchronisé sur `CycleMember`) | | 🟠 champ mort | D-TON-04-21 |
| Membres/adhésions ayant bénéficié | | | ✅ | | D-TON-04-22 |
| Adhésions restant à bénéficier | | | ✅ | | D-TON-04-23 |
| Tontines d'un membre (vue) | | ✅ (`listCyclesByMember`, partiel) | | | D-TON-04-26 |
| Tirage manuel | ✅ | | | | — (confirmé, pas un gap) |
| Achat | | | ✅ | | D-TON-04-24 |
| Audit | | ✅ (disponible, inutilisé) | | | D-TON-04-14, -21 |
| Tenant isolation | ✅ | | | | — |
| Chevauchement Fiscal Year | | | ✅ | | D-TON-04-02, -27 |

## 30. Modèles dérivés à protéger — matrice d'impact

| Modèle | Dépendance | Impact | Décision nécessaire |
|---|---|---|---|
| `cycle_members` | Adhésion / Tour | Deviendrait la relation Member↔Adhesion avec identité stable, ou un renommage direct de `CycleMember` — la granularité (par occurrence vs par tour de rotation) dépend de §10 | D-TON-04-07, -10, -28 |
| `tontine_contributions` | Adhésion / Occurrence | Devrait pointer vers une adhésion identifiable plutôt que `member_id`/`memberName` seul — résoudrait une partie de D-TON-07 (audit d'origine) | D-TON-04-07, -14 (mapping), -29 |
| `tontine_draws` | Tour / Occurrence | Représente-t-il un Tour ou une Occurrence ? Les deux se recoupent aujourd'hui dans `CycleDraw` — à trancher avant toute évolution | D-TON-04-05, -06, -30 |
| `draw_winners` | Résultat réel (adhésion bénéficiaire) | Déjà fusionné dans `tontine_draws` (assumé, audit d'origine D-TON-10) — un réexamen dépend de la résolution Tour/Occurrence | D-TON-04-06, -31 |

## 31. Décisions D-TON-04 (D-TON-04-01 à 31) — avec mapping vers les versions précédentes

| ID | Sujet | Mapping v1/v2 | Statut de la question conceptuelle | Ce qui reste `DECISION REQUIRED` |
|---|---|---|---|---|
| D-TON-04-01 | Définition canonique de Tontine | Nouveau (synthèse) | Liste d'attributs cible donnée par le mandat (§9) | Types exacts, valeurs, champs additifs (`type`) à statuer |
| D-TON-04-02 | Fiscal Year ≠ cycle de vie de la Tontine | = D-TON-04-FY-COUPLING (v2) | **Confirmé par le mandat** (§3-4, §24-25) : la Tontine reste une entité continue, jamais scindée par FY | Mécanisme d'attribution comptable (dérivé par date vs stocké) |
| D-TON-04-03 | Définition du cycle | = D-TON-04-A (v1/v2) | Orientation donnée (§10) vers le maintien de `TontineCycle` en tour de rotation, sans clore Option B | Choix final entre Options A/B/C (v2 §11) |
| D-TON-04-04 | Définition du tour | = D-TON-04-TOUR-UNIT (v2) | **Confirmé** : tour affecté à l'adhésion, peut avoir plusieurs bénéficiaires (§6, §11 de ce document) | Structure technique, règles de cardinalité |
| D-TON-04-05 | Définition de l'occurrence | = volet « Occurrence » de D-TON-04-A (v2) | Définition conceptuelle donnée (§12) | Entité technique porteuse (dépend de -03) |
| D-TON-04-06 | Tour ≠ occurrence | = D-TON-04-TOUR-VS-OCCURRENCE (v2) | **Confirmé explicitement par le mandat** (§13, §16-18) | Représentation technique exacte (une ou deux entités stockées) |
| D-TON-04-07 | Modèle d'adhésion | = D-TON-04-ADHESION (v2) | **Confirmé explicitement par le mandat** (§5, §9) | Forme technique (§5, lectures A/B/C) |
| D-TON-04-08 | Multi-adhésion même Tontine | ⊂ D-TON-04-MULTI-ADHESION (v2) | **Confirmé explicitement par le mandat** (§6) | Cardinalité maximale (aucune limite sourcée) |
| D-TON-04-09 | Multi-adhésion même cycle | ⊂ D-TON-04-MULTI-ADHESION (v2) | Confirmé par le mandat précédent, moins explicite dans celui-ci — cohérent, non contredit | Idem + granularité si -03=Option B |
| D-TON-04-10 | Lien stable Member → adhésions | = D-TON-04-ADHESION (v2, volet navigation) | Exigence confirmée (§8, §21-22) | Mécanisme technique (identifiant stable, requête dédiée) |
| D-TON-04-11 | Fréquence | = D-TON-04-B (v1/v2) | 3 valeurs confirmées deux fois (DAILY/WEEKLY/MONTHLY/QUARTERLY) | `CUSTOM` : garder, écarter, ou combiner — toujours ouvert |
| D-TON-04-12 | Jour/règle de planification | = D-TON-04-C (v1/v2) | Exemples illustratifs donnés, non exhaustifs par instruction explicite | Vocabulaire complet de règles |
| D-TON-04-13 | Report d'occurrence | = D-TON-04-D/E (v1/v2) | Liste de champs confirmée par le mandat (§17) | Persistance technique, obligation du motif (=D-TON-04-F, v2) |
| D-TON-04-14 | Historisation des reports/permutations | = D-TON-04-D (v1/v2) + nouveau (permutations) | Réutilisation `AuditEvent` confirmée comme direction obligatoire (§30) | Forme exacte des événements (actions, avant/après) |
| D-TON-04-15 | Affectation des tours | Nouveau | Tour affecté à l'adhésion (confirmé, cf. -04) | Mécanique d'affectation initiale |
| D-TON-04-16 | Permutation/modification des tours | Nouveau (détaille D-TON-04-M, v2) | Liste de champs confirmée (§10-11) | Structure technique de la demande |
| D-TON-04-17 | Workflow d'approbation | = D-TON-04-M/N (v2) | Réutilisation du moteur générique confirmée comme obligatoire (§11, §30) | `WD-002` réactivé vs nouveau `WD-00X` dédié |
| D-TON-04-18 | Interdiction de l'auto-approbation | Nouveau | **Non tranché par ce mandat** (« si applicable ») — précédent direct disponible (`WD-005`) mais pas imposé ici | Application ou non de la même règle qu'en Fiscal Year |
| D-TON-04-19 | Bénéficiaires multiples par tour | ⊂ D-TON-04-TOUR-UNIT (v2) | **Confirmé possible** par le mandat (§6, §11) | Règles de répartition/cardinalité |
| D-TON-04-20 | Montant attendu | Nouveau | Distinction conceptuelle donnée (§20) — pas la formule | Formule exacte de calcul du pool |
| D-TON-04-21 | Montant réellement perçu | = D-TON-04-L (v2, volet synchronisation) | Champ mort confirmé (`payoutAmount`, §3, §15) | Synchroniser, retirer, ou documenter comme dérivé |
| D-TON-04-22 | Vue bénéficiaires déjà servis | Nouveau | Granularité adhésion confirmée par le mandat (§23) | Construction de la vue elle-même (hors périmètre décisionnel) |
| D-TON-04-23 | Vue bénéficiaires restant à servir | Nouveau | Idem | Idem |
| D-TON-04-24 | Tontine achetable | = D-TON-04-O (v2) | Flag confirmé comme besoin, mécanique explicitement non à inventer | Mécanique financière complète |
| D-TON-04-25 | Affectation des membres à la création | Nouveau (UX) | Panel conceptuel décrit (§21) | Implémentation UX (hors périmètre décisionnel) |
| D-TON-04-26 | Vue toutes tontines d'un membre | Nouveau | Exigence confirmée (§22) | Dépend de -07/-10 |
| D-TON-04-27 | Chevauchement Fiscal Year | = D-TON-04-02 (doublon volontaire, sujet central répété par le mandat) | Confirmé (§3-4, §24-25) | Mécanisme d'attribution (cf. -02) |
| D-TON-04-28 | Impact sur `cycle_members` | Nouveau (matrice §30) | Documenté | Dépend de -03, -07 |
| D-TON-04-29 | Impact sur `tontine_contributions` | Nouveau (matrice §30) | Documenté | Dépend de -07, -14 |
| D-TON-04-30 | Impact sur `tontine_draws` | Nouveau (matrice §30) | Documenté | Dépend de -05, -06 |
| D-TON-04-31 | Impact sur `draw_winners` | Nouveau (matrice §30) | Documenté | Dépend de -06, -30 |

**Note de méthode** : les décisions marquées « Confirmé(e) par le mandat » ne sont **pas**
déclarées validées par le PO au sens formel (aucune case cochée dans aucun document) — elles
sont signalées comme des **faits énoncés explicitement dans le texte des mandats reçus**, à
distinguer des points où ce document a dû inférer ou proposer une lecture. Cette distinction
est documentée précisément pour qu'aucune des deux catégories ne soit confondue avec l'autre.

## 32. Risques (repris et complétés depuis la v2, §22)

- Dette sémantique si Member/Adhesion/Tour/Occurrence ne sont pas clairement distingués avant
  implémentation (déjà matérialisée une fois avec la collision « cycle »).
- Coût de migration conceptuelle des `CycleMember` de seed existants, sans identité d'adhésion
  stable.
- Risque de sur-ingénierie : le périmètre cumulé (multi-adhésion + FY overlap + permutation
  avec workflow + audit + tontine achetable) est large — recommandé de valider les décisions
  structurantes (-03, -06, -07) avant les décisions de détail.
- Champs morts déjà en production (`collectedAmount`/`payoutAmount`) — risque d'affichage
  silencieusement incorrect, indépendant de cette révision.
- Absence totale de précédent `fiscalYearId` dans le projet — tout mécanisme d'attribution
  comptable par exercice sera un pattern architectural inédit, pas une extension.

## 33. Points bloquants / non déterminés (à ne jamais deviner)

- `Tontine.frequency` absent — bloque toute génération d'occurrence.
- Identité d'adhésion stable absente — bloque la navigation Membre↔Adhésions fiable.
- Cardinalité maximale d'adhésions par membre/tontine/cycle — non sourcée, à ne jamais
  plafonner arbitrairement (instruction explicite du mandat).
- Obligation ou non du motif de report/permutation — non tranchée par aucune source.
- Interdiction ou non de l'auto-approbation d'une permutation — non tranchée par ce mandat
  (contrairement à Fiscal Year, où elle l'était explicitement).
- Mécanique financière exacte de `is_purchasable` — explicitement hors périmètre à inventer.
- Formule exacte de calcul du pool attendu/réel — explicitement non à inventer.
- Règles de départage `ROTATION`/`RANDOM` si un jour ces modes sont implémentés (déjà signalé
  par l'audit d'origine, D-TON-08).

---

## D-TON-04 — DECISION GATE

**Statut :**

```
🟡 OPEN
```

Tant que les décisions structurantes (D-TON-04-01 à 31, en particulier -03, -06, -07, -09,
-10, -17, -18) ne sont pas validées explicitement par le Product Owner :

- aucun code ne doit être modifié ;
- aucun modèle ne doit être implémenté ;
- aucun service ne doit être refactoré ;
- aucun test métier ne doit être ajouté ;
- aucun RBAC ne doit être modifié.

D-TON-05 et les modèles dérivés (`cycle_members`, `tontine_contributions`, `tontine_draws`,
`draw_winners`) restent en attente de cette clôture.

---

## Contrôles finaux

```
Code frontend : NON MODIFIÉ
Mocks         : NON MODIFIÉS
Services      : NON MODIFIÉS
Types         : NON MODIFIÉS
Composants UI : NON MODIFIÉS
Routes        : NON MODIFIÉES
Tests         : NON MODIFIÉS
Permissions   : NON MODIFIÉES
Configuration : NON MODIFIÉE
Migration SQL : AUCUNE
Refactoring   : AUCUN
Backend       : NON TOUCHÉ
Commercial    : NON TOUCHÉ
Mobile        : NON TOUCHÉ
Commit        : AUCUN
Push          : AUCUN
```

FIN DU MANDAT.

---

## Rapport final — D-TON-04 — ANALYSE TERMINÉE

- **Modèles analysés** : `tontines`, `tontine_cycles`, `cycle_members`, `tontine_contributions`
  (sous les noms réels `CycleContribution`/`Contribution`), `tontine_draws` (sous le nom réel
  `CycleDraw`), `draw_winners` (inexistant, fusionné).
- **Concepts confirmés par le contenu explicite des mandats reçus** (pas des suppositions de
  ce document) : Member ≠ Adhesion ; multi-adhésion (même tontine, au minimum) ; Tour ≠
  Occurrence ; tour affecté à l'adhésion, pas au membre ; bénéficiaires multiples par tour
  possibles ; Tontine ≠ Fiscal Year, jamais scindée par exercice ; réutilisation obligatoire de
  `workflowService`/`AuditEvent`, aucun système parallèle.
- **Concepts contradictoires/en tension** : le vocabulaire « cycle » du besoin métier (une
  occurrence : « janvier = cycle 1 ») vs `TontineCycle` du code (un tour de rotation complet,
  potentiellement pluri-mensuel) — non résolu, orientation donnée (§10) vers le maintien de
  `TontineCycle` en tour de rotation.
- **Nouvelles décisions identifiées** : 31 (D-TON-04-01 à 31), dont 10 reprennent/étendent des
  décisions déjà posées en v1/v2 (mapping §31), 21 sont nouvelles à cette révision.
- **Décisions déjà « validées »** : aucune formellement (aucune case cochée dans aucun
  document) — plusieurs questions conceptuelles sont toutefois confirmées par le texte même
  des mandats reçus, distinguées explicitement en §31.
- **Décisions restantes** : toutes les 31, au moins partiellement (forme technique, valeurs
  exactes, cardinalités, obligations).
- **Impact Fiscal Year** : Tontine reste indépendante du cycle de vie FY ; attribution
  comptable par exercice, si nécessaire, recommandée par dérivation (date de l'occurrence dans
  la période FY) plutôt que par FK stockée — aucun précédent `fiscalYearId` n'existe ailleurs
  dans le projet.
- **Impact `cycle_members`** : dépend de D-TON-04-03/07/10 — ne pas instruire D-TON-05 avant.
- **Impact `tontine_contributions`** : dépend de D-TON-04-07/14, recoupe D-TON-07 (audit
  d'origine).
- **Impact `tontine_draws`** : dépend de D-TON-04-05/06.
- **Impact `draw_winners`** : dépend de D-TON-04-06, fusion actuelle non remise en cause sans
  décision explicite.
- **Workflow nécessaire** : réutilisation de `workflowService`/`WorkflowRequest` (précédent
  `WD-005`), `WD-002` existant à réactiver ou nouvelle définition dédiée — non tranché.
- **Audit nécessaire** : réutilisation d'`AuditEvent`, déjà techniquement disponible pour le
  domaine `tontines`.
- **RBAC concerné** : `tontines.*`, `cycles.*`, `draws.*` existants ; aucune permission
  nouvelle créée par ce document ; besoin de permissions dédiées à l'adhésion/permutation
  identifié mais non créé.
- **Code modifié** : NON.
- **Backend** : NON TOUCHÉ.
- **Commercial** : NON TOUCHÉ.
- **Mobile** : NON TOUCHÉ.
- **Tests modifiés** : NON.
- **Commit** : NON.
- **Push** : NON.
