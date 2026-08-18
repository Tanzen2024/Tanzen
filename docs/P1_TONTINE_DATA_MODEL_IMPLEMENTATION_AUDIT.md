# P1 TONTINE — DATA MODEL & IMPLEMENTATION AUDIT

**Statut : AUDIT READ-ONLY.** Aucun fichier de code, migration, modèle, service, repository, mock, route, écran, test, dictionnaire ou document existant n'a été modifié, créé, renommé, fusionné ou supprimé. Le seul artefact produit par ce mandat est ce fichier.

---

## 1. Conclusion exécutive

Le domaine Tontine possède une **source de données canonique unique, cohérente et déjà verrouillée** (`docs/dictionnaire_donnees.xlsx`, 6 fiches confirmées, extraites intégralement ci-dessous — voir §2) et une **couche de décisions produit** qui en dérive (`docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `docs/PHASE_02_DECISIONS_CANONIQUES.md`). Le modèle fourni par ce mandat est **identique, champ par champ et contrainte par contrainte, à ces deux sources** — aucune contradiction n'a été trouvée entre le modèle du mandat et les sources déjà tranchées du projet.

En revanche, l'**implémentation réelle** (`tanzen-frontend`, Phase 8 — `docs/PHASE_08_TONTINES.md`) diverge fortement de ce modèle canonique sur le plan structurel : elle a été construite comme un mock en mémoire sans backend, avec des cycles imbriquant directement leurs membres/cotisations/tirages en tableaux TypeScript plutôt qu'en tables séparées, sans `uuid`/`version`/`sync_status`/soft-delete/`created_by`/`updated_by` sur aucune entité (convention Web volontaire et documentée, pas un oubli), et avec des énumérations de statut réduites (2 valeurs au lieu de 3-4) sur trois des six entités. Ceci est **connu et déjà partiellement documenté par le projet lui-même** (`PHASE_08_TONTINES.md`, `PHASE_08_DECISIONS_A_VALIDER.md`) — cet audit confirme, précise et complète ce constat plutôt que de le découvrir de zéro, et ajoute plusieurs points non encore consignés (voir §21-23).

**Aucun backend n'existe.** `tanzen-backend` est un répertoire vide (0 fichier, pas un dépôt git). Toute la « persistance » du domaine Tontine est un mock en mémoire dans `tanzen-frontend/src/mocks` + `src/services`.

**`tanzen-mobile` n'implémente aucune des 6 entités**, mais ce n'est pas une lacune : c'est une position de roadmap explicitement documentée (Phase mobile actuelle = Phase 4B « Membres » ; le schéma SQLite Tontine est réservé mais vide, avec un commentaire de code renvoyant explicitement vers `PHASE_02_MODELE_CANONIQUE_FINAL.md` pour quand il sera construit).

**`tanzen-commercial` ne contient aucun code Tontine** — seulement une copie miroir des mêmes documents `docs/` que `tanzen-frontend` (comportement de synchronisation cross-repo déjà connu, non lié à ce mandat). C'est cohérent avec son rôle (Public/Platform/Billing), pas un gap.

---

## 2. Sources analysées

Hiérarchie des sources, de la plus à la moins autoritaire pour le domaine Tontine :

1. **`tanzen-frontend/docs/dictionnaire_donnees.xlsx`** (59 feuilles) — SOURCE DE VÉRITÉ physique. Feuilles `tontines`, `tontine_cycles`, `cycle_members`, `tontine_contributions`, `tontine_draws`, `draw_winners` extraites intégralement via `openpyxl` (méthode déjà documentée dans la mémoire du projet) et comparées champ par champ au modèle du mandat : **identiques**, y compris les deux points explicitement laissés ouverts par le fichier lui-même (`tontine_cycles.status` sans enum, `end_date`/`cycle_number` non tranchés — voir §5).
2. **`docs/PHASE_02_DECISIONS_CANONIQUES.md`** + **`docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`** — couche de décisions produit qui verrouille les statuts et relations, y compris `TontineCycle.status = DRAFT/OPEN/SUSPENDED/CLOSED` (décision PO postérieure à la fiche dictionnaire, qui elle-même refusait de trancher — voir §5, §21).
3. **`docs/PHASE_08_TONTINES.md`** + **`docs/PHASE_08_DECISIONS_A_VALIDER.md`** — rapport d'implémentation réelle Phase 8 et registre de décisions déjà identifiées comme non tranchées (réouverture de cycle clôturé, permission `contributions.create` manquante, calendrier d'échéances, workflow d'adhésion). Ces 4 sujets sont **repris tels quels** ci-dessous (§23), pas redécouverts.
4. **`docs/PHASE_02_TENANT_ISOLATION_SPEC.md`** — architecture cible d'isolation tenant.
5. Code source réel (voir §28 pour la liste complète des fichiers inspectés).
6. `tanzen-commercial/docs/*` — copies identiques des documents 1-4 (vérifié par titres de fichiers identiques), non ré-analysées séparément.
7. `tanzen-mobile/docs/PHASE_4C3_WEB_TO_MOBILE_TRANSFER_AUDIT.md`, `MOBILE_PHASE_*` — ne couvrent pas le domaine Tontine (grep vérifié, aucune occurrence dans le rapport de transfert ; Tontine n'a pas encore été atteint par le roadmap mobile, actuellement à la Phase 4B « Membres »).

Aucune contradiction n'a été trouvée entre le modèle fourni par ce mandat et les sources 1-2 ci-dessus. La seule tension documentaire relevée est interne au projet lui-même (fiche dictionnaire `tontine_cycles` non mise à jour après le verrouillage PO du statut — §21, point 9) et est signalée, pas arbitrée.

---

## 3. État global

| Entité | Dictionnaire | Décision PO | Code Web | Backend | Mobile |
|---|---|---|---|---|---|
| `tontines` | 🟢 Fiche complète | — | 🟡 Partiel, divergent | 🔴 Absent | 🔴 Absent (différé) |
| `tontine_cycles` | 🟢 Fiche complète (2 points ouverts) | 🟢 Statut verrouillé | 🟡 Partiel, structurellement différent | 🔴 Absent | 🔴 Absent (différé) |
| `cycle_members` | 🟢 Fiche complète | — | 🟡 Partiel, imbriqué | 🔴 Absent | 🔴 Absent (différé) |
| `tontine_contributions` | 🟢 Fiche complète | — | 🟠 Doublon non réconcilié | 🔴 Absent | 🔴 Absent (différé) |
| `tontine_draws` | 🟢 Fiche complète | — | 🟡 Partiel, `draw_type` absent | 🔴 Absent | 🔴 Absent (différé) |
| `draw_winners` | 🟢 Fiche complète | — | 🟠 Fusionné dans `tontine_draws` (documenté) | 🔴 Absent | 🔴 Absent (différé) |

---

## 4. tontines

Fiche dictionnaire (`docs/dictionnaire_donnees.xlsx`, feuille `tontines`) vs code réel (`src/mocks/tontines/tontines.ts:1-13`, type `Tontine`).

| Champ attendu | Existe ? | Nom réel | Type réel | Tenant scoped | Statut |
|---|---|---|---|---|---|
| `id` | Oui | `id` | `string` (`TON-001`) | — | 🟠 forme différente (pas de BIGINT auto-incrémenté) |
| `uuid` | Non | — | — | — | 🔴 ABSENT |
| `tenant_id` | Oui | `tenantId` | `string` | Direct, appliqué (`getTenantScoped`, `tontines.service.ts:22`) | 🟢 CONFORME |
| `name` | Oui | `name` | `string` | — | 🟢 CONFORME |
| `description` | Non | — | — | — | 🔴 ABSENT |
| `frequency` | Non | — | — | — | 🔴 ABSENT (aucune notion DAILY/WEEKLY/MONTHLY/CUSTOM dans le code) |
| `default_contribution_amount` | Non | — | — | — | 🔴 ABSENT |
| `is_purchasable` | Non | — | — | — | 🔴 ABSENT (lié à `TontinePosition`, hors périmètre — cf. §26) |
| `status` | Oui | `status` | `'statusActive'\|'statusInactive'` (2 valeurs) | — | 🟣 DIVERGENT — dictionnaire attend `ACTIVE, PAUSED, CLOSED` (3 valeurs) ; `PAUSED` absent du code |
| `sync_status` | Non | — | — | — | 🔴 ABSENT — convention Web volontaire, cf. §13 |
| `version` | Non | — | — | — | 🔴 ABSENT — idem |
| `created_at` | Oui | `createdAt` | `string` (date seule) | — | 🟠 PARTIEL (pas d'heure, pas de `updated_at`) |
| `updated_at` | Non | — | — | — | 🔴 ABSENT |
| `deleted_at` | Non | — | — | — | 🔴 ABSENT — aucun soft delete, aucune fonction `deleteTontine` |
| `created_by` / `updated_by` | Non | — | — | — | 🔴 ABSENT |

**Champs additifs non prévus par le dictionnaire** (preuve : `src/mocks/tontines/tontines.ts:3-13`) : `type` (`'cooperative'\|'tontine'\|'association'\|'mutuelle'` — ressemble fortement à `tenants.organization_type`, déjà signalé comme convergence documentaire en Phase 2 sujet 18f, cf. `PHASE_02_MODELE_CANONIQUE_FINAL.md:127` ; provenance non tranchée pour `Tontine` lui-même — **candidat à correspondance, pas une invention aveugle**) ; `memberCount`, `activeCycles`, `totalContributions` (agrégats dénormalisés pour l'affichage liste, absents de la fiche dictionnaire).

**Contraintes** :
- `UNIQUE(uuid)` — N/A, champ absent.
- `UNIQUE(tenant_id, name)` — 🔴 NON appliquée : `createTontine` (`tontines.service.ts:23-28`) ne vérifie aucun doublon de nom, contrairement à `createCycle` qui vérifie un doublon de `cycleNumber` (voir §5).
- `frequency IN (...)` — N/A, champ absent.
- `default_contribution_amount > 0` — N/A, champ absent.
- `status IN (ACTIVE, PAUSED, CLOSED)` — 🟣 le type TS contraint à 2 valeurs seulement (compile-time, pas de CHECK runtime).
- `sync_status IN (...)` — N/A, champ absent.

---

## 5. tontine_cycles

Fiche dictionnaire (feuille `tontine_cycles`) vs code réel (`src/mocks/tontines/tontine-cycles.ts:52-67`, type `TontineCycle`).

**Point important sourcé par la fiche elle-même (`dictionnaire_donnees.xlsx`, feuille `tontine_cycles`, ligne 59)** : *« Statut de cette fiche : structure validée. Valeurs de l'enum status, obligation de `end_date`, et opportunité d'un champ `cycle_number` restent à valider par le propriétaire fonctionnel — aucune valeur n'a été inventée pour combler ces points. »* Le mandat de cet audit reprend cette même réserve explicitement (§7 du mandat). Ce point a depuis été **partiellement tranché ailleurs** dans le projet (voir ligne `status` ci-dessous) — signalé, pas arbitré par cet audit.

| Champ attendu | Existe ? | Nom réel | Tenant scoped | Statut |
|---|---|---|---|---|
| `id` | Oui | `id` | — | 🟠 forme différente |
| `uuid` | Non | — | — | 🔴 ABSENT |
| `tenant_id` | Oui | `tenantId` | Direct, appliqué en 2 temps (parent `Tontine` validé avant tout accès cycle — commentaire `tontines.service.ts:30`) | 🟢 CONFORME |
| `tontine_id` | Oui | `tontineId` | FK validée à l'écriture (`createCycle`, `tontines.service.ts:43`) | 🟢 CONFORME |
| `start_date` | Oui | `startDate` | — | 🟢 CONFORME |
| `end_date` | Oui | `endDate` | — | 🟠 PARTIEL — toujours renseigné dans le code (jamais `NULL`), alors que le dictionnaire l'autorise `NULL` ; contrainte `end_date > start_date` **non vérifiée** par `createCycle` |
| `status` | Oui | `status` (`statusDraft\|statusOpen\|statusSuspended\|statusClosed`) | — | 🟢 CONFORME **à la couche de décision PO** (`PHASE_02_MODELE_CANONIQUE_FINAL.md:114` : `DRAFT, OPEN, SUSPENDED, CLOSED`, verrouillé par le PO). **Divergence documentaire résiduelle** : la fiche dictionnaire elle-même (source 1, §2) n'a pas été mise à jour pour refléter ce verrouillage et affiche toujours « aucune valeur d'enum documentée » — signalé en §21 point 9, pas un vrai conflit de fond |
| `version` | Non | — | — | 🔴 ABSENT |
| `created_at` / `updated_at` | Non | — | — | 🔴 ABSENT (aucun timestamp au niveau du cycle lui-même ; seule l'activité imbriquée `CycleActivity.date` en tient lieu partiellement) |
| `deleted_at` | Non | — | — | 🔴 ABSENT — aucune fonction de suppression de cycle |
| `created_by` / `updated_by` | Non | — | — | 🔴 ABSENT |

**`cycle_number`** (extra, `cycleNumber: number`, `tontine-cycles.ts:56`) : le point que la fiche dictionnaire laisse explicitement ouvert (« opportunité d'un champ cycle_number... reste à valider ») **a déjà été tranché de facto dans le code**, sans validation métier formelle documentée — `createCycle` (`tontines.service.ts:41-50`) le rend obligatoire et vérifie son unicité par tontine (`duplicate` check ligne 45). C'est cohérent avec `UNIQUE(tenant_id, tontine_id, cycle_number)` implicitement, bien que non formalisé comme contrainte DB. **DECISION REQUIRED** pour ratifier formellement ce choix déjà en production (voir §23).

**Divergence structurelle majeure** (concerne aussi §6-9) : `members`, `contributions`, `draws`, `activities` sont des **tableaux imbriqués directement dans `TontineCycle`** (`tontine-cycles.ts:63-66`), pas des tables séparées interrogeables indépendamment. C'est **documenté et assumé** par le projet lui-même : *« CycleMember/CycleContribution/CycleDraw sont des tableaux imbriqués dans chaque TontineCycle (pas des tables séparées) — leur isolation découle structurellement de la validation du TontineCycle parent »* (`PHASE_08_TONTINES.md:80`). Voir §21 pour la classification de cette divergence (INTENTIONNELLE, pas un bug).

---

## 6. cycle_members

Fiche dictionnaire vs code réel (`CycleMember`, `src/mocks/tontines/tontine-cycles.ts:3-15`, imbriqué dans `TontineCycle.members[]`).

| Champ attendu | Existe ? | Nom réel | Statut |
|---|---|---|---|
| `id` | Oui | `id` | 🟠 forme différente |
| `uuid` | Non | — | 🔴 ABSENT |
| `cycle_id` | Oui | `tontineCycleId` | 🟢 CONFORME (nom différent, sémantique identique) |
| `member_id` | Oui | `memberId` | 🟢 CONFORME — ajouté délibérément comme « référence additive » (commentaire `tontine-cycles.ts:6`) pour croiser un membre avec ses tontines |
| `initial_rank` | Oui | `position` | 🟠 EXISTE SOUS UNE AUTRE FORME — même sémantique (ordre de rotation), nom différent |
| `join_date` | Non | — | 🔴 ABSENT — aucune date d'adhésion au cycle |
| `status` | Oui | `status` (`statusActive\|statusInactive`, 2 valeurs) | 🟣 DIVERGENT — dictionnaire attend `ACTIVE, INACTIVE, EXITED, SUSPENDED` (4 valeurs) ; `EXITED`/`SUSPENDED` absents |
| `sync_status` | Non | — | 🔴 ABSENT |
| `version` | Non | — | 🔴 ABSENT |
| `created_at`/`updated_at`/`deleted_at`/`created_by`/`updated_by` | Non | — | 🔴 ABSENT |

**Champs additifs** : `memberName` (dénormalisation d'affichage), `expectedAmount`/`collectedAmount`/`payoutAmount` (suivi financier — absent de la fiche `cycle_members`, qui est une table de rattachement/rang pure ; ce suivi appartient normalement à `tontine_contributions`/`draw_winners`), `hasWon` (flag booléen dénormalisé, redondant en théorie avec une jointure vers `draw_winners`, mais utilisé directement par le flux de déclaration de gagnant — `tontines.service.ts:96`).

**Contraintes** :
- `UNIQUE(cycle_id, member_id)` — 🔴 NON appliquée dans `addCycleMember` (`tontines.service.ts:63-70`, aucune vérification de doublon).
- `UNIQUE(cycle_id, initial_rank)` — 🔴 NON appliquée (aucune vérification d'unicité de `position`).
- `UNIQUE(cycle_id, member_id, join_date)` — N/A, `join_date` absent.
- `initial_rank > 0` — 🔴 NON validé.

**Comment l'ordre de rotation est-il représenté ?** Par `position: number`, un entier simple sans contrainte d'unicité ni de continuité (`tontine-cycles.ts:9`). **Le membre est-il lié à la tontine ou au cycle ?** Structurellement au cycle (`tontineCycleId`), avec une référence additive au membre global (`memberId`) — pas de lien direct `Tontine → Member` hors cycle. **Historique de participation ?** Aucun — un membre ré-inscrit sur un nouveau cycle obtient un nouvel enregistrement `CycleMember` sans lien explicite vers ses inscriptions précédentes (hormis par `memberId` partagé).

---

## 7. tontine_contributions

C'est l'entité la **plus divergente** de l'audit : **deux représentations distinctes coexistent dans le code, non reliées par FK, et aucune des deux ne correspond au schéma canonique.**

### 7a. `CycleContribution` (imbriquée, `src/mocks/tontines/tontine-cycles.ts:17-24`, `TontineCycle.contributions[]`)

| Champ attendu | Existe ? | Nom réel | Statut |
|---|---|---|---|
| `id` | Oui | `id` | 🟠 forme différente |
| `uuid` | Non | — | 🔴 ABSENT |
| `cycle_id` | Oui | `tontineCycleId` | 🟢 CONFORME (nom différent) |
| `member_id` | **Non** | — | 🔴 ABSENT — seul `memberName` (string) existe ; aucune FK fiable vers `Member.id` |
| `amount` | Oui | `amount` | 🟢 CONFORME |
| `contribution_date` | Oui | `date` | 🟢 CONFORME |
| `status` | Oui | `status` (`statusCompleted\|statusPending`, 2 valeurs) | 🟣 DIVERGENT — dictionnaire attend `PAID, PENDING, FAILED, CANCELLED` (4 valeurs) |
| `payment_method` | Non | — | 🔴 ABSENT |
| `reference` | Non | — | 🔴 ABSENT — aucune clé d'idempotence |
| `sync_status` / `version` / timestamps / `created_by` / `updated_by` | Non | — | 🔴 ABSENT |

**Création BLOQUÉE** : aucune fonction `createContribution`/`addContribution` n'existe dans `tontines.service.ts` — confirmé par lecture intégrale du fichier (99 lignes, aucune méthode d'écriture pour les cotisations). Cause déjà documentée : absence de permission `contributions.create` dans le catalogue RBAC (`src/mocks/rbac.mocks.ts:58`, seule `'contributions.read'` existe) — voir `PHASE_08_DECISIONS_A_VALIDER.md` §2, repris en §23 ci-dessous.

### 7b. `Contribution` (ledger Finance, `src/mocks/finance/contributions.ts:14-23`, tableau `contributions` séparé)

| Champ | Présent | Note |
|---|---|---|
| `id`, `tenantId`, `memberId`, `amount`, `date`, `status` | Oui | `memberId` est ici une vraie FK (contrairement à 7a) |
| `tontineId` + `cycleNumber` | Oui | Relie au cycle par **clé métier** (`tontineId`+`cycleNumber`), **pas** par `cycle_id` FK vers `tontine_cycles.id` |
| `status` | `'completed'\|'pending'` (2 valeurs) | Même divergence 2-vs-4 que 7a |

**Le fichier documente lui-même sa propre duplication** (`src/mocks/finance/contributions.ts:1-11`) : *« Distinct de `CycleContribution`... ce dernier est un enregistrement interne au moteur de cycle de tontine (protégé, non modifié ici), alors que `Contribution` est l'écriture ledger côté Finance, rattachée à un membre réel. »* — c'est une séparation **délibérée et documentée**, mais **jamais réconciliée** : aucun code ne synchronise ou ne fait référence croisée entre `Contribution.id` et `CycleContribution.id`. C'est un **candidat à correspondance non résolu**, à faire arbitrer (voir §23), pas une invitation à fusionner silencieusement.

**Lien avec le Ledger financier (`Transaction`)** : `src/mocks/finance/transactions.ts` définit `Transaction.category: 'contribution' | ...` (ligne 2) mais **aucun champ ne référence `Contribution.id` ni `CycleContribution.id`** — le rattachement se fait uniquement par texte libre dans `description` (ex. `"Contribution cycle 4 - Tontine Horizon"`, `transactions.ts:20`). **Aucune transaction financière n'est créée automatiquement** lors d'un ajout de cotisation (de toute façon bloqué, voir ci-dessus) ni lors d'un tirage. **`contribution = transaction financière ?` → NON, seulement une catégorie de libellé, pas un FK.**

---

## 8. tontine_draws

Fiche dictionnaire vs code réel (`CycleDraw`, `src/mocks/tontines/tontine-cycles.ts:29-43`, imbriqué dans `TontineCycle.draws[]`).

| Champ attendu | Existe ? | Nom réel | Statut |
|---|---|---|---|
| `id` | Oui | `id` | 🟠 forme différente |
| `uuid` | Non | — | 🔴 ABSENT |
| `cycle_id` | Oui | `tontineCycleId` | 🟢 CONFORME |
| `draw_number` | Oui | `drawNumber` | 🟢 CONFORME |
| `draw_date` | Oui | `date` | 🟢 CONFORME |
| `scheduled_member_id` | **Non** | — | 🔴 ABSENT — aucune notion de membre « planifié par rotation » distinct du gagnant réel |
| `actual_winner_id` | Oui | `winnerMemberId` (nullable) | 🟢 CONFORME |
| `draw_type` | **Non** | — | 🔴 ABSENT — le code ne connaît qu'un tirage **manuel** (`declareWinner`, sélection admin) ; `ROTATION/AUCTION/RANDOM` n'existent nulle part dans le code. `PHASE_08_DECISIONS_A_VALIDER.md` confirme explicitement : *« TontineBid/tirage par enchère — capacité de schéma dormante, aucun UC ne l'exerce »* et *« le tirage est manuel »* |
| `winning_bid` | Oui | `bidAmount` | 🟠 PARTIELLEMENT CONFORME — champ présent mais **toujours `0`** dans toutes les données de seed et jamais alimenté par `declareWinner` (`WinnerInput` n'a pas de champ bid, `tontines.service.ts:10`) — champ mort/vestigial |
| `status` | Oui | `status` (`statusCompleted\|statusScheduled`, 2 valeurs) | 🟣 DIVERGENT — dictionnaire attend `PENDING, COMPLETED, CANCELLED` (3 valeurs) ; pas de `CANCELLED`, pas de fonction d'annulation de tirage |
| `created_at`/`updated_at`/`created_by`/`updated_by` | Non | — | 🔴 ABSENT |

**Champs additifs** : `contributionPool`, `amountReceived` (logiquement plus proches de `draw_winners` que de `tontine_draws` — voir §9), `phase` (`DrawPhase`, machine à états UI riche à 7 valeurs, sans équivalent dans le dictionnaire), `settlementStatus`/`settlementDate` (couche de règlement UI, également sans équivalent dictionnaire).

**Contrainte `actual_winner_id IS NOT NULL OR status != 'COMPLETED'`** : 🟢 **respectée par construction** — `declareWinner` (`tontines.service.ts:82-98`) ne fait passer `draw.status` à `'statusCompleted'` que dans le même bloc où `winnerMemberId` est renseigné ; aucun autre chemin ne modifie `status`. C'est une règle métier honorée sans CHECK formel.

**Contrainte `UNIQUE(cycle_id, draw_number)`** : 🔴 NON appliquée — `createDraw` (`tontines.service.ts:72-79`) n'effectue aucune vérification de doublon de `drawNumber`, contrairement à `createCycle` qui le fait pour `cycleNumber`.

**Existe-t-il déjà une logique de tirage sous une autre forme ?** Non — avant Phase 8, `TontinesService` n'avait aucune fonction de tirage (gap déjà signalé, `PHASE_08_TONTINES.md:38`) ; la fonctionnalité a été construite à cette phase, strictement manuelle.

---

## 9. draw_winners

**ABSENTE comme entité séparée — fusionnée délibérément dans `CycleDraw`.** Aucun type TS `Winner`/`DrawWinner`, aucun tableau, aucune table. C'est **explicitement documenté et assumé** : *« pas de classe TS séparée créée — le modèle existant fusionne déjà Winner dans CycleDraw, cohérent avec la consigne de ne pas créer de classe pour reproduire visuellement un diagramme »* (`PHASE_08_TONTINES.md:39`).

| Champ attendu | Équivalent dans `CycleDraw` | Statut |
|---|---|---|
| `id` | — | 🔴 ABSENT (pas d'identifiant propre) |
| `uuid` | — | 🔴 ABSENT |
| `draw_id` | Implicite (1:1, les champs vivent sur le tirage lui-même) | 🟠 EXISTE SOUS UNE AUTRE FORME |
| `member_id` | `winnerMemberId` | 🟢 CONFORME (porté par le tirage) |
| `contribution_pool` | `contributionPool` | 🟢 CONFORME (porté par le tirage) |
| `amount_received` | `amountReceived` | 🟢 CONFORME (porté par le tirage) |
| `bid_amount` | `bidAmount` | 🟠 présent mais mort (voir §8) |
| `created_at` | `settlementDate` | 🟠 sémantique proche (date de règlement) mais pas identique (date de création) |

**Contrainte `UNIQUE(draw_id)` (un seul gagnant par tirage)** : 🟢 **satisfaite par construction structurelle** — puisque le gagnant est un champ du tirage lui-même, il ne peut structurellement pas y en avoir deux. `declareWinner` refuse en plus explicitement un second appel sur un tirage déjà gagné (`if (!draw || !member || draw.winnerMemberId) return undefined;`, `tontines.service.ts:88`) — testé (`tontines.service.test.ts:92-95`).

**Relation `draw_winners.member_id → members.id`** : respectée fonctionnellement — `declareWinner` valide que `winnerMemberId` correspond à un `CycleMember` réel du même cycle (`tontines.service.ts:87`) avant d'accepter la déclaration.

---

## 10. Relations

| Relation | Existe ? | FK réelle ? | Relation applicative ? | Tenant isolation | Cascade | Soft delete | Risque |
|---|---|---|---|---|---|---|---|
| `tenants → tontines` | Oui | `tenantId` direct | Oui (`getTenantScoped`) | 🟢 | N/A (pas de suppression) | 🔴 aucune | Faible |
| `tontines → tontine_cycles` | Oui | `tontineId` | Oui, validée à l'écriture (`createCycle`) | 🟢 (2 temps) | N/A | 🔴 aucune | Faible |
| `tontine_cycles → cycle_members` | Oui (imbriqué) | Structurel (tableau) | Oui | 🟢 (héritée du parent) | N/A (même objet) | 🔴 aucune | Faible — structure imbriquée empêche l'orphelinage |
| `cycle_members → members` | Oui | `memberId` | Additive, non stricte (commentaire `tontine-cycles.ts:6` : « n'affecte pas la relation protégée ») | 🟢 (via cycle) | N/A | 🔴 aucune | Faible |
| `tontine_cycles → tontine_contributions` | Oui, **mais dupliqué** (voir §7) | Structurel pour `CycleContribution` ; clé métier (`tontineId`+`cycleNumber`) pour `Contribution` | Partielle | 🟢 pour `CycleContribution` / 🟢 direct pour `Contribution` | N/A | 🔴 aucune | **Moyen** — deux vérités non réconciliées |
| `tontine_contributions → members` | 🔴 absente pour `CycleContribution` (memberName seul) / 🟢 présente pour `Contribution` (`memberId`) | Incohérent selon la représentation | — | — | — | **Moyen** |
| `tontine_cycles → tontine_draws` | Oui (imbriqué) | Structurel | Oui | 🟢 (héritée) | N/A | 🔴 aucune | Faible |
| `tontine_draws → draw_winners` | Oui, fusionné (§9) | Structurel (1:1 par construction) | Oui | 🟢 | N/A | 🔴 aucune | Faible |
| `draw_winners → members` | Oui | `winnerMemberId`, validé à la déclaration | Oui | 🟢 | N/A | 🔴 aucune | Faible |

---

## 11. Tenant isolation

- `tontines.tenant_id` : 🟢 direct, appliqué (`tontines.service.ts:22`, testé `tontines.service.test.ts:5-10`).
- `tontine_cycles.tenant_id` : 🟢 direct, appliqué en **deux temps explicites** — le parent `Tontine` doit d'abord appartenir au tenant courant avant tout accès aux cycles (commentaire `tontines.service.ts:30`, testé `tontines.service.test.ts:14-22`).
- `cycle_members`/`contributions`/`draws → cycle → tenant` : 🟢 isolation **structurelle** (tableaux imbriqués dans un `TontineCycle` déjà validé), pas de colonne `tenant_id` propre — cohérent avec l'architecture cible documentée (`PHASE_02_MODELE_CANONIQUE_FINAL.md:157` note d'ailleurs que `tontine_draws`/`draw_winners` n'ont pas de `tenant_id` direct dans le dictionnaire non plus, la portée passant par `cycle_id`).
- **Redondance `tenant_id` direct vs dérivé** : aucune — le code n'a pas de `tenant_id` direct sur les entités imbriquées, donc pas de redondance à signaler (à l'inverse, la fiche dictionnaire, elle, ne précise pas explicitement si `cycle_members`/`tontine_contributions`/`tontine_draws` portent un `tenant_id` propre ou dérivent de `cycle_id` — non vérifiable sans une lecture du schéma physique final, hors périmètre de cet audit qui porte sur le code).
- **Tests directs vérifiés** (`PHASE_08_TONTINES.md:82-85`) : navigation cross-tenant sur un cycle d'un autre tenant → 404 confirmé par capture d'écran ; cycle de vie complet exercé en environnement réel.
- **Réserve déjà documentée** (`PHASE_02_MODELE_CANONIQUE_FINAL.md:151`) : `TenantContext`/`tenantStore` n'est **pas câblé** en amont (`useTenantStore.setTenant` jamais appelé) — l'isolation testée ci-dessus fonctionne au niveau du service (paramètre `tenantId` explicite), mais son alimentation réelle depuis l'authentification reste un gap **transverse à tout le projet**, pas spécifique à Tontine.

---

## 12. Identifiants / UUID / version

**Aucune entité Tontine (ni aucune autre entité Web du projet) ne porte `uuid`, `version`, ou de verrouillage optimiste.** Ce n'est pas une omission locale : c'est une **convention project-wide explicitement documentée** — `src/mocks/organization/governance.ts:26-27` : *« uuid/sync_status/version/timestamps restent volontairement exclus (aucun besoin Web démontré) »*. Vérifié par grep sur l'ensemble de `src/mocks` : ces champs n'apparaissent que dans des commentaires expliquant leur exclusion, jamais dans un type TS réel. **À documenter et respecter tel quel** — ne pas proposer d'ajouter `uuid`/`version` au frontend Web sans qu'un besoin réel (edition concurrente, sync offline) ne l'exige.

Les identifiants réels sont des chaînes lisibles générées côté mock (`TON-00X`, `CYC-00X`, `CM-<timestamp>`, `CD-<timestamp>`, `CA-<timestamp>`) — cohérent avec le reste du projet, pas une divergence Tontine-spécifique.

---

## 13. Offline / Outbox / Sync

**Aucune infrastructure offline/outbox/sync n'existe dans `tanzen-frontend`**, ni pour Tontine ni pour aucun autre domaine (grep confirmé sur `src/`, zéro occurrence réelle de `outbox`/`idempoten*`/`sync_status` en dehors de commentaires expliquant leur absence volontaire). `tanzen-mobile` réserve la place (`src/database/schema/index.ts:1-10`, commentaire listant `local_tontines`/`local_cycles` parmi les tables futures) mais n'a encore créé **aucune table métier**, uniquement `schema_metadata` (`src/database/migrations/001_initial.ts:13-26`) — décision de phasage documentée (« mandat §14 : NE PAS encore créer toutes les tables métier »).

| Entité | Offline compatible (code actuel) | Outbox | Idempotence | Sync status | Clé d'idempotence |
|---|---|---|---|---|---|
| Les 6 entités Tontine | 🔴 Non (Web n'a pas de mode offline) | 🔴 Non | 🔴 Non | 🔴 Non | 🔴 Aucune (`reference` de `tontine_contributions` absent du code, voir §7) |

**DECISION REQUIRED** (déjà implicite dans le roadmap mobile, pas nouvelle) : la stratégie offline/sync/idempotence pour ces 6 entités reste entièrement à construire côté mobile, à partir du modèle canonique verrouillé — aucune stratégie n'existe aujourd'hui à adapter ou préserver.

---

## 14. Finance / Ledger

TANZEN possède une architecture financière réelle (`Account`, `Transaction` — `src/mocks/finance/accounts.ts`, `transactions.ts`), mais **le domaine Tontine n'y est pas relié par FK** :

- **`contribution = transaction financière ?`** → Non. Trois représentations parallèles coexistent (`CycleContribution` imbriquée, `Contribution` ledger Finance, `Transaction.category='contribution'`), reliées uniquement par correspondance de valeurs (nom, montant, texte libre), jamais par identifiant. Voir §7 pour le détail.
- **`draw payout = transaction financière ?`** → Non. `declareWinner` (`tontines.service.ts:82-98`) ne modifie que `CycleDraw`/`CycleMember` en mémoire ; aucun `Account.balance` n'est débité/crédité, aucune ligne `Transaction` n'est créée.
- **`bid = transaction ?`** → N/A, `bidAmount` toujours `0` (voir §8), aucune enchère réelle n'est jamais exercée.
- **`contribution_pool = calcul ?`** → Oui, mais **saisi manuellement** à la création du tirage (`createDraw`, paramètre `contributionPool` fourni par l'appelant), pas recalculé automatiquement à partir des cotisations réelles du cycle.
- **`amount_received = transaction ?`** → Non, simple champ numérique saisi lors de la déclaration du gagnant (`WinnerInput.amountReceived`), sans écriture comptable associée.
- **`settlement = transaction ?`** → Non. `settlementStatus`/`settlementDate` (champs additifs, §8) basculent automatiquement à `'settlementCompleted'`/date du jour dans le même appel que `declareWinner` — un « règlement » purement cosmétique, sans mouvement de compte réel.

**Aucune double logique financière concurrente n'a été créée par cet audit** — le constat est que la logique Tontine et la logique Finance existent déjà toutes deux, mais **non connectées**, ce qui est un fait à arbitrer (voir §23), pas un problème à corriger ici.

---

## 15. RBAC

Catalogue réel (`src/mocks/rbac.mocks.ts:58-67`) :

```
'contributions.read',
'tontines.read', 'tontines.create',
'cycles.read', 'cycles.create', 'cycles.manage',
'draws.read', 'draws.manage',
```

| Permission attendue | Existe ? | Utilisée ? |
|---|---|---|
| `tontines.read`/`create` | 🟢 | Oui — `PermissionRoute permission="tontines.read"` (`app-router.tsx:59`) |
| `cycles.read`/`create`/`manage` | 🟢 | Oui — `cycles.manage` protège les transitions de statut et l'inscription de membre (`PHASE_08_TONTINES.md:76`) |
| `draws.read`/`manage` | 🟢 | Oui — `draws.manage` protège planification de tirage et déclaration de gagnant |
| `contributions.create` | 🔴 **ABSENTE** | Cause du blocage de création de cotisation (§7). Même cause racine que le gap `transactions.create` de la Phase 7 (`PHASE_08_DECISIONS_A_VALIDER.md` §2) |
| Permission dédiée `winners.*`/`draw_winners.*` | 🔴 Absente | Non nécessaire en l'état — `Winner` n'étant pas une entité séparée dans le code (§9), la déclaration réutilise `draws.manage`, choix cohérent |

Aucune permission n'a été inventée pour produire ce constat. Le catalogue complet du projet (`tenants.*`, `members.*`, `governance.*`, etc.) a été lu en intégralité pour confirmer l'absence de toute permission `contributions.create`/`tontineContributions.*` ailleurs dans le fichier.

---

## 16. UI Web

Toutes les routes ci-dessous sont réellement enregistrées et gardées par permission (`src/features/tontines/tontines-module.tsx:282-291`, `src/routes/app-router.tsx:59`, `src/config/navigation.ts:72`) :

| Route | Écran | Protection |
|---|---|---|
| `/tontines` | `TontinesList` | `tontines.read` |
| `/tontines/create` | `TontineCreate` | idem (mutation interne exige `tontines.create` côté UI) |
| `/tontines/:tontineId` | `TontineDetail` | idem |
| `/tontines/:tontineId/cycles` | `CycleList` | idem |
| `/tontines/:tontineId/cycles/create` | `CycleCreate` | `cycles.create` |
| `/tontines/:tontineId/cycles/:cycleId` | `CycleDetail` | `cycles.manage` pour les actions de transition/inscription |
| `/tontines/:tontineId/cycles/:cycleId/draws` | `DrawsHub` | `draws.read` |
| `/tontines/:tontineId/cycles/:cycleId/draws/create` | `DrawCreate` | `draws.manage` |
| `/tontines/:tontineId/cycles/:cycleId/draws/:drawId` | `DrawDetail` | idem |
| `/tontines/:tontineId/cycles/:cycleId/draws/:drawId/winner` | `WinnerDetail` | idem |

Onglet Contributions de la fiche Membre (`ContributionsTab`, `organization-module.tsx:183-201`) : lecture seule, consomme `queryKeys.tontines.cyclesByMember` — confirmé cohérent avec le blocage RBAC (§7, §15).

---

## 17. Mobile

**Aucune des 6 entités n'est implémentée dans `tanzen-mobile`.** Ce n'est pas un gap à combler par cet audit : c'est une **position de roadmap explicite et documentée** :
- `src/database/schema/index.ts:1-11` : fichier vide par construction, commentaire renvoyant vers `PHASE_02_MODELE_CANONIQUE_FINAL.md` (tanzen-frontend/docs) pour la Phase 2+.
- `src/database/migrations/001_initial.ts:1-26` : seule table créée = `schema_metadata` (technique). Aucune table métier.
- Roadmap mobile actuel confirmé par les fichiers `docs/MOBILE_PHASE_*` présents : Phase 1 (Bootstrap), Phase 2 (Auth/Tenant/RBAC), Phase 3 (Offline/Sync — infrastructure générique), Phase 4A (Organisation), Phase 4B (Membres, phase la plus avancée à ce jour). Tontine n'apparaît dans aucun rapport de phase mobile.
- `docs/PHASE_4C3_WEB_TO_MOBILE_TRANSFER_AUDIT.md` (mobile) : grep vérifié, **aucune occurrence de « tontine »** — ce document couvre un autre domaine déjà transféré, pas Tontine.
- `src/permissions/` (mobile) : grep vérifié, aucune permission liée à tontine/cycle/contribution/draw n'existe encore côté mobile.

**Aucun code, migration, écran ou test mobile n'a été touché par cet audit.**

---

## 18. Backend

**`tanzen-backend` (`c:\xampp\htdocs\tanzen\tanzen-backend`) est un répertoire vide** : `ls -la` confirme uniquement `.`/`..`, 0 fichier. Ce n'est pas un dépôt git (`git status` → `fatal: not a git repository`). **Aucun backend n'existe sous quelque forme que ce soit** pour ce projet — ni migrations, ni entités, ni contrôleurs, ni API réelle. Toute la « persistance » observée dans cet audit est un mock en mémoire dans `tanzen-frontend/src/mocks` (`mockRequest`, `src/services/api-client.ts` — fonction utilitaire simulant une latence réseau sur des tableaux JS).

**CRUD complet ?** Sans objet — aucun backend à évaluer.

---

## 19. Tests

`src/services/tontines.service.test.ts` (95 lignes) — **15 tests**, tous en lecture directe intégrale :

| Bloc | Nb tests | Couverture |
|---|---|---|
| Tenant isolation `Tontines` | 1 | `listTontines`/`getTontine` scopés tenant |
| Tenant isolation `Cycles` (scoping en 2 temps) | 8 | DENY/ALLOW sur `listCyclesByTontine`, `getCycle`, `listCyclesByMember`, `createCycle`, `addCycleMember`, `createDraw`, `declareWinner` — toutes refusent l'écriture/lecture cross-tenant |
| Transitions de statut de cycle (régression Phase 8) | 4 | `OPEN→SUSPENDED` (ALLOW), `SUSPENDED→OPEN` (ALLOW), `CLOSED→OPEN` (DENY, terminal), `DRAFT→CLOSED` direct (DENY) |
| Effet de bord `declareWinner` | 2 | `CycleMember.hasWon` mis à jour ; refus d'un second gagnant sur un tirage déjà résolu |

**Ce qui n'est PAS testé** (constat, pas une critique) : création de cotisation (fonctionnalité bloquée, §7), unicité de `position`/`draw_number`/`cycle_number` au niveau service (le check `cycle_number` existe dans le code mais n'a pas de test dédié), offline/idempotence (fonctionnalité inexistante, §13), validation `end_date > start_date` (non implémentée, donc non testable), RBAC lui-même (les tests portent sur l'isolation tenant du service, pas sur les gardes `PermissionGate` côté UI).

Aucun test n'a été écrit ou modifié par cet audit.

---

## 20. Existant à préserver

Les éléments suivants sont **fonctionnels, testés, et ne doivent pas être remplacés sans décision explicite** :

- **`src/services/tontines.service.ts`** — `createTontine`, `createCycle`, `addCycleMember`, `createDraw`, `declareWinner`, garde de transition `VALID_CYCLE_TRANSITIONS`, isolation tenant en 2 temps via `getTenantScoped`.
- **`src/mocks/tontines/tontines.ts`, `tontine-cycles.ts`** — types et données de seed, source de vérité de l'UI actuelle.
- **`src/features/tontines/tontines-module.tsx`** — 10 écrans/routes fonctionnels, câblés au RBAC.
- **`src/services/tontines.service.test.ts`** — 15 tests de régression/isolation passants.
- **RBAC `tontines.*`/`cycles.*`/`draws.*`** (`src/mocks/rbac.mocks.ts:65-67`) — réellement appliqué via `PermissionGate`/`PermissionRoute`.
- **`src/mocks/finance/contributions.ts`** — entité `Contribution` séparément consommée par le domaine Finance ET par `ContributionsTab` de la fiche Membre ; ne pas fusionner avec `CycleContribution` sans vérifier ces deux consommateurs.
- **`docs/dictionnaire_donnees.xlsx`** (6 fiches Tontine) — déjà auto-corrigé une fois (fiche `tontine_cycles`, cf. mémoire projet), structure fiable.
- **`docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`** — couche de décision PO faisant autorité sur les énumérations/relations verrouillées.
- **`docs/PHASE_08_TONTINES.md` / `PHASE_08_DECISIONS_A_VALIDER.md`** — registre déjà existant des 4 décisions non tranchées ; à lire avant toute nouvelle mission sur ce domaine pour ne pas les redécouvrir.

---

## 21. Divergences du modèle

| # | Modèle fourni | Implémentation actuelle | Impact | Classification |
|---|---|---|---|---|
| 1 | `cycle_members`/`tontine_contributions`/`tontine_draws` = tables séparées | Tableaux imbriqués dans `TontineCycle` | Structurel, empêche une requête indépendante de ces entités | **INTENTIONNELLE** (documentée, `PHASE_08_TONTINES.md:80`) — SIMPLIFIÉE pour un contexte mock/sans backend |
| 2 | `Tontine.status` 3 valeurs | 2 valeurs (`PAUSED` absent) | Fonctionnel mais incomplet | SIMPLIFIÉE, migration non exécutée |
| 3 | `CycleMember.status` 4 valeurs | 2 valeurs (`EXITED`/`SUSPENDED` absents) | Idem | SIMPLIFIÉE |
| 4 | `TontineDraw.status` 3 valeurs | 2 valeurs (`CANCELLED` absent) | Aucune fonction d'annulation de tirage | SIMPLIFIÉE |
| 5 | `uuid`/`version`/`sync_status`/soft-delete/`created_by`/`updated_by` sur les 6 entités | Absents partout | Aucun sur le Web | **INTENTIONNELLE, project-wide** (`governance.ts:26-27`), PAS spécifique à Tontine |
| 6 | `tontine_contributions` = 1 entité | 2 entités non reliées (`CycleContribution` + `Contribution`) | Risque d'incohérence de faits métier | NON DOCUMENTÉE COMME RÉSOLUE — **À ARBITRER** |
| 7 | `TontineDraw.draw_type` (ROTATION/AUCTION/RANDOM) | Absent, tirage 100% manuel | Deux des trois modes canoniques non implémentables en l'état | SIMPLIFIÉE, choix sourcé (« le tirage est manuel ») mais fige le modèle |
| 8 | `draw_winners` = table séparée | Fusionnée dans `tontine_draws` | Aucun impact fonctionnel observé (contrainte `UNIQUE(draw_id)` satisfaite par construction) | **INTENTIONNELLE**, documentée |
| 9 | `tontine_cycles.status` : « aucune valeur d'enum documentée » (fiche dictionnaire) | Verrouillé ailleurs (`DRAFT/OPEN/SUSPENDED/CLOSED`, PO + code, cohérents entre eux) | Aucun — la fiche source n'est simplement pas à jour | Divergence **documentaire uniquement**, LEGACY (fiche non rafraîchie après décision) |
| 10 | `cycle_number` : « opportunité... à valider » (fiche dictionnaire) | Déjà implémenté et rendu obligatoire/unique dans le code | Le code a devancé une décision produit formelle | **À ARBITRER** (ratification a posteriori) |
| 11 | Aucun champ `Tontine.type` dans le dictionnaire | `type: 'cooperative'\|'tontine'\|'association'\|'mutuelle'` présent | Ressemble à `tenants.organization_type` (Phase 2 sujet 18f) | NON DOCUMENTÉE — **À ARBITRER** |

Aucune de ces divergences n'est automatiquement un bug — classées comme demandé, pas résolues.

---

## 22. Model gaps

**🔴 BLOQUANT**
- Permission `contributions.create` absente du catalogue RBAC → création de cotisation impossible (§7, §15).
- `CycleContribution` n'a pas de `member_id` FK fiable (seulement `memberName` string) → jointure fiable vers `Member` impossible pour cette représentation.

**🟠 IMPORTANT**
- Aucune contrainte d'unicité appliquée au niveau service pour : `(tenant_id, name)` sur `tontines`, `(cycle_id, member_id)`/`(cycle_id, initial_rank)` sur `cycle_members`, `(cycle_id, draw_number)` sur `tontine_draws` — seule `(tontine_id, cycle_number)` est vérifiée.
- `draw_type` et `scheduled_member_id` totalement absents — deux des trois modes de tirage canoniques (`AUCTION`, `RANDOM`) sont irréalisables sans ajout de champ.
- Aucun lien FK entre le domaine Tontine et le Ledger Finance (`Transaction`/`Account`) — tout rattachement est cosmétique (§14).

**🟡 À ARBITRER**
- Réouverture d'un cycle `CLOSED` (déjà loggé, `PHASE_08_DECISIONS_A_VALIDER.md` §1).
- Workflow demande/validation d'adhésion à un cycle (déjà loggé, §4 du même document).
- Calendrier des échéances internes au cycle (déjà loggé, §3 du même document).
- Réconciliation `Contribution` (Finance) ↔ `CycleContribution` (Tontine) — nouveau, cette audit.
- Ratification formelle de `cycle_number` — nouveau.
- Provenance de `Tontine.type` — nouveau.

**🟢 NON BLOQUANT**
- Absence de `uuid`/`version`/`sync_status`/soft-delete (convention Web assumée).
- Absence totale côté Mobile (position de roadmap assumée).

---

## 23. Décisions requises

**Déjà loggées par le projet (`PHASE_08_DECISIONS_A_VALIDER.md`), reprises sans modification :**
1. Un cycle `CLOSED` doit-il pouvoir être rouvert, et sous quelles conditions ?
2. Quelle permission RBAC ajouter pour la création de cotisation (`contributions.create` ou équivalent), en cohérence avec le gap analogue déjà identifié pour les Transactions (Phase 7) ?
3. Une entité calendrier des échéances internes au cycle est-elle nécessaire ?
4. Le parcours membre-initié (`UCX1-10`) et l'inscription administrative directe (`UCX2-03`) forment-ils une séquence demande→validation, ou deux chemins indépendants ?

**Nouvelles, identifiées par cet audit :**
5. `Contribution` (ledger Finance) et `CycleContribution` (moteur Tontine) doivent-elles être réconciliées (FK croisée, fusion, ou rester deux vérités volontairement séparées avec une règle de cohérence explicite) ?
6. `cycle_number` (déjà implémenté et rendu obligatoire/unique dans le code) doit-il être ratifié formellement comme faisant partie du schéma `tontine_cycles`, comblant le point que la fiche dictionnaire laisse ouvert ?
7. Le tirage `draw_type` doit-il rester figé sur « manuel uniquement » comme décision produit définitive, ou les modes `AUCTION`/`RANDOM` (déjà prévus par le dictionnaire et par un champ `bidAmount` dormant dans le code) doivent-ils être construits ?
8. Quelle est la provenance légitime du champ `Tontine.type` (`cooperative/tontine/association/mutuelle`) — doublon voulu de `tenants.organization_type`, ou attribut réellement propre à `Tontine` non documenté dans le dictionnaire ?

---

## 24. Web → Mobile readiness

| Entité | Web | Backend | Mobile | Modèle stable | Offline | Mobile readiness |
|---|---|---|---|---|---|---|
| `tontines` | 🟡 | 🔴 | 🔴 | 🟢 (verrouillé) | 🔴 | 🟡 READY WITH ADAPTATION |
| `tontine_cycles` | 🟡 | 🔴 | 🔴 | 🟢 (verrouillé, y compris statut) | 🔴 | 🟡 READY WITH ADAPTATION |
| `cycle_members` | 🟡 | 🔴 | 🔴 | 🟢 | 🔴 | 🟡 READY WITH ADAPTATION |
| `tontine_contributions` | 🟠 (doublon non réconcilié) | 🔴 | 🔴 | 🟢 (schéma verrouillé, mais 2 implémentations Web concurrentes) | 🔴 | 🔴 BLOCKED tant que #5 (§23) n'est pas arbitré |
| `tontine_draws` | 🟡 | 🔴 | 🔴 | 🟢 (schéma verrouillé) mais `draw_type` non exercé | 🔴 | 🟡 READY WITH ADAPTATION |
| `draw_winners` | 🟠 (fusionné) | 🔴 | 🔴 | 🟢 | 🔴 | 🟡 READY WITH ADAPTATION |

**Lecture importante** : le modèle canonique verrouillé (dictionnaire + `PHASE_02_MODELE_CANONIQUE_FINAL.md`) est **stable et prêt** à servir de cible pour le backend et le mobile — c'est d'ailleurs déjà la position documentée du roadmap mobile lui-même (§17). Le frontend Web actuel, lui, **ne doit pas être copié tel quel** vers le mobile : sa structure imbriquée et ses énumérations réduites sont des simplifications propres à un contexte mock-sans-backend, pas le modèle cible. **Aucun portage mobile n'a été effectué par cet audit** — diagnostic uniquement.

---

## 25. Matrice finale

| Entité | Modèle | Implémentation | Divergence | Tests | Tenant | Offline | Verdict |
|---|---|---|---|---|---|---|---|
| `tontines` | Verrouillé | Fonctionnelle, mock | Enum 2/3, champs manquants | 🟢 (isolation) | 🟢 | 🔴 | 🟡 PARTIAL |
| `tontine_cycles` | Verrouillé | Fonctionnelle, mock | Structurelle (imbriqué) | 🟢 | 🟢 | 🔴 | 🟡 PARTIAL |
| `cycle_members` | Verrouillé | Fonctionnelle, imbriquée | Enum 2/4, pas d'unicité | 🟢 (indirect) | 🟢 (héritée) | 🔴 | 🟡 PARTIAL |
| `tontine_contributions` | Verrouillé | Doublon non réconcilié, création bloquée | Structurelle + doublon | 🔴 (aucun test, feature bloquée) | 🟢/🟢 (selon représentation) | 🔴 | 🟣 DECISION REQUIRED |
| `tontine_draws` | Verrouillé | Fonctionnelle, manuel seulement | `draw_type` absent, enum 2/3 | 🟢 | 🟢 (héritée) | 🔴 | 🟡 PARTIAL |
| `draw_winners` | Verrouillé | Fusionnée dans `tontine_draws` | Structurelle (fusion documentée) | 🟢 (indirect) | 🟢 (héritée) | 🔴 | 🟠 EXISTING DIFFERENT MODEL |

---

## 26. Verdict global

### TONTINE CORE
🟡 **PARTIAL** — modèle canonique solide et déjà verrouillé ; implémentation fonctionnelle et testée pour la création/l'inscription/le tirage/la déclaration de gagnant, mais structurellement divergente (imbrication vs tables séparées), avec un domaine complet bloqué (cotisations) et un doublon non réconcilié (Finance vs Tontine).

### WEB
🟡 **PARTIAL** — 10 écrans fonctionnels, isolation tenant testée (15 tests), RBAC appliqué, mais un gap RBAC bloquant et plusieurs énumérations incomplètes.

### BACKEND
🔴 **NOT READY** — `tanzen-backend` est un répertoire vide, aucun code n'existe.

### MOBILE
🔴 **NOT READY** (par construction, roadmap assumé — Tontine n'a pas encore été atteint, Phase actuelle = Membres).

---

## 27. Recommandations

Aucune modification n'a été effectuée. Recommandations pour une future phase d'implémentation (non exécutées ici) :
1. Faire trancher par le Product Owner les 8 sujets de §23 avant toute nouvelle fonctionnalité Tontine, en particulier le doublon `Contribution`/`CycleContribution` (#5) qui conditionne la fiabilité du reporting financier.
2. Si une migration vers le modèle canonique est un jour engagée, la traiter comme un chantier dédié distinct des fonctionnalités (comme déjà fait pour `Loan.status` en Phase 2, §7 point 8 de `PHASE_02_MODELE_CANONIQUE_FINAL.md`) plutôt que de la mélanger à une nouvelle fonctionnalité.
3. Le mobile devrait construire directement contre le modèle canonique verrouillé (dictionnaire + `PHASE_02_MODELE_CANONIQUE_FINAL.md`), pas contre la structure imbriquée actuelle du Web — déjà la position documentée, à confirmer/maintenir.

---

## 28. Fichiers inspectés

**tanzen-frontend** : `src/mocks/tontines/tontines.ts`, `src/mocks/tontines/tontine-cycles.ts`, `src/services/tontines.service.ts`, `src/services/tontines.service.test.ts`, `src/features/tontines/tontines-module.tsx`, `src/mocks/rbac.mocks.ts`, `src/mocks/finance/contributions.ts`, `src/mocks/finance/transactions.ts`, `src/mocks/finance/accounts.ts`, `src/mocks/organization/governance.ts`, `src/mocks/organization/members.ts`, `src/features/organization/organization-module.tsx`, `src/services/query-keys.ts`, `src/routes/app-router.tsx` (extrait), `src/config/navigation.ts` (extrait), `docs/dictionnaire_donnees.xlsx` (6 feuilles extraites intégralement), `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `docs/PHASE_02_DECISIONS_CANONIQUES.md` (référencé), `docs/PHASE_08_TONTINES.md`, `docs/PHASE_08_DECISIONS_A_VALIDER.md`.

**tanzen-mobile** : `src/database/schema/index.ts`, `src/database/migrations/001_initial.ts`, `docs/PHASE_4C3_WEB_TO_MOBILE_TRANSFER_AUDIT.md` (grep), `src/permissions/` (grep), listing complet `docs/MOBILE_PHASE_*`.

**tanzen-commercial** : listing `docs/` (titres comparés), `src/routes/app-router.tsx` (grep), `src/mocks/rbac.mocks.ts`, grep global `tontine|cycle_member|draw_winner` sur `src/`.

**tanzen-backend** : listing du répertoire racine (vide).

---

## 29. Modifications

**AUCUNE.**

---

## 30. Git

État initial et final identiques (aucune commande d'écriture exécutée entre les deux relevés) :

```
=== tanzen-frontend ===
?? docs/P1_GOVERNANCE_PHASE_4C4_POST_IMPLEMENTATION_AUDIT.md   (préexistant, sans rapport avec ce mandat)

=== tanzen-mobile ===
 M app/index.tsx                                                (préexistant, sans rapport)
?? docs/MOBILE_GOVERNANCE_NAVIGATION_AUDIT.md                   (préexistant, sans rapport)
?? docs/PHASE_4C3_WEB_TO_MOBILE_TRANSFER_AUDIT.md                (préexistant, sans rapport)

=== tanzen-commercial ===
(clean)

=== tanzen-backend ===
fatal: not a git repository
```

Après production de ce rapport, seul un nouveau fichier non suivi (`docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md`) s'ajoute à l'état `tanzen-frontend` ci-dessus. Aucun commit, aucun push.

---

---

# P1 TONTINE — DATA MODEL & IMPLEMENTATION AUDIT
# FINAL

## Entités auditées

    tontines
    tontine_cycles
    cycle_members
    tontine_contributions
    tontine_draws
    draw_winners

## Code modifié

    AUCUN

## tanzen-frontend

    Domaine Tontine fonctionnel (10 écrans, service testé, RBAC appliqué),
    structurellement divergent du modèle canonique verrouillé (imbrication
    vs tables séparées, énumérations réduites, aucun uuid/version/sync_status —
    convention Web assumée). 1 domaine bloqué (cotisations, RBAC manquant).
    1 doublon non réconcilié (Contribution Finance vs CycleContribution).

## tanzen-backend

    Répertoire vide. Aucun backend n'existe.

## tanzen-mobile

    NON MODIFIÉ — aucune des 6 entités implémentée, position de roadmap
    assumée (Phase actuelle = Membres, Tontine différé au Phase 2+ du
    modèle canonique).

## tanzen-commercial

    NON MODIFIÉ — aucun code Tontine, uniquement copie miroir des mêmes
    documents que tanzen-frontend/docs.

## Tests exécutés

    Aucun test exécuté par cet audit (lecture seule des fichiers de test
    existants : 15 tests dans tontines.service.test.ts, tous déjà passants
    selon l'état du dépôt).

## Décisions requises

    8 sujets (4 déjà loggés par PHASE_08_DECISIONS_A_VALIDER.md, 4 nouveaux
    identifiés par cet audit) — voir §23.

## Verdict Tontine Core

    PARTIAL

## Verdict Web

    PARTIAL

## Verdict Backend

    NOT READY

## Verdict Mobile

    NOT READY (par construction)

## Rapport

    docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md

FIN DU MANDAT.
