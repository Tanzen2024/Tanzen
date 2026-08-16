# TANZEN — Architecture finale : Commercial / Platform / Tenant

**Statut : document de consolidation.** Ce fichier ne décrit aucune nouvelle implémentation — il rassemble, sous les noms et la structure demandés par le mandat « TANZEN — REFACTORING ARCHITECTURAL FINAL », une architecture déjà construite et vérifiée au fil de plusieurs missions antérieures. Les sources primaires, non dupliquées ici en détail, restent :

- `docs/DECISION_ARCHITECTURE_SAAS_TENANT.md` — constat initial (domaine Public/SaaS entièrement `MISSING`).
- `docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md` — décision d'architecture à 3 espaces (Décisions A/B/C).
- `docs/MIGRATION_SITE_VITRINE_REPORT.md` + `docs/POST_MIGRATION_VALIDATION_REPORT.md` — exécution et validation de la migration du site vitrine.
- `docs/ARCHITECTURE_PLATFORM_TENANT_FINAL.md` — reconfirmation de l'état réel par inspection directe, écarts E1-E8.
- `docs/FIX_TENANT_SWITCHER_ISOLATION.md` — correctif + addendum de vérification runtime de l'isolation `TenantSwitcher`/`TenantContext`.
- `docs/PHASE_02_TENANT_ISOLATION_SPEC.md` — spécification d'isolation appliquée Phases 6-11.
- `docs/PHASE_12_INTEGRATION_TESTS_REGRESSION.md` — suite Vitest/RTL automatisée (123 tests) couvrant l'isolation.

**Re-vérifié en direct pour ce document** (2026-08-16) : lecture ligne à ligne de `src/routes/app-router.tsx`, `src/contexts/tenant-context.tsx`, `src/layouts/tenant-switcher.tsx`, `src/routes/platform-scope-route.tsx` — conforme à ce qui est décrit ci-dessous. `npm run typecheck` (0 erreur), `npm run lint` (0 erreur, 16 warnings pré-existants inchangés), `npm run test` (123/123 tests), `npm run build` (succès) — tous exécutés avant rédaction de ce document, aucune régression.

---

## 1. Architecture globale

```
TANZEN
  │
  ├── PUBLIC / SAAS          (non authentifié)
  │     src/features/public/ → PublicModule → PublicShell
  │     Landing · Features · Pricing · Sign In/Up · Subscribe · Downloads · Docs
  │
  ├── PLATFORM ADMINISTRATION (authentifié, scope === 'platform')
  │     src/features/platform/ → PlatformModule → PlatformShell
  │     Tenant Registry (create/edit/detail)
  │
  └── TENANT APPLICATION      (authentifié, tenantId courant)
        src/features/{dashboard,organization,finance,tontines,
        operations,access,audit,settings}/ → AppShell
```

Trois arbres de routes React Router **structurellement distincts** dans `src/routes/app-router.tsx` (un seul fichier, trois `<Route>` de premier niveau), pas un arbre unique avec filtrage dispersé. Un visiteur anonyme ne charge jamais le bundle de l'Application Tenant ni celui de Platform (tous deux `React.lazy`).

## 2. Public Context

`src/features/public/` (`PublicModule`) — Landing, Features, Pricing/Plans, Sign In, Sign Up, Subscribe (tarification interactive), Downloads, Docs. Layout `PublicShell` (`src/layouts/public-shell.tsx`) : **zéro import** de `TenantContext`/`PermissionContext` — confirmé par grep, ne consomme que `Navbar`/`Footer` de `src/features/public/components`. Aucune dépendance à `tenantId`/`scope` par construction. Le site vitrine Next.js legacy (source de la migration) est conservé, archivé (pas supprimé) sous `_archive/landing-nextjs-legacy/` — voir §16.

## 3. Platform Context

`src/features/platform/` (`PlatformModule`), layout `PlatformShell` (`src/layouts/platform-shell.tsx` — consomme `useLocale`, pas `TenantContext`). Monté sous `/platform/*`, gardé au sommet de l'arbre par `PlatformScopeGuard` (garde unique, pas un filtrage route par route). Contenu actuel : Tenant Registry uniquement (liste, création `PlatformTenantCreate`, édition, fiche détail). Billing/Subscriptions/Plans/Payments Platform : domaine **absent**, jamais spécifié par aucune source — voir §15 (Backend pending) et le document séparé des décisions à valider.

## 4. Tenant Context

`AppShell` (`src/layouts/app-shell.tsx`, inchangé depuis les Phases 1-11) + les 8 modules métier (Dashboard statique, 7 domaines lazy-loadés). Un utilisateur tenant-scoped n'est jamais rattaché qu'à un seul tenant (`currentUser.tenantId`) — aucune sélection possible (§8, §12).

## 5. Parcours commercial (cible conceptuelle vs état réel)

Cible en 17 étapes (visiteur → plan → souscription → compte → infos organisation → paiement → tenant créé → admin initial → activation → connexion → application tenant) : **conceptuellement actée**, **partiellement construite**. `SubscribePage` (`src/features/public/subscribe-page.tsx`) construit l'UI complète (sélection de plan, calcul de prix modulaire en temps réel, formulaire) mais n'appelle aucun service de création réelle — l'écran de succès redirige directement vers `/dashboard` sans jamais transiter par un statut `pending → active`. Rien n'est simulé de façon trompeuse : la partie qui *peut* exister sans backend (présentation, calcul, navigation) est construite ; la partie qui *ne peut pas* exister sans backend (paiement réel, création de tenant persistée, activation) est honnêtement absente. Voir §6, §15.

## 6. Création automatique du tenant

**N'appartient plus à l'Application Tenant.** Le formulaire de création de tenant (`TenantForm`/`validateTenant`/`useTenantFormValues`/`TenantFormValues`/`TenantFormErrors`) a été extrait dans `src/features/organization/tenant-form.tsx`, partagé entre :
- **`PlatformTenantCreate`** (`src/features/platform/platform-module.tsx`, route `/platform/tenants/create`) — action d'administration Platform existante : formulaire simple, création immédiate par un opérateur `scope=platform`. `organizationService.createTenant` fixe déjà `status: 'pending'` par défaut sur tout nouveau tenant.
- **`SaaSTenantOnboarding`** (tunnel multi-étapes post-paiement) — **non construit**, `BACKEND PENDING` : aucune source ne spécifie le mécanisme de paiement/activation réel, et le construire de façon simulée créerait une fausse impression de fonctionnement (règle anti-invention du mandat, §26). Réutiliserait le même triplet `TenantInput`/`validateTenant`/`TenantForm` le jour où il sera construit.

Séquence cible documentée (non codée, car dépend d'un backend inexistant) : `Payment confirmed → createTenant(pending) → Create Initial Admin User → Associate User → Tenant → Activate Tenant → Tenant Application`.

## 7. Authentication

**Aucune authentification réelle — `BACKEND PENDING`, explicite dans le code.** `PermissionProvider` (`src/contexts/permission-context.tsx`) injecte `currentUser` directement depuis `src/mocks/rbac.mocks.ts`, un objet statique unique, jamais issu d'un login. `SignInPage`/`SignUpPage` ignorent `email`/`password`, attendent 1s puis naviguent inconditionnellement vers `/dashboard` — toujours le même `currentUser` mocké, quel que soit ce qui est saisi. Aucun JWT, aucune session, aucun endpoint `/auth/*` n'a été inventé, conformément à la règle anti-invention (§8, §25, §26 du mandat).

## 8. Tenant isolation

Garantie à plusieurs niveaux indépendants (defense in depth, §27 du mandat) :

1. **Chargement des données** : `TenantContext.tenants` (`src/contexts/tenant-context.tsx`) ne contient qu'un seul élément pour un utilisateur `scope !== 'platform'` — filtré **à la source** (`scopedTenants`, calculé au niveau module), pas seulement masqué en aval par l'UI. Aucune donnée des autres tenants n'entre dans le state React.
2. **`localStorage` non fiable** : `resolveInitialTenant()` ignore totalement `localStorage['tanzen-tenant-id']` pour un utilisateur tenant-scoped — résout toujours vers `currentUser.tenantId`, même si le `localStorage` pointe vers un autre tenant (poison test couvert par `tenant-scope.test.ts` et l'addendum de `docs/FIX_TENANT_SWITCHER_ISOLATION.md`).
3. **Changement de tenant bloqué** : `setCurrentTenant`/`setCurrentTenantId` sont des no-op silencieux hors `scope === 'platform'`, indépendamment de toute UI qui tenterait de les appeler.
4. **Isolation métier par service** : chaque service (`organization.service.ts`, `finance.service.ts`, `credit.service.ts`, `tontines.service.ts`, `document.service.ts`, `workflow.service.ts`, `audit.service.ts`, `settings.service.ts`) filtre par `tenantId` via `getTenantScoped()` ou équivalent — testé exhaustivement (14 fichiers `*.service.test.ts`, pattern ALLOW/DENY/indistinguabilité, §2 de `docs/PHASE_12_INTEGRATION_TESTS_REGRESSION.md`).
5. **Routes Platform protégées** : `PlatformScopeGuard` redirige tout `scope !== 'platform'` vers `/unauthorized`.

Le frontend n'est **jamais** l'autorité de sécurité finale — doctrine actée dans `docs/PHASE_02_TENANT_ISOLATION_SPEC.md` §11-12 : une vérification serveur (`authenticatedUser.tenantId == resource.tenantId`) reste requise le jour où un backend existe (§15).

## 9. Platform Administration

Espace structurellement séparé (`/platform/*`, `PlatformShell`), gardé par `PlatformScopeGuard` au sommet de l'arbre. Permet aujourd'hui : liste des tenants, création (`PlatformTenantCreate`), édition, fiche détail. Un utilisateur `scope=platform` peut aussi naviguer dans l'Application Tenant (comportement voulu du rôle `role-admin` mocké — Décision A de `DECISION_PLATFORM_SAAS_TENANT_FINAL.md` : même authentification/`PermissionContext`, pas deux applications indépendantes).

## 10. RBAC

Catalogue existant réutilisé tel quel, aucune permission inventée. Permissions Platform confirmées dans `src/mocks/rbac.mocks.ts` : `tenants.read`, `tenants.create`, `tenants.update`. Permissions Billing/Subscriptions/Payments/Plans Platform **n'existent pas** dans le catalogue — cohérent avec le domaine entier `MISSING` (§9, §15) ; ne pas les inventer silencieusement, cf. document séparé des décisions à valider. Permissions Tenant (members/governance/finance/credit/tontines/documents/…) inchangées depuis les Phases 6-11, RBAC appliqué **en plus** de l'isolation tenant, jamais en remplacement (`PHASE_02_TENANT_ISOLATION_SPEC.md` §11).

## 11. Routes

```
/                       → Public (PublicModule, catch-all "/*")
/pricing, /signup, ...  → Public
/platform/*             → PlatformShell, PlatformScopeGuard (scope=platform)
/platform/tenants*      → Tenant Registry
/dashboard               → AppShell (Tenant Application, statique)
/organization/*          → AppShell (lazy)
/finance/*, /tontines/*, /operations/*, /access-security/*,
/audit/*, /settings/*    → AppShell (lazy)
/unauthorized, /404      → AppShell
```

Chemins exacts conservés tels qu'implémentés (pas de préfixe `/app` forcé) — conforme au mandat §7 (« le chemin exact peut être conservé si l'architecture actuelle impose d'autres routes »). Aucune route `/organization/tenants*` résiduelle : le registre a été entièrement déplacé sous `/platform/tenants*`.

## 12. TenantContext

`src/contexts/tenant-context.tsx` — mécanisme unique, aucun doublon. Résout `currentTenant`/`tenants` depuis `currentUser.scope`/`currentUser.tenantId` (mock, cf. §7). Comportement détaillé en §8.

## 13. TenantSwitcher

`src/layouts/tenant-switcher.tsx` — pour `user.scope !== 'platform'` : rendu d'une étiquette statique non interactive (`<div>`, aucun `<button>`), affichant uniquement « Tenant actuel » + nom du tenant. Aucune recherche, aucun « Ajouter un tenant », aucune liste d'autres tenants — vérifié par lecture directe du code (pas de branche cachée par CSS) et par test automatisé (`tenant-switcher.test.tsx`). Pour `scope === 'platform'` : dropdown complet, recherche, ajout — comportement attendu et volontairement différent (§12 du mandat).

## 14. Data isolation

Voir §8 pour le détail des 5 niveaux. Domaines vérifiés : Organization, Members, Governance, Finance, Credit, Tontines, Operations, Workflows, Documents, Notifications (double vérification `tenantId` + `userId`), Audit, Settings. Un gap connu et documenté (non lié à ce mandat) : `financeService.listContributionsByMember(memberId)` n'a pas de paramètre `tenantId` — sûr aujourd'hui uniquement parce que son seul point d'appel obtient déjà un `memberId` tenant-scopé en amont (`docs/PHASE_12_INTEGRATION_TESTS_REGRESSION.md` §2).

## 15. Backend pending

Aucune authentification réelle, aucun JWT, aucun paiement réel, aucun webhook, aucune persistance réelle (tout en mocks mémoire) — non inventés, conformément à la règle anti-invention. Éléments explicitement `BACKEND PENDING` :
- Login/session/logout réels ; résolution serveur de `tenantId`/`scope`/`permissions` (jamais calculée côté client à terme).
- Endpoints `Plan`/`Subscription`/`Payment`/`Invoice` (Billing SaaS) — domaine Platform actuellement limité au Tenant Registry.
- Endpoint de création de tenant côté tunnel SaaS avec statut `pending → active`, mécanisme de token/lien d'activation pour l'administrateur initial.
- Passerelle de paiement (fournisseur non spécifié par aucune source).
- Vérification serveur `authenticatedUser.tenantId == resource.tenantId` sur chaque requête (le frontend fait déjà tout ce qu'il peut : filtrage systématique, jamais de confiance dans un ID transmis sans re-filtrage service).

## 16. Limitations actuelles

- `landing/` (Next.js, source de la migration) a été **archivé** vers `_archive/landing-nextjs-legacy/`, pas supprimé — décision validée explicitement par Hugues lors d'une mission antérieure (`docs/ARCHITECTURE_PLATFORM_TENANT_FINAL.md` §11). Le mandat courant décrit `landing/` comme existant à son emplacement d'origine (`tanzen-frontend/landing`) : ce n'est plus le cas suite à cette décision déjà actée — signalé ici pour transparence, non ré-ouvert sans nouvelle instruction explicite.
- Domaine Platform Billing/Subscriptions/Payments entièrement absent (§9, §15) — ne pas inventer sans spécification produit.
- `SubscribePage` ne persiste rien au-delà de la session navigateur (§5, §6).
- Pas de séparation monorepo (`apps/marketing`/`apps/app`) — un seul dépôt, une seule build (Décision C de `DECISION_PLATFORM_SAAS_TENANT_FINAL.md`), avec une frontière de code déjà nette (`PublicShell` sans import croisé) qui permettrait une extraction mécanique future si nécessaire.

## 17. Tests réalisés

Exécutés le 2026-08-16 avant rédaction de ce document (résultats identiques à `docs/PHASE_12_INTEGRATION_TESTS_REGRESSION.md`, reconfirmés, aucune régression) :
- `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) — **0 erreur**.
- `npm run lint` (`eslint .`) — **0 erreur**, 16 warnings pré-existants (`react-refresh/only-export-components`), aucun nouveau.
- `npm run test` (`vitest run`) — **17 fichiers, 123 tests, 100% de réussite**, incluant la matrice d'isolation tenant complète (ALLOW/DENY/localStorage empoisonné/PLATFORM BYPASS) et les 3 fichiers ciblés isolation UI (`tenant-switcher.test.tsx`, `platform-scope-route.test.tsx`, `permission-gate.test.tsx`).
- `npm run build` (`tsc -b && vite build`) — succès, même avertissement pré-existant de taille de chunk (non lié à ce mandat, cf. la passe performance documentée dans la mémoire projet — hors périmètre ici).
- Vérification runtime navigateur antérieure (CDP, `docs/FIX_TENANT_SWITCHER_ISOLATION.md` §8 et addendum §5-9) : session tenant-scoped simulée (U-004/T-002) → aucune fuite textuelle des 4 autres tenants, `TenantSwitcher` sans bouton ni recherche, `/platform/*` redirige vers `/unauthorized`, `localStorage` empoisonné sans effet ; session platform-scoped (U-001/T-001) → registre complet accessible, comportement inchangé.

---

*Fin du document. Consolidation uniquement — voir `docs/FINAL_ARCHITECTURE_DECISIONS_A_VALIDER.md` pour les points nécessitant un arbitrage produit ou backend réel.*
