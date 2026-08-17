# TANZEN FRONTEND — P0-01 — Audit du module `tenants`

**Statut : audit, lecture seule.** Aucun fichier de `src/` n'a été modifié pour produire ce document. Périmètre : `tanzen-frontend` exclusivement (lecture ponctuelle de `tanzen-commercial` pour comprendre le flux Commercial→Tenant, aucune modification là non plus).

---

## 1. État actuel

Le module `tenants` est déjà **majoritairement séparé** entre les deux projets suite à la Mission de séparation Commercial/Tenant (2026-08-16) : le registre complet (CRUD) vit dans `tanzen-commercial`, et `tanzen-frontend` ne conserve qu'une lecture scoped. La séparation architecturale (routes, layouts, guards) est propre. **Le problème trouvé n'est pas structurel — il est ponctuel** : plusieurs points de code résiduels de l'application Tenant utilisent encore le paramètre `scope` de `organizationService.listTenants`/`getTenant` de façon incorrecte, ce qui, avec l'utilisateur mocké par défaut (`role-admin`, `scope: 'platform'`), **expose actuellement le registre complet des 5 tenants dans plusieurs formulaires de l'Application Tenant** — en violation directe de la règle déjà validée dans `FIX_TENANT_APP_SINGLE_TENANT.md` et `PHASE_02_TENANT_ISOLATION_SPEC.md` §3/§5.

## 2. Architecture (confirmée conforme)

```
tanzen-commercial (Platform)          tanzen-frontend (Tenant)
  Tenant Registry (CRUD)                Login (/login)
  Tenant Creation                       AuthGuard (session locale, BACKEND_PENDING)
  Subscription → Payment                TenantContext (résout 1 seul tenant depuis currentUser.tenantId)
  Tenant.status: pending (jamais        TenantSwitcher (étiquette statique, non interactif)
    transitionné à 'active' — confirmé  getTenantScoped() (isolation des ressources métier)
    par grep, aucune écriture trouvée)  PermissionRoute (garde par page)
```

- `app-router.tsx` : confirmé — **aucune route `/platform/*` n'existe dans tanzen-frontend**, pas même gardée. Une tentative d'y accéder tombe sur le catch-all `<Route path="*" element={<NotFoundPage />} />`. C'est plus strict que ce que demandait le mandat (« accès refusé/unauthorized ») : il n'y a même pas de route à refuser.
- `PlatformScopeGuard` : confirmé absent de tanzen-frontend (retiré lors de la séparation), aucune trace résiduelle.
- `TenantSwitcher` (`src/layouts/tenant-switcher.tsx`) : confirmé statique pour tous les scopes, aucun dropdown, aucune lecture de `localStorage`.
- `TenantContext` (`src/contexts/tenant-context.tsx`) : confirmé — un seul tenant calculé au niveau module depuis `currentUser.tenantId`, jamais depuis `localStorage`, pas de `setCurrentTenant`.
- `getTenantScoped()` (`src/services/tenant-scope.ts`) : inchangé, sémantique conforme à `PHASE_02_TENANT_ISOLATION_SPEC.md` (retourne `undefined` sans distinguer « n'existe pas » de « appartient à un autre tenant »).

## 3. Fichiers concernés

| Fichier | Rôle | Problème trouvé |
|---|---|---|
| `src/contexts/tenant-context.tsx` | Résolution du tenant courant | Aucun — conforme |
| `src/layouts/tenant-switcher.tsx` | Affichage du tenant courant | Aucun — conforme |
| `src/services/tenant-scope.ts` | Isolation des ressources métier | Aucun — conforme |
| `src/services/organization.service.ts` | `listTenants`/`getTenant` (lecture registre) | Fonction elle-même correcte (accepte un `scope`, filtre bien) — **le problème est dans ses appelants** |
| `src/features/organization/organization-module.tsx` | `MemberCreate`, `MemberEditForm` | Appelle `listTenants(currentTenant.id, user.scope)` — fuite si `user.scope === 'platform'` |
| `src/features/access/access-module.tsx` | `UserCreate`, `UserEditForm` | Même fuite via `organizationService.listTenants`, sur le select "Tenant" du formulaire Utilisateur |
| `src/features/finance/finance-module.tsx` | `AccountCreate`, `ApplicationCreate` | Même fuite, sur les select "Tenant" de Compte et de Demande de prêt |
| `src/features/tontines/tontines-module.tsx` | `TontineCreate` | Même fuite, sur le select "Tenant" de création de Tontine |
| `src/features/settings/settings-module.tsx` | `SettingsOrganization` | Bouton « Modifier dans le registre des tenants » pointe vers `/organization/tenants/:id/edit`, une route qui **n'existe plus** dans `tanzen-frontend` (confirmé : `OrganizationModule` ne définit que `members*`/`governance*`) — lien mort, tombe sur le `NotFoundPage` interne du module |

## 4. Routes (confirmées)

`app-router.tsx` : `/`→`/login`, `/login` (AuthShell), puis sous `AuthGuard`+`AppShell` : `/dashboard`, `/organization/*`, `/finance/*`, `/tontines/*`, `/operations/*`, `/access-security/*`, `/audit/*`, `/settings/*`, `/unauthorized`, `/404`, catch-all `*`→`NotFoundPage`. Aucune route de registre de tenants, aucune route Platform. `OrganizationModule` (sous-routeur) : `members`, `members/create`, `members/:id/edit`, `members/:id`, `governance*`, catch-all interne. Confirmé : plus de route `tenants*` dans ce sous-routeur (retirée lors de la séparation, cf. commentaire ligne 317-321 du fichier).

## 5. Services

`organizationService.listTenants(tenantId, scope)` / `getTenant(tenantId, resourceId, scope = 'tenant')` : signature et logique **correctes et inchangées depuis la séparation** — `scope === 'platform'` est un paramètre légitimement nécessaire pour `tanzen-commercial` (Platform Administration), qui a de vrais utilisateurs platform-scoped consultant le registre complet. Le défaut de `getTenant` (`scope = 'tenant'`) est sûr. **Le défaut de `listTenants` n'existe pas** (paramètre obligatoire) — chaque appelant doit fournir explicitement un scope, et sept sites d'appel dans `tanzen-frontend` fournissent `user.scope`/`currentUser.scope` (la portée RBAC *résolue* de l'utilisateur) au lieu d'une valeur fixe `'tenant'`. C'est cohérent avec l'esprit du code : la fonction ne sait pas dans quelle application elle est appelée, c'est à l'appelant de ne jamais lui passer un scope qui n'est pas garanti par l'architecture de l'application hôte.

## 6. Contextes

`TenantContext`/`PermissionContext` : aucune modification nécessaire. `PermissionContext` (`usePermissions()`) expose `user.scope`, qui reflète la portée RBAC **résolue à partir des rôles assignés** (`resolveScope()` dans `rbac.mocks.ts`) — cette portée a un sens légitime pour le RBAC (un `role-admin` doit voir plus de choses dans Access & Security que le strict nécessaire tenant), mais **n'a jamais été conçue comme un signal indiquant "cette app est la plateforme"**. Utiliser `user.scope` pour piloter `organizationService.listTenants` dans `tanzen-frontend` confond ces deux notions.

## 7. Modèles

`Tenant.status: 'active' | 'inactive' | 'pending'` — confirmé par lecture directe de `mocks/organization/tenants.ts`. Aucune modification proposée (hors périmètre : renommer/étendre cet enum est une décision produit, déjà documentée comme écart avec le dictionnaire Excel dans `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` C1 — non rouverte ici). `TenantInput` (`createTenant`/`updateTenant`) : n'existe plus dans `tanzen-frontend` (déplacé en intégralité vers `tanzen-commercial`), confirmé par grep — aucune trace résiduelle.

## 8. Permissions

`tenants.read` protège `/organization/*` (`PermissionRoute permission="tenants.read"`). `tenants.update` protège le bouton mort de `settings-module.tsx` (§3) et le bouton d'enregistrement des réglages d'organisation (`timezone`/`currency`, via `settingsService`, sans rapport avec le registre). Aucune modification du catalogue RBAC proposée ici — hors périmètre (P0 `permissions`/`roles` séparé).

## 9. Tenant isolation

Conforme à `PHASE_02_TENANT_ISOLATION_SPEC.md` et `FIX_TENANT_APP_SINGLE_TENANT.md` pour tout ce qui concerne les **ressources métier** (`getTenantScoped`, aucun switcher, aucune route Platform). **Le seul écart identifié concerne spécifiquement le registre des tenants** (§3, §11 ci-dessous) — un utilisateur du mock par défaut (`role-admin`, résolu `scope: 'platform'`) peut aujourd'hui, depuis `tanzen-frontend`, voir et choisir n'importe lequel des 5 tenants dans les select "Tenant" des formulaires Membre/Utilisateur/Compte/Demande de prêt/Tontine — pas au niveau de la donnée affichée en lecture (les listes elles-mêmes restent filtrées par `getTenantScoped`), mais au niveau de l'**assignation** d'une nouvelle ressource à un tenant arbitraire au moment de sa création.

## 10. Création de tenant

Confirmé absente de `tanzen-frontend` — aucune fonction `createTenant`, aucun formulaire, aucune route. Conforme au mandat §7. Rien à faire.

## 11. Résolution du tenant

`TenantContext` résout `currentUser.tenantId` → `TenantContext.currentTenant`, sans lecture de session réelle (`BACKEND_PENDING`, déjà documenté). Conforme à la cible « session → tenantId → TenantContext », en attendant l'authentification réelle. **Le seul défaut n'est pas dans la résolution du tenant courant elle-même, mais dans le registre auxiliaire consulté par certains formulaires** (§9).

## 12. Activation du tenant

Confirmé par grep dans `tanzen-commercial` : `Tenant.status` est fixé à `'pending'` à la création (`organization.service.ts` `createTenant`) et **n'est jamais réécrit à `'active'` nulle part dans le code** — seul `Subscription.status` transitionne vers `'active'` après confirmation de paiement (`platform-commercial.service.ts` ligne 93). Ceci confirme, sans le rouvrir, le constat déjà documenté dans `FINAL_ARCHITECTURE_DECISIONS_A_VALIDER.md` point 3 : le mécanisme d'activation est `BACKEND_PENDING`/`DECISION_REQUIRED` (email d'activation ? lien à durée limitée ? qui déclenche ?). **Hors périmètre `tanzen-frontend`** (le champ et la logique de transition appartiennent à `tanzen-commercial`) — documenté ici pour traçabilité, aucune action possible côté ce projet.

## 13. Registre des tenants

Confirmé conforme au mandat §10 pour l'essentiel (pas de page d'administration globale, pas de CRUD global dans `tanzen-frontend`) **à l'exception des 7 sites d'appel de `listTenants` avec un scope non forcé** (§3, §9) — c'est une lecture globale résiduelle, exactement le cas que le mandat demande d'analyser avant d'agir : usage confirmé = alimenter un `<select>` d'assignation de tenant dans 5 formulaires de création/édition (Membre, Utilisateur, Compte, Demande de prêt, Tontine). Dépendances confirmées : aucun de ces formulaires n'a besoin de la portée `'platform'` pour fonctionner — avec un utilisateur réellement tenant-scoped (`scope: 'tenant'`), `listTenants` renvoie déjà systématiquement `[currentTenant]` (comportement déjà vérifié par `organization.service.test.ts`), donc forcer `'tenant'` ne change **aucun comportement pour un utilisateur normal**, seulement pour le mock par défaut actuellement `platform`-scoped.

## 14. Backend dependencies

Inchangées depuis `FINAL_ARCHITECTURE_DECISIONS_A_VALIDER.md` : authentification réelle, paiement, activation de tenant, vérification serveur d'isolation — tous `BACKEND_PENDING`, tous hors périmètre de cette mission (aucun n'est touché).

## 15. Écarts identifiés (résumé)

| # | Écart | Sévérité | Cause | Backend requis ? |
|---|---|---|---|---|
| E1 | 7 sites d'appel `organizationService.listTenants(..., user.scope \| currentUser.scope)` exposent le registre complet dans des `<select>` de formulaires Tenant App si l'utilisateur résolu est `platform`-scoped | **Élevée** (viole une règle déjà validée) | Confusion entre portée RBAC résolue et portée applicative | Non |
| E2 | Bouton « Modifier dans le registre des tenants » (`settings-module.tsx`) pointe vers une route qui n'existe plus dans ce projet | Moyenne (lien mort, pas une fuite de données) | Résidu de la séparation Commercial/Tenant, route déplacée sans mise à jour de ce bouton | Non |
| E3 | Texte `organizationIdentityNotice` (« L'identité du tenant se gère depuis Organisation > Tenants ») fait référence à une section qui n'existe plus dans ce projet | Faible (texte informatif incorrect) | Même cause que E2 | Non |

## 16. Doublons

Aucun nouveau doublon trouvé au-delà de ceux déjà documentés dans `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` (D1 : `tenants.ts` mock dupliqué entre projets, décision déjà actée et non remise en cause ici).

## 17. Contradictions

Aucune nouvelle contradiction entre sources. Le C1 déjà documenté (`Tenant.status` : 3 valeurs code vs 4 valeurs Excel) est confirmé inchangé par cet audit (`platform-commercial.service.ts` utilise en plus `status === 'inactive'` comme équivalent informel de « suspendu » dans un tableau de bord — cohérent avec le C1 déjà noté, pas une contradiction supplémentaire).

## 18. Décisions nécessaires

Aucune décision produit n'est nécessaire pour corriger E1/E2/E3 — ce sont des corrections d'application d'une règle **déjà validée** (`FIX_TENANT_APP_SINGLE_TENANT.md`), pas de nouvelles règles. Les décisions déjà ouvertes et non tranchées (mécanisme d'activation réel, §12) restent hors périmètre et ne sont pas dupliquées ici ; si nécessaire, elles seraient à consigner dans `tanzen-commercial`, pas dans ce projet.

---

## 19. GO / NO-GO

| Élément | Décision | Justification |
|---|---|---|
| **E1** — Forcer `'tenant'` au lieu de `user.scope`/`currentUser.scope` dans les 7 appels `organizationService.listTenants` de `tanzen-frontend` | **GO** | Applique une règle déjà validée (`FIX_TENANT_APP_SINGLE_TENANT.md`), comportement inchangé pour tout utilisateur réellement tenant-scoped, aucune invention, aucun backend requis, ne touche aucun autre module P0 |
| **E2** — Retirer le bouton mort « Modifier dans le registre des tenants » | **GO** | Le lien cible n'existe pas dans ce projet ; le conserver contredit le mandat §2 (« ne doit plus permettre... d'administrer le registre global »/§10) ; suppression pure, aucune invention |
| **E3** — Corriger le texte `organizationIdentityNotice` pour ne plus référencer une section absente | **GO** | Correction factuelle minimale, cohérente avec E2, aucune invention de nouveau comportement |
| Mécanisme d'activation réel du tenant (§12) | **NO-GO** | Backend inexistant, décision produit non tranchée, et de toute façon hors périmètre `tanzen-frontend` |
| Renommage/extension de l'enum `Tenant.status` (C1) | **NO-GO** | Décision produit non tranchée, hors périmètre de cette mission (ne pas modifier les enums canoniques sans justification documentaire, §9 du mandat) |
| Toute modification du catalogue RBAC (`tenants.update` et alentours) | **NO-GO** | Explicitement exclu du périmètre de cette mission (P0 `permissions`/`roles` séparé) |

**Aucune décision métier critique ne manque pour les 3 éléments GO** — ce sont des corrections de conformité à une règle déjà écrite, pas de nouvelles règles.

*Fin de l'audit. Implémentation limitée à E1/E2/E3 ci-dessous.*
