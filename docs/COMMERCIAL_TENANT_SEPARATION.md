# TANZEN — Séparation Commercial / Tenant / Mobile

Document de référence créé par la mission « EXÉCUTION DE LA SÉPARATION
COMMERCIAL / TENANT » (2026-08-16), §21. Explique la séparation en trois
applications indépendantes pour quiconque rejoint l'un des trois projets
sans avoir suivi la migration. Une copie identique vit dans
`tanzen-commercial/docs/` (les deux projets sont désormais des dépôts git
séparés — chacun doit pouvoir se comprendre seul).

## Pourquoi trois applications séparées

```
C:\xampp\htdocs\tanzen\
├── tanzen-commercial\   Public/SaaS + Platform Administration
├── tanzen-frontend\     Application Tenant (web)
└── tanzen-mobile\       Application Tenant (mobile)
```

Avant cette séparation, Public/Platform/Tenant vivaient dans **un seul**
projet React, séparés uniquement par le routage (trois arbres de routes
distincts sous un même `AppRouter`). Cette séparation logique existait déjà
et avait été vérifiée (123 tests d'intégration, isolation tenant
confirmée) — voir `docs/FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` pour son
historique.

La mission de 2026-08-16 a rendu cette séparation **physique** : deux
projets npm/git indépendants, chacun démarrable seul (`npm install && npm
run dev`), avec son propre `package.json`, ses propres tests, sa propre
configuration. Raison : un utilisateur tenant ne doit **structurellement**
plus pouvoir atteindre Platform Administration ou le tunnel commercial —
"absent du code déployé", pas seulement "cachée par une garde de route".
Un opérateur commercial/plateforme, à l'inverse, n'a besoin d'aucun accès
aux données métier internes d'un tenant (Members/Loans/Tontines/...).

## Ce qui appartient au Commercial (`tanzen-commercial`)

- **Public/SaaS** (non authentifié) : Landing, Features, Pricing,
  Subscription (calculateur historique), Signup, Checkout, Payment
  (+ Success/Cancel), Downloads, Docs.
- **Platform Administration** (`scope: 'platform'` uniquement) : Dashboard,
  Tenant Registry, Tenant Administration, Plans, Subscriptions, Payments,
  Billing, Platform Audit.
- Provisioning de tenant (création du `Tenant`/`Subscription`/`Payment` à
  l'issue du tunnel Checkout → Payment) — `BACKEND PENDING` pour
  l'activation réelle du tenant et de son administrateur (aucun email,
  aucun lien d'activation, aucune session créée).

## Ce qui appartient au Tenant (`tanzen-frontend` + `tanzen-mobile`)

Login, Dashboard, Organization (Members/Governance), Finance, Credit,
Tontines, Operations (Workflows/Documents/Notifications), Audit, Settings,
Access & Security. Chaque utilisateur tenant n'a accès qu'aux données de
**son** organisation — jamais au registre complet des tenants, jamais à
Platform Administration, jamais à un sélecteur de tenant.

## Ce qui appartient au Mobile (`tanzen-mobile`)

Strictement Tenant Application, comme `tanzen-frontend` — non modifié par
cette séparation (elle ne concernait que les deux projets web). Aucune
fonctionnalité Commercial/Platform n'y a été ni n'y sera ajoutée.

## Comment fonctionne l'isolation

- `TenantContext` (`tanzen-frontend`) résout **un seul** tenant — celui de
  `currentUser.tenantId` — sans mécanisme de sélection, sans lecture de
  `localStorage` pour un autre tenant.
- `getTenantScoped()` (`tanzen-frontend/src/services/tenant-scope.ts`) :
  chaque service métier tenant-scoped l'utilise plutôt que de dupliquer la
  vérification `tenantId` — ressource absente ou appartenant à un autre
  tenant produit systématiquement le même écran "introuvable".
- `PlatformScopeGuard` (`tanzen-commercial`) garde `/platform/*` — n'existe
  plus du tout dans `tanzen-frontend` (pas seulement "non monté", le
  fichier lui-même n'est plus présent dans ce projet).
- Isolation vérifiée en direct (Playwright) après la séparation : aucune
  des routes `/pricing`, `/checkout`, `/payment`, `/billing`, `/subscribe`,
  `/signup`, `/platform/*` n'existe dans `tanzen-frontend` (404 confirmé) ;
  `tanzen-commercial` sert normalement Public et Platform.

## Comment le tenant est résolu

Aujourd'hui (mock, sans backend) : `currentUser.tenantId`
(`src/mocks/rbac.mocks.ts`, dupliqué à l'identique dans les deux projets
web) détermine le tenant courant dans `tanzen-frontend`. Il n'existe pas de
session serveur réelle — `currentUser` est une constante statique, pas un
état d'authentification. Le jour où un vrai backend existera, cette
résolution se fera côté serveur à partir d'une session authentifiée ; le
point d'insertion côté frontend est déjà identifié (`AuthGuard`, voir
`TENANT_APPLICATION_ARCHITECTURE.md` §3).

## Comment fonctionne l'authentification (aujourd'hui / future)

**Aujourd'hui** : simulée. `/login` (`tanzen-frontend`) affiche un
formulaire, simule un délai, redirige vers `/dashboard` sans jamais
vérifier d'identifiants réels. `AuthGuard` est un passthrough documenté —
il ne bloque jamais l'accès.

**Future (`BACKEND PENDING`)** : `AuthGuard` deviendra le point de
vérification de session réelle (redirection vers `/login` si absente), sans
changer sa position dans l'arbre de routes. `tanzen-commercial` n'aura
jamais besoin d'authentification pour sa partie Public ; sa partie Platform
continuera de vérifier `scope: 'platform'` via un mécanisme équivalent à
`PlatformScopeGuard`, connecté à un vrai système d'authentification
opérateur/plateforme (distinct de celui des utilisateurs tenant).

## Fonctionnalités BACKEND PENDING

- Authentification réelle (Tenant et Platform) — simulée des deux côtés
  aujourd'hui.
- Passerelle de paiement réelle — `PaymentPage` (`tanzen-commercial`)
  simule un paiement instantané réussi, aucun provider intégré.
- Activation réelle d'un tenant après paiement (`pending → active`) et
  création de son administrateur initial (lien d'activation, définition de
  mot de passe).
- Synchronisation des données entre `tanzen-commercial` et
  `tanzen-frontend` : sans backend partagé, chaque projet garde sa **propre
  copie en mémoire** de `mocks/organization/tenants.ts`/`mocks/rbac.mocks.ts`.
  Un tenant créé via le Checkout de `tanzen-commercial` **n'apparaît pas**
  automatiquement dans `tanzen-frontend` — limite structurelle d'une
  architecture mock à deux processus séparés, qui disparaît avec un vrai
  backend partagé.
- Portail de facturation self-service côté Public — l'équivalent existe
  côté Platform (`/platform/billing`, vue admin sur tous les tenants).

## Documents liés

- `docs/COMMERCIAL_TENANT_MIGRATION_PLAN.md` — plan de migration (fichier
  par fichier, avant exécution).
- `docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md` — plan d'exécution technique
  détaillé.
- `docs/COMMERCIAL_TENANT_MIGRATION_REPORT.md` — rapport final d'exécution.
- `TENANT_APPLICATION_ARCHITECTURE.md` (`tanzen-frontend`) — architecture
  détaillée de l'Application Tenant après séparation.
- `COMMERCIAL_PLATFORM_ARCHITECTURE.md` (`tanzen-commercial`) — architecture
  détaillée de Public + Platform (historique de construction + mise à jour
  post-séparation).
