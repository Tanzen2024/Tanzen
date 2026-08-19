# P1 TONTINE — D-TON-04 — RÉVISION DU MODÈLE DES CYCLES
# DECISION GATE — ANALYSE READ-ONLY (v2 — approfondissement)

**Statut : 🟡 DECISION GATE = OPEN.** Aucun fichier de `src/`, `app/`, `mocks/`, `services/`,
`tests/`, `locales/`, `config/` n'a été modifié, créé ou supprimé. Aucun champ n'a été ajouté
au code. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non touchés. Aucune décision
n'est déclarée validée par ce document — chacune reste `DECISION REQUIRED` jusqu'à validation
PO explicite. Aucun commit, aucun push. Ce document **remplace intégralement** la version
précédente du même fichier (v1), dont le contenu factuel est repris et approfondi ci-dessous,
pas contredit.

---

## Contexte

La v1 de ce document (`docs/P1_TONTINE_D-TON-04_REVISION_TONTINE_CYCLES_DECISION_GATE.md`)
a identifié une collision terminologique entre `TontineCycle` (aujourd'hui : un tour de
rotation, potentiellement pluri-mensuel), `CycleDraw` (aujourd'hui : une occurrence datée
individuelle) et la notion métier de « cycle » exprimée dans le nouveau besoin (une occurrence
planifiée selon fréquence). Ce mandat demande d'approfondir cette analyse **avant** de choisir
une solution — en partant explicitement du besoin métier, pas du modèle déjà codé, pour éviter
de retenir une option simplement parce qu'elle colle à l'existant.

## Objectif

Réouvrir et approfondir D-TON-04 pour définir précisément le modèle conceptuel des
périodes/occurrences d'une tontine, avant de poursuivre D-TON-05, `cycle_members`,
`tontine_contributions`, `tontine_draws`, `draw_winners`. Le modèle doit d'abord refléter le
besoin métier ; le code actuel est un point de comparaison, jamais un point de départ.

---

## 1. Règle métier fondamentale (telle que reçue, non reformulée)

Une tontine possède une fréquence et une règle de calendrier.

- **A. Mensuelle** — janvier 2026 → décembre 2026, `MONTHLY` → occurrences 1 à 12, une par
  mois.
- **B. Hebdomadaire** — janvier → mars 2026, `WEEKLY`, jour = mercredi → une occurrence chaque
  mercredi de la période.
- **C. Journalière** — `DAILY` → une occurrence chaque jour de la période définie.
- **D. Trimestrielle** — janvier → décembre 2026, `QUARTERLY` → occurrences T1 à T4.

**Point factuel à signaler, non résolu par ce document** : le dictionnaire de données fourni
au tout premier mandat d'audit de ce domaine (`docs/P1_TONTINE_FRONTEND_READ_ONLY_AUDIT.md`
§5, feuille `tontines`) définissait `frequency IN (DAILY, WEEKLY, MONTHLY, CUSTOM)` — **quatre
valeurs, dont `CUSTOM`**. Le présent mandat introduit **`QUARTERLY`** à la place de `CUSTOM`.
Les deux sources ne portent pas exactement le même vocabulaire d'énumération. Ceci n'est ni
arbitré ni harmonisé ici — signalé comme une divergence entre deux documents fournis à des
mandats différents, à réconcilier par le PO (cf. D-TON-04-B, §13).

## 2. Règle de calendrier

La fréquence seule ne suffit pas — une règle de programmation précise est nécessaire
(ex. MONTHLY : premier dimanche du mois / deuxième samedi / jour fixe ; WEEKLY : jour de la
semaine ; QUARTERLY : premier jour du trimestre / premier dimanche du premier mois).

**Confrontation au code réel** :

| Élément | État |
|---|---|
| Un champ de fréquence sur `Tontine` | 🔴 **MANQUANT** — confirmé par relecture directe de `src/mocks/tontines/tontines.ts:3-13` : le type `Tontine` ne porte que `id, tenantId, name, type, status, memberCount, activeCycles, totalContributions, createdAt` |
| Un champ ou une structure de règle calendaire (jour de semaine, rang du mois, etc.) | 🔴 **MANQUANT** — aucune occurrence de `dayOfWeek`, `nthWeekday`, `rule`, `schedule`, `calendarRule` ou équivalent trouvée dans tout `src/` (recherche exhaustive) |
| Un formulaire de création de Tontine proposant fréquence/règle | 🔴 **MANQUANT** — `TontineCreate` (`tontines-module.tsx:54-69`) ne collecte que `name`, `type` (`'cooperative'\|'tontine'\|'association'\|'mutuelle'`), `tenantId` ; aucun champ fréquence ni règle calendaire dans le formulaire réel |
| Un précédent architectural pour une énumération de fréquence ailleurs dans TANZEN | 🟠 **PARTIEL, non transposable tel quel** — `LoanRuleInterestPeriod = 'DAILY'\|'WEEKLY'\|'MONTHLY'\|'YEARLY'` existe (`src/mocks/finance/loan-rules.ts:13`), mais désigne la **période de calcul d'intérêt d'un prêt**, pas une règle de génération d'occurrences calendaires — vocabulaire voisin (SCREAMING_SNAKE_CASE, à la différence des enums `statusX` camelCase du domaine Tontine), mais concept différent, à ne pas confondre |
| Un moteur générant des occurrences à partir d'une règle, n'importe où dans TANZEN | 🔴 **MANQUANT, projet entier** — recherche menée aussi côté `Repayment` (`src/mocks/finance/repayments.ts`, le cas le plus proche conceptuellement : des échéances de remboursement de prêt). `createRepayment` (`src/services/credit.service.ts:63`) crée **une seule échéance à la fois**, sur appel explicite — aucune fonction `generateSchedule`/`generateRepayments` n'existe. Les échéances futures visibles en seed (`RP-005`..`RP-010`, `status:'scheduled'`) sont des **données de démonstration écrites à la main**, pas le résultat d'un moteur de génération. **Conclusion : générer une série d'occurrences à partir d'une règle de calendrier n'est une capacité disponible nulle part dans `tanzen-frontend`, pas seulement absente du domaine Tontine.** |

**Classification demandée par le mandat** : EXISTANT = aucun élément ; MANQUANT = fréquence,
règle calendaire, moteur de génération (les trois, intégralement) ; À DÉCIDER = l'ensemble du
vocabulaire de règles (cf. §8, non exhaustif par instruction explicite du mandat).

## 3. Date planifiée vs date réelle

**Confrontation au code réel** (recherche exhaustive de `plannedDate`, `actualDate`,
`scheduledDate`, `reschedul*`, `postponed`, `occurrence` dans tout `src/`) :

| Entité | Champ de date existant | Distingue planifié/réel ? |
|---|---|---|
| `TontineCycle` | `startDate`, `endDate` (un seul couple, `tontine-cycles.ts:57-58`) | 🔴 Non — jamais modifiés après création (`createCycle`, `tontines.service.ts:41-50` ; aucune autre fonction ne les touche) |
| `CycleDraw` | `date` (un seul champ, `tontine-cycles.ts:33`) | 🔴 Non — jamais modifié après création par `createDraw`/`declareWinner` |
| `Repayment` (Finance, précédent le plus proche) | `paymentDate` (un seul champ, `repayments.ts:8`) | 🔴 Non — `status:'late'` existe (`RP-009`) mais aucun second champ ne conserve la date effectivement payée en cas de retard ; le retard est signalé par un statut, jamais par une seconde date |
| `drawDate` en tant que libellé i18n (`t('tontines','drawDate')`, `tontines-module.tsx:159`) | Existe **uniquement comme texte d'en-tête de colonne** (« Date du tirage ») | 🟠 Ce n'est **pas** un champ de données distinct — c'est le libellé d'affichage du champ unique `CycleDraw.date`. À ne pas confondre avec un champ réel — signalé explicitement car son nom pourrait le laisser penser |

**Conclusion, valable indépendamment de l'entité finalement retenue (§5, §11)** : aucune
entité du domaine Tontine, ni même l'entité la plus proche ailleurs dans TANZEN
(`Repayment`), ne distingue aujourd'hui une date planifiée d'une date réellement exécutée.
Ce n'est pas un écart local à combler par un renommage — c'est une capacité absente de tout
le modèle de données du projet.

## 4. Report / Delay / Rescheduling

**Confrontation au code réel** : aucune structure d'historique de changement de date
n'existe — ni sur `TontineCycle`, ni sur `CycleDraw`, ni sur `Repayment`, ni ailleurs. La
seule structure de journalisation présente à proximité du domaine Tontine est
`CycleActivity` (`tontine-cycles.ts:45-50` : `{ id, type, description, date }`), utilisée pour
journaliser des événements de cycle (`Create`, `Open`, `Draw`, `Suspend`, `Close` — seed
`CA-001`..`CA-016`). Elle est **libre (texte non structuré)**, jamais alimentée
automatiquement par un changement de date, sans champ acteur ni motif structuré — un candidat
trop faible pour porter une traçabilité de report fiable telle que décrite par le mandat
(qui exige explicitement : qui, quand, quel motif, quelle valeur avant/après).

**Mécanisme déjà existant et structurellement adapté, à réutiliser plutôt qu'à dupliquer** :
le système d'audit générique du projet, `AuditEvent`
(`src/mocks/audit/audit-events.ts`), déjà utilisé transversalement (Fiscal Year, Governance,
Access, etc.) porte nativement tous les champs requis par le besoin de traçabilité du
report :

```
AuditEvent = {
  id, tenantId, timestamp,        // quand
  actorId, actorName,             // qui
  module, action,                 // quoi (ex. module:'tontines', action:'draws.rescheduled')
  resourceType, resourceId, resourceLabel,
  before?: Record<string, string|number>,   // valeur avant (ex. plannedDate)
  after?: Record<string, string|number>,    // valeur après (ex. actualDate)
  context?: Record<string, string|number>,  // motif libre (ex. reason)
  sensitive, status, correlationId,
}
```

Ce mécanisme est **exactement** celui déjà employé dans ce projet pour une situation
structurellement identique : `settingsService.decideFiscalYearReopen`
(`src/services/settings.service.ts`) enregistre `before`/`after`/`context` lors d'un
changement d'état sensible, sans créer de nouvelle table d'historique dédiée. Réutiliser ce
même mécanisme pour un report d'occurrence de tontine (`before:{plannedDate}`,
`after:{actualDate}`, `context:{reason}`, `actorId`/`actorName` déjà portés nativement) serait
cohérent avec l'instruction explicite du mandat (« ne pas créer de nouveau système
d'audit ») — présenté ici comme un **constat de compatibilité factuelle**, pas une décision
prise à la place du PO.

**Les 6 champs proposés par le mandat**, confrontés à ce mécanisme :

| Champ proposé | Porté nativement par `AuditEvent` ? |
|---|---|
| `planned_date` | Oui, via `before.plannedDate` (valeur au moment du report) — mais nécessite que l'entité elle-même porte aussi un `plannedDate` stable en dehors de l'audit, pour l'affichage courant (l'audit trace l'historique, pas l'état courant) |
| `actual_date` | Oui, via `after.actualDate` — même remarque, l'état courant doit vivre sur l'entité |
| `rescheduled` (booléen) | Dérivable — existence d'un événement d'audit `action:'...rescheduled'` pour cette ressource, pas nécessairement un champ dédié |
| `rescheduled_at` | Oui, `AuditEvent.timestamp` |
| `rescheduled_by` | Oui, `AuditEvent.actorId`/`actorName` |
| `reschedule_reason` | Oui, `AuditEvent.context.reason` |

**Ce qui n'est PAS tranché ici** : si `plannedDate`/`actualDate` doivent malgré tout être des
champs **directs** sur l'entité occurrence (pour l'affichage courant, sans recalculer à partir
de l'audit à chaque lecture) en plus de la traçabilité par `AuditEvent` — c'est la lecture la
plus cohérente avec l'architecture déjà en place (état courant sur l'entité + historique dans
`AuditEvent`, jamais l'inverse), mais reste une proposition, pas une décision (cf. D-TON-04-E,
D-TON-04-F, §13).

## 5. Distinguer les concepts

| Concept | Existe aujourd'hui sous quel nom ? | Statut |
|---|---|---|
| **A. Tontine** (le groupe/produit d'épargne) | `Tontine` (`tontines.ts:3-13`) | 🟢 EXISTANT, non ambigu |
| **B. Période / Occurrence** (l'occurrence calendaire/financière : « janvier 2026 », « mercredi 15 avril ») | **Aucun nom propre.** Se recoupe partiellement avec `TontineCycle` (si on lit « cycle » = occurrence, cf. v1 §5 Lecture 2) et partiellement avec `CycleDraw` (qui porte déjà une date individuelle, cf. v1 §5 Lecture 1) | 🔴 **ABSENT en tant que concept nommé et unique** — c'est le cœur de l'ambiguïté à trancher |
| **C. Tour de rotation** (si conservé, distinct de l'occurrence) | Aujourd'hui, `TontineCycle` joue **ce rôle** (un cycle = un tour complet, ex. `CYC-001` couvre 12 mois et 4 tirages) | 🟠 **EXISTANT mais nommé « cycle »** — exactement le mot que le mandat interdit de réutiliser pour deux concepts distincts (§5 du mandat : « Ne pas utiliser le même mot "cycle" pour deux concepts différents ») ; si B (occurrence) doit aussi s'appeler « cycle » selon l'exemple métier (§1), alors C doit être **renommé** pour éviter la collision |
| **D. Draw / Tirage** | `CycleDraw` (`tontine-cycles.ts:29-43`) | 🟢 EXISTANT, mais **already conflates plusieurs responsabilités** : désignation du gagnant (`winnerMemberId`), agrégat financier (`contributionPool`, `amountReceived`), ET un cycle de « phase » UI à 7 états (`DrawPhase`) et un statut de règlement (`settlementStatus`/`settlementDate`) — cf. §9. Le mandat demande explicitement de ne pas assumer `cycle = draw` automatiquement ; la relecture du code montre que l'assomption inverse (`draw` = déjà beaucoup plus qu'un tirage) est **elle aussi** à surveiller avant toute fusion avec le concept B |

**Constat central, reformulé pour cette v2** : le code actuel n'a que **deux** noms
(`TontineCycle`, `CycleDraw`) pour porter potentiellement **trois** concepts métier distincts
(tour de rotation, occurrence planifiée, tirage). Une simple réutilisation de l'existant sans
renommage explicite **maintiendrait la collision** que le mandat demande justement de lever.

## 6. Analyse du modèle actuel — synthèse complète

Récapitulatif consolidé (détails déjà établis en v1 §6, reconfirmés ici par une seconde
relecture indépendante, sans écart constaté) :

- **Types** : `Tontine` (`tontines.ts:3-13`), `TontineCycle`/`CycleMember`/`CycleContribution`/
  `CycleDraw`/`CycleActivity` (`tontine-cycles.ts`, tous imbriqués sous `TontineCycle` sauf
  `Tontine`/`TontineCycle` eux-mêmes, top-level).
- **Services** : `tontinesService` (`tontines.service.ts`, 99 lignes) — `listTontines`,
  `getTontine`, `createTontine`, `listCyclesByTontine`, `getCycle`, `listCyclesByMember`,
  `createCycle`, `updateCycleStatus`, `addCycleMember`, `createDraw`, `declareWinner`. Aucune
  fonction de génération en lot, aucune fonction de report/reschedule.
- **Mocks** : 5 tontines (`TON-001`..`005`), 5 cycles (`CYC-001`..`005`), tous créés à la
  main, sans lien à une fréquence (qui n'existe pas).
- **Pages/routes** : 10 routes réelles (`tontines-module.tsx:283-292`), toutes déjà
  recensées en v1 §16 (non reproduites ici, aucun changement constaté).
- **Query keys** : `queryKeys.tontines.{list,detail,cycles,cycle,cyclesByMember}`
  (`query-keys.ts:65-68`) — aucune clé liée à une notion d'occurrence, de fréquence ou de
  planification.
- **Permissions** : `tontines.read/create`, `cycles.read/create/manage`, `draws.read/manage`
  (`rbac.mocks.ts:65-67`) — aucune permission liée à une notion de report/reschedule.
- **Tests** : `tontines.service.test.ts` (18 tests) — isolation tenant, machine à états de
  cycle, effet de bord `declareWinner`. Aucun test ne couvre fréquence, génération
  d'occurrences, ou report de date (cohérent avec leur absence totale du code).
- **Composants de création** : `TontineCreate`, `CycleCreate`, `DrawCreate`
  (`tontines-module.tsx:54,91,169`) — les trois collectent des champs saisis manuellement,
  aucun n'infère quoi que ce soit d'une fréquence ou d'une règle.

**Ce qui existe réellement** : un modèle de saisie manuelle, entité par entité, sans aucune
notion de récurrence.
**Ce qui est seulement documenté** (dans les rapports d'audit précédents, pas dans le code) :
la notion que `cycle_number` répond à un besoin de rotation, et que le dictionnaire
d'origine prévoyait `frequency` sans qu'il soit implémenté.
**Ce qui est simulé par des mocks** : des cycles et tirages ponctuels, cohérents entre eux
par construction manuelle des données de seed, pas par un moteur de calcul.
**Ce qui est absent** : fréquence, règle calendaire, distinction planifié/réel, historique de
report, moteur de génération — les cinq, intégralement.

## 7. Nouveau champ `frequency`

Confirmé absent, par relecture directe indépendante de `src/mocks/tontines/tontines.ts:3-13`
(voir aussi §2 ci-dessus). Le modèle métier nécessite au minimum une notion de fréquence pour
que « occurrence selon la fréquence » ait un sens calculable.

**Valeurs candidates** (proposition à soumettre au PO, **non ajoutée au code**) :

```
DAILY
WEEKLY
MONTHLY
QUARTERLY   ← introduit par ce mandat (§1)
CUSTOM      ← présent dans le dictionnaire d'origine (P1_TONTINE_FRONTEND_READ_ONLY_AUDIT.md §5), absent de ce mandat
```

La coexistence ou l'exclusion mutuelle de `QUARTERLY` et `CUSTOM` n'est pas tranchée ici —
signalé en D-TON-04-B (§13) comme point à réconcilier entre les deux sources déjà fournies à
ce projet.

## 8. Règle de génération des occurrences (conceptuel uniquement — non implémenté)

Reproduction fidèle des exemples fournis par le mandat, à titre illustratif :

```
Tontine :
    start_date = 01/01/2026
    end_date   = 31/12/2026
    frequency  = MONTHLY
    rule       = FIRST_SUNDAY
Résultat : #1 → janvier, #2 → février, ..., #12 → décembre

Tontine :
    start_date  = 01/01/2026
    end_date    = 31/01/2026
    frequency   = WEEKLY
    day_of_week = WEDNESDAY
Résultat : occurrence #1 → mercredi ..., occurrence #2 → mercredi ..., etc.

Tontine :
    frequency = QUARTERLY
Résultat : Q1, Q2, Q3, Q4
```

**Aucun moteur de génération n'est proposé, spécifié ou implémenté par ce document** — seule
la mécanique conceptuelle est reproduite, conformément à l'instruction explicite du mandat.
Rappel du constat §2 : aucun précédent de ce type de moteur n'existe ailleurs dans TANZEN
(`Repayment` inclus), donc sa conception devra être traitée comme un chantier à part entière,
quelle que soit l'option retenue en §11.

## 9. Impact sur les modèles dérivés

| Dimension | `cycle_members` | `tontine_contributions` | `tontine_draws` | `draw_winners` |
|---|---|---|---|---|
| **Clé de rattachement aujourd'hui** | `tontineCycleId` (au tour de rotation) | `tontineCycleId` (`CycleContribution`) **ou** `tontineId`+`cycleNumber` (`Contribution`, Finance — cf. audit §8) | `tontineCycleId` (au tour de rotation) | Fusionné dans `CycleDraw`, donc `tontineCycleId` indirectement |
| **Granularité actuelle** | Une ligne par membre et par tour de rotation entier (position fixe pour toute la durée) | Une ligne par versement, rattachée au tour de rotation entier | Une ligne par tirage individuel (déjà daté) | Une ligne par tirage (1:1 imposé) |
| **Dépendance à la Tontine** | Indirecte, via le cycle | Indirecte, via le cycle (ou directe pour `Contribution` Finance) | Indirecte, via le cycle | Indirecte, via le tirage |
| **Dépendance à l'occurrence (si redéfinie, §5-B)** | 🟡 À décider — un membre serait-il rattaché par occurrence (une ligne par mois/semaine) ou reste-t-il rattaché au tour de rotation avec un rang fixe ? Directement dépendant du choix en §11 | 🟢 **Dépendance naturelle** — une cotisation correspond intuitively à UNE occurrence datée (on cotise pour une échéance précise), pas à un tour de rotation entier ; c'est l'entité la plus naturellement rattachable à l'occurrence | 🟢 **Dépendance déjà quasi native** — `CycleDraw` porte déjà une date individuelle, la plus proche de la notion d'occurrence | Suit `tontine_draws` |
| **Dépendance au tour de rotation (si conservé, §5-C)** | 🟢 Déjà le modèle actuel (position par tour) | 🟡 Possible mais indirecte (agrégation d'occurrences) | 🟡 Un tirage a-t-il lieu par tour, ou par occurrence ? Aujourd'hui plusieurs tirages existent par `TontineCycle` (ex. CYC-001 : 4 tirages) — suggère que « tirage » et « occurrence » ne sont **pas** actuellement 1:1 avec le tour de rotation, cohérent avec l'avertissement du mandat (§5-D) de ne pas assumer `cycle = draw` | Suit `tontine_draws` |
| **Impact d'un report de date** | Faible direct — le report d'une occurrence ne change pas qui est membre du cycle | 🟠 **Impact réel** — une cotisation « pour janvier » reportée à février doit-elle rester rattachée à l'occurrence de janvier (planifiée) ou basculer sur celle de février (réelle) ? Question ouverte, à trancher | 🟠 **Impact réel** — un tirage reporté du mercredi au jeudi change la date affichée dans l'historique (§3 déjà couvert par `CycleDraw.date`), mais pas de champ pour tracer QUE c'était prévu mercredi | Suit `tontine_draws` |

**Synthèse** : `tontine_contributions` et `tontine_draws` sont les deux modèles les plus
directement affectés par la définition retenue de « occurrence » — l'un parce qu'une
cotisation se rattache naturellement à une échéance précise (renforce l'intérêt de résoudre
D-TON-07, déjà signalé bloquant par l'audit d'origine, en même temps que cette décision) ;
l'autre parce qu'il porte déjà, structurellement, la donnée la plus proche du besoin
(une date individuelle), ce qui en fait un candidat naturel indépendamment de l'option
retenue (cf. §11, Option A). `cycle_members` est le moins directement couplé à cette décision,
mais reste dépendant du choix de granularité si l'Option B est retenue.

## 10. Historisation

Couvert en détail en §4. Rappel synthétique : le mécanisme d'audit générique `AuditEvent`
(`src/mocks/audit/audit-events.ts`) est **structurellement suffisant** pour porter qui/quand/
quel motif/quelle valeur avant-après d'un report, et est **déjà le mécanisme employé** pour
des changements d'état sensibles analogues ailleurs dans le projet (Fiscal Year). Aucun
nouveau système d'audit n'est proposé — c'est une réutilisation, pas une création,
conformément à l'instruction explicite du mandat.

## 11. Options A / B / C — réévaluées à la lumière du besoin métier

### Option A — Enrichir `tontine_draws` (`CycleDraw` porte l'occurrence planifiée)

`CycleDraw` reçoit `plannedDate`/`actualDate` (état courant) + traçabilité de report via
`AuditEvent` (§10). `TontineCycle` reste le tour de rotation, inchangé dans son rôle.

- **Avantages** : s'appuie sur l'entité qui porte déjà une date individuelle réelle ;
  aucune redéfinition d'entité existante ; réutilise directement le mécanisme d'audit déjà en
  place (§10) ; le moins de rupture avec `cycle_members` (§9), qui resterait inchangé.
- **Inconvénients** : le vocabulaire du besoin métier (« cycle 1 = janvier ») ne correspond
  alors à aucun nom réel dans le code — un lecteur du modèle devra apprendre que « cycle »
  (métier) = `CycleDraw` (code), pas `TontineCycle` (code), source durable de confusion pour
  quiconque découvre le projet sans ce document.
- **Cohérence métier** : moyenne — respecte la donnée mais pas le vocabulaire du besoin
  exprimé.
- **Impact sur les modèles dérivés** : `tontine_contributions` gagnerait une clé
  d'occurrence naturelle (`drawId` ou équivalent) sans devoir attendre une refonte de
  `tontine_cycles` — impact positif indirect sur D-TON-07 (§9).
- **Migration conceptuelle** : faible — `CycleDraw` existe déjà, aucun renommage d'entité de
  premier niveau requis, seulement des champs additifs.
- **Impact UX** : faible-modéré — les écrans « Draws » (`DrawsHub`, `DrawDetail`,
  `tontines-module.tsx:160-216`) devraient afficher deux dates au lieu d'une, mais la
  structure de navigation reste identique.
- **Risque de dette technique** : **le mot « cycle » resterait durablement ambigu**
  (`TontineCycle` = tour de rotation, mais le vocabulaire métier continuerait d'appeler
  « cycle » ce que le code appelle `CycleDraw`/tirage) — dette sémantique persistante,
  signalée explicitement par le mandat comme un risque à ne pas sous-estimer (§5 : « ne pas
  utiliser le même mot cycle pour deux concepts différents »).

### Option B — Redéfinir `tontine_cycles` en occurrence unitaire

`TontineCycle` devient l'entité qui porte directement l'occurrence planifiée
(`plannedDate`/`actualDate`/traçabilité) ; le tour de rotation complet (aujourd'hui un seul
`TontineCycle` pluri-mensuel) doit être relogé — implicitement dérivable (regroupement
d'occurrences par `tontineId`) ou en tant que nouvelle entité, non couverte par le
dictionnaire à 6 modèles fourni jusqu'ici.

- **Avantages** : aligne exactement le vocabulaire du code sur celui du besoin métier
  (« cycle » = occurrence, sans traduction mentale) ; résout structurellement la collision
  identifiée en §5 en donnant enfin un nom propre au concept B ; rapproche naturellement
  `tontine_contributions` d'une clé `cycle_id` directement significative (une cotisation par
  occurrence mensuelle/hebdomadaire), ce qui **simplifierait potentiellement** la
  réconciliation `Contribution`/`CycleContribution` (D-TON-07 de l'audit) en leur donnant
  enfin une clé d'occurrence commune et datée.
- **Inconvénients** : impact structurel majeur et en cascade — `cycleNumber` change de sens
  (numérote des occurrences, pas des tours de rotation — rupture sémantique avec la
  numérotation actuelle, ex. `CYC-001` = « cycle 1 » aujourd'hui désigne un tour de 12 mois,
  demain désignerait potentiellement janvier seul) ; `cycle_members` doit être repensé
  (rattachement par occurrence ou conservation du tour de rotation comme conteneur, §9) ;
  le concept C (tour de rotation) perd son support actuel sans qu'aucune source ne précise où
  il doit aller ; risque de collision/redondance frontale avec `tontine_draws`, qui représente
  aujourd'hui une notion très proche (une occurrence datée) — au point de rendre les deux
  entités quasi-synonymes si les deux sont conservées sans distinction claire.
- **Cohérence métier** : forte — le vocabulaire final serait sans ambiguïté pour un
  utilisateur métier.
- **Impact sur les modèles dérivés** : le plus large des trois options — les quatre entités
  dérivées (`cycle_members`, `tontine_contributions`, `tontine_draws`, `draw_winners`, cf. §9)
  sont potentiellement affectées, certaines directement (clé de rattachement change de sens),
  d'autres indirectement (collision avec `tontine_draws`, §5).
- **Migration conceptuelle** : élevée — renommage/redéfinition d'une entité de premier niveau
  déjà exposée dans 10 routes UI, testée par 18 tests, et référencée par un `WorkflowDefinition`
  existant (`WD-002`, domaine `tontines`, entité `cycle` — déjà signalé non connecté au
  comportement réel par l'audit, D-TON-11, mais dont le vocabulaire `entityType: 'cycle'`
  devrait lui aussi être réexaminé si le sens de « cycle » change).
- **Impact UX** : élevé — la page `CycleList`/`CycleDetail` actuelle (qui affiche aujourd'hui
  4-12 cycles au total dans les données de seed, un par tour de rotation) afficherait
  potentiellement des dizaines à centaines d'occurrences pour une tontine hebdomadaire ou
  journalière pluriannuelle — la pagination/le filtrage de `CycleList`
  (`tontines-module.tsx:110-132`, actuellement sans pagination) n'a jamais été conçue pour ce
  volume.
- **Risque de dette technique** : élevé si le tour de rotation n'est pas explicitement relogé
  (concept C orphelin) ; élevé aussi si `tontine_draws` n'est pas clairement redistingué de
  l'occurrence redéfinie (retour à la case départ de la collision, cette fois entre
  `tontine_cycles` et `tontine_draws` plutôt qu'entre `tontine_cycles` et le besoin métier).

### Option C — Statu quo, besoin métier documenté comme non couvert

Ni `TontineCycle` ni `CycleDraw` ne sont modifiés ; le besoin métier reste `DECISION_REQUIRED`
non résolue.

- **Avantages** : aucun risque de construire sur une lecture erronée ; cohérent avec le
  caractère strictement READ-ONLY de ce mandat.
- **Inconvénients** : **ne doit pas être retenue au seul motif que le code actuel
  fonctionne** (instruction explicite du mandat, §11) — le code actuel ne répond à aucun des
  points 1 à 4 du besoin métier (fréquence, calendrier, planifié/réel, report), donc le statu
  quo est un report intégral du besoin, pas une solution partielle.
- **Cohérence métier** : nulle — le statu quo ne répond à aucune partie du besoin exprimé.
- **Impact sur les modèles dérivés** : aucun changement, mais aucun des gaps déjà identifiés
  par l'audit d'origine (D-TON-07 notamment) n'est facilité non plus.
- **Migration conceptuelle** : aucune.
- **Impact UX** : aucun changement, mais aucune amélioration du besoin exprimé par le
  mandat non plus.
- **Risque de dette technique** : la dette n'augmente pas, mais elle ne diminue pas non plus
  — le besoin métier devra être retraité intégralement lors d'une future mission, sans qu'aucun
  travail préparatoire n'ait été engagé entre-temps.

### Tableau comparatif

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Aligne le vocabulaire code ↔ métier | Non | Oui | Sans objet |
| Résout la collision « cycle » (§5) | Partiellement (déplace l'ambiguïté, ne l'élimine pas) | Oui, si le tour de rotation est explicitement relogé | Non |
| Impact sur `cycle_members`/`tontine_contributions`/`tontine_draws`/`draw_winners` | Faible-modéré | Élevé, en cascade | Nul |
| Risque de collision avec une autre entité existante | Faible | Élevé (`tontine_draws`) | Nul |
| Effort de migration conceptuelle | Faible | Élevé | Nul |
| Répond au besoin métier exprimé (§1-4) | Partiellement (données oui, vocabulaire non) | Totalement, si bien exécuté | Pas du tout |

## 12. Proposition d'architecture conceptuelle (illustrative — non décidée)

Reproduction de la structure fournie par le mandat, à des fins d'analyse uniquement :

```
Tontine
   │
   ├── Scheduling / Calendar Rule
   │
   └── Tontine Occurrences
            │
            ├── planned_date
            ├── actual_date
            ├── sequence_number
            ├── status
            └── rescheduling history
                     │
                     ├── Contributions
                     ├── Draw
                     └── Winner
```

**Analyse** :

- Cette structure introduit une **quatrième entité de premier niveau** (« Tontine
  Occurrences »), distincte à la fois de `TontineCycle` (tour de rotation) et de `CycleDraw`
  (tirage) — ce qui résout explicitement la collision de vocabulaire (§5) sans sacrifier ni le
  tour de rotation ni le tirage : les trois concepts (A, B, C, D de §5) obtiendraient chacun
  un nom propre.
- Elle place `Draw` et `Winner` **sous** l'occurrence, cohérent avec le constat de §9
  (`tontine_draws` est déjà l'entité la plus proche d'une occurrence datée) — mais introduit
  une question non tranchée : un `Draw` reste-t-il un sous-objet de l'occurrence (comme
  aujourd'hui `CycleDraw` est un sous-objet de `TontineCycle`), ou l'occurrence ET le tirage
  fusionnent-ils purement et simplement (auquel cas cette structure se réduit à une variante
  de l'Option A avec renommage) ?
- Elle ne dit rien de l'emplacement du **tour de rotation** — si cette structure est retenue
  telle quelle, `Tontine → Occurrences` directement (sans notion de tour intermédiaire)
  suggère que le tour de rotation deviendrait une notion **dérivée/calculée**
  (ex. « le tour de rotation en cours = l'ensemble des occurrences non encore toutes
  attribuées à un gagnant »), pas une entité stockée — une hypothèse plausible mais **non
  confirmée par aucune source**, à valider explicitement par le PO si cette architecture est
  retenue.
- « Scheduling / Calendar Rule » comme sous-objet de `Tontine` correspond directement au
  besoin de §2 (fréquence + règle) — cohérent, mais son schéma précis n'est pas fourni
  (illustration, pas une spécification).

**Ce document ne recommande ni ne rejette cette architecture** — elle est présentée comme une
option structurante possible, à valider ou écarter explicitement par le PO (cf. D-TON-04-A,
§13).

## 13. DECISION GATE — D-TON-04

| Décision | Question | Option(s) en présence | Élément factuel (pas une préférence imposée) | Statut |
|---|---|---|---|---|
| **D-TON-04-A** | Quelle est la définition canonique de « cycle » ? Faut-il introduire une 4ᵉ entité (« occurrence ») distincte du tour de rotation ET du tirage (§12), ou réutiliser l'une des deux entités existantes (§11, Options A/B) ? | Option A (`tontine_draws` porte l'occurrence) / Option B (`tontine_cycles` redéfini) / Option architecture élargie (§12, nouvelle entité « Occurrence ») / Option C (statu quo) | L'introduction d'une 4ᵉ entité (§12) est la seule des options qui résout la collision de vocabulaire (§5) sans sacrifier le tour de rotation ni le tirage — mais c'est aussi celle au périmètre le plus large | 🟡 DECISION REQUIRED |
| **D-TON-04-B** | Quelles valeurs de `frequency` retenir — `DAILY/WEEKLY/MONTHLY/QUARTERLY` (ce mandat) ou `DAILY/WEEKLY/MONTHLY/CUSTOM` (dictionnaire d'origine, audit initial) — ou les deux combinées ? | Adopter `QUARTERLY` / Adopter `CUSTOM` / Combiner les deux / Autre | Les deux sources fournies à ce projet divergent sur ce point précis (§1, §7) — aucune des deux ne prime sur l'autre dans les documents disponibles | 🟡 DECISION REQUIRED |
| **D-TON-04-C** | Quelle granularité de règle calendaire est réellement nécessaire (jour fixe, Nième jour de semaine du mois, premier jour du trimestre, etc.) ? | Liste ouverte, non exhaustive par instruction du mandat | Aucune règle ne doit être présumée suffisante ou insuffisante sans validation PO (§2 du mandat : « ne pas inventer une liste exhaustive ») | 🟡 DECISION REQUIRED |
| **D-TON-04-D** | `planned_date`/`actual_date` doivent-ils être des champs directs sur l'entité occurrence (état courant), avec l'historique porté séparément par `AuditEvent` ? | Champs directs + `AuditEvent` (cohérent avec le pattern déjà en place, §4, §10) / Autre structure | C'est la seule option qui réutilise un mécanisme déjà existant dans TANZEN sans en créer un nouveau (contrainte explicite du mandat, §10) | 🟡 DECISION REQUIRED |
| **D-TON-04-E** | Le report doit-il être limité à un simple changement de date, ou faut-il un concept explicite de « reschedule » avec ses propres règles (délai maximal, nombre de reports autorisés, etc.) ? | Simple changement tracé / Concept `Reschedule` dédié avec règles | Aucune règle de ce type n'est sourcée par le mandat — à ne pas inventer (§4 du mandat) | 🟡 DECISION REQUIRED |
| **D-TON-04-F** | Le motif de report (`reschedule_reason`) est-il obligatoire ou optionnel ? | Obligatoire / Optionnel (« lorsque disponible », formulation du mandat) | Le mandat emploie lui-même « lorsque celui-ci est disponible » — suggère l'optionnalité, sans le trancher formellement | 🟡 DECISION REQUIRED |
| **D-TON-04-G** | Un `Draw`/tirage reste-t-il un sous-objet de l'occurrence (1 ou plusieurs tirages par occurrence), ou l'occurrence et le tirage fusionnent-ils ? | Sous-objet distinct / Fusion pure | Aujourd'hui, plusieurs `CycleDraw` existent par `TontineCycle` (ex. `CYC-001` : 4 tirages) — la relation n'est **pas** 1:1 dans le modèle actuel, ce qui pèse contre une fusion automatique occurrence=tirage sans validation (§5-D, §9) | 🟡 DECISION REQUIRED |
| **D-TON-04-H** | `cycle_members` : rattachement par occurrence (une ligne par mois/semaine) ou par tour de rotation (comme aujourd'hui, position fixe pour toute la durée) ? | Par occurrence / Par tour de rotation (statu quo) | Dépend directement de D-TON-04-A — pas de réponse indépendante possible (§9) | 🟡 DECISION REQUIRED (dépendante de D-TON-04-A) |
| **D-TON-04-I** | `tontine_contributions` : la clé de rattachement doit-elle devenir l'occurrence (naturelle, cf. §9) plutôt que `tontineId`+`cycleNumber` (actuel, `Contribution` Finance) ou `tontineCycleId` seul (actuel, `CycleContribution`) ? | Clé occurrence unifiée / Statu quo (2 modèles non réconciliés, D-TON-07 de l'audit) | Une clé d'occurrence datée résoudrait une partie du problème de réconciliation déjà signalé bloquant par l'audit d'origine (D-TON-07) — élément factuel favorable, pas une décision prise ici | 🟡 DECISION REQUIRED (couplée à D-TON-07 de l'audit d'origine) |
| **D-TON-04-J** | `draw_winners`, déjà fusionnée dans `tontine_draws` (D-TON-10 de l'audit, `MODEL_GAP` assumé) : cette fusion doit-elle être réexaminée si `tontine_draws`/l'occurrence changent de définition ? | Maintenir la fusion / Réexaminer indépendamment | Toute décision affectant `tontine_draws` (D-TON-04-A, D-TON-04-G) affecte mécaniquement `draw_winners`, puisqu'elles sont aujourd'hui la même structure — pas une question isolée | 🟡 DECISION REQUIRED (dépendante de D-TON-04-A et D-TON-04-G) |

**Aucune option recommandée n'est imposée dans la colonne dédiée** — conformément à
l'instruction explicite du mandat de ne pas retenir une solution par simple confort avec
l'existant, et à l'absence de source permettant de trancher objectivement entre les lectures
possibles.

```
DECISION GATE = OPEN
```

## 14. Règle absolue — conformité

Aucune ligne de `src/`, `app/`, `mocks/`, `services/`, `tests/`, `config/`, `locales/` n'a été
créée, modifiée ou supprimée par ce mandat. Aucun champ n'a été ajouté au code. Aucun autre
modèle n'a été modifié. D-TON-05 n'a pas été instruite. Le livrable produit est exclusivement
analytique : analyse, modèle conceptuel, options, impacts, décisions requises.

## 15. Livrable

```
docs/P1_TONTINE_D-TON-04_REVISION_TONTINE_CYCLES_DECISION_GATE.md   (ce document, remplace la v1)
```

## 16. Contrôles finaux

```
Backend      : NON TOUCHÉ
Commercial   : NON TOUCHÉ
Mobile       : NON TOUCHÉ
Code frontend: NON MODIFIÉ
Tests        : NON MODIFIÉS
Mocks        : NON MODIFIÉS
Config       : NON MODIFIÉE
Commit       : AUCUN
Push         : AUCUN
```

Aucune décision n'est déclarée validée par ce document — toutes restent `DECISION REQUIRED`
jusqu'à validation PO explicite, décision par décision.

---

## Tableau final

| Décision | Question | Option recommandée | Statut |
|---|---|---|---|
| D-TON-04-A | Définition canonique de « cycle » (occurrence vs tour de rotation vs tirage) | Aucune — 4 options en présence (§13), aucune imposée | DECISION REQUIRED |
| D-TON-04-B | Valeurs de `frequency` (`QUARTERLY` vs `CUSTOM`, divergence de sources) | Aucune — à réconcilier par le PO | DECISION REQUIRED |
| D-TON-04-C | Granularité de la règle calendaire | Aucune — liste non exhaustive, à spécifier | DECISION REQUIRED |
| D-TON-04-D | `planned_date`/`actual_date` en champs directs + `AuditEvent` pour l'historique | Élément factuel favorable (réutilisation d'un mécanisme existant), non imposé | DECISION REQUIRED |
| D-TON-04-E | Reschedule : simple changement tracé vs concept dédié avec règles | Aucune — aucune règle sourcée | DECISION REQUIRED |
| D-TON-04-F | Motif de report obligatoire ou optionnel | Aucune — le mandat suggère l'optionnalité sans trancher | DECISION REQUIRED |
| D-TON-04-G | Relation Draw ↔ Occurrence (sous-objet vs fusion) | Aucune — la donnée actuelle (plusieurs tirages par cycle) pèse contre une fusion automatique | DECISION REQUIRED |
| D-TON-04-H | Granularité de `cycle_members` (par occurrence vs par tour de rotation) | Aucune — dépend de D-TON-04-A | DECISION REQUIRED |
| D-TON-04-I | Clé de rattachement de `tontine_contributions` | Aucune — couplée à D-TON-07 de l'audit d'origine | DECISION REQUIRED |
| D-TON-04-J | Réexamen de la fusion `draw_winners` ↔ `tontine_draws` | Aucune — dépend de D-TON-04-A et D-TON-04-G | DECISION REQUIRED |

```
DECISION GATE = OPEN
```

FIN DU MANDAT.
