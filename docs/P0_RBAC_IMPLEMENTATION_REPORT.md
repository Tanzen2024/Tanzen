# TANZEN FRONTEND — P0 RBAC — Rapport d'implémentation

**Statut : implémenté, testé, vérifié en direct.** Périmètre respecté : `tanzen-frontend` exclusivement. `tanzen-commercial` et `tanzen-mobile` non modifiés (confirmé par `git status`, voir §14). Voir `docs/P0_RBAC_AUDIT.md` (audit read-only), `docs/P0_RBAC_DECISION_ANALYSIS.md`/`docs/P0_RBAC_DECISION_OPTIONS.md` (analyse décisionnelle) pour le contexte complet précédant cette mission.

---

## 1. Décisions D1/D2/D3

| # | Décision | Verrouillage appliqué |
|---|---|---|
| D1 | Portée des rôles | **Tenant-scopé** — `SystemRole.tenantId` ; chaque tenant possède sa propre instance des rôles, jamais partagée. |
| D2 | Lieu d'administration | **`tanzen-frontend`**, strictement limité au tenant courant — aucun CRUD Roles dans `tanzen-commercial` dans cette mission. |
| D3 | User ↔ Role | **Tenant-scopé, vérifié service-side** — `user.tenantId === role.tenantId === currentTenantId`, refusé sinon, y compris pour un appel direct au service contournant l'UI. |

## 2. État avant

`SystemRole` était une configuration globale à 3 entrées (`role-admin`/`role-manager`/`role-viewer`), sans `tenantId`, partagée par les 5 tenants du jeu de données — confirmé contraire au modèle canonique (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2, vérification directe du dictionnaire Excel citée dans `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6). `role.service.ts` n'exposait que 4 fonctions en lecture seule (`listRoles`, `getRole`, `listPermissions`, `listUsersForRole`), sans CRUD. `userService.update({ roleIds })` n'effectuait aucune validation de cohérence tenant sur les rôles soumis.

## 3. État après

`SystemRole` porte désormais `tenantId` — 15 rôles au total (5 tenants × 3 rôles de base), générés à partir d'un `roleTemplates` unique pour éviter toute duplication de logique. `role.service.ts` expose un CRUD complet (`listRoles`, `getRole`, `listPermissions`, `listUsersForRole`, `create`, `update`, `delete`), tous strictement tenant-scopés, sans aucun paramètre `scope`/bypass. `userService.create`/`update` refusent désormais explicitement toute soumission de `roleIds` contenant un rôle d'un autre tenant. L'UI expose la création/modification/suppression de rôles dans `/access-security/roles`.

## 4. Architecture retenue

- **Génération des rôles par tenant** : `mocks/rbac.mocks.ts` — `roleTemplates` (3 gabarits) × `tenants` (5 tenants, réutilisés depuis `mocks/organization/tenants.ts`, déjà existant) = `systemRoles` (15 entrées). T-001 conserve les identifiants historiques sans suffixe (`role-admin`, `role-manager`, `role-viewer`) pour ne pas casser les nombreux tests/mocks déjà écrits contre ces chaînes littérales (`currentUser.roleIds`, `permission-gate.test.tsx`, `user.service.test.ts`, `audit-events.ts`) ; les autres tenants reçoivent un identifiant suffixé (`role-admin-T-002`, etc.) — un choix d'identifiant opaque, sans signification attachée à la présence du suffixe.
- **`role.service.ts`** : réutilise `getTenantScoped()` (`tenant-scope.ts`, déjà existant, aucune nouvelle fonction d'isolation créée) pour `getRole`/`update`/`delete`. Contrairement à `userService`/`sessionService` (qui conservent un paramètre `scope` hérité de D1 `users`, jamais exercé par l'UI, conservé pour compatibilité avec les tests existants), les fonctions de `role.service.ts` n'acceptent **aucun** paramètre `scope` — le mandat de cette mission (§6/§10) est explicite : le CRUD de rôles ne doit avoir strictement aucune capacité cross-tenant, y compris latente.
- **`userService` (D3)** : nouvelle fonction interne `rolesBelongToTenant(roleIds, tenantId)`, appelée par `create()` et `update()` — un seul `roleId` hors tenant dans le tableau soumis refuse l'opération entière (retourne `undefined`), jamais un filtrage silencieux.
- **UI** : `RoleCreate`/`RoleEdit` réutilisent exactement le pattern déjà établi par `UserCreate`/`UserEdit` (`FormSection`, `useMockMutation`, `validateXForm`) — aucune architecture UI parallèle. `PermissionPicker` (nouveau, éditable) réutilise `groupByModule`/`MODULE_KEY`/`ACTION_KEY`/`splitPermission`, déjà exportés par `permission-matrix.tsx` (composant `PermissionMatrix`, lecture seule) — la matrice de permissions n'existe qu'en un seul endroit sous deux modes de rendu (lecture/édition), pas deux implémentations distinctes.

## 5. Fichiers créés

Aucun fichier nouveau côté `src/` — toute l'implémentation étend des fichiers déjà existants (`role.service.ts`, `access-module.tsx`, `rbac.mocks.ts`), conformément à la règle « pas de doublon » du mandat. Documentation : `docs/P0_RBAC_IMPLEMENTATION_REPORT.md` (ce document).

## 6. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/mocks/rbac.mocks.ts` | `SystemRole.tenantId` ajouté. `systemRoles` (3 entrées statiques) remplacé par une génération `tenants.flatMap(...)` (15 entrées, `roleTemplates` factorisé). Description de `role-admin` corrigée (ne prétend plus une « visibilité inter-tenant » qui n'existe plus). Import de `tenants` (`mocks/organization/tenants.ts`) ajouté — aucun cycle d'import créé (`tenants.ts` n'a aucune dépendance). Commentaires de `PlatformScope`/`SystemRole` réécrits pour refléter D1. |
| `src/mocks/access/users.ts` | `roleIds` des 8 utilisateurs de T-002 à T-005 mis à jour vers l'identifiant de rôle suffixé de leur propre tenant (ex. `role-manager` → `role-manager-T-002` pour un utilisateur T-002) — les utilisateurs T-001 restent inchangés (identifiants non suffixés). |
| `src/services/role.service.ts` | Réécriture complète : `listRoles(tenantId)`, `getRole(tenantId, roleId)` (via `getTenantScoped`), `listUsersForRole(roleId, tenantId)` (scope retiré), + 3 nouvelles fonctions `create`/`update`/`delete`, toutes tenant-scopées, aucun paramètre `scope`. |
| `src/services/user.service.ts` | Ajout de `rolesBelongToTenant()` (D3) ; `create()`/`update()` refusent désormais un `roleIds` contenant un rôle d'un autre tenant. |
| `src/features/access/access-module.tsx` | `useRoles()` désormais tenant-scopé (`roleService.listRoles(currentTenant.id)`). Nouveaux composants `PermissionPicker`, `RoleFormFields`, `validateRoleForm`, `RoleCreate`, `RoleEdit`. `RolesList` : bouton « Ajouter un rôle » (`roles.create`). `RoleDetail` : boutons Modifier (`roles.update`)/Supprimer (`roles.delete`) + `ConfirmDialog` + gestion du refus de suppression (rôle encore assigné). `UserCreate` : gestion du refus de création (D3) sans faux succès. 2 nouvelles routes (`roles/create`, `roles/:id/edit`). |
| `src/locales/en/index.ts`, `src/locales/fr/index.ts` | 8 nouvelles clés (`createRole`, `editRole`, `deleteRole`, `deleteRoleConfirm`, `roleCreated`, `roleUpdated`, `roleDeleted`, `roleDeleteBlocked`), parité FR/EN. |
| `src/services/role.service.test.ts` | Réécriture complète : tests CRUD, tenant isolation (T-001 vs T-002), intégrité référentielle (suppression d'un rôle assigné refusée). |
| `src/services/user.service.test.ts` | 2 nouveaux tests D3 (création/modification refusée avec un `roleId` d'un autre tenant) ; 4 tests existants adaptés au type `SystemUser \| null` de retour. |

Aucun fichier supprimé. `src/contexts/permission-context.tsx`, `src/contexts/tenant-context.tsx`, `src/components/permission-gate.tsx`, `src/routes/{app-router,permission-route,auth-guard}.tsx` : inspectés, non modifiés (déjà conformes — `PermissionGate`/`can()` fonctionnent sans changement avec les nouvelles permissions `roles.create/update/delete`, déjà présentes dans le catalogue avant cette mission, jamais consommées jusqu'ici).

## 7. Tenant isolation

`role.service.ts` n'accepte aucun `tenantId` autre que celui transmis explicitement par l'appelant (`currentTenant.id`, résolu par `TenantContext`, jamais un champ de formulaire). Vérifié :
- Par les tests service-level (`role.service.test.ts`) : T-001 ne voit que ses 3 rôles de base, jamais ceux de T-002 (`listRoles`) ; `getRole`/`update`/`delete` sur un rôle de T-002 depuis T-001 refusés (`null`) ; un test explicite confirme qu'aucun paramètre `scope` n'existe pour contourner cette isolation, même avec `currentUser.scope === 'platform'`.
- Par le nouveau test D3 (`user.service.test.ts`) : `userService.update('T-001', userId, { roleIds: ['role-viewer-T-002'] })` refusé (`null`), exactement le scénario interdit cité par le mandat.
- En direct (Playwright, §11) : navigation directe vers `/access-security/roles/role-admin-T-002` depuis une session T-001 ne révèle aucune donnée ; la liste des rôles ne contient jamais d'identifiant `-T-002`.

## 8. RBAC

Aucune nouvelle permission créée. `roles.read`/`roles.create`/`roles.update`/`roles.delete` — présentes dans le catalogue (`mocks/rbac.mocks.ts`) depuis Phase 10 mais jamais consommées jusqu'à cette mission — gardent désormais respectivement la lecture (héritée de `users.read` au niveau route, inchangé), le bouton « Ajouter un rôle », le bouton « Modifier », le bouton « Supprimer ». Cascade naturelle sans modification du catalogue : `role-admin` (toutes permissions) peut tout faire ; `role-manager` (toutes sauf `.delete`/`.approve`) peut créer/modifier mais pas supprimer ; `role-viewer` (`.read` uniquement) ne peut que consulter.

## 9. User ↔ Role

`RolePicker` (UI, inchangé dans sa logique) ne peut désormais physiquement afficher que les rôles du tenant courant, puisque `useRoles()` les filtre en amont — aucun rôle d'un autre tenant n'est même proposable à l'écran. `userService.create`/`update` (service, nouveau) refusent indépendamment toute soumission contenant un `roleId` hors tenant, protégeant contre un appel direct au service qui contournerait `RolePicker`. Testé aux deux niveaux (voir §12).

## 10. Role ↔ Permission

`SystemRole.permissions: Permission[]` reste une représentation dénormalisée (pas de table `role_permissions` séparée) — décision héritée de l'audit précédent (`docs/P0_RBAC_AUDIT.md` §6), non remise en cause par cette mission (le mandat de cette mission porte sur D1/D2/D3, pas sur la structure de `role_permissions`). `permissions` reste un catalogue global, non tenant-scopé, conforme au modèle canonique — `PermissionPicker` (nouveau, éditable) et `PermissionMatrix` (existant, lecture seule) lisent tous deux `permissionCatalog` directement, jamais une liste inventée.

## 11. Tests

| Commande | Avant | Après |
|---|---|---|
| `npm run typecheck` | 0 erreur | 0 erreur |
| `npm run lint` | 0 erreur, 14 warnings pré-existants | 0 erreur, 14 warnings pré-existants (inchangés) |
| `npm run test` | 149/149 | 149/149 (12 tests nouveaux/adaptés dans `role.service.test.ts` + `user.service.test.ts`, net +12 par rapport à la baseline Users) |
| `npm run i18n:check` | 2/2 | 2/2 |
| `npm run build` | succès | succès (chunk principal 896,86 kB, avertissement pré-existant sans rapport) |

**Playwright (validation live)** — serveur de dev lancé, script Chromium contre `http://localhost:5184`, session par défaut (`role-admin`, T-001). **12/12 checks PASS** :

| # | Test | Résultat |
|---|---|---|
| 1 | Liste des rôles affiche les 3 rôles de T-001 | PASS |
| 1b | Bouton « Ajouter un rôle » présent (`roles.create`) | PASS |
| 2 | Création d'un rôle → fiche détail affiche le nom | PASS |
| 2b | Navigation vers l'URL du rôle créé (`role-custom-T-001-4`) | PASS |
| 3 | Modification du rôle → renommage persisté | PASS |
| 4 | Suppression d'un rôle inutilisé → retour à la liste | PASS |
| 4b | Rôle supprimé n'apparaît plus dans la liste | PASS |
| 5 | Suppression d'un rôle encore assigné (`role-admin`) → refusée avec message, pas de suppression silencieuse | PASS |
| 6 | URL directe vers un rôle T-002 depuis une session T-001 → aucune donnée révélée | PASS |
| 7 | Liste des rôles ne fuite aucun identifiant `-T-002` | PASS |
| 8 | Sélecteur de rôles (Créer un utilisateur) n'affiche que les rôles du tenant courant | PASS |
| — | Aucune erreur JS non interceptée pendant tout le parcours | PASS |

Script de vérification exécuté puis supprimé après usage (fichier temporaire, non versionné).

## 12. Résultats détaillés typecheck/lint/build

Voir tableau §11. Aucune régression sur les modules déjà `TERMINÉ` (`users`, `tenants`) — non rouverts, non modifiés au-delà des deux points strictement nécessaires à D3 (`user.service.ts`) documentés en §6.

## 13. BACKEND_PENDING

Persistance réelle de toute écriture RBAC (création/modification/suppression de rôle, affectation) · résolution serveur des rôles/permissions · validation serveur de `user.tenantId === role.tenantId` (la validation ajoutée en §9 reste une aide frontend, jamais l'autorité de sécurité finale) · prévention définitive de l'escalade de privilège · audit serveur des opérations RBAC. Aucun de ces éléments n'a été simulé ou construit dans cette mission — `mockRequest` reste la seule couche de persistance (en mémoire, perdue au rechargement), comme pour tout le reste du projet.

## 14. Vérification finale — aucune modification hors périmètre

```
git status --short
```
`tanzen-frontend` : 17 fichiers modifiés (listés §6), 1 fichier de documentation nouveau (ce rapport) — aucun autre fichier de `docs/` de cette mission au-delà de ce qui existait déjà (`P0_RBAC_AUDIT.md`, `P0_RBAC_DECISION_ANALYSIS.md`, `P0_RBAC_DECISION_OPTIONS.md`, `P0_RBAC_DECISIONS_A_VALIDER.md`, produits par les missions read-only précédentes, non retouchés ici).

`tanzen-commercial` : `git status --short` retourne une sortie vide — **aucune modification**, conforme au mandat §16.

`tanzen-mobile` : modifications présentes, mais **aucune n'a été effectuée par cette mission** — confirmé par comparaison directe : ces fichiers (`006_positions.ts`, `position-repository.ts`, etc.) existaient déjà avant que cette mission P0 RBAC ne commence (ils proviennent d'une mission distincte, interrompue avant toute écriture, sur le périmètre Mobile Positions — cette session n'y a effectué que de la lecture). Conforme au mandat §17 (« ne pas modifier tanzen-mobile »).

## 15. Points restant éventuellement ouverts

- **Description de `role-admin`** corrigée pour ne plus prétendre une portée inter-tenant — un choix éditorial mineur, pas une décision produit nouvelle.
- **Suppression d'un rôle encore assigné** : bloquée par une garde d'intégrité référentielle ajoutée par cette mission (non demandée explicitement par le mandat mot pour mot, mais nécessaire pour ne jamais laisser un `SystemUser.roleIds` pointer vers un rôle inexistant — documentée comme choix d'implémentation, pas une règle métier inventée).
- **`role_permissions`/`users_roles` comme entités de jonction propres** : non traitées par cette mission (hors périmètre D1/D2/D3 tel que mandaté — `SystemRole.permissions`/`SystemUser.roleIds` restent des représentations dénormalisées, déjà actées comme acceptables par `docs/P0_RBAC_AUDIT.md` §6/§7).
- **Auto-suppression du dernier rôle admin d'un tenant** : aucune garde spécifique ajoutée (même famille de risque que l'auto-désactivation déjà signalée, non bloquante, `PHASE_10_DECISIONS_A_VALIDER.md` §4) — non couverte par D1/D2/D3, non traitée ici.

---

**P0 RBAC — IMPLÉMENTATION TERMINÉE.**
