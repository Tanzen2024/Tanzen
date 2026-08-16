# TANZEN — Architecture cible définitive : Platform / Site vitrine / Application Tenant

**Statut : ANALYSE UNIQUEMENT, conformément au mandat (§13 : « NE PAS modifier immédiatement »).** Aucun fichier de `src/` n'a été modifié, créé ou supprimé pour produire ce document. Ce n'est pas un audit de zéro : l'essentiel de l'architecture cible demandée ici a déjà été analysé et décidé dans trois documents antérieurs, puis en grande partie **implémentée** par une mission de migration. Ce document ne réinvente rien — il **reconfirme l'état réel du code par inspection directe**, le compare au nouveau cahier des charges reçu, et n'ouvre que les écarts qui restent réellement ouverts.

## Sources déjà validées, reprises telles quelles (non ré-auditées ni contredites)

- `docs/DECISION_ARCHITECTURE_SAAS_TENANT.md` — constat initial (avant construction) : tout le domaine Public/SaaS était `MISSING`.
- `docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md` — architecture cible à 3 espaces (Public/SaaS, Platform Admin, Application Tenant) et 3 décisions définitives (A : 3 arbres de routes/layouts, même authentification ; B : `TenantCreate` scindé en `PlatformTenantCreate` + futur `SaaSTenantOnboarding` partageant `TenantInput`/`validateTenant`/`TenantForm` ; C : même dépôt, pas de monorepo pour l'instant).
- `docs/MIGRATION_SITE_VITRINE_REPORT.md` — exécution de la Décision A et C : `PublicShell`/`PlatformShell` construits, routes séparées, `landing/` (Next.js) conservé tel quel en parallèle.
- `docs/PHASE_02_TENANT_ISOLATION_SPEC.md` — règles d'isolation tenant, déjà implémentées et vérifiées phase par phase (Phases 6 à 11 de ce projet).

---

## 1. Architecture actuelle (vérifiée par inspection directe, pas par relecture des rapports précédents)

### 1.1 Trois espaces structurellement séparés existent déjà

```
src/routes/app-router.tsx
  ├── /platform/*     → PlatformScopeGuard → PlatformShell → PlatformModule (Tenants uniquement)
  ├── /dashboard, /organization/*, /finance/*, /tontines/*,
  │   /operations/*, /access-security/*, /audit/*, /settings/*
  │                   → AppShell → 7 modules métier (Application Tenant, inchangée)
  └── /* (catch-all)  → PublicModule (Landing, Features, Sign In, Sign Up, Subscribe, Downloads, Docs)
```

Vérifié ligne par ligne dans `src/routes/app-router.tsx` : trois arbres distincts, pas un seul arbre avec filtrage dispersé. `PublicShell` (`src/layouts/public-shell.tsx`) n'importe **aucune** dépendance à `TenantContext`/`PermissionContext` (confirmé par grep — seuls `Navbar`/`Footer` de `src/features/public/components`). `PlatformShell` (`src/layouts/platform-shell.tsx`) n'importe pas `TenantContext` non plus (seulement `useLocale`), cohérent avec « pas de tenant courant au sens métier » côté Platform. `AppShell` inchangé.

### 1.2 Authentification

Aucune authentification réelle. `PermissionProvider` (`src/contexts/permission-context.tsx`) injecte `currentUser` directement depuis `src/mocks/rbac.mocks.ts` — un objet statique unique (`U-001`, `tenantId: 'T-001'`, `role-admin`, `scope: 'platform'`), non issu d'un login. `TenantContext` (`src/contexts/tenant-context.tsx`) dérive `tenants`/`currentTenant` de ce même `currentUser.scope`/`currentUser.tenantId` — filtrage déjà correct côté frontend (vérifié exhaustivement lors de la correction précédente), mais la **source** du scope/tenantId reste un mock statique, jamais une session authentifiée.

`SignInPage`/`SignUpPage` (`src/features/public/signin-page.tsx`, `signup-page.tsx`) sont explicitement commentés `BACKEND PENDING` dans le code : `SignInPage` ignore `email`/`password`, attend 1s, puis `navigate('/dashboard')` inconditionnellement — quel que soit ce qui est saisi, c'est toujours le même `currentUser` mocké qui apparaît côté application. Il n'existe **aucun lien** entre « qui se connecte » et « quel `tenantId` est résolu ».

### 1.3 Parcours commercial (Site vitrine → Tenant)

`SubscribePage` (`src/features/public/subscribe-page.tsx`) affiche une tarification modulaire interactive (sliders volume, sélection de modules, calcul de prix en temps réel) mais **n'appelle aucun service** — pas de `fetch` réseau, pas d'appel à `organizationService.createTenant`. L'écran de succès affiche un bouton qui navigue directement vers `/dashboard`, sans jamais créer de tenant réel ni transiter par un statut `pending → active`. `organizationService.createTenant` (utilisé uniquement par `PlatformTenantCreate`, l'action d'administration interne) fixe déjà `status: 'pending'` par défaut sur tout nouveau tenant — champ existant, mais **piloté par aucun écran** (confirmé, aucune UI de transition `pending → active` nulle part dans le code).

### 1.4 Isolation tenant (Application Tenant)

Déjà implémentée et vérifiée à travers les Phases 6 à 11 de ce projet (voir `docs/PHASE_11_AUDIT_SETTINGS.md` et les rapports précédents) : `getTenantScoped()`, filtrage direct par `tenantId` dans chaque service (`organization.service.ts`, `finance.service.ts`, `credit.service.ts`, `tontines.service.ts`, `document.service.ts`, `workflow.service.ts`, `audit.service.ts`, `settings.service.ts`), double vérification `tenantId` + `userId` sur les notifications, RBAC appliqué en **plus** de l'isolation tenant (jamais en remplacement). Isolation du `TenantSwitcher`/`TenantContext` reconfirmée à l'instant précédent (`docs/FIX_TENANT_SWITCHER_ISOLATION.md`, addendum du 2026-08-15).

### 1.5 `landing/` (Next.js), doublon connu et documenté

`tanzen-frontend/landing/` est le projet Next.js **source** de la migration — conservé intégralement tel quel (non supprimé, non modifié) après que son contenu a été porté vers `src/features/public/` (React Router). Les deux arborescences sont donc aujourd'hui **fonctionnellement redondantes** (mêmes 6-7 pages), mais ce n'est pas un écart accidentel : `docs/MIGRATION_SITE_VITRINE_REPORT.md` §22 documente explicitement que la suppression de `landing/` a été **volontairement différée**, « à archiver ou supprimer seulement après validation explicite ». Cette validation n'a jamais été demandée depuis — la redondance reste donc un point ouvert, pas une régression.

---

## 2. Architecture cible (cahier des charges reçu)

Le cahier des charges reçu décrit une architecture en 3 espaces (Site vitrine/Platform, Application Tenant authentifiée par login → `tenantId`, isolation stricte de bout en bout y compris côté backend/API) qui est, **conceptuellement, exactement** l'architecture déjà actée dans `docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md` (Décisions A, B, C) — pas une nouvelle direction. Deux ajouts de précision par rapport aux décisions déjà actées, tous deux déjà couverts par les sources existantes :

- §7 (« Backend / API doit vérifier `authenticatedUser.tenantId == resource.tenantId` ») — déjà la doctrine de sécurité actée (`DECISION_PLATFORM_SAAS_TENANT_FINAL.md` §17, `PHASE_02_TENANT_ISOLATION_SPEC.md` §12-13 : « le frontend n'est jamais l'autorité de sécurité »).
- §9 (« Le login ne doit pas demander quel tenant utiliser, le tenant est déterminé par l'identité authentifiée ») — déjà spécifié (`DECISION_PLATFORM_SAAS_TENANT_FINAL.md` §9 : « le `tenantId` d'un utilisateur tenant-scoped doit venir de la session »).

---

## 3. Écarts (ce qui manque réellement par rapport à la cible)

| # | Écart | Gravité | Bloqué par |
|---|---|---|---|
| E1 | Aucune authentification réelle — `currentUser` mocké statique, jamais résolu par un login | Structurel | **Backend inexistant** (aucun endpoint `/auth/login`, `/auth/session`, JWT) |
| E2 | `tenantId`/`scope` calculés côté client (`resolveScope(roleIds)`), jamais émis par un serveur | Structurel | **Backend inexistant** |
| E3 | `SubscribePage` ne crée aucun tenant réel ; pas de tunnel `Paiement confirmé → createTenant(pending) → activation → login` | Fonctionnel | **Backend inexistant** (paiement, activation par token/lien) |
| E4 | `Tenant.status` (`pending`/`active`/…) existe en donnée mais n'est piloté par aucun écran d'activation | Fonctionnel | Dépend de E3 |
| E5 | `TenantForm`/`validateTenant` vivent uniquement dans `platform-module.tsx` (usage `PlatformTenantCreate`), pas extraits en module partagé | Mineur, mécanique | Rien — **actionnable dès maintenant sans backend** |
| E6 | `landing/` (Next.js) et `src/features/public/` (React Router) coexistent, contenu redondant | Mineur, cosmétique/dette | Décision produit déjà en attente (`MIGRATION_SITE_VITRINE_REPORT.md` §22), pas retranchée par ce mandat |
| E7 | Aucune vérification serveur de `authenticatedUser.tenantId == resource.tenantId` (§7 du mandat) | Structurel | **Backend inexistant** — le frontend fait déjà tout ce qu'il peut (filtrage systématique par `tenantId`, jamais de confiance dans un ID transmis par le client sans re-filtrage service) |
| E8 | Espace Platform Admin limité au registre des Tenants — pas de Billing/Subscriptions/Modules(platform)/Platform Users | Fonctionnel | Domaine entier `MISSING`, jamais spécifié par une source (cf. `DECISION_ARCHITECTURE_SAAS_TENANT.md` §1) — **ne pas inventer** |

## 4. Conflits identifiés

Aucun nouveau conflit. Les 3 conflits déjà identifiés dans `DECISION_ARCHITECTURE_SAAS_TENANT.md` §3 ont tous été **résolus** par les décisions et la migration ultérieures :
1. « Mélange des deux espaces » → résolu (Décision A, exécutée : 3 arbres de routes distincts).
2. « `TenantCreate` mal positionné » → résolu (Décision B, partiellement exécutée : `PlatformTenantCreate` déplacé sous `/platform/tenants/create` ; seule l'extraction de `TenantForm`/`validateTenant` en module partagé — E5 — reste mécanique et non faite).
3. « Aucune authentification réelle » → non résolu, car non résolvable sans backend (E1/E2) — documenté comme tel depuis le début, pas un oubli.

## 5. Fichiers concernés

| Fichier | Rôle | État |
|---|---|---|
| `src/routes/app-router.tsx` | 3 arbres de routes | Conforme |
| `src/layouts/public-shell.tsx`, `platform-shell.tsx`, `app-shell.tsx` | 3 layouts séparés | Conforme |
| `src/routes/platform-scope-route.tsx` | Garde de portée Platform | Conforme |
| `src/contexts/tenant-context.tsx` | Résolution `currentTenant`/`tenants` | Conforme frontend (filtré à la source) ; source (`currentUser` mocké) reste E1/E2 |
| `src/contexts/permission-context.tsx` | Injection `currentUser` | Source du blocage E1/E2 (documenté, pas un bug) |
| `src/mocks/rbac.mocks.ts` | `currentUser` statique | À remplacer par une vraie session le jour où le backend existe (déjà documenté dans le fichier lui-même) |
| `src/features/public/subscribe-page.tsx` | Tunnel de souscription | UI complète, aucune écriture réelle (E3) |
| `src/services/organization.service.ts` | `createTenant` | `status: 'pending'` déjà présent, jamais piloté (E4) |
| `src/features/platform/platform-module.tsx` | `TenantForm`/`validateTenant` internes | À extraire (E5) |
| `tanzen-frontend/landing/` | Site vitrine Next.js legacy | Redondant avec `src/features/public/` (E6) |

## 6. Risques

- **Construire une fausse couche d'authentification** (session/JWT simulés côté frontend uniquement) pour combler E1/E2 créerait une **fausse impression de sécurité** — un mécanisme qui a l'air réel mais ne l'est pas est plus dangereux qu'une absence assumée et documentée. Cela violerait aussi la règle « ne pas inventer » (§12 du mandat) : aucune source ne spécifie le mécanisme d'authentification réel (JWT ? session cookie ? SSO ?). **Recommandation : ne pas construire.**
- **Construire `SaaSTenantOnboarding`** (E3/E4) sans backend produirait le même risque : un flux qui semble créer un tenant réel, mais qui ne persiste rien au-delà du `sessionStorage`/mémoire du navigateur — trompeur pour quiconque teste le produit en le croyant fonctionnel.
- **Supprimer `landing/`** sans validation explicite (E6) serait une action destructive non demandée par ce mandat précis (qui demande une analyse, pas un nettoyage) — non fait ici, juste signalé.
- **Ne rien faire** sur E5 (extraction `TenantForm`) n'est pas un risque de sécurité, seulement une dette technique mineure déjà actée comme telle dans `DECISION_PLATFORM_SAAS_TENANT_FINAL.md` §21 Décision B.

## 7. Corrections nécessaires — et ce qui reste hors de portée sans backend

**Réellement actionnable dans cette mission, sans rien inventer et sans backend :**
- **E5 seul** : extraire `TenantForm`/`validateTenant`/le type `TenantFormValues`/`TenantFormErrors` de `platform-module.tsx` vers un module partagé (ex. `src/features/organization/tenant-form.tsx`, déjà le chemin suggéré dans `DECISION_PLATFORM_SAAS_TENANT_FINAL.md` §21 Décision B) — refactor mécanique, zéro changement de comportement, prépare (sans le construire) un futur `SaaSTenantOnboarding` qui pourra réutiliser exactement ces trois éléments.

**Hors de portée de cette mission, car nécessitant un backend qui n'existe pas (E1, E2, E3, E4, E7, E8)** : ne peuvent être « corrigés » sans inventer un système d'authentification, un mécanisme de paiement, ou un backend RBAC — explicitement interdit par le mandat (§12 : NE PAS inventer). Ces écarts restent donc **documentés comme cible**, pas comme bug à corriger aujourd'hui — exactement le statut qui leur était déjà donné avant ce mandat.

**E6** (redondance `landing/`) : décision produit, pas une correction technique — laissé ouvert, à trancher explicitement par l'utilisateur.

## 8. Éléments déjà conformes à l'architecture cible

- Séparation structurelle des 3 espaces (routes, layouts, providers) — §1 du mandat, §1 du cahier des charges reçu.
- `PublicShell` totalement anonyme, zéro import `TenantContext`/`PermissionContext`/mocks tenant — §1 (site vitrine) du cahier des charges.
- `PlatformScopeGuard` au sommet de l'arbre `/platform/*`, indépendant de toute permission — §5 du cahier des charges (« Platform Context »).
- `TenantSwitcher` : étiquette statique non interactive pour tout utilisateur `scope !== 'platform'`, aucune recherche, aucun bouton d'ajout, aucune liste — §4 du cahier des charges (« Pas de Tenant Switcher pour tenant-scoped »), reconfirmé par la vérification runtime de la mission précédente.
- `TenantContext` : filtré à la source (`scopedTenants`), pas seulement masqué en aval ; `localStorage` ignoré pour un utilisateur tenant-scoped ; `setCurrentTenant`/`setCurrentTenantId` bloqués hors scope platform — §6 du cahier des charges.
- Isolation tenant sur tous les domaines métier (Organization/Finance/Credit/Tontines/Governance/Operations/Documents/Notifications/Audit/Settings) — §3 du cahier des charges, vérifiée phase par phase (Phases 6-11).
- RBAC appliqué en **plus** de l'isolation tenant, jamais en remplacement — §11 de `PHASE_02_TENANT_ISOLATION_SPEC.md`, vérifié dans chaque phase.
- Le frontend ne prétend jamais être l'autorité de sécurité finale — doctrine déjà actée et respectée dans tout le code (`mockRequest`, services, jamais de logique qui ferait confiance à un `tenantId` fourni par le client sans re-filtrage).
- Site vitrine → Tenant : la partie qui *peut* exister sans backend (présentation, formulaires, calcul de prix, navigation) est construite ; la partie qui *ne peut pas* exister sans backend (paiement réel, activation, session) est honnêtement absente plutôt que simulée de façon trompeuse.

---

## 9. Recommandation

Implémenter uniquement **E5** (extraction `TenantForm`/`validateTenant`) dans cette mission, car c'est la seule correction qui soit à la fois nécessaire, sourcée par une décision déjà actée, et réalisable sans inventer quoi que ce soit. Tout le reste (E1, E2, E3, E4, E7, E8) reste `BACKEND PENDING`, déjà documenté comme tel avant ce mandat — les reconstruire de façon simulée créerait une fausse impression de conformité, contraire à l'esprit du mandat. E6 (redondance `landing/`) reste une décision produit à trancher explicitement, non tranchée ici.

## 10. E5 — Implémenté et vérifié

Suite à validation explicite (choix « Implémenter E5 »), la correction a été appliquée :

- **Nouveau fichier** `src/features/organization/tenant-form.tsx` — exporte `T` (type de la fonction de traduction), `TenantFormValues`, `TenantFormErrors`, `useTenantFormValues`, `validateTenant`, `TenantForm`. Code strictement identique à ce qui vivait auparavant dans `platform-module.tsx` — aucun changement de comportement, aucun champ ajouté/retiré.
- **`src/features/platform/platform-module.tsx`** — les 5 éléments ci-dessus retirés et importés depuis le nouveau module ; imports désormais inutilisés (`Check` de `lucide-react`, `FieldError` de `@/components`) retirés.
- **Aucun autre fichier modifié.** `organization-module.tsx` n'importe pas (encore) ce module partagé — aucun second consommateur n'existe tant que `SaaSTenantOnboarding` (E3/E4) n'est pas construit ; l'extraction prépare ce futur sans l'anticiper.

**Validation** : `tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 16 warnings (14 pré-existants + 2 nouveaux `react-refresh/only-export-components` sur `tenant-form.tsx`, même catégorie de warning déjà présente sur 6 autres fichiers du projet qui exportent plusieurs éléments non-composants depuis un même fichier — pattern déjà toléré partout ailleurs, pas une régression). `vite build` — succès, même avertissement pré-existant sur la taille de chunk. Vérification directe en environnement (headless Chrome + CDP) : `PlatformTenantCreate` (`/platform/tenants/create`) — les 11 champs du formulaire sont présents, la validation (champs obligatoires) se déclenche toujours à la soumission vide, la création réelle d'un tenant (`Tenant Test E5`) fonctionne et redirige vers sa fiche détail. `TenantEdit` (`/platform/tenants/T-002/edit`) — les champs sont correctement pré-remplis avec les données du tenant existant (`Tontine Horizon`). Aucune régression détectée.

## 11. E6 — Décidé et exécuté (archivage)

Décision explicite reçue : archiver `landing/` plutôt que le supprimer ou le laisser en place. Exécuté :

- `tanzen-frontend/landing/` → `tanzen-frontend/_archive/landing-nextjs-legacy/` (déplacement simple, aucun fichier modifié à l'intérieur, aucune perte de contenu — action réversible).
- `eslint.config.js` : exclusion mise à jour de `'landing'` vers `'_archive'`.
- Le déplacement a nécessité l'arrêt temporaire du serveur de développement (`npm run dev`) — son *file watcher* maintenait un verrou Windows sur le dossier `landing/`, provoquant un `Access denied` sur la première tentative. Serveur redémarré immédiatement après le déplacement.

**Validation** : `tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 16 warnings (inchangé). `vite build` — succès. Aucune référence active à `landing/` ne subsistait dans `src/` (confirmé par grep avant déplacement, cf. `docs/POST_MIGRATION_VALIDATION_REPORT.md` §Fichiers) — seules des mentions en commentaire (`src/features/public/public-module.tsx`) et en documentation historique (`docs/MIGRATION_SITE_VITRINE_REPORT.md`, `docs/POST_MIGRATION_VALIDATION_REPORT.md`) subsistent, non mises à jour car elles décrivent fidèlement l'état du projet **au moment de la migration**, pas l'état actuel — les rouvrir reviendrait à réécrire l'histoire d'un rapport déjà clos.

---

*Fin du document. E5 et E6 implémentés et vérifiés. E1-E4, E7-E8 restent à l'état documenté, en attente d'un backend réel qui n'existe pas dans ce projet.*
