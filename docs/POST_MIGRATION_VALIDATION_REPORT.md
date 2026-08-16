# TANZEN — Validation post-migration du site vitrine

**Statut : VALIDATION UNIQUEMENT.** Aucune nouvelle fonctionnalité créée, aucun backend/authentification/paiement implémenté. Aucune correction n'a été nécessaire — les 15 points de contrôle n'ont révélé aucune anomalie bloquante ; **aucun fichier de code n'a été modifié** par cette mission (uniquement ce rapport).

## Méthodologie

Vérification par inspection directe du code (`Grep` ciblé sur l'ensemble de `src/`, lecture des services de chaque domaine métier) plutôt que par supposition, complétée par les captures d'écran déjà produites lors de la mission de migration précédente (non refaites ici, toujours valables — aucun fichier concerné n'a changé depuis).

---

## 1. Public

Vérifié par recherche exhaustive : **aucun** fichier de `src/features/public/` (7 composants + 6 pages + module + layout) n'importe `TenantContext`, `tenantStore`, `PermissionContext`, `PlatformScopeGuard`, `useTenant` ou `usePermissions`. Le site public est accessible sans tenant, sans session, sans scope. Aucun composant Tenant ne dépend réciproquement du contexte Public (recherche de `features/public` dans les 8 autres domaines : aucune occurrence).

## 2. Platform

`/platform/tenants` reste gardé par `PlatformScopeGuard` au sommet de l'arbre `/platform/*` (`src/routes/app-router.tsx`, inchangé par la migration du site vitrine). Le registre global des tenants n'est plus accessible depuis `/organization` — confirmé par capture d'écran (mission précédente) : le menu Organization ne montre que Membres/Gouvernance. `OrganizationModule` (`src/features/organization/organization-module.tsx`) ne contient plus aucune route ni composant `Tenant*` — entièrement migré vers `PlatformModule`.

## 3. Tenant

`AppShell`, `TenantSwitcher`, `ShellSidebar`, `ShellHeader` : aucun de ces fichiers n'a été touché par la migration du site vitrine au-delà de l'ajout du lien « Platform Administration » (gated par `scope === 'platform'`, déjà en place, revérifié fonctionnel par capture d'écran). Les 8 domaines métier (Dashboard, Organization, Finance, Credit, Tontines, Governance, Operations, Access, Audit, Settings) restent strictement inchangés dans leur logique.

## 4. Tenant isolation

Vérification directe des services de chaque domaine cité dans la demande — tous utilisent systématiquement `getTenantScoped()` (`src/services/tenant-scope.ts`) pour toute résolution par identifiant, retournant `undefined` (→ `NotFoundPage`) en cas d'accès hors tenant :

| Domaine | Fonction | Fichier |
|---|---|---|
| Tontines | `getTontine(tenantId, tontineId)` | `tontines.service.ts:8` |
| Finance | `getAccount(tenantId, accountId)` | `finance.service.ts:12` |
| Credit | `getLoan(tenantId, loanId)` | `credit.service.ts:33` |
| Organization | `getMember(tenantId, memberId)` | `organization.service.ts:50` |
| Operations (Workflows) | `getRequest(tenantId, requestId)` | `workflow.service.ts:50` |
| Documents | `get(tenantId, documentId)` | `document.service.ts:7` |

Comportement attendu (404/NotFound sans fuite d'information) déjà vérifié et documenté lors des missions précédentes (`docs/PHASE_02_TENANT_ISOLATION_SPEC.md`) — aucune régression possible ici, la migration du site vitrine n'a touché aucun de ces fichiers.

## 5. RBAC

`mocks/rbac.mocks.ts`, `contexts/permission-context.tsx`, `routes/permission-route.tsx`, `routes/platform-scope-route.tsx` : non modifiés par cette migration. Le nouveau lien « Platform Administration » dans `ShellHeader` réutilise `usePermissions().user.scope` déjà exposé, sans nouveau mécanisme d'autorisation.

## 6. i18n

Recherche de `localhost`/URLs codées en dur dans les 13 fichiers migrés : aucune occurrence active — les 3 seules mentions de `localhost` restantes sont des **commentaires de code** documentant les liens corrigés (`downloads-page.tsx:52`, `signin-page.tsx:11`, `subscribe-page.tsx:17`), pas des liens vivants. Toutes les chaînes visibles passent par `t('public', ...)` (~115 clés, FR+EN). Un point non bloquant identifié : les montants CFA (`subscribe-page.tsx`) utilisent `toLocaleString('fr-FR')` et le suffixe littéral `« CFA »` indépendamment de la langue sélectionnée — **comportement hérité du site source à l'identique** (déjà ainsi dans `landing/src/app/(main)/subscribe/page.tsx`), pas une régression de la migration. Non corrigé ici conformément à la consigne « ne pas modifier le design sauf problème bloquant » — un formatage de devise différent par langue est un choix produit, pas un bug.

## 7. Theme

`PublicShell` fixe `bg-landing-background text-landing-foreground` sur son conteneur racine — ces classes pointent vers des couleurs hexadécimales statiques (`tailwind.config.js`, tokens `landing-*`), **pas** vers les variables CSS `hsl(var(--background))`/`hsl(var(--foreground))` que `.dark` fait basculer. Le site public est donc structurellement immunisé contre le toggle `light/dark/system` — vérifié par construction (lecture du code), pas seulement par observation visuelle. Le namespacing `landing-*` continue de protéger les tokens Enterprise (`primary`/`accent`/`background` shadcn) : aucun token existant modifié, confirmé par relecture de `tailwind.config.js`.

## 8. Accessibility

Formulaires (Sign In, Sign Up) : chaque `<input>` a un `<label htmlFor>` correspondant, `aria-required`/`aria-invalid`/`aria-describedby` conservés à l'identique du site source. Bouton menu mobile (`Navbar`) : `aria-label` présent. Aucune image `<img>` dans les composants migrés (uniquement des icônes `lucide-react` décoratives et le `Logo` en SVG inline) — pas de risque d'alt text manquant. La règle globale `@media (prefers-reduced-motion: reduce)` (`src/index.css`) s'applique automatiquement au site public, non scopée à `AppShell`. Aucune régression identifiée par rapport aux corrections d'accessibilité déjà en place.

## 9. Performance

`PublicModule` est chargé via `React.lazy()` dans `app-router.tsx`, au même titre que les 8 autres domaines — la Landing ne charge donc pas Finance/Credit/Tontines/Governance/Audit, et réciproquement ces domaines ne chargent jamais le bundle Public. Vérifié par lecture du code de découpage (`const PublicModule = lazy(() => import('@/features/public')...)`), cohérent avec le pattern déjà utilisé pour tous les autres domaines.

## 10. Authentication

Sign In simule une connexion (`setTimeout` + `navigate('/dashboard')`), sans appel réseau. `currentUser` mocké (`mocks/rbac.mocks.ts`) non modifié. **AUTHENTICATION BACKEND = PENDING.**

## 11. Subscription

Sign Up simule une création de compte (`setTimeout`, pas d'écriture réelle). **ACCOUNT CREATION = BACKEND PENDING. TENANT CREATION = BACKEND PENDING.**

## 12. Payment

`subscribe-page.tsx` conserve intégralement la sélection de modules, le calcul de volume/prix en temps réel et le récapitulatif ; l'ancien appel vers un backend fantôme (`http://localhost:3000/payment/initiate`) a été retiré au profit d'une simulation locale sans requête réseau. Aucune passerelle de paiement (Mobile Money/carte/CinetPay/Stripe) inventée. **PAYMENT = BACKEND PENDING.**

## 13. Billing

Vérification directe : `subscribe-page.tsx` n'importe ni `financeService`, ni `organizationService`, ni `creditService` — sa logique de prix est un état local isolé (`useState` + arithmétique), sans lien avec `Transaction`/`Account`/`Contribution`/`Loan` du domaine Tenant Finance. Aucune confusion entre SaaS Billing (Plan/Subscription/Payment/Invoice, domaine Platform) et Tenant Finance (Accounts/Transactions/Contributions/Loans/Repayments/Distributions).

## 14. Landing source

`C:\xampp\htdocs\tanzen\tanzen-frontend\landing` conservé intégralement, non supprimé, non modifié. Recherche exhaustive dans `src/` : aucun import ne référence `landing/` — confirmé par `Grep` (`from '../../landing'`, `from '.../landing/'` : aucune occurrence). Le dossier reste hors du `include` de `tsconfig.app.json` (`["src"]`) et désormais exclu du lint principal (`eslint.config.js`, ajouté lors de la migration).

## 15. Tests

Playwright non disponible dans cet environnement (déjà constaté lors des missions précédentes). Les captures d'écran Chrome headless produites lors de la mission de migration (7 routes Public + Dashboard + Organization Members + Platform Tenants) restent la preuve visuelle de référence — aucun fichier qu'elles couvrent n'a changé depuis, donc non refaites pour cette validation. Vérifications de cette mission : exclusivement par lecture de code (`Grep` ciblé, relecture des services), pas de nouveau test en navigateur nécessaire puisqu'aucune correction n'a été appliquée.

## 16. Corrections éventuelles

**Aucune.** Les 15 points de contrôle n'ont révélé aucune anomalie bloquante. Le seul point non bloquant noté (§6, formatage CFA en `fr-FR` indépendant de la langue) est un comportement hérité fidèlement du site source, pas une régression — volontairement non corrigé conformément à la consigne de ne pas modifier le design sauf problème bloquant.

## 17. Backend Pending (récapitulatif)

`AUTHENTICATION BACKEND = PENDING` · `ACCOUNT CREATION = BACKEND PENDING` · `TENANT CREATION = BACKEND PENDING` · `PAYMENT = BACKEND PENDING` · `CHAT WIDGET = BACKEND/INFRASTRUCTURE PENDING` (déjà documenté dans `docs/MIGRATION_SITE_VITRINE_REPORT.md` §12, non ré-adressé ici).

## 18. Validation technique finale

`tsc --noEmit -p tsconfig.app.json` — ✅ 0 erreur. `eslint .` — ✅ 0 erreur, 14 warnings pré-existants sans rapport avec cette mission. `vite build` — ✅ succès (11,0 s), même avertissement pré-existant sur la taille de chunk (>500 kB), inchangé depuis la mission de migration.

---

*Fin du rapport. Aucun fichier de `src/` n'a été modifié par cette mission de validation.*
