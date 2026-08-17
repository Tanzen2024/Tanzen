# TANZEN FRONTEND — P0-01 — Rapport final : finalisation du module `tenants`

**Statut : implémenté, testé, vérifié en direct.** Périmètre respecté : `tanzen-frontend` exclusivement, aucune autre P0 entamée (`users`, `roles`, `users_roles`, `permissions`, `role_permissions`, `loan_rules`, `tontine_contributions`, `workflow_delegations` non touchés).

Voir `docs/P0_TENANTS_AUDIT.md` pour l'audit complet et le GO/NO-GO qui précède ce rapport.

---

## 1. Ce qui existait déjà (confirmé conforme, non modifié)

- Séparation Commercial/Tenant déjà effective : registre CRUD complet dans `tanzen-commercial`, aucune trace dans `tanzen-frontend` (pas de route, pas de formulaire, pas de fonction `createTenant`/`updateTenant`).
- `TenantContext`, `TenantSwitcher`, `getTenantScoped()`, `AuthGuard`, `app-router.tsx` : tous conformes à `FIX_TENANT_APP_SINGLE_TENANT.md` et `PHASE_02_TENANT_ISOLATION_SPEC.md`. Aucune route `/platform/*`, même gardée — elle n'existe simplement pas dans ce projet.

## 2. Ce qui a été modifié

Trois corrections, toutes des applications d'une règle **déjà validée** (`FIX_TENANT_APP_SINGLE_TENANT.md`) — aucune nouvelle règle métier, aucune invention.

### E1 — Fuite du registre des tenants dans 5 formulaires (correction de sécurité/conformité)

**Constat** : `organizationService.listTenants(currentTenant.id, user.scope)` était appelé avec la portée RBAC *résolue* de l'utilisateur (`user.scope`/`currentUser.scope`) au lieu d'une valeur fixe `'tenant'`. Comme l'utilisateur mocké par défaut (`role-admin`) résout `scope: 'platform'`, les select "Tenant" de 5 formulaires de création/édition affichaient **les 5 tenants du registre complet**, permettant d'assigner une nouvelle ressource à un tenant arbitraire depuis l'Application Tenant.

**Correction** : les 7 sites d'appel concernés passent désormais explicitement `'tenant'` (jamais `user.scope`) :

| Fichier | Fonction(s) | Changement |
|---|---|---|
| `src/features/organization/organization-module.tsx` | `MemberCreate`, `MemberEditForm` | Scope forcé à `'tenant'` ; `usePermissions()`/import retirés (devenus inutiles) |
| `src/features/finance/finance-module.tsx` | `AccountCreate`, `ApplicationCreate` | Idem |
| `src/features/tontines/tontines-module.tsx` | `TontineCreate` | Idem |
| `src/features/access/access-module.tsx` | `UserCreate`, `UserEditForm` | Scope forcé à `'tenant'` **uniquement** pour l'appel `listTenants` ; `user.scope`/`currentUser.scope` conservés ailleurs dans ces fonctions (gating `RolePicker`/`userService`, hors périmètre `tenants`) |

**Comportement pour un utilisateur réellement tenant-scoped** : inchangé — `listTenants(id, 'tenant')` renvoyait déjà `[currentTenant]` avant comme après (confirmé par `organization.service.test.ts`, toujours vert).

### E2 — Bouton mort « Modifier dans le registre des tenants »

**Constat** : `src/features/settings/settings-module.tsx` (`SettingsOrganization`) affichait un bouton pointant vers `/organization/tenants/:id/edit`, une route qui n'existe plus dans `tanzen-frontend` depuis la séparation Commercial/Tenant (le registre vit exclusivement dans `tanzen-commercial`). Le clic tombait sur le `NotFoundPage` interne du module.

**Correction** : bouton retiré (`navigate` local devenu inutile, retiré). La page continue d'afficher en lecture seule le nom, nom légal et pays du tenant courant (`Info`), ce qui reste autorisé (mandat §4B : « afficher les informations nécessaires du tenant »).

### E3 — Texte d'information obsolète

**Constat** : `organizationIdentityNotice` (FR/EN) renvoyait vers « Organisation > Tenants », une section qui n'existe plus dans ce projet.

**Correction** : texte reformulé pour indiquer que l'identité du tenant est gérée par l'administration de la plateforme, sans référencer une navigation inexistante. Clé `editInTenantRegistry` (devenue orpheline après E2) retirée des deux fichiers de locale (FR/EN), en parité — `npm run i18n:check` reste vert.

## 3. Ce qui a été supprimé

- Le bouton « Modifier dans le registre des tenants » (`settings-module.tsx`).
- La clé de locale `editInTenantRegistry` (FR + EN).
- Les imports/déclarations `usePermissions()`/`user` devenus inutiles dans `organization-module.tsx`, `finance-module.tsx`, `tontines-module.tsx` (3 imports, 5 déclarations locales).
- Aucun fichier supprimé. Aucun autre module touché.

## 4. Ce qui reste (hors périmètre de cette mission)

- Le mécanisme d'activation réel du tenant (`Tenant.status: 'pending'` jamais transitionné à `'active'`, confirmé par grep dans `tanzen-commercial`) — `BACKEND_PENDING`/`DECISION_REQUIRED`, et de toute façon situé dans `tanzen-commercial`, pas dans ce projet.
- L'écart d'enum `Tenant.status` (code : 3 valeurs, dictionnaire Excel : 4 valeurs) — déjà documenté (`COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` C1), non rouvert ici.
- La fuite analogue mais distincte sur `userService.list`/`currentUser.scope` dans `access-module.tsx` (liste des utilisateurs, pas le registre des tenants) — repérée pendant l'audit, **volontairement non corrigée ici** : elle relève du domaine `users`, une P0 séparée que ce mandat interdit explicitement de commencer.

## 5. BACKEND_PENDING

Inchangé — authentification réelle, paiement, activation de tenant, vérification serveur de l'isolation. Cette mission n'a ajouté ni retiré aucune dépendance backend.

## 6. Décisions nécessaires

Aucune nouvelle décision n'a été nécessaire pour ce mandat — les 3 corrections appliquées découlent toutes d'une règle déjà validée. Les décisions déjà ouvertes (activation, enum de statut) restent hors périmètre et ne sont pas dupliquées ici.

## 7. Tests

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm run lint` | 0 erreur, 14 warnings pré-existants inchangés (`react-refresh/only-export-components`, sans rapport avec cette mission) |
| `npm run test` | **132/132 tests** au 2ᵉ passage (1ᵉʳ passage : 2 échecs par timeout dans `tenant-switcher.test.tsx`/`permission-gate.test.tsx`, fichiers non liés à cette mission, reproduits comme flakiness pré-existante puis disparus au ré-essai — confirmé non-régression) |
| `npm run build` | Succès, `dist/` généré, avertissement pré-existant sur la taille du chunk principal (inchangé) |
| `npm run i18n:check` | 2/2 tests verts (parité FR/EN maintenue après retrait de `editInTenantRegistry`) |

### Tests de sécurité spécifiques Tenant (mandat §12) — vérifiés en direct (`npm run dev` + Playwright, utilisateur mocké par défaut `role-admin`/`scope: platform`, le cas le plus défavorable)

| Test | Avant correction | Après correction | Résultat |
|---|---|---|---|
| Select "Tenant" — `MemberCreate` (`/organization/members/create`) | 5 tenants | **1 tenant** (« Coopérative Sutura », le tenant courant) | **PASS** |
| Select "Tenant" — `UserCreate` (`/access-security/users/create`) | 5 tenants | **1 tenant** | **PASS** |
| Select "Tenant" — `AccountCreate` (`/finance/accounts/create`) | 5 tenants | **1 tenant** | **PASS** |
| Select "Tenant" — `ApplicationCreate` (`/finance/credit/applications/create`) | 5 tenants | **1 tenant** | **PASS** |
| Select "Tenant" — `TontineCreate` (`/tontines/create`) | 5 tenants | **1 tenant** | **PASS** |
| Bouton « registre des tenants » — `/settings/organization` | Présent, lien mort | **Absent** (0 occurrence) | **PASS** |
| Texte notice — `/settings/organization` | Référence une section inexistante | Texte corrigé présent | **PASS** |
| Accès direct `/platform/tenants` depuis Tenant App (Test 5 du mandat) | — | Page « Erreur 404 — Page introuvable » (route inexistante, pas seulement gardée) | **PASS**, plus strict que « unauthorized » |
| Aucun `TenantSwitcher` interactif, aucun bouton Platform Administration | Déjà conforme (mission antérieure) | Inchangé | **PASS** |
| Création de tenant impossible depuis `tanzen-frontend` | Déjà conforme | Inchangé, confirmé par grep (aucune fonction `createTenant`) | **PASS** |

Tests 1-4 du mandat (isolation des ressources métier T-001 vs T-002, URL manipulée, `localStorage` poisonné) : non re-testés dans cette mission — déjà vérifiés et documentés en direct dans `docs/FIX_TENANT_APP_SINGLE_TENANT.md` §10 (TEST 1-6), portent sur `getTenantScoped`/`TenantContext`, non modifiés ici.

## 8. Risques

- **Faible** : les 3 corrections sont des retraits/restrictions (moins de code, moins de surface), pas des ajouts de logique — risque de régression minimal, confirmé par la suite de tests et la vérification live.
- Le formulaire "Tenant" à une seule option dans les 5 écrans concernés reste un `<select>` actif (pas transformé en champ statique) — UX légèrement étrange (un menu déroulant à une seule entrée) mais **délibérément non « amélioré »** au-delà du strict nécessaire, conformément au mandat (§15 : ne pas reconstruire l'architecture, ne pas dupliquer). Une évolution UX (remplacer le select par le nom du tenant courant en lecture seule) serait un changement de portée plus large, à traiter séparément si demandé.
- La fuite analogue sur `userService.list` (§4) reste ouverte — signalée pour la future P0 `users`, non un risque nouveau introduit par cette mission.

## 9. Prochaines étapes (hors périmètre, pour information)

1. P0 `users` : appliquer le même principe (ne jamais faire confiance à `currentUser.scope` résolu comme signal "cette app est la plateforme") à `userService.list`/`get`/`listByRole` dans `access-module.tsx`.
2. P0 `permissions`/`roles` : décider si `tenants.update` doit continuer à gater le formulaire de réglages d'organisation (`timezone`/`currency`) — usage actuel sans rapport avec le registre, potentiellement une permission mal nommée pour cet usage.
3. `tanzen-commercial` (hors périmètre `tanzen-frontend`) : trancher le mécanisme d'activation du tenant (§12 de l'audit) — actuellement aucun écran ne transitionne `Tenant.status` de `'pending'` à `'active'`.

---

*Fin du rapport. Module `tenants` finalisé dans les limites du mandat P0-01 — aucune autre P0 entamée, aucun backend inventé, aucune règle métier inventée.*
