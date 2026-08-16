# TANZEN — Rapport de migration du site vitrine (landing/ → Public/SaaS)

Migration du projet Next.js 15 + React 19 + Tailwind v4 situé dans `tanzen-frontend/landing/` (conservé tel quel, non supprimé) vers l'espace **Public/SaaS** de l'application React/Vite principale, conformément à `docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md`. Le projet reste intégralement React + Vite + TypeScript — aucune trace de Next.js n'a été introduite dans `src/`.

---

## 1. État initial de `landing/`

17 fichiers source : `app/layout.tsx` (racine, police Geist via `next/font`, widget de chat), `app/(main)/layout.tsx` (Navbar+Footer), 6 pages (`(main)/page.tsx`, `features`, `signin`, `signup`, `subscribe`, `downloads`, + `app/docs/page.tsx` hors groupe `(main)`), 6 composants (`Navbar`, `Footer`, `Logo`, `Hero`, `TrustLogos`, `Features`, `CTA`), `globals.css` (Tailwind v4, palette navy/vert). Dépendances : `next`, `react`/`react-dom` 19, `lucide-react` — seul `lucide-react` existe déjà côté principal (version différente, API compatible).

## 2. Pages migrées

Les 6 pages annoncées existent réellement et ont toutes été migrées : Landing, Features, Sign In, Sign Up, Subscribe, Downloads, Docs (7 au total en comptant Docs, structurellement à part — voir §7).

## 3. Composants migrés

`Logo`, `Navbar`, `Footer`, `Hero`, `TrustLogos`, `Features` (→ `FeaturesSection`), `CTA` — tous les 7, dans `src/features/public/components/`, adaptés (Next → React Router, voir §7) sans changement de design/texte/structure.

## 4. Assets migrés

Aucun asset (image/SVG/police) n'était réellement utilisé par le contenu — `landing/public/*.svg` sont les icônes par défaut du template Next.js (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`), jamais référencées dans les pages/composants. Le `Logo` est un SVG inline (déjà dans le composant, pas un asset séparé) — migré tel quel. Rien à copier dans `public/`.

## 5. Dépendances migrées

Aucune nouvelle dépendance installée. `lucide-react` déjà présent dans le projet principal couvre toutes les icônes utilisées par les 7 composants/6 pages. Police Geist non installée — réutilisation de `'DM Sans'` déjà en place (`src/index.css`), décision documentée dans le plan de mission, justifiée par l'absence de `next/font` en Vite et la proximité stylistique des deux polices.

## 6. Routes créées/modifiées

**Créées** (dans `PublicModule`, `src/features/public/public-module.tsx`) : `/`, `/features`, `/signin`, `/signup`, `/subscribe`, `/downloads`, `/docs`.

**Modifiées** (`src/routes/app-router.tsx`) :
- Retrait de `<Route path="/" element={<Navigate to="/dashboard" replace />} />` (la racine sert désormais la Landing).
- Retrait du `<Route path="*" element={<NotFoundPage />} />` interne au bloc `AppShell` — devenu redondant et **ambigu** : un splat racine (`path="/*"` pour Public) et un splat interne non préfixé (`path="*"` dans le bloc `AppShell`) auraient eu le même rang de score React Router, département uniquement par l'ordre de déclaration (fragile). Retiré au profit du 404 interne de `PublicModule`, qui couvre le même cas sans ambiguïté — toutes les routes métier (`/dashboard`, `/organization/*`, `/platform/*`, etc., préfixées par un segment statique) restent prioritaires par construction.
- Ajout de `<Route path="/*" element={<Suspense>...<PublicModule /></Suspense>} />`, lazy-loadé comme les 8 autres domaines.

Aucune route Tenant existante renommée (`/dashboard`, `/organization/*`, `/finance/*`, etc. inchangées — confirmé avec l'utilisateur, cohérent avec la décision déjà prise pour la séparation Platform).

## 7. Adaptations Next.js → React/Vite

- `next/link` (`<Link href>`) → `react-router-dom` (`<Link to>`).
- `next/navigation` (`usePathname`) → `useLocation().pathname` (Navbar).
- `"use client"` → supprimé partout (non pertinent hors App Router).
- `next/image` → import supprimé (`subscribe/page.tsx` l'importait sans jamais l'utiliser).
- `next/font` (Geist) → police existante du projet principal réutilisée (§5).
- Next `metadata` export → non repris (pas de mécanisme SPA équivalent mis en place, hors périmètre de cette mission).
- Structure de layout Next (`app/(main)/layout.tsx` groupe Navbar+Footer, `app/docs/page.tsx` en dehors) → reproduite fidèlement avec un `<Route element={<PublicShell />}>` imbriqué dans `PublicModule` couvrant les 6 pages du groupe `(main)`, et `/docs` monté en dehors (son propre en-tête/sidebar, pas de Navbar/Footer marketing) — c'est la fidélité structurelle la plus importante de cette migration, sans elle `/docs` aurait affiché un en-tête en double.
- Widget de chat (`window.TanzenChatConfig`, script `http://localhost:5175/src/embed.ts`) → **non migré**, voir §12.

## 8. Intégration i18n

Nouvelle section `public` ajoutée à `TranslationDictionary` (`src/i18n/index.ts`) et aux deux dictionnaires (`src/locales/fr/index.ts`, `src/locales/en/index.ts`) — ~115 clés couvrant l'intégralité des chaînes visibles des 7 pages/composants migrés (nav, footer, hero, features, modules, CTA, formulaires signin/signup, tarification/subscribe, downloads, docs). Aucun texte en dur. Traduction anglaise rédigée pour chaque clé (pas de simple copie du français). Réutilisation intégrale de `useLocale()`/`t()` existants — aucun second système i18n.

## 9. Intégration ThemeProvider

Aucune modification de `ThemeProvider` : le toggle `light/dark/system` (`src/contexts/theme-context.tsx`) applique déjà la classe `dark` globalement via son propre `useEffect`, indépendamment du layout actif — `PublicShell` en hérite automatiquement sans code supplémentaire. Le site public reste néanmoins visuellement fidèle à la maquette source (fond clair, palette navy/vert) grâce au namespacing des tokens (§10) — il ne « saute » pas en thème sombre lors d'un changement global, ce qui aurait détruit le design source ; ce compromis (identité visuelle propre, non couplée au thème Enterprise) est documenté comme un choix assumé.

## 10. Séparation Public / Platform / Tenant

Architecturalement complète : `PublicShell` (Navbar/Footer marketing, aucune dépendance à `TenantContext`/`PermissionContext`), `PlatformShell` (déjà existant, inchangé), `AppShell` (Tenant, inchangé). Collision de tokens Tailwind évitée par namespacing complet (`landing-background`, `landing-foreground`, `landing-primary`, `landing-accent`/`landing-accent-light`/`landing-accent-dark`, `landing-surface`/`landing-surface-muted` — ajoutés à `tailwind.config.js`, **aucun token shadcn existant modifié**). Nouveau point d'entrée « Platform Administration » ajouté dans `ShellHeader` (visible uniquement si `scope === 'platform'`), complétant la séparation déjà entamée dans une mission précédente.

## 11. Fonctionnalités UI READY

Landing, Features, Downloads, Docs (contenu statique/interactif local) ; Sign In/Sign Up (formulaires complets, validations, états de chargement) ; Subscribe (sliders de volume, sélection de modules, calcul de prix en temps réel, récapitulatif).

## 12. Fonctionnalités BACKEND PENDING

- **Authentification réelle** — Sign In simule une connexion (`setTimeout` + `navigate('/dashboard')`), Sign Up simule une création de compte. `currentUser` mocké conservé tel quel (`mocks/rbac.mocks.ts`), non modifié.
- **Paiement** — `subscribe/page.tsx` appelait un backend fantôme (`http://localhost:3000/payment/initiate`) ; remplacé par une simulation locale sans appel réseau. Aucune passerelle (Mobile Money/carte/CinetPay/Stripe...) n'a été inventée.
- **Widget de chat** — `CHAT WIDGET — BACKEND/INFRASTRUCTURE PENDING`. Le script `http://localhost:5175/src/embed.ts` référencé dans le layout source n'a pas été repris : aucune infrastructure de chat n'existe dans ce projet, et le conserver aurait pointé vers une URL locale inexistante en production.
- **Création de compte/tenant réelle, activation** — aucune des deux (Sign Up, Subscribe) n'écrit de données réelles ; le flux `Signup → Subscribe → Payment → Tenant Onboarding → Activation` décrit dans les décisions précédentes reste, dans son ensemble, `BACKEND PENDING`.

## 13. Fichiers créés

`src/features/public/` (14 fichiers : `public-module.tsx`, `index.ts`, 6 pages, `components/` × 7) · `src/layouts/public-shell.tsx` · `docs/MIGRATION_SITE_VITRINE_REPORT.md` (ce document).

## 14. Fichiers modifiés

`tailwind.config.js` (tokens `landing-*`) · `src/i18n/index.ts` (type `public`) · `src/locales/fr/index.ts` et `en/index.ts` (section `public`) · `src/routes/app-router.tsx` (routes Public, retrait redirect+catch-all ambigu) · `src/layouts/index.ts` (export `PublicShell`) · `eslint.config.js` (exclusion de `landing/` du lint du projet principal) · `src/layouts/shell-header.tsx` (lien « Platform Administration », revert du filtrage de recherche par scope — voir §16) · `src/layouts/shell-sidebar.tsx`, `src/config/navigation.ts`, `src/features/organization/organization-module.tsx` (finalisation d'une mission précédente restée interrompue, voir §16).

## 15. Fichiers supprimés

Aucun. `landing/` conservé intégralement, non modifié, non touché.

## 16. Note — finalisation d'un chantier interrompu

Cette mission a débuté avec `organization-module.tsx` dans un état intermédiaire (imports déjà retirés lors d'une interruption précédente, mais le code du registre des tenants encore présent et référençant ces imports) — ce qui bloquait le build de cette migration. Le chantier de séparation Platform/Tenant (déjà approuvé) a donc été terminé en préalable : retrait complet du registre des tenants d'`OrganizationModule` (déjà migré vers `PlatformModule` lors de la mission précédente), nettoyage du mécanisme de filtrage de navigation par scope devenu mort (`requiredScope`/`filterNavigationByScope`, plus aucun noeud de menu ne le nécessite), et ajout du point d'entrée « Platform Administration » dans l'en-tête (prévu mais non réalisé lors de la mission précédente).

## 17. Résultats TypeScript

`tsc --noEmit -p tsconfig.app.json` — ✅ 0 erreur.

## 18. Résultats ESLint

`eslint .` — ✅ 0 erreur, 14 warnings pré-existants (`react-refresh/only-export-components`, fichiers hors périmètre de cette mission). `landing/` exclu du lint du projet principal (§14) — ses propres erreurs (générées par les types Next.js auto-générés dans `.next/`) ne concernent pas ce projet.

## 19. Résultats Build

`vite build` — ✅ succès (11,6 s). Avertissement pré-existant sur la taille d'un chunk (>500 kB), sans rapport avec cette migration (déjà présent avant).

## 20. Tests réalisés

Vérification manuelle par capture d'écran (Chrome headless — Playwright non disponible dans cet environnement) : les 7 routes Public (`/`, `/features`, `/signin`, `/signup`, `/subscribe`, `/downloads`, `/docs`) rendent avec l'identité visuelle du site source (navy `#0B1E36`/vert `#00C48C`, distincte du bleu Enterprise) ; `/docs` confirmé sans Navbar/Footer marketing (en-tête propre) ; non-régression confirmée sur `/dashboard` (lien « Platform Administration » visible, sidebar Tenant inchangée), `/organization/members` (menu Organization réduit à Membres/Gouvernance, plus de « Tenants »), `/platform/tenants` (registre toujours pleinement fonctionnel).

## 21. Régressions éventuelles

Aucune détectée. Le seul changement de comportement observable pour un utilisateur déjà authentifié est que `/` sert désormais la Landing publique au lieu de rediriger vers `/dashboard` — comportement explicitement demandé, pas une régression.

## 22. État du dossier `landing/`

Conservé intégralement à `tanzen-frontend/landing/`, non modifié, non supprimé. Exclu du lint (§14) et déjà hors du `include` de `tsconfig.app.json` (`["src"]`, préexistant). À archiver ou supprimer seulement après validation explicite, comme demandé — non fait ici.

---

*Fin du rapport.*
