# TANZEN — Rapport final de migration Commercial / Tenant

Rapport requis par la mission « EXÉCUTION DE LA SÉPARATION COMMERCIAL /
TENANT » (2026-08-16), §22. Résultat de l'exécution de
`docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md`, validé au préalable par
`docs/COMMERCIAL_TENANT_MIGRATION_PLAN.md`.

**Résultat** : `tanzen-commercial` (Public/SaaS + Platform Administration)
et `tanzen-frontend` (Application Tenant) sont deux projets npm/git
indépendants, chacun compile/lint/teste/build proprement, chacun démarre
seul. `tanzen-mobile` n'a pas été touché.

---

## 1. Fichiers déplacés (MOVE — copiés dans tanzen-commercial puis retirés de tanzen-frontend)

- `src/features/public/**` entier (Landing, Features, Pricing, Checkout,
  Payment/Success/Cancel, Subscribe, Downloads, Docs, Signup,
  `public-module.tsx`, `components/{navbar,footer,cta,logo,hero,
  trust-logos,features-section}.tsx`)
- `src/features/platform/platform-module.tsx`
- `src/layouts/public-shell.tsx`, `src/layouts/platform-shell.tsx`
- `src/routes/platform-scope-route.tsx` (+ test)
- `src/services/platform-commercial.service.ts`
- `src/mocks/platform/**`
- `src/features/organization/tenant-form.tsx`
- Portion écriture de `organization.service.ts` (`createTenant`,
  `updateTenant`, type `TenantInput`)
- `docs/COMMERCIAL_PLATFORM_ARCHITECTURE.md`, `docs/CHECKOUT_UX_REDESIGN.md`,
  `docs/MIGRATION_SITE_VITRINE_REPORT.md`

## 2. Fichiers créés

**Dans `tanzen-frontend`** :
- `src/features/auth/login-page.tsx`, `src/features/auth/components/logo.tsx`
- `src/layouts/auth-shell.tsx`
- `src/routes/auth-guard.tsx`
- `.env.example`
- `docs/TENANT_APPLICATION_ARCHITECTURE.md`, `docs/COMMERCIAL_TENANT_SEPARATION.md`

**Dans `tanzen-commercial`** :
- `.env.example` (avec `VITE_TENANT_APP_URL`)
- `docs/COMMERCIAL_TENANT_SEPARATION.md` (copie identique)
- Le projet lui-même, intégralement (copie de `tanzen-frontend` via
  robocopy, Option A, hors `.git`/`node_modules`/`dist`/`.claude`)

## 3. Fichiers conservés (KEEP, inchangés)

Tous les domaines métier tenant dans `tanzen-frontend` : `features/
{dashboard,organization/organization-module.tsx,finance,tontines,
operations,access,audit,settings}`, tous les services `{dashboard,finance,
credit,tontines,document,workflow,notification,audit,settings,user,
session,role}.service.ts` (+ tests), `tenant-scope.ts` (+ test),
`routes/permission-route.tsx`, tous les mocks tenant-scoped, le design
system complet (`src/components/**`), la config outillage.

## 4. Fichiers archivés

Aucun. Rien identifié comme code mort à archiver séparément pendant cette
migration (l'archive préexistante `_archive/landing-nextjs-legacy/` a
simplement suivi la copie Option A dans les deux projets, inchangée).

## 5. Fichiers supprimés

**Dans `tanzen-frontend`** (après confirmation qu'ils existent dans
`tanzen-commercial`) : tout le contenu de la section 1 ci-dessus.

**Dans `tanzen-commercial`** (domaines Tenant retirés après la copie
Option A) : `features/{dashboard,finance,tontines,operations,access,
audit,settings}`, `features/organization/organization-module.tsx` (+
`features/organization/index.ts`), `layouts/{app-shell,shell-header,
shell-sidebar,tenant-switcher}.tsx` (+ test), `routes/permission-route.tsx`,
tous les services tenant-scoped (+ tests), `mocks/organization/{members,
governance}.ts`, `mocks/{finance,tontines,operations,access,audit,
settings}/**`, `mocks/dashboard.ts`, `config/navigation.ts`,
`stores/ui-store.ts`, `hooks/{use-click-outside.ts,index.ts}`,
`features/index.ts`. **Trouvaille pendant l'exécution** : `signin-page.tsx`
avait été copié dans `tanzen-commercial` par l'Option A puis oublié dans le
premier passage de nettoyage — repéré par une recherche exhaustive de
liens cassés (§9) et supprimé, avec sa route dans `public-module.tsx`.

## 6. Routes Commercial (tanzen-commercial)

```
/, /features, /pricing, /subscribe, /checkout, /payment,
/payment/success, /payment/cancel, /signup, /downloads, /docs,
/platform/dashboard, /platform/tenants(/*), /platform/plans,
/platform/subscriptions, /platform/payments, /platform/billing,
/platform/audit
```

## 7. Routes Tenant (tanzen-frontend)

```
/ (→ /login), /login,
/dashboard, /organization/*, /finance/*, /tontines/*, /operations/*,
/access-security/*, /audit/*, /settings/*, /unauthorized, /404
```

Vérifié en direct (Playwright) : `/platform/tenants`, `/pricing`,
`/checkout`, `/payment`, `/billing`, `/subscribe`, `/signup` renvoient tous
un 404 dans `tanzen-frontend`.

## 8. Services déplacés

`platform-commercial.service.ts` (move intégral) ; portion écriture de
`organization.service.ts` (`createTenant`/`updateTenant`).

## 9. Services conservés

Portion lecture de `organization.service.ts` (`listTenants`/`getTenant`,
dupliquée à l'identique dans les deux projets) ; Members/Governance de
`organization.service.ts` (reste exclusivement dans `tanzen-frontend`) ;
tous les services tenant-scoped listés en §3 ; `tenant-scope.ts`,
`api-client.ts` (dupliqué).

## 10. Types déplacés

`Plan`, `Subscription`, `Payment`, `Invoice`, `PlatformAuditEvent` (+
enums associées) — suivent `mocks/platform/*`. `TenantFormValues`,
`TenantFormErrors`, type `T` local — suivent `tenant-form.tsx`.
`TenantInput` — supprimé de `tanzen-frontend` (n'était utilisé que par
`createTenant`/`updateTenant`), conservé dans `tanzen-commercial`.

## 11. Mocks déplacés

`src/mocks/platform/{plans,subscriptions,payments,invoices,
platform-audit,index}.ts`.

## 12. Dépendances

Aucune dépendance `package.json` supprimée dans cette migration (décision
du plan d'exécution §27, confirmée non exécutée conformément à l'étape 13
du mandat : "Ne PAS supprimer les dépendances identifiées comme mortes...
hors périmètre"). Les deux projets partagent aujourd'hui un
`package.json` identique (copie Option A). Candidates identifiées pour un
nettoyage **futur, séparé** : `recharts`/`zustand` (utilisés uniquement par
le Dashboard/Shell tenant — inutiles dans `tanzen-commercial`) ;
`react-day-picker`, `embla-carousel-react`, `input-otp`, `vaul`, `cmdk`,
`zod`, `date-fns`, `@hookform/resolvers`, `@supabase/supabase-js`,
`react-hook-form` (déjà inutilisées dans le projet **avant** cette
migration, confirmé par recherche exhaustive d'imports).

## 13. i18n

`tanzen-frontend` : sections `public`/`platform` retirées du dictionnaire,
nouvelle section `auth` (8 clés, FR/EN) ajoutée pour `/login`. Toutes les
autres sections inchangées. `tanzen-commercial` : dictionnaire complet
conservé tel quel (Public/Platform actifs), plus une clé `system.goHome`
ajoutée (voir §19 — nécessaire suite à un lien cassé découvert et corrigé).
`npm run i18n:check` passe dans les deux projets (parité FR/EN interne à
chacun).

## 14. Dark mode

**Bug pré-existant découvert et corrigé** : le toggle de la classe `.dark`
existait en double — une fois dans `ThemeProvider` (global, complet, avec
écoute live de `prefers-color-scheme`) et une fois dans `AppShell`
(redondant, moins complet). Le doublon dans `AppShell` a été retiré ;
`ThemeProvider` reste l'unique source de vérité, ce qui est nécessaire
maintenant que `PlatformShell` (`tanzen-commercial`) n'a plus jamais
`AppShell` dans son arbre. Vérifié en direct (Playwright, `localStorage`
`tanzen-theme=dark` + reload) sur le Dashboard tenant **et** sur le
Dashboard Platform : `.dark` s'applique correctement dans les deux
applications.

## 15. Tests

`tanzen-frontend` : 123/123 tests (125 avant migration − 2 tests
`platform-scope-route.test.tsx`, déplacés vers `tanzen-commercial`).
`tanzen-commercial` : 11 tests sur 4 fichiers
(`platform-scope-route.test.tsx`, `permission-gate.test.tsx`,
`organization.service.test.ts` réduit aux 4 tests "Tenants — special case"
— les tests Members/Governance de ce fichier ont été retirés, la logique
qu'ils couvraient n'existe plus dans ce projet — et `i18n.test.ts`).
Aucun test supprimé sans que le code qu'il couvrait ait lui-même été
retiré du même projet.

## 16. Typecheck

`tanzen-frontend` : `npm run typecheck` → 0 erreur.
`tanzen-commercial` : `npm run typecheck` → 0 erreur.

## 17. Lint

`tanzen-frontend` : 0 erreur, 14 warnings pré-existants
(`react-refresh/only-export-components`, inchangés dans leur nature — 2 de
moins qu'avant migration car `tenant-form.tsx` qui en produisait 2 a
déménagé).
`tanzen-commercial` : 0 erreur, 12 warnings de même nature.

## 18. Build

`tanzen-frontend` : succès. Chunk principal 894,43 kB (262,67 kB gzip) —
en baisse par rapport à l'app unique d'avant migration (923 kB), Public et
Platform n'étant plus dans ce bundle.
`tanzen-commercial` : succès. Chunk principal 385,45 kB (122,30 kB gzip) —
nette diminution par rapport à l'app unique, confirmant que les 8 domaines
métier tenant sont bien absents du bundle (pas seulement non routés).

## 19. Problèmes rencontrés (trouvés et corrigés pendant l'exécution)

Cinq bugs de navigation cross-app, tous de la même famille — un
`<Link to="...">` react-router (navigation interne) pointant vers une
route qui n'existe plus dans le même projet depuis que Commercial et
Tenant sont deux origines distinctes — trouvés par une recherche
exhaustive de liens cassés (`grep` ciblé sur `/signin`, `/dashboard`)
après une première vérification Playwright qui n'avait couvert que le
parcours principal :

1. `PlatformShell` — "Retour à mon organisation" (`<Link to="/dashboard">`).
2. `DownloadsPage` — CTA "Portail Web" (`<Link to="/dashboard">`, portait
   déjà la trace d'un bug identique corrigé une fois dans le passé, avant
   que ce projet ne redevienne une seule app).
3. `Navbar` — "Se connecter" (`<Link to="/signin">`).
4. `PaymentSuccessPage` — CTA "Se connecter" (`navigate('/signin')`).
5. `SignUpPage` — "Déjà un compte ? Se connecter" (`<Link to="/signin">`).

Tous corrigés en `<a href={VITE_TENANT_APP_URL + ...}>` (navigation
externe réelle, plus une navigation SPA interne qui aurait produit un 404).

**Trouvé en même temps** : `signin-page.tsx` était resté dans
`tanzen-commercial` après la copie Option A (oubli du premier passage de
nettoyage, §5) — supprimé avec sa route.

**Trouvé en même temps** : `NotFoundPage`/`UnauthorizedPage` (composants
partagés, dupliqués dans les deux projets) avaient un bouton "Tableau de
bord" codé en dur vers `/dashboard` — route absente de `tanzen-commercial`.
Corrigé en repointant vers `/` avec un nouveau libellé `system.goHome`
("Accueil"/"Home") dans le dictionnaire `tanzen-commercial` uniquement (la
version `tanzen-frontend` de ces composants garde `goDashboard`/`/dashboard`,
toujours corrects dans ce projet).

**Correction architecturale** (§14 ci-dessus) : doublon de logique
dark-mode entre `ThemeProvider` et `AppShell`, retiré.

Aucun de ces problèmes n'a nécessité de modifier une règle métier, un
service, ou un comportement fonctionnel visible pour un utilisateur final
dans le flux normal — uniquement des chemins de navigation devenus
incorrects du fait de la séparation physique.

## 20. Problèmes restants BACKEND PENDING

Identiques à l'état documenté avant cette migration, non traités (hors
périmètre, mandat §36) :
- Authentification réelle (Tenant et Platform).
- Passerelle de paiement réelle.
- Activation réelle d'un tenant après paiement + création de son
  administrateur initial.
- Synchronisation des données entre `tanzen-commercial` et
  `tanzen-frontend` — chaque projet garde sa propre copie en mémoire des
  mocks partagés (`tenants.ts`, `rbac.mocks.ts`) ; un tenant créé côté
  Commercial n'apparaît pas automatiquement côté Tenant. Limite
  structurelle d'une architecture mock à deux processus séparés,
  documentée dans `docs/COMMERCIAL_TENANT_SEPARATION.md`.
- Portail de facturation self-service côté Public.

Non fait, hors périmètre de cette mission (confirmé explicitement par son
énoncé) : développement d'un vrai backend, d'un vrai paiement, d'une vraie
authentification ; modification de `tanzen-mobile` ; synchronisation
offline ; nouvelle refonte du Checkout ; nettoyage des dépendances npm
identifiées comme mortes (§12).
