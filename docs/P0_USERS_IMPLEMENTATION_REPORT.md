# TANZEN FRONTEND — P0 USERS — Rapport d'implémentation

**Statut : implémenté, testé, vérifié en direct.** Périmètre respecté : `tanzen-frontend` exclusivement, `users` uniquement — aucun autre P0 entamé (`roles`, `users_roles`, `permissions`, `role_permissions`, backend réel, Platform Administration).

Voir `docs/P0_USERS_AUDIT.md` (§0-22, RÉSOLUTION en tête) et `docs/P0_USERS_DECISIONS_A_VALIDER.md` pour le contexte complet précédant cette mission.

---

## 1. Objectif

Finaliser le module `users` en appliquant strictement les trois décisions validées : D1 (isolation stricte du Tenant App), D2 (authentification honnête / `BACKEND_PENDING`), D3 (`is_active` comme état d'activation) — et uniquement les corrections directement nécessaires à ces trois décisions.

## 2. Décisions appliquées

| # | Décision | Option retenue |
|---|---|---|
| D1 | Isolation stricte du Tenant App | Aligner `userService`/`sessionService` sur `FIX_TENANT_APP_SINGLE_TENANT.md`, exactement comme `P0_TENANTS_FINAL_REPORT.md` l'a fait pour `organizationService.listTenants` : les fonctions gardent un paramètre `scope` (capacité de service, testée, non exercée), mais tous les appels réels dans `access-module.tsx` passent littéralement `'tenant'`, jamais `currentUser.scope`. |
| D2 | Authentification honnête | `authService.login()` retourne `{ ok: false, error: 'BACKEND_PENDING' }` (jamais un faux succès), tout en conservant l'établissement de la session locale de démonstration (exception explicitement autorisée par le mandat pour ne pas casser les écrans construits). `LoginPage` affiche ce fait à l'écran. |
| D3 | `is_active` | `SystemUser.status` (enum 4 valeurs) → `SystemUser.isActive: boolean`. `suspended`/`invited` (sans fondement canonique) mappés à `false` dans les mocks. |

## 3. Fichiers créés

- `docs/P0_USERS_IMPLEMENTATION_REPORT.md` (ce document).

## 4. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/mocks/access/users.ts` | `UserStatus` supprimé ; `SystemUser.status` → `SystemUser.isActive: boolean` ; 12 utilisateurs seed remappés (`active`→`true`, `inactive/suspended/invited`→`false`). |
| `src/services/user.service.ts` | `create()` : `isActive: true` par défaut (au lieu de `status: 'invited'`). `update()` : type de patch `isActive?: boolean` (au lieu de `status?`) ; retire désormais explicitement `tenantId`/`tenantName` du patch avant application (défense D1/§9 — le tenant n'est jamais réassignable après création). Commentaire de tête réécrit pour refléter D1 (l'ancienne doctrine « console transverse » de Phase 10 est explicitement révoquée). |
| `src/services/auth.service.ts` | `login()` retourne désormais `Promise<{ ok: false; error: 'BACKEND_PENDING' }>` au lieu de `Promise<true>` — pose toujours le drapeau de session locale de démonstration, mais ne prétend plus avoir vérifié un identifiant. Commentaire de tête réécrit pour expliquer D2. |
| `src/features/auth/login-page.tsx` | Ajout d'un bandeau `role="status"` sous le formulaire, affichant explicitement que l'authentification réelle n'est pas disponible (`t('auth', 'backendPendingNotice')`). Comportement de soumission inchangé (toujours navigable vers `/dashboard`, pour ne pas casser la démo). |
| `src/features/access/access-module.tsx` | 8 sites d'appel (`UsersList`, `UserEdit`, `UserSessionsTab`, `UserDetail`, `RolesList`, `RoleDetail`, `SessionsPage`, `MfaPage`) : `currentUser.scope` → littéral `'tenant'` pour `userService.list/get/update/listByRole` et `sessionService.list/revoke` (D1). `usePermissions()`/`currentUser` retirés des fonctions où ils ne servaient plus qu'à ça (7 déclarations). `UserStatus`/`USER_STATUS_TONE`/`USER_STATUS_KEY` remplacés par `userStatusTone(isActive)`/`userStatusKey(isActive)` (D3) — appliqué à `UsersList` (colonne + filtre), `ProfileTab`, `UserDetail` (badge + toggle désactiver/réactiver), `RoleDetail` (table des porteurs du rôle). |
| `src/locales/en/index.ts`, `src/locales/fr/index.ts` | Ajout de `auth.backendPendingNotice` (parité FR/EN). Retrait de `access.statusSuspended`/`access.statusInvited` (orphelins après D3 — `access.statusActive`/`access.statusInactive` déjà présents et conservés, partagés avec `SessionStatus`). |
| `src/services/user.service.test.ts` | Test `status === 'invited'` → `isActive === true` ; ajout de 3 tests (D3 toggle, D1 anti-réassignation de tenant, D1 comportement Tenant App même en scope platform) ; relabellisation des tests « PLATFORM BYPASS » comme capacité de service non exercée par l'UI. |
| `src/services/session.service.test.ts` | Ajout d'un test D1 (comportement Tenant App même en scope platform) ; relabellisation du test « PLATFORM BYPASS ». |
| `src/services/role.service.test.ts` | Relabellisation du test « PLATFORM BYPASS » (`listUsersForRole`, fonction non appelée par l'UI — `RoleDetail` utilise `userService.listByRole`). |
| `src/services/auth.service.test.ts` | Ajout d'un test D2 vérifiant le contrat honnête (`{ ok: false, error: 'BACKEND_PENDING' }`) tout en confirmant que la session locale de démo est toujours établie. |
| `docs/P0_USERS_AUDIT.md` | Ajout d'une section « RÉSOLUTION » en tête, documentant D1/D2/D3 tranchées et renvoyant à ce rapport. |

Aucun fichier supprimé. `src/services/role.service.ts`, `src/services/tenant-scope.ts`, `src/contexts/tenant-context.tsx`, `src/contexts/permission-context.tsx`, `src/routes/auth-guard.tsx`, `src/routes/permission-route.tsx`, `src/layouts/shell-header.tsx` : inspectés, non modifiés (déjà conformes ou hors périmètre D1/D2/D3).

## 5. Tenant isolation

`userService.list/get/update/listByRole` et `sessionService.list/revoke` sont désormais toujours invoqués avec `'tenant'` littéral depuis `access-module.tsx`, jamais `currentUser.scope`. Vérifié :
- Par les tests service-level existants (`ALLOW`/`DENY` cross-tenant, inchangés et toujours verts).
- Par un nouveau test explicite par service (`user.service.test.ts`, `session.service.test.ts`) qui confirme que même avec `currentUser.scope === 'platform'` (le cas par défaut de l'app), un appel `list(tenantId, 'tenant')` — la forme que l'UI utilise réellement — ne renvoie que le tenant courant.
- En direct (Playwright, §15) : `/access-security/users` avec l'identité mockée par défaut (`role-admin`, `scope: platform`) n'affiche que les utilisateurs de T-001 (Coopérative Sutura) ; une navigation directe vers `/access-security/users/U-004` (T-002) ne révèle aucune donnée de cet utilisateur.

`userService.update()` ignore désormais explicitement `tenantId`/`tenantName` dans le patch (défense service-side, §9 de l'audit) — même si un appelant les incluait, le tenant d'un utilisateur reste celui fixé à la création.

## 6. Scope platform

`currentUser.scope` reste `'platform'` par défaut (mock inchangé, cohérent avec le reste de l'application) et continue d'exister dans le modèle RBAC — non supprimé. Mais aucun appel service lié à `users`/`sessions` ne le consomme plus dans `access-module.tsx` : le comportement observable pour un utilisateur `platform`-scoped est désormais identique à celui d'un utilisateur `tenant`-scoped (limité au tenant courant). Vérifié en direct (§15, tests 2-2e).

`currentUser.scope` reste légitimement utilisé une seule fois dans `access-module.tsx` (`UserEdit`/`UserCreate`, prop `currentUserScope` de `RolePicker`) — un usage RBAC distinct (garde anti-élévation de privilège déjà vérifiée en Phase 10), sans rapport avec l'isolation tenant, donc hors périmètre de D1.

## 7. User creation

Inchangé fonctionnellement : `UserCreate` ne propose que le tenant courant (déjà corrigé par `P0_TENANTS`, `listTenants(currentTenant.id, 'tenant')`). `userService.create()` n'accepte toujours aucun `tenantId` arbitraire au-delà de ce que le formulaire restreint déjà. Nouveauté D3 : l'utilisateur créé est `isActive: true` dès la création (au lieu de `status: 'invited'`, qui n'a plus de représentation).

## 8. Deactivation

`UserDetail` : bouton « Désactiver » appelle `userService.update(tenantId, userId, { isActive: false }, 'tenant')`. Vérifié en direct (badge passe de « Actif » à « Inactif »).

## 9. Reactivation

Même bouton, bascule à `{ isActive: true }`. Vérifié en direct (round-trip Actif → Inactif → Actif). Le gap précédemment noté (§13/§22 de l'audit : « réactiver depuis `invited`/`suspended` non couvert ») est résolu de facto par D3 — il n'existe plus que deux états.

## 10. `is_active`

`SystemUser.isActive: boolean` remplace `SystemUser.status`. Sémantique : `true` = actif, `false` = inactif. Aucune valeur `SUSPENDED`/`PENDING`/`EXITED` introduite. Aucun champ `status` résiduel. Tests : `create` → `true`, `deactivate` → `false`, `reactivate` → `true` (`user.service.test.ts`).

## 11. Authentication

`authService.login()` ne vérifie et ne peut vérifier aucun identifiant (aucun backend). Retourne désormais explicitement `{ ok: false, error: 'BACKEND_PENDING' }`. Continue d'établir la session locale de démonstration (`localStorage['tanzen-session']`) pour ne pas rendre l'application inaccessible — exception explicitement permise par le mandat, désormais rendue honnête à l'écran via un bandeau sur `LoginPage`.

## 12. Logout

Inchangé — `authService.logout()` restait déjà correctement implémenté (suppression du drapeau local, aucune fausse révocation serveur). Conforme au mandat (« ne pas transformer un logout local en faux logout serveur »).

## 13. RBAC

Aucune permission créée, modifiée ou supprimée. `users.read`/`users.create`/`users.update`/`sessions.revoke` continuent de garder les mêmes actions qu'avant cette mission. La garde anti-élévation de privilège (`RolePicker`) est inchangée.

## 14. Tests

| Commande | Avant | Après |
|---|---|---|
| `npm run typecheck` | 0 erreur | 0 erreur |
| `npm run lint` | 0 erreur, 14 warnings pré-existants | 0 erreur, 14 warnings pré-existants (inchangés, `react-refresh/only-export-components`, sans rapport) |
| `npm run test` | 137/137 | 137/137 (dont 6 tests nouveaux : D2 auth, D1 users, D1 sessions, D3 toggle, D1 anti-réassignation tenant) |
| `npm run i18n:check` | 2/2 | 2/2 (parité FR/EN maintenue) |
| `npm run build` | succès | succès (chunk principal 895,93 kB, avertissement de taille pré-existant et sans rapport avec cette mission) |

## 15. Playwright (validation live)

Serveur de dev lancé (`npm run dev`), session Playwright/Chromium pilotée par script contre `http://localhost:5183`, identité mockée par défaut (`role-admin`, `scope: platform`, le cas le plus défavorable pour D1). **14/14 vérifications PASS** :

| # | Test | Résultat |
|---|---|---|
| 1 | `/login` affiche le bandeau honnête `BACKEND_PENDING` | PASS |
| 1b | Soumettre le formulaire atteint quand même `/dashboard` (démo non cassée) | PASS |
| 2 | `/access-security/users` affiche le tenant courant (Coopérative Sutura) | PASS |
| 2b-2c | Aucune fuite des noms d'autres tenants (Tontine Horizon, Mutuelle Teranga) | PASS |
| 2d | Aucune fuite de l'utilisateur cross-tenant Mamadou Sow (T-002) | PASS |
| 2e | Navigation directe vers `/access-security/users/U-004` (T-002) ne révèle aucune donnée | PASS |
| 3 | Fiche utilisateur affiche « Actif » (pas d'enum `Suspended`/`Invited`) | PASS |
| 3b | Aucune trace résiduelle de « Suspendu »/« Invité » | PASS |
| 4 | Désactiver/Réactiver bascule le badge (Actif → Inactif) | PASS |
| 4b | Re-basculer restaure l'état d'origine (round-trip booléen) | PASS |
| 5 | Aucun texte « Platform Administration » nulle part | PASS |
| 5b | Aucun élément `aria-expanded` (switcher interactif) dans le header | PASS |
| — | Aucune erreur JS non interceptée (`pageerror`) pendant tout le parcours | PASS |

Script de vérification exécuté puis supprimé après usage (fichier temporaire, non versionné).

## 16. BACKEND_PENDING

Authentification réelle (login, vérification d'identifiants) · session serveur (token, expiration, révocation) · refresh token · résolution serveur de `tenantId`/rôles/permissions au login · réinitialisation de mot de passe · changement de mot de passe · téléversement de photo de profil avec stockage réel · comptes administrateurs plateforme (NC-01, hors périmètre) · révocation à distance d'une session active sur un autre appareil. Aucun de ces éléments n'a été simulé ou construit dans cette mission.

## 17. Risques restants

- **Faible** : les changements D1 sont des restrictions (retrait de `currentUser.scope`), pas des ajouts de logique — risque de régression minimal, confirmé par la suite de tests et la vérification live.
- Le paramètre `scope` reste techniquement présent sur `userService`/`sessionService` (capacité de service testée mais non exercée) plutôt que supprimé — cohérent avec le précédent `organizationService.listTenants`, mais signifie qu'un futur appel négligent avec `currentUser.scope` au lieu de `'tenant'` réintroduirait la fuite. Aucun garde-fou de compilation n'empêche ce type d'erreur (le paramètre reste un `PlatformScope` valide dans les deux cas) ; seule la revue de code/les tests de régression protègent contre ça.
- D2 : la session locale de démonstration continue d'exister après un `login()` qui se déclare pourtant `BACKEND_PENDING` — un compromis assumé et documenté (mandat §11), mais qui reste, par construction, une zone grise tant qu'aucun vrai backend n'existe.

## 18. Éléments volontairement non implémentés

- `roles`/`users_roles`/`permissions`/`role_permissions` (P0 séparés).
- Comptes administrateurs plateforme (NC-01 — aucune classe `PlatformUser`, `tenant_id NOT NULL` partout).
- Profil self-service (UC20-08/09 — modifier son propre profil, téléverser une photo) — `MODEL_GAP` (relation Users↔Members), non tranché par D1/D2/D3.
- `mfa.manage` / auto-désactivation d'un compte (déjà signalés en Phase 10, non retranchés ici).
- Toute authentification réelle, tout backend.

---

**P0 USERS — IMPLÉMENTATION TERMINÉE — EN ATTENTE DE VALIDATION AVANT TOUT AUTRE P0.**
