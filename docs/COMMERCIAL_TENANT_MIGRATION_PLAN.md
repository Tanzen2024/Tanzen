# TANZEN — Plan de migration Commercial / Platform / Tenant

Document requis par le mandat "SÉPARATION APPLICATION COMMERCIALE / TENANT"
(2026-08-16) avant tout déplacement de fichier, conformément à sa section 25.
**Aucun fichier n'a été déplacé, supprimé ou modifié pour produire ce
document** — il est le résultat d'une inspection en lecture seule de
`tanzen-frontend`, `tanzen-commercial` et `tanzen-mobile`.

---

## 1. État actuel

`C:\xampp\htdocs\tanzen\tanzen-frontend` est aujourd'hui une application
React/Vite/TypeScript unique qui contient déjà, **séparés logiquement par
routage** (pas par projet), trois domaines :

- **Public/SaaS** (non authentifié) : Landing, Features, Pricing,
  Subscription (calculateur volumétrique historique), Checkout, Payment
  (+ Success/Cancel), Downloads, Docs, Signin, Signup — montés sous
  `PublicShell`, servis par le catch-all `path="*"` de
  `src/routes/app-router.tsx`.
- **Platform Administration** : Dashboard, Tenants (registre complet),
  Plans, Subscriptions, Payments, Billing, Platform Audit — montés sous
  `/platform/*`, gardés par `PlatformScopeGuard` (exige
  `user.scope === 'platform'`), affichés dans `PlatformShell`.
- **Tenant Application** : Dashboard, Organization (Members/Governance),
  Finance, Credit, Tontines, Operations, Documents, Workflows, Audit,
  Settings, Access & Security — montés sous `AppShell`, chaque route
  protégée individuellement par `PermissionRoute`.

Cette séparation logique existe depuis la mission "REFACTORING
ARCHITECTURAL FINAL" (voir `docs/FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md`)
et a été vérifiée à plusieurs reprises (123 tests d'intégration couvrant
l'isolation tenant, aucune fuite cross-tenant, `TenantSwitcher` neutralisé
pour les utilisateurs tenant). C'est cette séparation logique préexistante
qui rend la séparation **physique** (deux projets npm/git distincts)
possible sans réécrire les modules métier.

Il n'existe **aucun backend réel** : toutes les données sont des tableaux
TypeScript en mémoire sous `src/mocks/**`, consommés via des fonctions
`*.service.ts` qui simulent une latence réseau (`mockRequest`,
`MOCK_API_DELAY = 300 ms`). Aucune authentification réelle
(`currentUser` est une constante mockée dans `src/mocks/rbac.mocks.ts`).

Git : branche `feature/commercial-platform`, aucun remote configuré, un
seul commit (`36a6338 Initialization tanzen-frontend`), pas d'historique à
préserver au-delà de l'état de travail actuel.

`C:\xampp\htdocs\tanzen\tanzen-commercial` existe déjà comme dossier vide
avec un `.git` initialisé (branche `master`, aucun commit, aucun remote) —
vraisemblablement préparé à l'avance pour cette mission.

`C:\xampp\htdocs\tanzen\tanzen-mobile` est un projet Expo/React Native
indépendant, déjà strictement Tenant Application (Login → tenantId →
Tenant Application). Il n'est pas concerné par cette migration et ne sera
pas modifié (mandat §22).

---

## 2. Architecture cible

```
C:\xampp\htdocs\tanzen\
├── tanzen-commercial\        Public/SaaS + Platform Administration
├── tanzen-frontend\          Tenant Application uniquement
└── tanzen-mobile\            Tenant Application (mobile, inchangé)
```

`tanzen-commercial` et `tanzen-frontend` sont deux projets Vite/React
indépendants, chacun avec son propre `package.json`, son propre routeur
racine, son propre `.env.example`, capables de tourner simultanément sur
deux ports différents (`npm run dev` dans chacun).

---

## 3. Fichiers Public identifiés (→ tanzen-commercial)

Tous sous `src/features/public/` :
`landing-page.tsx`, `features-page.tsx`, `pricing-page.tsx`,
`checkout-page.tsx`, `payment-page.tsx`, `payment-success-page.tsx`,
`payment-cancel-page.tsx`, `subscribe-page.tsx` (calculateur volumétrique
historique, conservé — atteignable depuis Pricing), `downloads-page.tsx`,
`docs-page.tsx`, `signup-page.tsx`, `public-module.tsx` (routeur du
domaine), `components/{navbar,footer,cta,logo,hero,trust-logos,
features-section}.tsx`.

**Cas particulier `signin-page.tsx`** : ne suit PAS ce groupe tel quel —
voir section 9 (Routes) et section 14 (Stratégie).

---

## 4. Fichiers Platform identifiés (→ tanzen-commercial)

- `src/features/platform/platform-module.tsx` (Dashboard, Tenants list/
  create/detail/edit/settings, Plans, Subscriptions, Payments, Billing,
  Platform Audit, widget `TenantCommercialInfo`)
- `src/layouts/platform-shell.tsx`
- `src/routes/platform-scope-route.tsx` + `platform-scope-route.test.tsx`
- `src/services/platform-commercial.service.ts`
- `src/mocks/platform/{plans,subscriptions,payments,invoices,
  platform-audit,index}.ts`
- `src/features/organization/tenant-form.tsx` (`TenantForm`,
  `useTenantFormValues`, `validateTenant`) — ses 3 seuls appelants
  (`PlatformTenantCreate`, `TenantEdit` dans `platform-module.tsx`, et
  `CheckoutPage`) déménagent tous vers tanzen-commercial
- Sous-ensemble écriture de `organization.service.ts` :
  `createTenant`, `updateTenant` (jamais appelés depuis le futur
  tanzen-frontend)

---

## 5. Fichiers Tenant identifiés (→ reste dans tanzen-frontend)

- `src/features/dashboard/dashboard-overview.tsx`
- `src/features/organization/organization-module.tsx` (Members +
  Governance uniquement — le registre des tenants en a déjà été retiré
  lors d'une mission précédente, cf. commentaire ligne 317 du fichier)
- `src/features/{finance,tontines,operations,access,audit,settings}/
  *-module.tsx` et leurs sous-composants
- Sous-ensemble lecture de `organization.service.ts` : `listMembers`,
  `getMember`, `createMember`, `updateMember`, `listAssemblies`,
  `listMeetings`, `listVotes`, `listBoardMembers`, `createAssembly`,
  `createMeeting`, `updateMeetingMinutes`, `createBoardMember`,
  `endBoardMandate`, `createVote`, `updateVoteResult`
- Tous les services `{dashboard,finance,credit,tontines,document,
  workflow,notification,audit,settings,user,session,role}.service.ts` +
  leurs fichiers de test
- `src/services/tenant-scope.ts` (`getTenantScoped`)
- `src/routes/permission-route.tsx` (`PermissionRoute`)
- Tous les mocks tenant-scoped : `organization/{members,governance}.ts`,
  `finance/**`, `tontines/**`, `operations/**`, `access/{sessions,
  users}.ts`, `audit/**`, `settings/**`, `dashboard.ts`

---

## 6. Services concernés

| Service | Destination | Note |
|---|---|---|
| `platform-commercial.service.ts` | Commercial (move) | zéro usage tenant |
| `organization.service.ts` | **Scindé** | Members/Governance → Tenant ; `createTenant`/`updateTenant` → Commercial ; `listTenants`/`getTenant` → dupliqués (voir §12) |
| `tenant-scope.ts` | Tenant (keep) | non utilisé côté Platform (qui filtre par `.filter()` simple) |
| `api-client.ts` | Dupliqué (share) | `mockRequest`/`MOCK_API_DELAY`, générique |
| `dashboard/finance/credit/tontines/document/workflow/notification/audit/settings/user/session/role.service.ts` | Tenant (keep) | aucune référence Platform/Public trouvée (vérifié par grep) |

---

## 7. Types concernés

| Type | Destination | Note |
|---|---|---|
| `Plan`, `Subscription`, `Payment`, `Invoice`, `PlatformAuditEvent` (`src/mocks/platform/*`) | Commercial (move) | |
| `Tenant` (`src/mocks/organization/tenants.ts`) | **Partagé, dupliqué** | Commercial : registre complet. Tenant : lecture de son propre tenant (`TenantContext`) + typage `tenantName` dans Members/Finance/etc. |
| `Member`, `Assembly`, `Meeting`, `Vote`, `BoardMember` (`organization/governance.ts`, `organization/members.ts`) | Tenant (keep) | |
| `PlatformScope`, `SystemRole`, `CurrentUser`, `Permission` (`rbac.mocks.ts`) | **Partagé, dupliqué** | les deux apps gardent leur propre `currentUser` mocké identique |
| `TableColumn<T>` (`src/types/ui.ts`) | Dupliqué (share) | générique, utilisé par le design-system des deux apps |

Aucun type n'est dupliqué "par accident" — chaque duplication ci-dessus
est documentée avec sa raison (absence de backend/session partagée).

---

## 8. Mocks concernés

| Mock | Destination |
|---|---|
| `mocks/platform/**` | Commercial (move) |
| `mocks/organization/tenants.ts` | **Dupliqué** dans les deux (voir §12) |
| `mocks/organization/{members,governance}.ts` | Tenant (keep) |
| `mocks/{finance,tontines,operations,access,audit,settings}/**`, `mocks/dashboard.ts` | Tenant (keep) |
| `mocks/rbac.mocks.ts` | **Dupliqué** dans les deux |

**Limite structurelle documentée** : sans backend réel, les deux copies de
`mocks/organization/tenants.ts` (et de `rbac.mocks.ts`) vivent dans deux
processus Node séparés et ne se synchronisent jamais à l'exécution. Un
tenant créé via le tunnel Checkout de tanzen-commercial n'apparaîtra pas
automatiquement dans tanzen-frontend. C'est une conséquence inévitable de
l'absence de backend (explicitement `BACKEND PENDING`, mandat §21), pas un
défaut de cette migration — elle disparaît le jour où un vrai backend
partagé existe. Documentée en détail dans `docs/COMMERCIAL_TENANT_SEPARATION.md`
(à créer pendant l'exécution, cf. mandat §33).

---

## 9. Routes concernées

**Tanzen Commercial** (nouveau routeur, calqué sur l'actuel `PublicModule`
+ le bloc `/platform/*` de `app-router.tsx`) :

```
/                    Landing
/features            Features
/pricing             Pricing
/subscribe           Subscription (calculateur historique)
/checkout            Checkout
/payment              Payment
/payment/success      Payment confirmation
/payment/cancel        Payment cancel
/signup               Signup / Onboarding commercial
/downloads            Downloads
/docs                 Docs
/platform/dashboard              Platform Dashboard
/platform/tenants                Tenant registry
/platform/tenants/create         Tenant creation (Platform)
/platform/tenants/:id            Tenant detail
/platform/tenants/:id/edit       Tenant edit
/platform/tenants/:id/settings   Tenant settings
/platform/plans                  Plans
/platform/subscriptions          Subscriptions
/platform/payments               Payments
/platform/billing                Billing
/platform/audit                  Platform Audit
```

**Tanzen Frontend** (nouveau routeur, réduit à l'actuel bloc `AppShell`) :

```
/login                Login (déplacé depuis signin-page.tsx, voir §14)
/dashboard            Dashboard
/organization/*       Members, Governance
/finance/*            Comptes, transactions, contributions, distributions
/credit/*             Demandes, prêts, remboursements, garants (sous /finance aujourd'hui — inchangé)
/tontines/*           Tontines, cycles, tirages, gagnants
/operations/*         Workflows, notifications, documents
/access-security/*    Utilisateurs, rôles, permissions, sessions, MFA
/audit/*              Vue d'ensemble, journaux, événements sécurité
/settings/*           Organisation, localisation, exercices, branding, ...
/unauthorized
/404
```

**Routes supprimées de tanzen-frontend** : `/`, `/pricing`, `/subscribe`,
`/checkout`, `/payment*`, `/signup`, `/downloads`, `/docs`, `/features`,
`/platform/*` — aucune de ces routes n'existera plus dans ce projet.

**Routes ajoutées à tanzen-commercial** : aucune nouvelle route métier ;
`/platform/*` et les routes Public existent déjà, seul leur projet hôte
change.

---

## 10. Layouts concernés

| Layout | Destination |
|---|---|
| `PublicShell` | Commercial (move) |
| `PlatformShell` | Commercial (move) |
| `AppShell` (+ `ShellHeader`, `ShellSidebar`, `TenantSwitcher`) | Tenant (keep, inchangé) |
| **`AuthShell`** (nouveau, minimal) | Tenant (à créer pendant l'exécution — wrapper léger pour `/login`, sans sidebar/TenantSwitcher, cf. mandat §10) |

---

## 11. Dépendances (`package.json`)

Un seul `package.json` existe aujourd'hui pour l'app unique. Après
séparation, comparaison des usages réels (grep des imports) :

- **Tanzen Commercial n'a pas besoin de** : aucune dépendance n'est
  strictement "tenant-only" au niveau package (le kit UI Radix/shadcn est
  utilisé par les deux). Aucune suppression agressive n'est justifiée à ce
  stade — le mandat §19 interdit de supprimer une dépendance sans
  certitude. Recommandation : copier `package.json` intégralement dans les
  deux projets (Option A, §17), puis ne retirer que les dépendances dont
  `npm run build` + une recherche d'import confirment l'absence totale
  d'usage dans chaque projet respectif (`recharts`/`react-day-picker`
  utilisés seulement par les graphiques Dashboard/Finance → tenant
  uniquement, à vérifier avant suppression côté commercial ; `embla-
  carousel-react`, `input-otp`, `vaul`, `cmdk` à vérifier au cas par cas).
- **Tanzen Frontend perd** : aucune dépendance de production (le kit UI
  reste utilisé partout). Rien à retirer avec certitude sans vérification
  fine post-copie.

Cette section sera complétée avec des chiffres exacts (résultat de
`depcheck` ou grep exhaustif par paquet) au moment de l'exécution, une
fois les fichiers physiquement séparés — un état "avant tout déplacement"
ne permet pas de mesurer un usage par projet de façon fiable.

---

## 12. Fichiers partagés (dupliqués, documentés)

Aucun backend/monorepo n'existe ou n'est demandé (le mandat §28 veut deux
projets `npm install`-ables indépendamment) → pour les fichiers **petits
et génériques** ci-dessous, la duplication à l'identique est le choix le
moins risqué, à réévaluer si un vrai backend ou un monorepo partagé voit
le jour plus tard (hors périmètre de cette mission, §38) :

- `src/lib/utils.ts`, `src/components/{date-display,money-display}.tsx`
- `src/services/api-client.ts`
- `src/contexts/{locale-context,theme-context,permission-context,
  tenant-context}.tsx` — même pattern, mais dictionnaires i18n propres à
  chaque app (voir ci-dessous)
- `src/i18n/**` (infrastructure) avec `src/locales/{fr,en}` **scindés** :
  Commercial garde les sections `public`+`platform`(+`shell` pour
  langue/thème génériques) ; Tenant garde `nav/dashboard/notifications/
  organization/finance/tontines/operations/access/audit/settings/
  system/shell`. Ce n'est pas "deux systèmes i18n concurrents dans une
  même app" (interdit §14) — ce sont deux apps séparées avec chacune un
  seul système.
- `src/services/query-keys.ts` scindé de la même façon ; `tenants.list/
  detail` dupliquées dans les deux (Platform + sélecteur vestige de
  Members, voir note ci-dessous)
- `src/routes/{not-found-page,unauthorized-page,route-loading-fallback}.tsx`
- Le design-system complet `src/components/**` (kit shadcn/ui +
  `PageHeader, DataTable, FilterBar, StatusBadge, StatCard, FormSection,
  EmptyState, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState,
  ConfirmDialog, Timeline, FieldError`)
- Config outillage : `tailwind.config.js`, `postcss.config.js`,
  `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `index.css`
  (tokens `landing-*` ET `hsl(var(--x))` shadcn — Commercial a besoin des
  deux, Tenant garde uniquement les tokens shadcn)
- `mocks/organization/tenants.ts` (+ type `Tenant`), `mocks/rbac.mocks.ts`
  (+ types `PlatformScope`/`SystemRole`/`CurrentUser`)
- `organizationService.listTenants`/`getTenant` (lecture seule du
  registre) — copie identique dans les deux projets

**Point d'attention documenté, pas corrigé dans cette migration** : le
sélecteur "Tenant" du formulaire Membre (`MemberFormFields`, dans
`organization-module.tsx`) appelle `organizationService.listTenants(...)`.
Côté Tenant App, `user.scope` vaut toujours `'tenant'` en pratique, donc
cette liste ne contiendra jamais qu'un seul élément (le tenant courant) —
le menu déroulant est déjà, aujourd'hui, un menu à une seule option. Le
comportement est conservé à l'identique (simple duplication de fonction)
plutôt que "nettoyé" en lecture directe de `TenantContext`, ce qui serait
légitime mais dépasse le strict nécessaire de la séparation (mandat §34).

---

## 13. Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| Deux copies de `mocks/organization/tenants.ts` / `rbac.mocks.ts` non synchronisées à l'exécution | Élevée (structurelle, inhérente à l'absence de backend) | Documenté explicitement `BACKEND PENDING` dans `docs/COMMERCIAL_TENANT_SEPARATION.md` ; disparaît avec un vrai backend |
| Import cassé oublié pendant le nettoyage (Option A) | Moyenne | Détecté immédiatement par `npm run typecheck`/`lint`/`build` dans les deux projets, exécutés en fin de migration |
| `signin-page.tsx` est le seul fichier qui n'est pas un copier-coller pur (retrait de `PublicShell`, nouveau `AuthShell` minimal) | Moyenne | Comportement fonctionnel (formulaire, simulation, redirection `/dashboard`) strictement inchangé ; seul l'habillage change |
| Dépendances `package.json` copiées mais potentiellement inutilisées dans un projet | Faible | Aucune suppression sans vérification d'usage confirmée (mandat §19) ; nettoyage différé, pas bloquant |
| Tests existants (123 tests tenant-app + tests platform/checkout de cette session) à répartir entre les deux projets | Moyenne | Chaque test suit son fichier source (colocalisé) ; `npm run test` exécuté séparément dans chaque projet en fin de migration |
| Régression de l'isolation tenant pendant le déplacement | Élevée si négligée | Aucune modification de `TenantContext`/`tenant-scope.ts`/`PermissionGate` prévue — copiés tels quels ; re-vérification explicite prévue (mandat §29) après migration |
| `tanzen-commercial` déjà `git init` sur branche `master` (pas `main`) | Faible | Renommer la branche par défaut en `main` + créer `feature/commercial-platform` au moment de l'exécution, avant tout commit |

---

## 14. Stratégie de migration

**Option retenue : Option A — copier `tanzen-frontend` intégralement dans
`tanzen-commercial`, puis supprimer ce qui appartient exclusivement au
Tenant.**

Justification (comparaison de risque avec l'Option B) :
- Option A hérite du build config exact et déjà validé (Vite, Tailwind,
  tsconfig, ESLint, PostCSS, `index.css`, `index.html`, alias `@/`) —
  aucun risque de dérive de configuration. Le code Public + Platform copié
  est identique, byte pour byte, au code qui tourne déjà en production
  locale.
- Le nettoyage consécutif (retirer Organization/Finance/Credit/Tontines/
  Operations/Documents/Workflows/Audit/Settings + leurs mocks/services/
  tests) est un risque **borné et vérifiable mécaniquement** : `npm run
  typecheck`/`lint`/`build` signalent tout import résiduel cassé.
- Option B (projet neuf + migration entrante) demanderait de recréer toute
  la configuration outillage à la main, avec un risque réel et plus
  difficile à diagnostiquer (ex. token CSS `landing-*` oublié, plugin
  PostCSS manquant) qu'un import mort détecté par `tsc`.

Ordre d'exécution prévu (reprend le mandat §35, étapes 5 à 13, chacune
avec vérification technique avant de passer à la suivante) :

1. Copier `tanzen-frontend` → `tanzen-commercial` intégralement.
2. Dans `tanzen-commercial` : supprimer les domaines Tenant listés en §5,
   `AppShell`/`ShellHeader`/`ShellSidebar`/`TenantSwitcher`, adapter le
   routeur racine (garder Public + `/platform/*`), scinder
   `organization.service.ts`/`query-keys.ts`/`locales` comme décrit en
   §6/§11/§12, renommer branche git `master` → `main`, créer
   `feature/commercial-platform`.
3. Dans `tanzen-frontend` : supprimer `src/features/public/**`,
   `src/features/platform/**`, `PublicShell`, `PlatformShell`,
   `platform-scope-route.tsx`, `platform-commercial.service.ts`,
   `mocks/platform/**`, `tenant-form.tsx`, la portion écriture de
   `organization.service.ts` ; créer `/login` (déplacement adapté de
   `signin-page.tsx`, nouveau `AuthShell` minimal) ; adapter le routeur
   racine (garder uniquement le bloc `AppShell` + `/login`).
4. Vérifier l'isolation tenant dans `tanzen-frontend` (mandat §29 : aucun
   `TenantSwitcher`, aucun sélecteur de tenant, aucune route `/platform/*`
   ni `/pricing`/`/checkout`/`/payment`/`/billing` accessible).
5. Configurer les deux projets indépendamment (`.env.example` séparés).
6. `npm install` + `npm run typecheck`/`lint`/`test`/`build` dans chaque
   projet, séparément.
7. Rapport final : fichiers déplacés/conservés/archivés/supprimés/créés,
   dépendances modifiées, routes retirées/ajoutées, résultats des
   commandes de vérification, risques restants.

Chacune de ces étapes fera l'objet d'un point de passage explicite avant
exécution — en particulier avant toute suppression et avant le premier
commit dans `tanzen-commercial`.

---

## 15. Stratégie de rollback

- **`tanzen-frontend`** : aucun commit git n'a encore été créé pour cette
  migration au moment de la rédaction de ce plan. Toute modification
  restera dans l'arbre de travail (`git status`) jusqu'à validation
  explicite ; un `git checkout -- <fichiers>` ciblé (jamais `git reset
  --hard`/`git clean -fd`, interdits par le mandat §16/§36) suffit à
  annuler un déplacement non désiré tant qu'aucun commit n'a été créé.
  Une fois un commit de migration créé, le rollback se fait par
  `git revert` du commit concerné (jamais de réécriture d'historique
  destructive).
- **`tanzen-commercial`** : dépôt vide à ce stade (aucun commit). Un
  rollback complet équivaut simplement à revider le dossier (hors
  `.git`) sans risque de perte, puisqu'aucun contenu n'y existe encore.
- **Aucune suppression physique** de fichier n'est prévue avant qu'une
  copie fonctionnelle et vérifiée (typecheck/lint/test/build verts)
  n'existe dans `tanzen-commercial` — l'Option A retenue en §14 garantit
  que `tanzen-frontend` reste intact et fonctionnel jusqu'à l'étape 3
  (nettoyage), qui n'intervient qu'après la validation de l'étape 2.
