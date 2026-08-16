# TANZEN ENTERPRISE — Phase 12 : Intégration transversale / Tests automatisés / Régression / Isolation finale

**Statut : implémentation réelle, additive uniquement.** Aucune logique métier existante modifiée par cette phase — seuls des fichiers de test et l'outillage nécessaire pour les exécuter ont été ajoutés. Introduit dans ce projet un vrai framework de tests automatisés (Vitest + React Testing Library), absent avant cette phase.

## Méthodologie

Décisions validées par l'utilisateur avant implémentation : (1) `landing/` archivé vers `_archive/landing-nextjs-legacy/` (E6 de `docs/ARCHITECTURE_PLATFORM_TENANT_FINAL.md`, traité hors de ce plan) ; (2) « tests » signifie un vrai framework automatisé (Vitest + RTL), pas seulement la méthodologie CDP déjà utilisée dans les 11 phases précédentes. Plan validé en mode plan (`expressive-meandering-cook.md`) avant toute installation de dépendance ou écriture de test.

---

## 1. Outillage

`devDependencies` ajoutées : `vitest` (4.1.10), `jsdom` (30.0.1), `@testing-library/react` (16.3.2), `@testing-library/jest-dom` (7.0.1), `@testing-library/user-event`. Aucune dépendance de production touchée.

- `vite.config.ts` — étendu avec un bloc `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false }`, en réutilisant l'alias `@` et le plugin React déjà en place (zéro configuration dupliquée). `defineConfig` importé depuis `vitest/config` plutôt que `vite` — nécessaire pour que `tsc -b` (utilisé par `npm run build`, qui type-checke `vite.config.ts` via `tsconfig.node.json`) reconnaisse le bloc `test` sans erreur de type (`/// <reference types="vitest/config" />` seul ne suffisait pas dans ce contexte de compilation).
- `src/test/setup.ts` — `@testing-library/jest-dom/vitest`, `cleanup()`/`localStorage.clear()` après chaque test, et un polyfill minimal de `window.matchMedia` (absent de jsdom, nécessaire pour `ThemeContext` qui détecte le thème système).
- `.env.test` — `VITE_MOCK_API_DELAY=0`, désactive le délai artificiel de `mockRequest` (300 ms par défaut, `src/services/api-client.ts`, non modifié) uniquement en mode test, sans quoi la suite complète prendrait plusieurs minutes.
- `src/test/render-with-providers.tsx` — wrapper reproduisant l'ordre exact de `src/app/providers.tsx` (`QueryClientProvider > MemoryRouter > LocaleProvider > ThemeProvider > TenantProvider > PermissionProvider`), un `QueryClient` neuf par appel.
- `package.json` — scripts `test` (`vitest run`) et `test:watch` (`vitest`).
- `vite.config.ts` — au passage, `__dirname` remplacé par `import.meta.dirname` (Node 22), qui supprimait un avertissement Vite à chaque exécution (`configLoader: 'native'`) ; comportement inchangé, testé après coup (`npm run dev` toujours opérationnel).

**Choix technique — globals désactivés** : contrairement à la configuration Jest-like par défaut de beaucoup de projets Vitest, `globals: true` n'a pas été activé. Chaque fichier de test importe explicitement `describe`/`it`/`expect`/`vi` depuis `'vitest'` — évite de devoir ajouter `"types": ["vitest/globals"]` à `tsconfig.app.json` (qui est aussi le tsconfig de production) pour un gain de confort mineur.

## 2. Isolation tenant — 14 fichiers de test colocalisés avec chaque service

Un fichier `*.test.ts` par service (`src/services/*.service.test.ts` + `tenant-scope.test.ts` pour la primitive elle-même), utilisant directement les données mock existantes (`T-001`…`T-005`, aucune fixture inventée). Pattern systématique : **ALLOW** (ressource du tenant courant retournée), **DENY** (ressource d'un autre tenant → `null`/liste vide, jamais l'objet réel), **indistinguabilité** (« n'existe pas » et « appartient à un autre tenant » produisent la même réponse), **PLATFORM BYPASS** uniquement là où il existe réellement (`organizationService.listTenants/getTenant`, `userService`, `sessionService`, `roleService.listUsersForRole`).

**Piège rencontré et corrigé pendant l'écriture** : `mockRequest` (`api-client.ts`) convertit `undefined` en `null` pour la compatibilité React Query — plusieurs assertions initiales (`toBeUndefined()`) échouaient donc à tort ; corrigées en `toBeNull()`. `auditService.list/get` sont l'exception : ils n'utilisent pas `mockRequest`, donc `get()` renvoie bien `undefined` (pas `null`) pour un événement introuvable — reflété tel quel dans `audit.service.test.ts`, pas uniformisé artificiellement.

**Deuxième piège corrigé** : `getTenantScoped`/`mockRequest` ne clonent jamais les objets retournés — un test qui capture une valeur « avant » (`before = await service.get(...)`) puis mute cette même ressource via une opération réussie observe la valeur déjà mutée en relisant `before` après coup, car `before` est une référence live vers le même objet mock, pas un instantané. Corrigé dans `credit.service.test.ts` (régression repayment, §3) en capturant les champs primitifs nécessaires avant la mutation plutôt qu'en comparant des objets par référence.

**Gap documenté, non corrigé (additive-only)** : `financeService.listContributionsByMember(memberId)` n'a aucun paramètre `tenantId` — aucune vérification possible au niveau service. Sûr aujourd'hui uniquement parce que le seul point d'appel UI (`organization-module.tsx`) obtient toujours `memberId` via un `Member` déjà tenant-scopé en amont. Documenté avec un test explicite (`finance.service.test.ts`, commentaire « GAP CONNU ») plutôt que corrigé silencieusement — corriger aurait dépassé le périmètre additive-only de cette phase (ajouterait un paramètre à la signature du service, donc à tous ses appelants).

## 3. Régression — bugs réels des phases précédentes, couverts comme cas dans le fichier de service concerné

- **`settings.service.test.ts`** : `openFiscalYear` doit retirer `isCurrent` de l'ancien exercice courant avant d'ouvrir le nouveau (bug trouvé et corrigé pendant la Phase 11 — deux exercices « courants » simultanés étaient possibles). Testé explicitement : après ouverture, un seul exercice a `isCurrent: true` sur l'ensemble du tenant, et le statut de l'ancien exercice courant n'est pas altéré (pas de cascade inventée).
- **`tontines.service.test.ts`** : `listCyclesByMember(tenantId, memberId)` doit filtrer par `tenantId` (absent avant la Phase 8 — un `memberId` partagé entre tenants aurait fuité les cycles d'un autre tenant) ; `updateCycleStatus` doit respecter `VALID_CYCLE_TRANSITIONS` (SUSPENDED→OPEN accepté, CLOSED terminal — bug de réouverture de cycle corrigé en Phase 8, DRAFT→CLOSED direct toujours refusé).
- **`credit.service.test.ts`** : `createRepayment` recalcule `paidAmount`/`outstanding`/`progress` sur le prêt parent avec la formule vérifiée (`progress = round(paidAmount/totalRepayable*100)`), et seulement si `status === 'completed'` — un remboursement `scheduled` ne doit rien modifier sur le prêt.

## 4. Composants — 3 fichiers ciblés sur la surface isolation/sécurité

`src/layouts/tenant-switcher.test.tsx`, `src/routes/platform-scope-route.test.tsx`, `src/components/permission-gate.test.tsx`. Chacun simule les deux scopes (`tenant`/`platform`) via `vi.doMock('@/mocks/rbac.mocks', ...)` — la même technique de bascule temporaire de `currentUser` déjà utilisée manuellement (rbac.mocks.ts édité puis restauré) pour vérifier `docs/FIX_TENANT_SWITCHER_ISOLATION.md`, désormais automatisée et rejouable sans toucher au fichier source.

**Piège d'isolation de module rencontré** : `tenant-context.tsx` calcule `scopedTenants` au niveau module (pas dans le composant), à partir de `currentUser.scope` — un simple `vi.mock` statique en tête de fichier n'aurait appliqué qu'une seule valeur pour tout le fichier de test. Résolu avec `vi.resetModules()` + `vi.doMock()` + `import()` dynamique **avant** chaque rendu, pour que chaque test obtienne une instance fraîche du module avec le `currentUser` voulu.

Résultat vérifié automatiquement : `TenantSwitcher` — utilisateur tenant-scoped (T-002, simulant le scénario exact du signalement traité juste avant cette phase) ⇒ aucun `<button>`, aucun champ de recherche, aucun texte « Ajouter un tenant », aucune trace des 4 autres tenants ; utilisateur platform-scoped ⇒ dropdown ouvrable listant tous les tenants, recherche et ajout présents. `PlatformScopeGuard` — redirection `/unauthorized` pour un scope tenant, rendu normal pour un scope platform. `PermissionGate` — masque les enfants (et affiche le `fallback` le cas échéant) quand la permission manque, les affiche quand elle est présente.

## 5. Intégration transversale — effets de bord inter-champs

`credit.service.test.ts` (repayment → mise à jour du prêt parent, §3), `tontines.service.test.ts` (`declareWinner` → `CycleMember.hasWon` passe à `true`, tentative de second gagnant sur le même tirage refusée), `workflow.service.test.ts` (`submitAction('approve')` sur une étape non finale → `currentStepOrder` avance et `status` passe à `inProgress` ; sur la dernière étape → `status` passe à `approved` ; `reject` → `status` passe à `rejected` ; `cancelRequest` → `status` passe à `cancelled`).

## 6. Ce qui n'a pas été construit

- **Pas de couverture exhaustive des composants `*-module.tsx`** — périmètre volontairement limité à la surface isolation/sécurité (3 fichiers, §4) plus les services (où vit la logique métier réelle, 14 fichiers, §2-3). Un chantier de couverture UI complémentaire serait une mission séparée.
- **Pas de CI/pipeline** (GitHub Actions…) — aucune config CI n'existait avant cette phase ; en ajouter une sortirait du périmètre « tests », qui porte sur la suite elle-même, pas son exécution automatisée en intégration continue.
- **Pas de test end-to-end navigateur** (Playwright/Cypress) — la vérification CDP manuelle reste la méthode E2E de ce projet, complémentaire à Vitest+RTL (échelon unitaire/intégration), pas remplacée par elle.

## 7. Résultats

`npm run test` (`vitest run`) — **17 fichiers, 123 tests, 100 % de réussite**. `npm run typecheck` — 0 erreur (fichiers de test inclus, `tsconfig.app.json` couvre tout `src/`). `npm run lint` — 0 erreur, 16 warnings (14 pré-existants + 2 nouveaux sur `tenant-form.tsx`, catégorie déjà tolérée ailleurs dans le projet — aucun nouveau warning issu des fichiers de test eux-mêmes). `npm run build` — succès ; confirmé par grep qu'aucun code de test (`describe(`, `vitest`, assertions) n'atteint `dist/` — Rollup ne bundle que ce qui est réellement importé depuis `main.tsx`, les fichiers `*.test.ts(x)` n'y sont jamais référencés.

| Fichier de test | Tests | Domaine couvert |
|---|---|---|
| `tenant-scope.test.ts` | 6 | Primitive `getTenantScoped` |
| `organization.service.test.ts` | 14 | Tenants (scope-gated), Members, Governance |
| `finance.service.test.ts` | 10 | Accounts, Transactions, Contributions, Distributions |
| `credit.service.test.ts` | 10 | Applications, Loans, Repayments/Guarantors, régression progress |
| `tontines.service.test.ts` | 15 | Tontines, Cycles, régression transitions + listCyclesByMember, intégration declareWinner |
| `document.service.test.ts` | 7 | Documents (list/get/listByEntity/create/remove) |
| `workflow.service.test.ts` | 12 | Definitions, Requests, Delegations, History, intégration submitAction/cancelRequest |
| `notification.service.test.ts` | 8 | Matrice ALLOW/DENY dual-check tenantId+userId |
| `audit.service.test.ts` | 5 | Événements seedés + dérivés de l'historique workflow |
| `settings.service.test.ts` | 12 | Organization/Localization, régression fiscal year isCurrent, Notifications, Security Policies, Modules |
| `user.service.test.ts` | 7 | Users (scope-gated), création sans identifiants |
| `session.service.test.ts` | 4 | Sessions (scope-gated) |
| `role.service.test.ts` | 3 | Roles/Permissions globaux, listUsersForRole scope-gated |
| `dashboard.service.test.ts` | 3 | Agrégation KPI tenant-scopée |
| `tenant-switcher.test.tsx` | 2 | TenantSwitcher — isolation UI |
| `platform-scope-route.test.tsx` | 2 | PlatformScopeGuard |
| `permission-gate.test.tsx` | 3 | PermissionGate |

## 8. Fichiers modifiés/créés

- `package.json` — devDependencies + scripts `test`/`test:watch`.
- `vite.config.ts` — bloc `test`, `defineConfig` depuis `vitest/config`, `__dirname`→`import.meta.dirname`.
- `src/test/setup.ts`, `src/test/render-with-providers.tsx`, `.env.test` — nouveaux.
- 14 fichiers `src/services/*.test.ts` — nouveaux.
- 3 fichiers de test composants (`src/layouts/tenant-switcher.test.tsx`, `src/routes/platform-scope-route.test.tsx`, `src/components/permission-gate.test.tsx`) — nouveaux.
- `docs/PHASE_12_INTEGRATION_TESTS_REGRESSION.md` — nouveau (le présent rapport).

Aucun fichier de code applicatif existant modifié — cette phase est strictement additive, à l'exception des deux micro-corrections de configuration listées au §1 (`vite.config.ts`), sans impact fonctionnel.

---

*Fin du rapport Phase 12.*
