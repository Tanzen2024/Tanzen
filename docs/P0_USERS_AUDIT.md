# TANZEN FRONTEND — P0 USERS — Audit et analyse GO/NO-GO

**Statut : audit, strictement lecture seule.** Aucun fichier de `src/`, `package.json`, mock, service, route ou test n'a été modifié, créé, déplacé ou supprimé pour produire ce document. Périmètre : `tanzen-frontend` exclusivement (lecture ponctuelle de `tanzen-commercial`/`tanzen-mobile` pour les sections Doublons/Contradictions, sans aucune modification là non plus). `roles`, `users_roles`, `permissions`, `role_permissions` ne sont **pas** implémentés ni corrigés ici — seules leurs dépendances avec `users` sont analysées.

---

## RÉSOLUTION (2026-08-16) — D1/D2/D3 validées et implémentées

Les trois décisions ouvertes par cet audit (§8/§22, `P0_USERS_DECISIONS_A_VALIDER.md`) ont été validées par le Product Owner et implémentées dans une mission séparée. Voir `docs/P0_USERS_IMPLEMENTATION_REPORT.md` pour le détail complet (fichiers modifiés, tests, Playwright). Résumé :

- **D1** (§8, §5, §9 — SECURITY_RISK le plus critique de cet audit) : Option (a) retenue — alignement strict sur `FIX_TENANT_APP_SINGLE_TENANT.md`, exactement comme `P0_TENANTS_FINAL_REPORT.md` l'a fait pour le registre des tenants. `userService.list/get/update/listByRole` et `sessionService.list/revoke` continuent d'accepter un paramètre `scope` (capacité de service conservée, testée, mais non exercée), mais tous les appels réels dans `access-module.tsx` passent désormais littéralement `'tenant'`, jamais `currentUser.scope`. La fuite cross-tenant décrite en §5/§8/§9 est donc fermée pour l'identité mockée par défaut (`role-admin`, `scope: platform`) comme pour tout autre scope. Défense supplémentaire ajoutée côté service (§9) : `userService.update()` ignore désormais silencieusement toute tentative de réassignation de `tenantId`/`tenantName` dans le patch.
- **D2** (§6, C-USERS-05) : Option retenue — alignement partiel sur `tanzen-mobile` : `authService.login()` retourne désormais honnêtement `{ ok: false, error: 'BACKEND_PENDING' }` (jamais un faux succès), tout en conservant l'établissement de la session locale de démonstration pour ne pas rendre l'application inaccessible (exception explicitement autorisée par le mandat de cette mission). `LoginPage` affiche désormais un bandeau explicite indiquant que l'authentification réelle n'est pas disponible.
- **D3** (§12 DM1, C-USERS-08) : Option retenue — alignement sur le modèle canonique. `SystemUser.status` (enum 4 valeurs) est remplacé par `SystemUser.isActive: boolean`. Les anciennes valeurs `suspended`/`invited` (sans fondement canonique, §12) sont mappées à `isActive: false` dans les mocks. Cela résout aussi de facto le point 🟡 PARTIEL de la matrice §22 (« Réactiver depuis `invited`/`suspended` ») : il n'existe plus que deux états, `true`/`false`, avec les deux transitions déjà couvertes par le code.

Les points restés hors périmètre de cet audit (NC-01/comptes plateforme, profil self-service UC20-08/09, CRUD Rôles/Permissions, `mfa.manage`) restent non résolus et non traités par cette mission — voir le rapport d'implémentation, section "NON IMPLÉMENTÉ".

---

## 0. Constat central (à lire en premier)

Le module `users` (Access & Security) est **le plus richement implémenté** de tout l'audit précédent (`COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` l'avait classé `IMPLEMENTED` pour la feuille `permissions`/`role_permissions`, `PARTIALLY_IMPLEMENTED` pour `users_roles`, `DECISION_REQUIRED` pour `users`/`roles`) — CRUD complet (hors suppression, jamais demandée par les UCs), MFA en lecture, sessions avec révocation, matrice de permissions, garde anti-élévation de privilège déjà vérifiée (Phase 10). **Mais l'audit de cette mission révèle un écart de sécurité concret et actif dans l'état livré du projet**, distinct de tout ce que Phase 10 avait testé : `userService`/`sessionService`/`roleService` traitent `scope === 'platform'` comme un blanc-seing qui **contourne entièrement l'isolation tenant** pour tout ce qui touche aux comptes système — et l'unique utilisateur mocké de l'application (`role-admin`, résolu `scope: 'platform'`) porte justement ce scope par défaut. Ce n'est pas une régression de cette session : c'est un choix architectural de Phase 10, documenté et testé à l'époque *pour un utilisateur réellement tenant-scoped* — mais jamais réconcilié avec la règle plus récente et plus générale de `FIX_TENANT_APP_SINGLE_TENANT.md` ni avec le travail de finalisation `tenants` de ce même P0 (`P0_TENANTS_AUDIT.md`/`_FINAL_REPORT.md`), qui a déjà traité un problème de même nature pour le registre des tenants. Voir §8 pour le détail complet.

---

## 1. Inspection du code — inventaire des fichiers concernés

| Fichier | Rôle |
|---|---|
| `src/services/auth.service.ts` | Session locale (`localStorage`), aucune authentification réelle |
| `src/services/user.service.ts` | `list/get/listByRole/create/update` — pas de `delete` |
| `src/services/session.service.ts` | `list/listByUser/revoke` |
| `src/services/role.service.ts` | `listRoles/getRole/listPermissions/listUsersForRole` (lecture seule) |
| `src/services/tenant-scope.ts` | `getTenantScoped()` — isolation partagée par tous les services ci-dessus |
| `src/mocks/rbac.mocks.ts` | `SystemRole`, `PlatformScope`, `CurrentUser`, `permissionCatalog`, `systemRoles`, `currentUser` (hardcodé) |
| `src/mocks/access/users.ts` | `SystemUser`, `UserStatus`, MFA types, 12 utilisateurs seed sur 5 tenants |
| `src/mocks/access/sessions.ts` | `UserSession`, 12 sessions seed |
| `src/contexts/permission-context.tsx` | `usePermissions()` → `{ user: currentUser, can }` |
| `src/contexts/tenant-context.tsx` | Résolution du tenant courant (revue en détail dans `P0_TENANTS_AUDIT.md`, non re-décrite ici) |
| `src/routes/auth-guard.tsx` | Garde de session (`authService.isAuthenticated()`) |
| `src/routes/permission-route.tsx` | Garde de page par permission (`can(permission)`) |
| `src/features/auth/login-page.tsx` | Formulaire de connexion — voir §6 |
| `src/features/access/access-module.tsx` | UsersList/UserCreate/UserEdit/UserDetail/RolesList/RoleDetail/PermissionsPage/SessionsPage/MfaPage (426 lignes) |
| `src/layouts/shell-header.tsx` | Bouton « Se déconnecter » (`authService.logout()`, cf. `FIX_LOGOUT_TENANT_APP.md`) |

Aucun fichier `users`/`auth`/`session` supplémentaire trouvé sous `hooks/`, `types/`, `layouts/` (au-delà de `shell-header.tsx`) après recherche exhaustive des motifs demandés (`user`, `auth`, `session`, `login`, `logout`, `signin`, `signup`, `PermissionGate`, `PermissionRoute`, `TenantContext`, `TenantSwitcher`, `tenantId`, `scope`, `role`, `users.*`).

---

## 2. Inventaire des fonctionnalités

| Fonctionnalité | Existe ? | Réellement fonctionnelle ? | Couche | Backend requis | Décision |
|---|---|---|---|---|---|
| Login (formulaire) | Oui (`LoginPage`) | **Non — décorative** (§6) : email/mot de passe saisis mais jamais transmis à `authService.login()`, qui ne prend aucun argument | TENANT (mais `authService`/`SESSION_KEY` transverse) | Oui | BACKEND_PENDING |
| Logout | Oui | Oui, réellement (`FIX_LOGOUT_TENANT_APP.md`, déjà vérifié en direct) | Transverse | Non (juste `localStorage`) | — |
| Restauration de session | Oui | Oui — `isAuthenticated()` relit `localStorage` à chaque appel, survit à un rechargement | Transverse | Non | — |
| Expiration de session | **Non** | — | — | Oui | BACKEND_PENDING |
| Résolution serveur de l'utilisateur au login | **Non** | — | — | Oui | BACKEND_PENDING (§6) |
| Création utilisateur | Oui (`UserCreate`) | Oui — appelle réellement `userService.create`, persiste dans le tableau mock | TENANT | Non (mock) | — |
| Lecture utilisateur (liste/détail) | Oui | Oui, **mais fuite cross-tenant en scope platform** (§8) | TENANT (+PLATFORM) | Non (mock) | Voir §8 |
| Modification utilisateur | Oui (`UserEdit`) | Oui — `userService.update`, **même fuite** (§8) | TENANT (+PLATFORM) | Non (mock) | Voir §8 |
| Désactivation utilisateur | Oui (`UserDetail`) | Oui — bascule `status` | TENANT | Non (mock) | — |
| Réactivation utilisateur | Oui (même bouton) | Oui, mais seulement `active⇄inactive` — `invited`/`suspended` n'ont aucune transition définie (§13) | TENANT | Non (mock) | DECISION_REQUIRED |
| Suppression utilisateur | **Non** (aucun UC ne la demande — cf. §17, seuls désactiver/réactiver sont `Confirmé`) | — | — | — | HORS_PÉRIMÈTRE (conforme aux sources) |
| Affectation de rôle | Oui (`RolePicker` dans `UserCreate`/`UserEdit`) | Oui, avec garde anti-élévation de privilège déjà vérifiée (Phase 10 §10/§13) | TENANT | Non (mock) | — |
| Changement de rôle | Oui (même formulaire, édition) | Oui | TENANT | Non (mock) | — |
| Gestion tenant (assignation d'un utilisateur à un tenant) | Oui (select dans le formulaire) | Oui pour la création ; **techniquement possible pour la modification si le scope platform est actif** (§8, §12) | TENANT | Non (mock) | Voir §8 |
| Gestion scope (`PlatformScope`) | Oui (`resolveScope()`) | Oui — calculé depuis les rôles assignés à `currentUser`, jamais modifiable via l'UI | Transverse | Non | — |
| Accès aux données utilisateur (RBAC) | Oui (`PermissionRoute`/`PermissionGate`) | Oui | Transverse | Non | — |
| Profil utilisateur (consultation/modification) | Consultation : oui (`ProfileTab`). **Modification de son propre profil (UC20-08) : absente** — seul un tiers autorisé (`users.update`) peut modifier un utilisateur via `UserEdit`, aucun flux "mon profil" séparé | TENANT | Non (mock) | MODEL_GAP (§14) |

---

## 3. Authentification — point critique (mandat §6)

| Question | Réponse |
|---|---|
| A. Authentification réelle ? | **Non.** `authService.login()` ne prend aucun paramètre, ne vérifie aucun identifiant. |
| B. Backend ? | **Non**, confirmé — aucun appel réseau nulle part dans `auth.service.ts`/`user.service.ts` (uniquement `mockRequest`, une latence artificielle en `setTimeout`). |
| C. Endpoint login ? | **Non.** |
| D. Endpoint logout ? | **Non** (mais `logout()` fonctionne réellement en local, cf. `FIX_LOGOUT_TENANT_APP.md`). |
| E. Session persistante ? | **Locale uniquement** — un drapeau `localStorage['tanzen-session'] = 'active'`, aucune donnée de session (utilisateur, tenant, rôles) réellement stockée : `currentUser` reste une constante de module indépendante de cette clé. |
| F. Access token ? | **Non.** |
| G. Refresh token ? | **Non.** |
| H. Expiration ? | **Non.** |
| I. Révocation (de la session d'authentification elle-même, pas des `UserSession` listées dans Access & Security) ? | **Non** — seul `logout()` supprime le drapeau, aucune expiration ni révocation à distance. |
| J. Résolution serveur du tenant ? | **Non** — `TenantContext` résout localement depuis `currentUser.tenantId`, une constante. |
| K. Résolution serveur des rôles ? | **Non** — `currentUser.roleIds` est une constante de `rbac.mocks.ts`. |
| L. Résolution serveur des permissions ? | **Non** — `resolveScope()`/`permissions` sont calculés localement au chargement du module, une seule fois, jamais recalculés depuis un serveur. |

**Classification : BACKEND_PENDING pour l'intégralité de l'authentification.** Aucun élément ci-dessus ne doit être classé `IMPLEMENTED`. Conforme à `FINAL_ARCHITECTURE_DECISIONS_A_VALIDER.md` point 1 (déjà `BLOQUANT`, non retranché ici) — cet audit confirme et détaille ce constat au niveau du code, sans le rouvrir.

---

## 4. Login et résolution du tenant (mandat §7)

Flux cible :
```
Utilisateur → Login → Authentification → Résolution utilisateur → Résolution tenant → Résolution RBAC → Tenant Application
```

Flux réel observé dans le code :
```
Visiteur (identité non vérifiée)
   → LoginPage (email/mot de passe saisis, capturés en state local, JAMAIS lus par authService.login())
   → authService.login() : pose un drapeau localStorage, sans paramètre, sans lookup
   → navigate('/dashboard')
   → AuthGuard : vérifie uniquement authService.isAuthenticated() (le drapeau)
   → TenantContext / PermissionContext : résolvent depuis `currentUser` (mocks/rbac.mocks.ts),
     une CONSTANTE DE MODULE fixée à la compilation (U-001, Amadou Mbaye, T-001, role-admin) —
     totalement indépendante de ce qui a été saisi dans le formulaire de connexion.
```

**Conclusion : le flux cible n'existe pas.** Il n'y a ni authentification, ni résolution d'utilisateur, ni résolution de tenant, ni résolution RBAC déclenchée par le login — seule une garde binaire « session locale active ou non » existe. Quel que soit l'email/mot de passe saisi (y compris invalide ou vide après le premier caractère requis par `required`), l'application démarre systématiquement en tant qu'Amadou Mbaye (`role-admin`, `T-001`). **Aucune des interdictions du §7 du mandat n'est violée par construction** (pas de `tenantId` libre dans l'URL, pas de `tenantId` fourni au login, pas de sélection de tenant dans le Tenant App — cf. `P0_TENANTS_AUDIT.md`) — mais uniquement parce qu'aucune vraie résolution n'existe du tout, pas parce qu'une résolution sécurisée a été implémentée. Comparé à `FIX_TENANT_APP_SINGLE_TENANT.md` : cette spec porte sur le `TenantSwitcher`/Platform Administration (déjà conforme, revérifié), pas sur le flux de login lui-même — pas de contradiction, simplement un périmètre distinct.

---

## 5. Tenant isolation appliquée à `users` (mandat §8)

### 5.1 Mécanisme en place

`getTenantScoped(items, matches, tenantId, requesterScope)` (`tenant-scope.ts`) :
```ts
if (requesterScope === 'platform') return item;              // ← AUCUNE vérification de tenantId
return item.tenantId === tenantId ? item : undefined;
```

Ce mécanisme est **partagé** par `organizationService` (registre des tenants, déjà audité dans `P0_TENANTS_AUDIT.md`) et par `userService`/`sessionService`. Le commentaire de `user.service.ts` le confirme explicitement : *« Access & Security est une console d'administration transverse : la portée inter-tenant... dépend du scope »* — un choix **délibéré**, documenté dans `PHASE_10_ACCESS_SECURITY.md` §1 : *« `requesterScope === 'platform'` ne contourne l'isolation QUE pour les répertoires transverses (Tenants, Users) ; jamais les données métier d'un tenant »*.

### 5.2 Call sites audités

| Fonction | Appel avec `scope` non forcé | Effet si `currentUser.scope === 'platform'` (cas par défaut de l'app) |
|---|---|---|
| `userService.list(tenantId, scope)` | `UsersList`, `RolesList`, `MfaPage` (`currentUser.scope`) | Liste **les 12 utilisateurs des 5 tenants**, pas seulement ceux du tenant courant |
| `userService.get(tenantId, userId, scope)` | `UserDetail`, `UserEdit` (`currentUser.scope`) | Un `userId` de **n'importe quel tenant** est résolu avec succès — pas de 404 |
| `userService.update(tenantId, userId, patch, scope)` | `UserEdit` (`mutationFn`), `UserDetail` (désactiver/réactiver) | La mise à jour **s'applique** à un utilisateur d'un autre tenant que `currentTenant` |
| `userService.listByRole(roleId, tenantId, scope)` | `RoleDetail` (`currentUser.scope`) | Liste cross-tenant des porteurs d'un rôle |
| `sessionService.list(tenantId, scope)` | `SessionsPage` (`currentUser.scope`) | Liste **les 12 sessions des 5 tenants** |
| `sessionService.revoke(tenantId, sessionId, scope)` | `SessionsPage`, `UserSessionsTab` (`currentUser.scope`) | Révocation possible sur une session d'un autre tenant |

### 5.3 Vérification empirique (lecture de code, sans exécution — cohérente avec les données seed)

- `currentUser` (`rbac.mocks.ts`) = `{ id: 'U-001', tenantId: 'T-001', roleIds: ['role-admin'] }`, `resolveScope(['role-admin'])` → `'platform'` (car `role-admin.scope === 'platform'`). **C'est l'unique identité que l'application peut incarner** (§4) — il n'existe aucun moyen, via l'UI, de devenir un utilisateur `scope: 'tenant'`.
- `users` mock contient `U-004` (Tontine Horizon, T-002), `U-006` (Mutuelle Teranga, T-003), etc. — 8 des 12 utilisateurs appartiennent à un tenant **différent** de `T-001`.
- Avec `scope: 'platform'` fixe et permanent : `UsersList` retourne les 12 lignes (confirmé par lecture directe de `userService.list`, aucune condition ne peut produire un résultat filtré tant que `currentUser.scope` reste `'platform'`) ; `UserDetail`/`UserEdit` sur `/access-security/users/U-004` retournent `U-004` sans erreur (confirmé par lecture directe de `getTenantScoped`, la branche `platform` est inconditionnelle).

### 5.4 Classification

**SECURITY_RISK.** Cette mission classe ce point `NO-GO` pour tout déploiement en l'état, avec les nuances suivantes, nécessaires pour ne pas mésinterpréter le constat :

- Ce n'est **pas un bug de régression** de cette session — c'est un comportement conçu et testé (`PHASE_10_ACCESS_SECURITY.md` §13) pour un utilisateur **réellement** `scope: 'tenant'` (bascule temporaire manuelle du mock, restaurée après test).
- Le risque devient **actif et permanent** uniquement parce que l'unique identité que l'application peut incarner aujourd'hui est `scope: 'platform'` (§5.3) — un artefact du mode démo (`rbac.mocks.ts` : *« Rattaché à role-admin pour ne pas masquer les écrans déjà construits »*), pas une preuve que l'isolation échouerait pour un vrai utilisateur tenant-scoped.
- Le même schéma (`scope`-based bypass sur un « répertoire transverse ») a déjà été jugé **inacceptable** pour le registre des tenants dans `P0_TENANTS_AUDIT.md` (E1) et corrigé dans `P0_TENANTS_FINAL_REPORT.md` — sans qu'`userService`/`sessionService`/`roleService` (le même motif, sur un domaine différent) n'aient été touchés, puisque explicitement hors périmètre de cette mission précédente (voir `P0_TENANTS_FINAL_REPORT.md` §4 et §9 point 1, qui annonce exactement cet audit).

**Voir §8 pour la contradiction architecturale sous-jacente et §22 pour la matrice GO/NO-GO.**

---

## 6. RBAC (mandat §9) — inventaire, aucune modification

| Permission | Utilisée par | Statut |
|---|---|---|
| `users.read` | `PermissionRoute` sur `/access-security/*` (garde de module) | Utilisée |
| `users.create` | `PermissionGate` sur le bouton « Créer un utilisateur » (`UsersList`) | Utilisée |
| `users.update` | `PermissionGate` sur Modifier/Désactiver/Réactiver (`UserDetail`) | Utilisée |
| `users.delete` | — | **Inutilisée** — cohérent avec l'absence de UC « Supprimer un utilisateur » (seuls désactiver/réactiver sont `Confirmé`, §17) ; pas une lacune, une réserve non requise |
| `sessions.read` | Aucune garde dédiée trouvée — `/access-security/sessions` n'hérite que de la garde de module `users.read` | **Inutilisée en tant que garde propre** |
| `sessions.revoke` | `PermissionGate` sur le bouton « Révoquer » (`SessionsTable`) | Utilisée |
| `mfa.read` | Aucune garde trouvée — `MfaPage` n'hérite que de `users.read` | **Inutilisée** |
| `mfa.manage` | Aucune garde trouvée — apparaît uniquement comme libellé d'événement dans `mocks/audit/audit-events.ts` | **Inutilisée**, déjà `DECISION_REQUIRED` dans `PHASE_10_DECISIONS_A_VALIDER.md` §3 — non rouverte ici |

**Garde positive déjà en place, revérifiée** : `RolePicker` (`access-module.tsx:96`) — `assignable = roles.filter(role => currentUserScope === 'platform' || role.scope === 'tenant')` — un utilisateur `scope: 'tenant'` ne peut ni s'auto-accorder ni accorder à un tiers un rôle `scope: 'platform'`. Ce garde-fou fonctionne indépendamment du problème décrit en §5 (qui porte sur la *lecture/modification* d'un utilisateur d'un autre tenant, pas sur l'élévation de son propre rôle).

Aucune permission manquante identifiée pour les UCs `Confirmé` de la section 20 (§17) au-delà de ce qui est déjà noté ci-dessus.

---

## 7. Platform scope vs Tenant scope dans `users` (mandat §10)

Revérifié conforme à `FIX_TENANT_APP_SINGLE_TENANT.md` pour les éléments qu'il couvre explicitement (TenantSwitcher statique, aucun bouton Platform Administration, `/platform/*` absent du routeur — cf. `P0_TENANTS_AUDIT.md` §2). **Non couvert par ce document** (portée explicitement limitée au header et à `TenantContext`, cf. `FIX_TENANT_APP_SINGLE_TENANT.md` §3 « fichiers inspectés mais non modifiés ») : le comportement des services `userService`/`sessionService`/`roleService` eux-mêmes, qui est précisément l'objet du §5/§8 de cet audit.

---

## 8. Contradiction architecturale centrale

| | |
|---|---|
| **Source A** | `PHASE_10_ACCESS_SECURITY.md` §1 (implémentation réelle, phase de sécurité) : Access & Security est une « console d'administration transverse » — un utilisateur `scope: 'platform'` voit et administre légitimement les utilisateurs/sessions de tous les tenants, **par conception**, au même titre que le registre des tenants. |
| **Source B** | `FIX_TENANT_APP_SINGLE_TENANT.md` (plus récent, 2026-08-16) : *« l'Application Tenant ne doit jamais permettre... à AUCUN utilisateur, y compris platform-scoped, de changer de tenant ou d'administrer des données d'un autre tenant depuis l'Application Tenant elle-même »* (§13, "conséquence fonctionnelle assumée"). Ce document a retiré la capacité de bascule de tenant précisément parce qu'un utilisateur `platform`-scoped ne devait plus pouvoir « prévisualiser/administrer les données métier (Settings, Finance, Members…) d'un tenant différent directement depuis l'Application Tenant ». |
| **Source C** | `P0_TENANTS_AUDIT.md`/`P0_TENANTS_FINAL_REPORT.md` (cette session, le plus récent) : applique explicitement le principe de la Source B au registre des tenants (`organizationService.listTenants`), en forçant `'tenant'` partout dans `tanzen-frontend`, quel que soit `user.scope` — et signale explicitement (Final Report §4, §9 point 1) que le même motif existe encore dans `userService.list`, **hors périmètre de cette mission-là, à traiter dans le futur P0 `users`** — c'est-à-dire celui-ci. |
| **Priorité applicable** | Selon la règle du mandat (« une décision récente et explicitement validée prévaut sur une ancienne documentation contradictoire »), la Source B/C (plus récente, plus générale, déjà appliquée à un domaine analogue) l'emporte en esprit sur la Source A — **mais** la Source A reste la seule à avoir explicitement et nommément statué sur le cas `users`/`sessions`, et cette décision n'a jamais été formellement révoquée pour ce domaine précis. |
| **Conséquence** | Il ne s'agit pas d'un choix technique trivial : la Source A a une justification fonctionnelle réelle (un opérateur plateforme légitime pourrait avoir besoin de gérer les comptes système à travers les tenants, un besoin différent de « voir les données métier d'un tenant »). Trancher dans un sens ou l'autre sans décision explicite reviendrait à choisir arbitrairement entre deux architectures de sécurité valables. **DECISION_REQUIRED — voir `P0_USERS_DECISIONS_A_VALIDER.md` D1.** |

---

## 9. `tenant_id` non modifiable — vérification (mandat §12)

Le mandat exige : *« `tenant_id` ne doit pas être modifiable depuis le Tenant Application. Un utilisateur tenant-scoped ne doit jamais pouvoir déplacer un utilisateur vers un autre tenant. »*

- **Défense actuellement en place** : uniquement au niveau UI — le select "Tenant" de `UserCreate`/`UserEdit` n'affiche que le tenant courant depuis la correction `P0_TENANTS` (E1, `docs/P0_TENANTS_FINAL_REPORT.md`).
- **Aucune défense au niveau service** : `userService.update()` n'a aucune vérification empêchant `patch.tenantId` de différer du `tenantId` réel de la ressource — `Object.assign(user, patch)` appliquerait silencieusement un changement de tenant s'il était soumis.
- **Combiné au constat §5** : un utilisateur `scope: 'platform'` naviguant vers `/access-security/users/U-004/edit` (U-004 appartient à T-002, alors que `currentTenant` reste T-001) charge le formulaire avec `existing.tenantId = 'T-002'`, mais le select ne propose que « T-001 » comme unique option (depuis la correction `P0_TENANTS`) — un scénario concret où une interaction avec ce champ pourrait faire basculer silencieusement `U-004` de T-002 vers T-001.
- **Classification** : SECURITY_RISK, même famille que §5, **NO-GO** pour toute mise en production tant que non résolu — mais résolution non triviale : elle dépend directement de l'arbitrage D1 (§8), pas d'une simple correction locale.

---

## 10. Users ↔ Members (mandat §14)

**Aucune relation canonique.** Confirmé par trois sources convergentes, aucune n'inventée pour cet audit :
- Dictionnaire Excel, feuille `users` (§ ci-dessous) : pas de colonne `member_id`.
- `PHASE_02_DECISIONS_CANONIQUES.md` (schéma `users` cité verbatim dans les investigations Mobile antérieures) : mêmes 16 colonnes, pas de `member_id`.
- `src/mocks/organization/members.ts` (`Member`) : pas de colonne `user_id`, confirmé par grep direct.
- Déjà documenté in extenso comme **D-4B-01** (`tanzen-mobile/docs/MOBILE_PHASE_04B_MEMBERS_DECISIONS_A_VALIDER.md`) — non redérivé ici, seulement confirmé applicable côté Web également.

**Impact sur `users`** : `ProfileTab` (« Consulter son profil », UC20-07) affiche les champs de `SystemUser` (nom, email, tenant, statut, dernière connexion) — **pas** ceux d'un `Member`. C'est une lecture défendable de UC20-07/08/09 en l'absence de FK (un « profil utilisateur système » plutôt qu'un « profil membre »), mais c'est une hypothèse implicite du code, jamais confirmée par une source — à documenter, pas à corriger.

**MODEL_GAP confirmé, non nouveau** — référencé dans `P0_USERS_DECISIONS_A_VALIDER.md` par renvoi, pas dupliqué.

---

## 11. Users ↔ Roles (dépendance, sans implémenter `users_roles`)

- **Relation actuelle** : `SystemUser.roleIds: string[]` — un tableau simple, pas de table de jonction `users_roles` distincte avec ses propres métadonnées (date d'affectation, affecté par qui). Cardinalité de fait : many-to-many (un utilisateur peut avoir plusieurs `roleIds, un rôle peut être porté par plusieurs utilisateurs — confirmé par les données seed, ex. `role-manager` porté par U-002, U-004, U-006, U-009).
- **Conformité canonique** : `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6 verrouille le RBAC dynamique (`roles`/`permissions`/`role_permissions`/`users_roles`) comme modèle cible et interdit explicitement toute colonne `USERS.role` unique — le code actuel (`roleIds: string[]`, pas de colonne `role`) est **cohérent avec cette décision**, même sans table `users_roles` matérialisée séparément (le tableau `roleIds` en est une représentation dénormalisée acceptable côté mock, pas une violation).
- **Dépendance pour le futur audit RBAC** : toute implémentation future de `users_roles` comme entité propre (avec `tenant_id`, date d'affectation, etc., cf. `PHASE_02_DECISIONS_A_VALIDER.md` §8) devra décider si elle migre `roleIds` vers une table de jonction ou l'enrichit sur place — non tranché ici, hors périmètre.

---

## 12. Data model — divergences (mandat §16)

| # | Champ/Aspect | Source | Valeur | Source prioritaire | Action |
|---|---|---|---|---|---|
| DM1 | Statut utilisateur | Code (`UserStatus`) | `'active' \| 'inactive' \| 'suspended' \| 'invited'` (4 valeurs, avec transitions UI limitées à `active⇄inactive`, cf. §13) | — | — |
| | | Dictionnaire Excel (feuille `users`) | `is_active BOOLEAN DEFAULT TRUE` (un booléen simple, pas d'enum) | — | — |
| | | `PHASE_02_DECISIONS_CANONIQUES.md` (schéma canonique `users`, sujet non renuméroté ici mais cité verbatim en Mobile) | Même booléen `is_active`, pas d'enum | **Modèle canonique (priorité 2) et dictionnaire (priorité 6) concordent entre eux et divergent du code (priorité 5)** | DECISION_REQUIRED — `suspended`/`invited` n'ont aucune représentation dans le modèle canonique ; à trancher : le code élabore-t-il légitimement `is_active` en 4 états, ou le modèle canonique doit-il être complété ? |
| DM2 | `tenant_id` sur `users` | Code (`SystemUser.tenantId`) | Toujours renseigné (aucun utilisateur sans tenant dans les mocks) | — | — |
| | | Dictionnaire Excel | `tenant_id BIGINT FK → tenants.id, NOT NULL` | — | — |
| | | Diagrammes de classes (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, NC-01) | Cardinalité `TENANTS 1..* USERS`, `NOT NULL` visible | **Toutes les sources (2, 4, 5, 6) concordent : `tenant_id` est strictement obligatoire** | Confirme et clôt la vérification laissée ouverte par `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` ligne 609 (« vérifier la fiche `users`... non vérifié dans cette mission ») — **le dictionnaire ne détend pas la contrainte : NC-01 reste entièrement non résolu.** Aucune classe `PlatformUser` n'existe nulle part pour porter les comptes plateforme sans tenant (UC01-11 à UC01-14). DECISION_REQUIRED, déjà signalé, non retranché ici, seulement confirmé avec une source supplémentaire. |
| DM3 | Colonnes MFA (`mfaStatus`, `mfaMethod`, `mfaDevices`, `recoveryCodesRemaining`) | Code (`SystemUser`) | Présentes, riches (4 champs imbriqués) | — | — |
| | | Dictionnaire Excel, feuille `users` | **Absentes** — aucune colonne MFA sur la table `users` canonique | Implémentation (5) au-delà du dictionnaire (6) | Non bloquant (le dictionnaire, priorité la plus basse, ne force pas un retrait) — mais à noter : le MFA est une extension du frontend sans ancrage dans le modèle de données canonique actuel, cohérent avec le constat déjà fait par `PHASE_10_ACCESS_SECURITY.md` §20 (« pas de classe séparée créée, cohérent avec le modèle déjà imbriqué ») |
| DM4 | `password` | Dictionnaire Excel | `password VARCHAR(255) NOT NULL` (bcrypt/argon2) | — | — |
| | | Code | **Absent** — `UserInput`/`UserFormFields` n'ont aucun champ mot de passe | Cohérent avec la règle anti-invention (`PHASE_10_ACCESS_SECURITY.md` §2 : « Aucun champ mot de passe ») | Pas une divergence à corriger — un champ mot de passe frontend sans backend réel serait une fausse sécurité ; correctement absent |
| DM5 | `preferred_language` | Dictionnaire Excel | Colonne sur `users` | — | — |
| | | Code | Absent de `SystemUser` — la langue est gérée par `LocaleContext`, indépendant de l'utilisateur | Implémentation actuelle diverge du dictionnaire (priorité la plus basse) | Non bloquant, simple absence de persistance par utilisateur (actuellement une préférence globale de session, pas par compte) |

---

## 13. Use Cases (mandat §17)

Extraits de `PHASE_04_USE_CASE_CLASSIFICATION.md`, blocs UC01 (Platform, comptes admin), UC03 (transverse, auth self-service), UC10 (Tenant, gouvernance des accès), UC20 (Access & Security détaillé).

| UC | Nom | Acteur | Contexte | Tenant-scoped | Permission | Statut Web réel | Backend | Décision | Classification |
|---|---|---|---|---|---|---|---|---|---|
| UC01-11 | Créer un administrateur plateforme | Super Administrateur | PLATFORM | N/A (sans tenant) | — | Non implémenté (pas d'acteur Super Admin distinct) | Oui | NC-01 | 🔴 MODEL_GAP |
| UC01-12 | Modifier un administrateur | Super Administrateur | PLATFORM | N/A | — | Non implémenté | Oui | NC-01 | 🔴 MODEL_GAP |
| UC01-13 | Désactiver un administrateur | Super Administrateur | PLATFORM | N/A | — | Non implémenté | Oui | NC-01 | 🔴 MODEL_GAP |
| UC01-14 | Réinitialiser un mot de passe | Super Administrateur | PLATFORM | N/A | — | Non implémenté | Oui | Auth réelle | 🔵 BACKEND_PENDING |
| UC03-03 | Réinitialiser le mot de passe | Utilisateur | PUBLIC/SAAS | Transverse | — | Non implémenté | Oui | Auth réelle | 🔵 BACKEND_PENDING |
| UC03-04 | Se déconnecter | Utilisateur | Transversal | Transverse | — | **Implémenté et vérifié** (`FIX_LOGOUT_TENANT_APP.md`) | Non | — | 🟢 IMPLEMENTABLE (déjà fait) |
| UC03-05 | Changer le mot de passe | Utilisateur | Transversal | Transverse | — | Non implémenté (pas de champ mot de passe) | Oui | Auth réelle | 🔵 BACKEND_PENDING |
| UC03-06 | Gérer les sessions | Utilisateur | Transversal | PLATFORM+TENANT | `sessions.read/revoke` | Implémenté, **mais fuite cross-tenant en scope platform** | Non (mock) | D1 (§8) | 🟠 DECISION_REQUIRED |
| UC10-06 | Gérer les utilisateurs | Admin Tenant | TENANT | Oui | `users.*` | Implémenté, **fuite cross-tenant** | Non (mock) | D1 (§8) | 🟠 DECISION_REQUIRED |
| UC10-07 | Gérer les rôles et permissions | Admin Tenant | TENANT | Oui (`«include»`) | — | Lecture seule implémentée ; CRUD non implémenté | Non (mock) | Déjà `À valider` (C-09) | ⚪ HORS_PÉRIMÈTRE (P0 séparé) |
| UC20-01 | Se connecter | Utilisateur | PUBLIC/SAAS | Transverse | — | **Formulaire présent, non fonctionnel** (§4/§6) | Oui | Auth réelle | 🔵 BACKEND_PENDING |
| UC20-02/03 | Gérer sessions / vérifier autorisations | Utilisateur | Transversal | Transverse | — | `can()` implémenté (vérif° locale) ; sessions cf. UC03-06 | Non pour `can()` local ; Oui pour une vraie vérif° serveur | D1 | 🟡 PARTIEL |
| UC20-04 | Changer le mot de passe | Utilisateur | Transversal | Transverse | — | Non implémenté | Oui | Auth réelle | 🔵 BACKEND_PENDING |
| UC20-05 | Se déconnecter | Utilisateur | Transversal | Transverse | — | Implémenté | Non | — | 🟢 IMPLEMENTABLE (déjà fait) |
| UC20-06 | Réinitialiser le mot de passe | Utilisateur | PUBLIC/SAAS | Transverse | — | Non implémenté | Oui | Auth réelle | 🔵 BACKEND_PENDING |
| UC20-07 | Consulter son profil | Utilisateur | TENANT | Oui | `users.read` | Implémenté **comme profil SystemUser, pas Member** (§10) | Non (mock) | MODEL_GAP D-4B-01 | 🟡 PARTIEL |
| UC20-08 | Modifier son profil | Utilisateur | TENANT | Oui | `users.update` | **Non implémenté** — pas de flux "mon profil", seul `UserEdit` (par un tiers autorisé) existe | Non (mock) | — | 🔴 NON_IMPLÉMENTÉ |
| UC20-09 | Téléverser une photo | Utilisateur | TENANT | Oui | `users.update` | **Non implémenté** — `SystemUser` n'a aucun champ photo/avatar (avatars actuels = initiales générées) | Non pour le champ ; Oui pour un stockage de fichier réel | — | 🔵 BACKEND_PENDING (stockage) |
| UC20-10 | Créer un utilisateur | Administrateur Tenant | TENANT | Oui | `users.create` | **Implémenté** | Non (mock) | — | 🟢 IMPLEMENTABLE (déjà fait) |
| UC20-11 | Modifier un utilisateur | Administrateur Tenant | TENANT | Oui | `users.update` | Implémenté, **fuite cross-tenant** | Non (mock) | D1 (§8) | 🟠 DECISION_REQUIRED |
| UC20-12 | Désactiver un utilisateur | Administrateur Tenant | TENANT | Oui | `users.update` | Implémenté | Non (mock) | — | 🟢 IMPLEMENTABLE (déjà fait) |
| UC20-13 | Réactiver un utilisateur | Administrateur Tenant | TENANT | Oui | `users.update` | Implémenté **uniquement pour `inactive→active`** — `invited`/`suspended` non couverts (§14 mandat) | Non (mock) | Transition non documentée | 🟡 PARTIEL |
| UC20-14 | Consulter un utilisateur | Administrateur Tenant | TENANT | Oui | `users.read` | Implémenté, **fuite cross-tenant** | Non (mock) | D1 (§8) | 🟠 DECISION_REQUIRED |
| UC20-15 à 18 | Rôles CRUD | Administrateur Tenant, Super Admin | Transversal | — | — | Non implémenté, déjà `À valider` (C-09) | Non (mock) | Déjà signalé, non retranché | ⚪ HORS_PÉRIMÈTRE (P0 séparé) |
| UC20-19 à 22 | Permissions CRUD | Super Administrateur | PLATFORM | — | — | Non implémenté, déjà `BLOQUANT` (PHASE_10) | Non (mock) mais modifierait une constante partagée | Déjà signalé, non retranché | ⚪ HORS_PÉRIMÈTRE (P0 séparé) |

**Total UCs analysés dans ce tableau : 26.**

---

## 14. Commercial vs Tenant — couche propriétaire (mandat §18)

| Fonctionnalité | Couche | Vérifié comment |
|---|---|---|
| Gestion des utilisateurs d'un tenant (`UserCreate`/`Edit`/`Detail`, désactivation) | **TENANT** | `access-module.tsx` n'existe que dans `tanzen-frontend` ; confirmé absent de `tanzen-commercial` (grep, §15) |
| Comptes administrateurs plateforme (UC01-11 à 14) | **COMMERCIAL/PLATFORM** (cible), **non implémenté nulle part** | Aucune trace dans `tanzen-commercial` non plus — cohérent avec NC-01 (aucun modèle pour les porter) |
| Authentification (login/logout/session) | **Transverse/backend** (cible) ; actuellement dupliquée en deux implémentations locales indépendantes | `tanzen-frontend/src/services/auth.service.ts` (drapeau `localStorage`) vs `tanzen-commercial` (aucun `authService` trouvé — pas de garde de session équivalente, cf. §15) |
| RBAC (fondation `SystemRole`/`Permission`/`currentUser`) | **Dupliquée intentionnellement** (déjà actée, cf. `COMMERCIAL_TENANT_SEPARATION.md`) | `rbac.mocks.ts` présent dans les deux projets, contenu voisin mais géré indépendamment |
| Sessions (`UserSession`, révocation) | **TENANT** uniquement | Absent de `tanzen-commercial` |
| MFA | **TENANT** uniquement | Absent de `tanzen-commercial` |

**Conclusion : aucune récupération d'une responsabilité Commercial par `tanzen-frontend` détectée pour `users`** — le sens de fuite constaté (§5/§8) est interne à `tanzen-frontend` (cross-tenant au sein de l'app Tenant elle-même), pas une invasion du périmètre Commercial.

---

## 15. Doublons (mandat §19)

| Élément | tanzen-frontend | tanzen-commercial | tanzen-mobile | Classification |
|---|---|---|---|---|
| `rbac.mocks.ts` (`SystemRole`, `PlatformScope`, `CurrentUser`, `permissionCatalog`, `currentUser`) | Oui | Oui (fichier distinct, contenu voisin) | Non (mobile a son propre `permission-context.tsx` qui consomme un `currentUser` importé d'ailleurs, non vérifié en détail — hors périmètre de cet audit) | **INTENTIONAL DUPLICATION** — déjà actée dans `COMMERCIAL_TENANT_SEPARATION.md`, non remise en cause |
| `permission-context.tsx` (`usePermissions`, `can()`) | Oui | Oui | Oui (mobile) | **SHARED CONCEPT** — même contrat (`currentUser.permissions.includes(permission)`), trois implémentations indépendantes, cohérent avec l'absence de monorepo |
| `tenant-context.tsx` | Oui | Oui (portée différente : registre complet côté Platform) | Non vérifié en détail (hors périmètre) | **SHARED CONCEPT** |
| `access-module.tsx` (Users/Roles/Permissions/Sessions/MFA CRUD) | Oui | **Absent** | **Absent** | Pas un doublon — fonctionnalité TENANT-only, cohérent avec §14 |
| `authService` (session locale) | Oui — `login()` **simule toujours un succès** sans vérifier quoi que ce soit | **Absent** (aucun équivalent trouvé) | Oui — `authService.login()` **refuse toujours explicitement** (`{ok: false, error: "BACKEND PENDING"}`), ne simule jamais de succès | **CONFLICT** — voir contradiction dédiée, §16 C-USERS-05 |

---

## 16. Contradictions (mandat §20, les 12 points demandés)

| # | Sujet | Source A | Source B | Priorité | Conséquence | Décision |
|---|---|---|---|---|---|---|
| C-USERS-01 | `users.tenant_id` | Code (`SystemUser.tenantId` toujours renseigné) | Excel + PHASE_02 canonique + diagrammes classes (NC-01) : `NOT NULL` sans échappatoire pour un compte plateforme | Sources 2/4/6 concordent, code (5) suit | NC-01 non résolu, confirmé (§12 DM2) | Déjà signalé PHASE_05 ; non retranché |
| C-USERS-02 | Platform user (compte sans tenant) | UC01-11 à 14 : Super Administrateur existe, sans tenant | Aucune classe `PlatformUser` nulle part (docs, code, dictionnaire) | — | Ces 4 UCs restent structurellement non implémentables | NC-01, déjà signalé |
| C-USERS-03 | Tenant user (isolation attendue) | `PHASE_02_TENANT_ISOLATION_SPEC.md` §1 : isolation stricte pour tout utilisateur tenant-scoped | Code : conforme **uniquement** pour `scope: 'tenant'` réel (jamais atteignable via l'UI actuelle, §5.3) | Spec (2) prévaut | Isolation correcte en théorie, non vérifiable en pratique avec l'identité mockée actuelle | Aucune (constat) |
| C-USERS-04 | `SystemRole` vs `PositionRole` | `rbac.mocks.ts` : distinction stricte documentée | Code : jamais confondus, confirmé par grep (aucun usage croisé) | — | Aucune contradiction réelle — conformité confirmée | Aucune |
| C-USERS-05 | Authentication (philosophie `BACKEND_PENDING`) | `tanzen-frontend` : `authService.login()` simule toujours un succès (§4) | `tanzen-mobile` : `authService.login()` refuse toujours explicitement (« BACKEND PENDING : aucune API... ») | Mobile est chronologiquement postérieur (Phase 2 Mobile) et plus conservateur | Les deux « Tenant Application » (mandat §2) gèrent différemment la même contrainte — l'une crée une fausse impression de session active, l'autre non | **DECISION_REQUIRED — voir P0_USERS_DECISIONS_A_VALIDER.md D2** |
| C-USERS-06 | Tenant resolution | Mandat §7 : le tenant doit venir de la session/backend après authentification | Code : aucune session réelle n'existe, donc aucune résolution n'a jamais lieu — la règle n'est ni respectée ni violée, elle est structurellement non applicable | — | Confirme BACKEND_PENDING (§3) | Aucune nouvelle |
| C-USERS-07 | User/Member relation | UCX1-05/18 supposent un compte membre self-service | Aucune FK `users↔members` nulle part (§10) | — | UCX1-05/18 non implémentables tels quels | D-4B-01, déjà signalé (Mobile), confirmé Web |
| C-USERS-08 | User status | Code : enum 4 valeurs | Canonique + Excel : booléen `is_active` | Canonique (2) > implémentation (5) | `suspended`/`invited` sans fondement canonique | **DECISION_REQUIRED — D3** |
| C-USERS-09 | User role assignment | `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6 : RBAC dynamique canonique, pas de colonne `role` unique | Code : `roleIds: string[]`, pas de colonne `role` | Concordant | Aucune contradiction | Aucune |
| C-USERS-10 | User creation | UC20-10 (Confirmé, TENANT, `Administrateur Tenant`) | Code : `UserCreate` accessible sans distinction Admin Tenant vs Admin Platform au-delà de `users.create` | Mineure | Cohérent avec l'absence de rôle "Admin Tenant" distinct dans le modèle actuel (seul `role-admin` scope `platform` existe, `P0_TENANTS_AUDIT.md` l'a déjà noté indirectement) | Aucune nouvelle — rattachée à D1 |
| C-USERS-11 | Tenant administration (Access & Security comme "console transverse") | `PHASE_10_ACCESS_SECURITY.md` (implémentation validée à l'époque) | `FIX_TENANT_APP_SINGLE_TENANT.md` + `P0_TENANTS_*` (plus récents, principe général plus strict) | Ambigu — voir §8 | **Contradiction architecturale centrale de cet audit** | **D1, la plus importante des décisions requises** |
| C-USERS-12 | `tenant_id` modifiable | Mandat §12 : ne doit jamais être modifiable depuis le Tenant App | Code : aucune garde service-side, uniquement une garde UI (§9) | Mandat (règle explicite de cette mission) > état actuel du code | SECURITY_RISK potentiel, dépendant de D1 | Rattachée à D1 |

---

## 17. Backend Pending — liste exhaustive pour `users` (mandat §21)

Login réel · vérification d'identifiants (email + mot de passe) · session serveur (token, expiration, révocation) · refresh token · résolution serveur du tenant/rôles/permissions au login · réinitialisation de mot de passe (UC03-03, UC20-06) · changement de mot de passe (UC03-05, UC20-04) · téléversement de photo de profil avec stockage réel (UC20-09) · comptes administrateurs plateforme (UC01-11 à 14, bloqué de toute façon par NC-01) · persistance réelle de `UserSession`/révocation à distance d'une session active sur un autre appareil · audit/journalisation serveur des événements de sécurité (renvoyé à Phase 11, non re-traité ici).

Aucun de ces éléments n'a été simulé ou construit dans cette mission (ni dans aucune mission antérieure au-delà des drapeaux locaux déjà documentés).

---

## 18. Ordre d'implémentation futur proposé (mandat §23 — proposition, non exécutée)

1. **P0.1 — Résolution D1** (§8) : Access & Security doit-elle rester une console transverse pour `scope: platform`, ou s'aligner strictement sur `FIX_TENANT_APP_SINGLE_TENANT.md` ? Bloque toute correction de sécurité ultérieure sur ce module — sans cette décision, corriger `userService`/`sessionService` reviendrait à trancher arbitrairement entre deux architectures documentées.
2. **P0.2 — Application de D1** : une fois tranché, aligner `userService.list/get/update/listByRole`, `sessionService.list/revoke`, `roleService.listUsersForRole` en conséquence (soit forcer `'tenant'` comme `P0_TENANTS` l'a fait pour le registre, soit documenter précisément le périmètre légitime du bypass `platform`).
3. **P0.3 — NC-01** (comptes plateforme sans tenant) : préalable identifié de longue date (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`) à toute architecture d'authentification réelle — modéliser `PlatformUser` ou rendre `tenant_id` nullable, decision produit avant tout travail d'auth réelle.
4. **P0.4 — Architecture d'authentification réelle** (dépend de P0.3) : mécanisme (§3), une fois choisi, permettra de résoudre C-USERS-05/06 et de faire fonctionner le formulaire de login (§4/§6).
5. **P0.5 — Statut utilisateur** (D3, §12 DM1) : réconcilier `UserStatus` (4 valeurs) avec le modèle canonique (`is_active` booléen) — inclut de documenter la transition `invited→active` manquante.
6. **P0.6 — Intégration RBAC** (dépend de l'audit RBAC séparé, `roles`/`permissions`/`role_permissions`/`users_roles`) : cardinalité définitive, éventuelle table de jonction dédiée.

*Ordre dérivé de l'analyse ci-dessus (dépendances explicites), pas d'une préférence arbitraire — P0.1 est premier car c'est la seule décision qui, une fois prise, débloque une correction de sécurité concrète sans dépendre d'aucune autre.*

---

## 19. Priorités / Backups (glossaire des UCs — mandat §17, légende)

🟢 IMPLEMENTABLE (déjà fait, aucune action) · 🟡 PARTIEL · 🔴 NON_IMPLÉMENTÉ / MODEL_GAP · 🟠 DECISION_REQUIRED · 🔵 BACKEND_PENDING · ⚪ HORS_PÉRIMÈTRE.

---

## 20. Sources consultées

`PHASE_02_MODELE_CANONIQUE_FINAL.md`, `PHASE_02_DECISIONS_CANONIQUES.md` (sujets 6, 7), `PHASE_02_DECISIONS_A_VALIDER.md` (sujet 8), `PHASE_02_TENANT_ISOLATION_SPEC.md`, `PHASE_04_USE_CASE_CLASSIFICATION.md` (blocs UC01/UC03/UC10/UC20), `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (NC-01/NC-02, §10), `PHASE_10_ACCESS_SECURITY.md`, `PHASE_10_DECISIONS_A_VALIDER.md`, `FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md`, `FINAL_ARCHITECTURE_DECISIONS_A_VALIDER.md`, `FIX_TENANT_APP_SINGLE_TENANT.md`, `FIX_LOGOUT_TENANT_APP.md`, `P0_TENANTS_AUDIT.md`, `P0_TENANTS_FINAL_REPORT.md`, `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md`, `COMPLETE_DATA_DICTIONARY_EXECUTIVE_SUMMARY.md`, `docs/audit/excel_dictionary_dump.txt` (feuille `users`), `tanzen-mobile/docs/MOBILE_PHASE_04B_MEMBERS_DECISIONS_A_VALIDER.md`. Code : tous les fichiers listés en §1, plus lecture ciblée de `tanzen-commercial/src/{contexts,mocks}` et `tanzen-mobile/src/auth/auth-service.ts` pour les sections Doublons/Contradictions.

---

## 21. Checklist de conformité (avant de conclure)

- [x] Aucun fichier `src/` modifié, créé, déplacé ou supprimé.
- [x] Aucun mock, service, route, test modifié.
- [x] Aucune permission, rôle, politique de sécurité inventée.
- [x] `roles`/`users_roles`/`permissions`/`role_permissions` non implémentés (seulement leurs dépendances analysées).
- [x] Aucune décision arbitrée à la place du Product Owner — toute divergence documentée avec sources et priorité, jamais tranchée.
- [x] Le problème de sécurité le plus critique (§5/§8/§9) est **documenté**, pas corrigé.
- [x] `tanzen-commercial`/`tanzen-mobile` consultés en lecture seule uniquement, aucune modification.

---

## 22. GO / NO-GO — matrice finale

| UC / Fonctionnalité | Statut | GO/NO-GO | Couche | Backend | Décision | Justification |
|---|---|---|---|---|---|---|
| UC20-05 / Logout | IMPLEMENTED | 🟢 **GO** (déjà fait) | Transverse | Non | — | Déjà implémenté et vérifié (`FIX_LOGOUT_TENANT_APP.md`) |
| UC20-10 / Créer un utilisateur (au sein du tenant courant) | IMPLEMENTED | 🟢 **GO** (déjà fait) | TENANT | Non | — | Fonctionne, tenant forcé par `P0_TENANTS` (E1) pour la liste de tenants proposée |
| UC20-12/13 / Désactiver-Réactiver (`active⇄inactive` uniquement) | IMPLEMENTED | 🟢 **GO** (déjà fait) | TENANT | Non | — | Fonctionne pour les 2 valeurs couvertes |
| UC20-13 / Réactiver depuis `invited`/`suspended` | NON_IMPLÉMENTÉ | 🟠 **NO-GO — DECISION REQUIRED** | TENANT | Non | Transition non documentée | Ne pas inventer une règle de transition (mandat §13) |
| UC20-11/14, UC10-06, UC03-06 / Lire-modifier un utilisateur ou une session (scope platform) | IMPLEMENTED **avec fuite** | 🔴 **NO-GO — SECURITY_RISK** | TENANT+PLATFORM | Non (mock) | **D1** | Cross-tenant read/write actif par défaut (§5, §8, §9) |
| `tenant_id` modification sur `users.update` | Non gardé au niveau service | 🔴 **NO-GO — SECURITY_RISK** | TENANT | Non | **D1** | Aucune défense service-side (§9) |
| UC20-08/09 / Modifier son profil, photo | NON_IMPLÉMENTÉ | 🟠 **NO-GO — DECISION REQUIRED / MODEL_GAP** | TENANT | Photo : oui | D-4B-01 (relation User/Member) | Dépend de savoir ce qu'est "son profil" sans FK Member |
| UC20-01/04/06, UC03-03/05 / Authentification réelle | BACKEND_PENDING | 🔵 **NO-GO — BACKEND PENDING** | Transverse | Oui | Mécanisme d'auth (déjà `BLOQUANT`) | Aucun backend, ne pas inventer (mandat §6) |
| UC01-11 à 14 / Comptes plateforme | MODEL_GAP | 🔴 **NO-GO — MODEL GAP** | PLATFORM | Oui | **NC-01** | Aucune classe `PlatformUser`, `tenant_id NOT NULL` partout |
| UC10-07, UC20-15 à 22 / Rôles, Permissions CRUD | BLOCKED | ⚪ **HORS PÉRIMÈTRE** | — | — | Déjà `BLOQUANT` (Phase 10) | P0 séparé, non traité ici |
| `mfa.manage` | DECISION_REQUIRED | 🟠 **NO-GO — DECISION REQUIRED** | TENANT | Non | Déjà signalé (Phase 10 §3) | Non retranché |
| Auto-désactivation d'un compte | DECISION_REQUIRED | 🟠 **NO-GO — DECISION REQUIRED** | TENANT | Non | Déjà signalé (Phase 10 §4) | Non retranché |

### 🟢 GO
Rien de nouveau à implémenter sans décision — tout ce qui est `GO` est **déjà livré et fonctionnel** (Logout, Create/Deactivate/Reactivate pour les statuts `active`/`inactive`).

### 🟠 NO-GO — DECISION REQUIRED
Réactivation depuis `invited`/`suspended` · Profil self-service (UC20-08/09) · `mfa.manage` (déjà signalé) · Auto-désactivation (déjà signalé) · **D1 (architecture Access & Security transverse vs single-tenant strict)** · **D2 (philosophie `authService.login()` Web vs Mobile)** · **D3 (statut utilisateur : enum vs booléen canonique)**.

### 🔵 NO-GO — BACKEND PENDING
Authentification réelle complète (login, mot de passe, sessions serveur, réinitialisation) · téléversement de photo de profil.

### 🔴 NO-GO — MODEL GAP / SECURITY RISK
**NC-01** (comptes plateforme sans tenant, bloque UC01-11 à 14) · **Fuite cross-tenant `users`/`sessions`/`roles-by-user` en scope platform (§5, §8, §9) — le point le plus critique de cet audit, à traiter en priorité dès que D1 sera tranchée.**

---

*Fin de l'audit. Voir `docs/P0_USERS_DECISIONS_A_VALIDER.md` pour les décisions D1/D2/D3, les seules nouvelles de cette mission.*
