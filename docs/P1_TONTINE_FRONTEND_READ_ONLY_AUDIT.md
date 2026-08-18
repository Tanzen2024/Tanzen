# P1 TONTINE — FRONTEND READ-ONLY AUDIT

**Mandat** : P1 TONTINE — TANZEN FRONTEND — PHASE 1 — READ-ONLY DATA MODEL & IMPLEMENTATION AUDIT
**Type** : Audit uniquement — **AUCUNE MODIFICATION DE CODE**
**Périmètre** : `tanzen-frontend` uniquement

---

## 1. Mandat

Comparer, champ par champ et contrainte par contrainte, les six modèles métier fournis
(`tontines`, `tontine_cycles`, `cycle_members`, `tontine_contributions`, `tontine_draws`,
`draw_winners`) avec l'implémentation réelle du domaine Tontine dans `tanzen-frontend`.
Aucune supposition, aucune invention des éléments absents : tout ce qui n'est pas
déterminable est classé `DECISION_REQUIRED` ou `MODEL_GAP`. Le code réel prime sur toute
documentation préexistante.

## 2. Périmètre

Analysé : `tanzen-frontend` exclusivement.
Non analysé, non modifié : `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile`.
Aucun fichier source, test, mock, service ou route n'a été modifié — seul ce rapport a été créé.

### État Git avant audit

```
git status --short
```

Modifications préexistantes constatées (non liées à cet audit, laissées intactes — travaux de
mandats antérieurs) : `src/app/providers.tsx`, `src/contexts/index.ts`,
`src/features/audit/audit-module.tsx`, `src/features/operations/operations-module.tsx`,
`src/features/settings/settings-module.tsx`, `src/layouts/*`, `src/locales/*`,
`src/mocks/audit/audit-events.ts`, `src/mocks/operations/workflow-*.ts`,
`src/mocks/rbac.mocks.ts`, `src/mocks/settings/fiscal-years.ts`, `src/services/query-keys.ts`,
`src/services/role.service.test.ts`, `src/services/settings.service*.ts`,
`src/services/workflow.service*.ts`, `src/test/render-with-providers.tsx`, plusieurs fichiers
`docs/*.md` non suivis. **Aucun fichier du domaine Tontine** (`src/mocks/tontines/**`,
`src/services/tontines.service*.ts`, `src/features/tontines/**`) ne figure dans cette liste —
confirmé non modifié avant et après cet audit.

## 3. Sources analysées

- `src/mocks/tontines/tontines.ts`, `src/mocks/tontines/tontine-cycles.ts`,
  `src/mocks/tontines/index.ts`
- `src/services/tontines.service.ts`, `src/services/tontines.service.test.ts`
- `src/features/tontines/tontines-module.tsx`
- `src/mocks/rbac.mocks.ts` (catalogue de permissions)
- `src/mocks/operations/workflow-definitions.ts`, `workflow-requests.ts` (référence croisée
  avec `WD-002`, domaine `tontines`)
- `src/mocks/finance/contributions.ts` (modèle `Contribution`, croisement avec le domaine
  Tontine — cf. §16 Legacy/duplications)
- `src/mocks/organization/members.ts` (référence croisée `Member.id`)
- `src/services/query-keys.ts`, `src/services/tenant-scope.ts`

**Note** : des documents d'audit antérieurs existent déjà dans `docs/`
(`P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md`, `P1_TONTINE_PO_DECISION_VALIDATION.md`,
IDs `D-TON-01` à `D-TON-04` partiels). Conformément au mandat (« le code réel prime sur les
rapports »), ce document a été construit **indépendamment**, par relecture directe du code
source, sans dépendre de ces rapports antérieurs. Les IDs `D-TON-xx` de la §18 ci-dessous sont
donc une numérotation propre à ce document, non garantie identique à celle des rapports
précédents — à réconcilier explicitement si les deux séries doivent fusionner.

## 4. État général

Le domaine Tontine est un module fonctionnel, testé (isolation tenant, machine à états des
cycles), avec une UI branchée de bout en bout pour les opérations couvertes. Mais il couvre
une portion **structurellement différente** du dictionnaire fourni :

- Les 4 dernières tables du dictionnaire (`tontine_cycles`, `cycle_members`,
  `tontine_contributions`, `tontine_draws`) sont représentées non pas comme des entités
  indépendantes avec leurs propres identifiants globaux et clés étrangères, mais comme des
  **tableaux imbriqués** à l'intérieur de `TontineCycle` (à l'exception de `tontines` et
  `tontine_cycles` eux-mêmes, qui sont des tableaux de premier niveau).
- La 6ᵉ table, `draw_winners`, **n'existe pas du tout** comme entité séparée — entièrement
  fusionnée dans `tontine_draws`.
- Les champs d'historisation/traçabilité du dictionnaire (`uuid`, `version`, `sync_status`,
  `created_by`, `updated_by`, `deleted_at`, et `updated_at` pour la plupart des tables) sont
  **absents de tous les modèles**, sans exception.
- La création réelle de `tontine_contributions` (« enregistrer une cotisation ») **n'existe
  nulle part** — ni en service, ni en UI. Seule la lecture est branchée.
- `tontine_draws.draw_type` (ROTATION/AUCTION/RANDOM) est **absent** : le code documente
  explicitement (commentaire dans `tontines.service.ts`) que la désignation du gagnant est
  **manuelle**, jamais un algorithme.

À l'inverse, le code implémente des éléments réels et fonctionnels que le dictionnaire
laissait explicitement ouverts : une machine à états de cycle à 4 valeurs
(`statusDraft/statusOpen/statusSuspended/statusClosed`) avec transitions validées, et un vrai
`cycleNumber` unique par tontine.

## 5. `tontines`

**Type réel** : `Tontine` (`src/mocks/tontines/tontines.ts:3-13`)
**Service** : `tontinesService.listTontines`, `getTontine`, `createTontine`
(`src/services/tontines.service.ts:21-28`)

| Champ dictionnaire | Réel | État | Observation |
|---|---|---|---|
| `id` | `id: string` (format `TON-001`) | IMPLEMENTED | Pas un UUID réel, identifiant opaque de mock |
| `uuid` | absent | MISSING | Aucun champ distinct de `id` |
| `tenant_id` | `tenantId` | IMPLEMENTED | Tenant-scopé via `getTenantScoped`, testé |
| `name` | `name` | IMPLEMENTED | |
| `description` | absent | MISSING | |
| `frequency` (DAILY/WEEKLY/MONTHLY/CUSTOM) | absent | MISSING | Aucune fréquence de cotisation au niveau Tontine |
| `default_contribution_amount` | absent | MISSING | Le seul montant existant (`expectedAmount`) vit à `CycleMember`, pas à `Tontine` |
| `is_purchasable` | absent | MISSING | Aucun champ, aucune trace — pas de lien constaté ni supposé avec le domaine commercial |
| `status` (ACTIVE/PAUSED/CLOSED) | `status: 'statusActive' \| 'statusInactive'` | CONTRADICTORY | 2 valeurs réelles vs 3 attendues ; `PAUSED` n'existe pas ; convention de nommage (`statusX` camelCase clé i18n) différente de `SCREAMING_SNAKE` |
| `sync_status` | absent | MISSING | |
| `version` | absent | MISSING | |
| `created_at` | `createdAt` | IMPLEMENTED | Date seule (pas de timestamp) |
| `updated_at` | absent | MISSING | |
| `deleted_at` | absent | MISSING | Aucun soft-delete constaté sur ce modèle |
| `created_by` / `updated_by` | absent | MISSING | |

**Champs réels hors dictionnaire** : `type` (`'cooperative' \| 'tontine' \| 'association' \|
'mutuelle'` — utilisé réellement en filtrage/affichage), `memberCount`, `activeCycles`,
`totalContributions` (agrégats dénormalisés, recalculés nulle part dynamiquement — valeurs
figées en seed, jamais mises à jour par les services `addCycleMember`/`createDraw`/etc.).

**Contraintes** :

| Contrainte | État | Observation |
|---|---|---|
| `uq_tontines_uuid` | NOT_ENFORCEABLE_IN_FRONTEND | Pas de champ `uuid` |
| `uq_tontines_name` | MISSING | `createTontine` n'effectue **aucune** vérification de doublon de nom |
| `default_contribution_amount > 0` | MISSING | Champ absent |
| `status` enum | CONTRADICTORY | cf. tableau ci-dessus |
| `sync_status` enum | MISSING | Champ absent |

## 6. `tontine_cycles`

**Type réel** : `TontineCycle` (`src/mocks/tontines/tontine-cycles.ts:52-67`)
**Service** : `listCyclesByTontine`, `getCycle`, `listCyclesByMember`, `createCycle`,
`updateCycleStatus` (`src/services/tontines.service.ts:31-60`)

| Champ dictionnaire | Réel | État | Observation |
|---|---|---|---|
| `id` | `id` | IMPLEMENTED | |
| `uuid` | absent | MISSING | |
| `tenant_id` | `tenantId` | IMPLEMENTED | |
| `tontine_id` | `tontineId` | IMPLEMENTED | Relation vérifiée en 2 temps (parent Tontine tenant-scopé avant tout accès) |
| `start_date` | `startDate` | IMPLEMENTED | Obligatoire (type non optionnel) |
| `end_date` | `endDate` | PARTIALLY_IMPLEMENTED | Obligatoire dans le type (jamais `null`, contrairement à l'option `IS NULL` du dictionnaire) ; **jamais modifiée** par `updateCycleStatus` lors de la clôture → se comporte comme une date **planifiée**, jamais **constatée**. Non tranché explicitement — cf. D-TON-03 |
| `status` | `'statusDraft' \| 'statusOpen' \| 'statusSuspended' \| 'statusClosed'` | IMPLEMENTED (valeurs réelles) | Le dictionnaire laissait ces valeurs ouvertes (§9 du mandat) — le code, lui, a un jeu de 4 valeurs réel, avec machine à états explicite (`VALID_CYCLE_TRANSITIONS`, `tontines.service.ts:13-18`) et testée. À faire valider formellement — cf. D-TON-02 |
| `version` | absent | MISSING | |
| `created_at` / `updated_at` / `deleted_at` / `created_by` / `updated_by` | absent | MISSING | Aucun de ces 5 champs n'existe |

**Champs réels hors dictionnaire** :
- `cycleNumber` — le dictionnaire qualifiait ce champ d'« éventuel » (§9 du mandat,
  explicitement non tranché). **Le code l'implémente réellement**, avec une contrainte
  d'unicité appliquée (`tontines.service.ts:45-46` : refus de créer un cycle si
  `tontineId`+`cycleNumber` existe déjà pour ce tenant). C'est un fait constaté, pas une
  invention — cf. D-TON-04 pour la validation formelle.
- `expectedTotal`, `totalCollected`, `totalPaidOut` — agrégats non prévus par le dictionnaire.
- `members[]`, `contributions[]`, `draws[]`, `activities[]` — voir §11 Relations : différence
  structurelle majeure avec le modèle normalisé du dictionnaire.

**Contraintes** :

| Contrainte | État | Observation |
|---|---|---|
| `uq_tontine_cycles_uuid` | NOT_ENFORCEABLE_IN_FRONTEND | Pas de champ `uuid` |
| `end_date IS NULL OR end_date > start_date` | MISSING | Ni la nullabilité ni `end_date > start_date` ne sont validées par `createCycle` — aucun contrôle temporel constaté (à la différence de `createFiscalYear`, dans un autre domaine, qui valide `endDate > startDate`) |
| `version >= 1` | MISSING | Champ absent |

## 7. `cycle_members`

**Type réel** : `CycleMember`, imbriqué dans `TontineCycle.members[]`
(`src/mocks/tontines/tontine-cycles.ts:3-15`)
**Service** : `addCycleMember` uniquement (`src/services/tontines.service.ts:63-70`) — **aucune
fonction de mise à jour ou de suppression**

| Champ dictionnaire | Réel | État | Observation |
|---|---|---|---|
| `id` | `id` | IMPLEMENTED | |
| `uuid` | absent | MISSING | |
| `cycle_id` | `tontineCycleId` | IMPLEMENTED | |
| `member_id` | `memberId` | PARTIALLY_IMPLEMENTED | Champ présent (format cohérent avec `Member.id`), mais **aucune validation service-side** que l'identifiant référence un `Member` réel du tenant — seule l'UI filtre la liste proposée (`tontines-module.tsx`) ; le service accepte n'importe quelle chaîne. Cf. D-TON-06 |
| `initial_rank` | `position` | PARTIALLY_IMPLEMENTED / DECISION_REQUIRED | Nom différent ; jamais modifié après création (cohérent avec une sémantique « initiale »), mais l'équivalence `position` ≡ `initial_rank` n'est confirmée par aucune source — cf. D-TON-05 (regroupé) |
| `join_date` | absent | MISSING | Aucun champ ne capture la date d'entrée d'un membre dans un cycle |
| `status` (ACTIVE/INACTIVE/EXITED/SUSPENDED) | `'statusActive' \| 'statusInactive'` | CONTRADICTORY | 2 valeurs vs 4 ; `EXITED`/`SUSPENDED` n'existent pas ; et surtout **aucun service ne transitionne jamais ce champ** après `addCycleMember` — les valeurs `statusInactive` observées en seed (ex. `CM-012`) sont uniquement des données de démonstration figées, jamais atteignables par une action utilisateur réelle |
| `sync_status` | absent | MISSING | |
| `version` | absent | MISSING | |
| `created_at` / `updated_at` / `deleted_at` / `created_by` / `updated_by` | absent | MISSING | |

**Champs réels hors dictionnaire** : `memberName` (dénormalisé, affichage), `expectedAmount`,
`collectedAmount`, `payoutAmount` (relèvent conceptuellement de `tontine_contributions`/
`tontine_draws` dans le modèle normalisé du dictionnaire, mais sont portés ici), `hasWon`
(relève conceptuellement de `draw_winners`, inexistant — cf. §10).

**Contraintes** :

| Contrainte | État | Observation |
|---|---|---|
| `uq_cycle_members_uuid` | NOT_ENFORCEABLE_IN_FRONTEND | |
| `uq_cycle_members_cycle_member` (unicité membre/cycle) | MISSING | `addCycleMember` n'effectue **aucune** vérification de doublon |
| `uq_cycle_members_cycle_rank` (unicité rang/cycle) | MISSING | Idem, aucune vérification sur `position` |
| `uq_cycle_members_cycle_join` | MISSING | Sans objet — le champ `join_date` lui-même est absent |
| `initial_rank > 0` | MISSING | Aucune validation sur `position` en entrée |
| `join_date` obligatoire | MISSING | Champ absent |

**Gestion de l'ordre / sortie / suspension** : aucun workflow n'existe pour retirer, suspendre
ou faire sortir un membre d'un cycle — seule la création (`addCycleMember`) est implémentée.
Non inventé au-delà de ce constat.

## 8. `tontine_contributions`

**Constat structurant** : **deux modèles partiels et non unifiés** coexistent, aucun des deux
ne couvrant `tontine_contributions` tel que décrit par le dictionnaire, et **aucune opération
de création n'existe pour l'un ou l'autre depuis le domaine Tontine**.

### 8.1 `CycleContribution` (`src/mocks/tontines/tontine-cycles.ts:17-24`)

Imbriqué dans `TontineCycle.contributions[]`. Affiché en lecture seule dans l'onglet
« Cotisations » du détail de cycle (`ContributionRows`, `tontines-module.tsx:274`) —
**aucun bouton, formulaire ou mutation** ne permet d'en créer une nouvelle ; `tontinesService`
ne contient **aucune fonction `addContribution`/`recordContribution`**.

| Champ dictionnaire | Réel | État |
|---|---|---|
| `id` | `id` | IMPLEMENTED |
| `cycle_id` | `tontineCycleId` | IMPLEMENTED |
| `member_id` | absent (seul `memberName`, texte libre) | MISSING |
| `amount` | `amount` | IMPLEMENTED |
| `contribution_date` | `date` | IMPLEMENTED |
| `status` (PAID/PENDING/FAILED/CANCELLED) | `'statusCompleted' \| 'statusPending'` | CONTRADICTORY (2 valeurs vs 4, pas de `FAILED`/`CANCELLED`) |
| `payment_method` | absent | MISSING |
| `reference` | absent | MISSING |
| `sync_status`, `version`, `uuid`, `created_at`/`updated_at`/`deleted_at`/`created_by`/`updated_by` | absent | MISSING |

### 8.2 `Contribution` (`src/mocks/finance/contributions.ts:14-23`) — domaine Finance

Modèle distinct, documenté dans son propre commentaire comme « l'écriture ledger côté
Finance », explicitement séparé de `CycleContribution`. Référence la tontine via
`tontineId` + `cycleNumber` (**pas** `cycle_id` direct vers `TontineCycle.id`).

| Champ dictionnaire | Réel | État |
|---|---|---|
| `cycle_id` | absent (référence indirecte `tontineId`+`cycleNumber`) | CONTRADICTORY |
| `member_id` | `memberId` (FK réelle) | IMPLEMENTED |
| `amount`, `contribution_date` (`date`) | présents | IMPLEMENTED |
| `status` | `'completed' \| 'pending'` (2 valeurs) | CONTRADICTORY |
| `payment_method`, `reference` | absents | MISSING |

**Incohérence référentielle constatée** : `FC-001` (`Contribution`) référence
`tontineId: 'TON-001', cycleNumber: 4` — aucun `TontineCycle` avec `cycleNumber: 4` pour
`TON-001` n'existe dans `tontineCycles` (seuls les cycles 1 et 2 y sont seedés). Les deux jeux
de données ne sont **pas croisés de manière cohérente**.

**Synthèse** : `tontine_contributions` (au sens du dictionnaire, avec `cycle_id`+`member_id`
sur la même ligne) **n'existe pas** en tant que modèle unique. C'est un `MODEL_GAP` combiné à
une `MISSING` fonctionnelle majeure : le domaine Tontine ne permet à ce jour d'enregistrer
**aucune** cotisation depuis son propre écran. Cf. D-TON-07.

## 9. `tontine_draws`

**Type réel** : `CycleDraw`, imbriqué dans `TontineCycle.draws[]`
(`src/mocks/tontines/tontine-cycles.ts:29-43`)
**Service** : `createDraw`, `declareWinner` (`src/services/tontines.service.ts:72-98`)

| Champ dictionnaire | Réel | État | Observation |
|---|---|---|---|
| `id` | `id` | IMPLEMENTED | |
| `uuid` | absent | MISSING | |
| `cycle_id` | `tontineCycleId` | IMPLEMENTED | |
| `draw_number` | `drawNumber` | IMPLEMENTED (représentation) | Valeur présente, mais cf. contraintes ci-dessous |
| `draw_date` | `date` | IMPLEMENTED | |
| `scheduled_member_id` | absent | MISSING | Aucun champ distinct pour « membre prévu avant tirage » |
| `actual_winner_id` | `winnerMemberId` (nullable) | IMPLEMENTED | |
| `draw_type` (ROTATION/AUCTION/RANDOM) | absent | MISSING | **Confirmé par le code lui-même** : commentaire de `declareWinner` (`tontines.service.ts:81`) — « sélection manuelle du gagnant… jamais un algorithme ». Les 3 modes n'existent nulle part, ni en type, ni en UI, ni en service. Cf. D-TON-08 |
| `winning_bid` | `bidAmount` | IMPLEMENTED (représentation) | Toujours `0` en pratique (aucun mode enchère) |
| `status` (PENDING/COMPLETED/CANCELLED) | `'statusCompleted' \| 'statusScheduled'` | CONTRADICTORY | 2 valeurs vs 3 ; pas de `CANCELLED` ; aucune fonction « annuler un tirage » n'existe |
| `created_at`/`updated_at`/`created_by`/`updated_by` | absent | MISSING | |

**Champs réels hors dictionnaire** : `winnerName` (dénormalisé), `contributionPool`,
`amountReceived` (chevauchent conceptuellement `draw_winners`, cf. §10), `phase`
(`DrawPhase`, cycle UI en 7 étapes — configuration/vérification/exécution/résultat/
gagnant/règlement/historique), `settlementStatus`, `settlementDate` (aucun équivalent
dictionnaire).

**Contraintes** :

| Contrainte | État | Observation |
|---|---|---|
| `uq_tontine_draws_uuid` | NOT_ENFORCEABLE_IN_FRONTEND | |
| `uq_tontine_draws_cycle_number` | MISSING | `createDraw` **n'effectue aucune vérification** de doublon de `drawNumber` au sein d'un cycle — à la différence de `createCycle` qui, lui, vérifie l'unicité de `cycleNumber` |
| `draw_number > 0` | MISSING | Non validé en entrée |
| `winning_bid >= 0` | MISSING | Non validé (mais toujours `0` en pratique) |
| `actual_winner_id IS NOT NULL OR status != COMPLETED` | IMPLEMENTED (émergent) | `declareWinner` fixe `winnerMemberId` et `status: 'statusCompleted'` atomiquement dans le même appel, et refuse d'écraser un gagnant déjà désigné (`draw.winnerMemberId` déjà vrai → retourne `undefined`) — l'invariant est respecté par construction du seul chemin de code qui complète un tirage, mais n'est pas une validation explicite indépendante |

## 10. `draw_winners`

**Constat** : **`MODEL_GAP` total** — aucune entité, type ou table distincte n'existe.

Tous les champs attendus (`id`, `uuid`, `draw_id`, `member_id`, `contribution_pool`,
`amount_received`, `bid_amount`, `created_at`) sont **fusionnés directement dans
`CycleDraw`** (§9) : `contributionPool`, `amountReceived`, `bidAmount` et `winnerMemberId`
vivent tous sur le tirage lui-même, pas sur une entité « gagnant » séparée.

Conséquence structurelle : le modèle actuel impose une relation **1 tirage = 1 gagnant au
maximum**, codée en dur (`declareWinner` refuse toute deuxième désignation). Il est
**impossible de représenter plusieurs gagnants pour un même tirage** avec le modèle actuel,
contrairement à ce que suggère l'existence d'une table `draw_winners` séparée dans le
dictionnaire (dont la vocation usuelle est justement de permettre du 1-vers-N).

**Relation `tontine_draw → draw_winner → member`** :

- `tontine_draw → draw_winner` : 🔴 ABSENTE (l'entité intermédiaire n'existe pas)
- `draw_winner → member` : 🔴 ABSENTE (sans objet, l'entité source n'existe pas)
- Relation directe constatée à la place : `CycleDraw.winnerMemberId → CycleMember.id` (pas
  directement `Member.id` — un niveau d'indirection supplémentaire via `CycleMember`, qui
  porte lui-même `memberId → Member.id`)

Cf. D-TON-10.

## 11. Relations

Architecture attendue (dictionnaire) :

```
Tontine
   └── TontineCycle
          ├── CycleMember
          ├── Contribution
          └── Draw
                 └── DrawWinner
```

Architecture réelle constatée :

```
Tontine (tableau top-level, tenant-scopé)
   └── TontineCycle (tableau top-level, tenant-scopé, FK tontineId)
          ├── members: CycleMember[]        (imbriqué, pas top-level)
          ├── contributions: CycleContribution[]  (imbriqué, pas top-level, lecture seule)
          ├── draws: CycleDraw[]            (imbriqué, pas top-level)
          │      └── (pas d'entité DrawWinner — fusionné dans CycleDraw)
          └── activities: CycleActivity[]   (journal, hors dictionnaire)

Contribution (finance/contributions.ts) — modèle SÉPARÉ, référence tontineId+cycleNumber,
  pas directement rattaché à TontineCycle.id — coexiste avec CycleContribution sans être unifié.
```

| Relation | État |
|---|---|
| Tontine → TontineCycle | 🟢 présente (FK réelle, vérifiée en 2 temps par le service) |
| TontineCycle → CycleMember | 🟡 partielle (imbriquée, pas une table indépendante ; pas de FK explicite au sens SQL, structurel uniquement) |
| TontineCycle → Contribution | 🔴 absente au sens du dictionnaire (deux modèles concurrents non reliés, cf. §8) |
| TontineCycle → Draw | 🟡 partielle (même remarque que CycleMember) |
| Draw → DrawWinner | 🔴 absente (§10) |
| CycleMember/CycleDraw → Member | 🟡 partielle (via `memberId`, non validé service-side) |

## 12. Tenant isolation

| Modèle | Isolation | Preuve |
|---|---|---|
| `tontines` | 🟢 VERIFIED | `getTenantScoped` (`listTontines`, `getTontine`), testé (`tontines.service.test.ts:5-10`) |
| `tontine_cycles` | 🟢 VERIFIED | Scoping en 2 temps : la Tontine parente doit d'abord appartenir au tenant avant tout accès au cycle (`listCyclesByTontine:31-36`, commentaire explicite ligne 30) ; `getCycle` tenant-scopé directement ; testé de façon extensive (7 tests DENY/ALLOW dédiés) |
| `cycle_members` | 🟢 VERIFIED | Pas de `tenantId` propre (champ absent, cf. §7), mais isolation **structurelle** : accessible uniquement via un `TontineCycle` déjà tenant-scopé (`addCycleMember` valide le cycle parent avant écriture) ; testé (`DENY: addCycleMember refuse...`) |
| `tontine_contributions` | 🟡 PARTIAL | `CycleContribution` hérite structurellement du cycle parent (même mécanisme que `cycle_members`, non testé isolément) ; `Contribution` (finance) porte son propre `tenantId` mais son service d'accès (`finance.service.ts`) est **hors du périmètre directement inspecté par cet audit** — NOT_VERIFIABLE pour cette moitié |
| `tontine_draws` | 🟢 VERIFIED | Même mécanisme que `cycle_members` ; `createDraw`/`declareWinner` valident le cycle parent tenant-scopé avant écriture ; testé (`DENY: createDraw refuse...`, `DENY: declareWinner refuse...`) |
| `draw_winners` | ⚪ NOT APPLICABLE | Entité inexistante (§10) |

**Note méthodologique** : l'absence d'un champ `tenantId` propre sur `CycleMember`/
`CycleContribution`/`CycleDraw` n'est **pas** une faille d'isolation ici — ces objets ne sont
jamais accessibles autrement que par navigation depuis un `TontineCycle` déjà vérifié
tenant-scopé (pas de route/service qui les expose par identifiant global seul). C'est un
mécanisme différent (imbrication structurelle) de celui utilisé ailleurs dans le projet
(ex. `WorkflowRequest.tenantId` explicite), mais tout aussi vérifiable — confirmé par tests.

## 13. RBAC

Permissions réellement définies dans le catalogue (`src/mocks/rbac.mocks.ts:65-67`) :

```
tontines.read, tontines.create,
cycles.read, cycles.create, cycles.manage,
draws.read, draws.manage
```

Permissions réellement utilisées dans l'UI (`PermissionGate`, `tontines-module.tsx`) :
`tontines.create` (créer une tontine), `cycles.create` (créer un cycle),
`cycles.manage` (transitions de statut de cycle, ajout de membre — **deux fonctionnalités
distinctes gardées par la même permission**), `draws.manage` (créer un tirage **et** déclarer
un gagnant — également deux actions distinctes sous une seule permission).

| Opération dictionnaire | Permission réelle | État |
|---|---|---|
| `tontines` create | `tontines.create` | IMPLEMENTED |
| `tontines` read | `tontines.read` (catalogue) | IMPLEMENTED (pas de `PermissionGate` explicite trouvé sur la lecture — écrans de liste non gardés individuellement, cohérent avec le reste du projet où `.read` gate généralement l'accès à la route elle-même, non vérifié plus avant ici) |
| `tontines` update | absent | MISSING — aucune permission `tontines.update`, et aucune fonction service de mise à jour de Tontine non plus |
| `tontines` delete | absent | MISSING — aucune permission ni fonction service |
| `tontines` approve | absent | MISSING |
| `cycles` create/update/delete/approve | `cycles.create`/`cycles.manage` (fusionne update) | PARTIALLY_IMPLEMENTED — pas de `delete` ni `approve` distincts |
| `cycle_members` create/update/delete | sous `cycles.manage` (pas de permission dédiée) | PARTIALLY_IMPLEMENTED — aucune granularité propre à `cycle_members` |
| `tontine_contributions` create/update/delete | aucune permission dédiée (fonctionnalité elle-même absente, cf. §8) | MISSING |
| `tontine_draws`/`draw_winners` create/update/approve | `draws.manage` (fusionne create + déclaration de gagnant) | PARTIALLY_IMPLEMENTED — pas de `draws.approve` distinct ; aucune permission propre à `draw_winners` (entité inexistante) |

Aucune permission n'a été créée ni modifiée par cet audit — constat uniquement.

## 14. Offline / Sync

Recherche exhaustive de `sync_status`/`syncStatus`/`outbox`/`offline`/`queue`/`retry`/
`idempotency` dans `src/` : **aucune occurrence** de `syncStatus` nulle part dans le projet
(recherche exacte, 0 résultat) ; les correspondances approximatives sur « offline »/
« idempoten » relèvent de contextes sans rapport (commentaires d'idempotence métier dans
d'autres domaines, ex. Fiscal Year).

**Conclusion** : il n'existe **aucune infrastructure générique** de synchronisation/offline
dans `tanzen-frontend`, ni connectée au domaine Tontine ni disponible ailleurs. Ni
`GENERIC INFRASTRUCTURE AVAILABLE + DOMAIN NOT IMPLEMENTED`, ni `IMPLEMENTED` : c'est un
`MISSING` pur, à tous les niveaux (mock, service, type). Le champ `sync_status` du dictionnaire
n'a donc aucune contrepartie, même partielle, dans le code actuel — cf. constats §5, §7, §8, §9.

## 15. Tests

**Fichier** : `src/services/tontines.service.test.ts` (18 tests, 5 describe blocks)

| Catégorie | Couverture réelle |
|---|---|
| Tenant isolation | 🟢 Large — testée pour `listTontines`/`getTontine`, `listCyclesByTontine`/`getCycle`/`listCyclesByMember`, `createCycle`, `addCycleMember`, `createDraw`, `declareWinner` (DENY + ALLOW systématiques) |
| Machine à états (cycle) | 🟢 Large — 4 tests dédiés (`statusOpen→statusSuspended`, `statusSuspended→statusOpen`, `statusClosed` terminal, `statusDraft` ne peut pas sauter à `statusClosed`) |
| Règle métier `declareWinner` | 🟢 Effet de bord `CycleMember.hasWon` testé, idempotence (refus de double désignation) testée |
| RBAC | 🔴 Absente — aucun test ne vérifie les permissions `tontines.*`/`cycles.*`/`draws.*` spécifiquement (contrairement à d'autres domaines du projet, ex. `role.service.test.ts`) |
| UI / intégration | 🔴 Absente — aucun fichier `tontines-module.test.tsx` ou équivalent trouvé |
| `cycle_members` (contraintes d'unicité, statuts) | 🔴 Absente — aucun test ne couvre l'absence de contrôle de doublon signalée en §7 |
| `tontine_contributions` | 🔴 Absente — cohérent avec l'absence de service CREATE |
| `tontine_draws` (unicité `draw_number`) | 🔴 Absente — cohérent avec l'absence de contrôle signalée en §9 |

## 16. Legacy / duplications

- **`Contribution` (finance) vs `CycleContribution` (tontines)** — cf. §8. Duplication déjà
  **partiellement reconnue dans le code lui-même** : le commentaire d'en-tête de
  `finance/contributions.ts` précise explicitement que `Contribution` « remplace les anciens
  `financeContributions` et `Member.contributions` » et se déclare **distinct** de
  `CycleContribution`. C'est donc une duplication **assumée et documentée**, mais qui reste
  une duplication au sens de ce mandat : deux structures différentes représentent la même
  notion métier (« une cotisation versée par un membre pour un cycle de tontine ») sans être
  unifiées ni synchronisées (incohérence référentielle constatée en §8.2).
- **Workflow `WD-002` (« Ouverture de cycle de tontine »)** — existe dans le catalogue des
  workflows génériques (`workflow-definitions.ts`, domaine `tontines`, entité `cycle`, 2
  étapes gardées par `cycles.manage`), et une `WorkflowRequest` de seed le référence
  (`WR-004`, tenant `T-005`). Mais **le vrai code qui ouvre/suspend/clôture un cycle**
  (`tontinesService.updateCycleStatus`, appelé directement depuis `tontines-module.tsx` sans
  jamais importer `workflowService`) **ne crée ni ne consulte aucune `WorkflowRequest`** — les
  transitions de cycle sont directes, sans passer par ce moteur d'approbation. `WD-002` est une
  infrastructure déclarée mais non connectée au comportement réel du domaine. Cf. D-TON-11.
- Aucune autre dénomination concurrente (`TontineGroup`, `SavingsGroup`, `Rotation`,
  `Auction`) n'a été trouvée dans le code — recherche exhaustive, 0 résultat.

## 17. Matrice GO / GAP

| Modèle | Type | Mock | Service | UI | Routes | RBAC | Tenant | Relations | Tests |
|---|---|---|---|---|---|---|---|---|---|
| `tontines` | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL (CRU, pas D) | 🟢 GO | 🟢 GO | 🟡 PARTIAL (C/R seulement) | 🟢 GO | 🟢 GO | 🟢 GO |
| `tontine_cycles` | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL (pas de D, transitions oui) | 🟢 GO | 🟢 GO | 🟡 PARTIAL | 🟢 GO | 🟡 PARTIAL | 🟢 GO |
| `cycle_members` | 🟡 PARTIAL | 🟡 PARTIAL | 🔴 GAP (C seulement, pas U/D, pas de contrôle d'unicité) | 🟡 PARTIAL (lecture + ajout, pas de sortie/suspension) | ⚪ (pas de route dédiée, onglet du cycle) | 🔴 GAP (pas de permission dédiée) | 🟢 GO | 🟡 PARTIAL | 🔴 GAP |
| `tontine_contributions` | 🟣 MODEL GAP (2 modèles non unifiés) | 🟡 PARTIAL | 🔴 GAP (aucun CREATE) | 🔴 GAP (lecture seule) | ⚪ (onglet du cycle) | 🔴 GAP | 🟡 PARTIAL | 🔴 GAP | 🔴 GAP |
| `tontine_draws` | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL (C + déclaration gagnant, pas d'annulation) | 🟢 GO | 🟢 GO | 🟡 PARTIAL | 🟢 GO | 🟡 PARTIAL | 🟡 PARTIAL (pas d'unicité `draw_number`) |
| `draw_winners` | 🟣 MODEL GAP | 🟣 MODEL GAP | 🟣 MODEL GAP | 🟣 MODEL GAP (fusionné dans l'écran Draw) | ⚪ | ⚪ | ⚪ | 🔴 GAP | ⚪ |

## 18. Decisions Required

| ID | Sujet | Pourquoi | Options possibles | Bloquant |
|---|---|---|---|---|
| D-TON-01 | `tontines.status` : 2 valeurs réelles vs 3 attendues (pas de `PAUSED`) | Cardinalité et nommage contradictoires avec le dictionnaire | (a) adopter ACTIVE/PAUSED/CLOSED (migration) ; (b) conserver 2 valeurs, documenter `PAUSED` comme non supporté ; (c) mapper `statusInactive`→`CLOSED` et ajouter `PAUSED` | Non pour l'existant, oui pour toute conformité future au dictionnaire |
| D-TON-02 | `tontine_cycles.status` : dictionnaire non tranché, code a 4 valeurs réelles avec machine à états déjà posée et testée | Le PO doit confirmer si ces 4 valeurs codées deviennent la référence officielle | (a) valider telles quelles (recommandé, déjà fonctionnel) ; (b) redéfinir un autre jeu | Oui pour clore le `MODEL_GAP` du dictionnaire |
| D-TON-03 | `end_date` (`tontine_cycles`) : obligatoire, jamais mise à jour à la clôture, jamais validée `> start_date` | Dictionnaire laisse ouvert le caractère planifié/constaté et l'obligation | (a) confirmer « planifiée, obligatoire » (comportement actuel) + ajouter la validation `> start_date` manquante ; (b) ajouter une date de clôture réelle distincte ; (c) rendre optionnelle | Oui si une distinction planifiée/constatée est un besoin métier |
| D-TON-04 | `cycle_number` : dictionnaire le qualifiait d'« éventuel », le code l'implémente réellement avec unicité | À valider comme faisant officiellement partie du modèle | (a) valider tel quel (recommandé) ; (b) le retirer | Non, mais à trancher formellement |
| D-TON-05 | `cycle_members.status`/`position` : 2 valeurs vs 4 attendues, jamais transitionné après création ; `position` vs `initial_rank` (équivalence non confirmée) | `EXITED`/`SUSPENDED` n'existent nulle part, aucun workflow de sortie | (a) étendre le modèle + construire les services de sortie/suspension manquants ; (b) conserver l'état actuel si non-besoin réel | Oui pour toute fonctionnalité de gestion de sortie de membre |
| D-TON-06 | `cycle_members.member_id` : aucune validation service-side contre les `Member` réels du tenant | Écart entre représentation (type) et validation runtime | (a) ajouter la validation service ; (b) documenter le contrat comme « confiance déléguée à l'UI » | Non pour les mocks actuels, risque d'intégrité si réutilisé tel quel avec un vrai backend |
| D-TON-07 | `tontine_contributions` : deux modèles partiels non unifiés (`CycleContribution` sans `member_id` ; `Contribution` finance avec `member_id` mais référence indirecte), et **aucune opération CREATE** | Plus grand écart fonctionnel du domaine — impossible d'enregistrer une cotisation depuis l'UI Tontines | (a) unifier en un seul modèle `cycle_id`+`member_id` conforme au dictionnaire et construire le service CREATE manquant ; (b) clarifier que `Contribution` (Finance) est la source canonique et faire disparaître `CycleContribution` au profit d'une jointure calculée | **Oui** — gap fonctionnel majeur, pas seulement un écart de type |
| D-TON-08 | `tontine_draws.draw_type` : absent, le code documente une désignation 100% manuelle | Écart total entre dictionnaire et comportement réel documenté dans le code | (a) confirmer que « manuel » est le seul mode voulu et retirer `draw_type` du modèle cible ; (b) implémenter réellement ROTATION/AUCTION/RANDOM | Oui si un mode automatique est un besoin produit |
| D-TON-09 | `tontine_draws` : `scheduled_member_id` absent ; unicité `draw_number` par cycle non appliquée (contrairement à `cycle_number`) | Écart de couverture entre deux contraintes voisines du même domaine | (a) ajouter `scheduled_member_id` + la validation d'unicité manquante ; (b) documenter l'absence comme acceptée | Non aujourd'hui (aucun bug observé en tests), mais latent |
| D-TON-10 | `draw_winners` : table absente comme entité indépendante, tout fusionné dans `tontine_draws` (1 tirage = 1 gagnant maximum, codé en dur) | `MODEL_GAP` le plus net de l'audit — modèle relationnel du dictionnaire non réalisable sans restructuration | (a) extraire un vrai `DrawWinner` distinct de `CycleDraw` (aligné dictionnaire, permettrait plusieurs gagnants) ; (b) documenter formellement que le modèle cible EST « 1 tirage = 1 gagnant fusionné », renoncer à `draw_winners` comme table séparée | Oui pour toute conformité stricte au dictionnaire |
| D-TON-11 | Workflow `WD-002` déclaré mais jamais connecté aux vraies transitions de cycle (`updateCycleStatus` ne passe jamais par `workflowService`) | Contradiction entre infrastructure de workflow déclarée et comportement réel | (a) brancher réellement les transitions de cycle sur ce workflow (pattern déjà utilisé pour la réouverture d'exercice fiscal) ; (b) documenter `WD-002` comme non connecté / réservé ; (c) le retirer s'il n'a pas vocation à être utilisé | Non pour l'existant, mais à trancher avant toute mission touchant la gouvernance des cycles |
| D-TON-12 | `Tontine.type` (`cooperative`/`tontine`/`association`/`mutuelle`) : champ réel et utilisé, absent du dictionnaire fourni | Le dictionnaire est soit incomplet sur ce point, soit ce champ est une extension hors modèle officiel | (a) l'intégrer formellement au modèle `tontines` cible ; (b) le documenter comme extension locale hors dictionnaire | Non |

## 19. Conditions éventuelles d'Implementation GO

Avant toute mission d'implémentation faisant suite à cet audit, les points suivants
devraient être tranchés en priorité (dans cet ordre de blocage décroissant) :

1. **D-TON-07** (`tontine_contributions` — CREATE manquant, modèles dupliqués) : c'est le seul
   écart qui empêche une fonctionnalité métier de base (« enregistrer une cotisation ») d'être
   utilisée aujourd'hui. Bloquant pour toute promesse produit sur ce point.
2. **D-TON-10** (`draw_winners` absent) et **D-TON-08** (`draw_type` absent) : nécessitent une
   décision PO avant toute implémentation, car ils changent la forme même du modèle de
   données (nombre de gagnants possibles, mécanisme de tirage).
3. **D-TON-02**/**D-TON-04** (formaliser les valeurs de `status` et `cycle_number` déjà
   implémentées) : faible risque, essentiellement une validation de l'existant.
4. **D-TON-11** (brancher ou retirer `WD-002`) : à trancher avant toute mission touchant la
   gouvernance des cycles, pour éviter de dupliquer un mécanisme d'approbation en parallèle
   d'un système déjà déclaré mais inerte.
5. Les autres décisions (D-TON-01, 03, 05, 06, 09, 12) sont des ajustements de modèle
   n'empêchant pas un GO partiel sur les fonctionnalités déjà couvertes.

Aucune de ces décisions n'a été prise dans ce document — elles sont toutes remontées telles
quelles pour un futur PO DECISION VALIDATION PACK.

## 20. Conclusion

Le domaine Tontine de `tanzen-frontend` est un module réel, testé et fonctionnel sur son
périmètre effectif (Tontines → Cycles → Membres → Tirages, avec machine à états et isolation
tenant vérifiées), mais ce périmètre ne recouvre le dictionnaire fourni que **partiellement** :

- Aucun des 6 modèles n'atteint `IMPLEMENTED` complet sur l'ensemble de ses champs — tous
  portent des `MISSING` (historisation/traçabilité intégrale : `uuid`, `version`,
  `sync_status`, `created_by`/`updated_by`, `deleted_at`).
- Un `MODEL_GAP` structurel majeur (`draw_winners`, entité totalement absente).
- Un gap fonctionnel bloquant (`tontine_contributions` sans CREATE, modèles dupliqués et
  incohérents entre eux).
- Deux points du dictionnaire explicitement laissés ouverts (`cycle_number`, valeurs de
  `tontine_cycles.status`) sont en réalité **déjà implémentés et testés** dans le code — un
  constat qui inverse la question : il ne s'agit plus de les concevoir, mais de les valider
  formellement.
- Une infrastructure de workflow déclarée (`WD-002`) mais non connectée au comportement réel.

Douze décisions (`D-TON-01` à `D-TON-12`) sont remontées, aucune tranchée. Aucune ligne de
code, de test, de mock ou de configuration n'a été modifiée par cet audit.

---

## Statut final

```
STATUT: AUDIT TERMINÉ — READ-ONLY
Modèles analysés: 6/6

`tontines`: PARTIAL — champs d'historisation/traçabilité absents, status contradictoire (2 vs 3 valeurs)
`tontine_cycles`: PARTIAL — status/cycle_number réels et testés (au-delà du dictionnaire), end_date jamais validée
`cycle_members`: GAP — pas de U/D, aucun contrôle d'unicité, aucune permission dédiée
`tontine_contributions`: MODEL GAP — 2 modèles non unifiés, aucun CREATE nulle part
`tontine_draws`: PARTIAL — draw_type absent (tirage 100% manuel), pas d'unicité draw_number
`draw_winners`: MODEL GAP — entité totalement absente, fusionnée dans tontine_draws

GO: 0 modèle complet
PARTIAL: tontines, tontine_cycles, tontine_draws, cycle_members
MODEL GAP: tontine_contributions, draw_winners
DECISION REQUIRED: 12 (D-TON-01 à D-TON-12)

Tests existants: tenant isolation + machine à états + declareWinner (18 tests) — RBAC et UI non couverts
Tenant isolation: VERIFIED (tontines, cycles, cycle_members, draws) / PARTIAL (contributions, moitié finance non vérifiée) / NOT APPLICABLE (draw_winners)
RBAC: 7 permissions réelles (tontines.read/create, cycles.read/create/manage, draws.read/manage) — aucune permission dédiée à cycle_members/contributions/draw_winners
Offline: ABSENT — aucune infrastructure, générique ou connectée

Code modifié: AUCUN
Rapport créé: docs/P1_TONTINE_FRONTEND_READ_ONLY_AUDIT.md

Backend: NON TOUCHÉ
Commercial: NON TOUCHÉ
Mobile: NON TOUCHÉ

Commit: AUCUN
Push: AUCUN

FIN DU MANDAT.
```
