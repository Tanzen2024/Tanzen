# TANZEN FRONTEND — P0 RBAC — Correctif sécurité service-side : `role.scope`

**Statut : implémenté, testé, vérifié en direct.** Périmètre strictement respecté : `tanzen-frontend` uniquement. D1 (= B, rôles tenant-scopés), D2 (= A, CRUD Roles dans `tanzen-frontend`) et D3 (= tenant-scopé) restent verrouillées, non rouvertes. D-RBAC-01 (`permissions.action`) n'a pas été traité dans cette mission.

---

## 1. Problème identifié

`docs/P0_RBAC_REMAINING_AUDIT.md` §20 (C-RBAC-12) avait signalé, par lecture directe du code livré par le P0 RBAC, que la garde service-side ajoutée pour D3 (`rolesBelongToTenant`, `user.service.ts`) ne vérifiait que la cohérence tenant (`role.tenantId === tenantId`), jamais `role.scope`. Un acteur `scope: 'tenant'` pouvait donc, via un appel direct à `userService.create`/`userService.update` (contournant `RolePicker`), s'auto-affecter — ou affecter à un tiers — un rôle `scope: 'platform'` (ex. `role-admin`) **de son propre tenant**, sans qu'aucune garde service-side ne s'y oppose.

## 2. Cause

La garde anti-élévation de privilège n'a toujours existé que dans `RolePicker` (`access-module.tsx`) : `assignable = roles.filter((role) => currentUserScope === 'platform' || role.scope === 'tenant')`. Le P0 RBAC (mission précédente) a ajouté une vérification service-side pour le **tenant** (D3) mais n'a pas répliqué la vérification de **scope** — un oubli de portée, pas une régression volontaire ni un choix architectural.

## 3. Flux avant correction

```
UI (RolePicker)                          Service (userService.create/update)
  filtre l'affichage par role.scope   →   ne vérifie QUE role.tenantId
  (currentUserScope === 'platform'         (rolesBelongToTenant)
   || role.scope === 'tenant')
                                           AUCUNE vérification de role.scope
```

Un appel direct au service (hors `RolePicker`) contournait donc entièrement la garde d'élévation.

## 4. Règle de sécurité appliquée

Réplication exacte, côté service, de la règle déjà appliquée par `RolePicker` — **aucune nouvelle politique inventée** :

- Acteur `scope: 'platform'` → peut affecter n'importe quel rôle de son tenant (tenant ou platform).
- Acteur `scope: 'tenant'` → ne peut affecter que des rôles `scope: 'tenant'`, même au sein de son propre tenant.

La règle de tenant (D3, déjà correcte) reste intacte et inchangée : un rôle d'un autre tenant est toujours refusé, indépendamment du scope de l'acteur.

## 5. Flux après correction

```
UI (RolePicker)                          Service (userService.create/update)
  filtre l'affichage par role.scope   →   rolesBelongToTenant(roleIds, tenantId)
  (inchangé, redondant avec le              ET
   service désormais, pas remplacé)       rolesWithinActorScope(roleIds, tenantId, actorScope)
                                           — même règle que RolePicker, appliquée ici aussi
```

`rolesWithinActorScope(roleIds, tenantId, actorScope)` : si `actorScope === 'platform'`, autorise tout ; sinon, exige que **chaque** rôle soumis ait `scope === 'tenant'` dans le tenant courant. Refus de l'opération entière (retour `undefined`, jamais un filtrage silencieux) si une seule entrée du tableau échoue — même sémantique que `rolesBelongToTenant`.

## 6. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/services/user.service.ts` | Nouvelle fonction `rolesWithinActorScope(roleIds, tenantId, actorScope)`. `create(input, actorScope: PlatformScope = 'tenant')` : nouveau 2ᵉ paramètre, appelle la nouvelle garde en plus de `rolesBelongToTenant`. `update(tenantId, userId, patch, scope = 'tenant', actorScope: PlatformScope = 'tenant')` : nouveau 5ᵉ paramètre, distinct du 4ᵉ (`scope`, qui gouverne uniquement la recherche du `userId` cible, hérité de D1 `users`, jamais fusionné avec `actorScope`). |
| `src/features/access/access-module.tsx` | `UserCreate` : `userService.create(input)` → `userService.create(input, user.scope)`. `UserEdit` : `userService.update(currentTenant.id, userId, input, 'tenant')` → `userService.update(currentTenant.id, userId, input, 'tenant', currentUser.scope)`. Les deux composants lisaient déjà `user.scope`/`currentUser.scope` via `usePermissions()` pour `RolePicker` — aucun nouvel import, aucune nouvelle dépendance. Commentaires mis à jour pour documenter le double usage de ce scope résolu (UI + service). |
| `src/services/user.service.test.ts` | Nouveau bloc `describe` dédié (« role scope security fix »), 8 tests — voir §7. |

Aucun fichier créé. Aucune nouvelle entité, repository, contexte ou système de policy — extension stricte de la validation déjà existante, conforme au mandat.

## 7. Tests ajoutés/modifiés

Tous dans `src/services/user.service.test.ts`, nouveau bloc `describe('userService — role scope security fix (actorScope, ...)')` :

| # | Test | Vérifie |
|---|---|---|
| 1 | Tenant actor + tenant role, même tenant | **PASS** attendu — `create(..., 'tenant')` avec `role-viewer` |
| 2 | Rôle d'un autre tenant | **FAIL** — D3 déjà correct, reconfirmé |
| 3 | **Tenant actor + rôle platform, même tenant** | **FAIL** — le scénario exact que ce correctif ferme (`update(..., 'tenant', 'tenant')` avec `role-admin`) |
| 4 | Même scénario, explicitement présenté comme appel direct au service (aucune UI) | **FAIL** |
| 5 | Après un refus, l'utilisateur cible reste totalement inchangé (`roleIds` ET `name` du même patch refusé) | Confirmé par comparaison `before`/`after` |
| 6 | `create()` applique la même garde qu'`update()` | **FAIL** — un acteur tenant ne peut pas créer un utilisateur pré-assigné à `role-admin` |
| 7 | Comportement existant préservé : un acteur `platform` peut toujours affecter un rôle `platform` | **PASS** — non une nouvelle politique, la branche `currentUserScope === 'platform'` déjà dans `RolePicker` |
| 8 | `actorScope` par défaut (`'tenant'`, le plus strict) quand omis | **FAIL** sans 5ᵉ argument explicite |

## 8. Tests exécutés

`npm run typecheck`, `npm run lint`, `npm run test -- --run`, `npm run build`, `npm run i18n:check`, vérification live (Playwright ad hoc, script temporaire supprimé après usage).

## 9. Résultats

| Commande | Avant ce correctif | Après |
|---|---|---|
| `npm run typecheck` | 0 erreur | 0 erreur |
| `npm run lint` | 0 erreur, 14 warnings pré-existants | 0 erreur, 14 warnings pré-existants (inchangés) |
| `npm run test` | 149/149 | **157/157** (8 tests nouveaux) |
| `npm run i18n:check` | 2/2 | 2/2 (aucune chaîne UI nouvelle — correctif service-only) |
| `npm run build` | succès | succès (chunk principal 896,86 kB, avertissement pré-existant sans rapport) |

**Playwright (validation live)** — 6/6 checks PASS : le sélecteur de rôles (Créer/Modifier un utilisateur) continue de fonctionner normalement pour l'acteur par défaut (`role-admin`, `scope: platform`, qui garde le droit d'affecter tout rôle) ; création et modification d'utilisateur bout en bout sans régression ; aucune erreur JS non interceptée. Script de vérification supprimé après usage (fichier temporaire, non versionné).

## 10. Tenant isolation

Inchangée et reconfirmée par les tests existants (149 tests déjà verts pour cette dimension, non retouchés) : `T-001 user + T-001 role` → autorisé ; `T-001 user + T-002 role` → refusé (Test 2 du nouveau bloc, reconfirmation).

## 11. Role scope isolation (nouveau)

`T-001 tenant-scoped actor + T-001 platform role` → **refusé**, désormais vérifié service-side, pas seulement UI (Tests 3, 4, 6, 8). `T-001 tenant-scoped actor + T-001 tenant role` → **autorisé** (Test 1). `T-001 platform-scoped actor + T-001 platform role` → **autorisé**, comportement existant explicitement préservé, pas une nouvelle politique (Test 7).

## 12. Non-régression

Les 149 tests déjà verts avant ce correctif restent tous verts — aucun n'a été modifié, affaibli ou supprimé pour faire passer la suite. `access-module.tsx` : seuls les deux points d'appel identifiés (§6) ont été touchés ; `UserDetail` (bascule `isActive` seule, ne soumet jamais `roleIds`) n'a pas eu besoin d'être modifié, le paramètre `actorScope` par défaut (`'tenant'`) suffit puisqu'il n'est de toute façon jamais évalué en l'absence de `patch.roleIds`.

## 13. Backend Pending

Inchangé — cette correction reste une aide frontend, jamais l'autorité de sécurité finale. Un vrai backend devra répliquer la même règle (tenant ET scope) côté serveur, indépendamment de ce que le frontend vérifie ou non. `D-RBAC-01` (`permissions.action`), la persistance réelle des rôles/permissions, et la prévention définitive de l'escalade de privilège restent `BACKEND_PENDING`, non traités par cette mission.

## 14. Limites restantes

- **`role-admin` reste protégé de la suppression uniquement par intégrité référentielle** (déjà noté `docs/P0_RBAC_IMPLEMENTATION_REPORT.md` §15), pas par un flag `is_system` — ce correctif ne modifie pas ce point, hors périmètre (le mandat interdit explicitement de toucher aux règles `isSystem`, §18 du mandat de cette mission).
- **`roleService.update`/`roleService.delete`** (modification/suppression d'un rôle lui-même, pas l'affectation d'un rôle à un utilisateur) n'ont pas de garde de scope équivalente — mais ces deux fonctions modifient un rôle *appartenant* au tenant courant (déjà garanti par D1/D2), pas *affecté* à un utilisateur ; l'angle mort corrigé ici concernait spécifiquement l'affectation `roleIds`, pas la gestion du catalogue de rôles lui-même. Aucun scénario équivalent n'a été identifié pour `role.service.ts` par cette mission — non traité, car hors du périmètre précis signalé par C-RBAC-12.
- **`permissions.action`** (D-RBAC-01) : non traité, comme mandaté.

## 15. Conclusion

Le gap de sécurité identifié par `docs/P0_RBAC_REMAINING_AUDIT.md` (C-RBAC-12) est corrigé : la garde anti-élévation de privilège, jusqu'ici uniquement côté UI (`RolePicker`), est désormais également appliquée côté service (`userService.create`/`update`), en répliquant exactement la même règle déjà établie — aucune nouvelle politique, aucune nouvelle abstraction RBAC. Les décisions D1/D2/D3 restent inchangées et verrouillées. D-RBAC-01 reste hors périmètre, à traiter séparément.

---

**P0 RBAC — CORRECTIF SÉCURITÉ SERVICE-SIDE (`role.scope`) TERMINÉ.**
