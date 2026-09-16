# Moteur générique de workflow de validation

> Mis à jour par le mandat « Administration des workflows de validation »
> (§11 à §16 ci-dessous, nouveaux) — construit l'écran **Paramètres →
> Workflows de validation** au-dessus du moteur décrit en §1-10, sans
> toucher son cœur d'exécution.

## 1. Contexte et verdict de l'analyse préalable

TANZEN possédait déjà un moteur générique d'approbation multi-étapes
(`workflowService` + `WorkflowRequest`/`WorkflowStep`/`WorkflowDefinition`,
`src/services/workflow.service.ts`), réutilisé par 3 domaines sur 5 (Crédit,
Tontines-permutation, Exercice fiscal-réouverture). Ce moteur est déjà :
multi-étapes séquentiel, gating par permission RBAC par étape
(`approverPermission`), approve/reject/return/cancel, strictement
multi-tenant.

Ce mandat n'a donc **pas** créé un second moteur (« WorkflowV2 »). Il a
étendu le moteur existant avec les capacités qui lui manquaient pour
intercepter une **modification** d'une donnée déjà enregistrée (par
opposition à l'approbation d'une entité déjà créée, ce que le moteur savait
déjà faire) :

1. **ChangeSet** (diff avant/après) — absent jusqu'ici.
2. **Verrou optimiste** (détection de conflit de version) — absent partout
   dans le code, sauf `Member.version` qui existait déjà mais n'était utilisé
   par aucun mécanisme de détection de conflit.
3. **API générique d'écriture d'audit** (`auditService.record`) — chaque
   domaine réimplémentait son propre helper.
4. **API générique de notification** (`notificationService.notify`) —
   `notifications` était en lecture seule.
5. **Anti-double-demande concurrente** (`hasPendingApproval`).
6. **Résolveur `entityType + action → WorkflowDefinition`** (`getWorkflowFor`).

Deux domaines (Gouvernance, Distributions financières) ont des
`WorkflowDefinition` en seed mais ne passent pas par le moteur à
l'exécution — dette architecturale déjà documentée dans
`docs/PHASE_09_DECISIONS_A_VALIDER.md` §4, **non traitée par ce mandat**
(hors périmètre, décision produit à part).

## 2. Concepts

- **Workflow** = `WorkflowDefinition` (`src/mocks/operations/workflow-definitions.ts`).
  Décrit un processus : `entityType` + `action` (`'create'|'update'|'close'|'reopen'|'delete'`),
  une suite de `WorkflowStepDefinition` (permission requise par étape), `active`,
  `version` (§17 ci-dessous), `allowSelfApproval?` (opt-in, voir §4).
- **ApprovalRequest** = `WorkflowRequest` (`src/mocks/operations/workflow-requests.ts`).
  Instance d'un workflow sur une entité précise. Statuts inchangés :
  `pending|inProgress|approved|rejected|returned|cancelled`.
- **ApprovalStep** = `WorkflowStep`, embarqué dans `WorkflowRequest.steps`.
- **ChangeSet** = `ChangeSetItem[]` (`src/lib/workflow/change-set.ts`) —
  `{ field, before, after }[]`, calculé par la fonction pure `computeChangeSet`.
  Porté par `WorkflowRequest.changeSet?`.
- **ApprovalAction** = inchangé, dérivé par `workflowService.listHistory`.

## 3. Flux « modification d'une donnée existante »

```
Utilisateur clique « Modifier »
        ↓
request<X>Update(tenantId, entityId, patch, requestedByUserId, requestedByName, justification?)
        ↓
getWorkflowFor(entityType, 'update')
        ↓
   pas de définition active ?  ──→ mutation directe (comportement inchangé)
        ↓ définition active
hasPendingApproval ? ──→ bloqué (§34), lien vers la demande existante
        ↓ non
computeChangeSet(entité actuelle, patch) — vide ? ──→ appliqué immédiatement (pas de bruit)
        ↓ non vide
createRequest(..., { changeSet, entitySnapshotVersion: entité.version })
        ↓
WorkflowRequest « pending », entité INCHANGÉE
        ↓
WorkflowDetail (Operations) — approve/reject via decide<X>Update(...)
        ↓ approved (toutes les étapes)
apply<X>UpdateDecision(tenantId, request)
        ↓
version courante === entitySnapshotVersion ?
   non ──→ request.versionConflict = true, RIEN N'EST APPLIQUÉ (§11)
   oui ──→ patch reconstruit depuis changeSet, appliqué via update<X> existant
        ↓
entité modifiée, version incrémentée, audit + notification du demandeur
```

## 4. Auto-approbation (§22) — décision de conception importante

Le code portait déjà un précédent pour Fiscal Year
(`settingsService.decideFiscalYearReopen`, blocage explicite
`requestedByUserId === actorId`), avec un commentaire sur `WD-006`
documentant une décision de mandat antérieure : **ne pas généraliser ce
blocage dans le moteur lui-même** (spécifique à Fiscal Year à l'origine,
Tontines-permutation autorise explicitement l'auto-approbation).

Ce mandat respecte cette décision : `workflowService.isSelfApprovalBlocked(request,
actorId)` est un helper **partagé mais jamais appelé automatiquement** par
`submitAction`. Chaque domaine qui veut la garde l'appelle explicitement
depuis son propre `decide<X>` (voir `organizationService.decideMemberUpdate`,
qui l'appelle exactement comme `decideFiscalYearReopen` le fait à la main).
`WorkflowDefinition.allowSelfApproval?` existe comme métadonnée descriptive
(documente l'intention), mais ne pilote aucun comportement automatique dans
le moteur — c'est au domaine de décider.

## 5. Verrou optimiste / conflit de version (§11)

Pas de nouveau statut créé (le besoin l'interdit explicitement). Un flag
`WorkflowRequest.versionConflict?: true` est posé à l'application si
`entité.version !== request.entitySnapshotVersion`. La demande reste dans
son statut de décision (`approved`), mais son ChangeSet n'est jamais
appliqué. L'UI (`WorkflowDetail`) affiche un bandeau d'avertissement ;
la correction attendue est : annuler puis resoumettre une nouvelle demande
(§14/§15 — jamais de mutation silencieuse d'une demande déjà tranchée).

## 6. Versionnement des définitions (§17)

`WorkflowDefinition.version: number` ; `WorkflowRequest.workflowDefinitionVersion`
capture cette valeur à la création et ne la réévalue jamais rétroactivement.
Toutes les définitions existantes démarrent à `version: 1` (première version
connue) — à incrémenter manuellement le jour où les étapes d'une définition
déjà utilisée sont réellement modifiées.

## 7. Activation progressive (§41) et non-régression (§48)

`getWorkflowFor` retourne `undefined` si aucune définition active ne couvre
le couple `entityType`+`action` — l'appelant applique alors directement,
comportement strictement inchangé. La nouvelle définition pilote (`WD-007`,
Membre) est seedée `active: false` : tout le comportement par défaut de
l'application (UI et tests) reste identique à avant ce mandat. Le
comportement « workflow obligatoire » n'est exercé que par des tests dédiés
qui activent `WD-007` le temps de leurs assertions puis la restaurent (voir
`organization.service.test.ts`).

Il n'existe **pas** de mécanisme d'activation par tenant distinct de
`WorkflowDefinition.active` (qui reste, comme avant ce mandat, une
définition résolue indépendamment du tenant appelant — cohérent avec la
philosophie déjà documentée pour `createRequest`). Une vraie activation
« par tenant » nécessiterait de rendre `WorkflowDefinition` réellement
tenant-scopée, hors périmètre de cette première passe.

**Précision (mandat « Administration des workflows de validation ») :** la
CRÉATION/LECTURE de définitions (`listDefinitions`/`getDefinition`, et
maintenant `createDefinition`/`updateDefinition`/`setDefinitionActive`/
`createNewVersionOfDefinition`, voir §11) était et reste tenant-scopée — un
administrateur ne crée/modifie que les définitions de SON tenant. C'est
uniquement la RÉSOLUTION à l'exécution (`createRequest`/`getWorkflowFor`)
qui reste cross-tenant, inchangée. Autrement dit : la création est isolée
par tenant, la résolution ne l'est pas — un trait pré-existant du moteur,
pas quelque chose que ce mandat corrige (voir §12).

## 8. Entité pilote : Membre

Choisie pour son faible risque (champs scalaires, aucune donnée financière)
et parce qu'`organizationService.updateMember` était une mutation directe
sans aucun mécanisme d'approbation à respecter.

- `organizationService.requestMemberUpdate(tenantId, memberId, patch, requestedByUserId, requestedByName, justification?)`
- `organizationService.decideMemberUpdate(tenantId, requestId, action, actorId, actorName, comment?)`
- `organizationService.applyMemberUpdateDecision(tenantId, request)`
- Permission `members.approve` (nouvelle, distincte de `members.update`).
- `WD-007` (`entityType: 'member'`, `action: 'update'`, 1 étape, `active: false`).
- UI : `MemberEditForm` (bouton « Soumettre pour validation » si un workflow
  actif existe, aperçu avant/après implicite via `PersonalTab` déjà affiché
  sur la fiche), badge « Modification en attente » sur `MemberDetail`,
  tableau avant/après générique dans `WorkflowDetail` (Operations).

## 9. Point d'extension pour un futur module

Pour brancher un nouveau module (Tontines, Comptes financiers, Règles de
crédit, Exercices fiscaux…) sur ce même moteur, sans toucher au moteur
lui-même :

1. Ajouter l'`entityType` à l'union de `WorkflowRequest`/`WorkflowDefinition`
   (et à `WORKFLOW_ENTITY_TYPES` dans `workflow-definitions.ts`, §11 — sinon
   il n'apparaît pas dans le sélecteur du formulaire d'administration).
2. Créer la `WorkflowDefinition` via **Paramètres → Workflows de validation**
   (§11) plutôt qu'en éditant `workflow-definitions.ts` à la main — `active:
   false` par défaut tant que l'intégration n'est pas prête (§41, activation
   progressive).
3. Écrire la paire `request<X>()` / `apply<X>Decision()` (et un `decide<X>()`
   optionnel si le domaine a besoin d'une règle spécifique, ex. auto-approbation)
   dans le service du domaine, en suivant `organizationService.requestMemberUpdate`
   comme référence.
4. Appeler `if (result) await <domainService>.apply<X>Decision(tenantId, result);`
   depuis `WorkflowDetail` (`operations-module.tsx`), à côté des appels
   existants — no-op garanti pour tout autre domaine/entityType.

## 10. Limites connues de cette première passe (hors périmètre, pas oublié)

- Gouvernance et Distributions financières restent hors du moteur (dette
  préexistante, non traitée).
- Pas de notification des approbateurs à la création d'une demande (même
  lacune déjà documentée pour UC02-15 avant ce mandat — nécessite un
  résolveur générique "utilisateurs détenant une permission donnée dans un
  tenant", absent d'Access & Security). Le demandeur, lui, est notifié
  (rejet/application), car son id est toujours connu.
- Les helpers d'audit existants (`recordFiscalYearAudit`, `recordCreditAudit`…)
  ne sont pas migrés vers `auditService.record` (risque de régression hors
  périmètre) — nettoyage futur possible.
- Suppression/clôture/réouverture génériques via ce moteur : non implémentées
  au-delà de l'existant (Fiscal Year garde son chemin dédié).

## 11. Administration — Paramètres → Workflows de validation

Écran de **configuration** des `WorkflowDefinition`, distinct de
**Opérations → Workflows** qui reste l'écran de **suivi/traitement** des
`WorkflowRequest` (inchangé, aucune duplication) :

| | Paramètres → Workflows de validation | Opérations → Workflows |
|---|---|---|
| Objet | `WorkflowDefinition` (le circuit) | `WorkflowRequest` (les demandes) |
| Actions | Créer, éditer, versionner, activer/désactiver | Approuver, rejeter, annuler, suivre |
| Permissions | `workflows.create`, `workflows.manage` | `<step>.approverPermission` par étape |

Fichier : `src/features/settings/settings-validation-workflows.tsx`, routé
depuis `SettingsModule` (`/settings/validation-workflows`,
`/settings/validation-workflows/new`, `/settings/validation-workflows/:id`,
`/settings/validation-workflows/:id/edit`). Les deux écrans lisent/écrivent
le **même** tableau `workflowDefinitions` via le **même** `workflowService`
— aucune donnée dupliquée, aucun état à synchroniser.

## 12. Versionnement réel des définitions (§13/§16 du besoin)

Avant ce mandat, une `WorkflowDefinition` portait déjà un champ `version`,
mais chaque `id` ne représentait qu'UNE seule version en mémoire — éditer
une définition en place aurait réécrit son historique. Ce mandat ajoute
`WorkflowDefinition.code: string`, un identifiant **stable à travers les
versions** (ex. `MEMBER_UPDATE`), distinct de `id` (unique **par version** —
chaque nouvelle version est une ligne séparée, jamais une mutation en
place) :

- `workflowService.createDefinition` crée la version 1.
- `workflowService.updateDefinition` mute EN PLACE, mais **refuse** (retourne
  `null`, aucune mutation) si `isDefinitionUsed(definitionId)` est vrai — une
  définition déjà référencée par au moins une `WorkflowRequest` ne peut plus
  être éditée en place. L'UI désactive alors le formulaire et affiche « Cette
  version a déjà été utilisée… créez une nouvelle version » (§16).
- `workflowService.createNewVersionOfDefinition` clone la définition dans une
  **nouvelle ligne** (`version: source.version + 1`, `id` différent),
  désactive la source et active la nouvelle. La source n'est **jamais**
  modifiée.
- `WorkflowRequest.workflowDefinitionId` référence l'`id` exact de la version
  utilisée à sa création — intact pour toujours, même après la création
  d'une V2. Ses `steps` sont déjà un instantané propre à la demande (copiés
  par `createRequest`), donc l'exécution des demandes existantes n'a jamais
  dépendu de ce mécanisme de `code` : il sécurise uniquement l'ÉDITION de la
  définition elle-même.
- `workflowService.setDefinitionActive` impose au plus une version active à
  la fois par `code` (désactive les autres versions du même `code`) —
  garantit qu'une seule version est résolue par `getWorkflowFor` pour les
  NOUVELLES demandes ; les demandes déjà en cours ne changent jamais de
  version rétroactivement.

## 13. Étapes, ordre, permissions (§9/§10/§11 du besoin)

Le constructeur d'étapes (`StepsBuilder`) réutilise `WorkflowStepDefinition`
tel quel — pas de nouveau type. Réorganisation par boutons ↑/↓ (pas de
glisser-déposer : aucune librairie drag-and-drop n'était déjà présente dans
le projet, les flèches suffisent et évitent une nouvelle dépendance).
`order` est réindexé par le service selon la position dans le tableau à
chaque enregistrement (`reindexSteps`), jamais saisi manuellement.

Le sélecteur de permission par étape liste **l'intégralité du catalogue RBAC
existant** (`permissionCatalog`, `rbac.mocks.ts`) — aucun nouveau mécanisme
d'approbateur (rôle nommé, utilisateur spécifique) n'a été inventé. La
résolution « permission → utilisateurs réels à notifier » reste absente du
moteur (§12 du besoin, §10 ci-dessus) : la configuration (la RÈGLE — quelle
permission) est prête et persistée, seule la résolution effective vers des
comptes utilisateurs manque, exactement comme documenté avant ce mandat.

`WORKFLOW_ENTITY_TYPES`/`WORKFLOW_ACTION_TYPES`/`WORKFLOW_DOMAINS`
(`workflow-definitions.ts`) bornent les sélecteurs Entité/Action/Module aux
valeurs réellement supportées par le moteur — aucune valeur `GROUP`/
`FINANCIAL_ACCOUNT` (mentionnées comme exemples potentiels dans le besoin)
n'a été ajoutée artificiellement : elles n'existent pas encore dans
`WorkflowRequest.entityType`, donc pas dans le sélecteur.

**Conditions (§18 du besoin)** : aucun champ n'a été ajouté à
`WorkflowStepDefinition` pour des règles conditionnelles (« Montant ≥ X →
étape supplémentaire ») — un champ non câblé à un comportement réel serait
du code mort. Point d'extension documenté, pas construit : le jour où ce
besoin devient concret, `WorkflowStepDefinition` peut gagner un champ
`condition` optionnel, interprété par `getWorkflowFor`/`createRequest`.

## 14. Permissions de l'écran d'administration (§22 du besoin)

`workflows.read`/`workflows.create`/`workflows.manage` existaient déjà dans
`permissionCatalog` (`rbac.mocks.ts`) mais n'étaient utilisées nulle part —
aucune nouvelle permission créée. `workflows.create` (nouveau workflow) et
`workflows.manage` (éditer/activer/désactiver/nouvelle version) sont
strictement distinctes des permissions d'ÉTAPE (`approverPermission`, ex.
`members.approve`) qui gouvernent qui peut VALIDER une demande dans
Opérations — même séparation CONFIGURER/VALIDER que le besoin demande.
Comme les 8 autres pages de Paramètres déjà existantes, la page elle-même
n'est pas gardée par un `PermissionRoute` (convention du module Settings) ;
les actions mutantes (créer/éditer/activer/désactiver) le sont via
`PermissionGate`, cohérent avec `SettingsModules` (gabarit réutilisé).

## 15. Multi-tenant (§23 du besoin)

`listDefinitions`/`getDefinition`/`createDefinition`/`updateDefinition`/
`setDefinitionActive`/`createNewVersionOfDefinition` sont tenant-scopées
(paramètre `tenantId`, `getTenantScoped`) — un tenant ne voit ni ne modifie
les définitions d'un autre tenant depuis cet écran. Voir §7 ci-dessus pour
la nuance avec la résolution cross-tenant de `createRequest`/`getWorkflowFor`,
volontairement inchangée (trait pré-existant du moteur).

## 16. Audit (§21 du besoin)

Chaque action d'administration appelle `auditService.record(...)` (API
générique déjà ajoutée au mandat précédent, pas de second service d'audit) :
`workflow.definitionCreated`, `workflow.definitionUpdated`,
`workflow.versionCreated`, `workflow.activated`, `workflow.deactivated`.
Granularité au niveau DÉFINITION, pas par étape individuelle : les étapes
sont soumises en un seul appel de service par enregistrement (tout le
tableau `steps` à la fois), donc des événements `WORKFLOW_STEP_ADDED`/
`_UPDATED`/`_REMOVED` distincts n'auraient correspondu à aucun appel de
service réel — inventer cette granularité aurait été un détail d'audit
fictif, pas un événement réellement observé.
