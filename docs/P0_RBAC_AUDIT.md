# TANZEN FRONTEND — P0 RBAC — Audit read-only : `roles` / `users_roles` / `permissions` / `role_permissions`

**Statut : audit, strictement lecture seule.** Aucun fichier de `src/`, `app/`, `tests/`, `package.json`, mock, service, route, composant ou test n'a été modifié, créé, déplacé ou supprimé pour produire ce document. `git status` confirmé propre sur `src/`/`app/`/`tests/` avant et après cette mission (voir §22). Périmètre : `tanzen-frontend` exclusivement. `users`/`tenants` sont **TERMINÉS** et ne sont pas rouverts — les décisions D1 (isolation stricte)/D2 (auth honnête)/D3 (`is_active`) restent acquises et servent de référence de méthode, pas d'objet de cette mission.

---

## 0. Constat central (à lire en premier)

Le RBAC dynamique (`roles`/`permissions`/`role_permissions`/`users_roles`) est **verrouillé CANONIQUE** depuis `PHASE_02_DECISIONS_CANONIQUES.md` (sujet 6) : `Users` n'a structurellement aucune colonne `role`, toute résolution d'autorisation doit passer par `Users_roles → Roles → Role_permissions → Permissions`. Le frontend actuel implémente une **version simplifiée et en lecture seule** de ce modèle — `SystemRole`/`Permission` existent, `can()`/`PermissionGate`/`PermissionRoute` fonctionnent réellement — mais avec un écart structurel non résolu et jamais documenté avant cet audit : **`PHASE_02_MODELE_CANONIQUE_FINAL.md` (§2.2) et `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (ligne 537) affirment tous deux que `Roles`/`Role_permissions`/`Users_roles` sont TENANT-SCOPED dans le modèle canonique — mais le code lui-même déclare explicitement le contraire.** `role.service.ts` (commentaire de tête) : *« Les rôles eux-mêmes sont une configuration système globale (pas de `tenantId`) : rien à scoper ici »* — confirmé par le type `SystemRole` (`src/mocks/rbac.mocks.ts`), qui ne porte aucun champ `tenantId`, et par un test unitaire qui l'affirme explicitement (`role.service.test.ts` : *« roles and permissions are global configuration, not tenant-scoped by design »*). **C'est une contradiction non résolue entre le modèle canonique verrouillé et l'implémentation réelle** — jamais signalée par les phases précédentes (Phase 5 l'a même affirmée conforme sans vérifier le code, cf. §17 C-RBAC-01). Voir §6/§17/§19 pour le détail complet.

---

## 1. Inspection du code — inventaire des fichiers concernés

| Fichier | Rôle |
|---|---|
| `src/mocks/rbac.mocks.ts` | `Permission` (type `string`), `PlatformScope`, `SystemRole`, `CurrentUser`, `permissionCatalog` (75 permissions), `systemRoles` (3 rôles : `role-admin`, `role-manager`, `role-viewer`), `resolveScope()`, `currentUser` (mock, hardcodé `role-admin`) |
| `src/services/role.service.ts` | `listRoles/getRole/listPermissions/listUsersForRole` — lecture seule, aucun CRUD |
| `src/services/user.service.ts` | `SystemUser.roleIds: string[]` porté par l'utilisateur (représentation dénormalisée de `users_roles`) |
| `src/services/tenant-scope.ts` | `getTenantScoped()` — non utilisé par `role.service.ts` (rôles non tenant-scopés) |
| `src/contexts/permission-context.tsx` | `usePermissions()` → `{ user: currentUser, can(permission, entityType?) }` |
| `src/contexts/tenant-context.tsx` | Résolution du tenant courant (hors RBAC direct, déjà auditée `P0_TENANTS_AUDIT.md`) |
| `src/components/permission-gate.tsx` | `PermissionGate` — garde d'ACTION |
| `src/routes/permission-route.tsx` | `PermissionRoute` — garde de PAGE |
| `src/routes/app-router.tsx` | 8 routes de premier niveau gardées par `PermissionRoute` (une permission `*.read` chacune) |
| `src/features/access/access-module.tsx` | `RolesList`, `RoleDetail`, `PermissionsPage` — consultation uniquement, aucune écriture |
| `src/features/access/components/permission-matrix.tsx` | `PermissionMatrix` — matrice d'affichage (rôle × permission), lecture seule |
| `src/mocks/organization/members.ts` | `PositionRole` (union fixe `'president'\|'treasurer'\|'secretary'\|'member'\|'boardMember'`) — **distinct** de `SystemRole`, gouvernance uniquement |

**Aucun fichier `role_permissions.ts`/`users_roles.ts` distinct n'existe** — ces deux entités n'ont ni mock, ni type, ni service dédiés (voir §8/§10).

---

## 2. État actuel du RBAC — catalogue

### 2.1 `SystemRole` (3 rôles, configuration statique du module `rbac.mocks.ts`)

| id | name | scope | permissions | tenantId |
|---|---|---|---|---|
| `role-admin` | Administrateur Tenant | `platform` | 75 (le catalogue entier) | **absent** |
| `role-manager` | Gestionnaire | `tenant` | 75 moins `*.delete`/`*.approve` | **absent** |
| `role-viewer` | Lecture seule | `tenant` | 75 moins tout ce qui n'est pas `*.read` | **absent** |

`scope: 'tenant' | 'platform'` n'est **pas** un `tenant_id` — c'est un axe RBAC indépendant qui détermine la largeur de visibilité inter-tenant d'un porteur de ce rôle (cf. `docs/P0_USERS_AUDIT.md` D1, désormais neutralisé pour `users`/`sessions`). Les deux notions partagent le mot « scope »/« tenant » mais ne se recouvrent pas — voir §17 C-RBAC-02.

### 2.2 `Permission` (catalogue de 75 identifiants `module.action`, `src/mocks/rbac.mocks.ts`)

Convention `module.action` respectée à 100% (aucune exception trouvée). Catalogue global, non scopé tenant — **conforme** au modèle canonique (`Role_permissions N──1 Permissions (catalogue global, non scopé tenant)`, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2).

**Consommation réelle** (recherche exhaustive `permission="..."` + `can('...')` dans `src/`) : **42 permissions sur 75 sont réellement consommées** par un `PermissionRoute`/`PermissionGate`/`can()` ; **33 ne le sont jamais**. Détail :

| Catégorie de permissions inutilisées | Compte | Exemple | Explication |
|---|---|---|---|
| Domaine Platform/Commercial (hors périmètre `tanzen-frontend` depuis la séparation Commercial/Tenant) | 5 | `plans.read`, `subscriptions.read`, `payments.read`, `billing.read`, `platformAudit.read` | Cohérent — ces permissions appartiennent à `tanzen-commercial`, dupliquées ici par choix architectural déjà acté (`COMMERCIAL_TENANT_SEPARATION.md`), jamais consommées côté Tenant App |
| `*.read` orphelines d'un module déjà gardé par la route (le `PermissionRoute` de premier niveau utilise UNE SEULE permission `*.read` pour gater tout le module ; les sous-permissions `*.read` plus fines du catalogue ne sont jamais réutilisées à l'intérieur) | ~20 | `members.read`, `transactions.read`, `loans.read`, `documents.read`, `cycles.read`, `draws.read`, `notifications.read`, `fiscalYears.read`, `notificationSettings.read`, `applications.read`, `repayments.read`, `guarantors.read`, `distributions.read`, `contributions.read`, `governance.read` | Pattern structurel, pas un défaut isolé — à noter pour toute future revue du catalogue (RBAC granularité page vs action) |
| RBAC lui-même, non implémenté (CRUD bloqué, cf. §7/§9) | 5 | `roles.read`, `roles.create`, `roles.update`, `roles.delete`, `permissions.read` | Directement pertinent pour cet audit — voir §7/§9 |
| Fonctionnalités non construites, déjà signalées | 3 | `users.delete` (aucun UC ne le demande, `P0_USERS_AUDIT.md`), `mfa.manage` (déjà `DECISION REQUIRED`, `PHASE_10_DECISIONS_A_VALIDER.md` §3), `mfa.read` | Non retranché, déjà documenté ailleurs |
| `sessions.read` | 1 | — | `/access-security/sessions` hérite seulement de la garde de module `users.read` (déjà noté `P0_USERS_AUDIT.md` §6) |

**Aucune permission n'a été inventée pour produire ce tableau** — la liste ci-dessus est un inventaire de ce qui existe déjà dans `permissionCatalog`, pas une proposition.

**Permissions présentes dans le code mais absentes de toute source documentaire (UC)** : aucune trouvée — chaque permission consommée correspond à une action déjà tracée dans un UC `Confirmé` d'une phase antérieure (Phase 6 à 10, non ré-auditées ici).

**Permissions attendues par les UC mais absentes du catalogue** : aucune trouvée pour `roles`/`permissions`/`role_permissions`/`users_roles` eux-mêmes — le catalogue couvre déjà `roles.*`/`permissions.read` (non exercées, §2.2 ci-dessus), il n'y a pas de gap de nommage, seulement un gap d'implémentation (CRUD).

---

## 3. `SystemRole` vs `PositionRole` — distinction vérifiée

**Respectée partout, sans exception trouvée.** Recherche exhaustive de tout usage croisé (`PositionRole` importé dans `access-module.tsx`, `SystemRole` importé dans `organization-module.tsx`) : aucun résultat. `PositionRole` (`src/mocks/organization/members.ts`) reste une union TypeScript fixe (`'president'|'treasurer'|'secretary'|'member'|'boardMember'`), **pas** un catalogue dynamique (déjà documenté `PHASE_06_DECISIONS_A_VALIDER.md` §3, non rouvert ici) — aucune FK vers `SystemRole`/`role.service.ts`. Le commentaire de tête de `rbac.mocks.ts` documente explicitement cette séparation (« Un `SystemRole` détermine ce qu'un utilisateur peut faire dans l'application ; un `PositionRole` décrit une fonction élue au sein d'un tenant. Les deux ne doivent jamais être fusionnés »). Conforme à `PHASE_02_MODELE_CANONIQUE_FINAL.md` §5 (« RBAC Role ≠ Governance Position »).

---

## 4. `roles`

| Aspect | Constat |
|---|---|
| Modèle | `SystemRole { id, name, description, permissions: Permission[], scope: PlatformScope }` |
| `tenant_id` | **Absent** — contredit le modèle canonique (`Tenant 1──N Roles`, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2) |
| Statut (actif/inactif) | Absent — aucun champ d'activation sur `SystemRole` (contrairement à `users.is_active`, désormais tranché par D3) |
| Création | **Non implémentée** — aucune fonction `createRole` dans `role.service.ts` |
| Modification | **Non implémentée** |
| Suppression | **Non implémentée** |
| Lecture | Implémentée (`listRoles`, `getRole`) — fonctionne réellement, données réelles rendues dans `RolesList`/`RoleDetail` |
| Affectation (à un utilisateur) | Implémentée côté `SystemUser.roleIds` (voir §8), mais aucune fonction dédiée `assignRole`/`revokeRole` sur `role.service.ts` — l'affectation passe uniquement par `userService.update({ roleIds })` |
| Restrictions d'affectation | `RolePicker` (`access-module.tsx`) filtre les rôles assignables : `currentUserScope === 'platform' || role.scope === 'tenant'` — un acteur `scope: 'tenant'` ne peut pas s'auto-accorder/accorder un rôle `scope: 'platform'`. **Garde UI uniquement** (voir §18, risque d'escalade) |

**GLOBAL ou TENANT-SCOPED ?** Le code est **GLOBAL** (3 rôles partagés par les 5 tenants du jeu de données). Le modèle canonique dit **TENANT-SCOPED**. **→ DECISION_REQUIRED, voir `P0_RBAC_DECISIONS_A_VALIDER.md` D1.** Ne pas trancher ici.

**Classification** : `roles` = **PARTIALLY_IMPLEMENTED** (lecture réelle, écriture absente, modèle tenant divergent du canonique).

---

## 5. `permissions`

| Aspect | Constat |
|---|---|
| Modèle | `Permission = string`, convention `module.action` |
| Catalogue | 75 entrées, `src/mocks/rbac.mocks.ts` (voir §2.2) |
| `tenant_id` | Absent — **conforme** au modèle canonique (catalogue global) |
| CRUD | **Non implémenté** — `listPermissions()` en lecture seule uniquement ; déjà `BLOQUANT` (`PHASE_10_DECISIONS_A_VALIDER.md` §1, non retranché ici) |
| Utilisation réelle | 42/75 (§2.2) |
| Risque déjà signalé | Modifier le catalogue en runtime changerait le comportement de sécurité de toute l'application (aucun mécanisme de portée par tenant n'existe pour l'isoler) — argument déjà documenté Phase 10, toujours valable, non réévalué ici |

**Classification** : `permissions` = **PARTIALLY_IMPLEMENTED** (lecture réelle, écriture absente — déjà `BLOQUANT` avant cet audit).

---

## 6. `role_permissions`

| Aspect | Constat |
|---|---|
| Modèle canonique | Table de jonction propre, tenant-scopée (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2) |
| Implémentation frontend | **Aucune entité séparée** — les permissions d'un rôle sont un tableau `permissions: Permission[]` **imbriqué directement** dans `SystemRole` |
| Cardinalité de fait | Many-to-many dénormalisée (plusieurs rôles peuvent référencer la même permission, confirmé par lecture directe : `role-admin`/`role-manager`/`role-viewer` se recouvrent largement) |
| `tenant_id` | Absent (hérite de l'absence sur `SystemRole` lui-même — voir §4) |
| Métadonnées d'affectation (qui a affecté quelle permission, quand) | **Absentes** — aucune trace d'audit sur la composition d'un rôle |
| CRUD | **Non implémenté** — modifier `role.permissions` nécessiterait de modifier la constante `systemRoles` elle-même (aucune fonction de service ne le permet) |
| Risque d'escalade | Voir §10/§18 — aucune vérification d'unicité, aucune contrainte |

**Classification** : `role_permissions` = **MISSING** en tant qu'entité propre (existe seulement comme représentation dénormalisée acceptable pour un mock, cf. précédent déjà accepté pour `users_roles`/`roleIds` par `P0_USERS_AUDIT.md` §11 — mais jamais formellement acté pour `role_permissions` spécifiquement avant cet audit).

---

## 7. Cardinalité et cas Users ↔ Roles (`users_roles`, mandat §8)

| Question du mandat | Réponse (lecture directe du code) |
|---|---|
| Un utilisateur peut-il avoir plusieurs rôles ? | **Oui** — `SystemUser.roleIds: string[]` (confirmé par les données seed, ex. aucun utilisateur seed n'a plus d'un rôle actuellement, mais le type l'autorise et `RolePicker` permet de cocher plusieurs cases) |
| Un rôle peut-il appartenir à plusieurs utilisateurs ? | **Oui** — confirmé par les données seed (`role-manager` porté par U-002, U-004, U-006, U-009, avant les modifications de la mission `users`) |
| Un rôle peut-il être affecté à un utilisateur d'un autre tenant ? | **Question structurellement inapplicable** dans l'état actuel : puisque `SystemRole` n'a pas de `tenant_id` (§4), aucun rôle n'« appartient » à un tenant précis — n'importe quel rôle peut être affecté à n'importe quel utilisateur de n'importe quel tenant, sans qu'aucune notion de « rôle d'un autre tenant » n'existe pour en interdire l'affectation. **Ce n'est ni autorisé ni interdit explicitement — c'est non défini**, parce que le modèle sous-jacent (rôles globaux) ne pose pas la question que le modèle canonique (rôles tenant-scopés) poserait. |
| Quelle est la source de vérité du tenant ? | Le tenant d'une affectation `user↔role` est entièrement porté par `SystemUser.tenantId` (le rôle ne porte rien) — cohérent avec l'absence de `tenant_id` sur `roles` déjà notée |

**Classification** : `users_roles` = **PARTIALLY_IMPLEMENTED** (existe comme représentation dénormalisée `roleIds` sur `SystemUser`, fonctionnellement exercée par `UserCreate`/`UserEdit`/`RolePicker` — mais sans entité de jonction propre, sans `tenant_id`, sans métadonnées d'affectation, et sans garde service-side empêchant qu'un rôle `scope: platform` soit affecté par un appel direct au service en contournant `RolePicker`, voir §18).

---

## 8. Tenant isolation — scénarios conceptuels (mandat §11)

| Scénario | Résultat |
|---|---|
| T001 user → T001 role → T001 permission | **Non observable tel quel** — aucun rôle n'a de `tenantId`, donc « T001 role » n'a pas de sens dans le code actuel. Un utilisateur T001 avec `roleIds: ['role-viewer']` a bien les permissions de `role-viewer` (le mécanisme `can()` fonctionne). |
| T001 user → T002 role | **Autorisé de fait, sans contrôle** — `roleIds` accepte n'importe quel `id` de `systemRoles` (catalogue global partagé par tous les tenants), donc il n'y a littéralement pas de « rôle T002 » à distinguer d'un « rôle T001 » : la question elle-même présuppose un modèle (rôles tenant-scopés) que le code n'implémente pas. |
| T001 user → T002 permission | **Non applicable** — les permissions sont globales par conception (conforme au modèle canonique), aucun tenant ne « possède » une permission, il n'existe donc pas de « permission T002 » à isoler de « permission T001 ». Sans objet. |
| T001 role → T002 permission | **Non applicable**, même raison — les permissions sont globales, un rôle ne peut techniquement référencer qu'une permission du catalogue global commun à tous les tenants. |

**Conclusion du mandat §11 (« même scope=platform ne doit pas permettre une administration cross-tenant ») appliquée à ce périmètre** : le risque décrit par D1 (users/sessions cross-tenant) **ne se reproduit pas identiquement ici**, parce que `roles`/`permissions` ne sont, dans le modèle actuel, jamais des ressources appartenant à un tenant précis — il n'y a donc pas de « lecture/écriture cross-tenant d'un rôle » possible aujourd'hui, dans un sens ou dans l'autre. Le risque réel n'est pas une fuite cross-tenant au sens D1, c'est une **divergence structurelle non résolue avec le modèle canonique** (§0, §17 C-RBAC-01) : soit le modèle canonique doit être révisé pour accepter des rôles globaux partagés (ce que le frontend fait déjà, avec succès, depuis Phase 10), soit le frontend doit un jour migrer vers des rôles tenant-scopés — question produit, non tranchable ici.

---

## 9. Platform scope (mandat §12)

- Aucune route `/platform/*` n'existe dans `tanzen-frontend` (confirmé par lecture intégrale de `src/routes/app-router.tsx`) — cohérent avec la séparation Commercial/Tenant déjà actée.
- Aucun `TenantSwitcher` interactif, aucun bouton « Platform Administration » (déjà vérifié `FIX_TENANT_APP_SINGLE_TENANT.md`, non re-testé ici — hors périmètre RBAC).
- `role.service.ts`/`rbac.mocks.ts` ne réintroduisent, directement ou indirectement, aucune capacité de sélection de tenant, de registre de tenants, ni d'accès à des utilisateurs/rôles/permissions « d'un autre tenant » — parce qu'aucun de ces trois éléments (`roles`, `permissions`, catalogues associés) n'est de toute façon tenant-scopé dans l'implémentation actuelle (§8). Il n'y a donc, par construction, rien à cloisonner par tenant à ce niveau précis — mais voir §0/§17 pour la raison structurelle sous-jacente.
- **Aucune régression trouvée** par rapport à D1/D2/D3 (Users) ni par rapport à `FIX_TENANT_APP_SINGLE_TENANT.md`.

---

## 10. `PermissionContext` (mandat §13)

| Question | Réponse |
|---|---|
| Source des permissions | `currentUser.permissions` (résolu une fois au chargement du module `rbac.mocks.ts`, jamais recalculé) |
| Source des rôles | `currentUser.roleIds`, résolu par `resolveScope()` au chargement du module |
| Comportement par défaut | `useMemo(() => ({ user: currentUser, can }), [])` — calculé une seule fois, mémoïsé pour la durée de vie de l'app |
| Comportement sans backend | Permissions figées à la compilation (constante de module), jamais recalculées côté serveur — cohérent avec `BACKEND_PENDING` |
| Comportement sans session | **`PermissionProvider`/`TenantProvider` enveloppent l'intégralité de l'app (`src/app/providers.tsx`), y compris `/login`, AVANT tout passage par `AuthGuard`** — `usePermissions()` retourne donc toujours des données valides (celles de `currentUser`), même si `authService.isAuthenticated()` est `false`. Il n'existe **aucun état « non authentifié »** pour `PermissionContext` — ce n'est pas un bug (rien n'affiche de donnée protégée avant `AuthGuard`), mais une caractéristique structurelle à connaître : le contexte RBAC est totalement découplé de l'état de session. |
| Comportement tenant manquant | Non observable — `TenantContext` résout toujours vers un tenant (`ownTenant ?? allTenants[0]`, déjà documenté `P0_TENANTS_AUDIT.md`), jamais `undefined` |
| Comportement scope platform | `can()` ne fait aucune différence entre `scope: 'tenant'` et `scope: 'platform'` — seule la présence de la permission dans `currentUser.permissions` compte. Le `scope` n'intervient que dans `RolePicker` (garde d'élévation) et, avant la mission `users`, dans `userService`/`sessionService` (désormais neutralisé, D1) |
| `hasPermission`/`hasRole`/`hasAnyPermission`/`hasAllPermissions` | **Aucune de ces 4 fonctions n'existe** — seule `can(permission, entityType?)` existe, qui teste une permission unique. Aucun composant n'a besoin de tester plusieurs permissions à la fois actuellement (vérifié par grep, aucun usage de `.some()`/`.every()` sur un tableau de permissions dans les composants) |

**Incohérence entre `PermissionContext` et `rbac.mocks.ts`** : aucune trouvée — `PermissionContext` est un pur pass-through de `currentUser`, sans logique dupliquée.

---

## 11. Backend Pending

| Élément | Statut |
|---|---|
| Résolution serveur des rôles d'un utilisateur | BACKEND_PENDING (actuellement figée dans `rbac.mocks.ts`) |
| Résolution serveur des permissions effectives | BACKEND_PENDING |
| Affectation persistante d'un rôle | BACKEND_PENDING (le mock persiste en mémoire, perdu au rechargement) |
| Révocation d'un rôle par le serveur | BACKEND_PENDING |
| Synchronisation multi-onglet/multi-session | BACKEND_PENDING |
| Prévention définitive de l'escalade de privilège | **BACKEND_PENDING absolu** — voir §18 : la seule garde existante (`RolePicker`) est côté client, contournable par un appel direct à `userService.update({ roleIds })` |
| CRUD `roles`/`permissions`/`role_permissions` | BACKEND_PENDING pour la persistance réelle ; la question de savoir SI ces CRUD doivent exister côté frontend reste elle-même `DECISION_REQUIRED` avant tout code (§4/§5/§6, `PHASE_10_DECISIONS_A_VALIDER.md` §1/§2 non retranchés) |

**FRONTEND ENFORCEMENT ≠ BACKEND SECURITY** — confirmé et documenté explicitement : `PHASE_02_TENANT_ISOLATION_SPEC.md` §12 (« Le frontend ne constitue pas la sécurité finale ») et `PHASE_02_MODELE_CANONIQUE_FINAL.md` §4 posent déjà cette doctrine pour l'isolation tenant ; elle s'applique identiquement au RBAC — `can()`/`PermissionGate`/`PermissionRoute` sont des aides UX (masquer ce que l'utilisateur ne devrait pas voir), jamais l'autorité de sécurité, qui reste `BACKEND_PENDING` dans son intégralité pour ce domaine.

---

## 12. Use Cases (mandat §15)

Identifiants réels extraits de `docs/PHASE_04_USE_CASE_CLASSIFICATION.md`, blocs UC01/UC03/UC10/UC20 — aucun identifiant reconstruit.

| UC | Entité | Acteur | Scope (source) | État réel | Classification |
|---|---|---|---|---|---|
| UC01-11 | Créer un administrateur plateforme | Super Administrateur | PLATFORM | Non implémenté (aucun acteur Super Admin distinct, NC-01 déjà signalé `P0_USERS_AUDIT.md`) | 🔴 OUT_OF_SCOPE (dépend de NC-01, Platform Core) |
| UC01-12 | Modifier un administrateur | Super Administrateur | PLATFORM | Non implémenté | 🔴 OUT_OF_SCOPE |
| UC01-13 | Désactiver un administrateur | Super Administrateur | PLATFORM | Non implémenté | 🔴 OUT_OF_SCOPE |
| UC01-14 | Réinitialiser un mot de passe (admin) | Super Administrateur, Service Email/SMS | PLATFORM | Non implémenté | 🔵 BACKEND_PENDING |
| UC03-06 | Gérer les sessions | Utilisateur (interne) | Transversal, PLATFORM+TENANT | Implémenté (`sessionService`), déjà traité D1 (`users`) — cross-référence, pas un objet RBAC pur | ⚪ OUT_OF_SCOPE (hors `roles`/`permissions`, déjà `users`) |
| UC10-06 | Gérer les utilisateurs | Admin Tenant | TENANT | Implémenté, déjà traité (`users`, D1) | ⚪ OUT_OF_SCOPE (déjà `users`) |
| UC10-07 | Gérer les rôles et permissions | Admin Tenant (`«include»` depuis UC10-06) | TENANT | Consultation seule implémentée ; CRUD non implémenté | 🟠 DECISION_REQUIRED (voir §4/§6) |
| UC20-01/02/03 | Se connecter / Gérer les sessions / Vérifier les autorisations | Utilisateur, Administrateur Tenant | PUBLIC/SAAS, Transversal | `can()` implémenté (vérification locale) ; connexion déjà traitée D2 (`users`) | ⚪ OUT_OF_SCOPE (déjà `users`) |
| UC20-15 | Supprimer un rôle | Administrateur Tenant, Super Administrateur | Transversal | Non implémenté | 🟠 DECISION_REQUIRED (déjà `À valider — cf. C-09`, **note : C-09 lui-même est résolu depuis `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6 — RBAC dynamique confirmé canonique — mais cela ne résout PAS la question distincte « qui peut faire du CRUD de rôles, et un rôle tenant-scopé ou global ? », toujours ouverte, reconfirmée `PHASE_10_DECISIONS_A_VALIDER.md` §2) |
| UC20-16 | Affecter un rôle | Administrateur Tenant, Super Administrateur | Transversal | Partiellement implémenté (RolePicker dans Create/Edit User), aucune fonction dédiée `assignRole` | 🟡 PARTIALLY_IMPLEMENTED |
| UC20-17 | Créer un rôle | Administrateur Tenant, Super Administrateur | Transversal | Non implémenté | 🟠 DECISION_REQUIRED |
| UC20-18 | Modifier un rôle | Administrateur Tenant, Super Administrateur | Transversal | Non implémenté | 🟠 DECISION_REQUIRED |
| UC20-19 | Créer une permission | Super Administrateur | PLATFORM | Non implémenté | 🔵 BACKEND_PENDING + OUT_OF_SCOPE (Platform, `tanzen-commercial`) |
| UC20-20 | Modifier une permission | Super Administrateur | PLATFORM | Non implémenté | ⚪ OUT_OF_SCOPE |
| UC20-21 | Supprimer une permission | Super Administrateur | PLATFORM | Non implémenté | ⚪ OUT_OF_SCOPE |
| UC20-22 | Affecter une permission | Super Administrateur | PLATFORM | Non implémenté | ⚪ OUT_OF_SCOPE |

**Total UC RBAC purs analysés : 12** (UC10-07, UC20-15 à UC20-22, plus UC01-11/12/13/14 cités pour mémoire car structurellement bloqués par NC-01, pas par le RBAC lui-même). UC10-06, UC20-01/02/03, UC03-06 cités par cohérence mais classés `OUT_OF_SCOPE` (déjà couverts par la mission `users`, pas des UC `roles`/`permissions` au sens strict).

**Contradiction de scope notée entre UC20-15/16/17/18 (« Gestion des rôles », marqué `Transversal` — Administrateur Tenant ET Super Administrateur) et UC20-19/20/21/22 (« Gestion des permissions », marqué `PLATFORM` strict — Super Administrateur seul)** : source directe, `PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 460 (« Gestion des permissions... sans lien visible vers Administrateur Tenant, **contrairement à** Gestion des rôles qui est transversale »). Ceci suggère, si les UC sont pris à la lettre, qu'un futur CRUD de `roles` pourrait légitimement avoir une part côté `tanzen-frontend` (acteur Administrateur Tenant), alors que le CRUD `permissions` resterait exclusivement `tanzen-commercial` (cohérent avec la séparation déjà actée) — **mais cette lecture reste conditionnée à la résolution de D1 du présent audit** (rôles tenant-scopés ou globaux ?), non tranchée ici.

---

## 13. Doublons (mandat §16)

| Élément | tanzen-frontend | tanzen-commercial | Classification |
|---|---|---|---|
| `rbac.mocks.ts` (`SystemRole`, `Permission`, `PlatformScope`, `currentUser`, `permissionCatalog`) | Oui | Oui (fichier distinct, contenu voisin, déjà noté `P0_USERS_AUDIT.md` §15) | **INTENTIONAL DUPLICATION**, déjà actée `COMMERCIAL_TENANT_SEPARATION.md`, non réexaminée en détail ici (lecture ponctuelle hors périmètre de mission, non ouverte) |
| `role.service.ts` | Oui (lecture seule) | Non vérifié en détail dans cette mission (hors périmètre : mandat limite l'inspection de code à `tanzen-frontend`) | Non tranché — signalé pour référence future uniquement |
| `PermissionGate`/`PermissionContext`/`can()` | Oui | Oui (déjà noté `SHARED CONCEPT`, `P0_USERS_AUDIT.md` §15) | **SHARED CONCEPT**, non réexaminé |

Aucun doublon interne à `tanzen-frontend` trouvé (un seul `rbac.mocks.ts`, un seul `role.service.ts`, une seule `PermissionMatrix`).

---

## 14. Contradictions (mandat §17)

| # | Sujet | Source A | Source B | Nature | Impact | Décision existante ? | Décision requise ? |
|---|---|---|---|---|---|---|---|
| C-RBAC-01 | `Roles`/`Role_permissions`/`Users_roles` tenant-scopés | `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2 (verrouillé CANONIQUE) + `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` ligne 537 (« TENANT-SCOPED pour Roles/Role_permissions/Users_roles ») | Code réel : `SystemRole` n'a pas de `tenantId`, confirmé par `role.service.ts` (commentaire explicite) et un test unitaire (« not tenant-scoped by design ») | **CONFLIT direct, jamais détecté avant cet audit** — Phase 5 a affirmé la conformité au canonique SANS vérifier le code, Phase 10 a implémenté le contraire sans le confronter au modèle canonique de Phase 2 | Bloque toute décision d'implémenter un CRUD `roles` tant que « rôle global ou par tenant » n'est pas tranché | Aucune | **OUI — voir D1** |
| C-RBAC-02 | Double sens du mot « scope » | `SystemRole.scope: 'tenant'\|'platform'` (RBAC — largeur de visibilité inter-tenant d'un porteur de rôle) | `tenant_id`/isolation tenant au sens D1 `users` (propriété d'une ressource par un tenant) | Ambiguïté terminologique, pas un bug fonctionnel — les deux notions ne se recouvrent jamais dans le code actuel, mais le nom partagé crée un risque de confusion pour toute future lecture/implémentation | Faible aujourd'hui, mais amplifie C-RBAC-01 (« rôle tenant-scopé » pourrait être confondu avec `role.scope`) | Aucune | Non bloquant, à clarifier si D1 est tranchée en faveur de rôles tenant-scopés (il faudrait alors deux champs distincts) |
| C-RBAC-03 | UC20-15/16/17/18 (Rôles, `Transversal`) vs UC20-19/20/21/22 (Permissions, `PLATFORM` strict) | `PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 460 (« Gestion des permissions... contrairement à Gestion des rôles qui est transversale ») | Séparation Commercial/Tenant déjà actée (rien de RBAC-write ne doit être dans `tanzen-frontend` selon la doctrine actuelle) | Les UC sources permettent un acteur Administrateur Tenant pour les rôles (pas pour les permissions) — mais cela n'a jamais été confronté à la doctrine Commercial/Tenant post-séparation (2026-08-16), postérieure à Phase 4 | Détermine si un futur CRUD `roles` (partiel) pourrait légitimement vivre dans `tanzen-frontend`, ou si tout le RBAC-write doit être `tanzen-commercial` par cohérence avec D1 (`users`) | Aucune | **OUI — voir D2** |
| C-RBAC-04 (déjà signalé, corroboré) | `tenants.read` gate la route `/organization/*` (Membres + Gouvernance), pas `members.read` | `app-router.tsx` ligne 57 | Catalogue de permissions (`members.read` existe et n'est jamais utilisé, §2.2) | Nommage de permission incohérent avec le contenu réel du module gardé — probable artefact d'avant la séparation Commercial/Tenant (`/organization` gérait alors aussi le registre des tenants) | Un audit RBAC futur pourrait mal interpréter les logs d'accès ; `members.read` reste orphelin | `P0_TENANTS_FINAL_REPORT.md` §9 point 2 avait déjà signalé un problème voisin (`tenants.update` gating `SettingsOrganization`) — **cette instance-ci (route `/organization/*` entière gardée par `tenants.read`) est distincte et non signalée avant cet audit** | Non bloquant, corollaire de D1/D2 |
| C-RBAC-05 (déjà signalé, non retranché) | `mfa.manage` sans action définie | `permissionCatalog` (la permission existe) | Aucun UC ne définit l'action qu'elle couvre | Déjà `DECISION REQUIRED` | `PHASE_10_DECISIONS_A_VALIDER.md` §3 | Non — déjà consigné, non dupliqué comme nouvelle décision |
| C-RBAC-06 (déjà signalé, non retranché) | CRUD `roles`/`permissions` bloquant | `PHASE_10_DECISIONS_A_VALIDER.md` §1/§2 | — | Déjà `BLOQUANT` | `PHASE_10_DECISIONS_A_VALIDER.md` | Non — déjà consigné, réaffirmé par cet audit (§4/§5), pas rouvert comme nouveau sujet distinct de D1/D2 |

---

## 15. Sécurité (mandat §18) — analyse uniquement, aucune correction

| Risque | Constat | Sévérité conceptuelle |
|---|---|---|
| **Privilege escalation via appel direct au service** | `RolePicker` (garde UI) empêche un acteur `scope: tenant` de cocher un rôle `scope: platform` dans le formulaire — mais `userService.update(tenantId, userId, { roleIds: ['role-admin'] }, scope)` (`user.service.ts`) n'effectue **aucune vérification** que le `roleIds` soumis respecte cette même règle. Un appel direct au service (console dev, test, futur composant qui oublierait de passer par `RolePicker`) contournerait entièrement la garde. **Confirmé par lecture directe du code** (`update()` ne fait que `Object.assign(user, safePatch)` après le retrait de `tenantId`/`tenantName`, ajouté par la mission `users` — `roleIds` n'est pas filtré). | Élevée en principe (aucune barrière service-side), mais **frontend-only** — le mandat rappelle que le frontend n'est de toute façon jamais l'autorité de sécurité (§11) ; le risque réel se matérialiserait seulement si un futur backend faisait une confiance aveugle à ce payload sans revalider côté serveur, ce qui serait une erreur backend, pas frontend |
| **Absence de `tenant_id` sur `roles` = pas d'IDOR possible sur les rôles eux-mêmes** | Comme documenté §8, il n'existe pas de notion de « rôle d'un autre tenant » à usurper — ce vecteur d'IDOR classique (deviner l'ID d'une ressource d'un autre tenant) ne s'applique pas à `roles`/`permissions` dans l'état actuel, précisément parce qu'ils sont globaux | N/A — absence de risque, pas une atténuation d'un risque existant |
| **Role injection via `roleIds` arbitraire** | `userService.create`/`update` acceptent `roleIds: string[]` sans valider que chaque id existe réellement dans `systemRoles` — un `roleIds: ['role-inexistant']` serait accepté silencieusement (confirmé par lecture directe, aucune validation d'existence) | Faible impact pratique (`roleNames()`/`can()` ignoreraient silencieusement un id inconnu, aucun crash, aucune permission accordée pour un rôle qui n'existe pas) mais une validation d'entrée manquante, à noter |
| **Permission injection** | `can(permission)` = `currentUser.permissions.includes(permission)` — teste une chaîne contre un tableau fermé, pas d'évaluation dynamique/`eval`, pas de risque d'injection au sens classique | N/A |
| **Scope bypass (`scope: platform`)** | Neutralisé pour `users`/`sessions` par D1 (mission précédente). Pour `roles`/`permissions` eux-mêmes : sans objet, ces ressources n'étant jamais scopées tenant (§8) | Résolu pour `users`/`sessions` ; sans objet ici |
| **Client-side trust (fondamental)** | L'intégralité du RBAC actuel repose sur une confiance totale au client : `currentUser.permissions` est calculé une fois côté navigateur et jamais revérifié — un utilisateur techniquement outillé pourrait modifier l'état React en mémoire (ou, plus simplement, appeler `userService.update` directement) pour changer ses propres `roleIds`, contournant instantanément tout `PermissionGate`/`PermissionRoute` | **Risque fondamental déjà connu et documenté** (`PHASE_02_TENANT_ISOLATION_SPEC.md` §12, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §4) — inhérent à une application 100% mockée sans backend, pas une découverte nouvelle de cet audit, mais reconfirmé applicable au RBAC spécifiquement |

**Aucune correction appliquée** — analyse uniquement, conformément au mandat §18.

---

## 16. Matrice finale — entités RBAC

| # | Entité | État frontend | Tenant scoped | RBAC (garde propre) | Backend | Décision | Priorité | Action recommandée |
|---|---|---|---|---|---|---|---|---|
| 01 | `roles` | PARTIALLY_IMPLEMENTED (lecture réelle, écriture absente) | **NON** (contredit le canonique — C-RBAC-01) | N/A (le RBAC ne se garde pas lui-même ici) | BACKEND_PENDING (persistance) | **D1 (bloquante)** | Haute | Ne rien coder avant D1 |
| 02 | `permissions` | PARTIALLY_IMPLEMENTED (lecture réelle, écriture absente) | Non applicable (conforme, catalogue global) | N/A | BACKEND_PENDING | Déjà `BLOQUANT` (Phase 10 §1), réaffirmé | Haute (mais hors périmètre `tanzen-frontend`, cf. D2) | Ne rien coder ; probable `tanzen-commercial` |
| 03 | `role_permissions` | MISSING (entité propre inexistante, dénormalisée dans `SystemRole.permissions`) | Hérite de `roles` (donc NON) | N/A | BACKEND_PENDING | Dépend de D1 | Moyenne | Ne rien coder avant D1 |
| 04 | `users_roles` | PARTIALLY_IMPLEMENTED (dénormalisé `SystemUser.roleIds`, exercé en pratique) | Oui côté `User` (via `SystemUser.tenantId`), non côté `Role` (§7) | Garde UI uniquement (`RolePicker`), pas de garde service-side (§15) | BACKEND_PENDING | Dépend de D1 pour toute évolution vers une entité de jonction propre | Moyenne | Fonctionnel tel quel pour l'usage actuel (Create/Edit User) ; défense service-side possible sans attendre D1 si demandée explicitement dans une future mission |

---

## 17. Matrice des Use Cases

Voir §12 pour le détail complet (12 UC RBAC purs analysés). Synthèse :

| Classification | UC concernés | Compte |
|---|---|---|
| PARTIALLY_IMPLEMENTED | UC20-16 (affecter un rôle, via `RolePicker` sans fonction dédiée) | 1 |
| DECISION_REQUIRED | UC10-07, UC20-15, UC20-17, UC20-18 | 4 |
| BACKEND_PENDING | UC01-14 | 1 |
| OUT_OF_SCOPE (Platform/`tanzen-commercial`) | UC01-11/12/13, UC20-19/20/21/22 | 7 |
| OUT_OF_SCOPE (déjà couvert par `users`) | UC10-06, UC20-01/02/03, UC03-06 | 5 |

---

## 18. GO / NO-GO

### GO
Rien — aucune implémentation `roles`/`users_roles`/`permissions`/`role_permissions` n'est prête à démarrer sans décision préalable (D1 est bloquante pour toute écriture RBAC).

### NO-GO
- CRUD `roles` (UC20-15/17/18) — bloqué par D1 (rôles globaux ou tenant-scopés ?) et par D2 (Tenant App ou Commercial ?).
- CRUD `permissions` (UC20-19-22) — déjà `BLOQUANT` (Phase 10), réaffirmé, probable hors périmètre `tanzen-frontend`.
- `role_permissions`/`users_roles` comme entités de jonction propres — dépendent de D1.
- Toute défense service-side supplémentaire contre l'escalade de privilège (§15) — non demandée explicitement par une décision validée, non implémentée par cet audit read-only.

### DECISION_REQUIRED
Voir `docs/P0_RBAC_DECISIONS_A_VALIDER.md` — D1 (rôles globaux vs tenant-scopés), D2 (Tenant App vs Commercial pour un futur CRUD rôles), D3 (fonction `assignRole`/`revokeRole` dédiée ou statu quo `userService.update({roleIds})`).

### BACKEND_PENDING
Persistance réelle de toute écriture RBAC ; résolution serveur des rôles/permissions ; prévention définitive de l'escalade de privilège (§11/§15).

### OUT_OF_SCOPE
UC01-11 à 14 (comptes plateforme, NC-01) ; UC20-19 à 22 (permissions, PLATFORM/`tanzen-commercial`) ; UC10-06/UC20-01-03/UC03-06 (déjà couverts par la mission `users`) ; toute correction du catalogue `rbac.mocks.ts` dupliqué dans `tanzen-commercial` (hors périmètre de lecture de cette mission).

---

## 19. Ordre d'implémentation recommandé (proposition, non exécutée)

1. **Trancher D1** (`roles` global vs tenant-scopé) — bloque tout le reste, c'est la seule décision dont dépendent directement `role_permissions`/`users_roles` en tant qu'entités propres.
2. **Trancher D2** (périmètre `tanzen-frontend` vs `tanzen-commercial` pour un futur CRUD `roles`) — dépend de D1 (si rôles tenant-scopés, un CRUD partiel côté Tenant App devient plausible, cohérent avec UC20-15-18 marqués `Transversal` ; si rôles globaux, tout CRUD RBAC-write reste `tanzen-commercial`, cohérent avec D1/D2 déjà tranchées pour `users`).
3. **`role_permissions`** — une fois D1/D2 tranchées, dépend directement du schéma retenu pour `roles` (ne peut pas être conçu indépendamment, c'est une table de jonction).
4. **`users_roles`** — moins bloqué que les deux précédents (fonctionne déjà en pratique via `roleIds`) ; une migration vers une entité de jonction propre est un raffinement, pas un prérequis pour que Create/Edit User continue de fonctionner.
5. **`permissions` CRUD** — dernier de la liste : déjà `BLOQUANT` depuis Phase 10 pour des raisons indépendantes de D1/D2 (risque de casser le RBAC de toute l'app en modifiant une constante partagée), et structurellement `PLATFORM`-only d'après les UC sources (§12), donc probablement hors périmètre `tanzen-frontend` de toute façon.

*Ordre dérivé des dépendances explicites ci-dessus (D1 conditionne D2, qui conditionne le reste), pas d'une préférence arbitraire.*

---

## 20. Sources consultées

`docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `docs/PHASE_02_DECISIONS_CANONIQUES.md` (sujet 6), `docs/PHASE_02_TENANT_ISOLATION_SPEC.md`, `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (blocs UC01/UC03/UC10/UC20), `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (§NC-02, ligne 537), `docs/PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md`, `docs/PHASE_06_DECISIONS_A_VALIDER.md` (§3, `PositionRole`), `docs/PHASE_10_ACCESS_SECURITY.md`, `docs/PHASE_10_DECISIONS_A_VALIDER.md`, `docs/AUDIT_PHASE_01.md` (C-09), `docs/FIX_TENANT_APP_SINGLE_TENANT.md`, `docs/P0_TENANTS_AUDIT.md`, `docs/P0_TENANTS_FINAL_REPORT.md` (§9 point 2), `docs/P0_USERS_AUDIT.md`, `docs/P0_USERS_IMPLEMENTATION_REPORT.md`. Code : `src/mocks/rbac.mocks.ts`, `src/services/{role,user,tenant-scope}.service.ts` (et `.ts`), `src/contexts/{permission,tenant}-context.tsx`, `src/components/permission-gate.tsx`, `src/routes/{permission-route,app-router,auth-guard}.tsx`, `src/features/access/{access-module.tsx,components/permission-matrix.tsx}`, `src/mocks/organization/members.ts` (pour `PositionRole`), `src/services/role.service.test.ts`, `src/components/permission-gate.test.tsx`, `src/app/providers.tsx`.

---

## 21. Checklist de conformité

- [x] Aucun fichier `src/`/`app/`/`tests/`/`package.json` modifié, créé, déplacé ou supprimé.
- [x] Aucune permission, rôle, politique de sécurité inventée.
- [x] `roles`/`users_roles`/`permissions`/`role_permissions` non implémentés.
- [x] `PermissionContext`/`TenantContext` non modifiés.
- [x] `users`/`tenants` non rouverts (D1/D2/D3 de `users` non remises en cause).
- [x] `tanzen-commercial` non modifié (lecture non effectuée dans cette mission au-delà de ce qui était déjà cité par des documents antérieurs — aucune nouvelle inspection de son code).
- [x] Aucune décision arbitrée à la place du Product Owner.
- [x] Le risque de sécurité le plus notable (§15, escalade de privilège via appel direct au service) est **documenté**, pas corrigé.

---

## 22. Vérification finale — aucune modification

```
git status --short -- src/ app/ tests/ package.json
```
exécuté avant et après cette mission : **identique**, seuls les fichiers déjà modifiés par la mission `users` précédente (non touchés à nouveau ici) apparaissent. Aucun fichier `src/`/`app/`/`tests/` nouveau ou modifié par cette mission. Seuls `docs/P0_RBAC_AUDIT.md` (ce document) et `docs/P0_RBAC_DECISIONS_A_VALIDER.md` sont nouveaux.

---

*Fin de l'audit. Voir `docs/P0_RBAC_DECISIONS_A_VALIDER.md` pour les décisions D1/D2/D3, les seules nouvelles de cette mission.*
