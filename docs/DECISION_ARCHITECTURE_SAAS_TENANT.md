# TANZEN — Décision architecturale : Site vitrine / SaaS Platform vs Application Tenant-scoped

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié, créé ou supprimé pour produire ce rapport. Ce document est le seul fichier créé par cette mission. Conformément à la consigne, rien n'a été reconstruit ni inventé — ce qui n'existe pas est étiqueté **MISSING / À IMPLÉMENTER**, jamais comblé par hypothèse.

## Méthodologie

Inspection directe de `tanzen-frontend/src` : arbre de routes complet (`src/routes/app-router.tsx`), providers d'application (`src/app/providers.tsx`), contexte de permissions (`src/contexts/permission-context.tsx`), recherche exhaustive de `landing`/`pricing`/`billing`/`subscription`/`checkout`/`marketing`/`login`/`signin` dans tout `src/`, et réutilisation des constats déjà vérifiés lors de la mission précédente sur `TenantContext`/`TenantSwitcher`/le registre des tenants (`docs/PHASE_02_TENANT_ISOLATION_SPEC.md`, code désormais scope-checké).

---

## 1. Inventaire par concept

| Concept | Statut | Détail |
|---|---|---|
| **Landing** | **MISSING** | Aucune trace dans `src/` (recherche insensible à la casse sur `landing`/`marketing`, 0 résultat). |
| **Features (page produit)** | **MISSING** | Idem. |
| **Pricing / Plans (site vitrine)** | **MISSING** | 0 résultat sur `pricing`. `Plans`/`Subscriptions`/`Payments` n'existent que comme entités du dictionnaire canonique citées dans `docs/AUDIT_PHASE_01.md` (Platform Core) — jamais implémentées ici. |
| **Subscription** | **MISSING** | 0 résultat sur `subscription`. |
| **Checkout / Payment / Payment confirmation** | **MISSING** | 0 résultat sur `checkout`. Aucun composant de paiement. |
| **Billing / Invoices / Payment history** | **MISSING** | 0 résultat sur `billing`. |
| **Tenant creation** (au sens SaaS : parcours public post-paiement) | **CONFLIT — existe mais mal placé** | `TenantCreate` (`src/features/organization/organization-module.tsx`, route `/organization/tenants/create`) existe bel et bien, mais c'est une action d'administration **interne**, protégée par `PermissionRoute permission="tenants.read"` **et** par le nouveau `PlatformScopeGuard` (scope `platform` requis) — donc accessible uniquement à un utilisateur déjà authentifié avec les droits Platform. Ce n'est pas le parcours public non-authentifié `Landing → Plans → Souscription → Paiement → Création tenant` décrit dans la décision. |
| **Tenant onboarding / Account creation / Activation** | **MISSING** | Aucun flux d'inscription, aucune page d'activation de compte, aucune notion de « paiement confirmé → tenant activé » dans le code. `Tenant.status` (`pending`/`active`/…) existe comme champ de données, mais aucun écran ne pilote une transition d'activation. |
| **Authentication** | **MISSING** (mock statique, pas de flux réel) | Aucune route `/login`, aucun formulaire de connexion, dans `src/routes/app-router.tsx`. `src/app/providers.tsx` monte directement `TenantProvider`/`PermissionProvider` sans passer par une étape d'authentification. `PermissionProvider` (`src/contexts/permission-context.tsx`) injecte l'utilisateur mocké `currentUser` (`src/mocks/rbac.mocks.ts`) tel quel au démarrage — `user`/`tenantId`/`scope`/`permissions` sont déjà résolus statiquement, jamais via un vrai login. |
| **TenantContext** | **EXISTANT** | `src/contexts/tenant-context.tsx` — déjà inspecté et manipulé lors de la mission précédente (isolation tenant-scope). |
| **TenantSwitcher** | **EXISTANT** | `src/layouts/tenant-switcher.tsx` — déjà scope-checké lors de la mission précédente (étiquette statique si `scope !== 'platform'`). |
| **Tenant Registry** | **EXISTANT mais non séparé architecturalement** | `/organization/tenants`, service `organizationService.listTenants` scope-checké (mission précédente). Vit dans le **même** arbre de routes (`AppRouter`) et le **même** `AppShell` que le reste de l'application tenant-scoped (Finance, Tontines, etc.) — pas dans un espace « Platform Administration » distinct. |
| **Application tenant** (Organization / Finance / Credit / Tontines / Governance / Operations / Audit / Settings) | **EXISTANT (majoritairement)** | 7 modules lazy-loadés + Dashboard, confirmés lors des missions précédentes. |

---

## 2. Validation du parcours cible (10 étapes)

| # | Étape | Statut |
|---|---|---|
| 1 | Client visite le site vitrine | **IMPOSSIBLE** — n'existe pas |
| 2 | Choisit un plan | **IMPOSSIBLE** |
| 3 | Souscrit | **IMPOSSIBLE** |
| 4 | Paie | **IMPOSSIBLE** |
| 5 | Crée son tenant | **PARTIEL** — possible uniquement via une action d'administration interne réservée au platform-scope (`/organization/tenants/create`), pas via un parcours public post-paiement |
| 6 | Son tenant est activé | **PARTIEL** — `Tenant.status` existe comme donnée, aucun flux d'activation piloté |
| 7 | Son administrateur initial est activé | **MISSING** |
| 8 | Il se connecte | **MISSING** — aucune authentification réelle |
| 9 | Il entre dans son application tenant | **EXISTANT** — une fois « connecté » via le mock statique, l'application tenant-scoped fonctionne |
| 10 | Il ne voit aucun autre tenant | **EXISTANT et vérifié** (mission précédente : `listTenants` scope-checké, menu/TenantSwitcher/recherche filtrés, `PlatformScopeGuard` sur le registre) |

**Conclusion** : le parcours décrit dans la demande n'est réalisable aujourd'hui qu'à partir de l'étape 9. Tout ce qui précède (étapes 1 à 8) relève du domaine « SITE VITRINE / SAAS PLATFORM », qui est **intégralement absent** du code actuel.

---

## 3. Conflits identifiés (à ne pas résoudre silencieusement)

1. **Mélange des deux espaces** : la décision demande une séparation stricte entre Platform Context (`Platform → Plans → Subscriptions → Billing → Payments → Tenants`) et Tenant Context (`User → tenantId → TenantContext → Organization/Finance/Credit/…`). Dans le code actuel, le Tenant Registry (concept Platform Context) est une sous-route de `/organization/*`, protégée par les mêmes mécanismes (`PermissionRoute` + `AppShell` partagé) que les modules métier tenant-scoped. Il n'existe pas de séparation d'arbre de routes, de shell, ni de layout entre les deux espaces.
2. **`TenantCreate` mal positionné** : conçu et implémenté comme une action CRUD interne (formulaire dans l'app authentifiée), pas comme l'aboutissement d'un tunnel de souscription/paiement public. Le renommer ou le déplacer sans clarification métier serait inventer un parcours non spécifié — non fait ici.
3. **Aucune authentification réelle** : toute la notion de « scope »/« permissions »/« tenantId » repose sur un mock statique unique (`currentUser`), déjà documenté comme tel dans le code (`mocks/rbac.mocks.ts` : *« pas d'authentification réelle […] à remplacer par un vrai flux de connexion »*). Les étapes 7-8 du parcours cible ne peuvent pas être implémentées sans cette brique.

---

## 4. Décisions nécessaires (non tranchées ici)

- Le domaine SaaS Platform (Landing/Pricing/Subscription/Billing/Payment/Tenant onboarding) doit-il être construit dans **ce** projet (`tenant-frontend`), ou dans un projet/sous-domaine séparé (site public distinct de l'application) ? La décision fournie ne le précise pas techniquement (pas de chemin de fichier, pas de sous-domaine visé).
- Le `TenantCreate` existant doit-il être conservé tel quel comme outil d'administration Platform (création manuelle d'un tenant par un opérateur), en parallèle d'un futur tunnel public, ou doit-il être remplacé ?
- Faut-il séparer techniquement le Platform Context du Tenant Context (arbre de routes/shell distinct) avant de construire le site vitrine, ou traiter cela comme deux chantiers indépendants ?

Ces points sont volontairement laissés ouverts — ils engagent une décision produit que les sources actuelles ne tranchent pas.

---

## 5. Validation technique

`tsc --noEmit` ✅ · `eslint .` ✅ (0 erreur, 14 warnings pré-existants sans rapport avec cette mission) · `vite build` ✅. Aucun mécanisme existant n'a été modifié — ces trois commandes confirment simplement que l'état actuel du code (issu de la mission précédente) reste sain.

---

*Fin du rapport. Aucun fichier autre que `docs/DECISION_ARCHITECTURE_SAAS_TENANT.md` n'a été créé ou modifié.*
