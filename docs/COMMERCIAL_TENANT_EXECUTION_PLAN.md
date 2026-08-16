# TANZEN — Plan d'exécution technique final (Commercial / Platform / Tenant)

Document requis par la mission "VALIDATION FINALE AVANT MIGRATION"
(2026-08-16), qui valide les décisions de
`docs/COMMERCIAL_TENANT_MIGRATION_PLAN.md` et demande un plan d'exécution
technique précis, fichier par fichier. **Mission de planification
uniquement : aucun fichier `src/` n'a été modifié, déplacé ou supprimé
pour produire ce document.**

Convention utilisée pour chaque fichier significatif :
`PATH` · `CLASSIFICATION` (MOVE/KEEP/SHARED/ARCHIVE/REMOVE) · `DESTINATION` ·
`JUSTIFICATION` · `DÉPENDANCES` · `RISQUE`.

Pour les dossiers homogènes (ex. `features/finance/**`, tous KEEP, aucune
exception), une seule ligne groupée est donnée plutôt qu'une ligne par
fichier — le détail individuel est réservé aux fichiers dont la
classification demande un jugement (MOVE non trivial, SHARED, cas
particuliers).

---

## 1. Préconditions Git

- `tanzen-frontend` : branche `feature/commercial-platform`, aucun remote,
  1 commit (`36a6338`). 16 fichiers modifiés/non suivis (travaux i18n +
  refonte checkout de cette session) — **à committer avant migration**
  pour disposer d'un point de restauration propre (le mandat interdit
  `git reset --hard`/`git clean -fd`, donc un commit préalable est la
  seule façon fiable d'avoir un rollback simple).
- `tanzen-commercial` : dépôt déjà `git init`, branche `master`, aucun
  commit, aucun remote, dossier vide hors `.git`.
- Aucun historique à préserver au-delà de l'état actuel (un seul commit
  d'initialisation de chaque côté).

## 2. Checkpoint recommandé

Avant toute copie/déplacement :
1. Committer l'état courant de `tanzen-frontend` sur
   `feature/commercial-platform` (message décrivant l'état "avant
   migration Commercial/Tenant").
2. Noter le hash de ce commit comme point de rollback (§31).
3. Ne créer aucun commit dans `tanzen-commercial` avant que la copie +
   nettoyage (§3-§4) soit terminée et vérifiée (`typecheck`/`lint`/`build`
   verts) — premier commit commercial fait sur un état déjà propre, pas
   sur un état intermédiaire "encore plein de code Tenant".

## 3. Création de tanzen-commercial

`tanzen-commercial` existe déjà (dossier + `.git` vide). Étapes prévues :
1. Copier l'intégralité de `tanzen-frontend` (hors `.git`, `node_modules`,
   `dist`) dans `tanzen-commercial`.
2. Renommer la branche par défaut `master` → `main` (mandat §18/§35 du
   mandat précédent — prévu mais **pas exécuté dans cette mission**,
   confirmé explicitement hors périmètre par la présente mission).
3. Créer la branche `feature/commercial-platform` dans `tanzen-commercial`
   à partir de `main`, pour rester cohérent avec le nom de branche déjà
   utilisé côté `tanzen-frontend`.
4. Premier commit uniquement après nettoyage complet et vérifications
   vertes (§30).

## 4. Copie du projet source

Option A confirmée (validée par la mission précédente) : copie intégrale
de `tanzen-frontend` → `tanzen-commercial`, puis suppression progressive
de ce qui appartient exclusivement au Tenant. La copie inclut tout
(`src/`, config outillage, `docs/`, `package.json`, tests) — le tri se
fait ensuite fichier par fichier selon les sections 5 à 15 ci-dessous.

---

## 5. Dossiers Public à conserver (dans tanzen-commercial)

| PATH | CLASSIFICATION | DESTINATION | JUSTIFICATION | DÉPENDANCES | RISQUE |
|---|---|---|---|---|---|
| `src/features/public/` (tout : `landing-page.tsx`, `features-page.tsx`, `pricing-page.tsx`, `checkout-page.tsx`, `payment-page.tsx`, `payment-success-page.tsx`, `payment-cancel-page.tsx`, `subscribe-page.tsx`, `downloads-page.tsx`, `docs-page.tsx`, `signup-page.tsx`, `public-module.tsx`, `components/{navbar,footer,cta,logo,hero,trust-logos,features-section}.tsx`) | MOVE | tanzen-commercial (conservé tel quel après copie) | Domaine Public/SaaS entier, zéro usage tenant confirmé (mandat précédent + grep de cette session) | `@/layouts/public-shell`, `@/contexts/locale-context`, `@/services/platform-commercial.service`, `@/services/organization.service` (write), `@/features/organization/tenant-form`, `@/lib/utils`, `@/components` (design-system) | Faible — aucun couplage tenant trouvé |
| `src/layouts/public-shell.tsx` | MOVE | tanzen-commercial | Layout exclusif au Public | `Navbar`, `Footer` | Faible |
| **Exception : `signin-page.tsx`** | **retiré du groupe, voir §24** | tanzen-frontend | Login appartient au Tenant App (mandat) | — | Moyen — seul fichier public non copié tel quel |

## 6. Dossiers Platform à conserver (dans tanzen-commercial)

| PATH | CLASSIFICATION | DESTINATION | JUSTIFICATION | DÉPENDANCES | RISQUE |
|---|---|---|---|---|---|
| `src/features/platform/platform-module.tsx` | MOVE | tanzen-commercial | Dashboard/Tenants/Plans/Subscriptions/Payments/Billing/Audit — 100% Platform | `@/services/platform-commercial.service`, `@/services/organization.service` (listTenants/getTenant/createTenant/updateTenant), `@/features/organization/tenant-form`, `@/components` (design-system), `@/contexts/{locale,tenant,permission}-context` | Faible |
| `src/layouts/platform-shell.tsx` | MOVE | tanzen-commercial | Layout exclusif à Platform | `@/contexts/locale-context` | **Moyen — voir note dark mode ci-dessous** |
| `src/routes/platform-scope-route.tsx` + `.test.tsx` | MOVE | tanzen-commercial | `PlatformScopeGuard`, ne garde que `/platform/*` | `@/contexts/permission-context` | Faible |
| `src/services/platform-commercial.service.ts` | MOVE | tanzen-commercial | Zéro usage tenant (grep confirmé) | `@/mocks/platform/**`, `@/mocks/organization/tenants`, `@/mocks/rbac.mocks` | Faible |
| `src/mocks/platform/{plans,subscriptions,payments,invoices,platform-audit,index}.ts` | MOVE | tanzen-commercial | Domaine mock 100% commercial | — | Faible |

**Note dark mode (nouveau constat de cette inspection)** : le toggle de
la classe CSS `.dark` sur `<html>` n'existe aujourd'hui QUE dans
`AppShell` (`src/layouts/app-shell.tsx`, `useEffect` ligne 16-19) — jamais
dans `PlatformShell`. Cela fonctionne actuellement par accident tant que
les deux layouts vivent dans la même app React (le `ThemeProvider` est
monté une fois pour toute l'app, et si `AppShell` a été monté au moins une
fois dans la session, la classe reste posée). **Une fois `PlatformShell`
seul dans `tanzen-commercial` (sans jamais monter `AppShell`), le dark
mode de Platform Administration ne s'appliquera plus jamais**, même si
`ThemeProvider`/les tokens CSS `hsl(var(--x))` restent corrects. Correctif
nécessaire à prévoir à l'exécution (déplacer ce `useEffect` de
`AppShell` vers `ThemeProvider` lui-même, où il s'appliquerait aux deux
apps) — recommandé mais volontairement **pas exécuté dans cette mission
de planification**.

## 7. Dossiers Tenant à conserver dans tanzen-frontend

| PATH | CLASSIFICATION | DESTINATION | JUSTIFICATION | RISQUE |
|---|---|---|---|---|
| `src/features/dashboard/` | KEEP | tanzen-frontend | Domaine tenant | Faible |
| `src/features/organization/organization-module.tsx` | KEEP | tanzen-frontend | Members + Governance uniquement (registre tenant déjà retiré, cf. commentaire ligne 317-321 du fichier) | Faible |
| `src/features/finance/`, `src/features/tontines/`, `src/features/operations/`, `src/features/access/`, `src/features/audit/`, `src/features/settings/` (tout, y compris sous-composants) | KEEP | tanzen-frontend | Domaines métier tenant, zéro import Public/Platform trouvé (grep confirmé) | Faible |
| `src/layouts/app-shell.tsx`, `shell-header.tsx`, `shell-sidebar.tsx`, `tenant-switcher.tsx` (+ test) | KEEP | tanzen-frontend | Shell exclusif Tenant | Faible |
| `src/config/navigation.ts` | KEEP | tanzen-frontend | Arbre de navigation `ShellSidebar`, exclusivement tenant (Dashboard/Organization/.../Settings) | Faible |
| `src/stores/ui-store.ts` (zustand) | KEEP | tanzen-frontend | Utilisé uniquement par `AppShell`/`ShellHeader`/`ShellSidebar` (grep confirmé) | Faible |

---

## 8. Liste exacte des fichiers à déplacer (MOVE, non déjà couverts §5-6)

| PATH | DESTINATION | JUSTIFICATION | DÉPENDANCES | RISQUE |
|---|---|---|---|---|
| `src/features/organization/tenant-form.tsx` | tanzen-commercial | Ses 3 seuls appelants (`TenantCreate`/`TenantEdit` dans `platform-module.tsx`, `CheckoutPage`) déménagent tous ; zéro appelant restant côté tenant (`organization-module.tsx` n'importe PAS ce fichier, seulement `organizationService.listTenants` pour un `<select>`, voir §21) | `@/components` (FormSection, FieldError), `@/components/ui/*` | Faible — dépendance confirmée nulle côté tenant |
| `docs/COMMERCIAL_PLATFORM_ARCHITECTURE.md` | tanzen-commercial | Documente le code Platform/Public déplacé | — | Faible |
| `docs/CHECKOUT_UX_REDESIGN.md` | tanzen-commercial | Documente `checkout-page.tsx`, déplacé | — | Faible |
| `docs/MIGRATION_SITE_VITRINE_REPORT.md` | tanzen-commercial | Documente la migration historique Next.js → Public React, code qui déménage | — | Faible |

## 9. Liste exacte des fichiers à supprimer de tanzen-frontend (après copie, Option A)

Après la copie intégrale dans `tanzen-commercial`, ces fichiers/dossiers
sont supprimés de **tanzen-frontend** (ils continuent d'exister dans
tanzen-commercial) :

- `src/features/public/**` (tout, sauf que `signin-page.tsx` en est
  extrait avant suppression — voir §24, il devient `src/features/auth/login-page.tsx`
  ou équivalent dans tanzen-frontend)
- `src/features/platform/`
- `src/layouts/public-shell.tsx`, `src/layouts/platform-shell.tsx`
- `src/routes/platform-scope-route.tsx` (+ test)
- `src/services/platform-commercial.service.ts`
- `src/mocks/platform/`
- `src/features/organization/tenant-form.tsx`
- Dans `src/services/organization.service.ts` : les fonctions
  `createTenant`, `updateTenant` (retirées, pas tout le fichier — voir §21)
- `docs/COMMERCIAL_PLATFORM_ARCHITECTURE.md`, `docs/CHECKOUT_UX_REDESIGN.md`,
  `docs/MIGRATION_SITE_VITRINE_REPORT.md`

Rien d'autre n'est supprimé — en particulier aucun fichier du design
system, des contextes, des hooks, des services tenant, ou des mocks
tenant.

## 10. Liste exacte des fichiers à conserver dans tanzen-frontend

Couverte intégralement par §7 (domaines Tenant) + tous les fichiers listés
SHARED en §12 (chaque app garde sa propre copie) + les fichiers
d'infrastructure générique non spécifiques à un domaine :
`src/lib/{utils,notify}.ts`, `src/hooks/**`, `src/stores/ui-store.ts`,
`src/types/ui.ts`, `src/test/setup.ts`, `src/App.tsx`/`main.tsx` (racine,
adaptés pour ne monter que le routeur Tenant), config outillage complète.

---

## 11. Services à déplacer

| Service | Destination | Détail |
|---|---|---|
| `platform-commercial.service.ts` | tanzen-commercial | Move intégral |
| `organization.service.ts` (portion) | tanzen-commercial | `createTenant`, `updateTenant` uniquement — voir §21 |

## 12. Services à conserver (KEEP dans tanzen-frontend, SHARED dans les deux)

| Service | Classification | Justification |
|---|---|---|
| `organization.service.ts` (portion) | **SHARED** (fonctions différentes de chaque côté) | `listMembers/getMember/createMember/updateMember/listAssemblies/listMeetings/listVotes/listBoardMembers/createAssembly/createMeeting/updateMeetingMinutes/createBoardMember/endBoardMandate/createVote/updateVoteResult` → KEEP tenant uniquement. `listTenants/getTenant` (lecture seule) → dupliquées dans les deux, voir §21 |
| `tenant-scope.ts` | KEEP (tenant uniquement) | Utilisé seulement par les fonctions Members/Governance ci-dessus ; Platform filtre par `.filter()` simple, ne l'utilise pas |
| `dashboard.service.ts`, `finance.service.ts`, `credit.service.ts`, `tontines.service.ts`, `document.service.ts`, `workflow.service.ts`, `notification.service.ts`, `audit.service.ts`, `settings.service.ts`, `user.service.ts`, `session.service.ts`, `role.service.ts` (+ leurs tests) | KEEP (tenant uniquement) | Aucune référence Platform/Public trouvée (grep exhaustif effectué) |
| `api-client.ts` (`mockRequest`, `MOCK_API_DELAY`) | **SHARED** | Générique, utilisé par tous les services des deux apps ; duplication triviale (13 lignes) |
| `query-keys.ts` | **SHARED, scindé** | `platformCommercial.*` → commercial uniquement. `dashboard/members/governance/finance/credit/tontines/operations/access/audit/settings` → tenant uniquement. `tenants.list`/`tenants.detail` → dupliqués dans les deux (Platform + sélecteur vestige Members, §21) |

---

## 13. Types à déplacer

| Type | Fichier source | Destination |
|---|---|---|
| `Plan`, `Subscription`, `Payment`, `Invoice`, `PlatformAuditEvent`, `PlanCode`, `PlanStatus`, `SubscriptionStatus`, `PaymentMethod`, `PaymentStatus`, `InvoiceStatus` | `src/mocks/platform/*.ts` | tanzen-commercial (move, suit les mocks) |
| `T` (type helper `(section, key, values?) => string`), `TenantFormValues`, `TenantFormErrors` | `tenant-form.tsx` | tanzen-commercial (move, suit le fichier) |

Aucun autre type "métier" n'a de raison de se déplacer — les types
Member/Loan/Repayment/Tontine/Cycle/Transaction/Document/Workflow (cités
en exemple par le mandat) sont déjà exclusivement tenant, colocalisés avec
leurs mocks, et restent en place (voir §14/§15).

## 14. Mocks à déplacer

| Mock | Destination |
|---|---|
| `src/mocks/platform/{plans,subscriptions,payments,invoices,platform-audit,index}.ts` | tanzen-commercial (move) |

## 15. Mocks à conserver

| Mock | Classification |
|---|---|
| `src/mocks/organization/{members,governance}.ts` | KEEP tenant |
| `src/mocks/{finance,tontines,operations,access,audit,settings}/**`, `src/mocks/dashboard.ts` | KEEP tenant |
| `src/mocks/organization/tenants.ts` (+ type `Tenant`) | **SHARED, dupliqué** — voir §22 |
| `src/mocks/rbac.mocks.ts` (+ types `PlatformScope`/`SystemRole`/`CurrentUser`/`Permission`) | **SHARED, dupliqué** — chaque app garde le même `currentUser` mocké (id `U-001`, tenant `T-001`, rôle `role-admin`) pour une démo cohérente ; aucune session réelle partagée n'existe |
| `src/mocks/index.ts` (`mockMode = true`) | SHARED, dupliqué (1 ligne, trivial) |

---

## 16. Routes Commercial

```
/                              Landing
/features                      Features
/pricing                       Pricing
/subscribe                     Subscription (calculateur historique)
/checkout                      Checkout
/payment                       Payment
/payment/success                Payment confirmation
/payment/cancel                  Payment cancel
/signup                        Signup / Onboarding commercial
/downloads                     Downloads
/docs                          Docs
/platform/dashboard             Platform Dashboard
/platform/tenants               Tenant Registry
/platform/tenants/create        Tenant creation (Platform Administration)
/platform/tenants/:id           Tenant Administration — détail
/platform/tenants/:id/edit      Tenant Administration — édition
/platform/tenants/:id/settings  Tenant Administration — paramètres
/platform/plans                 Plans
/platform/subscriptions         Subscriptions
/platform/payments              Payments
/platform/billing               Platform Billing
/platform/audit                 Platform Audit
```

## 17. Routes Tenant

```
/login                Login (nouveau point d'entrée, voir §24)
/dashboard            Dashboard
/organization/*       Members, Governance
/finance/*            Comptes, transactions, contributions, distributions, crédit
/tontines/*           Tontines, cycles, tirages, gagnants
/operations/*         Workflows, notifications, documents
/access-security/*    Utilisateurs, rôles, permissions, sessions, MFA
/audit/*              Vue d'ensemble, journaux, événements sécurité
/settings/*           Organisation, localisation, exercices, branding, ...
/unauthorized
/404
```

Routes **absentes** de tanzen-frontend après migration (vérification
explicite prévue en §30) : `/`, `/pricing`, `/subscribe`, `/checkout`,
`/payment*`, `/signup`, `/downloads`, `/docs`, `/features`, `/platform/*`.

---

## 18. Layouts Commercial

- `PublicShell` (Navbar + Footer + Outlet)
- `PlatformShell` (header minimal + nav Platform + switcher langue) —
  correctif dark-mode à prévoir, voir §6

## 19. Layouts Tenant

- `AppShell` (ShellSidebar + ShellHeader + Outlet) — inchangé
- **`AuthShell`** (nouveau, minimal) — voir §24

---

## 20. Traitement de TenantForm

`src/features/organization/tenant-form.tsx` → **MOVE intégral** vers
tanzen-commercial.

- Consommateurs actuels : `TenantCreate`/`TenantEdit`
  (`platform-module.tsx`) et `CheckoutPage` (`checkout-page.tsx`) — les 3
  déménagent vers tanzen-commercial.
- Aucun consommateur restant côté tenant confirmé par grep (`organization-module.tsx`
  n'importe jamais `tenant-form.tsx`, uniquement
  `organizationService.listTenants` pour peupler un `<select>`, cas traité
  en §21).
- Le fichier inclut sa prop `tone` (ajoutée lors de la refonte UX du
  Checkout de cette session) — reste pertinente uniquement côté commercial
  (le tone `'admin'` sert Platform, le tone `'checkout'` sert Checkout,
  les deux restant dans le même projet après migration).
- Aucune modification de logique prévue, uniquement un changement de
  chemin d'import.

## 21. Traitement de organization.service.ts

Analyse fonction par fonction :

| Fonction | Domaine | Traitement |
|---|---|---|
| `listTenants(tenantId, scope)` | Registre tenant (lecture) | **SHARED, dupliqué** — voir justification ci-dessous |
| `getTenant(tenantId, resourceId, scope)` | Registre tenant (lecture) | **SHARED, dupliqué** — idem |
| `createTenant(input)` | Registre tenant (écriture) | **MOVE → Platform/Commercial** — jamais appelé côté tenant |
| `updateTenant(tenantId, resourceId, scope, patch)` | Registre tenant (écriture) | **MOVE → Platform/Commercial** — jamais appelé côté tenant |
| `listMembers/getMember/createMember/updateMember` | Organisation du tenant courant | **KEEP tenant** |
| `listAssemblies/listMeetings/listVotes/listBoardMembers` | Gouvernance du tenant courant | **KEEP tenant** |
| `createAssembly/createMeeting/updateMeetingMinutes/createBoardMember/endBoardMandate/createVote/updateVoteResult` | Gouvernance du tenant courant | **KEEP tenant** |

**Pourquoi `listTenants`/`getTenant` sont dupliquées plutôt que déplacées
intégralement** : `organization-module.tsx` (`MemberCreate`,
`MemberEditForm`) les appelle encore pour peupler le `<select>` "Tenant"
du formulaire Membre. En scope `'tenant'` (le seul cas réel côté Tenant
App après séparation, puisque `PlatformScopeGuard` n'y existe plus), cette
liste ne contient jamais qu'un seul élément — le tenant courant. Le
`<select>` est donc déjà, aujourd'hui, un menu à une seule option ;
simplifier ce formulaire pour lire directement `TenantContext` au lieu
d'appeler ce service serait légitime mais dépasse le strict nécessaire de
la séparation (mandat "ne pas réécrire Organization sauf modification
strictement nécessaire"). **Décision : dupliquer la fonction telle
quelle dans les deux projets**, signalée comme point d'attention plutôt
que corrigée.

Concrètement, `organization.service.ts` est donc **scindé en deux
fichiers distincts, pas partagé tel quel** :
- tanzen-frontend garde `organization.service.ts` avec Members/Governance
  + `listTenants`/`getTenant` (lecture seule).
- tanzen-commercial reçoit un service équivalent (peut rester nommé
  `organization.service.ts` ou être renommé `tenant-registry.service.ts`
  pour plus de clarté — à trancher à l'exécution) avec `listTenants`/
  `getTenant`/`createTenant`/`updateTenant` uniquement (Members/Governance
  retirés, jamais appelés côté Platform).

## 22. Traitement de Tenant Registry

Le registre complet des tenants (`src/mocks/organization/tenants.ts`, le
tableau `Tenant[]`) est **dupliqué** dans les deux projets :

- tanzen-commercial en a besoin en lecture/écriture complète (Platform
  Tenants, Checkout provisioning).
- tanzen-frontend en a besoin en lecture seule pour deux usages : (a)
  `TenantContext` résout `ownTenant` depuis ce tableau (`tenants.find(t
  => t.id === currentUser.tenantId)`) ; (b) le `<select>` vestige de
  Members (§21).

**Limite structurelle documentée, pas résolue par cette migration** :
sans backend réel, les deux copies de ce tableau vivent dans deux
processus Node séparés et ne se synchronisent jamais à l'exécution. Un
tenant créé via Checkout (commercial) n'apparaît pas automatiquement dans
tanzen-frontend. Documentée `BACKEND PENDING` — disparaît avec un vrai
backend partagé. Les deux copies sont initialisées avec le même jeu de
données de départ (mêmes 5 tenants `T-001`...`T-005`) pour que les démos
restent cohérentes tant qu'aucune création n'a eu lieu dans l'une ou
l'autre app.

## 23. Traitement de Tenant Administration

"Tenant Administration" (le mandat désigne ainsi `/platform/tenants/:id`,
`/edit`, `/settings` — les pages Platform de gestion d'un tenant, PAS le
contexte `TenantContext` du Tenant App, terminologie à ne pas confondre)
appartient exclusivement à tanzen-commercial, déjà couvert par §6/§16.
Aucune de ces routes/pages n'existe côté tanzen-frontend après migration
(vérification explicite en §30).

## 24. Traitement du Login / AuthShell

**État actuel** : `signin-page.tsx` vit dans `PublicModule`/`PublicShell`
(habillage marketing, liens vers `/pricing`/`/signup`), simule une
connexion (`setTimeout` puis `navigate('/dashboard')`), zéro
authentification réelle.

**Traitement prévu** (move adapté, pas une réécriture) :
- Déplacer `signin-page.tsx` vers `tanzen-frontend` (nouveau chemin
  proposé : `src/features/auth/login-page.tsx`), monté sur la route
  `/login`.
- Créer un nouveau layout **`AuthShell`** minimal dans tanzen-frontend
  (logo + carte centrée, sans `ShellSidebar`/`ShellHeader`/
  `TenantSwitcher`) — remplace le `PublicShell` que ce composant utilisait
  implicitement.
- Le contenu fonctionnel du composant (formulaire email/mot de passe,
  simulation, redirection `/dashboard`) **reste identique** — seul son
  habillage change. Les liens internes vers `/pricing`/`/signup` (qui
  n'existeront plus dans ce projet) sont retirés ou remplacés par un texte
  neutre, à trancher à l'exécution.
- **`AuthGuard`** : le mandat en demande un, mais aucune authentification
  réelle n'existe (`currentUser` est une constante toujours "connectée").
  Un vrai `AuthGuard` (qui redirigerait vers `/login` si aucune session
  valide) nécessiterait un état de session — actuellement inexistant.
  Traitement recommandé : créer un `AuthGuard` **passthrough documenté**
  (rend toujours ses enfants, avec un commentaire explicite `BACKEND
  PENDING — aucune vérification de session réelle tant qu'aucune
  authentification n'existe`), plutôt que d'inventer une fausse logique de
  session. C'est la même approche que `PlatformScopeGuard`/
  `PermissionRoute` existants, qui eux vérifient un `scope`/`permission`
  réels (dérivés du mock RBAC) — un `AuthGuard` n'a rien d'équivalent à
  vérifier aujourd'hui, d'où le passthrough explicite plutôt qu'une
  vérification inventée.

## 25. Traitement du Signup

`signup-page.tsx` → **MOVE intégral** vers tanzen-commercial, aucun
changement. Reste dans `PublicModule`/`PublicShell`, simule une inscription
(`setTimeout` puis `navigate('/pricing')`), zéro création réelle de
compte/tenant — comportement identique à aujourd'hui.

---

## 26. Traitement de l'i18n

`src/i18n/index.ts` (infrastructure : `supportedLocales`, `defaultLocale`,
`getTranslation`, types) → **SHARED, dupliqué tel quel** dans les deux
projets (13 lignes, générique).

`src/contexts/locale-context.tsx` (`LocaleProvider`, `useLocale`,
persistance `localStorage` clé `tanzen-locale`, sync `document.documentElement.lang`)
→ **SHARED, dupliqué tel quel**.

`src/locales/{fr,en}/index.ts` → **scindés**, pas dupliqués tels quels :

| Section du dictionnaire | Destination |
|---|---|
| `public`, `platform` | tanzen-commercial uniquement |
| `nav`, `dashboard`, `notifications`, `organization`, `finance`, `tontines`, `operations`, `access`, `audit`, `settings`, `system` | tanzen-frontend uniquement |
| `shell` | **Dupliquée dans les deux**, avec un sous-ensemble de clés différent : tanzen-commercial n'a besoin que de `language`/`theme`/`light`/`dark`/`system`/`platformAdministration`/`backToTenantApp`/`navigation` (utilisées par `PlatformShell`) ; tanzen-frontend garde `shell` en entier (utilisé par `ShellHeader`/`AppShell`, beaucoup plus riche : recherche, notifications, menu utilisateur, etc.) |

Chaque app garde donc **un seul système i18n** (conforme au mandat §14 —
"ne pas créer deux systèmes concurrents à l'intérieur d'une même
application" ; deux apps séparées avec chacune un seul système n'enfreint
pas cette règle). Le script `npm run i18n:check` (ajouté lors de l'audit
i18n de cette session) doit être dupliqué dans les deux projets, chacun
vérifiant la parité FR/EN de son propre dictionnaire réduit.

## 27. Traitement des dépendances npm

Usage réel vérifié par grep sur l'ensemble de `src/` (résultat exact, pas
une estimation) :

| Dépendance | Usage constaté | Recommandation |
|---|---|---|
| `recharts` | `components/ui/chart.tsx` (wrapper générique) + `audit-module.tsx`, `dashboard-overview.tsx`, `finance-module.tsx` — **tenant uniquement** | Garder côté tenant ; candidate à retirer côté commercial une fois vérifié qu'aucune page Platform ne l'utilise (Platform Dashboard actuel n'a pas de graphique) — **pas retiré dans cette mission**, juste signalé |
| `zustand` | `stores/ui-store.ts`, utilisé uniquement par `AppShell`/`ShellHeader`/`ShellSidebar` — **tenant uniquement** | Idem, candidate côté commercial |
| `react-day-picker`, `embla-carousel-react`, `input-otp`, `vaul`, `cmdk` | Uniquement référencés dans leurs propres wrappers `components/ui/{calendar,carousel,input-otp,drawer,command}.tsx` — **ces wrappers eux-mêmes ne sont importés nulle part dans l'app actuelle** | Code déjà mort dans le projet actuel, avant toute migration — hors périmètre de cette mission (le mandat interdit de supprimer sans nécessité liée à la séparation) ; copié tel quel des deux côtés par cohérence avec l'Option A, nettoyage à traiter séparément si souhaité |
| `zod`, `date-fns`, `@hookform/resolvers`, `@supabase/supabase-js` | Aucun import trouvé nulle part dans `src/` | Idem — déjà inutilisées avant la migration, hors périmètre |
| `react-hook-form` | Uniquement dans `components/ui/form.tsx`, lui-même jamais importé ailleurs | Idem |
| Tout le reste (`@radix-ui/*`, `@tanstack/react-query`, `lucide-react`, `react-router-dom`, `sonner`, `tailwind-merge`, `class-variance-authority`, `clsx`, `tailwindcss-animate`) | Utilisé activement des deux côtés | Garder identique dans les deux `package.json` |

**Recommandation générale** : copier `package.json` intégralement dans
`tanzen-commercial` (cohérent avec l'Option A), ne retirer aucune
dépendance dans cette mission — la mission de planification ne modifie
aucun fichier, et une suppression de dépendance mérite sa propre
vérification (`npm run build` après coup) qui n'a de sens qu'une fois les
fichiers réellement séparés.

## 28. Traitement des variables d'environnement

État actuel : aucun `.env.example` n'existe dans tanzen-frontend
aujourd'hui, seulement `.env.test` (`VITE_MOCK_API_DELAY=0`, utilisé pour
accélérer les tests). Aucune variable sensible ou spécifique à un
environnement n'est présente.

Prévu à l'exécution (mandat §28 du mandat précédent) :
- Créer `tanzen-frontend/.env.example` avec `VITE_MOCK_API_DELAY` (et tout
  futur besoin propre au Tenant App, ex. URL backend tenant quand il
  existera — `BACKEND PENDING`).
- Créer `tanzen-commercial/.env.example` avec le même
  `VITE_MOCK_API_DELAY` (le mock delay est un comportement générique
  partagé par les deux, pas une variable "privée") + tout futur besoin
  propre au Commercial (URL de paiement, clé publique d'un provider —
  `BACKEND PENDING`, non inventé ici).
- Aucune variable n'est aujourd'hui "privée" à un seul projet — rien à
  garder secret entre les deux à ce stade (pas de clé API réelle en jeu).

## 29. Traitement des tests

125 tests existent aujourd'hui (123 pré-existants + 2 tests i18n de cette
session), répartis par colocalisation avec leur fichier source :

| Fichier de test | Suit |
|---|---|
| `services/{tenant-scope,organization,finance,credit,tontines,document,workflow,notification,audit,settings,user,session,role,dashboard}.service.test.ts` | Leur service — tenant, restent dans tanzen-frontend |
| `routes/platform-scope-route.test.tsx` | `PlatformScopeGuard` — déménage vers tanzen-commercial |
| `layouts/tenant-switcher.test.tsx` | `TenantSwitcher` — reste tenant |
| `components/permission-gate.test.tsx` | `PermissionGate` (design-system partagé) — **dupliqué**, un exemplaire de chaque côté |
| `i18n/i18n.test.ts` | Structure du dictionnaire — **dupliqué et adapté** : chaque projet teste la parité FR/EN de son propre dictionnaire réduit (§26) |

`organization.service.test.ts` — à vérifier précisément à l'exécution
quelles portions testent Members/Governance (KEEP tenant) vs
listTenants/getTenant/createTenant/updateTenant (à répartir selon §21 :
lecture dupliquée des deux côtés, écriture testée côté commercial
uniquement).

Aucun test n'est supprimé — chaque test suit son code source déplacé,
dupliqué, ou conservé selon les mêmes règles que le fichier qu'il teste.

---

## 30. Stratégie de validation

Dans chaque projet, séparément, une fois la séparation physique terminée :

```
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev      (vérification manuelle)
```

Vérifications fonctionnelles explicites (reprennent les mandats §29/§30/§31
de la mission précédente) :

**tanzen-frontend** :
- [ ] Aucun `TenantSwitcher` interactif, aucun sélecteur de tenant
- [ ] Aucune route `/platform/*`, `/pricing`, `/checkout`, `/payment`,
      `/billing`, `/subscribe`, `/signup`, `/`, `/features`, `/downloads`,
      `/docs` accessible (404 attendu)
- [ ] `/login` fonctionne (formulaire, simulation, redirection `/dashboard`)
- [ ] T-001 ne voit jamais T-002 et inversement (régression isolation)
- [ ] `npm run i18n:check` passe sur le dictionnaire réduit

**tanzen-commercial** :
- [ ] Landing/Pricing/Subscription/Checkout/Payment/Billing accessibles
- [ ] Platform Dashboard/Tenants/Plans/Subscriptions/Payments/Billing/Audit
      accessibles à un utilisateur `scope: 'platform'`, 403/`/unauthorized`
      pour un `scope: 'tenant'`
- [ ] FR/EN fonctionnent sur tout le périmètre Public + Platform
- [ ] `npm run i18n:check` passe sur le dictionnaire réduit
- [ ] Dark mode Platform Administration fonctionne (correctif §6 appliqué)

**Les deux projets** :
- [ ] Démarrent indépendamment (`npm run dev`) sur deux ports différents
      simultanément, sans conflit

## 31. Stratégie de rollback

- Un commit de checkpoint est créé dans `tanzen-frontend` avant toute
  copie/suppression (§2) — son hash sert de point de retour.
- Tant qu'aucun commit n'existe dans `tanzen-commercial`, tout rollback y
  équivaut à vider le dossier (hors `.git`) sans perte, puisque rien n'y
  est encore validé.
- Une fois `tanzen-commercial` committé (après vérifications vertes,
  §30), un rollback ultérieur se fait par `git revert` du commit concerné
  — jamais par réécriture d'historique destructive (`reset --hard`,
  interdit par le mandat).
- Dans `tanzen-frontend`, la suppression des fichiers Public/Platform
  (§9) n'intervient qu'**après** que la copie fonctionnelle existe et est
  vérifiée dans `tanzen-commercial` — à aucun moment `tanzen-frontend`
  ne se retrouve dans un état "ni l'ancien ni le nouveau" sans copie de
  secours disponible (le commit de checkpoint §2 couvre ce cas).
- Aucune suppression physique n'est irréversible tant que le commit de
  checkpoint existe : `git checkout <hash> -- <chemin>` restaure un
  fichier individuel sans toucher au reste de l'arbre.

---

## Résumé — rien n'a été exécuté

Cette mission est restée strictement une mission de planification :
aucun fichier `src/` n'a été modifié, déplacé ou supprimé ;
`tanzen-commercial` reste un dossier vide avec seulement son `.git` ;
`tanzen-frontend` n'a reçu que ce document. L'exécution (§2 à §31
ci-dessus) attend une validation explicite avant de commencer.
