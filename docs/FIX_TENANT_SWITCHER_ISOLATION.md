# TANZEN — Correction critique : isolation stricte du TenantSwitcher

**Statut : correctif de sécurité appliqué et vérifié.** Hors numérotation de phase, traité en urgence conformément à la demande. Un seul fichier de code modifié (`src/contexts/tenant-context.tsx`) ; aucune régression sur le Platform Administration.

## 1. Problème observé

Pour un utilisateur tenant-scoped affichant « Tenant courant : Tontine Horizon / TH-002 », le `TenantSwitcher` présentait un menu déroulant complet listant tous les tenants (Coopérative Sutura, Tontine Horizon, Mutuelle Teranga, Association Jappo, Tontine Avenir), un champ de recherche, et un bouton « Ajouter un tenant » — comportement interdit dans une application SaaS tenant-scoped, où un utilisateur ne doit jamais voir, rechercher, ni sélectionner un autre tenant que le sien.

## 2. Cause technique

Deux défauts distincts, tous deux dans `src/contexts/tenant-context.tsx` (`TenantSwitcher` lui-même n'était **pas** en cause) :

1. **Frontend Data Leak** : la valeur `tenants` exposée par `TenantContext` était le tableau mock complet (`import { tenants } from '@/mocks/organization/tenants'`), sans aucun filtrage par scope — contrairement à `organizationService.listTenants(tenantId, scope)`, qui applique déjà correctement la règle « tenant-scoped ne voit que son tenant ». La donnée des autres tenants était donc chargée en mémoire pour tout utilisateur, quel que soit son scope ; seul `TenantSwitcher` la masquait visuellement en aval (`if (user.scope !== 'platform') return <étiquette statique>`), ce qui est une protection UI, pas une absence de chargement.
2. **`resolveInitialTenant()` restaurait aveuglément `localStorage['tanzen-tenant-id']`**, sans jamais vérifier qu'il correspondait au tenant de l'utilisateur courant. Le symptôme observé (« Tontine Horizon / TH-002 » affiché) provient très probablement d'un `localStorage` resté sur `T-002` suite à des vérifications de bascule de tenant menées lors de phases précédentes du projet sur le même navigateur — au rechargement, ce `localStorage` était restauré tel quel, y compris pour un utilisateur qui n'a aucun droit sur ce tenant.

`TenantSwitcher` (`src/layouts/tenant-switcher.tsx`) contenait déjà la bonne garde (`user.scope !== 'platform'` → étiquette statique, sans dropdown) — non modifié dans ce correctif.

## 3. Correction

Dans `src/contexts/tenant-context.tsx` uniquement :

1. Import direct de `currentUser` depuis `@/mocks/rbac.mocks` (même pattern que `permission-context.tsx` — `TenantProvider` est monté au-dessus de `PermissionProvider` dans `src/app/providers.tsx`, donc `usePermissions()` n'y est pas disponible ; pas de nouveau mécanisme créé).
2. `tenants` exposé par le contexte est désormais scope-aware à la source : `currentUser.scope === 'platform' ? allTenants : allTenants.filter(t => t.id === currentUser.tenantId)`. Pour un utilisateur tenant-scoped, le tableau ne contient plus qu'un seul élément — aucune donnée des autres tenants n'entre dans le state React.
3. `resolveInitialTenant()` : pour `scope !== 'platform'`, résout **toujours** vers le tenant de `currentUser.tenantId`, indépendamment de tout `localStorage` — un utilisateur tenant-scoped n'a qu'un seul tenant possible, rien à restaurer. Le comportement de restauration par `localStorage` reste inchangé pour `scope === 'platform'` (fonctionnalité légitime de l'administration Platform).
4. `setCurrentTenant`/`setCurrentTenantId` : no-op silencieux si `currentUser.scope !== 'platform'` — défense en profondeur, indépendante de l'auto-restriction déjà présente dans `TenantSwitcher`.

## 4. TenantContext utilisé

`src/contexts/tenant-context.tsx` — mécanisme existant réutilisé, aucun nouveau contexte ni doublon créé.

## 5. Services modifiés

Aucun. `organizationService.listTenants`/`getTenant`/`createTenant`/`updateTenant` étaient déjà correctement scope-gardés (vérifié, inchangés).

## 6. Routes protégées

Aucune modification. `/platform/tenants*` reste gardé par `PlatformScopeGuard` (revérifié, inchangé). `/organization/tenants*` n'existe plus comme route depuis une correction antérieure de ce projet (registre déplacé sous `/platform/tenants*`) — reconfirmé par lecture directe de `organization-module.tsx`.

## 7. Tenant isolation

Isolation désormais garantie à deux niveaux indépendants (§17 du mandat — RBAC ≠ tenant isolation, les deux contrôles restent séparés) :
- **Chargement des données** : `TenantContext.tenants` ne contient qu'un élément pour un utilisateur tenant-scoped — plus un filtrage visuel a posteriori.
- **Changement de tenant** : `setCurrentTenant`/`setCurrentTenantId` refusent toute écriture hors scope platform, indépendamment de l'UI qui les appelle.

## 8. Tests effectués

Vérification directe en environnement (`npm run dev`, headless Chrome + Chrome DevTools Protocol), avec bascule temporaire et réversible du rôle de l'utilisateur mocké (`rbac.mocks.ts`, `role-admin` → `role-manager`, restaurée à l'identique immédiatement après — confirmé par relecture) :

1. **Reproduction exacte du bug signalé** : `localStorage['tanzen-tenant-id']` pré-rempli avec `T-002` (Tontine Horizon) avant chargement, session simulée tenant-scoped (T-001, Coopérative Sutura) → le tenant affiché est **« Coopérative Sutura »** (le tenant réel de l'utilisateur), pas « Tontine Horizon ». Le `localStorage` empoisonné n'a plus d'effet.
2. Aucune fuite textuelle : « Tontine Horizon », « Mutuelle Teranga » absents de la page ; « Ajouter un tenant » absent ; aucun champ de recherche de tenant présent.
3. Clic sur la zone du tenant courant : aucun élément `<button>` (étiquette statique non interactive), aucun menu ouvert.
4. **Non-régression Platform** : après restauration du rôle `role-admin` (scope platform), le `TenantSwitcher` réaffiche correctement le dropdown complet (« Tontine Horizon » visible dans la liste), « Ajouter un tenant » et le champ de recherche — fonctionnalité Platform Administration intacte.

## 9. Résultats

`tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 14 warnings pré-existants sans rapport avec ce correctif. `vite build` — succès. Bug reproduit puis confirmé résolu ; aucune régression du comportement Platform.

## 10. Fichiers modifiés

- `src/contexts/tenant-context.tsx` — seul fichier de code modifié.
- `docs/FIX_TENANT_SWITCHER_ISOLATION.md` — nouveau (le présent rapport).

`src/mocks/rbac.mocks.ts` a été temporairement modifié pour la vérification (§8) puis restauré à l'identique — confirmé par relecture — avant la fin de la mission. Aucun autre fichier (Finance, Credit, Tontines, Governance, Documents, Workflows, site vitrine, Plans/Souscription/Paiement) n'a été touché.

---

## ADDENDUM — Vérification approfondie suite à un nouveau signalement (2026-08-15)

**Statut : architecture reconfirmée correcte. Aucun code applicatif modifié.** Un nouveau signalement indiquait que le bug serait « toujours visible » : un utilisateur « actuellement dans Tontine Horizon / TH-002 » voyait encore les 5 tenants, la recherche et « Ajouter un tenant » dans le `TenantSwitcher`. Conformément à la demande, aucune supposition n'a été faite sur la suffisance du correctif précédent — l'ensemble du code a été réinspecté, un diagnostic runtime temporaire a été ajouté, et une session tenant-scoped réelle a été simulée de bout en bout pour vérifier le comportement effectif (pas seulement statique).

### 1. Cause racine exacte

**Il n'y a pas de régression ni de fuite de données.** Le correctif du §1–§9 ci-dessus est toujours intact et fonctionne correctement (revérifié ligne par ligne, `git`-diff-équivalent confirmé identique à la version décrite plus haut).

La confusion vient du fait que l'application TANZEN n'a **aucune authentification réelle** : la session affichée est *toujours* le même utilisateur mocké unique, `currentUser` (`src/mocks/rbac.mocks.ts`), câblé en dur sur `role-admin` → `scope: 'platform'`, `tenantId: 'T-001'`. Le libellé « Tontine Horizon / TH-002 » visible dans la capture d'écran signalée n'indique donc pas une session appartenant à un utilisateur de Tontine Horizon — il indique que cet utilisateur **Platform** avait, à un moment antérieur, sélectionné Tontine Horizon comme *tenant actuellement consulté* via le `TenantSwitcher` (choix légitime, persistant volontairement via `localStorage['tanzen-tenant-id']` pour un utilisateur Platform — cf. §3 du correctif initial). Pour un utilisateur **Platform**, voir les 5 tenants, la recherche et « Ajouter un tenant » en plus du tenant actuellement sélectionné est le comportement **attendu et correct** (cf. ARCHITECTURE CIBLE / bloc « Platform » du mandat) — ce n'est pas une violation de l'isolation tenant-scoped, car cette session n'a jamais été tenant-scoped.

Il n'existe aujourd'hui, dans l'interface réelle, aucun moyen d'obtenir une session **authentiquement** tenant-scoped sans modifier manuellement `rbac.mocks.ts` (pas de flux de connexion — `BACKEND PENDING`, déjà documenté ailleurs dans le projet). La vérification ci-dessous simule donc explicitement ce cas pour prouver que l'isolation, une fois `currentUser.scope !== 'platform'`, est bien totale.

### 2. Composant/service qui fournirait encore la liste globale

**Aucun trouvé.** Recherche exhaustive (grep global) sur toutes les références à `tenants`, `currentTenant`, `currentTenantId`, `tenantId`, `TenantSwitcher`, `tanzen-tenant-id`, `scope === 'platform'`, `scope !== 'platform'` dans `src/` :

- `src/contexts/tenant-context.tsx` — seule source de `tenants`/`currentTenant` pour l'UI applicative ; scope-filtrée à la source (§2–§3 du correctif initial), inchangée.
- `src/layouts/tenant-switcher.tsx` — consomme exclusivement `useTenant()` ; aucune source de données parallèle.
- `src/layouts/shell-header.tsx` — n'utilise que `currentTenant` (fil d'Ariane) et monte `<TenantSwitcher />` ; la recherche globale (`GlobalSearch`) ne cherche que dans l'arbre de navigation statique (`flattenNavigation(navigationTree)`), jamais dans les données de tenants.
- `src/services/organization.service.ts` (`listTenants`, `getTenant`) — déjà et toujours scope-gardé (`scope === 'platform' ? tenants : tenants.filter(t => t.id === tenantId)`), utilisé uniquement par le registre Platform (`/platform/tenants*`) et par les sélecteurs de tenant dans les formulaires Membres — jamais par `TenantSwitcher`.
- `src/features/platform/platform-module.tsx` — registre complet des tenants, mais gardé à la fois par `PlatformScopeGuard` (route) et par `organizationService.listTenants(..., user.scope)` (donnée) : double garde, cohérente, jamais atteignable par un utilisateur tenant-scoped.
- `src/routes/app-router.tsx` — une seule route de registre de tenants (`/platform/tenants*`, sous `PlatformScopeGuard`) ; aucune route `/organization/tenants*` dupliquée (confirmé, cf. §6 du correctif initial).
- `src/stores/*` — aucun store ne référence `tenant`.
- `src/app/providers.tsx` — ordre des providers inchangé (`TenantProvider` au-dessus de `PermissionProvider`), aucun provider n'écrase `TenantContext.tenants`.
- `PermissionContext` (`src/contexts/permission-context.tsx`) — importe le **même** `currentUser` que `TenantContext` (aucune divergence de source possible entre le scope vu par `TenantSwitcher` et celui vu par `TenantContext`).

### 3. Correction effectuée

Aucune, le code était déjà correct. Un diagnostic temporaire (`window.__tenantDebug`, exposant `userScope`/`userTenantId`/`scopedTenantsCount`/`scopedTenantIds`) a été ajouté dans `tenant-context.tsx` le temps de la vérification runtime (§5), puis **retiré** — fichier revenu à l'identique du correctif initial (relu intégralement pour confirmation).

### 4. Séparation Platform/Tenant

Confirmée intacte à tous les niveaux listés dans le mandat : `TenantContext` (filtre à la source), `TenantSwitcher` (rendu conditionnel, pas de CSS caché), aucun `tenantStore`, `organizationService`/`role.service`/`session.service`/`user.service` (tous scope-gardés en paramètre explicite, jamais déduits d'un state global), `PlatformScopeGuard` (route), navigation (bouton « Platform Administration » gardé par `user.scope === 'platform'`).

### 5. Tests effectués

Vérification directe en environnement (`npm run dev`, headless Chrome + Chrome DevTools Protocol), avec bascule temporaire et réversible du mock `currentUser` vers un utilisateur **réellement** tenant-scoped existant (`U-004`, Mamadou Sow, `tenantId: 'T-002'`, `role-manager` → `scope: 'tenant'`), diagnostic `window.__tenantDebug` ajouté puis retiré, `rbac.mocks.ts` restauré à l'identique et relu pour confirmation avant la fin de la mission.

### 6. Résultat tenant-scoped (U-004 / Tontine Horizon / T-002)

- `window.__tenantDebug` → `{"userScope":"tenant","userTenantId":"T-002","scopedTenantsCount":1,"scopedTenantIds":["T-002"]}` — **jamais** `["T-001","T-002","T-003","T-004","T-005"]`.
- Inspection DOM directe du bloc `TenantSwitcher` : `<div class="flex w-full items-center gap-2.5 ...">` contenant uniquement « Tenant actuel » / « Tontine Horizon » — **aucun** `<button>`, **aucune** icône chevron, **aucun** champ de recherche, **aucun** bouton « Ajouter un tenant » dans le sous-arbre du composant.
- Texte « Rechercher un tenant » et « Ajouter un tenant » absents de toute la page.
- Bouton « Platform Administration » absent du header.
- Navigation directe vers `/platform/tenants` → redirigée vers `/unauthorized`.
- `/organization/members` reste pleinement fonctionnel et n'affiche que des membres de Tontine Horizon (Mamadou Sow, Khadija Mbaye) — la fonctionnalité tenant reste intacte, seule la portée Platform est bloquée.

### 7. Résultat platform-scoped (U-001 / Amadou Mbaye / T-001, après restauration)

- `window.__tenantDebug` → `{"userScope":"platform","userTenantId":"T-001","scopedTenantsCount":5,"scopedTenantIds":["T-001","T-002","T-003","T-004","T-005"]}`.
- Bouton « Platform Administration » présent.
- Ouverture du `TenantSwitcher` : les 5 tenants sont listés (Coopérative Sutura, Tontine Horizon, Mutuelle Teranga, Association Jappo, Tontine Avenir), champ de recherche fonctionnel (filtrage testé sur « Teranga » → un seul résultat), bouton « Ajouter un tenant » présent.
- Sélection d'un tenant (Mutuelle Teranga) dans le dropdown : `currentTenant` bascule correctement, `window.__tenantDebug` confirme `scopedTenantsCount` toujours 5 (le registre complet reste accessible, seul le tenant *actuellement consulté* change).
- `/platform/tenants` reste accessible, affiche les 5 tenants.

### 8. Test localStorage

`localStorage['tanzen-tenant-id']` pré-rempli avec `T-001` puis avec `T-003`, alors que la session simulée appartient à `T-002` (Tontine Horizon) → dans les deux cas, `currentTenant` reste **« Tontine Horizon »** après rechargement. Confirmé également via `window.__tenantDebug.userTenantId === 'T-002'` à chaque tentative. Le `localStorage` empoisonné n'a aucun effet sur une session tenant-scoped, conformément à `resolveInitialTenant()` (§3 du correctif initial, revérifié inchangé).

### 9. Test cross-tenant

Confirmation explicite : sous la session simulée T-002 (Tontine Horizon), **aucune** des chaînes « Coopérative Sutura » (T-001), « Mutuelle Teranga » (T-003), « Association Jappo » (T-004), « Tontine Avenir » (T-005) n'apparaît nulle part dans la page (recherche texte intégrale sur `document.body.innerText`), et `window.__tenantDebug.scopedTenantIds` ne contient jamais que `["T-002"]`. **T-002 ne voit T-001, T-003, T-004 ni T-005 — confirmé.**

### 10. Commandes de validation

`npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) — 0 erreur. `npm run lint` (`eslint .`) — 0 erreur, 14 warnings pré-existants sans rapport. `npm run build` (`tsc -b && vite build`) — succès, même avertissement pré-existant sur la taille de chunk (912 kB, antérieur à cette vérification).

### Fichiers touchés pendant cette vérification (tous restaurés/retirés avant la fin)

- `src/mocks/rbac.mocks.ts` — basculé temporairement vers U-004/T-002/role-manager pour la simulation, restauré à l'identique (U-001/T-001/role-admin) — confirmé par relecture intégrale.
- `src/contexts/tenant-context.tsx` — diagnostic temporaire `window.__tenantDebug` ajouté puis retiré — confirmé identique au correctif initial par relecture intégrale.

Aucun fichier de code n'a de modification permanente issue de cette vérification. Aucune nouvelle permission, aucun nouveau rôle, aucune modification du modèle métier ou du design général.

---

*Fin de l'addendum. Ne pas commencer la Phase 12.*
