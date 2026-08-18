# P1 GLOBAL FISCAL YEAR — REOPEN APPROVAL DECISION GATE
# D-FY-07 / D-FY-08

**Statut : PARTIE A EN LECTURE SEULE (D-FY-07/D-FY-08, §27 du mandat) — aucune modification de code pour ces deux décisions.** La Partie B (correction UX de l'étape de transfert) est documentée en §11, avec modification de code autorisée et effectuée dans ce même mandat. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non touchés. Aucun commit, aucun push.

---

## 1. Objet

Analyser, à partir du code réel (aucune supposition), l'autorité d'approbation d'une réouverture d'exercice fiscal (D-FY-07) et la possibilité d'auto-approbation (D-FY-08), puis documenter les décisions encore ouvertes sans les trancher. Corriger séparément (Partie B, §11) une anomalie UX constatée à l'étape 2/2 de création d'exercice.

## 2. Méthode

Lecture directe des fichiers suivants, aucune extrapolation : `src/mocks/rbac.mocks.ts` (catalogue de permissions, rôles), `src/mocks/operations/workflow-definitions.ts`, `src/mocks/operations/workflow-requests.ts` (types `WorkflowRequest`/`WorkflowStep`), `src/services/workflow.service.ts` (`submitAction`, `createRequest`), `src/contexts/permission-context.tsx`, `src/mocks/rbac.mocks.ts` (`CurrentUser`), `src/features/operations/operations-module.tsx` (`WorkflowDetail`, garde d'action).

---

## 3. D-FY-07 — Autorité d'approbation

### 3.1 Qui peut demander ?

`fiscalYears.manage` — le bouton « Demander la réouverture » (`src/features/settings/settings-module.tsx`) est gardé par `PermissionGate permission="fiscalYears.manage"`. **Aucune permission distincte pour « demander »** n'existe : c'est la même permission que celle requise pour gérer les exercices (créer, ouvrir, clôturer).

### 3.2 Qui peut approuver ?

`fiscalYears.manage` également — `WD-005` (`workflow-definitions.ts`) ne porte qu'une étape, `{ name: 'Autorisation de réouverture', approverPermission: 'fiscalYears.manage' }`. Le bouton « Approuver » de l'écran générique (`WorkflowDetail`, `operations-module.tsx`) est gardé par `PermissionGate permission={currentStep.approverPermission}` — donc par la même permission.

**Conséquence directe, vérifiée** : demandeur et approbateur potentiel partagent aujourd'hui exactement le même filtre de permission. Rien n'empêche techniquement qu'un même utilisateur détienne `fiscalYears.manage`, initie une demande, puis l'approuve lui-même (voir D-FY-08).

### 3.3 Qui peut rejeter ?

Même permission, même bouton (`Rejeter`, même garde).

### 3.4 Existe-t-il déjà une permission dédiée ?

Non. Le catalogue (`rbac.mocks.ts:77`) ne porte que `fiscalYears.read`/`fiscalYears.manage`.

### 3.5 Existe-t-il déjà un rôle d'approbateur ?

Non, au sens d'un rôle système dédié à l'approbation. Les 3 rôles existants (`role-admin`, `role-manager`, `role-viewer`, `rbac.mocks.ts:85-87`) sont des paliers RBAC génériques (accès complet / opérationnel / lecture seule), pas des rôles fonctionnels d'approbation par domaine.

**Précédent RBAC réel identifié** (vérifié dans `rbac.mocks.ts`, lignes 55, 59-61) : les domaines Credit, Finance et Governance possèdent chacun une permission `.approve` **distincte** de leur permission de création — `applications.approve` (≠ `applications.create`), `loans.approve`, `distributions.approve` (≠ `distributions.create`), `governance.approve` (≠ `governance.create`). Ce précédent est cohérent avec 3 des 4 workflows déjà seedés (`WD-001`, `WD-003`, `WD-004`, `workflow-definitions.ts`), dont les étapes utilisent des `approverPermission` **différents** pour l'étape de saisie et l'étape de décision finale. **Un seul précédent contraire existe** : `WD-002` (Tontines) utilise `cycles.manage` pour ses deux étapes — le même schéma qu'a suivi `WD-005` (Fiscal Year) lors de sa construction. Les deux patterns coexistent donc déjà dans le projet ; aucun n'est « la » convention unique.

### 3.6 Existe-t-il déjà un mécanisme de séparation demandeur/approbateur ?

Non — voir D-FY-08.

---

## 4. D-FY-07 — Matrice des options

| Option | RBAC | Workflow | Audit | UX | Sécurité | Complexité |
|---|---|---|---|---|---|---|
| **A — `fiscalYears.manage`** (état actuel) | Aucune permission créée, réutilise l'existant | `WD-005` déjà conforme tel quel | Déjà tracé (`fiscalYears.reopenRequested`/`reopened` + historique générique dérivé) | Aucun changement d'écran nécessaire | Demandeur et approbateur potentiels partagent la même permission — auto-approbation possible pour quiconque la détient | Nulle — déjà en production |
| **B — `fiscalYears.approve`** (permission distincte) | Nouvelle permission à créer (non fait ici, §27 l'interdit pour ce mandat) ; cohérente avec le précédent `applications.approve`/`distributions.approve`/`governance.approve`/`loans.approve` | `WD-005` passerait à un `approverPermission` distinct pour son étape de décision | Inchangé | Nécessite d'assigner explicitement `fiscalYears.approve` à un sous-ensemble de rôles pour créer une réelle séparation — sinon un rôle qui a déjà `fiscalYears.manage` recevrait `fiscalYears.approve` aussi (le filtre `role-manager`, qui exclut seulement `.delete`/`.approve`, l'exclurait — mais `role-admin` recevrait toujours les deux) | Sépare structurellement demandeur/approbateur **uniquement si** les deux permissions sont un jour assignées à des rôles différents (non garanti par la seule création de la permission) | Modérée — permission + réflexion sur l'assignation de rôles, hors périmètre de ce mandat |
| **C — Autorité Governance (Bureau/Position)** | Aucune intégration RBAC↔Governance n'existe — **déjà tranché comme séparation volontaire** (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §5 : « RBAC Role ≠ Governance Position... Aucune FK entre les deux catalogues ») | Le moteur `workflowService` ne connaît que des `Permission` RBAC en `approverPermission`, jamais un `PositionRole` — incompatible sans modification du moteur | Inchangé | Nécessiterait une UI de résolution Position → utilisateur(s), absente | Dépendrait d'une intégration aujourd'hui explicitement non désirée par une décision antérieure | Élevée — reviendrait sur une séparation déjà actée, pas seulement l'implémenter |
| **D — Mécanisme hiérarchique** | Recherche exhaustive dans `CurrentUser`/`SystemRole` (`rbac.mocks.ts`) : aucun concept de « supérieur hiérarchique »/« manager de » | N/A | N/A | N/A | N/A | **Option non retenue faute d'existence** — rien à analyser plus avant, confirmé par lecture complète du fichier RBAC |

### Recommandation

> 🟡 EN ATTENTE DE VALIDATION PO — aucune option n'est recommandée par ce document au-delà du constat factuel ci-dessus.

---

## 5. D-FY-08 — Auto-approbation

### 5.1 Identité du demandeur

`WorkflowRequest.requestedBy: string` (`workflow-requests.ts:35`) — un **nom libre**, jamais un identifiant utilisateur. Confirmé par le code de création (`workflowService.createRequest`, `workflow.service.ts`) : le champ est rempli avec `input.requestedBy` (une chaîne fournie par l'appelant, elle-même `currentUser.name` dans `settingsService.requestFiscalYearReopen`) — **aucun `requestedByUserId` n'existe, ni dans le type, ni dans les données de seed.**

### 5.2 Identité de l'approbateur

`WorkflowStep.actedBy?: string` (`workflow-requests.ts:11`) — le type porte bien un champ d'identifiant (`'U-001'` dans les données de seed historiques, ex. `workflow-requests.ts:37, 46, 51...`). **Mais** lecture complète de `workflowService.submitAction` (le seul point d'écriture réel, `workflow.service.ts`) : la fonction ne renseigne **que** `step.actedByName` — elle **ne fixe jamais `step.actedBy`**. Recherche exhaustive confirmée : `actedBy` n'est écrit nulle part dans le code d'exécution, uniquement lu depuis les données de seed pré-remplies.

**Conséquence directe** : une réouverture approuvée via l'écran réel aujourd'hui ne laisse aucune trace d'identifiant utilisateur pour l'approbateur non plus — seulement un nom (`actedByName`), au même titre que le demandeur.

### 5.3 Le système peut-il empêcher Utilisateur A → demande puis Utilisateur A → approbation ?

**Non, structurellement, pour deux raisons cumulatives** :
1. Aucun identifiant utilisateur fiable n'est disponible ni pour le demandeur (`requestedBy` est un nom libre) ni, en pratique, pour l'approbateur (`actedBy` n'est jamais renseigné par le code réel).
2. Même si les deux identifiants existaient, `WorkflowDetail`/`submitAction` ne comparent aujourd'hui **jamais** l'identité de l'acteur courant à celle du demandeur — aucune logique de ce type n'existe pour AUCUN domaine du projet (Credit, Tontines, Governance, Finance compris), confirmé par lecture intégrale de `submitAction`/`cancelRequest`.

C'est une limitation déjà connue et documentée pour un cas analogue : le commentaire de `cancelRequest` (`workflow.service.ts`) cite explicitement `docs/PHASE_09_DECISIONS_A_VALIDER.md` — *« WorkflowRequest n'a pas de lien vers Users.id pour distinguer le demandeur lui-même »*.

---

## 6. D-FY-08 — Options

| Option | Faisabilité technique aujourd'hui |
|---|---|
| **A — Auto-approbation autorisée** (statu quo) | Déjà le comportement réel — aucun changement requis |
| **B — Interdite via `requestedByUserId != approvedByUserId`** | **Impossible à implémenter en l'état** — ni `requestedByUserId` (absent du type `WorkflowRequest`) ni `approvedByUserId` fiable (`actedBy` jamais renseigné par `submitAction`) n'existent aujourd'hui. Implémenter cette option nécessiterait une modification du modèle `WorkflowRequest`/`WorkflowStep` **et** de `submitAction`/`createRequest` — explicitement hors périmètre READ-ONLY de cette Partie A (§27 du mandat) |
| **C — Conditionnelle, si une règle existante le justifie** | **Aucune règle existante trouvée** — recherche exhaustive dans les 4 domaines déjà dotés d'un workflow (Credit, Tontines, Governance, Finance) : aucun ne compare l'identité du demandeur à celle de l'approbateur |

### Recommandation

> 🟡 EN ATTENTE DE VALIDATION PO — l'Option B, si retenue par le PO, ne pourra être implémentée qu'après un mandat séparé modifiant le modèle `WorkflowRequest`/`WorkflowStep` (ajout de `requestedByUserId`, câblage réel de `actedBy` dans `submitAction`) — signalé comme MODEL GAP (§19), pas comme un choix technique immédiat.

---

## 7. Modèle d'identité (MODEL GAP)

Confirmé par lecture directe (§5.1, §5.2) :

```
WorkflowRequest.requestedBy: string        // nom libre, jamais un id
WorkflowStep.actedBy?: string              // le champ existe dans le TYPE...
                                            // ...mais submitAction() ne l'écrit JAMAIS
WorkflowStep.actedByName?: string          // seul champ réellement renseigné par submitAction()
```

**MODEL GAP** — aucune comparaison fiable d'identité demandeur/approbateur n'est possible avec le modèle actuel, pour aucun domaine du projet. Non corrigé dans ce mandat (Partie A strictement READ-ONLY).

---

## 8. Workflow de réouverture (rappel, inchangé)

```
CLOSED → [demande + justification obligatoire] → PENDING (WorkflowRequest.status='pending')
   ├── APPROVED → applyFiscalYearReopenDecision → FiscalYear.status='open'
   └── REJECTED → FiscalYear reste CLOSED
```

Déjà implémenté dans le mandat précédent (`requestFiscalYearReopen`/`applyFiscalYearReopenDecision`, `settings.service.ts`) — non modifié ici. La demande n'ouvre jamais directement l'exercice (confirmé par les tests existants, `settings.service.test.ts`).

## 9. CURRENT (rappel D-FY-03)

Inchangé — `applyFiscalYearReopenDecision` ne touche jamais `isCurrent` (confirmé par le test `'ALLOW: approving... isCurrent still untouched'`, déjà en place).

## 10. Audit

Déjà en place (mandat précédent) : `fiscalYears.reopenRequested` (à la demande, avec justification en `context`), `fiscalYears.reopened` (à l'ouverture effective, après approbation uniquement). L'approbation/le rejet eux-mêmes restent tracés génériquement par `workflowService.listHistory`, sans duplication. Aucun changement dans ce mandat.

---

## 11. Correction UX — Sélection des données transférables

### Problème observé

L'étape « Initialiser le nouvel exercice (2/2) » de l'assistant de création affichait les 9 catégories du catalogue (`src/mocks/settings/fiscal-year-transfer-categories.ts`) **toutes verrouillées**, y compris 4 d'entre elles (Configuration des tontines, Membres actifs, Règles de prêt, Comptes/configuration) qui sont en réalité déjà déterminables comme transférables. La classification D-FY-02 (« classification différée »telle qu'appliquée à l'ensemble des 5 catégories opérationnelles) avait été utilisée comme justification pour verrouiller également ces 4 catégories, alors que rien ne l'imposait.

### Comportement actuel (avant correction)

9 cases sur 9 non sélectionnables ; badge unique « Classification à trancher » appliqué indistinctement aux catégories réellement indéterminées et aux catégories déjà déterminables.

### Comportement attendu (après correction)

Une étape de sélection réelle : cases actives pour les catégories déterminées comme transférables, cases verrouillées avec un motif explicite et **visuellement distinct** pour les catégories non transférables, résumé dynamique, sélection multiple/nulle possible, aucune sélection par défaut.

### Reclassification réelle (analyse technique, pas une décision métier nouvelle)

Le mandat impose de distinguer deux axes que la version précédente avait fusionnés à tort :
- **D-FY-02** (`classification`, inchangé) : cet axe répond à « cette entité devrait-elle un jour porter un `fiscalYearId` ? » — question de modélisation de données, toujours ouverte pour 5 catégories.
- **Transférabilité** (`transferability`, nouveau champ, ce mandat) : répond à une question différente et plus étroite : « lors de la création d'un nouvel exercice, cette catégorie doit-elle être proposée au transfert ? » — une question à laquelle une réponse technique sûre existe déjà pour les 9 catégories, **indépendamment** de l'issue de D-FY-02.

| Catégorie | `classification` (D-FY-02, inchangé) | `transferability` (ce mandat) | Justification technique |
|---|---|---|---|
| Configuration des tontines | `TENANT-SCOPED` | **TRANSFÉRABLE** | Déjà permanente, non liée à un exercice — disponible dans tout exercice sans copie |
| Membres actifs | `TENANT-SCOPED` | **TRANSFÉRABLE** | Idem |
| Règles de prêt | `TENANT-SCOPED` | **TRANSFÉRABLE** | Idem |
| Comptes / configuration | `TENANT-SCOPED` | **TRANSFÉRABLE** | Idem (le solde courant n'est pas partitionné par exercice dans le modèle actuel — un seul `Account.balance` vivant, pas de solde par exercice) |
| Cotisations | `DECISION_REQUIRED` (inchangé) | **NON TRANSFÉRABLE** | Donnée historique **datée** (`contribution_date`/`date`) — appartient par nature à la période où le paiement a eu lieu, indépendamment de la question, toujours ouverte, de savoir si elle devrait un jour porter un `fiscalYearId` |
| Transactions | `DECISION_REQUIRED` (inchangé) | **NON TRANSFÉRABLE** | Idem — datée |
| Tirages | `DECISION_REQUIRED` (inchangé) | **NON TRANSFÉRABLE** | Idem — tirage daté, rattaché à un cycle qui a sa propre période |
| Présences | `DECISION_REQUIRED` (inchangé) | **NON TRANSFÉRABLE** | Idem — présence datée à une réunion précise |
| Votes | `DECISION_REQUIRED` (inchangé) | **NON TRANSFÉRABLE** | Idem — vote daté |

**Aucune catégorie du catalogue actuel n'entre dans les cas C (transfert partiel) ou D (indéterminé)** — chaque catégorie analysée s'est révélée, après lecture réelle du code, soit intégralement permanente (configuration jamais liée à l'exercice) soit intégralement historique (donnée datée, par nature non déplaçable entre exercices). Ce n'est pas un évitement : le mécanisme d'affichage « transfert partiel »/« indéterminé » reste implémenté dans le type (`TransferabilityDecision` porte `'PARTIAL'`/`'UNDETERMINED'`) pour une future catégorie qui l'exigerait, mais n'est exercé par aucune des 9 catégories actuelles — signalé explicitement plutôt que forcé artificiellement.

**Ce document ne tranche PAS D-FY-02** — les 5 catégories restent `DECISION_REQUIRED` sur l'axe classification. Il tranche uniquement la question, plus étroite, de leur transférabilité lors d'une création d'exercice, sur la base d'un fait déjà établi par le mandat précédent lui-même (§13 de son rapport : « Contributions 2026 → restent en FY 2026 »).

### Catégories sélectionnables (checkbox active)

Configuration des tontines, Membres actifs, Règles de prêt, Comptes/configuration — 4/9.

### Catégories non transférables

Cotisations, Transactions, Tirages, Présences, Votes — 5/9. Affichage verrouillé, badge rouge/neutre distinct « Non transférable », icône cadenas, raison explicite affichée.

### Catégories indéterminées

Aucune (voir ci-dessus).

### Catégories partiellement transférables

Aucune (voir ci-dessus).

### Comportement des checkbox

- Case cochée = « je demande que cette catégorie soit considérée comme active pour ce nouvel exercice » — jamais une obligation.
- Aucune sélection par défaut (aucune règle validée ne le justifie).
- Décochage total possible.
- Sélection multiple possible.
- Le résumé (`Données sélectionnées` / `Non sélectionnées`) se met à jour immédiatement (état React local, pas de requête réseau).
- À la création, `settingsService.createFiscalYear` reçoit la liste des catégories cochées (`transferSelections: string[]`) et l'enregistre dans le `context` de l'événement d'audit `fiscalYears.create` — **aucune donnée n'est copiée** pour autant : les 4 catégories transférables n'ont techniquement rien à copier (déjà permanentes, disponibles sans action), donc cocher/décocher leur case ne déclenche aucune mutation de données — seulement une confirmation tracée. Documenté explicitement dans le code (`settings.service.ts`) pour qu'aucun développeur futur ne s'attende à un effet de bord inexistant.

### Tests réalisés

Voir le rapport principal (`docs/P1_GLOBAL_FISCAL_YEAR_CONTEXT_TRANSFER_IMPLEMENTATION_REPORT.md`, mis à jour) pour le détail des tests unitaires et de la vérification navigateur — résumé : cases actives cochables/décochables, résumé dynamique vérifié, `createFiscalYear` vérifié pour transmettre exactement les catégories sélectionnées, aucune catégorie non transférable rendue cliquable, exercice source jamais modifié, Tenant jamais changé.

---

## 12. Périmètre et conformité

**Partie A (D-FY-07/D-FY-08)** : aucune permission créée, aucun rôle créé, aucun modèle modifié — strictement analyse et documentation.
**Partie B (correction UX)** : modification strictement limitée à l'étape de sélection (`settings-module.tsx`, `fiscal-year-transfer-categories.ts`, `settings.service.ts` pour le passage de `transferSelections`) — aucune nouvelle permission, aucun nouveau système de workflow, aucun autre module touché.

`tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` : NON TOUCHÉS.

FIN DU MANDAT (Partie A).
